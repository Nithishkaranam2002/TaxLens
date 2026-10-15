import { ArrowDown, Download, Equal, FileClock, GitCompareArrows, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type Result, proposeFix } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA, formName } from '../../engine/areas';
import { WHAT_IF_EDITS } from '../../engine/checks/engine';
import { type AnyEvent, newId } from '../../engine/events';
import { type Edit, type Summary, computeReturn, summarize } from '../../engine/recompute';
import type { Workpaper } from '../../engine/workpaper';
import { date, money, plural, signed, value } from '../format';
import { Avatar, Badge, Button, Card, Checkbox, Empty, Input, PageHead, SectionHead, Select, StatusPill, Tabs, cx } from '../kit';
import { download, outcome } from './common';
import { firmDay, firmEndOfDay } from '../../engine/time';

type Tab = 'ledger' | 'versions' | 'whatif';

export function Changes({ tab }: { tab: Tab }) {
  const wp = useWorkpaper();
  const pending = wp.proposals.filter((p) => p.status === 'proposed').length;
  return (
    <div>
      <PageHead eyebrow="Return" title="Changes" sub="Every adjustment keeps the original, who made it, why, the authority, its evidence and its exact tax effect. Compare any two versions of the return and try what-ifs without touching it." />
      <Tabs className="mb-5" value={tab} onChange={(t) => store.go({ page: 'changes', tab: t })}
        tabs={[{ id: 'ledger', label: 'Adjustments', count: wp.proposals.filter((p) => p.status !== 'withdrawn').length }, { id: 'versions', label: 'Compare versions' }, { id: 'whatif', label: 'What-ifs', count: pending || undefined }]} />
      {tab === 'ledger' && <Ledger wp={wp} />}
      {tab === 'versions' && <Versions wp={wp} />}
      {tab === 'whatif' && <WhatIfs wp={wp} />}
    </div>
  );
}

// ---------------------------------------------------------------- ledger
function useBridge(wp: Workpaper) {
  const ix = useApp((s) => s.ix)!;
  return useMemo(() => {
    if (!wp.version || !wp.summary.engine) return [];
    const approved = wp.proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
    const steps: { id: string; seq: number; title: string; before: Summary; after: Summary }[] = [];
    let edits: Edit[] = [];
    let prev = wp.summary.engine;
    for (const p of approved) {
      edits = [...edits, ...p.edits];
      const after = summarize(computeReturn(ix.packet, wp.version, edits));
      steps.push({ id: p.id, seq: p.seq, title: p.title, before: prev, after });
      prev = after;
    }
    return steps;
  }, [wp, ix]);
}

