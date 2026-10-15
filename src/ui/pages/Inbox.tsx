import { CircleCheck, Layers, Search, Sparkles, Wand2, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { type ActCtx, type Result, decide, explainVariance, proposeFix } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA, AREAS, type AreaId } from '../../engine/areas';
import { effectBetween } from '../../engine/effects';
import { type AnyEvent, newId } from '../../engine/events';
import { JUDGMENTS } from '../../engine/judgments';
import type { RoleKind } from '../../engine/people';
import { computeReturn, summarize } from '../../engine/recompute';
import type { Workpaper } from '../../engine/workpaper';
import { date, money, plural, signed } from '../format';
import { firmDay } from '../../engine/time';
import { Avatar, Badge, Button, Checkbox, Empty, Input, PageHead, Segmented, Select, StatusPill, cx } from '../kit';
import { AreaLink } from './common';

type Kind = 'change' | 'finding' | 'note' | 'judgment' | 'question' | 'variance' | 'step' | 'signoff';
interface Item {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  area: AreaId | null;
  owners: RoleKind[];
  status?: string;
  ref?: string;
  go?: () => void;
  meta?: ReactNode;
  effect?: { fed: number; ca: number } | null;
  selectable?: boolean;
  by?: string;
  /** A specific person this item was handed to (overrides the role-based owners). */
  assignee?: string | null;
  due?: string | null;
}

const KIND_LABEL: Record<Kind, string> = {
  change: 'Changes to approve', finding: 'Findings', note: 'Review notes', judgment: 'Judgment calls', question: 'Client questions',
  variance: 'Variances to explain', step: 'Firm steps', signoff: 'Sign-offs',
};
const ORDER: Kind[] = ['change', 'finding', 'note', 'judgment', 'variance', 'question', 'step', 'signoff'];

/** Effect of each correction's recommended option on top of the return as it stands. */
function useFixEffects(wp: Workpaper) {
  const ix = useApp((s) => s.ix)!;
  return useMemo(() => {
    const m = new Map<string, { fed: number; ca: number }>();
    if (!wp.version || !wp.summary.ours) return m;
    const applied = wp.proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '')).flatMap((p) => p.edits);
    for (const f of wp.findings) {
      if (f.status !== 'open') continue;
      for (const { def, proposal } of f.fixes) {
        if (proposal || def.kind === 'data' || m.has(def.id)) continue;
        const after = summarize(computeReturn(ix.packet, wp.version, [...applied, ...def.options[def.recommended].edits]));
        const e = effectBetween(wp.summary.ours, after);
        m.set(def.id, { fed: e.fedTax, ca: e.caTax });
      }
    }
    return m;
  }, [wp, ix]);
}

