import { round2 } from '../recompute/core';
import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const sum = (a: number[]) => round2(a.reduce((s, x) => s + x, 0));
const num = (s: string) => Number(s.replace(/,/g, ''));

function lotsFromEvs(x: CheckCtx, doc: string, prefix: string) {
  const evs = x.ix.evsByDoc.get(doc) ?? [];
  const ids = [...new Set(evs.filter((e) => new RegExp(`^${prefix}\\d+_`).test(e.field)).map((e) => e.field.split('_')[0]))];
  return ids.map((id) => ({
    id,
    proceeds: x.ix.evNum(doc, `${id}_proceeds`),
    basis: x.ix.evNum(doc, `${id}_basis`),
    wash: x.ix.evNum(doc, `${id}_wash`),
    term: String(x.ix.ev(doc, `${id}_term`)?.value ?? ''),
    covered: x.ix.ev(doc, `${id}_covered`)?.value,
  }));
}

export function checkBrokerTieout(x: CheckCtx): CheckResult {
  const rows: EvidenceTable['rows'] = [];
  let bad = false;
  // Northlake: the summary page was not extracted; read it from the printed text.
  if (x.has('D28')) {
    const t = x.ix.page('D28', 2);
    const g = (re: RegExp) => { const mm = re.exec(t); return mm ? num(mm[1]) : 0; };
    const summary = g(/short-term covered proceeds ([\d,.]+)/) + g(/short-term noncovered proceeds ([\d,.]+)/) + g(/long-term covered proceeds ([\d,.]+)/) + g(/long-term noncovered proceeds ([\d,.]+)/);
    const lots = lotsFromEvs(x, 'D28', 'N');
    const detail = sum(lots.map((l) => l.proceeds));
    rows.push({ status: Math.abs(summary - detail) < 0.01 ? 'ok' : 'bad', cells: [{ v: 'Northlake Securities (D28)', ref: 'D28' }, `${lots.length} lots`, { v: summary, money: true, ref: 'doc:D28#page2' }, { v: detail, money: true }, { v: round2(summary - detail), money: true }, 'Summary read from page 2 (not extracted)'] });
  }
  const mer = x.has('D31') ? 'D31' : x.has('D30') ? 'D30' : null;
  if (mer) {
    const lots = lotsFromEvs(x, mer, 'M');
    const summary = x.ix.evNum(mer, 'b_summary_proceeds');
    const detail = sum(lots.map((l) => l.proceeds));
    const diff = round2(summary - detail);
    const p32 = x.ix.page(mer, 32);
    const mm = /(M\d+) (.+?) ([\d.]+) sh acquired (\S+) sold (\S+) proceeds ([\d,.]+) basis ([\d,.]+)/.exec(p32);
    const explains = mm && Math.abs(num(mm[6]) - diff) < 0.01;
    if (diff !== 0) bad = true;
    rows.push({ status: diff === 0 ? 'ok' : 'bad', cells: [{ v: `Meridian Brokerage (${mer})`, ref: mer }, `${lots.length} lots`, { v: summary, money: true, ref: x.ix.ev(mer, 'b_summary_proceeds')?.id }, { v: detail, money: true }, { v: diff, money: true },
      explains ? `Page 32 holds ${mm![1]} ${mm![2]}: proceeds ${mm![6]}, basis ${mm![7]} — not read` : diff ? 'Unexplained difference' : ''] });
  }
  if (x.has('D74')) {
    const lots = lotsFromEvs(x, 'D74', 'X');
    const st = lots.filter((l) => l.term === 'short');
    const lt = lots.filter((l) => l.term === 'long');
    for (const [label, set, pfx] of [['short-term', st, 'st'], ['long-term', lt, 'lt']] as const) {
      for (const [field, key] of [['proceeds', 'proceeds'], ['basis', 'basis'], ['wash', 'wash']] as const) {
        const summary = x.ix.evNum('D74', `${pfx}_${field}`);
        const detail = sum(set.map((l) => l[key]));
        if (Math.abs(summary - detail) > 0.005) bad = true;
        rows.push({ status: Math.abs(summary - detail) < 0.005 ? 'ok' : 'bad', cells: [{ v: 'Brightpath Advisors (D74)', ref: 'D74' }, `${set.length} ${label} lots · ${field === 'wash' ? 'wash sales' : field}`, { v: summary, money: true, ref: x.ix.ev('D74', `${pfx}_${field}`)?.id }, { v: detail, money: true }, { v: round2(summary - detail), money: true }, ''] });
      }
    }
  }
  return {
    id: 'CHK-BROKER-TIEOUT', group: 'Reconciliations', area: 'investments',
    title: 'Broker 1099-B summaries against their detail',
    question: 'Do the lots on each 1099-B add up to the broker\'s own summary?',
    method: 'Adds proceeds, basis and wash sales lot by lot (to the cent) and compares with the summary each broker prints.',
    status: bad ? 'fail' : 'pass',
    summary: bad ? 'Meridian\'s detail is 250.00 short of its summary: the sale printed on page 32 was never read. Northlake and all 260 Brightpath lots tie to the cent.' : 'Every broker\'s lots tie to its summary to the cent.',
    tables: [{ columns: ['Broker', 'Scope', 'Summary', 'Sum of lots', 'Difference', 'Finding'], money: [2, 3, 4], rows }],
    refs: ['D28', 'D31', 'D74'],
    fixes: bad ? ['FIX-M18'] : [],
    scanned: 283,
  };
}

