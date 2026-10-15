import { Cloud, Copy, Database, Download, Eye, HardDrive, History, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { setStandard } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import { VERIFICATION_LABEL } from '../../engine/events';
import { RULE } from '../../engine/people';
import type { Workpaper } from '../../engine/workpaper';
import { date, dateTime, hours, money, plural } from '../format';
import { Avatar, Badge, Button, Card, Checkbox, Empty, Field, Input, Meter, Modal, PageHead, SectionHead, Tabs, Tick, cx } from '../kit';
import { download, useNow } from './common';

type Tab = 'standards' | 'people' | 'access' | 'time' | 'status' | 'data';

export function Firm({ tab }: { tab?: string }) {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const t = (['standards', 'people', 'access', 'time', 'status', 'data'].includes(tab ?? '') ? tab : 'status') as Tab;
  return (
    <div>
      <PageHead eyebrow={ix.packet.firm.name} title="Firm" sub="Standards the workpaper enforces, people and their access, time against budget, deadlines, and the data behind this workspace." />
      <Tabs className="mb-5" value={t} onChange={(x) => store.go({ page: 'firm', tab: x })} tabs={[
        { id: 'status', label: 'Status and deadlines' }, { id: 'standards', label: 'Standards' }, { id: 'people', label: 'People' },
        { id: 'access', label: 'Sensitive data', count: wp.state.reveals.length || undefined }, { id: 'time', label: 'Time and budget' }, { id: 'data', label: 'Data' },
      ]} />
      {t === 'status' && <Status wp={wp} />}
      {t === 'standards' && <Standards wp={wp} />}
      {t === 'people' && <People wp={wp} />}
      {t === 'access' && <Access wp={wp} />}
      {t === 'time' && <Time wp={wp} />}
      {t === 'data' && <Data />}
    </div>
  );
}

// ---------------------------------------------------------------- status
function Status({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const now = useNow();
  const all = useApp((s) => s.events);
  const [q, setQ] = useState('');
  const firstAll = (pred: (e: typeof all[number]) => boolean) => all.find(pred)?.at;
  const handoff = (() => { const sigs = all.filter((e) => e.type === 'signoff' && e.payload.level === 'preparer'); const areas = new Set<string>(); for (const e of sigs) { if (e.type === 'signoff') areas.add(e.payload.area); if (areas.size === wp.areas.length) return e.at; } return null; })();
  const reviewDone = (() => { const sigs = all.filter((e) => e.type === 'signoff' && e.payload.level === 'reviewer'); const areas = new Set<string>(); for (const e of sigs) { if (e.type === 'signoff') areas.add(e.payload.area); if (areas.size === wp.areas.length) return e.at; } return null; })();
  const met = (what: string): string | null => {
    if (/original due date/.test(what)) return firstAll((e) => e.type === 'freeze') ?? (ix.packet.timeline.find((t) => t.event === 'extension_filed_with_payment' && t.at <= now) ? 'extended' : null);
    if (/Extended due date/.test(what)) return firstAll((e) => e.type === 'freeze') ?? null;
    if (/hand-off/.test(what)) return handoff;
    if (/review complete/.test(what)) return reviewDone;
    return null;
  };
  const stage = wp.state.frozen ? 'Filed' : wp.clientApprovalState === 'current' ? 'Ready to transmit' : wp.steps.find((s) => s.id === 'Partner sign-off')?.met ? 'With client for approval' : wp.areas.every((a) => a.signoffs.reviewer.state === 'signed') ? 'Partner review' : wp.areas.some((a) => a.signoffs.preparer.state === 'signed') ? 'In review' : 'In preparation';
  const p = ix.packet;
  const client = ix.engagement.filers;
  const match = !q.trim() || `${client} ${p.packet.client_id} ${stage}`.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="space-y-6">
      <section>
        <SectionHead title="Returns" sub="Every return in the firm's season with its stage. This workspace holds one." right={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search returns" className="w-56" aria-label="Search returns" />} />
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead><tr className="text-[11px] tracking-wide text-fg-3 uppercase">{['Client', 'Return', 'Stage', 'Open items', 'Due', 'Team'].map((h) => <th key={h} className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {match ? (
                <tr className="cursor-pointer hover:bg-panel-2" onClick={() => store.go({ page: 'overview' })}>
                  <td className="border-b border-line px-3 py-2"><div className="font-medium">{client}</div><div className="mono text-[11px] text-fg-3">{p.packet.client_id}</div></td>
                  <td className="border-b border-line px-3 py-2 text-[12.5px]">{ix.engagement.year} · {ix.engagement.forms} · {ix.engagement.filingStatusShort}</td>
                  <td className="border-b border-line px-3 py-2"><Badge tone={wp.state.frozen ? 'ok' : 'info'} dot>{stage}</Badge></td>
                  <td className="num border-b border-line px-3 py-2">{wp.blockers.length}</td>
                  <td className="border-b border-line px-3 py-2 text-[12.5px]">{wp.state.frozen ? `Filed ${date(wp.state.frozen.at)}` : ix.engagement.due ? `${date(ix.engagement.due.date)}${ix.engagement.due.extended ? ' (extended)' : ''}` : '—'}</td>
                  <td className="border-b border-line px-3 py-2"><TeamAvatars /></td>
                </tr>
              ) : <tr><td colSpan={6} className="px-3 py-4 text-center text-fg-3">No returns match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <SectionHead title="Deadlines" />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {[...p.firm.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
              const m = met(d.what);
              const past = d.date < now.slice(0, 10);
              const late = m && m !== 'extended' && m.slice(0, 10) > d.date;
              return (
                <li key={d.what} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="num w-28 shrink-0 font-medium">{date(d.date)}</span>
                  <span className="min-w-0 flex-1">{d.what}</span>
                  {m === 'extended' ? <Badge tone="info">Extended (Form 4868, FTB 3519)</Badge> : m ? <Badge tone={late ? 'warn' : 'ok'}>{late ? 'Met late' : 'Met'} {date(m)}</Badge> : /outside engagement/.test(d.what) ? <Badge tone="neutral">Client's</Badge> : past ? <Badge tone="bad">Passed</Badge> : <Badge tone="outline">Upcoming</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function TeamAvatars() {
  const actors = useApp((s) => s.actors);
  const ids = Object.values(useApp((s) => s.ix)!.packet.firm.assignment_at_start);
  return <span className="inline-flex -space-x-1.5">{ids.map((id) => <Avatar key={id} actor={actors.find((a) => a.id === id)} size={20} ring />)}</span>;
}

// ---------------------------------------------------------------- standards
function Standards({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const st = ix.packet.firm.starter_standards;
  const can = me.role === 'firm_administrator' || me.role === 'partner';
  const get = <T,>(k: string, d: T) => (wp.state.standards.has(k) ? (wp.state.standards.get(k) as T) : d);
  const [pct, setPct] = useState(String(get('variance_review.flag_if_change_over_percent', st.variance_review.flag_if_change_over_percent)));
  const [amt, setAmt] = useState(String(get('variance_review.and_over_amount', st.variance_review.and_over_amount)));
  const [thr, setThr] = useState(String(get('partner_threshold', 1000)));
  const types = get<string[]>('verification_types', st.verification_types);
  const all = Object.keys(VERIFICATION_LABEL);
  const enforced: Record<string, string> = {
    [RULE.selfReview]: 'Refused when anyone approves or signs work they prepared.',
    [RULE.partnerOver]: `A change whose recomputed effect is over ${money(Number(thr))} needs the partner's approval before it applies.`,
    [RULE.authority]: 'A judgment or manual change cannot be recorded without it.',
    [RULE.dueDiligence]: 'A required step; filing is blocked until the checklist is complete.',
    [RULE.notesBlock]: 'Open blocking review notes are filing blockers and stop reviewer sign-off on their area.',
    [RULE.masked]: 'Identifiers are masked everywhere, including document pages; showing one is logged (Sensitive data).',
    [RULE.retention]: 'The filed return shows its retention date.',
  };
  const save = (path: string, value: unknown, note: string) => store.run((x) => setStandard(x, path, value, note));
  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-fg-3">{st.note} Changes apply from the moment they are made and are recorded in the log; earlier work keeps the standard it was done under.</p>
      <section>
        <SectionHead title="Rules" sub="Each one is enforced in the actions themselves; a refusal quotes the rule." />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {st.rules.map((r) => <li key={r} className="flex items-start gap-3 px-4 py-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" /><div><div className="text-[13px] font-medium">{r}</div><div className="text-[12.5px] text-fg-3">{enforced[r] ?? 'Enforced.'}</div></div></li>)}
          </ul>
        </Card>
      </section>
      <section>
        <SectionHead title="Thresholds" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <div className="text-[13.5px] font-semibold">Variance review against the prior year</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Flag if change over (%)"><Input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))} disabled={!can} /></Field>
              <Field label="and over (amount)"><Input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} disabled={!can} /></Field>
            </div>
            {can && <div className="flex justify-end"><Button size="sm" onClick={() => { save('variance_review.flag_if_change_over_percent', Number(pct), 'Variance threshold'); save('variance_review.and_over_amount', Number(amt), 'Variance threshold'); }}>Save</Button></div>}
          </Card>
          <Card className="space-y-3">
            <div className="text-[13.5px] font-semibold">Partner approval</div>
            <Field label="Changes with a tax effect over" hint="Federal or state, tax or amount due."><Input value={thr} onChange={(e) => setThr(e.target.value.replace(/[^\d]/g, ''))} disabled={!can} /></Field>
            {can && <div className="flex justify-end"><Button size="sm" onClick={() => save('partner_threshold', Number(thr), 'Partner approval threshold')}>Save</Button></div>}
          </Card>
        </div>
      </section>
      <section>
        <SectionHead title="Verification types" sub="How a number can be verified. Each verification draws a tickmark in the verifier's ink." />
        <Card className="flex flex-wrap gap-4">
          {all.map((k) => <Checkbox key={k} checked={types.includes(k)} onChange={(v) => can && save('verification_types', v ? [...types, k] : types.filter((x) => x !== k), 'Verification types')} label={VERIFICATION_LABEL[k]} />)}
        </Card>
      </section>
      <section>
        <SectionHead title="Review levels and required steps" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card><ol className="list-decimal space-y-1 pl-5 text-[13px]">{st.review_levels.map((l) => <li key={l} className="capitalize">{l}</li>)}</ol></Card>
          <Card><ol className="list-decimal space-y-1 pl-5 text-[13px]">{st.required_steps.map((s) => <li key={s}>{s}</li>)}</ol></Card>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- people
function People({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const now = useNow();
  const ptins = ix.packet.firm.firm_identity.ptins;
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead><tr className="text-[11px] tracking-wide text-fg-3 uppercase">{['Person', 'Role', 'Sensitive data', 'Active from', 'PTIN', 'Actions', 'Time'].map((h) => <th key={h} className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {actors.map((a) => {
              const n = wp.state.events.filter((e) => e.actor === a.id).length;
              const min = wp.state.timeLog.filter((t) => t.by === a.id).reduce((s, t) => s + t.minutes, 0);
              const inactive = a.role !== 'client' && now.slice(0, 10) < a.activeFrom;
              return (
                <tr key={a.id} className="hover:bg-panel-2">
                  <td className="border-b border-line px-3 py-2"><span className="inline-flex items-center gap-2"><Avatar actor={a} size={24} /><span><span className="block font-medium">{a.name}</span>{a.note && <span className="block text-[11.5px] text-fg-3">{a.note}</span>}</span></span></td>
                  <td className="border-b border-line px-3 py-2"><span className={`ink-${a.ink} font-medium`}>{a.roleLabel}</span>{a.credential ? `, ${a.credential}` : ''}</td>
                  <td className="border-b border-line px-3 py-2">{a.role === 'client' ? <span className="text-fg-3">Own data in portal</span> : a.clearance ? <Badge tone="ok">Cleared</Badge> : <Badge tone="warn">Masked</Badge>}</td>
                  <td className="border-b border-line px-3 py-2 text-[12.5px]">{a.role === 'client' ? '—' : <>{date(a.activeFrom)}{inactive && <Badge className="ml-1.5">not yet</Badge>}</>}</td>
                  <td className="mono border-b border-line px-3 py-2 text-[12px]">{ptins[a.id] ?? '—'}</td>
                  <td className="num border-b border-line px-3 py-2">{n}</td>
                  <td className="num border-b border-line px-3 py-2">{min ? `${hours(min)} h` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-fg-3">Every tab is one person: switch from the top right. Permissions come from the role and are checked before anything is recorded; the paid preparer signing returns is {actors.find((a) => a.id === ix.packet.firm.firm_identity.paid_preparer_signing_returns)?.name}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- access
function Access({ wp }: { wp: Workpaper }) {
  const actors = useApp((s) => s.actors);
  const rows = [...wp.state.reveals].reverse();
  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3"><Eye className="mt-0.5 size-4 text-fg-3" /><p className="text-[13px] text-fg-2">{RULE.masked} SSNs, account numbers and IP PINs are masked in every view, including the printed document pages; a person with clearance can show one for 15 minutes, and that view is recorded here. Staff without clearance cannot show them at all.</p></Card>
      {rows.length === 0 ? <Empty title="No identifiers have been shown" /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-[11px] tracking-wide text-fg-3 uppercase">{['When', 'Who', 'What', 'Reason'].map((h) => <th key={h} className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => { const a = actors.find((x) => x.id === r.by); return <tr key={i}><td className="border-b border-line px-3 py-2 text-[12.5px] whitespace-nowrap">{dateTime(r.at)}</td><td className="border-b border-line px-3 py-2"><span className="inline-flex items-center gap-1.5"><Avatar actor={a} size={18} />{a?.name}</span></td><td className="border-b border-line px-3 py-2 text-[12.5px]">{r.field.replace(/_/g, ' ')} · <span className="mono">{r.subject}</span></td><td className="border-b border-line px-3 py-2 text-[12.5px] text-fg-2">{r.reason}</td></tr>; })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- time
function Time({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const budget = ix.packet.firm.budget_hours;
  const totalBudget = Object.values(budget).reduce((s, h) => s + h, 0);
  const total = wp.state.timeLog.reduce((s, t) => s + t.minutes, 0);
  const byPerson = new Map<string, number>();
  for (const t of wp.state.timeLog) byPerson.set(t.by, (byPerson.get(t.by) ?? 0) + t.minutes);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><div className="text-[12px] text-fg-3">Logged</div><div className="num text-[20px] font-semibold">{hours(total)} h</div><div className="text-[12px] text-fg-3">of {totalBudget} h budget</div></Card>
        <Card><div className="text-[12px] text-fg-3">Remaining</div><div className={cx('num text-[20px] font-semibold', total / 60 > totalBudget && 'text-bad')}>{(totalBudget - total / 60).toFixed(1)} h</div></Card>
        <Card><div className="text-[12px] text-fg-3">Entries</div><div className="num text-[20px] font-semibold">{wp.state.timeLog.length}</div></Card>
      </div>
      <section>
        <SectionHead title="By area" />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {wp.areas.map((a) => {
              const b = (a.budgetHours ?? 0) * 60;
              return (
                <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-4 px-4 py-2.5 text-[13px]">
                  <button type="button" className="text-left hover:underline" onClick={() => store.go({ page: 'area', id: a.id })}>{AREA[a.id].name}{AREA[a.id].budgetKey === 'partner_review' && <span className="text-fg-3"> (partner review)</span>}</button>
                  {b ? <Meter value={a.minutes} max={b} tone={a.minutes > b ? 'bad' : a.minutes > b * 0.8 ? 'warn' : 'ok'} /> : <span className="text-[12px] text-fg-3">No budget</span>}
                  <span className="num w-24 text-right">{hours(a.minutes)}{a.budgetHours ? ` / ${a.budgetHours}` : ''} h</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
      <section>
        <SectionHead title="By person" />
        <Card pad={false}>
          <ul className="divide-y divide-line">{[...byPerson.entries()].map(([id, m]) => <li key={id} className="flex items-center justify-between px-4 py-2 text-[13px]"><span className="inline-flex items-center gap-2"><Avatar actor={actors.find((a) => a.id === id)} size={20} />{actors.find((a) => a.id === id)?.name}</span><span className="num">{hours(m)} h</span></li>)}</ul>
          {byPerson.size === 0 && <div className="px-4 py-5 text-[13px] text-fg-3">No time logged yet. Log time from any area page.</div>}
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- data
function Data() {
  const ix = useApp((s) => s.ix)!;
  const events = useApp((s) => s.events);
  const mode = useApp((s) => s.mode);
  const ws = useApp((s) => s.workspace);
  const storageOk = useApp((s) => s.storageOk);
  const me = useMe();
  const [confirm, setConfirm] = useState<null | 'season' | 'reset'>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const link = (() => { try { const u = new URL(location.href); u.searchParams.set('ws', ws); u.hash = ''; return u.toString(); } catch { return ''; } })();
  const newWs = (() => { try { const u = new URL(location.href); u.searchParams.set('ws', Math.random().toString(36).slice(2, 8)); u.hash = ''; return u.toString(); } catch { return ''; } })();
  const p = ix.packet;
  return (
    <div className="space-y-6">
      <section>
        <SectionHead title="Packet" sub="Loaded exactly as delivered. The app never changes it; everything people do is in the activity log." />
        <Card className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
          <div><span className="text-fg-3">Name</span><div className="font-medium">{p.packet.name}</div></div>
          <div><span className="text-fg-3">Version · generated</span><div>{p.packet.version} · {p.packet.generated}</div></div>
          <div><span className="text-fg-3">Contents</span><div>{p.documents.length} documents · {p.documents.reduce((s, d) => s + d.pages.length, 0)} pages · {p.extracted_values.length.toLocaleString('en-US')} values · {p.return_versions.length} engine runs · {p.what_if.alternatives.length} what-ifs</div></div>
          <div><span className="text-fg-3">SHA-256</span><div className="mono text-[11.5px] break-all">{ix.sha256}</div></div>
        </Card>
      </section>
      <section>
        <SectionHead title="Workspace" />
        <Card className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'shared' ? <><Cloud className="size-4 text-ok" /><span><b>Live.</b> This workspace's log is on the server; everyone with the link works on it together.</span></> : <><HardDrive className="size-4 text-fg-3" /><span><b>This browser.</b> The log is saved here and shared live between this browser's tabs. Add a database to the deployment to share across devices.</span></>}
          </div>
          {!storageOk && <p className="rounded-md bg-bad-bg px-3 py-2">This browser refused to save. Work continues in this tab only; export the log to keep it.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-3">Workspace</span><span className="mono rounded bg-sunk px-1.5">{ws}</span>
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => { void navigator.clipboard?.writeText(link).then(() => store.toast('Workspace link copied.', 'info'), () => store.toast(link, 'info')); }}>Copy link</Button>
            <Button size="sm" variant="ghost" onClick={() => { location.href = newWs; }}>New empty workspace</Button>
          </div>
          <div className="text-fg-3">{plural(events.length, 'action')} in the log.</div>
        </Card>
      </section>
      <section>
        <SectionHead title="Season" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="space-y-2">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold"><History className="size-4 text-fg-3" />Load the recorded season</div>
            <p className="text-[12.5px] text-fg-2">March 9 to June 30, 2026: five people working through the firm's rules. Replaces this workspace's log. You become Daniel Ortiz (reviewer).</p>
            <div className="flex justify-end"><Button size="sm" disabled={me.role === 'client'} onClick={() => setConfirm('season')}>Load season</Button></div>
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold"><RotateCcw className="size-4 text-fg-3" />Start over</div>
            <p className="text-[12.5px] text-fg-2">Clear this workspace's log and return to the packet as delivered on July 1, 2026.</p>
            <div className="flex justify-end"><Button size="sm" variant="danger" disabled={me.role === 'client'} onClick={() => setConfirm('reset')}>Reset workspace</Button></div>
          </Card>
        </div>
      </section>
      <section>
        <SectionHead title="Export and import" />
        <Card className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => download(`tickmark-log-${ws}.json`, JSON.stringify({ packetSha256: ix.sha256, exported: new Date().toISOString(), events }, null, 2))}>Export the log</Button>
          <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => file.current?.click()}>Import a log</Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try {
              const j = JSON.parse(await f.text()) as { packetSha256?: string; events?: unknown };
              if (j.packetSha256 && j.packetSha256 !== ix.sha256) throw new Error('That log was recorded against a different packet.');
              store.importLog((j.events ?? j) as never);
              store.toast(`Imported ${(j.events as unknown[] | undefined)?.length ?? 0} actions.`, 'ok');
            } catch (err) { store.toast(err instanceof Error ? err.message : 'Could not read that file.', 'error'); }
          }} />
          <span className="text-[12px] text-fg-3"><Database className="mr-1 inline size-3.5" />The log is plain JSON: every event with who, when and what.</span>
        </Card>
      </section>
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'season' ? 'Load the recorded season?' : 'Reset this workspace?'} footer={<>
        <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
        <Button variant={confirm === 'reset' ? 'danger' : 'primary'} busy={busy} onClick={async () => {
          setBusy(true);
          await new Promise((r) => setTimeout(r, 30));
          try { if (confirm === 'season') await store.loadSeason('st-02'); else { await store.reset(); store.toast('Workspace reset to the packet as delivered.', 'info'); } } finally { setBusy(false); setConfirm(null); }
        }}>{confirm === 'season' ? 'Load season' : 'Reset'}</Button>
      </>}>
        <p className="text-[13px]">{confirm === 'season' ? `This replaces the ${plural(events.length, 'action')} in this workspace with the recorded season.` : `This removes all ${plural(events.length, 'action')} from this workspace${mode === 'shared' ? ' for everyone using it' : ''}. Export the log first if you want to keep it.`}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-3"><Tick size={13} />The packet itself is never changed.</p>
      </Modal>
    </div>
  );
}