function buildItems(wp: Workpaper, effects: Map<string, { fed: number; ca: number }>, roleOf: (id: string) => RoleKind | undefined, nameOf: (id: string) => string, today: string): Item[] {
  const items: Item[] = [];
  for (const p of wp.proposals) {
    if (p.status !== 'proposed') continue;
    items.push({
      id: `adj:${p.id}`, kind: 'change', title: `Change ${p.seq}: ${p.title}`, detail: p.reason, area: p.area, ref: `adj:${p.id}`, by: p.by,
      owners: p.needs.includes('reviewer') ? ['reviewer', 'partner'] : ['partner'], status: 'proposed', selectable: true,
      effect: p.fix?.kind === 'data' ? null : { fed: p.effect.fedTax, ca: p.effect.caTax },
      meta: <span className="text-fg-3">Needs {p.needs.join(' and ')}</span>,
    });
  }
  for (const p of wp.proposals) {
    if (p.status !== 'rejected') continue;
    const d = p.decisions.find((x) => x.decision === 'reject');
    items.push({ id: `rej:${p.id}`, kind: 'change', title: `Rejected: ${p.title}`, detail: d?.note ?? '', area: p.area, ref: `adj:${p.id}`, owners: ['preparer'], status: 'rejected', by: d?.by });
  }
  for (const f of wp.findings) {
    if (!f.blocking) continue;
    const fixable = f.status === 'open' && f.fixes.some((x) => !x.proposal);
    const eff = f.fixes.reduce<{ fed: number; ca: number } | null>((acc, x) => {
      const e = effects.get(x.def.id);
      return e ? { fed: (acc?.fed ?? 0) + e.fed, ca: (acc?.ca ?? 0) + e.ca } : acc;
    }, null);
    items.push({
      id: `check:${f.check.id}`, kind: 'finding', title: f.check.title, detail: f.check.summary, area: f.check.area, ref: `check:${f.check.id}`,
      owners: f.status === 'open' ? ['preparer'] : [], status: f.status, selectable: fixable, effect: f.status === 'open' ? eff : null,
      meta: f.fixes.length ? <span className="text-fg-3">{plural(f.fixes.length, 'correction')}{f.fixes.some((x) => x.def.certainty === 'judgment') ? ' · judgment' : ''}</span> : <span className="text-fg-3">{f.check.status === 'review' ? 'Needs a conclusion' : f.status === 'waiting' ? 'Waiting for a document' : 'Needs a decision'}</span>,
    });
  }
  for (const n of wp.state.notes.values()) {
    if (n.status !== 'open' || n.kind !== 'review') continue;
    const replied = n.thread.length > 0;
    const overdue = !!n.due && n.due < today;
    items.push({ id: `note:${n.id}`, kind: 'note', title: n.text, detail: replied ? `Last reply: ${n.thread[n.thread.length - 1].text}` : 'No reply yet', area: n.area, ref: `note:${n.id}`, by: n.by,
      owners: replied ? [roleOf(n.by) ?? 'reviewer'] : n.assignee ? [] : ['preparer'], assignee: replied ? null : n.assignee, due: n.due, status: overdue ? 'overdue' : 'open',
      meta: <>{n.blocking && <Badge tone="bad">Blocks filing</Badge>}{n.assignee && <span className="text-fg-3">for {nameOf(n.assignee)}</span>}{n.due && <span className={overdue ? 'text-bad' : 'text-fg-3'}>due {date(n.due)}</span>}</> });
  }
  for (const j of JUDGMENTS) {
    const rec = wp.state.judgments.get(j.id);
    if (rec && (!j.needsPartner || rec.approvedBy)) continue;
    items.push({ id: `judgment:${j.id}`, kind: 'judgment', title: j.topic, detail: rec ? `Recorded: ${rec.decision}` : j.question, area: j.area, go: () => store.go({ page: 'review', tab: 'judgments' }),
      owners: rec ? ['partner'] : ['preparer', 'reviewer'], status: rec ? 'proposed' : 'open', meta: <span className="text-fg-3">{rec ? 'Awaiting partner approval' : j.needsPartner ? 'Partner approves' : 'Record with authority'}</span> });
  }
  for (const v of wp.variances) {
    if (!v.flagged || v.explanation) continue;
    items.push({ id: `var:${v.key}`, kind: 'variance', title: `${v.label}: ${money(v.prior)} → ${money(v.current)}`, detail: `Suggested: ${v.suggestion}`, area: null, ref: v.key, owners: ['preparer'], selectable: true,
      meta: <span className="num text-fg-3">{signed(v.delta)}{v.pct !== null ? ` (${Math.round(v.pct * 100)}%)` : ''}</span> });
  }
  for (const q of wp.state.questions.values()) {
    if (q.answer) continue;
    const late = !!q.due && q.due < today;
    items.push({ id: `q:${q.id}`, kind: 'question', title: q.text, detail: late ? `The client was asked to answer by ${date(q.due)}. Follow up from the Client page.` : 'Waiting for the client in the portal', area: q.area, go: () => store.go({ page: 'client' }), owners: [], assignee: late ? q.by : null, by: q.by, due: q.due, status: late ? 'overdue' : 'waiting' });
  }
  for (const s of wp.steps) {
    if (s.met || ['Reviewer sign-off', 'Partner sign-off', 'Client approval and e-file authorization'].includes(s.id)) continue;
    items.push({ id: `step:${s.id}`, kind: 'step', title: s.id, detail: s.how, area: null, go: () => store.go({ page: 'review', tab: s.id === 'Due diligence completed' ? 'diligence' : s.id === 'Diagnostics resolved' ? 'diagnostics' : s.id === 'Prior-year variances explained' ? 'variances' : 'steps' }), owners: ['preparer'] });
  }
  for (const a of wp.areas) for (const lvl of ['preparer', 'reviewer', 'partner'] as const) {
    const so = a.signoffs[lvl];
    if (so.state === 'signed') continue;
    items.push({ id: `so:${a.id}:${lvl}`, kind: 'signoff', title: `${AREA[a.id].name} · ${lvl}`, detail: so.state === 'reopened' ? `Reopened: ${so.diff.slice(0, 2).join('; ')}${so.diff.length > 2 ? ` and ${so.diff.length - 2} more` : ''}` : 'Not signed yet', area: a.id, go: () => store.go({ page: 'area', id: a.id }), owners: [lvl], status: so.state });
  }
  return items;
}