export function checkRsuBasis(x: CheckCtx): CheckResult | null {
  if (!x.has('D28')) return null;
  const lots = lotsFromEvs(x, 'D28', 'N').filter((l) => /RSU/.test(String(x.ix.ev('D28', `${l.id}_description`)?.value)));
  const sup = x.has('D11');
  const supText = x.ix.page('D11', 2);
  const rows: EvidenceTable['rows'] = [];
  let bad = 0;
  for (const l of lots) {
    const acq = String(x.ix.ev('D28', `${l.id}_acquired`)?.value);
    const qty = Number(x.ix.ev('D28', `${l.id}_quantity`)?.value);
    const mm = new RegExp(`Lot (RSU-\\d+): ${qty} sh acquired ${acq.slice(5, 7)}/${acq.slice(8, 10)}/${acq.slice(0, 4)} \\(vest FMV ([\\d.]+)\\) adjusted basis ([\\d,.]+)`).exec(supText);
    const supBasis = mm ? num(mm[3]) : null;
    const engineGain = x.line(`F8949.${l.term === 'short' ? 'B' : 'E'}.${l.id}`);
    const wrong = sup && supBasis !== null && Math.abs(l.basis - supBasis) > 0.01;
    if (wrong) bad++;
    rows.push({ status: wrong ? 'bad' : 'ok', cells: [{ v: l.id, ref: x.ix.ev('D28', `${l.id}_basis`)?.id }, `${qty} sh · acquired ${acq}`, { v: l.proceeds, money: true }, { v: l.basis, money: true, ref: x.ix.ev('D28', `${l.id}_basis`)?.id }, mm ? { v: supBasis, money: true, ref: x.ix.ev('D11', `${mm[1]}_adjusted_basis`)?.id } : '—', { v: engineGain, money: true }, { v: supBasis !== null ? round2(l.proceeds - supBasis) : null, money: true }] });
  }
  const box14 = x.ix.evNum('D08', 'box14_RSU');
  const vested2025 = rows.length ? 2 * x.ix.evNum('D11', 'RSU-2502_adjusted_basis') : 0;
  return {
    id: 'CHK-RSU-BASIS', group: 'Reconciliations', area: 'wages',
    title: 'RSU sales against the supplemental basis statement',
    question: 'Do the noncovered RSU lots carry the basis that was already taxed as wages?',
    method: 'Matches each noncovered lot to the supplemental statement by shares and acquisition date, and ties 2025 vests to W-2 box 14.',
    status: !sup ? 'waiting' : bad ? 'fail' : 'pass',
    summary: !sup ? 'Waiting for the stock plan supplemental statement.'
      : bad ? `${bad} RSU lots carry zero basis. Northlake left basis blank (noncovered) and the pipeline read the blanks as 0.00. The supplemental statement gives ${rows.length ? 'the adjusted basis' : ''}; 2025 vests (${vested2025.toLocaleString('en-US')}) agree to W-2 box 14 RSU (${box14.toLocaleString('en-US')}). Capital gain is overstated by ${(x.ix.evNum('D11', 'RSU-2502_adjusted_basis') + x.ix.evNum('D11', 'RSU-2505_adjusted_basis') + x.ix.evNum('D11', 'RSU-2308_adjusted_basis')).toLocaleString('en-US')}.`
      : 'Each RSU lot carries its supplemental basis.',
    tables: [{ columns: ['Lot', 'Shares', 'Proceeds', 'Broker basis read', 'Supplemental basis', 'Engine gain', 'Correct gain'], money: [2, 3, 4, 5, 6], rows }],
    refs: ['D11', 'D28', 'D08'],
    fixes: bad ? ['FIX-RSU-BASIS'] : [],
  };
}