function Ledger({ wp }: { wp: Workpaper }) {
  const actors = useApp((s) => s.actors);
  const bridge = useBridge(wp);
  const [show, setShow] = useState<'active' | 'all'>('active');
  const list = wp.proposals.filter((p) => show === 'all' || p.status === 'proposed' || p.status === 'approved').sort((a, b) => a.seq - b.seq);
  const e = wp.summary.engine;
  const o = wp.summary.ours;
  const exportCsv = () => {
    const head = ['seq', 'status', 'area', 'title', 'proposed_by', 'proposed_at', 'approved_by', 'approved_at', 'fed_tax_effect', 'ca_tax_effect', 'authority', 'evidence', 'reason'];
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = wp.proposals.map((p) => [p.seq, p.status, p.area, q(p.title), actors.find((a) => a.id === p.by)?.name ?? p.by, p.at, q(p.decisions.filter((d) => d.decision === 'approve').map((d) => actors.find((a) => a.id === d.by)?.name).join('; ')), p.approvedAt ?? '', p.effect.fedTax, p.effect.caTax, q(p.authority), q(p.evidence.join(' ')), q(p.reason)].join(','));
    download('taxlens-adjustments.csv', [head.join(','), ...rows].join('\n'), 'text/csv');
  };
  if (!e || !o) return <Empty icon={<FileClock />} title="No return yet">The first engine run is on March 4, 2026.</Empty>;
  return (
    <div className="space-y-6">
      <section>
        <SectionHead title="From the engine to our return" sub="Each approved change, in the order it was approved, recomputed on top of the ones before it. The steps add up exactly." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BridgeCard title="Federal total tax" start={e.federal.totalTax} end={o.federal.totalTax} steps={bridge.map((s) => ({ ...s, d: s.after.federal.totalTax - s.before.federal.totalTax }))} k="F1040.24" foot={`Balance: ${outcome(e.federal).kind === 'refund' ? 'refund' : 'due'} ${money(outcome(e.federal).amount)} → ${outcome(o.federal).kind === 'refund' ? 'refund' : 'due'} ${money(outcome(o.federal).amount)}`} />
          <BridgeCard title="California total tax" start={e.california.totalTax} end={o.california.totalTax} steps={bridge.map((s) => ({ ...s, d: s.after.california.totalTax - s.before.california.totalTax }))} k="F540NR.64" foot={`Balance: ${outcome(e.california).kind === 'refund' ? 'refund' : 'due'} ${money(outcome(e.california).amount)} → ${outcome(o.california).kind === 'refund' ? 'refund' : 'due'} ${money(outcome(o.california).amount)}`} />
        </div>
      </section>

      <section>
        <SectionHead title="Adjustment ledger" sub="Effects shown are recomputed when proposed. Nothing is deleted: rejected and withdrawn changes stay in the record."
          right={<><Select value={show} onChange={(v) => setShow(v as 'active' | 'all')} options={[{ id: 'active', label: 'Proposed and approved' }, { id: 'all', label: 'Include rejected and withdrawn' }]} className="w-56" /><Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>CSV</Button></>} />
        {list.length === 0 ? <Empty icon={<GitCompareArrows />} title="No changes yet" action={<Button size="sm" onClick={() => store.go({ page: 'inbox' })}>Open items</Button>}>Propose a correction from a check, or open any number and propose a change to it.</Empty> : (
          <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
            <table className="w-full min-w-[820px] border-collapse text-base">
              <thead>
                <tr className="text-cap text-fg-3">
                  {['#', 'Change', 'Area', 'Proposed', 'Approved', 'Federal', 'California', 'Status'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i >= 5 && i <= 6 ? 'text-right' : 'text-left')}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const by = actors.find((a) => a.id === p.by);
                  const appr = p.decisions.filter((d) => d.decision === 'approve').map((d) => actors.find((a) => a.id === d.by));
                  return (
                    <tr key={p.id} onClick={() => store.open(`adj:${p.id}`)} className={cx('cursor-pointer align-top hover:bg-panel-2', (p.status === 'rejected' || p.status === 'withdrawn') && 'opacity-60')}>
                      <td className="mono border-b border-line px-4 py-2.5 text-sm text-fg-3">{p.seq}</td>
                      <td className="border-b border-line px-4 py-2.5"><div className="font-medium">{p.title}</div><div className="line-clamp-1 text-sm text-fg-3">{p.authority}</div></td>
                      <td className="border-b border-line px-4 py-2.5 text-sm text-fg-2">{AREA[p.area].short}</td>
                      <td className="border-b border-line px-4 py-2.5 text-sm whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Avatar actor={by} size={16} />{date(p.at, false)}</span></td>
                      <td className="border-b border-line px-4 py-2.5 text-sm whitespace-nowrap">{appr.length ? <span className="inline-flex items-center gap-1">{appr.map((a, i) => <Avatar key={i} actor={a} size={16} />)}{p.approvedAt && <span className="ml-1">{date(p.approvedAt, false)}</span>}</span> : p.needsPartner ? <span className="text-sm text-fg-3">reviewer + partner</span> : <span className="text-sm text-fg-3">reviewer</span>}</td>
                      <td className="num border-b border-line px-4 py-2.5 text-right">{p.fix?.kind === 'data' ? <span className="text-fg-3">data</span> : <span className={p.effect.fedTax > 0 ? 'text-bad' : p.effect.fedTax < 0 ? 'text-ok' : 'text-fg-3'}>{signed(p.effect.fedTax)}</span>}</td>
                      <td className="num border-b border-line px-4 py-2.5 text-right">{p.fix?.kind === 'data' ? '' : <span className={p.effect.caTax > 0 ? 'text-bad' : p.effect.caTax < 0 ? 'text-ok' : 'text-fg-3'}>{signed(p.effect.caTax)}</span>}</td>
                      <td className="border-b border-line px-4 py-2.5"><StatusPill status={p.status} />{p.needsPartner && p.status === 'proposed' && <div className="mt-1"><Badge tone="violet">partner</Badge></div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BridgeCard({ title, start, end, steps, k, foot }: { title: string; start: number; end: number; steps: { id: string; seq: number; title: string; d: number }[]; k: string; foot: string }) {
  const nonzero = steps.filter((s) => s.d !== 0);
  const zero = steps.length - nonzero.length;
  const max = Math.max(1, ...nonzero.map((s) => Math.abs(s.d)));
  return (
    <Card pad={false}>
      <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5"><span className="text-base font-semibold">{title}</span><span className="text-sm text-fg-3">{foot}</span></div>
      <div className="px-4 py-2">
        <Row label="Engine as delivered" v={money(start)} strong />
        {nonzero.map((s) => (
          <button key={s.id} type="button" onClick={() => store.open(`adj:${s.id}`)} className="flex w-full items-center gap-3 py-1 text-left text-sm hover:bg-panel-2">
            <span className="mono w-5 shrink-0 text-cap text-fg-3">{s.seq}</span>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-sunk sm:block"><span className={cx('block h-full rounded-full', s.d > 0 ? 'bg-bad' : 'bg-ok')} style={{ width: `${(Math.abs(s.d) / max) * 100}%` }} /></span>
            <span className={cx('num w-16 text-right', s.d > 0 ? 'text-bad' : 'text-ok')}>{signed(s.d)}</span>
          </button>
        ))}
        {zero > 0 && <div className="py-1 text-sm text-fg-3">{plural(zero, 'other change')} with no effect on this total</div>}
        <div className="mt-1 border-t border-line pt-1"><Row label="Ours" v={<button type="button" className="num proof" onClick={() => store.open(k)}>{money(end)}</button>} strong delta={end - start} /></div>
      </div>
    </Card>
  );
}

function Row({ label, v, strong, delta }: { label: string; v: React.ReactNode; strong?: boolean; delta?: number }) {
  return (
    <div className={cx('flex items-center justify-between py-1 text-base', strong && 'font-semibold')}>
      <span>{label}</span>
      <span className="flex items-center gap-3">{delta !== undefined && delta !== 0 && <span className={cx('num text-sm font-medium', delta > 0 ? 'text-bad' : 'text-ok')}>{signed(delta)}</span>}<span className="num">{v}</span></span>
    </div>
  );
}

// ---------------------------------------------------------------- versions
type ColId = 'py' | 'v1' | 'v2' | 'v3' | 'ours' | 'projected' | 'filed' | 'date';

function Versions({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const events = useApp((s) => s.events);
  const [a, setA] = useState<ColId>('v3');
  const [b, setB] = useState<ColId>('ours');
  const [asOf, setAsOf] = useState('2026-04-09');
  const [only, setOnly] = useState(true);
  const [lots, setLots] = useState(false);
  const [q, setQ] = useState('');
  const opts: { id: ColId; label: string }[] = [
    { id: 'py', label: '2024 as filed' },
    ...ix.versionOrder.filter((v) => ix.versions.get(v)!.computed_at <= wp.asOf).map((v) => ({ id: v as ColId, label: `Engine ${v} (${date(ix.versions.get(v)!.computed_at, false)})` })),
    { id: 'ours', label: 'Ours now' },
    { id: 'projected', label: 'Ours + pending changes' },
    { id: 'date', label: 'Ours on a date…' },
    ...(wp.state.frozen ? [{ id: 'filed' as ColId, label: `As filed (${date(wp.state.frozen.at, false)})` }] : []),
  ];
  const dateWp = useMemo(() => (a === 'date' || b === 'date' ? store.workpaperAt(firmEndOfDay(asOf)) : null), [a, b, asOf, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const col = (id: ColId): Map<string, number | string> => {
    switch (id) {
      case 'py': {
        const m = new Map<string, number | string>();
        for (const [k, v] of Object.entries(ix.packet.prior_years.return_2024.lines)) m.set(/^CA540\.(13|17|19|64|71|72)$/.test(k) ? k.replace('CA540', 'F540NR') : k, v);
        return m;
      }
      case 'v1': case 'v2': case 'v3': return new Map(ix.versions.get(id)!.lines.map((l) => [l.key, l.value]));
      case 'ours': return wp.ours?.values ?? new Map();
      case 'projected': return wp.projected?.values ?? new Map();
      case 'filed': return new Map(Object.entries(wp.state.frozen?.values ?? {}));
      case 'date': return dateWp?.ours?.values ?? new Map();
    }
  };
  const A = col(a);
  const B = col(b);
  const order = new Map((wp.version ?? ix.versions.get('v3')!).lines.map((l, i) => [l.key, i]));
  const label = (k: string) => wp.ours?.labels.get(k) ?? ix.versions.get('v3')!.lines.find((l) => l.key === k)?.label ?? ix.packet.prior_years.return_2024.line_labels[k] ?? k;
  const keys = [...new Set([...A.keys(), ...B.keys()])]
    .filter((k) => lots || !/^F8949\.[A-L]\.(?!total$)/.test(k))
    .filter((k) => !only || A.get(k) !== B.get(k))
    .filter((k) => !q.trim() || `${k} ${label(k)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((x, y) => (order.get(x) ?? 9999) - (order.get(y) ?? 9999) || x.localeCompare(y));
  const name = (id: ColId) => (id === 'date' ? `Ours on ${date(asOf)}` : opts.find((o) => o.id === id)?.label ?? id);
  const engineChanges = b.startsWith('v') && a.startsWith('v') ? ix.versions.get(b)! : null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-fg-2">Compare<Select className="mt-1 w-60" value={a} onChange={(v) => setA(v as ColId)} options={opts} /></label>
        <GitCompareArrows className="mb-2 size-4 text-fg-3" />
        <label className="text-sm text-fg-2">with<Select className="mt-1 w-60" value={b} onChange={(v) => setB(v as ColId)} options={opts} /></label>
        {(a === 'date' || b === 'date') && <label className="text-sm text-fg-2">Date<Input type="date" className="mt-1 w-40" value={asOf} min="2026-03-04" max={firmDay(wp.asOf)} onChange={(e) => setAsOf(e.target.value)} /></label>}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Checkbox checked={only} onChange={setOnly} label="Only differences" />
          <Checkbox checked={lots} onChange={setLots} label="Include sales lots" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter lines" className="w-44" aria-label="Filter lines" />
        </div>
      </Card>
      {engineChanges && <p className="text-sm text-fg-2"><span className="font-medium">Engine {engineChanges.version}:</span> {engineChanges.trigger}</p>}
      <p className="text-sm text-fg-3">{plural(keys.length, 'line')} {only ? 'differ' : 'shown'}.</p>
      {keys.length === 0 ? <Empty icon={<Equal />} tone="ok" title="No differences">These two versions agree on every line.</Empty> : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[720px] border-collapse text-base">
            <thead>
              <tr className="text-cap text-fg-3">
                <th className="sticky top-0 border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Line</th>
                <th className="sticky top-0 border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">{name(a)}</th>
                <th className="sticky top-0 border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">{name(b)}</th>
                <th className="sticky top-0 border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {keys.slice(0, 800).map((k) => {
                const x = A.get(k);
                const y = B.get(k);
                const d = typeof x === 'number' && typeof y === 'number' ? y - x : null;
                return (
                  <tr key={k} className="hover:bg-panel-2">
                    <td className="border-b border-line px-3 py-1.5"><button type="button" onClick={() => store.open(k)} className="text-left hover:underline">{label(k)}</button><span className="mono ml-2 text-cap text-fg-3">{k}</span><span className="ml-2 text-cap text-fg-3">{formName(k)}</span></td>
                    <td className="num border-b border-line px-3 py-1.5 text-right text-fg-2">{x === undefined ? '—' : value(x, k)}</td>
                    <td className="num border-b border-line px-3 py-1.5 text-right font-medium">{y === undefined ? '—' : value(y, k)}</td>
                    <td className={cx('num border-b border-line px-3 py-1.5 text-right', d === null ? 'text-fg-3' : d > 0 ? 'text-bad' : d < 0 ? 'text-ok' : 'text-fg-3')}>{d === null ? (x === y ? '' : x === undefined ? 'added' : y === undefined ? 'removed' : 'changed') : Math.abs(d) < 1 && d !== 0 ? d.toFixed(4) : signed(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {keys.length > 800 && <div className="px-3 py-2 text-sm text-fg-3">Showing 800 of {keys.length}. Narrow with the filter.</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- what-ifs
function WhatIfs({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const alts = ix.packet.what_if.alternatives;
  const approvedEdits = useMemo(() => wp.proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '')).flatMap((p) => p.edits), [wp]);
  const engineRows = useMemo(() => {
    if (!wp.version) return [];
    return alts.map((alt) => {
      const base = ix.versions.get(alt.base_version)!;
      const edits = WHAT_IF_EDITS[alt.id] ?? [];
      const b0 = summarize(computeReturn(ix.packet, base));
      const b1 = summarize(computeReturn(ix.packet, base, edits));
      const ours = wp.summary.ours!;
      const oursAlt = summarize(computeReturn(ix.packet, wp.version!, [...approvedEdits, ...edits]));
      return {
        alt, ok: b1.federal.totalTax - b0.federal.totalTax === alt.federal.total_tax_change && b1.california.totalTax - b0.california.totalTax === alt.california.total_tax_change && b1.federal.penalty - b0.federal.penalty === alt.federal.penalty_change,
        ours: { fed: oursAlt.federal.totalTax - ours.federal.totalTax, ca: oursAlt.california.totalTax - ours.california.totalTax, pen: oursAlt.federal.penalty - ours.federal.penalty },
      };
    });
  }, [alts, ix, wp, approvedEdits]);

  // Scenario: which corrections are applied, starting from our return.
  const available = [...wp.fixes.values()].filter((f) => f.kind !== 'data' && f.requiresDocs.every((d) => ix.received(d, wp.asOf)));
  const statusOf = (id: string) => wp.proposals.find((p) => p.source.kind === 'fix' && p.source.fixId === id && (p.status === 'approved' || p.status === 'proposed'));
  const initial = () => new Map(available.map((f) => { const p = statusOf(f.id); return [f.id, p?.status === 'approved' && p.source.kind === 'fix' ? p.source.option : null] as [string, string | null]; }));
  const [chosen, setChosen] = useState<Map<string, string | null>>(initial);
  const manualEdits = useMemo(() => wp.proposals.filter((p) => p.status === 'approved' && p.source.kind === 'manual').flatMap((p) => p.edits), [wp]);
  const scenario = useMemo(() => {
    if (!wp.version) return null;
    const edits: Edit[] = [...manualEdits];
    for (const f of available) { const o = chosen.get(f.id); if (o) edits.push(...(f.options.find((x) => x.id === o)?.edits ?? [])); }
    return summarize(computeReturn(ix.packet, wp.version, edits));
  }, [chosen, wp, ix, manualEdits]); // eslint-disable-line react-hooks/exhaustive-deps
  const ours = wp.summary.ours;
  const toPropose = available.filter((f) => chosen.get(f.id) && !statusOf(f.id));
  const proposeAll = () => {
    const batch = newId('b_');
    store.run((x) => {
      const evs: AnyEvent[] = [];
      let refused: Result | null = null;
      for (const f of toPropose) { const r = proposeFix(x, f.id, chosen.get(f.id)!, undefined, batch); if (r.ok) evs.push(...r.events); else refused = refused ?? r; }
      if (!evs.length) return refused ?? { ok: false, rule: 'Nothing to propose.' };
      return { ok: true, events: evs, message: `${plural(evs.length, 'change')} proposed from the scenario. One undo reverses them all.` };
    });
  };

  if (!wp.version || !ours || !scenario) return <Empty icon={<FileClock />} title="No return yet">The first engine run is on March 4, 2026.</Empty>;
  return (
    <div className="space-y-6">
      <section>
        <SectionHead title="Engine what-ifs" sub="The engine's own alternatives. TaxLens reproduces each one exactly, then reruns it on our corrected return, where the answer can differ." />
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[760px] border-collapse text-base">
            <thead>
              <tr className="text-cap text-fg-3">
                <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Alternative</th>
                <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">Engine: federal / CA</th>
                <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Recompute</th>
                <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">On our return: federal / CA</th>
              </tr>
            </thead>
            <tbody>
              {engineRows.map(({ alt, ok, ours: o }) => (
                <tr key={alt.id} className="align-top">
                  <td className="border-b border-line px-4 py-2.5"><div className="font-medium">{alt.description}</div><div className="mono text-cap text-fg-3">{alt.id} · on {alt.base_version}</div></td>
                  <td className="num border-b border-line px-4 py-2.5 text-right">{signed(alt.federal.total_tax_change)} / {signed(alt.california.total_tax_change)}{alt.federal.penalty_change ? <div className="text-sm text-fg-3">penalty {signed(alt.federal.penalty_change)}</div> : null}</td>
                  <td className="border-b border-line px-4 py-2.5">{ok ? <Badge tone="ok">Matches exactly</Badge> : <Badge tone="bad">Differs</Badge>}</td>
                  <td className="num border-b border-line px-4 py-2.5 text-right font-medium">{signed(o.fed)} / {signed(o.ca)}{o.pen ? <div className="text-sm font-normal text-fg-3">penalty {signed(o.pen)}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHead title="Scenario" sub="Turn corrections on or off, or pick another option, and see the whole return recomputed instantly. Nothing is saved until you propose."
          right={<><Button size="sm" variant="ghost" onClick={() => setChosen(new Map(available.map((f) => [f.id, f.options[f.recommended].id])))}>Every recommended correction</Button><Button size="sm" variant="ghost" onClick={() => setChosen(initial())}>Reset to our return</Button>{toPropose.length > 0 && ['preparer', 'reviewer', 'partner'].includes(me.role) && <Button size="sm" variant="primary" icon={<Wand2 className="size-3.5" />} onClick={proposeAll}>Propose {plural(toPropose.length, 'change')}</Button>}</>} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card pad={false}>
            <ul className="divide-y divide-line">
              {available.map((f) => {
                const o = chosen.get(f.id) ?? null;
                const st = statusOf(f.id);
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Checkbox checked={!!o} onChange={(v) => setChosen((m) => new Map(m).set(f.id, v ? f.options[f.recommended].id : null))} />
                    <button type="button" onClick={() => store.open(`check:${f.checkId}`)} className="min-w-0 flex-1 text-left">
                      <div className="text-base font-medium">{f.title}</div>
                      <div className="text-sm text-fg-3">{AREA[f.area].short}{f.kind === 'election' ? ' · election' : ''}{f.certainty === 'judgment' ? ' · judgment' : ''}</div>
                    </button>
                    {f.options.length > 1 && o && (
                      <Select className="w-48" value={o} onChange={(v) => setChosen((m) => new Map(m).set(f.id, v))} options={f.options.map((x) => ({ id: x.id, label: x.label }))} />
                    )}
                    {st && <StatusPill status={st.status} />}
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className="space-y-3 lg:sticky lg:top-[64px] lg:self-start">
            <ScenarioResult title="Federal" ours={ours.federal} sc={scenario.federal} />
            <ScenarioResult title="California" ours={ours.california} sc={scenario.california} />
            <p className="text-sm text-fg-3">Compared with our return as it stands ({plural(wp.proposals.filter((p) => p.status === 'approved').length, 'approved change')}). Pending proposals are not included unless you tick them.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScenarioResult({ title, ours, sc }: { title: string; ours: Summary['federal'] | Summary['california']; sc: Summary['federal'] | Summary['california'] }) {
  const o = outcome(ours);
  const s = outcome(sc);
  const d = sc.totalTax - ours.totalTax;
  return (
    <Card>
      <div className="eyebrow">{title}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-sm text-fg-2">Total tax</span>
        <span className="num text-lg font-semibold">{money(sc.totalTax)}</span>
      </div>
      <div className="flex items-baseline justify-between text-sm"><span className="text-fg-3">vs ours {money(ours.totalTax)}</span><span className={cx('num font-medium', d > 0 ? 'text-bad' : d < 0 ? 'text-ok' : 'text-fg-3')}>{signed(d)}</span></div>
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-sm">
        <span className="text-fg-3">{o.kind === 'refund' ? 'Refund' : 'Due'} {money(o.amount)}</span>
        <ArrowDown className="size-3 -rotate-90 text-fg-3" />
        <span className="font-medium">{s.kind === 'refund' ? 'Refund' : 'Due'} {money(s.amount)}</span>
      </div>
    </Card>
  );
}
