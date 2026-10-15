import { ArrowUpRight, Calculator, FileSearch, GitBranch, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { proposeManual } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA, areaOfLine, formName } from '../../engine/areas';
import { rereadValue } from '../../engine/checks/reread';
import { date, money, signed, value } from '../format';
import { Badge, Button, Diff, Field, Input, Money, Select, StatusPill, TextArea, Tick, cx } from '../kit';
import { RefChip } from '../Ref';
import { AskClient, Attachments, Notes, Section, Verifications } from './widgets';

const PY_MAP: Record<string, string> = { 'F540NR.64': 'CA540.64', 'F540NR.13': 'CA540.13', 'F540NR.17': 'CA540.17', 'F540NR.19': 'CA540.19', 'F540NR.71': 'CA540.71', 'F540NR.72': 'CA540.72', 'F1040.13': 'F8995.15' };

export function LineProof({ k }: { k: string }) {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const v = wp.version;
  const line = v ? ix.lines.get(v.version)?.get(k) : undefined;
  const ours = wp.ours?.values.get(k);
  const base = wp.base?.values.get(k);
  const proj = wp.projected?.values.get(k);
  const label = wp.ours?.labels.get(k) ?? line?.label ?? k;
  const formula = wp.ours?.formulas.get(k);
  const area = areaOfLine(k);
  const pyKey = PY_MAP[k] ?? k;
  const py = ix.packet.prior_years.return_2024.lines[pyKey];
  const rule = line ? ix.packet.engine_reference.rules[line.rule] : undefined;
  const consumers = v ? ix.consumers.get(v.version)?.get(k) ?? [] : [];
  const proposals = wp.proposals.filter((p) => p.changes.some((c) => c.key === k) || p.edits.some((e) => 'key' in e && e.key === k) || (k.startsWith('F8949') && p.edits.some((e) => (e.op === 'lot' || e.op === 'addLot') && k.endsWith('.' + (e.op === 'lot' ? e.id : e.lot.id)))));
  const checks = wp.checks.filter((c) => c.refs.includes(k) || c.fixes.some((f) => wp.fixes.get(f)?.lines.includes(k)));
  const lastVer = wp.state.verifications.filter((x) => x.target === k).slice(-1)[0];
  const verifier = actors.find((a) => a.id === lastVer?.by);
  const history = ix.versionOrder.map((vid) => ({ vid, val: ix.lines.get(vid)?.get(k)?.value, at: ix.versions.get(vid)!.computed_at, trigger: ix.versions.get(vid)!.trigger }));
  const changed = typeof ours === 'number' && typeof base === 'number' && ours !== base;
  const removed = wp.ours && !wp.ours.values.has(k);
  const lot = k.startsWith('F8949.') && !k.endsWith('.total') ? wp.ours?.lots.find((l) => `F8949.${l.box}.${l.id}` === k) : undefined;

  return (
    <div>
      <div className="px-5 pt-4 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="mono text-[12px] text-fg-3">{k}</span>
          <Badge tone="outline">{formName(k)}</Badge>
          <button type="button" onClick={() => store.go({ page: 'area', id: area })}><Badge tone="neutral">{AREA[area].short}</Badge></button>
          {line?.jurisdiction === 'california' && <Badge tone="info">California</Badge>}
        </div>
        <h2 className="text-[17px] leading-snug font-semibold">{label}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ValueBox label={`Engine ${v?.version ?? ''}`} v={base} k={k} muted={changed} />
          <ValueBox label="Ours" v={removed ? 'Removed' : ours} k={k} strong ink={verifier?.ink} verified={!!lastVer} />
          {proj !== ours && <ValueBox label="If pending approved" v={proj} k={k} />}
          {typeof py === 'number' && <ValueBox label="2024" v={py} k={k} />}
        </div>
        {line?.note && <p className="mt-3 rounded-md bg-panel-2 px-3 py-2 text-[12.5px] text-fg-2">Engine note: {line.note}</p>}
      </div>

      <Section title="How it was built" right={<Calculator className="size-3.5 text-fg-3" />}>
        {line && (
          <div className="mb-3">
            <div className="text-[12.5px]"><span className="mono text-fg-3">{line.rule}</span> {rule && <span className="text-fg-2">— {rule}</span>}</div>
            {line.inputs.length > 0 && (
              <div className="mt-2 divide-y divide-line rounded-lg border border-line">
                {line.inputs.map((i) => (
                  <button key={i} type="button" onClick={() => store.open(i)} className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-panel-2">
                    <span className="mono w-28 shrink-0 truncate text-[11.5px] text-fg-3">{i}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{wp.ours?.labels.get(i) ?? i}</span>
                    <span className="num text-[12.5px] font-medium">{value(wp.ours?.values.get(i), i)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {formula && (
          <div className={cx('rounded-lg border px-3 py-2 text-[12.5px]', changed ? 'border-info/40 bg-info-bg/50' : 'border-line bg-panel-2')}>
            <div className="mb-0.5 flex items-center gap-1.5 font-medium"><GitBranch className="size-3.5" />TaxLens recompute</div>
            <div className="text-fg-2">{formula.expr}</div>
            <div className="mt-1 text-fg-3">{changed ? `Differs from the engine because of approved changes (${signed((ours as number) - (base as number))}).` : wp.ours?.derived.has(k) ? 'Same result as the engine.' : ''}</div>
          </div>
        )}
        {lot && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-line p-3 text-[12.5px] sm:grid-cols-3">
            <div><span className="text-fg-3">Acquired</span><div>{lot.acquired}</div></div>
            <div><span className="text-fg-3">Sold</span><div>{lot.sold}</div></div>
            <div><span className="text-fg-3">Box</span><div>{lot.box}</div></div>
            <div><span className="text-fg-3">Proceeds</span><div className="num">{money(lot.proceeds, { cents: true })}</div></div>
            <div><span className="text-fg-3">Basis</span><div className="num">{money(lot.basis, { cents: true })}</div></div>
            <div><span className="text-fg-3">Adjustment</span><div className="num">{lot.adjCode ? `${lot.adjCode} ${money(lot.adj, { cents: true })}` : '—'}</div></div>
          </div>
        )}
      </Section>

      <Sources sources={line?.sources ?? []} />

      {proposals.length > 0 && (
        <Section title="Changes to this number">
          <div className="space-y-2">
            {proposals.map((p) => {
              const c = p.changes.find((x) => x.key === k);
              return (
                <button key={p.id} type="button" onClick={() => store.open(`adj:${p.id}`)} className="flex w-full items-start gap-2 rounded-lg border border-line p-2.5 text-left hover:border-line-2">
                  <PencilLine className="mt-0.5 size-3.5 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">Change {p.seq}: {p.title}</div>
                    {c && <div className="mt-0.5 text-[12.5px]"><Diff from={c.from} to={c.to} /></div>}
                  </div>
                  <StatusPill status={p.status} />
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {checks.length > 0 && (
        <Section title="Checks that look at this number">
          <div className="space-y-1.5">
            {checks.map((c) => (
              <button key={c.id} type="button" onClick={() => store.open(`check:${c.id}`)} className="flex w-full items-center gap-2 text-left text-[13px] hover:underline">
                <StatusPill status={c.status} /><span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Engine history">
        <div className="grid grid-cols-3 gap-2">
          {history.map((h) => (
            <div key={h.vid} className="rounded-lg border border-line p-2" title={h.trigger}>
              <div className="text-[11.5px] text-fg-3">{h.vid} · {date(h.at)}</div>
              <div className="num text-[13px] font-medium">{h.val === undefined ? '—' : value(h.val, k)}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Verification">
        <Verifications target={k} />
      </Section>

      {consumers.length > 0 && (
        <Section title="Used by">
          <div className="flex flex-wrap gap-1">{consumers.map((c) => <RefChip key={c} r={c} />)}</div>
        </Section>
      )}

      <Section title="Notes">
        <Notes target={k} area={area} />
      </Section>

      <Section title="Evidence attached">
        <Attachments target={k} />
        <div className="mt-2"><AskClient target={k} area={area} /></div>
      </Section>

      {me.role !== 'client' && typeof ours === 'number' && <ManualChange k={k} current={ours} label={label} />}
    </div>
  );
}

function ValueBox({ label, v, k, muted, strong, ink, verified }: { label: string; v: number | string | undefined | null; k: string; muted?: boolean; strong?: boolean; ink?: string; verified?: boolean }) {
  return (
    <div className={cx('rounded-lg border p-2.5', strong ? 'border-line-2 bg-panel' : 'border-line bg-panel-2')}>
      <div className="text-[11.5px] text-fg-3">{label}</div>
      <div className={cx('num mt-0.5 flex items-center gap-1 text-[15px]', strong && 'font-semibold', muted && 'text-fg-3 line-through')}>
        {v === undefined || v === null ? '—' : typeof v === 'number' ? value(v, k) : v}
        {verified && <Tick ink={(ink as 'blue') ?? 'graphite'} size={14} />}
      </div>
    </div>
  );
}

export function Sources({ sources }: { sources: string[] }) {
  const ix = useApp((s) => s.ix)!;
  if (!sources.length) return null;
  return (
    <Section title="Where it came from" right={<FileSearch className="size-3.5 text-fg-3" />}>
      <div className="space-y-1.5">
        {sources.map((s) => {
          if (s.startsWith('ev-')) {
            const e = ix.evs.get(s);
            if (!e) return <RefChip key={s} r={s} />;
            const rr = rereadValue(e, ix.page(e.document_id, e.page));
            const bad = rr.kind === 'mismatch' || rr.kind === 'blank-as-zero' || rr.kind === 'missing' || rr.kind === 'low-confidence';
            const doc = ix.docs.get(e.document_id)!;
            return (
              <button key={s} type="button" onClick={() => store.open(`doc:${e.document_id}#page${e.page}@${e.id}`)}
                className={cx('flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left hover:border-line-2', bad ? 'border-bad/40 bg-bad-bg/40' : 'border-line')}>
                <span className="mono mt-0.5 rounded bg-sunk px-1 text-[10.5px] text-fg-2">{e.document_id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{e.label}</span>
                  <span className="block truncate text-[11.5px] text-fg-3">{doc.title} · page {e.page} · {e.id} · confidence {e.confidence.toFixed(2)}</span>
                  {bad && <span className="block text-[11.5px] text-bad">{rr.reason}</span>}
                </span>
                <span className="num text-[12.5px] font-medium">{e.value === null ? '—' : typeof e.value === 'number' ? money(e.value, { cents: e.value % 1 !== 0 }) : String(e.value)}</span>
                <ArrowUpRight className="mt-0.5 size-3.5 text-fg-3" />
              </button>
            );
          }
          return <div key={s} className="flex items-center gap-2 text-[12.5px]"><RefChip r={s} /></div>;
        })}
      </div>
    </Section>
  );
}

function ManualChange({ k, current, label }: { k: string; current: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<'set' | 'delta'>('set');
  const [val, setVal] = useState(String(current));
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [evidence, setEvidence] = useState('');
  const n = Number(val.replace(/,/g, ''));
  return (
    <Section title="Change this number">
      {!open ? (
        <Button size="sm" icon={<PencilLine className="size-3.5" />} onClick={() => setOpen(true)}>Propose a change</Button>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12.5px] text-fg-3">The original stays. Your change is recorded with who, why and its tax effect, and applies once a reviewer approves it.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="How"><Select value={op} onChange={(x) => { setOp(x as 'set' | 'delta'); setVal(x === 'set' ? String(current) : '0'); }} options={[{ id: 'set', label: 'Set to' }, { id: 'delta', label: 'Add or subtract' }]} /></Field>
            <Field label={op === 'set' ? 'New value' : 'Amount (+/−)'} hint={op === 'set' && !Number.isNaN(n) ? `Change ${signed(n - current)}` : undefined}><Input id={`mc-${k}`} value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" /></Field>
          </div>
          <Field label="Why"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What the documents show" /></Field>
          <Field label="Authority" hint="Every judgment records the authority relied on."><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. IRC §162; Pub. 535" /></Field>
          <Field label="Evidence (references)" hint="Document, value or answer ids, separated by spaces: D15 ev-0106 qa-25"><Input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={Number.isNaN(n)} onClick={() => {
              const r = store.run((x) => proposeManual(x, { key: k, op, value: n, title: `${label}: ${op === 'set' ? `set to ${money(n)}` : signed(n)}`, reason, authority, evidence: evidence.split(/\s+/).filter(Boolean) }));
              if (r.ok) setOpen(false);
            }}>Propose</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

export { Money };