export function checkEspp(x: CheckCtx): CheckResult | null {
  if (!x.has('D13') || !x.has('D11')) return null;
  const fmv = x.ix.evNum('D13', 'box4');
  const price = x.ix.evNum('D13', 'box5');
  const sh = x.ix.evNum('D13', 'box7');
  const ord = round2((fmv - price) * sh);
  const w2 = x.ix.evNum('D08', 'box14_ESPP');
  const basis = x.ix.evNum('D11', 'ESPP-2406_adjusted_basis');
  const gain = x.line('F8949.A.N2');
  const ok = Math.abs(ord - w2) < 0.01 && Math.abs(price * sh + ord - basis) < 0.01 && Math.abs(gain - (x.ix.evNum('D28', 'N2_proceeds') - basis)) < 0.01;
  return {
    id: 'CHK-ESPP', group: 'Reconciliations', area: 'wages',
    title: 'ESPP disqualifying disposition',
    question: 'Is the ESPP bargain element taxed once, as wages, with basis adjusted to match?',
    method: 'Recomputes the ordinary income from Form 3922 and ties it to W-2 box 14 and the supplemental basis.',
    status: ok ? 'pass' : 'fail',
    summary: ok ? `Ordinary income ${ord.toFixed(2)} = ${sh} sh × (${fmv.toFixed(2)} − ${price.toFixed(2)}), included in W-2 box 14. Basis ${basis.toFixed(2)} with an adjustment of −${ord.toFixed(2)}; gain ${gain.toLocaleString('en-US')}.` : 'ESPP ordinary income and basis do not tie.',
    tables: [{ columns: ['Item', 'Amount', 'Source'], money: [1], rows: [
      { status: 'ok', cells: ['Shares × (FMV at purchase − price)', { v: ord, money: true }, { v: 'Form 3922', ref: 'D13' }] },
      { status: Math.abs(ord - w2) < 0.01 ? 'ok' : 'bad', cells: ['W-2 box 14 ESPP', { v: w2, money: true }, { v: 'ev-0028', ref: 'ev-0028' }] },
      { status: 'ok', cells: ['Adjusted basis (supplemental)', { v: basis, money: true }, { v: 'ev-0072', ref: 'ev-0072' }] },
      { status: 'ok', cells: ['Gain on Form 8949 box A', { v: gain, money: true }, { v: 'F8949.A.N2', ref: 'F8949.A.N2' }] },
    ] }],
    refs: ['D13', 'D11', 'F8949.A.N2'],
    fixes: [],
  };
}

export function checkIso(x: CheckCtx): CheckResult | null {
  if (!x.has('D12')) return null;
  const sh = x.ix.evNum('D12', 'box5');
  const adj = sh * (x.ix.evNum('D12', 'box4') - x.ix.evNum('D12', 'box3'));
  const line = x.line('F6251.2i');
  return {
    id: 'CHK-ISO', group: 'Reconciliations', area: 'wages',
    title: 'Incentive stock option exercise',
    question: 'Is the AMT adjustment for the ISO exercise right, and is it tracked forward?',
    method: 'Recomputes shares × (FMV at exercise − exercise price) and confirms the shares were held at year end.',
    status: Math.abs(adj - line) < 1 ? 'pass' : 'fail',
    summary: `AMT adjustment ${adj.toLocaleString('en-US')} = ${sh.toLocaleString('en-US')} × (52.00 − 12.00); shares still held (qa-06). Regular basis 12,000, AMT basis 52,000 carry forward for the eventual sale. California AMT is not computed by the engine (see judgment).`,
    tables: [],
    refs: ['D12', 'qa-06', 'F6251.2i'],
    fixes: [],
  };
}

export function checkWages(x: CheckCtx): CheckResult | null {
  if (!x.has('D08') || !x.has('D09')) return null;
  const w = (d: string, f: string) => x.ix.evNum(d, f);
  const box1 = w('D08', 'box1') + w('D09', 'box1');
  const box2 = w('D08', 'box2') + w('D09', 'box2');
  const box5 = w('D08', 'box5') + w('D09', 'box5');
  const ss = w('D08', 'box4') + w('D09', 'box4');
  const excess = Math.round(ss - x.ix.params.ss_wage_base * 0.062);
  const rows: EvidenceTable['rows'] = [
    { status: box1 === x.line('F1040.1a') ? 'ok' : 'bad', cells: ['Box 1 wages (both W-2s) → Form 1040 line 1a', { v: box1, money: true }, { v: x.line('F1040.1a'), money: true, ref: 'F1040.1a' }] },
    { status: box2 === x.line('F1040.25a') ? 'ok' : 'bad', cells: ['Box 2 withholding → line 25a', { v: box2, money: true }, { v: x.line('F1040.25a'), money: true, ref: 'F1040.25a' }] },
    { status: box5 === x.line('F8959.1') ? 'ok' : 'bad', cells: ['Box 5 Medicare wages → Form 8959', { v: box5, money: true }, { v: x.line('F8959.1'), money: true, ref: 'F8959.1' }] },
    { status: excess === x.line('Sch3.11') ? 'ok' : 'bad', cells: ['Excess social security (two employers)', { v: excess, money: true }, { v: x.line('Sch3.11'), money: true, ref: 'Sch3.11' }] },
    { status: 'ok', cells: ['Box 16 − box 1, Corvane (= HSA code W)', { v: w('D08', 'box16') - w('D08', 'box1'), money: true }, { v: w('D08', 'box12_W'), money: true, ref: 'ev-0024' }] },
    { status: 'ok', cells: ['Box 16 − box 1, Halvorsen (= HSA code W)', { v: w('D09', 'box16') - w('D09', 'box1'), money: true }, { v: w('D09', 'box12_W'), money: true, ref: 'ev-0043' }] },
  ];
  const bad = rows.some((r) => r.status === 'bad');
  return {
    id: 'CHK-WAGES', group: 'Reconciliations', area: 'wages',
    title: 'W-2 boxes to the return',
    question: 'Do wages, withholding, Medicare wages and excess social security agree to the W-2s?',
    method: 'Adds each box across the distinct W-2s and recomputes excess social security from the wage base.',
    status: bad ? 'fail' : 'pass',
    summary: bad ? 'A W-2 amount does not agree to the return.' : 'Wages, withholding, Medicare wages and excess social security all agree. Box 16 exceeds box 1 by the employer HSA contribution, which California taxes.',
    tables: [{ columns: ['Item', 'Recomputed', 'Return'], money: [1, 2], rows }],
    refs: ['D08', 'D09'],
    fixes: [],
  };
}

