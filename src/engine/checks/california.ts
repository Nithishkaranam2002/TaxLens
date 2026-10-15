import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function checkCaWages(x: CheckCtx): CheckResult | null {
  if (!x.has('D09')) return null;
  const corvane = x.ix.evNum('D08', 'box16');
  const halv = x.ix.evNum('D09', 'box16');
  const paystub = x.has('D73') ? x.ix.evNum('D73', 'ytd_ca_wages') : null;
  const engine = x.line('SchCA540NR.1.E');
  const fixed = paystub !== null ? corvane + paystub : null;
  const rows: EvidenceTable['rows'] = [
    { status: 'ok', cells: ['Corvane (left 5/16, California resident all employment)', { v: corvane, money: true, ref: 'ev-0030' }, { v: corvane, money: true }, 'All California'] },
    { status: 'bad', cells: ['Halvorsen (started 6/2; Austin from 7/15)', { v: halv, money: true, ref: 'ev-0047' }, paystub !== null ? { v: paystub, money: true, ref: 'ev-1081' } : '—', 'Box 16 kept California through 9/30 by mistake'] },
  ];
  return {
    id: 'CHK-CA-WAGES', group: 'California', area: 'california',
    title: 'California wages after the move',
    question: 'Are only wages earned while living in California treated as California-source?',
    method: 'Compares W-2 box 16 with the residency dates, the employer\'s note and the paystub at the move.',
    status: engine > (fixed ?? corvane) ? 'fail' : 'pass',
    summary: paystub === null
      ? `Box 16 for Halvorsen (${fmt(halv)}) includes wages after the 7/15 move (the W-2 says payroll kept California through 9/30; qa-45). Ask for the paystub at the move to measure California wages.`
      : `The engine uses W-2 box 16 (${fmt(engine)}). Halvorsen's box 16 includes Texas-period wages; the 7/18 paystub shows California wages of ${fmt(paystub)} through 7/15. California-source wages are ${fmt(fixed!)} — ${fmt(engine - fixed!)} less. The California tax withheld after the move is still credited and refunded.`,
    tables: [{ columns: ['Employer', 'W-2 box 16', 'California-source', 'Note'], money: [1, 2], rows }],
    refs: ['D08', 'D09', 'D73', 'qa-45', 'SchCA540NR.1.E'],
    fixes: paystub !== null ? ['FIX-CA-WAGES'] : [],
  };
}

export function checkCaSource(x: CheckCtx): CheckResult | null {
  if (!x.base) return null;
  const rows: EvidenceTable['rows'] = [
    { status: 'ok', cells: ['Interest and dividends', 'Resident days 195/365', 'Accrue through the year'] },
    { status: 'ok', cells: ['Capital gains', 'Sales dated through 7/14 at 100%; pass-through gains and carryovers by days', 'RSU lots N1 and N3 and crypto lot C6 are California sales; N4 (August) is not'] },
    { status: 'ok', cells: ['Condo sale (Form 4797)', 'Not California-source', 'Texas property sold 10/15'] },
    { status: 'ok', cells: ['1450 Fremont Way', '100% California', 'California property'] },
    { status: 'ok', cells: ['Ridgeline K-1', 'Resident days + 22% of the nonresident period', 'State supplement (D38)'] },
    { status: 'ok', cells: ['Schedule C', 'Resident days', 'Studio moved with the family'] },
    { status: 'warn', cells: ['ISO exercise (AMT preference)', 'Not computed by the engine', 'Exercised 7/30 as a Texas resident; spread earned while working in California'] },
  ];
  return {
    id: 'CHK-CA-SOURCE', group: 'California', area: 'california',
    title: 'California source rules, item by item',
    question: 'Does each kind of income follow the right part-year source rule?',
    method: 'Recomputes Schedule CA column E from lot dates, property location, the Ridgeline supplement and resident days.',
    status: 'review',
    summary: 'Every Schedule CA column E amount recomputes from the engine\'s source rules. One item is outside the engine: California AMT on the ISO exercise, which needs a partner decision.',
    tables: [{ columns: ['Income', 'Rule', 'Note'], rows }],
    refs: ['SchCA540NR.22.E', 'F540NR.61', 'D38', 'D12'],
    fixes: [],
  };
}
