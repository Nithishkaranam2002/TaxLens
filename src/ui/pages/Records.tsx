import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, FileClock, PackageOpen, Printer, Search } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { store, useApp, useWorkpaper } from '../../app/store';
import { AREA, AREAS } from '../../engine/areas';
import { outsideFilings } from '../../engine/checks/completeness';
import { BOX_LABEL, BOX_TO_SCHD, holdingTerm, lotGain } from '../../engine/recompute/lots';
import type { Lot } from '../../engine/recompute';
import type { Workpaper } from '../../engine/workpaper';
import { date, hours, money, plural, signed, value } from '../format';
import { Badge, Button, Card, Empty, Input, PageHead, SectionHead, Select, StatusPill, cx } from '../kit';
import { RefChip } from '../Ref';
import { EvidenceTableView } from '../drawer/CheckProof';
import { LineRows, SignDots, num, useFirstRun } from './common';

// Embedded previews (inside another page's frame) cannot open the print dialog.
const canPrint = (() => { try { return window.self === window.top; } catch { return false; } })();

const TABS: { id: string; label: string; group: string }[] = [
  { id: 'summary', label: 'Return summary vs last year', group: 'The return' },
  { id: 'computation', label: 'Tax computation', group: 'The return' },
  { id: 'areas', label: 'Area summaries', group: 'The return' },
  { id: 'index', label: 'Document index', group: 'The return' },
  { id: 'sales', label: 'Sales detail', group: 'Income' },
  { id: 'bookstotax', label: 'Books to tax', group: 'Income' },
  { id: 'rentals', label: 'Rentals and passive losses', group: 'Income' },
  { id: 'k1', label: 'K-1 lines', group: 'Income' },
  { id: 'retirement', label: 'Retirement and foreign', group: 'Income' },
  { id: 'depreciation', label: 'Depreciation by asset', group: 'Schedules' },
  { id: 'deductions', label: 'Deductions and credits with limits', group: 'Schedules' },
  { id: 'payments', label: 'Payments', group: 'Schedules' },
  { id: 'state', label: 'State split', group: 'Schedules' },
  { id: 'carryovers', label: 'Carryovers', group: 'Across years' },
  { id: 'basis', label: 'Basis by year', group: 'Across years' },
  { id: 'prior', label: 'Prior preparer vs us', group: 'Across years' },
];