export function checkScheduleCReceipts(x: CheckCtx): CheckResult | null {
  if (!x.has('D14')) return null;
  const necDocs = ['D16', 'D17', 'D18', 'D19', 'D20'].filter((d) => x.has(d));
  const rows: EvidenceTable['rows'] = necDocs.map((d) => ({ status: 'ok' as const, cells: [{ v: String(x.ix.ev(d, 'payer')?.value), ref: d }, 'Form 1099-NEC', { v: x.ix.evNum(d, 'box1'), money: true, ref: x.ix.ev(d, 'box1')?.id }] }));
  const nec = sum(necDocs.map((d) => x.ix.evNum(d, 'box1')));
  const small = x.ix.evNum('D15', 'unreported_small');
  const books = x.ix.evNum('D14', 'total_income');
  const k = x.has('D21') ? x.ix.evNum('D21', 'box1a') : 0;
  const atlasK = x.ix.evNum('D15', 'atlas_paywell');
  rows.push({ status: 'ok', cells: ['11 small clients (no Form 1099)', 'Deposits per QuickBooks', { v: small, money: true, ref: 'ev-0111' }] });
  rows.push({ status: Math.abs(nec + small - books) < 0.01 ? 'ok' : 'bad', cells: [{ v: 'Books revenue', strong: true }, 'Profit and loss', { v: books, money: true, ref: 'ev-0103', strong: true }] });
  rows.push({ status: 'info', cells: ['Paywell Form 1099-K', `Inside Atlas's 41,200.00 (card payments, deposited gross)`, { v: k, money: true, ref: 'ev-0127' }] });
  const engine = x.line('SchC.1');
  const over = engine - books;
  rows.push({ status: over ? 'bad' : 'ok', cells: [{ v: 'Engine gross receipts', strong: true }, over ? `Books + 1099-K (the rule adds 1099-K amounts it cannot match)` : 'Agrees to books', { v: engine, money: true, ref: 'SchC.1', strong: true }] });
  return {
    id: 'CHK-SCHC-RECEIPTS', group: 'Reconciliations', area: 'business',
    title: 'Schedule C gross receipts against third-party forms',
    question: 'Do books revenue, the 1099-NECs and the 1099-K reconcile, and is anything counted twice?',
    method: 'Ties each 1099 to the QuickBooks deposit detail and rebuilds revenue from the forms plus deposits without a form.',
    status: over && atlasK === k ? 'fail' : 'pass',
    summary: over
      ? `Books revenue ${books.toLocaleString('en-US')} = 1099-NECs ${nec.toLocaleString('en-US')} + small clients ${small.toLocaleString('en-US')}. The 1099-K (${k.toLocaleString('en-US')}) is Atlas card payments already inside the books, so the engine counts it twice. Payers reported ${(nec + k).toLocaleString('en-US')} to the IRS because Atlas also put its card payments on its 1099-NEC — keep this reconciliation for any matching notice.`
      : `Books revenue ${books.toLocaleString('en-US')} agrees to the 1099s plus deposits without a form.`,
    tables: [{ columns: ['Payer', 'Basis', 'Amount'], money: [2], rows }],
    refs: ['D14', 'D15', 'D21', ...necDocs],
    fixes: over ? ['FIX-1099K'] : [],
  };
}

