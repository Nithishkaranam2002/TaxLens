import { Clock3, FileText, PenLine, RotateCcw, Search, ShieldCheck, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { assign, logTime, signOff, verify, withdrawSignOff } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA, type AreaId, formName } from '../../engine/areas';
import { type AnyEvent, type Level, VERIFICATION_LABEL, type VerificationType, newId } from '../../engine/events';
import { type Actor, ROLE_LABEL } from '../../engine/people';
import { hours, plural, value } from '../format';
import { Avatar, Badge, Button, Card, Checkbox, Empty, Input, Meter, Modal, PageHead, SectionHead, Select, StatusPill, Tick, cx } from '../kit';
import { LEVELS, SignState } from './common';

export function AreaPage({ id }: { id: AreaId }) {
  const wp = useWorkpaper();
  const def = AREA[id];
  const a = wp.areas.find((x) => x.id === id);
  if (!def || !a) return <Empty title="Unknown area">Pick an area from the sidebar.</Empty>;
  const findings = wp.findings.filter((f) => f.check.area === id);
  const checks = wp.checks.filter((c) => c.area === id);
  const changes = wp.proposals.filter((p) => p.area === id && p.status !== 'withdrawn');
  const docs = wp.docs.filter((d) => d.area === id);
  const notes = [...wp.state.notes.values()].filter((n) => n.area === id && n.status === 'open');

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Area" title={def.name} sub={def.blurb} right={<AreaTime id={id} />} />

      <SignOffPanel id={id} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6 min-w-0">
          <LinesTable id={id} />
        </div>
        <div className="space-y-6 min-w-0">
          <section>
            <SectionHead title="Checks" sub={(() => {
              const pass = checks.filter((c) => c.status === 'pass' || c.status === 'info').length;
              const res = findings.filter((f) => f.status === 'resolved').length;
              const closed = findings.filter((f) => f.status === 'closed').length;
              const open = findings.filter((f) => f.blocking).length;
              return [`${checks.length} checks`, pass && `${pass} pass`, res && `${res} resolved by changes`, closed && `${closed} closed with a conclusion`, open && `${open} still open`].filter(Boolean).join(' · ') + '.';
            })()} />
            <Card pad={false}>
              {checks.length === 0 ? <div className="px-4 py-5 text-[13px] text-fg-3">No checks for this area.</div> : (
                <ul className="divide-y divide-line">
                  {checks.map((c) => {
                    const f = findings.find((x) => x.check.id === c.id);
                    return (
                      <li key={c.id}>
                        <button type="button" onClick={() => store.open(`check:${c.id}`)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-panel-2">
                          <StatusPill status={f ? f.status : c.status} />
                          <span className="min-w-0 flex-1"><span className="block text-[13px]">{c.title}</span><span className="block truncate text-[12px] text-fg-3">{c.summary}</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>

          {changes.length > 0 && (
            <section>
              <SectionHead title="Changes" />
              <Card pad={false}>
                <ul className="divide-y divide-line">
                  {changes.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => store.open(`adj:${p.id}`)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-panel-2">
                        <span className="mono w-6 shrink-0 pt-0.5 text-[11.5px] text-fg-3">{p.seq}</span>
                        <span className="min-w-0 flex-1 text-[13px]">{p.title}</span>
                        <StatusPill status={p.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {notes.length > 0 && (
            <section>
              <SectionHead title="Open notes" />
              <Card pad={false}>
                <ul className="divide-y divide-line">
                  {notes.map((n) => (
                    <li key={n.id}>
                      <button type="button" onClick={() => store.open(`note:${n.id}`)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-panel-2">
                        <PenLine className="mt-0.5 size-3.5 text-fg-3" />
                        <span className="min-w-0 flex-1 text-[13px]">{n.text}</span>
                        {n.blocking && <Badge tone="bad">Blocks filing</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionHead title="Documents" sub="Where each one landed, or why it did not." />
            <Card pad={false}>
              {docs.length === 0 ? <div className="px-4 py-5 text-[13px] text-fg-3">This area is computed from other areas' documents.</div> : (
                <ul className="divide-y divide-line">
                  {docs.map((d) => (
                    <li key={d.doc.id}>
                      <button type="button" disabled={!d.received} onClick={() => store.open(`doc:${d.doc.id}#page1`)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left enabled:hover:bg-panel-2 disabled:opacity-60">
                        <span className="mono mt-0.5 rounded bg-sunk px-1 text-[10.5px] text-fg-2">{d.doc.id}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{d.doc.title}</span><span className="block truncate text-[12px] text-fg-3">{d.reason}</span></span>
                        <StatusPill status={d.disposition} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function SignOffPanel({ id }: { id: AreaId }) {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const a = wp.areas.find((x) => x.id === id)!;
  const assigned = wp.state.assignments.get(id) ?? {};
  const start = useApp((s) => s.ix)!.packet.firm.assignment_at_start;
  const [assignOpen, setAssignOpen] = useState(false);
  const owner = (l: Level) => assigned[l] ?? start[l];
  return (
    <Card pad={false}>
      <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {LEVELS.map((l) => {
          const so = a.signoffs[l];
          const own = actors.find((x) => x.id === owner(l));
          // Each level is signed by the person who did that level's work (a partner can step in).
          const can = (l === 'preparer' && (me.role === 'preparer' || me.id === owner(l))) || (l === 'reviewer' && ['reviewer', 'partner'].includes(me.role)) || (l === 'partner' && me.role === 'partner');
          return (
            <div key={l} className={cx('p-4', so.state === 'reopened' && 'bg-warn-bg/40')}>
              <div className="flex items-center justify-between gap-2">
                <div className="eyebrow">{ROLE_LABEL[l]}</div>
                <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-3"><Avatar actor={own} size={16} />{own?.name.split(' ')[0]}</span>
              </div>
              <div className="mt-1.5"><SignState state={so.state} by={so.by} at={so.at} /></div>
              {so.state === 'reopened' && (
                <div className="mt-2 rounded-md border border-warn/40 bg-panel p-2 text-[12px]">
                  <div className="mb-1 flex items-center gap-1 font-medium text-warn"><RotateCcw className="size-3" />Changed since the sign-off</div>
                  <ul className="mono max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-fg-2 scroll-thin">{so.diff.slice(0, 40).map((d) => <li key={d}>{d}</li>)}</ul>
                  {so.diff.length > 40 && <div className="mt-1 text-fg-3">and {so.diff.length - 40} more</div>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {can && so.state !== 'signed' && (
                  <Button size="sm" variant="primary" icon={<Tick ink={me.ink} size={13} />} onClick={() => store.run((x) => signOff(x, id, l))}>{so.state === 'reopened' ? 'Re-sign' : 'Sign off'}</Button>
                )}
                {so.state !== 'missing' && (so.by === me.id || me.role === 'partner') && (
                  <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => store.run((x) => withdrawSignOff(x, id, l, 'Withdrawn'))}>Withdraw</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[12px] text-fg-3">
        <ShieldCheck className="size-3.5" />
        <span className="flex-1">A sign-off binds to this area's fingerprint <span className="mono">{a.fingerprint.slice(0, 8)}</span>: its lines, approved changes, judgments and documents. Any change reopens it and lists what changed.</span>
        {(me.role === 'firm_administrator' || me.role === 'partner') && <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)}>Assign people</Button>}
      </div>
      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} id={id} />
    </Card>
  );
}

function AssignModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: AreaId }) {
  const actors = useApp((s) => s.actors);
  const wp = useWorkpaper();
  const start = useApp((s) => s.ix)!.packet.firm.assignment_at_start;
  const assigned = wp.state.assignments.get(id) ?? {};
  const [vals, setVals] = useState<Record<Level, string>>({ preparer: assigned.preparer ?? start.preparer, reviewer: assigned.reviewer ?? start.reviewer, partner: assigned.partner ?? start.partner });
  const staffFor = (l: Level) => actors.filter((a) => (l === 'preparer' ? ['preparer', 'reviewer', 'partner'] : l === 'reviewer' ? ['reviewer', 'partner'] : ['partner']).includes(a.role));
  return (
    <Modal open={open} onClose={onClose} title={`Assign people · ${AREA[id].name}`} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={() => {
        const batch = newId('b_');
        const r = store.run((x) => {
          const evs: AnyEvent[] = [];
          for (const l of LEVELS) if (vals[l] !== (assigned[l] ?? start[l])) { const res = assign(x, id, l, vals[l]); if (!res.ok) return res; evs.push(...res.events.map((e) => ({ ...e, batch }))); }
          return evs.length ? { ok: true, events: evs, message: 'Assignments updated.' } : { ok: false, rule: 'Nothing changed.' };
        });
        if (r.ok) onClose();
      }}>Save</Button>
    </>}>
      <div className="space-y-3">
        {LEVELS.map((l) => (
          <label key={l} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="w-24 text-fg-2">{ROLE_LABEL[l]}</span>
            <Select className="flex-1" value={vals[l]} onChange={(v) => setVals((s) => ({ ...s, [l]: v }))} options={staffFor(l).map((a) => ({ id: a.id, label: `${a.name}${a.clearance ? '' : ' (no clearance)'}` }))} />
          </label>
        ))}
        <p className="text-[12px] text-fg-3">The person who prepares an area cannot also review it; Tickmark refuses that sign-off whoever is assigned.</p>
      </div>
    </Modal>
  );
}

function AreaTime({ id }: { id: AreaId }) {
  const wp = useWorkpaper();
  const me = useMe();
  const a = wp.areas.find((x) => x.id === id)!;
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState('30');
  const [note, setNote] = useState('');
  const budget = (a.budgetHours ?? 0) * 60;
  return (
    <div className="flex items-center gap-2">
      <div className="w-44 text-[12px]">
        <div className="flex justify-between text-fg-3"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" />Time</span><span className="num">{hours(a.minutes)}{a.budgetHours ? ` of ${a.budgetHours} h` : ' h'}</span></div>
        {budget > 0 && <Meter value={a.minutes} max={budget} tone={a.minutes > budget ? 'bad' : a.minutes > budget * 0.8 ? 'warn' : 'ok'} className="mt-1" />}
      </div>
      {['preparer', 'reviewer', 'partner'].includes(me.role) && <Button size="sm" onClick={() => setOpen(true)}>Log time</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title={`Log time · ${AREA[id].short}`} footer={<>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={() => { const r = store.run((x) => logTime(x, id, Number(min), note)); if (r.ok) { setOpen(false); setNote(''); } }}>Log</Button>
      </>}>
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <label className="text-[12px] text-fg-2">Minutes<Input value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="mt-1" /></label>
          <label className="text-[12px] text-fg-2">What you did<Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. tied out the 1099-B" /></label>
        </div>
      </Modal>
    </div>
  );
}

function LinesTable({ id }: { id: AreaId }) {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'changed' | 'unverified'>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<VerificationType>('agreed_to_source_document');
  const a = wp.areas.find((x) => x.id === id)!;
  const lots = a.lines.filter((k) => /^F8949\.[A-L]\.(?!total$)/.test(k));
  const lines = a.lines.filter((k) => !/^F8949\.[A-L]\.(?!total$)/.test(k));
  const version = wp.version ? ix.lines.get(wp.version.version) : undefined;
  const verified = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of wp.state.verifications) m.set(v.target, v.by);
    return m;
  }, [wp.state.verifications]);
  const noteCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of wp.state.notes.values()) if (n.status === 'open') m.set(n.target, (m.get(n.target) ?? 0) + 1);
    return m;
  }, [wp.state.notes]);
  const rows = lines.filter((k) => {
    const changed = wp.base?.values.get(k) !== wp.ours?.values.get(k);
    if (only === 'changed' && !changed) return false;
    if (only === 'unverified' && verified.has(k)) return false;
    if (!q.trim()) return true;
    const t = `${k} ${wp.ours?.labels.get(k) ?? ''}`.toLowerCase();
    return t.includes(q.trim().toLowerCase());
  });
  const byForm = new Map<string, string[]>();
  for (const k of rows) { const f = formName(k); byForm.set(f, [...(byForm.get(f) ?? []), k]); }
  const canVerify = ['preparer', 'reviewer', 'partner'].includes(me.role);
  const bulkVerify = () => {
    const batch = newId('b_');
    const keys = [...sel];
    const r = store.run((x) => {
      const evs: AnyEvent[] = [];
      for (const k of keys) { const res = verify(x, k, method, 'Bulk verification from the area page', [], batch); if (!res.ok) return res; evs.push(...res.events); }
      return { ok: true, events: evs, message: `${plural(evs.length, 'line')} verified (${VERIFICATION_LABEL[method].toLowerCase()}). One undo reverses them all.` };
    });
    if (r.ok) setSel(new Set());
  };

  return (
    <section>
      <SectionHead title="Lines" sub={`${plural(lines.length, 'line')} in this area${lots.length ? `, plus ${lots.length} sales lots (see Records → Sales detail)` : ''}. Blue numbers differ from the engine because of approved changes.`}
        right={<>
          <div className="relative w-44"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a line" className="pl-8" aria-label="Find a line" /></div>
          <Select value={only} onChange={(v) => setOnly(v as typeof only)} options={[{ id: 'all', label: 'All lines' }, { id: 'changed', label: 'Changed by us' }, { id: 'unverified', label: 'Not verified' }]} className="w-36" />
        </>} />
      {sel.size > 0 && canVerify && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line-2 bg-panel px-3 py-2 shadow-1">
          <span className="text-[13px] font-medium">{sel.size} selected</span>
          <Select value={method} onChange={(v) => setMethod(v as VerificationType)} options={Object.entries(VERIFICATION_LABEL).map(([k, v]) => ({ id: k, label: v }))} className="w-60" />
          <Button size="sm" variant="primary" icon={<ShieldCheck className="size-3.5" />} onClick={bulkVerify}>Record verification</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      )}
      {rows.length === 0 ? <Empty title="No lines match" /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] tracking-wide text-fg-3 uppercase">
                {canVerify && <th className="w-8 border-b border-line bg-panel-2 px-3 py-2" />}
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Line</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-right font-semibold">Engine</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-right font-semibold">Ours</th>
                <th className="w-16 border-b border-line bg-panel-2 px-3 py-2 text-right font-semibold" title="Sources on the page"><FileText className="ml-auto size-3.5" /></th>
              </tr>
            </thead>
            <tbody>
              {[...byForm.entries()].map(([form, keys]) => (
                <FormRows key={form} form={form} keys={keys} canVerify={canVerify} sel={sel} setSel={setSel} verified={verified} noteCount={noteCount} sources={(k) => version?.get(k)?.sources.length ?? 0} actors={actors} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormRows({ form, keys, canVerify, sel, setSel, verified, noteCount, sources, actors }: {
  form: string; keys: string[]; canVerify: boolean; sel: Set<string>; setSel: (f: (s: Set<string>) => Set<string>) => void; verified: Map<string, string>; noteCount: Map<string, number>; sources: (k: string) => number; actors: Actor[];
}) {
  const wp = useWorkpaper();
  const allSel = keys.every((k) => sel.has(k));
  return (
    <>
      <tr>
        {canVerify && <td className="border-b border-line bg-panel-2/60 px-3 py-1.5"><Checkbox checked={allSel} onChange={(v) => setSel((s) => { const n = new Set(s); for (const k of keys) { if (v) n.add(k); else n.delete(k); } return n; })} /></td>}
        <td colSpan={4} className="border-b border-line bg-panel-2/60 px-3 py-1.5 text-[12px] font-semibold text-fg-2">{form}</td>
      </tr>
      {keys.map((k) => {
        const b = wp.base?.values.get(k);
        const o = wp.ours?.values.get(k);
        const changed = b !== o;
        const vby = actors.find((a) => a.id === verified.get(k));
        const nc = noteCount.get(k) ?? 0;
        return (
          <tr key={k} className={cx('hover:bg-panel-2', sel.has(k) && 'bg-info-bg/40')}>
            {canVerify && <td className="border-b border-line px-3 py-1.5"><Checkbox checked={sel.has(k)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} /></td>}
            <td className="min-w-[200px] border-b border-line px-3 py-1.5">
              <button type="button" onClick={() => store.open(k)} className="text-left hover:underline">{wp.ours?.labels.get(k) ?? wp.base?.labels.get(k) ?? k}</button>
              <span className="mono ml-2 text-[11px] text-fg-3">{k}</span>
              {nc > 0 && <Badge tone="warn" className="ml-2">{nc} note{nc > 1 ? 's' : ''}</Badge>}
              {wp.ours?.approx.has(k) && <Badge tone="neutral" className="ml-2">≈</Badge>}
            </td>
            {/* Text values (an address, a date, a country) wrap so they never push the numbers out of view. */}
            <td className={cx('num border-b border-line px-3 py-1.5 text-right', typeof b === 'string' ? 'max-w-[160px] text-[12px] break-words' : 'whitespace-nowrap', changed ? 'text-fg-3 line-through decoration-fg-3/50' : 'text-fg-2')}>{b === undefined ? '—' : value(b, k)}</td>
            <td className={cx('border-b border-line px-3 py-1.5 text-right', typeof o === 'string' ? 'max-w-[160px] text-[12px] break-words' : 'whitespace-nowrap')}>
              <span className="inline-flex items-center gap-1">
                {vby && <Tick ink={vby.ink} size={13} title={`Verified by ${vby.name}`} />}
                {o === undefined ? <span className="text-fg-3">removed</span> : <button type="button" onClick={() => store.open(k)} className={cx('num proof', changed && 'ink-blue font-semibold')}>{value(o, k)}</button>}
              </span>
            </td>
            <td className="num border-b border-line px-3 py-1.5 text-right text-[12px] text-fg-3">{sources(k) || ''}</td>
          </tr>
        );
      })}
    </>
  );
}