export function Records({ tab }: { tab?: string }) {
  const firstRun = useFirstRun();
  const wp = useWorkpaper();
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  const groups = [...new Set(TABS.map((x) => x.group))];
  return (
    <div>
      <PageHead eyebrow="Return" title="Records" sub="The schedules a CPA expects in a workpaper, each built live from the same data as the return. Every number opens its proof." right={canPrint ? <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>Print</Button> : undefined} />
      <div className="grid grid-cols-1 gap-6 min-[1360px]:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="no-print space-y-4 min-[1360px]:sticky min-[1360px]:top-[64px] min-[1360px]:self-start">
          <div className="min-[1360px]:hidden"><Select value={t.id} onChange={(v) => store.go({ page: 'records', tab: v })} options={TABS.map((x) => ({ id: x.id, label: x.label }))} /></div>
          {groups.map((g) => (
            <div key={g} className="hidden min-[1360px]:block">
              <div className="eyebrow mb-1 px-2">{g}</div>
              {TABS.filter((x) => x.group === g).map((x) => (
                <button key={x.id} type="button" onClick={() => store.go({ page: 'records', tab: x.id })} className={cx('block w-full rounded-md px-2 py-1.5 text-left text-base', x.id === t.id ? 'bg-panel font-medium shadow-1' : 'text-fg-2 hover:bg-sunk')}>{x.label}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <h2 className="mb-1 text-lg font-semibold">{t.label}</h2>
          {!wp.ours ? <Empty icon={<FileClock />} title="No return yet">The first engine run is on {firstRun}. Move the season clock forward to see this record.</Empty> : <Body id={t.id} wp={wp} />}
        </div>
      </div>
    </div>
  );
}

function Body({ id, wp }: { id: string; wp: Workpaper }) {
  switch (id) {
    case 'summary': return <Summary wp={wp} />;
    case 'computation': return <Computation wp={wp} />;
    case 'areas': return <AreaSummaries wp={wp} />;
    case 'index': return <DocIndex wp={wp} />;
    case 'sales': return <Sales wp={wp} />;
    case 'bookstotax': return <BooksToTax wp={wp} />;
    case 'rentals': return <Rentals wp={wp} />;
    case 'k1': return <K1 wp={wp} />;
    case 'retirement': return <Retirement wp={wp} />;
    case 'depreciation': return <Depreciation wp={wp} />;
    case 'deductions': return <Deductions wp={wp} />;
    case 'payments': return <Payments wp={wp} />;
    case 'state': return <StateSplit wp={wp} />;
    case 'carryovers': return <Carryovers wp={wp} />;
    case 'basis': return <Basis wp={wp} />;
    case 'prior': return <Prior wp={wp} />;
  }
  return null;
}

const Lede = ({ children }: { children: ReactNode }) => <p className="mb-4 max-w-[80ch] text-base text-fg-2">{children}</p>;
const Block = ({ title, sub, children, right }: { title: string; sub?: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <section className="mb-6"><SectionHead title={title} sub={sub} right={right} />{children}</section>
);

function CheckTables({ id, title }: { id: string; title?: string }) {
  const wp = useWorkpaper();
  const c = wp.checks.find((x) => x.id === id);
  if (!c) return null;
  const f = wp.findings.find((x) => x.check.id === id);
  return (
    <Block title={title ?? c.title} sub={c.summary} right={<><StatusPill status={f?.status ?? c.status} /><Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => store.open(`check:${id}`)}>Open check</Button></>}>
      <div className="space-y-3">{c.tables.filter((t) => t.rows.length).map((t, i) => <EvidenceTableView key={i} t={t} />)}</div>
    </Block>
  );
}

// ------------------------------------------------------------- the return
function Summary({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const py = ix.packet.prior_years.return_2024;
  const prior = { ...py.lines, 'F540NR.13': py.lines['CA540.13'], 'F540NR.17': py.lines['CA540.17'], 'F540NR.19': py.lines['CA540.19'], 'F540NR.64': py.lines['CA540.64'], 'F540NR.71': py.lines['CA540.71'], 'F540NR.72': py.lines['CA540.72'] } as Record<string, number | string>;
  const flagged = wp.variances.filter((v) => v.flagged);
  return (
    <>
      <Lede>2024 as filed by {py.prepared_by} (filed {py.filed}, {py.residency}), the engine's current run and ours. {flagged.length} lines moved by more than the firm's threshold; each needs an explanation (Review → Variances), {flagged.filter((v) => v.explanation).length} done.</Lede>
      <Block title="Federal">
        <LineRows wp={wp} prior={prior} emphasize={['F1040.11', 'F1040.15', 'F1040.24', 'F1040.33']} keys={['F1040.1a', 'F1040.2b', 'F1040.3b', 'F1040.4b', 'F1040.7', 'F1040.8', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.17', 'F1040.19', 'F1040.20', 'F1040.23', 'F1040.24', 'F1040.25d', 'F1040.26', 'F1040.31', 'F1040.33', 'F1040.38']} />
      </Block>
      <Block title="California" sub="2024 was a full-year resident Form 540; 2025 is a part-year Form 540NR. Matching lines are aligned.">
        <LineRows wp={wp} prior={prior} emphasize={['F540NR.64']} keys={['F540NR.13', 'F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.32', 'F540NR.34', 'F540NR.37', 'F540NR.64', 'F540NR.71', 'F540NR.72', 'F540NR.78']} />
      </Block>
      <Block title="Related returns" sub="Returns that touch this one but are filed by someone else. What reaches this return comes through the documents linked here.">
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {ix.packet.household.related_returns.map((r) => {
              const refs = r.who.startsWith('Ada') ? ['household:ada', 'F8812.6'] : r.who.includes('Woodworks') ? ['D39', 'D40', 'F7203.15'] : ['D37', 'D38', 'SchE.28B'];
              return (
                <li key={r.who} className="flex flex-wrap items-start gap-3 px-4 py-2.5 text-base">
                  <div className="min-w-0 flex-1"><div className="font-medium">{r.who}</div><div className="text-sm text-fg-2">{r.return}</div><div className="text-sm text-fg-3">Prepared by {r.prepared_by} · in this packet: {r.in_this_packet === false ? 'no' : String(r.in_this_packet)}</div></div>
                  <div className="flex flex-wrap gap-1">{refs.map((x) => <RefChip key={x} r={x} />)}</div>
                </li>
              );
            })}
          </ul>
        </Card>
      </Block>
    </>
  );
}

function Computation({ wp }: { wp: Workpaper }) {
  const groups: [string, string[], string?][] = [
    ['Income to taxable income', ['F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.14', 'F1040.15']],
    ['Regular tax', ['SchD.16', 'SchD.19', 'F1040.16'], 'Schedule D tax worksheet: qualified dividends and long-term gains at 0/15/20%, unrecaptured §1250 gain at no more than 25%, the rest at ordinary rates.'],
    ['Alternative minimum tax (Form 6251)', ['F6251.1', 'F6251.2a', 'F6251.2i', 'F6251.4', 'F6251.5', 'F6251.6', 'F6251.7', 'F6251.9', 'F6251.10', 'F6251.11'], 'The ISO exercise (40,000 spread) and the SALT add-back drive AMT this year. The exclusion-item part becomes a minimum tax credit carried to 2026.'],
    ['Credits', ['F8812.1', 'F8812.8', 'F8812.11', 'F8812.12', 'F1040.19', 'Sch3.1', 'F1040.20', 'F1040.22']],
    ['Other taxes', ['SchSE.12', 'F8959.18', 'F8960.17', 'Sch2.21', 'F1040.23']],
    ['Total tax, payments and result', ['F1040.24', 'F1040.25d', 'F1040.26', 'F1040.31', 'F1040.33', 'F1040.34', 'F1040.37', 'F1040.38']],
  ];
  const ca = ['F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'F540NR.40', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64', 'F540NR.78', 'F540NR.97', 'FTB5805.penalty'];
  return (
    <>
      <Lede>From total income to the amount due or refunded, every step a line you can open. The engine's arithmetic is re-footed and recomputed independently (Checks → Engine).</Lede>
      {groups.map(([t, keys, note]) => (
        <Block key={t} title={t} sub={note}><LineRows wp={wp} dense keys={keys.filter((k) => wp.ours!.values.has(k) || wp.base!.values.has(k))} emphasize={['F1040.15', 'F1040.16', 'F6251.11', 'F1040.24']} /></Block>
      ))}
      <Block title="California (540NR)" sub="Tax on all income at the California rate, times the share of income that is California's."><LineRows wp={wp} dense keys={ca.filter((k) => wp.ours!.values.has(k))} emphasize={['F540NR.36', 'F540NR.64']} /></Block>
    </>
  );
}

function AreaSummaries({ wp }: { wp: Workpaper }) {
  return (
    <>
      <Lede>One row per area: what it contains, what the checks found, what changed and who has signed.</Lede>
      <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
        <table className="w-full min-w-[820px] border-collapse text-base">
          <thead><tr className="text-cap text-fg-3">{['Area', 'Lines', 'Documents', 'Checks', 'Changes approved', 'Open', 'Sign-offs', 'Time'].map((h) => <th key={h} className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {wp.areas.map((a) => {
              const checks = wp.checks.filter((c) => c.area === a.id);
              const appr = wp.proposals.filter((p) => p.area === a.id && p.status === 'approved');
              return (
                <tr key={a.id} className="cursor-pointer hover:bg-panel-2" onClick={() => store.go({ page: 'area', id: a.id })}>
                  <td className="border-b border-line px-4 py-2.5 font-medium">{AREA[a.id].name}</td>
                  <td className="num border-b border-line px-4 py-2.5">{a.lines.length}</td>
                  <td className="num border-b border-line px-4 py-2.5">{a.docs.length}</td>
                  <td className="border-b border-line px-4 py-2.5 text-sm">{checks.filter((c) => c.status === 'pass').length}/{checks.length} pass</td>
                  <td className="border-b border-line px-4 py-2.5 text-sm">{appr.length}{appr.length ? <span className="num text-fg-3"> · fed {signed(appr.reduce((s, p) => s + p.effect.fedTax, 0))}</span> : ''}</td>
                  <td className="border-b border-line px-4 py-2.5 text-sm">{a.findingsOpen + a.proposalsPending + a.notesOpen || <span className="text-fg-3">—</span>}</td>
                  <td className="border-b border-line px-4 py-2.5"><SignDots a={a} size="sm" /></td>
                  <td className="num border-b border-line px-4 py-2.5 text-sm">{hours(a.minutes)}{a.budgetHours ? ` / ${a.budgetHours}` : ''} h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DocIndex({ wp }: { wp: Workpaper }) {
  return (
    <>
      <Lede>Every document by area, with what happened to it. The Documents page has filters and the page viewer.</Lede>
      {AREAS.map((a) => {
        const docs = wp.docs.filter((d) => d.area === a.id);
        if (!docs.length) return null;
        return (
          <Block key={a.id} title={a.name}>
            <Card pad={false}>
              <ul className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.doc.id} className="flex items-start gap-3 px-3 py-2 text-base">
                    <span className="mono mt-0.5 w-8 shrink-0 text-cap text-fg-3">{d.doc.id}</span>
                    <button type="button" disabled={!d.received} onClick={() => store.open(`doc:${d.doc.id}#page1`)} className="min-w-0 flex-1 text-left enabled:hover:underline">{d.doc.title}<span className="block text-sm text-fg-3">{d.reason}</span></button>
                    <span className="hidden text-sm text-fg-3 sm:block">{date(d.doc.received_at)}</span>
                    <StatusPill status={d.disposition} />
                  </li>
                ))}
              </ul>
            </Card>
          </Block>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------- income
function Sales({ wp }: { wp: Workpaper }) {
  const lots = wp.ours!.lots;
  const baseLots = useMemo(() => new Map((wp.base?.lots ?? []).map((l) => [l.id, l])), [wp.base]);
  const [box, setBox] = useState('all');
  const [q, setQ] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const changed = (l: Lot) => { const b = baseLots.get(l.id); return !b || b.basis !== l.basis || b.proceeds !== l.proceeds || b.adj !== l.adj || b.acquired !== l.acquired || b.box !== l.box; };
  const rows = lots.filter((l) => (box === 'all' || l.box === box) && (!onlyChanged || changed(l)) && (!q.trim() || `${l.id} ${l.desc}`.toLowerCase().includes(q.trim().toLowerCase())));
  const boxes = [...new Set(lots.map((l) => l.box))].sort();
  const totals = boxes.map((b) => {
    const ls = lots.filter((l) => l.box === b);
    return { b, n: ls.length, proceeds: ls.reduce((s, l) => s + l.proceeds, 0), basis: ls.reduce((s, l) => s + l.basis, 0), adj: ls.reduce((s, l) => s + l.adj, 0), gain: ls.reduce((s, l) => s + lotGain(l), 0) };
  });
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 34, overscan: 12 });
  return (
    <>
      <Lede>{plural(lots.length, 'sale')} from three brokerages, Coinhaven, the S corporation distribution and the stock plan, grouped by Form 8949 box and tied to Schedule D. Lots we changed or added are marked; the engine's figure is kept beside ours.</Lede>
      <Block title="By Form 8949 box">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[760px] border-collapse text-base">
            <thead><tr className="text-cap text-fg-3">{['Box', 'Lots', 'Proceeds', 'Basis', 'Adjustments', 'Gain or loss', 'Schedule D'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i >= 1 && i <= 5 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.b} className="cursor-pointer hover:bg-panel-2" onClick={() => setBox(t.b)}>
                  <td className="border-b border-line px-4 py-2.5"><span className="mono font-semibold">{t.b}</span> <span className="text-sm text-fg-3">{BOX_LABEL[t.b]}</span></td>
                  <td className="num border-b border-line px-4 py-2.5 text-right">{t.n}</td>
                  <td className="num border-b border-line px-4 py-2.5 text-right">{money(t.proceeds, { cents: true })}</td>
                  <td className="num border-b border-line px-4 py-2.5 text-right">{money(t.basis, { cents: true })}</td>
                  <td className="num border-b border-line px-4 py-2.5 text-right">{t.adj ? money(t.adj, { cents: true }) : '—'}</td>
                  <td className="num border-b border-line px-4 py-2.5 text-right font-medium"><button type="button" className="proof" onClick={(e) => { e.stopPropagation(); store.open(`F8949.${t.b}.total`); }}>{money(Math.round(t.gain))}</button></td>
                  <td className="border-b border-line px-4 py-2.5">{BOX_TO_SCHD[t.b] && <RefChip r={BOX_TO_SCHD[t.b]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <CheckTables id="CHK-BROKER-TIEOUT" title="Tie-out to the brokers' 1099-B summaries" />
      <Block title="Every lot" sub={`${rows.length} shown`} right={<>
        <Select value={box} onChange={setBox} options={[{ id: 'all', label: 'All boxes' }, ...boxes.map((b) => ({ id: b, label: `Box ${b}` }))]} className="w-32" />
        <Button size="sm" variant={onlyChanged ? 'primary' : 'secondary'} onClick={() => setOnlyChanged((x) => !x)}>Changed by us</Button>
        <div className="relative w-48"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lot or security" className="pl-8" aria-label="Find a lot" /></div>
      </>}>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[56px_1fr_90px_90px_110px_110px_100px_110px_60px] border-b border-line bg-panel-2 px-3 py-2.5 text-cap font-semibold text-fg-3">
              <span>Lot</span><span>Security</span><span>Acquired</span><span>Sold</span><span className="text-right">Proceeds</span><span className="text-right">Basis</span><span className="text-right">Adj.</span><span className="text-right">Gain</span><span className="text-right">Term</span>
            </div>
            <div ref={parent} className="max-h-[520px] overflow-y-auto scroll-thin">
              <div style={{ height: v.getTotalSize(), position: 'relative' }}>
                {v.getVirtualItems().map((it) => {
                  const l = rows[it.index];
                  const b = baseLots.get(l.id);
                  const ch = changed(l);
                  return (
                    <button key={l.id} type="button" onClick={() => store.open(`F8949.${l.box}.${l.id}`)}
                      className={cx('absolute left-0 grid w-full grid-cols-[56px_1fr_90px_90px_110px_110px_100px_110px_60px] items-center border-b border-line px-3 text-left text-sm hover:bg-panel-2', ch && 'bg-info-bg/40')}
                      style={{ top: 0, transform: `translateY(${it.start}px)`, height: it.size }}>
                      <span className="mono text-cap">{l.box}·{l.id}</span>
                      <span className="truncate pr-2">{l.desc}{l.origin === 'added' && <Badge tone="info" className="ml-1.5">added</Badge>}</span>
                      <span className="num text-fg-2">{l.acquired}</span>
                      <span className="num text-fg-2">{l.sold}</span>
                      <span className="num text-right">{money(l.proceeds, { cents: true })}</span>
                      <span className="num text-right">{b && b.basis !== l.basis ? <><span className="mr-1 text-fg-3 line-through">{money(b.basis)}</span><span className="ink-blue font-semibold">{money(l.basis, { cents: true })}</span></> : money(l.basis, { cents: true })}</span>
                      <span className="num text-right text-fg-2">{l.adjCode ? `${l.adjCode} ${money(l.adj, { cents: true })}` : ''}</span>
                      <span className={cx('num text-right font-medium', lotGain(l) < 0 && 'text-bad')}>{money(lotGain(l), { cents: true })}</span>
                      <span className="text-right text-cap text-fg-3">{/^\d{4}-\d{2}-\d{2}$/.test(l.acquired) ? holdingTerm(l.acquired, l.sold) : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Block>
      <CheckTables id="CHK-WASH-SALES" title="Wash-sale screen" />
    </>
  );
}

function BooksToTax({ wp }: { wp: Workpaper }) {
  return (
    <>
      <Lede>Lindqvist Studio's QuickBooks profit to Schedule C, every difference explained, then on to self-employment tax, the SEP and QBI.</Lede>
      <CheckTables id="CHK-BOOKS-TO-TAX" title="Books to Schedule C" />
      <CheckTables id="CHK-SCHC-RECEIPTS" title="Gross receipts to the information returns" />
      <Block title="Schedule C as filed">
        <LineRows wp={wp} dense emphasize={['SchC.31']} keys={['SchC.1', 'SchC.7', 'SchC.8', 'SchC.9', 'SchC.11', 'SchC.13', 'SchC.15', 'SchC.17', 'SchC.18', 'SchC.22', 'SchC.24a', 'SchC.24b', 'SchC.25', 'SchC.27a.1', 'SchC.27a.2', 'SchC.28', 'SchC.29', 'SchC.30', 'SchC.31'].filter((k) => wp.ours!.values.has(k))} />
      </Block>
      <Block title="On to self-employment tax, SEP and QBI">
        <LineRows wp={wp} dense keys={['SchSE.4a', 'SchSE.12', 'SchSE.13', 'Sch1.15', 'Sch1.16', 'Sch1.17', 'F8995.2.1', 'F8995.15.1']} />
      </Block>
    </>
  );
}

function Rentals({ wp }: { wp: Workpaper }) {
  const rows: [string, string][] = [['3', 'Rents received'], ['9', 'Insurance'], ['11', 'Management fees'], ['12', 'Mortgage interest'], ['14', 'Repairs'], ['16', 'Taxes'], ['18', 'Depreciation'], ['19', 'Other (HOA)'], ['20', 'Total expenses'], ['21', 'Income or loss'], ['22', 'Allowed after Form 8582']];
  const v = (k: string, w: 'base' | 'ours') => wp[w]?.values.get(k);
  return (
    <>
      <Lede>1450 Fremont Way (Sacramento, rented all year) and the Austin condo (rented nine months, sold October 15). Both are passive; the condo's sale frees its suspended losses.</Lede>
      <Block title="Schedule E by property" sub="Engine and ours side by side. Blue figures changed because of approved corrections.">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[640px] border-collapse text-base">
            <thead><tr className="text-cap text-fg-3"><th className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Line</th><th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">A · Fremont Way</th><th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">B · Austin condo</th></tr></thead>
            <tbody>
              {rows.map(([n, label]) => (
                <tr key={n} className={cx(['20', '21', '22'].includes(n) && 'font-medium')}>
                  <td className="border-b border-line px-3 py-1.5">{label} <span className="mono text-cap text-fg-3">line {n}</span></td>
                  {(['A', 'B'] as const).map((p) => {
                    const k = `SchE.${n}${p}`;
                    const b = v(k, 'base');
                    const o = v(k, 'ours');
                    return <td key={p} className="num border-b border-line px-3 py-1.5 text-right">{o === undefined && b === undefined ? '—' : <>{b !== o && b !== undefined && <span className="mr-2 text-fg-3 line-through">{value(b, k)}</span>}<button type="button" className={cx('proof', b !== o && 'ink-blue font-semibold')} onClick={() => store.open(k)}>{value(o ?? 0, k)}</button></>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <CheckTables id="CHK-PASSIVE" title="Passive losses (Form 8582)" />
      <Block title="Form 8582 and the condo sale (Form 4797)"><LineRows wp={wp} dense keys={['F8582.1a', 'F8582.1b', 'F8582.1c', 'F8582.3a', 'F8582.4', 'F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', 'F4797.25', 'SchD.19']} /></Block>
      <CheckTables id="CHK-4797" />
    </>
  );
}

function K1({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const v = wp.version!.version;
  const docs = [['D39', 'Lindqvist Family Woodworks, Inc. (Form 1120-S), Erik 20%'], ['D37', 'Ridgeline Real Estate Fund III LP (Form 1065)'], ['D38', 'Ridgeline 2025 state supplement']] as const;
  return (
    <>
      <Lede>Each K-1 box as read, and the line it landed on. The 2023 Woodworks K-1 (D40) does not land on 2025 lines; it fixes the basis roll-forward.</Lede>
      {docs.map(([d, title]) => {
        const doc = ix.docs.get(d)!;
        if (!ix.received(d, wp.asOf)) return <Block key={d} title={title}><Empty icon={<PackageOpen />} title="Not received yet">Arrives {date(doc.received_at)}.</Empty></Block>;
        const evs = ix.evsByDoc.get(d) ?? [];
        return (
          <Block key={d} title={title} right={<Button size="sm" variant="ghost" onClick={() => store.open(`doc:${d}#page1`)}>Open {d}</Button>}>
            <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
              <table className="w-full border-collapse text-base">
                <thead><tr className="text-cap text-fg-3">{['Box', 'As read', 'Lands on'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i === 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
                <tbody>
                  {evs.map((e) => {
                    const lines = ix.evUses.get(v)?.get(e.id) ?? [];
                    return (
                      <tr key={e.id}>
                        <td className="border-b border-line px-3 py-1.5"><button type="button" className="text-left hover:underline" onClick={() => store.open(`doc:${d}#page${e.page}@${e.id}`)}>{e.label}</button></td>
                        <td className="num border-b border-line px-3 py-1.5 text-right">{typeof e.value === 'number' ? (e.value < 1 && e.value > 0 ? `${Math.round(e.value * 100)}%` : money(e.value)) : String(e.value)}</td>
                        <td className="border-b border-line px-3 py-1.5"><div className="flex flex-wrap gap-1">{lines.length ? lines.map((l) => <RefChip key={l} r={l} />) : <span className="text-sm text-fg-3">Used in a check or schedule</span>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Block>
        );
      })}
    </>
  );
}

function Retirement({ wp }: { wp: Workpaper }) {
  const of = outsideFilings();
  return (
    <>
      <Lede>Backdoor Roth (Form 8606), the HSA, and the Swedish account: interest converted to dollars, Form 8938, and the filings that sit outside this return.</Lede>
      <Block title="IRA and backdoor Roth (Form 8606)"><LineRows wp={wp} dense keys={['F8606.1', 'F8606.2', 'F8606.3', 'F8606.6', 'F8606.9', 'F8606.10', 'F8606.13', 'F8606.14', 'F8606.16', 'F8606.17', 'F8606.18', 'F1040.4a', 'F1040.4b']} /></Block>
      <CheckTables id="CHK-IRA-BASIS" />
      <Block title="HSA (Form 8889)"><LineRows wp={wp} dense keys={['F8889.3', 'F8889.9', 'F8889.13', 'F8889.14a', 'F8889.15', 'F8889.16', 'Sch1.13']} /></Block>
      <Block title="Foreign account"><LineRows wp={wp} dense keys={['SchB.1.6', 'SchB.7a', 'SchB.7b', 'SchB.8', 'Sch3.1', 'F8938.1.max', 'F8938.1.ye', 'F8938.req']} /></Block>
      <CheckTables id="CHK-INTEREST-FX" title="Swedish interest in dollars" />
      <Block title="Filings outside this return" sub="Each one has an owner. Items outside the engagement are communicated to the client in writing.">
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {of.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-3 px-3 py-2 text-base">
                <Badge tone={o.status === 'required' ? 'bad' : o.status === 'confirm' ? 'warn' : 'ok'}>{o.status === 'required' ? 'Required' : o.status === 'confirm' ? 'Confirm' : 'Not needed'}</Badge>
                <div className="min-w-0 flex-1"><div className="font-medium">{o.what}</div><div className="text-sm text-fg-3">{o.why} · due {o.due} · {o.owner}</div></div>
                <div className="flex flex-wrap gap-1">{o.refs.map((r) => <RefChip key={r} r={r} />)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </Block>
    </>
  );
}

// ------------------------------------------------------------- schedules
function Depreciation({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const assets = wp.version!.assets;
  const hvac = wp.proposals.some((p) => p.status === 'approved' && p.fix?.id === 'FIX-HVAC');
  const e179 = wp.proposals.some((p) => p.status === 'approved' && p.fix?.id === 'FIX-ELECT-179');
  const caOurs = (id: string, eng: number) => { const v = wp.ours!.values.get(`FTB3885A.${id}`); return typeof v === 'number' ? v : eng; };
  const f2 = (n: number) => money(n, { cents: n % 1 !== 0 });
  return (
    <>
      <Lede>Every asset with its federal, California and AMT depreciation. California did not adopt federal special depreciation, so the studio equipment and the 2021 appliances carry different California basis.{e179 ? ' The section 179 election (approved) also applies for California up to its 25,000 limit.' : ''}</Lede>
      <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-cap text-fg-3">
              <th rowSpan={2} className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Asset</th>
              <th rowSpan={2} className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">Cost</th>
              <th colSpan={3} className="border-b border-l border-line bg-panel-2 px-3 py-1.5 text-center font-semibold">Federal</th>
              <th colSpan={3} className="border-b border-l border-line bg-panel-2 px-3 py-1.5 text-center font-semibold">California</th>
              <th colSpan={2} className="border-b border-l border-line bg-panel-2 px-3 py-1.5 text-center font-semibold">AMT</th>
            </tr>
            <tr className="text-cap text-fg-3">
              {['Prior', '2025', 'End', 'Prior', '2025', 'End', '2025', 'Diff.'].map((h, i) => <th key={i} className={cx('border-b border-line bg-panel-2 px-2 py-1.5 text-right font-semibold', (i === 0 || i === 3 || i === 6) && 'border-l')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const ca25 = caOurs(a.asset_id, a.california.depreciation_2025);
              const caChanged = Math.round(ca25) !== Math.round(a.california.depreciation_2025);
              return (
                <tr key={a.asset_id} className="align-top hover:bg-panel-2">
                  <td className="border-b border-line px-3 py-1.5"><button type="button" className="text-left hover:underline" onClick={() => store.open(`asset:${a.asset_id}`)}>{a.description}</button><div className="text-cap text-fg-3"><span className="mono">{a.asset_id}</span> · in service {a.placed_in_service} · {a.method} · {a.life_years} yr{a.disposed ? ` · sold ${a.disposed}` : ''}</div></td>
                  <td className="num border-b border-line px-3 py-1.5 text-right">{money(a.cost)}{a.land_value_not_depreciated ? <div className="text-cap text-fg-3">land {money(a.land_value_not_depreciated)}</div> : null}</td>
                  <td className="num border-b border-l border-line px-2 py-1.5 text-right text-fg-2">{f2(a.federal.prior_accumulated)}</td>
                  <td className="num border-b border-line px-2 py-1.5 text-right font-medium">{f2(a.federal.depreciation_2025)}</td>
                  <td className="num border-b border-line px-2 py-1.5 text-right text-fg-2">{f2(a.federal.accumulated_end)}</td>
                  <td className="num border-b border-l border-line px-2 py-1.5 text-right text-fg-2">{f2(a.california.prior_accumulated)}</td>
                  <td className="num border-b border-line px-2 py-1.5 text-right font-medium">{caChanged ? <><span className="mr-1 text-fg-3 line-through">{f2(a.california.depreciation_2025)}</span><span className="ink-blue">{f2(ca25)}</span></> : f2(a.california.depreciation_2025)}</td>
                  <td className="num border-b border-line px-2 py-1.5 text-right text-fg-2">{f2(a.california.prior_accumulated + ca25)}</td>
                  <td className="num border-b border-l border-line px-2 py-1.5 text-right">{f2(a.amt.depreciation_2025)}</td>
                  <td className="num border-b border-line px-2 py-1.5 text-right text-fg-3">{f2(a.amt.difference_from_regular)}</td>
                </tr>
              );
            })}
            {hvac && (
              <tr className="bg-info-bg/40 align-top">
                <td className="border-b border-line px-3 py-1.5">HVAC system replacement, 1450 Fremont Way<div className="text-cap text-fg-3">in service 2025-08-12 · SL / mid-month · 27.5 yr · added by an approved change (was expensed as a repair) <RefChip r="D47" /></div></td>
                <td className="num border-b border-line px-3 py-1.5 text-right">{money(ix.evNum('D47', 'total'))}</td>
                <td className="num border-b border-l border-line px-2 py-1.5 text-right">0</td><td className="num border-b border-line px-2 py-1.5 text-right font-medium ink-blue">150</td><td className="num border-b border-line px-2 py-1.5 text-right">150</td>
                <td className="num border-b border-l border-line px-2 py-1.5 text-right">0</td><td className="num border-b border-line px-2 py-1.5 text-right font-medium ink-blue">150</td><td className="num border-b border-line px-2 py-1.5 text-right">150</td>
                <td className="num border-b border-l border-line px-2 py-1.5 text-right">150</td><td className="num border-b border-line px-2 py-1.5 text-right">0</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-6" />
      <CheckTables id="CHK-DEPRECIATION" />
      <CheckTables id="CHK-ELECTIONS" title="Depreciation elections" />
    </>
  );
}

function Deductions({ wp }: { wp: Workpaper }) {
  const p = useApp((s) => s.ix)!.params;
  const magi = num(wp, 'F1040.11');
  const saltLimit = Math.max(p.salt_cap_floor, p.salt_cap - Math.max(0, magi - p.salt_cap_phase_start) * p.salt_cap_phase_rate);
  return (
    <>
      <Lede>Each deduction and credit with the limit that applies to this household and how close the return is to it.</Lede>
      <Block title="Limits at this income">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Limit label="State and local taxes (SALT)" used={num(wp, 'SchA.5d')} limit={saltLimit} note={`Cap ${money(p.salt_cap)} less ${Math.round(p.salt_cap_phase_rate * 100)}% of MAGI over ${money(p.salt_cap_phase_start)}, not below ${money(p.salt_cap_floor)}. Deducted: ${money(num(wp, 'SchA.5e'))}.`} k="SchA.5e" />
          <Limit label="Child tax credit and other dependents" used={num(wp, 'F8812.12')} limit={num(wp, 'F8812.8')} note={`Allowed after the phase-out: 50 for each 1,000 of AGI over ${money(p.ctc_phaseout_start)} removes ${money(num(wp, 'F8812.11'))}.`} k="F8812.12" invert />
          <Limit label="American opportunity credit" used={num(wp, 'F8863.7')} limit={num(wp, 'F8863.30')} note={`Allowed after the phase-out between ${money(p.aotc_phaseout[0])} and ${money(p.aotc_phaseout[1])} of MAGI; MAGI is ${money(magi)}.`} k="F8863.7" invert />
          <Limit label="Dependent care" used={num(wp, 'F2441.12')} limit={p.dep_care_exclusion_max} note="Employer benefits excluded up to 5,000; no credit left above that." k="F2441.12" />
          <Limit label="HSA contributions" used={num(wp, 'F8889.9') + num(wp, 'F8889.13')} limit={p.hsa_family_limit} note="Family coverage limit, employer contributions included." k="F8889.3" />
          <Limit label="QBI deduction" used={num(wp, 'F8995.27')} limit={num(wp, 'F8995.36')} note={`Limited to 20% of taxable income before QBI less net capital gain (${money(num(wp, 'F8995.36'))}).`} k="F8995.39" />
        </div>
      </Block>
      <Block title="Itemized deductions (Schedule A)"><LineRows wp={wp} dense emphasize={['SchA.17']} keys={['SchA.5a', 'SchA.5b', 'SchA.5d', 'SchA.5e', 'SchA.7', 'SchA.8a', 'SchA.8c', 'SchA.8e', 'SchA.10', 'SchA.11', 'SchA.12', 'SchA.14', 'SchA.17', 'F8283.A1.stock', 'F8283.A1.vehicle'].filter((k) => wp.ours!.values.has(k) || wp.base!.values.has(k))} /></Block>
      <Block title="Credits"><LineRows wp={wp} dense keys={['F8812.4', 'F8812.5', 'F8812.6', 'F8812.7', 'F8812.8', 'F8812.11', 'F8812.12', 'F8863.27', 'F8863.30', 'F8863.7', 'F2441.1a', 'F2441.1b', 'F2441.2', 'F2441.12', 'F2441.26', 'F2441.31']} /></Block>
      <CheckTables id="CHK-SALT-CAP" />
      <CheckTables id="CHK-CHARITY" />
    </>
  );
}

function Limit({ label, used, limit, note, k, invert }: { label: string; used: number; limit: number; note: string; k: string; invert?: boolean }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <button type="button" onClick={() => store.open(k)} className="rounded-lg border border-line bg-panel p-3 text-left shadow-1 hover:border-line-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="num mt-1 text-md font-semibold">{money(used)} <span className="text-sm font-normal text-fg-3">of {money(limit)}</span></div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk"><div className={cx('h-full rounded-full', invert ? 'bg-warn' : pct >= 100 ? 'bg-bad' : 'bg-ok')} style={{ width: `${pct}%` }} /></div>
      <div className="mt-1.5 text-cap text-fg-3">{note}</div>
    </button>
  );
}

function Payments({ wp }: { wp: Workpaper }) {
  const sched = wp.ours!.penalty.federalSchedule;
  return (
    <>
      <Lede>Withholding, estimates and the extension payment, agreed to the IRS transcript and the FTB account, and the underpayment penalty installment by installment.</Lede>
      <Block title="Federal"><LineRows wp={wp} dense keys={['F1040.25a', 'F1040.25d', 'F1040.26', 'Sch3.10', 'Sch3.11', 'Sch3.15', 'F1040.31', 'F1040.33']} /></Block>
      <CheckTables id="CHK-FED-PAYMENTS" title="Estimates against the IRS transcript" />
      <Block title="California"><LineRows wp={wp} dense keys={['F540NR.71', 'F540NR.72', 'F540NR.73', 'F540NR.78']} /></Block>
      <CheckTables id="CHK-CA-PAYMENTS" title="Estimates against the FTB account" />
      {sched.length > 0 && (
        <Block title="Form 2210 by installment" sub="Regular method. Each payment applies to the earliest unpaid installment; interest runs until paid or April 15.">
          <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
            <table className="w-full border-collapse text-base">
              <thead><tr className="text-cap text-fg-3">{['Installment', 'Due', 'Required', 'Paid by due date', 'Underpaid', 'Penalty'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i >= 2 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
              <tbody>
                {sched.map((r) => (
                  <tr key={r.installment}><td className="border-b border-line px-3 py-1.5">{r.installment}</td><td className="border-b border-line px-3 py-1.5">{r.due}</td><td className="num border-b border-line px-3 py-1.5 text-right">{money(r.required)}</td><td className="num border-b border-line px-3 py-1.5 text-right">{money(r.paid)}</td><td className="num border-b border-line px-3 py-1.5 text-right">{money(r.underpaid)}</td><td className="num border-b border-line px-3 py-1.5 text-right">{money(r.interest, { cents: true })}</td></tr>
                ))}
                <tr className="font-semibold"><td colSpan={5} className="px-3 py-1.5">Penalty (rounded down)</td><td className="num px-3 py-1.5 text-right"><button type="button" className="proof" onClick={() => store.open('F1040.38')}>{money(num(wp, 'F1040.38'))}</button></td></tr>
              </tbody>
            </table>
          </div>
        </Block>
      )}
    </>
  );
}

function StateSplit({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const p = ix.params;
  const rows = [...new Set([...wp.ours!.values.keys()].filter((k) => k.startsWith('SchCA540NR.') && /\.[A-E]$/.test(k)).map((k) => k.split('.')[1]))].sort((a, b) => Number(a) - Number(b));
  const label = (r: string) => (wp.ours!.labels.get(`SchCA540NR.${r}.A`) ?? wp.ours!.labels.get(`SchCA540NR.${r}.D`) ?? `Line ${r}`).replace(/\s*[-—(]?\s*column [A-E]\)?$/i, '').replace(/\s+-\s+federal$/i, '');
  return (
    <>
      <Lede>California resident from January 1 to July 14, 2025 ({p.ca_resident_days} of {p.year_days} days), then a Texas resident. Column E holds income while a resident plus California-source income after the move.</Lede>
      <div className="mb-4 flex flex-wrap gap-2">{ix.packet.household.residency.map((r) => <Badge key={r.state} tone="outline">{r.state} {r.status} {r.from} → {r.to}</Badge>)}</div>
      <Block title="Schedule CA (540NR)" sub="A federal amount · B subtractions · C additions · D California law (all year) · E California-taxed">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead><tr className="text-cap text-fg-3"><th className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Line</th>{['A', 'B', 'C', 'D', 'E'].map((c) => <th key={c} className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r} className="hover:bg-panel-2">
                  <td className="border-b border-line px-3 py-1.5"><span className="mono mr-2 text-cap text-fg-3">{r}</span>{label(r)}</td>
                  {['A', 'B', 'C', 'D', 'E'].map((c) => {
                    const k = `SchCA540NR.${r}.${c}`;
                    const o = wp.ours!.values.get(k);
                    const b = wp.base!.values.get(k);
                    return <td key={c} className="num border-b border-line px-3 py-1.5 text-right">{o === undefined ? '' : <button type="button" className={cx('proof', b !== o && 'ink-blue font-semibold')} onClick={() => store.open(k)}>{value(o, k)}</button>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <CheckTables id="CHK-CA-SOURCE" title="Source of income after the move" />
      <CheckTables id="CHK-CA-WAGES" title="California wages from the paystub" />
      <Block title="Form 540NR"><LineRows wp={wp} dense emphasize={['F540NR.64']} keys={['F540NR.17', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'ScheduleS.credit', 'F540NR.64']} /></Block>
    </>
  );
}

// ------------------------------------------------------------- across years
function Carryovers({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const inn = ix.packet.prior_years.carryovers_into_2025;
  const eng = wp.version!.carryovers_out.federal;
  const ours = wp.ours!.carryovers;
  const rowsIn: [string, number][] = [['Capital loss, short-term', inn.capital_loss_short], ['Capital loss, long-term', inn.capital_loss_long], ['Passive loss, 1450 Fremont Way', inn.passive_1450_fremont], ['Passive loss, Austin condo', inn.passive_1200_barton_hills]];
  const rowsOut: [string, number | null, number | null, string][] = [
    ['Minimum tax credit (Form 8801)', Number(eng.minimum_tax_credit_from_2025_amt ?? 0), ours.minimum_tax_credit ?? null, 'From the ISO exercise; usable when regular tax exceeds tentative minimum tax'],
    ['SEP contribution not deductible', Number(eng.sep_contribution_not_deductible_for_2025 ?? 0), ours.sep_contribution_not_deductible ?? null, 'Unless withdrawn by 10/15/2026 (judgment J-SEP-EXCESS)'],
    ['Capital loss', Number(eng.capital_loss_short ?? 0) + Number(eng.capital_loss_long ?? 0), ours.capital_loss ?? 0, 'Fully used in 2025'],
    ['Passive losses', Number(eng.passive_1450_fremont ?? 0) + Number(eng.passive_1200_barton_hills ?? 0), 0, 'Released in 2025'],
    ['S corporation stock basis (Woodworks)', Number(eng.scorp_stock_basis_end ?? 0), ours.scorp_stock_basis_end ?? null, 'Distributions exceeded basis'],
    ['Ridgeline capital account', Number(eng.ridgeline_capital_account_end ?? 0), Number(eng.ridgeline_capital_account_end ?? 0), 'Outside basis still to be set up'],
  ];
  return (
    <>
      <Lede>What came in from 2024 and what goes out to 2026, the engine's figure beside ours where our corrections move it.</Lede>
      <CheckTables id="CHK-CARRYOVERS" title="Into 2025, agreed to the 2024 return" />
      <Block title="Into 2025 (federal)">
        <Card pad={false}><ul className="divide-y divide-line">{rowsIn.map(([l, v]) => <li key={l} className="flex justify-between px-3 py-1.5 text-base"><span>{l}</span><span className="num">{money(v)}</span></li>)}</ul></Card>
        <p className="mt-2 text-sm text-fg-3">{(inn.california as { note?: string }).note}</p>
      </Block>
      <Block title="Out to 2026">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full border-collapse text-base">
            <thead><tr className="text-cap text-fg-3">{['Carryover', 'Engine', 'Ours', 'Note'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i === 1 || i === 2 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            <tbody>
              {rowsOut.map(([l, e, o, n]) => (
                <tr key={l}><td className="border-b border-line px-3 py-1.5">{l}</td><td className="num border-b border-line px-3 py-1.5 text-right text-fg-2">{e === null ? '—' : money(e)}</td><td className={cx('num border-b border-line px-3 py-1.5 text-right font-medium', o !== null && e !== o && 'ink-blue')}>{o === null ? '—' : money(o)}</td><td className="border-b border-line px-3 py-1.5 text-sm text-fg-3">{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <Block title="California depreciation basis differences carried to 2026">
        <Card pad={false}><ul className="divide-y divide-line">{Object.entries((wp.version!.carryovers_out.california as { depreciation_basis_differences?: Record<string, number> }).depreciation_basis_differences ?? {}).map(([k, v]) => <li key={k} className="flex justify-between px-3 py-1.5 text-base"><span className="mono text-sm">{k}</span><span className="num">{money(v, { cents: v % 1 !== 0 })}</span></li>)}</ul></Card>
      </Block>
    </>
  );
}

function Basis({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const br = ix.packet.prior_years.basis_records;
  return (
    <>
      <Lede>Basis rolled forward year by year, with the document behind each year. The 2023 Woodworks K-1 arrived in June 2026 and filled the gap the prior preparer left.</Lede>
      <CheckTables id="CHK-SCORP-BASIS" title="Woodworks stock basis (Form 7203)" />
      <Block title="Form 7203 lines"><LineRows wp={wp} dense keys={['F7203.1', 'F7203.3a', 'F7203.3c', 'F7203.4', 'F7203.5', 'F7203.6', 'F7203.7', 'F7203.15', 'F7203.excess']} /></Block>
      <CheckTables id="CHK-PARTNERSHIP" title="Ridgeline capital account" />
      <Block title="Other basis on record">
        <Card pad={false}>
          <ul className="divide-y divide-line text-base">
            {Object.entries(br).map(([k, rows]) => (
              <li key={k} className="px-3 py-2">
                <div className="font-medium">{k.replace(/_/g, ' ')}</div>
                <ul className="mt-1 space-y-0.5 text-sm text-fg-2">{rows.map((r, i) => <li key={i}>{Object.entries(r).map(([a, b]) => `${a.replace(/_/g, ' ')}: ${b === null ? '—' : typeof b === 'number' ? money(b) : String(b)}`).join(' · ')}</li>)}</ul>
              </li>
            ))}
          </ul>
        </Card>
      </Block>
    </>
  );
}

function Prior({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const pw = ix.packet.prior_years.prior_preparer_workpaper;
  const py = ix.packet.prior_years.return_2024;
  const compare: [string, string, string, string[]][] = [
    ['Self-employed health insurance', py.notes['Sch1.17'] ?? '', 'Still not deductible: Erik was eligible for Ngozi\'s employer plan in 2025 too (qa-25). The engine claimed it; corrected.', ['qa-25', 'D25', 'Sch1.17']],
    ['Home office', py.notes['SchC.30'] ?? '', 'Measured this year: 220 sq ft in Sacramento, 260 sq ft in Austin (D24). Simplified method by period.', ['D24', 'SchC.30']],
    ['Passive loss allocation', py.notes.F8582 ?? '', 'Same method. In 2025 the condo sale frees all of its suspended losses and net passive income allows the rest.', ['F8582.4']],
    ['Woodworks basis', pw.notes.find((n) => /Woodworks/.test(n)) ?? '', 'Rolled forward with the 2023 K-1 (D40). 2025 distributions exceed basis; the excess is a long-term gain.', ['D40', 'F7203.excess']],
    ['IRA basis', pw.notes.find((n) => /8606/.test(n)) ?? '', 'Agreed to Form 5498 for 2024 (D42): 7,000 basis.', ['D42', 'F8606.2']],
    ['Swedish account', pw.notes.find((n) => /Sparbanken/.test(n)) ?? '', 'Form 8938 required again; FBAR is the client\'s (outside filings). Interest converted at the 2025 rate.', ['D36', 'F8938.req']],
  ];
  return (
    <>
      <Lede>What Delta River Tax Service did for 2024, what they left open, and how this year's file treats each point.</Lede>
      <Block title="Prior preparer's memo"><Card><p className="serif text-md leading-relaxed">{pw.summary_memo}</p><div className="mt-2"><RefChip r="D07" /></div></Card></Block>
      <CheckTables id="CHK-PRIOR-OPEN-ITEMS" title="Open items they left" />
      <Block title="Their treatment and ours">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[720px] border-collapse text-base">
            <thead><tr className="text-cap text-fg-3">{['Item', 'Prior preparer (2024)', 'This year', 'Evidence'].map((h) => <th key={h} className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {compare.map(([i, a, b, refs]) => (
                <tr key={i} className="align-top"><td className="border-b border-line px-4 py-2.5 font-medium">{i}</td><td className="border-b border-line px-4 py-2.5 text-fg-2">{a}</td><td className="border-b border-line px-4 py-2.5">{b}</td><td className="border-b border-line px-4 py-2.5"><div className="flex flex-wrap gap-1">{refs.map((r) => <RefChip key={r} r={r} />)}</div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      <CheckTables id="CHK-QUESTIONNAIRE" title="Client answers against the documents" />
      <Block title="2024 return lines with variances" sub="Firm threshold: more than 10% and more than 1,000.">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full border-collapse text-base">
            <thead><tr className="text-cap text-fg-3">{['Line', '2024', '2025 ours', 'Change', 'Explained'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i >= 1 && i <= 3 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            <tbody>
              {wp.variances.filter((v) => v.flagged).map((v) => (
                <tr key={v.key}><td className="border-b border-line px-3 py-1.5"><button type="button" className="hover:underline" onClick={() => store.open(v.key)}>{v.label}</button></td><td className="num border-b border-line px-3 py-1.5 text-right">{money(v.prior)}</td><td className="num border-b border-line px-3 py-1.5 text-right">{money(v.current)}</td><td className="num border-b border-line px-3 py-1.5 text-right">{signed(v.delta)}</td><td className="border-b border-line px-3 py-1.5 text-sm">{v.explanation ? <span className="text-fg-2">{v.explanation.text}</span> : <Badge tone="warn">To explain</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </>
  );
}