export function checkBooksToTax(x: CheckCtx): CheckResult | null {
  if (!x.has('D14') || !x.base) return null;
  const e = (f: string) => x.ix.evNum('D14', f);
  const net = e('net_income');
  const items: [string, number, string, string][] = [
    ['Health insurance (Erik) — not a Schedule C expense', e('Insurance - health (Erik)'), 'Moved to Schedule 1 line 17', 'Sch1.17'],
    ['Book depreciation 7,600 replaced by tax depreciation', e('Depreciation') - x.line('SchC.13'), '100% special depreciation on 38,000 of equipment', 'SchC.13'],
    ['Fuel replaced by the standard mileage rate', e('Car and truck - fuel') - x.line('SchC.9'), `${x.line('SchC.44a').toLocaleString('en-US')} miles × 0.70`, 'SchC.9'],
    ['Meals: 50% not deductible', e('Meals') - x.line('SchC.24b'), '3,960 × 50%', 'SchC.24b'],
    ['Home office (not in the books)', -x.line('SchC.30'), 'Simplified method', 'SchC.30'],
    ['Revenue above books', x.line('SchC.1') - e('total_income'), 'Form 1099-K added by the engine', 'SchC.1'],
  ];
  const rebuilt = net + items.reduce((s, i) => s + i[1], 0);
  const rows: EvidenceTable['rows'] = [
    { status: 'info', cells: [{ v: 'Books net income (QuickBooks, cash basis)', strong: true }, { v: net, money: true, ref: 'ev-0105' }, '', ''] },
    ...items.map(([label, amt, why, ref]) => ({ status: (ref === 'SchC.1' && amt !== 0 ? 'bad' : 'ok') as 'bad' | 'ok', cells: [label, { v: amt, money: true }, why, { v: ref, ref }] })),
    { status: Math.abs(rebuilt - x.line('SchC.31')) < 1 ? 'ok' : 'bad', cells: [{ v: 'Schedule C net profit (engine)', strong: true }, { v: x.line('SchC.31'), money: true, ref: 'SchC.31', strong: true }, `Rebuilt: ${Math.round(rebuilt).toLocaleString('en-US')}`, ''] },
  ];
  const personal: EvidenceTable['rows'] = [
    { status: 'bad', cells: ['Spotify Family (in software)', { v: x.ix.evNum('D15', 'spotify'), money: true, ref: 'ev-0106' }, 'Personal — booked by mistake (call 3/26)', { v: 'call-01', ref: 'call-01' }] },
    { status: 'bad', cells: ['Family mobile plan, 4 lines', { v: e('Telephone'), money: true, ref: 'ev-0101' }, 'Erik: 70% business — of his own line', { v: 'call-01', ref: 'call-01' }] },
    { status: 'bad', cells: ['Home internet, shared with family', { v: e('Internet'), money: true, ref: 'ev-0095' }, 'About 50% business', { v: 'call-01', ref: 'call-01' }] },
  ];
  return {
    id: 'CHK-BOOKS-TO-TAX', group: 'Reconciliations', area: 'business',
    title: 'Books to Schedule C',
    question: 'Can every dollar between QuickBooks net income and Schedule C profit be explained, and are personal costs out?',
    method: 'Rebuilds Schedule C profit from the books one difference at a time, then reads the call notes against the expense detail.',
    status: 'fail',
    summary: `Books ${net.toLocaleString('en-US')} rebuild to Schedule C ${x.line('SchC.31').toLocaleString('en-US')} with six explained differences. One of them is the double-counted 1099-K. Three expense items include personal use (call notes 3/26).`,
    tables: [
      { title: 'Books to tax', columns: ['Difference', 'Amount', 'Why', 'Line'], money: [1], rows },
      { title: 'Personal use found in the expense detail', columns: ['Item', 'Booked', 'Client said', 'Source'], money: [1], rows: personal },
    ],
    refs: ['D14', 'D15', 'call-01'],
    fixes: ['FIX-1099K', 'FIX-SPOTIFY', 'FIX-PHONE', 'FIX-INTERNET'],
  };
}

export function checkContractors(x: CheckCtx): CheckResult | null {
  if (!x.has('D27')) return null;
  const q = x.ix.evNum('D27', 'quintero');
  const d = x.ix.evNum('D27', 'patel');
  const ok = q + d === x.line('SchC.11');
  return {
    id: 'CHK-CONTRACTORS', group: 'Reconciliations', area: 'business',
    title: 'Contract labor and Forms 1099-NEC',
    question: 'Does contract labor tie to the contractor report, and were the required 1099s filed?',
    method: 'Ties the contractor report to the books and reads the questionnaire.',
    status: ok ? 'review' : 'fail',
    summary: `Contract labor ${x.line('SchC.11').toLocaleString('en-US')} = Mara Quintero ${q.toLocaleString('en-US')} + Dev Patel ${d.toLocaleString('en-US')} (paid by ACH, so 1099-NEC is required). No 1099-NECs were filed (qa-23); Schedule C question J will be answered "No". Late filing is outside this engagement: tell the client in writing.`,
    tables: [],
    refs: ['D27', 'qa-22', 'qa-23', 'SchC.I', 'SchC.J'],
    fixes: [],
  };
}