export function Inbox() {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const effects = useFixEffects(wp);
  const [scope, setScope] = useState<'me' | 'all'>(me.role === 'firm_administrator' || me.role === 'quality_reviewer' ? 'all' : 'me');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [area, setArea] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const roleOf = (id: string) => actors.find((a) => a.id === id)?.role;
  const nameOf = (id: string) => actors.find((a) => a.id === id)?.name.split(' ')[0] ?? id;
  const today = firmDay(wp.asOf);
  const all = useMemo(() => buildItems(wp, effects, roleOf, nameOf, today), [wp, effects, actors, today]); // roleOf and nameOf read actors
  const mine = (i: Item) => (i.assignee ? i.assignee === me.id : i.owners.includes(me.role)) && !(i.kind === 'change' && i.by === me.id);
  const filtered = all.filter((i) => (scope === 'all' || mine(i)) && (kind === 'all' || i.kind === kind) && (area === 'all' || i.area === area)
    && (!q.trim() || `${i.title} ${i.detail}`.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = new Map<Kind, number>();
  for (const i of all.filter((x) => scope === 'all' || mine(x))) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const selected = filtered.filter((i) => sel.has(i.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const runBatch = (label: string, noun: string, items: Item[], fn: (x: ActCtx, i: Item, batch: string) => Result) => {
    const batch = newId('b_');
    const r = store.run((x) => {
      const evs: AnyEvent[] = [];
      const refused: string[] = [];
      for (const i of items) { const res = fn(x, i, batch); if (res.ok) evs.push(...res.events); else refused.push(res.rule); }
      if (!evs.length) return { ok: false, rule: refused[0] ?? 'Nothing to do.' };
      return { ok: true, events: evs, message: `${label} ${plural(evs.length, noun)} in one step.${refused.length ? ` ${refused.length} skipped: ${refused[0]}` : ''} One undo reverses them all.` };
    });
    if (r.ok) setSel(new Set());
  };

  const canApprove = me.role === 'reviewer' || me.role === 'partner';
  const canPropose = ['preparer', 'reviewer', 'partner'].includes(me.role);
  const selChanges = selected.filter((i) => i.kind === 'change' && i.status === 'proposed');
  const selFindings = selected.filter((i) => i.kind === 'finding');
  const selVariances = selected.filter((i) => i.kind === 'variance');

  return (
    <div>
      <PageHead
        eyebrow="Work"
        title="Open items"
        sub="Everything between this file and filing, in one list. Select several to act on them together; one undo reverses the whole group."
        right={<Segmented value={scope} onChange={(v) => { setScope(v); setSel(new Set()); }} options={[{ id: 'me', label: `For ${me.name.split(' ')[0]}` }, { id: 'all', label: 'Everyone' }]} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <KindChip active={kind === 'all'} onClick={() => setKind('all')} label="All" n={[...counts.values()].reduce((s, n) => s + n, 0)} />
          {ORDER.filter((k) => counts.get(k)).map((k) => <KindChip key={k} active={kind === k} onClick={() => setKind(k)} label={KIND_LABEL[k]} n={counts.get(k)!} />)}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={area} onChange={setArea} options={[{ id: 'all', label: 'All areas' }, ...AREAS.map((a) => ({ id: a.id, label: a.short }))]} className="w-40" />
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="pl-8" aria-label="Filter open items" />
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sticky top-[60px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line-2 bg-panel px-3 py-2 shadow-2 anim-rise">
          <Layers className="size-4 text-fg-3" />
          <span className="text-base font-medium">{selected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {selFindings.length > 0 && canPropose && (
              <Button size="sm" variant="primary" icon={<Wand2 className="size-3.5" />} onClick={() => {
                // One proposal per correction, even when two findings point at the same one.
                const done = new Set<string>();
                runBatch('Proposed', 'correction', selFindings, (x, i, batch) => {
                  const f = x.wp.findings.find((y) => `check:${y.check.id}` === i.id);
                  const evs: AnyEvent[] = [];
                  let refused: Result | null = null;
                  for (const { def, proposal } of f?.fixes ?? []) {
                    if (proposal || done.has(def.id)) continue;
                    done.add(def.id);
                    const r = proposeFix(x, def.id, def.options[def.recommended].id, undefined, batch);
                    if (r.ok) evs.push(...r.events); else refused = refused ?? r;
                  }
                  // Corrections already proposed through another selected finding are not a refusal.
                  return evs.length || !refused ? { ok: true, events: evs, message: '' } : refused;
                });
              }}>Propose recommended corrections ({selFindings.length})</Button>
            )}
            {selChanges.length > 0 && canApprove && (
              <Button size="sm" variant="ok" icon={<CircleCheck className="size-3.5" />} onClick={() => runBatch('Approved', 'change', selChanges, (x, i, batch) => decide(x, i.id.slice(4), 'approve', '', batch))}>Approve ({selChanges.length})</Button>
            )}
            {selVariances.length > 0 && canPropose && (
              <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => runBatch('Explained', 'variance', selVariances, (x, i, batch) => {
                const v = x.wp.variances.find((y) => `var:${y.key}` === i.id);
                return v ? explainVariance(x, v.key, v.suggestion, batch) : { ok: false, rule: 'Unknown variance.' };
              })}>Use suggested explanations ({selVariances.length})</Button>
            )}
            <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty title={scope === 'me' ? 'Nothing is waiting for you' : 'Nothing is open'}>{scope === 'me' ? 'Switch to Everyone to see what others are working on.' : 'Every finding, change, note and step is complete.'}</Empty>
      ) : (
        <div className="space-y-6">
          {ORDER.map((k) => {
            const rows = filtered.filter((i) => i.kind === k);
            if (!rows.length) return null;
            const selectable = rows.filter((r) => r.selectable && (k !== 'change' || canApprove) && (k === 'change' || canPropose));
            const allSel = selectable.length > 0 && selectable.every((r) => sel.has(r.id));
            return (
              <section key={k}>
                <div className="mb-2 flex items-center gap-2">
                  {selectable.length > 0 && <Checkbox checked={allSel} onChange={(v) => setSel((s) => { const n = new Set(s); for (const r of selectable) { if (v) n.add(r.id); else n.delete(r.id); } return n; })} />}
                  <h2 className="text-md font-semibold">{KIND_LABEL[k]}</h2>
                  <span className="num text-sm text-fg-3">{rows.length}</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-1">
                  {rows.map((i) => {
                    const by = actors.find((a) => a.id === i.by);
                    const canSel = selectable.includes(i);
                    return (
                      <div key={i.id} className={cx('flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0', sel.has(i.id) && 'bg-info-bg/40')}>
                        <div className="w-4 pt-0.5">{canSel && <Checkbox checked={sel.has(i.id)} onChange={() => toggle(i.id)} />}</div>
                        <button type="button" onClick={() => (i.ref ? store.open(i.ref) : i.go?.())} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-base font-medium">{i.title}</span>
                            {i.status && <StatusPill status={i.status} />}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-sm text-fg-2">{i.detail}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <AreaLink id={i.area} className="text-fg-3" />
                            {by && <span className="inline-flex items-center gap-1 text-fg-3"><Avatar actor={by} size={14} />{by.name.split(' ')[0]}</span>}
                            {i.meta}
                          </div>
                        </button>
                        {i.effect && (i.effect.fed !== 0 || i.effect.ca !== 0) && (
                          <div className="hidden w-36 shrink-0 text-right text-sm sm:block">
                            <div className="num"><span className="text-fg-3">Fed </span><span className={i.effect.fed > 0 ? 'text-bad' : i.effect.fed < 0 ? 'text-ok' : ''}>{signed(i.effect.fed)}</span></div>
                            <div className="num"><span className="text-fg-3">CA </span><span className={i.effect.ca > 0 ? 'text-bad' : i.effect.ca < 0 ? 'text-ok' : ''}>{signed(i.effect.ca)}</span></div>
                          </div>
                        )}
                        <RowAction item={i} />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KindChip({ label, n, active, onClick }: { label: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm', active ? 'border-fg bg-fg text-bg' : 'border-line-2 bg-panel text-fg-2 hover:border-fg-3')}>
      {label}<span className={cx('num text-cap', active ? 'opacity-80' : 'text-fg-3')}>{n}</span>
    </button>
  );
}

function RowAction({ item }: { item: Item }) {
  const me = useMe();
  const wp = useWorkpaper();
  if (item.kind === 'change' && item.status === 'proposed' && (me.role === 'reviewer' || me.role === 'partner')) {
    const p = wp.proposals.find((x) => `adj:${x.id}` === item.id);
    if (!p || p.by === me.id || p.decisions.some((d) => d.by === me.id)) return null;
    return <Button size="sm" variant="ok" className="shrink-0" onClick={() => store.run((x) => decide(x, p.id, 'approve', ''))}>Approve</Button>;
  }
  if (item.kind === 'finding' && item.selectable && ['preparer', 'reviewer', 'partner'].includes(me.role)) {
    const f = wp.findings.find((y) => `check:${y.check.id}` === item.id);
    const fix = f?.fixes.find((y) => !y.proposal)?.def;
    if (!fix) return null;
    return <Button size="sm" className="shrink-0" onClick={() => store.open(item.ref!)}>{fix.options.length > 1 || f!.fixes.length > 1 ? 'Review options' : 'Review fix'}</Button>;
  }
  return null;
}