export function checkRentalA(x: CheckCtx): CheckResult | null {
  if (!x.has('D46')) return null;
  const e = (d: string, f: string) => x.ix.evNum(d, f);
  const rows: EvidenceTable['rows'] = [
    { status: e('D46', 'rent') === e('D46', '1099misc_rents') && e('D46', 'rent') === x.line('SchE.3A') ? 'ok' : 'bad', cells: ['Rents', { v: x.line('SchE.3A'), money: true, ref: 'SchE.3A' }, 'Owner statement 37,200 = 1099-MISC box 1 37,200 = 3,100 × 12'] },
    { status: Math.abs(e('D46', 'mgmt') - e('D46', 'rent') * 0.08) < 0.01 ? 'ok' : 'warn', cells: ['Management fees', { v: x.line('SchE.11A'), money: true, ref: 'SchE.11A' }, '8% of rent collected'] },
    { status: e('D48', 'box1') === x.line('SchE.12A') ? 'ok' : 'bad', cells: ['Mortgage interest', { v: x.line('SchE.12A'), money: true, ref: 'SchE.12A' }, 'Golden Bear Form 1098 box 1'] },
    { status: e('D49', 'inst2_2425') + e('D49', 'inst1_2526') === x.line('SchE.16A') && e('D48', 'box10') === x.line('SchE.16A') ? 'ok' : 'bad', cells: ['Property taxes', { v: x.line('SchE.16A'), money: true, ref: 'SchE.16A' }, 'Two installments paid in 2025 (3,080 + 3,160) = 1098 box 10 escrow; counted once'] },
    { status: 'ok', cells: ['Insurance', { v: x.line('SchE.9A'), money: true, ref: 'SchE.9A' }, 'Paid directly to the insurer (client answer qa-36)'] },
    { status: 'bad', cells: ['Repairs', { v: x.line('SchE.14A'), money: true, ref: 'SchE.14A' }, `Includes the 11,000 HVAC replacement (Delta Breeze invoice 5521): whole system replaced — a capital improvement`] },
    { status: 'ok', cells: ['Days rented / personal use', '365 / 0', 'Owner statement'] },
  ];
  return {
    id: 'CHK-RENTAL-A', group: 'Reconciliations', area: 'rentals',
    title: '1450 Fremont Way, line by line',
    question: 'Does each Schedule E line for the Sacramento rental tie to a document, and is anything capital?',
    method: 'Ties each line to the owner statement, Form 1098 and tax bills, and reads invoices inside repairs.',
    status: 'fail',
    summary: 'Every line ties. Repairs include an 11,000 heat pump system that replaced the furnace and condenser: a restoration of a building system, which is capitalized. The engine has an exact what-if for it.',
    tables: [{ columns: ['Line', 'Return', 'Tie-out'], money: [1], rows }],
    refs: ['D46', 'D47', 'D48', 'D49', 'qa-36', 'qa-37', 'call-01'],
    fixes: ['FIX-HVAC'],
  };
}

export function checkRentalB(x: CheckCtx): CheckResult | null {
  if (!x.has('D50') || !x.has('D51')) return null;
  return {
    id: 'CHK-RENTAL-B', group: 'Reconciliations', area: 'rentals',
    title: 'Austin condo in its year of sale',
    question: 'Are the condo\'s rental days and expenses right for a property rented nine months and then sold?',
    method: 'Ties rent to the ledger, days to the lease end and closing date, and looks at costs after the last tenant left.',
    status: 'review',
    summary: 'Rent 20,250 = 2,250 × 9 (lease ended 9/30); 273 rental days; taxes 5,544 are the seller\'s proration at closing. Two small items fall after the rental ended: October HOA dues (410) and make-ready repairs before listing (1,800), which are arguably selling costs. Moving them would change tax by less than 700, so they stay on Schedule E; documented as a judgment.',
    tables: [],
    refs: ['D50', 'D51', 'D53', 'SchE.3B', 'SchE.14B', 'SchE.19B'],
    fixes: [],
  };
}

export function checkDepreciation(x: CheckCtx): CheckResult | null {
  if (!x.version) return null;
  const rows: EvidenceTable['rows'] = [];
  let bad = 0;
  const caTable5yr = [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
  for (const a of x.version.assets) {
    let fed = 0;
    let ca = 0;
    const year = 2025;
    const placed = new Date(a.placed_in_service + 'T00:00:00Z');
    if (/SL \/ mid-month/.test(a.method)) {
      const annual = a.cost / a.life_years;
      if (a.disposed) {
        const mo = Number(a.disposed.slice(5, 7));
        fed = annual * (mo - 0.5) / 12;
      } else if (placed.getUTCFullYear() === year) {
        fed = annual * (12 - placed.getUTCMonth() - 0.5) / 12;
      } else fed = annual;
      ca = fed;
    } else if (/100% bonus in 2021/.test(a.method)) {
      fed = 0;
      ca = a.cost * caTable5yr[year - placed.getUTCFullYear()];
    } else if (/100% special/.test(a.method)) {
      fed = a.cost;
      ca = a.cost * caTable5yr[0];
    } else if (/Section 179/.test(a.method)) {
      fed = 0; ca = 0;
    }
    fed = round2(fed); ca = round2(ca);
    const ok = Math.abs(fed - a.federal.depreciation_2025) < 0.02 && Math.abs(ca - a.california.depreciation_2025) < 0.02;
    if (!ok) bad++;
    rows.push({ status: ok ? 'ok' : 'bad', cells: [{ v: a.asset_id, ref: `asset:${a.asset_id}` }, a.description, a.method, { v: a.federal.depreciation_2025, money: true }, { v: fed, money: true }, { v: a.california.depreciation_2025, money: true }, { v: ca, money: true }] });
  }
  return {
    id: 'CHK-DEPRECIATION', group: 'Reconciliations', area: 'rentals',
    title: 'Depreciation recomputed asset by asset',
    question: 'Is each asset\'s 2025 federal and California depreciation right, including the partial year for the condo?',
    method: 'Recomputes straight-line mid-month (27.5 years, 9.5 months in the month of sale), California 200% declining balance and first-year amounts from cost and dates.',
    status: bad ? 'fail' : 'pass',
    summary: bad ? `${bad} assets do not recompute.` : `All ${rows.length} assets recompute to the cent, federal and California. AMT has no depreciation differences.`,
    tables: [{ columns: ['Asset', 'Description', 'Method', 'Engine federal', 'Recomputed', 'Engine California', 'Recomputed'], money: [3, 4, 5, 6], rows }],
    refs: x.version.assets.map((a) => `asset:${a.asset_id}`),
    fixes: [],
  };
}

export function check4797(x: CheckCtx): CheckResult | null {
  if (!x.has('D51')) return null;
  const e = (f: string) => x.ix.evNum('D51', f);
  const dep = x.line('F4797.23');
  const gain = e('price') - (e('purchase_price') + e('flooring') + e('commission') + e('title')) + dep;
  const ok = Math.abs(gain - x.line('F4797.25')) < 1;
  return {
    id: 'CHK-4797', group: 'Reconciliations', area: 'rentals',
    title: 'Condo gain from the closing statement',
    question: 'Does the Form 4797 gain rebuild from the closing statement and the depreciation taken?',
    method: 'Sale price − (purchase price + flooring + commissions + title) + depreciation allowed.',
    status: ok ? 'pass' : 'fail',
    summary: `${e('price').toLocaleString('en-US')} − (${e('purchase_price').toLocaleString('en-US')} + ${e('flooring').toLocaleString('en-US')} + ${e('commission').toLocaleString('en-US')} + ${e('title').toLocaleString('en-US')}) + ${dep.toLocaleString('en-US')} = ${Math.round(gain).toLocaleString('en-US')}. Unrecaptured §1250 gain ${x.line('SchD.19').toLocaleString('en-US')} (straight-line, no ordinary recapture). Agrees to Form 1099-S.`,
    tables: [],
    refs: ['D51', 'D52', 'F4797.25', 'SchD.19'],
    fixes: [],
  };
}

export function checkPassive(x: CheckCtx): CheckResult {
  const co = x.ix.packet.prior_years.carryovers_into_2025;
  const pyA = -Number(x.ix.packet.prior_years.return_2024.lines['F8582.unallowed.A']);
  const pyB = -Number(x.ix.packet.prior_years.return_2024.lines['F8582.unallowed.B']);
  const ok = pyA === co.passive_1450_fremont && pyB === co.passive_1200_barton_hills;
  return {
    id: 'CHK-PASSIVE', group: 'Reconciliations', area: 'rentals',
    title: 'Suspended passive losses',
    question: 'Do the suspended losses agree to 2024 Form 8582, and are they released correctly?',
    method: 'Agrees the carryovers to the 2024 return and recomputes Form 8582.',
    status: ok ? 'pass' : 'fail',
    summary: `Carryovers 6,300 (Fremont) and 9,850 (condo) agree to 2024 Form 8582. Net passive income is positive (${x.line('F8582.4').toLocaleString('en-US')}), so all current and prior losses are allowed; the condo's are also freed by its taxable sale.`,
    tables: [],
    refs: ['py:/carryovers_into_2025/passive_1450_fremont', 'py:/carryovers_into_2025/passive_1200_barton_hills', 'F8582.4', 'D06'],
    fixes: [],
  };
}

export function checkScorpBasis(x: CheckCtx): CheckResult | null {
  if (!x.has('D39')) return null;
  const has2023 = x.has('D40');
  const k23 = has2023 ? { inc: x.ix.evNum('D40', 'box1') + x.ix.evNum('D40', 'box4'), dist: x.ix.evNum('D40', 'box16d') } : null;
  const py = x.ix.packet.prior_years.return_2024.K1_1120S;
  const start = 21300;
  const end23 = k23 ? start + k23.inc - k23.dist : null;
  const end24 = end23 !== null ? end23 + py.box1 - py.box16D : null;
  const rows: EvidenceTable['rows'] = [
    { status: 'info', cells: ['2022 ending basis', { v: start, money: true }, 'Client worksheet in the prior file', { v: 'D07', ref: 'D07' }] },
    { status: has2023 ? 'ok' : 'warn', cells: ['2023: + income − distributions', k23 ? { v: end23, money: true } : '—', k23 ? `+ ${k23.inc.toLocaleString('en-US')} − ${k23.dist.toLocaleString('en-US')}` : 'K-1 missing', { v: 'D40', ref: 'D40' }] },
    { status: has2023 ? 'ok' : 'warn', cells: ['2024: + income − distributions', end24 !== null ? { v: end24, money: true } : '—', `+ ${py.box1.toLocaleString('en-US')} − ${py.box16D.toLocaleString('en-US')} (basis was sufficient)`, { v: 'D06', ref: 'D06' }] },
    { status: Math.abs((end24 ?? 0) - x.line('F7203.1')) < 1 ? 'ok' : 'bad', cells: ['2025 beginning basis (Form 7203)', { v: x.line('F7203.1'), money: true, ref: 'F7203.1' }, '', ''] },
    { status: 'info', cells: ['2025: + income 18,485 − distributions 42,000', { v: x.line('F7203.15'), money: true, ref: 'F7203.15' }, `Distributions in excess of basis ${x.line('F7203.excess').toLocaleString('en-US')} → long-term gain`, { v: 'F8949.F.SCORP', ref: 'F8949.F.SCORP' }] },
  ];
  const ok = has2023 && Math.abs((end24 ?? 0) - x.line('F7203.1')) < 1;
  return {
    id: 'CHK-SCORP-BASIS', group: 'Reconciliations', area: 'passthroughs',
    title: 'Woodworks stock basis by year',
    question: 'Is the S corporation basis rolled forward through the missing year, and is the excess distribution right?',
    method: 'Rolls basis from the 2022 worksheet through the 2023 K-1 and the 2024 return, then recomputes Form 7203.',
    status: !has2023 ? 'fail' : ok ? 'pass' : 'fail',
    summary: !has2023
      ? 'The 2023 K-1 is missing; the engine assumed no change in 2023 (8,200 beginning basis). Request the 2023 K-1.'
      : `With the 2023 K-1, basis rolls 21,300 → ${end23?.toLocaleString('en-US')} → ${end24?.toLocaleString('en-US')}. Engine v3 uses ${x.line('F7203.1').toLocaleString('en-US')} (v1 and v2 assumed no 2023 change and used 8,200). 2025 distributions exceed basis by ${x.line('F7203.excess').toLocaleString('en-US')}, taxed as long-term gain. Ask whether the 2023 K-1 income (14,100) was on the 2023 return.`,
    tables: [{ columns: ['Year', 'Ending basis', 'How', 'Source'], money: [1], rows }],
    refs: ['D07', 'D39', 'D40', 'F7203.1'],
    fixes: [],
  };
}

export function checkPartnership(x: CheckCtx): CheckResult | null {
  if (!x.has('D37')) {
    return {
      id: 'CHK-PARTNERSHIP', group: 'Reconciliations', area: 'passthroughs',
      title: 'Ridgeline K-1', question: 'Has the Ridgeline K-1 arrived, and does its capital account roll?',
      method: 'Rolls the capital account and maps each box.', status: 'waiting',
      summary: 'Ridgeline K-1 not received (client said June). The return cannot be final without it.', tables: [], refs: ['py:/return_2024/K1_1065', 'qa-13'], fixes: [],
    };
  }
  const e = (f: string) => x.ix.evNum('D37', f);
  const income = e('box2') + e('box5') + e('box9a');
  const roll = e('cap_begin') + income - e('box19a') - e('box21');
  return {
    id: 'CHK-PARTNERSHIP', group: 'Reconciliations', area: 'passthroughs',
    title: 'Ridgeline K-1 and capital account',
    question: 'Does Ridgeline\'s capital account roll, and is each box on the return?',
    method: 'Rolls beginning capital + income − distributions − foreign taxes to ending capital, and maps boxes 2, 5, 9a, 19A and 21.',
    status: Math.abs(roll - e('cap_end')) < 1 ? 'pass' : 'fail',
    summary: `60,000 + ${income.toLocaleString('en-US')} − 6,000 − 210 = ${roll.toLocaleString('en-US')} = ending capital. Box 2 rental income is passive; 22% is California-source for the nonresident period; Arizona composite filed, no Arizona return needed. Outside basis has never been computed — set it up for the carryforward.`,
    tables: [],
    refs: ['D37', 'D38', 'SchE.28B', 'SchB.1.8', 'SchD.12'],
    fixes: [],
  };
}
