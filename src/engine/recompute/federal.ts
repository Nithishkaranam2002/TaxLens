import { Ctx, type Lot, bracketTax, fmt, lotGain, rd, round2, sliceTax } from './core';
import { BOX_TO_SCHD, boxTotals, fmtCents, lotLabel } from './lots';
import { federalPenalty } from './penalty';

/** Facts the recompute reads from the packet rather than from return lines. */
export interface Facts {
  odometerStart: number;
  odometerEnd: number;
  sepContribution: number;
  sehiPremiums: number;
  studio: { w2: number; ubia: number };
  woodworks: { w2: number; ubia: number };
  oregonTaxPaid: number;
  caResidentDays: number;
  yearDays: number;
  caResidencyEnd: string; // last day of California residency (YYYY-MM-DD)
  priorUnallowed: { A: number; B: number };
  federalEstimates: { date: string; amount: number }[];
  extensionPayment: { date: string; amount: number } | null;
  priorYearTax: number;
  priorYearAgi: number;
  caPriorYearTax: number;
  caWithholdingSchedule: number;
  caEstimates: { date: string; amount: number }[];
  dependents: { under17: number; other: number };
  isoAdjustment: number;
}

const sumKeys = (c: Ctx, keys: string[]) => keys.reduce((s, k) => s + c.n(k), 0);
const plus = (keys: string[]) => keys.join(' + ');

export interface FederalResult { lots: Lot[]; carry: Record<string, number>; pen: ReturnType<typeof federalPenalty> }

export function computeFederal(c: Ctx, lotsIn: Lot[], f: Facts): FederalResult {
  const p = c.p;

  // ---- Wages, interest, dividends, IRA ----
  c.def('F1040.1z', c.n('F1040.1a'), 'Total wages = Form 1040 line 1a', ['F1040.1a']);
  const interestPayers = c.keys(/^SchB\.1\.\d+$/);
  c.def('SchB.2', sumKeys(c, interestPayers), `Sum of interest payers (${interestPayers.length})`, interestPayers);
  c.def('SchB.4', c.n('SchB.2'), 'Taxable interest = Schedule B line 2', ['SchB.2']);
  c.def('F1040.2b', c.n('SchB.4'), 'Carried from Schedule B line 4', ['SchB.4']);
  const divPayers = c.keys(/^SchB\.5\.\d+$/);
  c.def('SchB.6', sumKeys(c, divPayers), `Sum of dividend payers (${divPayers.length})`, divPayers);
  c.def('F1040.3b', c.n('SchB.6'), 'Carried from Schedule B line 6', ['SchB.6']);
  c.def('F1040.4b', c.n('F8606.18'), 'Taxable conversion from Form 8606 line 18', ['F8606.18']);

  // ---- Schedule C ----
  c.def('SchC.5', c.n('SchC.1'), 'Gross receipts less returns and cost of goods sold (none)', ['SchC.1']);
  c.def('SchC.7', c.n('SchC.5'), 'Gross profit plus other income (none)', ['SchC.5']);
  const miles = c.n('SchC.44a');
  c.def('SchC.9', rd(miles * p.mileage_rate), `Business miles ${fmt(miles)} × ${p.mileage_rate.toFixed(2)} standard mileage rate`, ['SchC.44a', 'ref:param.mileage_rate']);
  if (c.has('SchC.44c')) {
    c.def('SchC.44c', rd(f.odometerEnd - f.odometerStart - miles - c.n('SchC.44b')), `Odometer ${fmt(f.odometerEnd)} − ${fmt(f.odometerStart)} − business miles − commuting`, ['SchC.44a', 'SchC.44b']);
  }
  const depKeys = ['F4562-C.12', 'F4562-C.14', 'F4562-C.19a'].filter((k) => c.has(k));
  c.def('F4562-C.22', sumKeys(c, depKeys), plus(depKeys), depKeys);
  c.def('SchC.13', c.n('F4562-C.22'), 'Carried from Form 4562 line 22', ['F4562-C.22']);
  const expenseKeys = c.keys(/^SchC\.(8|9|10|11|12|13|14|15|16a|16b|17|18|19|20a|20b|21|22|23|24a|24b|25|26|27a(\.\d+)?|27b)$/);
  c.def('SchC.28', sumKeys(c, expenseKeys), `Sum of expense lines (${expenseKeys.length})`, expenseKeys);
  c.def('SchC.29', c.n('SchC.7') - c.n('SchC.28'), 'Gross income − total expenses', ['SchC.7', 'SchC.28']);
  c.def('SchC.31', c.n('SchC.29') - c.n('SchC.30'), 'Tentative profit − business use of home', ['SchC.29', 'SchC.30']);

  // ---- Self-employment tax ----
  const profit = c.n('SchC.31');
  c.def('SchSE.2', profit, 'Net profit from Schedule C', ['SchC.31']);
  const se4a = profit >= 400 / p.se_factor ? rd(profit * p.se_factor) : 0;
  c.def('SchSE.4a', se4a, `Net profit × ${p.se_factor}`, ['SchSE.2']);
  c.def('SchSE.6', se4a, 'Total net earnings from self-employment', ['SchSE.4a']);
  c.def('SchSE.10', rd(Math.min(se4a, p.ss_wage_base) * 0.124), '12.4% of earnings up to the social security wage base (spouse has no W-2 wages)', ['SchSE.6', 'ref:param.ss_wage_base']);
  c.def('SchSE.11', rd(se4a * 0.029), '2.9% Medicare portion', ['SchSE.6']);
  c.def('SchSE.12', c.n('SchSE.10') + c.n('SchSE.11'), 'Social security + Medicare portions', ['SchSE.10', 'SchSE.11']);
  c.def('SchSE.13', rd(c.n('SchSE.12') / 2), 'One-half of self-employment tax', ['SchSE.12']);

  // ---- Adjustments to income ----
  // The engine carries ½ SE tax and the SEP limit unrounded into later computations (QBI), so do we.
  const halfSeExact = c.n('SchSE.12') / 2;
  const sepLimitExact = 0.2 * (profit - halfSeExact);
  const sepExact = Math.max(0, Math.min(f.sepContribution, sepLimitExact));
  c.def('Sch1.16', rd(sepExact), `Lesser of contribution ${fmt(f.sepContribution)} or 20% × (net profit − ½ SE tax) = ${fmt(round2(sepLimitExact))}`, ['SchC.31', 'SchSE.13']);
  const sehiLimit = profit - halfSeExact - sepExact;
  const sehiExact = Math.max(0, Math.min(f.sehiPremiums, sehiLimit));
  c.def('Sch1.17', rd(sehiExact), `Lesser of premiums ${fmt(f.sehiPremiums)} or net profit − ½ SE tax − SEP = ${fmt(round2(sehiLimit))}`, ['SchC.31', 'SchSE.13', 'Sch1.16']);
  c.def('Sch1.15', c.n('SchSE.13'), 'Deductible part of self-employment tax', ['SchSE.13']);
  const adjKeys = ['Sch1.13', 'Sch1.15', 'Sch1.16', 'Sch1.17'].filter((k) => c.has(k));
  c.def('Sch1.26', sumKeys(c, adjKeys), plus(adjKeys), adjKeys);

  // ---- Rentals (Schedule E page 1) and passive activity limits ----
  c.def('SchE.18A', c.n('F4562-E.total-A'), 'Depreciation schedule for property A', ['F4562-E.total-A']);
  c.def('SchE.18B', c.n('F4562-E.total-B'), 'Depreciation schedule for property B', ['F4562-E.total-B']);
  const expA = ['SchE.5A', 'SchE.6A', 'SchE.7A', 'SchE.8A', 'SchE.9A', 'SchE.10A', 'SchE.11A', 'SchE.12A', 'SchE.13A', 'SchE.14A', 'SchE.15A', 'SchE.16A', 'SchE.17A', 'SchE.18A', 'SchE.19A'].filter((k) => c.has(k));
  const expB = expA.map((k) => k.replace(/A$/, 'B')).concat(['SchE.19B']).filter((k, i, a) => c.has(k) && a.indexOf(k) === i);
  c.def('SchE.20A', sumKeys(c, expA), plus(expA), expA);
  c.def('SchE.20B', sumKeys(c, expB), plus(expB), expB);
  c.def('SchE.21A', c.n('SchE.3A') - c.n('SchE.20A'), 'Rents − total expenses', ['SchE.3A', 'SchE.20A']);
  c.def('SchE.21B', c.n('SchE.3B') - c.n('SchE.20B'), 'Rents − total expenses', ['SchE.3B', 'SchE.20B']);

  // Form 4797 (condo sale) — recomputed from its leaves.
  c.def('F4797.24', c.n('F4797.22') - c.n('F4797.23'), 'Cost or basis plus expense of sale − depreciation allowed', ['F4797.22', 'F4797.23']);
  c.def('F4797.25', c.n('F4797.21') - c.n('F4797.24'), 'Gross sales price − adjusted basis', ['F4797.21', 'F4797.24']);
  c.def('F4797.32', c.n('F4797.25') - c.n('F4797.26g'), 'Total gain − ordinary recapture', ['F4797.25', 'F4797.26g']);
  c.def('F4797.7', c.n('F4797.32'), 'Net section 1231 gain', ['F4797.32']);
  c.def('F4797.9', Math.max(0, c.n('F4797.7') - c.n('F4797.8')), 'Net section 1231 gain − nonrecaptured prior losses', ['F4797.7', 'F4797.8']);

  // K-1 income and the passive activity computation (Form 8582).
  const k1Keys = c.keys(/^SchE\.28[A-Z]$/);
  c.def('SchE.32', sumKeys(c, k1Keys), plus(k1Keys), k1Keys);
  const r21A = c.n('SchE.21A');
  const r21B = c.n('SchE.21B');
  c.def('F8582.1a', Math.max(0, r21A) + Math.max(0, r21B) + c.n('F4797.9'), 'Rental activities with net income, including the Form 4797 gain on the disposed condo', ['F4797.9', 'SchE.21A', 'SchE.21B']);
  c.def('F8582.1b', Math.min(0, r21A) + Math.min(0, r21B), 'Rental activities with net loss', ['SchE.21A', 'SchE.21B']);
  c.def('F8582.3a', c.n('SchE.32'), 'Other passive activities with net income (Schedule K-1s)', ['SchE.32']);
  c.def('F8582.4', c.n('F8582.1a') + c.n('F8582.1b') + c.n('F8582.1c') + c.n('F8582.3a'), 'Lines 1a + 1b + 1c + 3a', ['F8582.1a', 'F8582.1b', 'F8582.1c', 'F8582.3a']);
  if (c.n('F8582.4') >= 0) {
    c.def('SchE.22A', r21A - f.priorUnallowed.A, `All losses allowed: current ${fmt(r21A)} + prior unallowed ${fmt(-f.priorUnallowed.A)}`, ['SchE.21A', 'py:/carryovers_into_2025/passive_1450_fremont']);
    c.def('SchE.22B', r21B - f.priorUnallowed.B, `All losses allowed (disposed in a taxable sale): current ${fmt(r21B)} + prior unallowed ${fmt(-f.priorUnallowed.B)}`, ['SchE.21B', 'py:/carryovers_into_2025/passive_1200_barton_hills']);
  } else {
    c.approx.set('SchE.22A', 'Net passive loss: allocation of unallowed losses needs the full Form 8582 worksheets.');
    c.approx.set('SchE.22B', 'Net passive loss: allocation of unallowed losses needs the full Form 8582 worksheets.');
  }
  c.def('SchE.26', c.n('SchE.22A') + c.n('SchE.22B'), 'Total rental real estate income or loss', ['SchE.22A', 'SchE.22B']);
  c.def('SchE.41', c.n('SchE.26') + c.n('SchE.32'), 'Rental real estate + partnerships and S corporations', ['SchE.26', 'SchE.32']);

  // ---- S corporation stock basis (Form 7203) ----
  c.def('F7203.4', c.n('F7203.3a') + c.n('F7203.3c'), 'Total increases', ['F7203.3a', 'F7203.3c']);
  c.def('F7203.5', c.n('F7203.1') + c.n('F7203.4'), 'Beginning basis + increases', ['F7203.1', 'F7203.4']);
  c.def('F7203.7', Math.max(0, c.n('F7203.5') - c.n('F7203.6')), 'Basis after distributions (not below zero)', ['F7203.5', 'F7203.6']);
  c.def('F7203.15', c.n('F7203.7'), 'Ending stock basis', ['F7203.7']);
  c.def('F7203.excess', Math.max(0, c.n('F7203.6') - c.n('F7203.5')), 'Distributions in excess of basis (long-term capital gain)', ['F7203.5', 'F7203.6']);

  // ---- Form 8949 and Schedule D ----
  const lots = lotsIn.map((l) =>
    l.id === 'SCORP' ? { ...l, proceeds: c.n('F7203.excess'), basis: 0 } : l,
  );
  for (const l of lots) {
    const key = `F8949.${l.box}.${l.id}`;
    c.def(key, lotGain(l), 'Proceeds − basis + adjustment', l.id === 'SCORP' ? ['F7203.excess'] : [], lotLabel(l));
    c.labels.set(key, lotLabel(l));
  }
  // Remove lot lines that moved boxes.
  for (const k of c.keys(/^F8949\.[A-L]\.(?!total$)/)) {
    const [, box, id] = k.split('.');
    if (!lots.some((l) => l.id === id && l.box === box)) { c.values.delete(k); c.removed.add(k); }
  }
  const totals = boxTotals(lots);
  const schd: Record<string, number> = {};
  for (const t of totals.values()) {
    const key = `F8949.${t.box}.total`;
    c.def(key, rd(t.gain), `Sum of ${t.count} lots`, lots.filter((l) => l.box === t.box).map((l) => `F8949.${t.box}.${l.id}`),
      `Box ${t.box} totals (proceeds ${fmtCents(t.proceeds)}; basis ${fmtCents(t.basis)}; adjustments ${fmtCents(t.adj)})`);
    c.labels.set(key, `Box ${t.box} totals (proceeds ${fmtCents(t.proceeds)}; basis ${fmtCents(t.basis)}; adjustments ${fmtCents(t.adj)})`);
    const line = BOX_TO_SCHD[t.box];
    schd[line] = (schd[line] ?? 0) + rd(t.gain);
  }
  for (const k of c.keys(/^F8949\.[A-L]\.total$/)) {
    if (!totals.has(k.split('.')[1])) { c.values.delete(k); c.removed.add(k); }
  }
  for (const line of ['SchD.1b', 'SchD.2', 'SchD.3', 'SchD.8b', 'SchD.9', 'SchD.10']) {
    if (schd[line] !== undefined || c.has(line)) {
      const boxes = Object.entries(BOX_TO_SCHD).filter(([b, l]) => l === line && totals.has(b)).map(([b]) => `F8949.${b}.total`);
      c.def(line, schd[line] ?? 0, `Form 8949 ${boxes.map((b) => 'box ' + b.split('.')[1]).join(' + ') || '(no lots)'}`, boxes);
    }
  }
  const stKeys = ['SchD.1b', 'SchD.2', 'SchD.3', 'SchD.6'].filter((k) => c.has(k));
  c.def('SchD.7', sumKeys(c, stKeys), plus(stKeys), stKeys);
  c.def('SchD.11', c.n('F4797.9'), 'Gain from Form 4797', ['F4797.9']);
  const ltKeys = ['SchD.8b', 'SchD.9', 'SchD.10', 'SchD.11', 'SchD.12', 'SchD.13', 'SchD.14'].filter((k) => c.has(k));
  c.def('SchD.15', sumKeys(c, ltKeys), plus(ltKeys), ltKeys);
  c.def('SchD.16', c.n('SchD.7') + c.n('SchD.15'), 'Net short-term + net long-term', ['SchD.7', 'SchD.15']);
  c.def('SchD.19', Math.max(0, Math.min(c.n('F4797.23'), c.n('F4797.25'))), 'Straight-line depreciation allowed, limited to the gain', ['F4797.23', 'F4797.25']);
  const d16 = c.n('SchD.16');
  c.def('F1040.7', d16 >= 0 ? d16 : Math.max(d16, -3000), d16 >= 0 ? 'Carried from Schedule D line 16' : 'Capital loss limited to 3,000', ['SchD.16']);

  // ---- Schedule 1 and AGI ----
  c.def('Sch1.3', c.n('SchC.31'), 'Business income (Schedule C)', ['SchC.31']);
  c.def('Sch1.5', c.n('SchE.41'), 'Schedule E total', ['SchE.41']);
  c.def('Sch1.10', c.n('Sch1.3') + c.n('Sch1.5'), 'Additional income', ['Sch1.3', 'Sch1.5']);
  c.def('F1040.8', c.n('Sch1.10'), 'Additional income from Schedule 1', ['Sch1.10']);
  const incomeKeys = ['F1040.1z', 'F1040.2b', 'F1040.3b', 'F1040.4b', 'F1040.7', 'F1040.8'];
  c.def('F1040.9', sumKeys(c, incomeKeys), plus(incomeKeys), incomeKeys);
  c.def('F1040.10', c.n('Sch1.26'), 'Adjustments from Schedule 1', ['Sch1.26']);
  const agi = c.def('F1040.11', c.n('F1040.9') - c.n('F1040.10'), 'Total income − adjustments', ['F1040.9', 'F1040.10']);

  // ---- Schedule A ----
  c.def('SchA.5d', c.n('SchA.5a') + c.n('SchA.5b'), 'State income taxes + real estate taxes', ['SchA.5a', 'SchA.5b']);
  const cap = Math.max(p.salt_cap_floor, p.salt_cap - p.salt_cap_phase_rate * Math.max(0, agi - p.salt_cap_phase_start));
  c.def('SchA.5e', rd(Math.min(c.n('SchA.5d'), cap)), `Lesser of taxes or the cap (${fmt(rd(cap))} at this AGI)`, ['SchA.5d', 'F1040.11', 'ref:param.salt_cap']);
  c.def('SchA.7', c.n('SchA.5e'), 'Total taxes', ['SchA.5e']);
  c.def('SchA.8e', c.n('SchA.8a') + c.n('SchA.8c'), 'Home mortgage interest and points', ['SchA.8a', 'SchA.8c']);
  c.def('SchA.10', c.n('SchA.8e'), 'Total interest', ['SchA.8e']);
  const noncash = c.keys(/^F8283\./);
  c.def('SchA.12', sumKeys(c, noncash), plus(noncash), noncash);
  c.def('SchA.14', c.n('SchA.11') + c.n('SchA.12'), 'Cash + noncash gifts', ['SchA.11', 'SchA.12']);
  c.def('SchA.17', c.n('SchA.7') + c.n('SchA.10') + c.n('SchA.14'), 'Taxes + interest + gifts', ['SchA.7', 'SchA.10', 'SchA.14']);
  const choice = c.choices.get('deduction');
  const itemized = c.n('SchA.17');
  const useStd = choice === 'standard' || (choice !== 'itemized' && p.std_deduction_mfj > itemized);
  c.def('F1040.12', useStd ? p.std_deduction_mfj : itemized, useStd ? `Standard deduction ${fmt(p.std_deduction_mfj)}` : `Itemized ${fmt(itemized)} (larger than the standard deduction ${fmt(p.std_deduction_mfj)})`, ['SchA.17', 'ref:param.std_deduction_mfj']);

  // ---- QBI deduction (Form 8995-A) ----
  const sehiUsed = c.forced.has('Sch1.17') ? c.n('Sch1.17') : sehiExact;
  const sepUsed = c.forced.has('Sch1.16') ? c.n('Sch1.16') : sepExact;
  c.def('F8995.2.1', rd(profit - halfSeExact - sepUsed - sehiUsed), 'Net profit − ½ SE tax − SEP − SE health insurance (unrounded, as the engine carries them)', ['SchC.31', 'SchSE.13', 'Sch1.16', 'Sch1.17']);
  const tiBeforeQbi = c.def('F8995.33', agi - c.n('F1040.12'), 'AGI − deduction', ['F1040.11', 'F1040.12']);
  const qbiComponent = (qbi: number, w2: number, ubia: number) => {
    const full = 0.2 * Math.max(0, qbi);
    if (tiBeforeQbi <= p.qbi_threshold) return full;
    const limit = Math.max(0.5 * w2, 0.25 * w2 + 0.025 * ubia);
    if (full <= limit) return full;
    const ratio = Math.min(1, (tiBeforeQbi - p.qbi_threshold) / p.qbi_range);
    return full - ratio * (full - limit);
  };
  c.def('F8995.15.1', rd(qbiComponent(c.n('F8995.2.1'), f.studio.w2, f.studio.ubia)), tiBeforeQbi <= p.qbi_threshold ? '20% of QBI (taxable income below the threshold, no wage limit)' : '20% of QBI, wage/UBIA limit phased in', ['F8995.2.1', 'F8995.33', 'ref:param.qbi_threshold']);
  c.def('F8995.15.2', rd(qbiComponent(c.n('F8995.2.2'), f.woodworks.w2, f.woodworks.ubia)), tiBeforeQbi <= p.qbi_threshold ? '20% of QBI (taxable income below the threshold)' : '20% of QBI, wage/UBIA limit phased in', ['F8995.2.2', 'F8995.33']);
  c.def('F8995.27', c.n('F8995.15.1') + c.n('F8995.15.2'), 'Total QBI component', ['F8995.15.1', 'F8995.15.2']);
  const netCapGain = Math.max(0, Math.min(c.n('SchD.15'), c.n('SchD.16'))) + c.n('F1040.3a');
  c.def('F8995.34', netCapGain, 'Qualified dividends + net capital gain', ['F1040.3a', 'SchD.15', 'SchD.16']);
  c.def('F8995.36', rd(0.2 * Math.max(0, tiBeforeQbi - netCapGain)), '20% × (taxable income before QBI − net capital gain)', ['F8995.33', 'F8995.34']);
  c.def('F8995.39', Math.min(c.n('F8995.27'), c.n('F8995.36')), 'Lesser of QBI component and income limitation', ['F8995.27', 'F8995.36']);
  c.def('F1040.13', c.n('F8995.39'), 'QBI deduction', ['F8995.39']);
  c.def('F1040.14', c.n('F1040.12') + c.n('F1040.13'), 'Deduction + QBI deduction', ['F1040.12', 'F1040.13']);
  const ti = c.def('F1040.15', Math.max(0, agi - c.n('F1040.14')), 'AGI − total deductions', ['F1040.11', 'F1040.14']);

  // ---- Regular tax: Schedule D tax worksheet ----
  const ltcgNet = Math.max(0, Math.min(c.n('SchD.15'), c.n('SchD.16')));
  const prefIncome = Math.min(ti, ltcgNet + c.n('F1040.3a'));
  const unrecap = Math.min(c.n('SchD.19'), ltcgNet, prefIncome);
  const regularTax = (() => {
    const ordinary = ti - prefIncome;
    let t = bracketTax(ordinary, p.brackets_mfj);
    t += sliceTax(ordinary, ordinary + unrecap, p.brackets_mfj, 0.25);
    const start = ordinary + unrecap;
    const rest = prefIncome - unrecap;
    const zeroTop = Math.max(start, Math.min(start + rest, p.ltcg_0_top));
    const fifteenTop = Math.max(zeroTop, Math.min(start + rest, p.ltcg_15_top));
    t += (fifteenTop - zeroTop) * 0.15 + (start + rest - fifteenTop) * 0.2;
    return Math.min(t, bracketTax(ti, p.brackets_mfj));
  })();
  c.def('F1040.16', rd(regularTax), `Schedule D tax worksheet: ordinary ${fmt(ti - prefIncome)} at bracket rates, unrecaptured §1250 ${fmt(unrecap)} at no more than 25%, other gains and qualified dividends ${fmt(prefIncome - unrecap)} at 0/15/20%`, ['F1040.15', 'F1040.3a', 'SchD.15', 'SchD.19', 'ref:param.brackets_mfj']);

  // ---- Foreign tax credit ----
  const ftc = Math.min(c.n('Sch3.1'), c.n('F1040.16'));
  c.def('Sch3.1', ftc, 'Foreign taxes paid (de minimis election, no Form 1116)', []);

  // ---- AMT (Form 6251) ----
  c.def('F6251.1', ti, 'Taxable income', ['F1040.15']);
  c.def('F6251.2a', useStd ? p.std_deduction_mfj : c.n('SchA.7'), useStd ? 'Standard deduction added back' : 'Taxes from Schedule A line 7', [useStd ? 'F1040.12' : 'SchA.7']);
  const amtCompute = (isoAdj: number) => {
    const amti = ti + c.n('F6251.2a') + isoAdj;
    const exemption = Math.max(0, p.amt_exemption - 0.25 * Math.max(0, amti - p.amt_phaseout_start));
    const base = Math.max(0, amti - exemption);
    const capPart = Math.min(base, prefIncome);
    const u = Math.min(unrecap, capPart);
    const ord = base - capPart;
    const tOrd = Math.min(ord, p.amt_28_start) * 0.26 + Math.max(0, ord - p.amt_28_start) * 0.28;
    const rest = capPart - u;
    const zeroTop = Math.max(ord, Math.min(ord + rest, p.ltcg_0_top));
    const fifteenTop = Math.max(zeroTop, Math.min(ord + rest, p.ltcg_15_top));
    const tCap = u * 0.25 + (fifteenTop - zeroTop) * 0.15 + (ord + rest - fifteenTop) * 0.2;
    const all = Math.min(base, p.amt_28_start) * 0.26 + Math.max(0, base - p.amt_28_start) * 0.28;
    const tmt = Math.min(tOrd + tCap, all);
    return { amti, exemption, base, tmt };
  };
  const amt = amtCompute(c.n('F6251.2i'));
  c.def('F6251.4', amt.amti, 'Taxable income + adjustments', ['F6251.1', 'F6251.2a', 'F6251.2i']);
  c.def('F6251.5', rd(amt.exemption), 'Exemption less 25% of AMTI over the phase-out start', ['F6251.4', 'ref:param.amt_exemption']);
  c.def('F6251.6', c.n('F6251.4') - c.n('F6251.5'), 'AMTI − exemption', ['F6251.4', 'F6251.5']);
  c.def('F6251.7', rd(amt.tmt), '26%/28% on ordinary AMTI, preferential rates on capital gains (Part III)', ['F6251.6', 'F1040.3a', 'SchD.15', 'SchD.19']);
  c.def('F6251.8', c.n('Sch3.1'), 'AMT foreign tax credit', ['Sch3.1']);
  c.def('F6251.9', c.n('F6251.7') - c.n('F6251.8'), 'Tentative minimum tax', ['F6251.7', 'F6251.8']);
  c.def('F6251.10', c.n('F1040.16') - c.n('Sch3.1'), 'Regular tax − foreign tax credit', ['F1040.16', 'Sch3.1']);
  c.def('F6251.11', Math.max(0, c.n('F6251.9') - c.n('F6251.10')), 'Tentative minimum tax − regular tax', ['F6251.9', 'F6251.10']);
  c.def('Sch2.1', c.n('F6251.11'), 'Alternative minimum tax', ['F6251.11']);
  c.def('Sch2.3', c.n('Sch2.1'), 'Total Part I', ['Sch2.1']);
  c.def('F1040.17', c.n('Sch2.3'), 'From Schedule 2 line 3', ['Sch2.3']);
  c.def('F1040.18', c.n('F1040.16') + c.n('F1040.17'), 'Tax + AMT', ['F1040.16', 'F1040.17']);
  // Minimum tax credit carryforward: AMT minus the AMT that exclusion items alone would cause.
  const exclusionOnly = amtCompute(0);
  const amtExclusionOnly = Math.max(0, rd(exclusionOnly.tmt) - c.n('Sch3.1') - c.n('F6251.10'));
  const mtc = Math.max(0, c.n('F6251.11') - amtExclusionOnly);

  // ---- Credits ----
  c.def('F8812.1', agi, 'Modified AGI', ['F1040.11']);
  c.def('F8812.5', c.n('F8812.4') * p.ctc_per_child, `Qualifying children × ${fmt(p.ctc_per_child)}`, ['F8812.4']);
  c.def('F8812.7', c.n('F8812.6') * p.odc_per_dependent, `Other dependents × ${p.odc_per_dependent}`, ['F8812.6']);
  c.def('F8812.8', c.n('F8812.5') + c.n('F8812.7'), 'Lines 5 + 7', ['F8812.5', 'F8812.7']);
  c.def('F8812.11', Math.ceil(Math.max(0, agi - p.ctc_phaseout_start) / 1000) * 50, `50 for each 1,000 (or part) of modified AGI over ${fmt(p.ctc_phaseout_start)}`, ['F8812.1', 'ref:param.ctc_phaseout_start']);
  c.def('F8812.12', Math.max(0, c.n('F8812.8') - c.n('F8812.11')), 'Credit after phase-out', ['F8812.8', 'F8812.11']);
  const [aLo, aHi] = p.aotc_phaseout;
  const aotcFactor = Math.max(0, Math.min(1, (aHi - agi) / (aHi - aLo)));
  const q = c.n('F8863.27');
  c.def('F8863.30', rd(Math.min(2000, q) + 0.25 * Math.min(2000, Math.max(0, q - 2000))), '100% of the first 2,000 + 25% of the next 2,000', ['F8863.27']);
  c.def('F8863.7', rd(c.n('F8863.30') * aotcFactor), `Phase-out between modified AGI ${fmt(aLo)} and ${fmt(aHi)}`, ['F8863.30', 'F1040.11']);
  if (c.n('F8863.7') > 0) c.approx.set('F8863.7', 'AOTC allowed: its refundable 40% is not mapped by the engine.');
  const care = c.keys(/^F2441\.1[a-z]$/);
  c.def('F2441.2', sumKeys(c, care), plus(care), care);
  const careLimit = Math.max(0, p.dep_care_limit_one - c.n('F2441.12'));
  c.def('F2441.31', rd(Math.min(careLimit, c.n('F2441.2')) * 0.2), `Limit ${fmt(p.dep_care_limit_one)} − excluded benefits ${fmt(c.n('F2441.12'))}, × 20%`, ['F2441.2', 'F2441.12']);
  const nonref = ['Sch3.1', 'F2441.31'];
  c.def('Sch3.8', sumKeys(c, nonref), 'Foreign tax credit + dependent care credit', nonref);
  c.def('F1040.19', c.n('F8812.12'), 'Child tax credit / credit for other dependents', ['F8812.12']);
  c.def('F1040.20', c.n('Sch3.8'), 'Schedule 3 line 8', ['Sch3.8']);
  c.def('F1040.22', Math.max(0, c.n('F1040.18') - c.n('F1040.19') - c.n('F1040.20')), 'Line 18 − credits', ['F1040.18', 'F1040.19', 'F1040.20']);

  // ---- Other taxes ----
  c.def('Sch2.4', c.n('SchSE.12'), 'Self-employment tax', ['SchSE.12']);
  const medWages = c.n('F8959.1');
  const thr = p.addl_medicare_threshold;
  c.def('F8959.7', rd(Math.max(0, medWages - thr) * 0.009), '0.9% of Medicare wages over the threshold', ['F8959.1', 'F8959.5']);
  c.def('F8959.8', c.n('SchSE.6'), 'Self-employment income', ['SchSE.6']);
  c.def('F8959.13', rd(Math.max(0, c.n('F8959.8') - Math.max(0, thr - medWages)) * 0.009), '0.9% of SE income over the threshold reduced by wages', ['F8959.8', 'F8959.1']);
  c.def('F8959.18', c.n('F8959.7') + c.n('F8959.13'), 'Total additional Medicare tax', ['F8959.7', 'F8959.13']);
  c.def('Sch2.11', c.n('F8959.18'), 'Additional Medicare tax', ['F8959.18']);
  c.def('F8960.1', c.n('F1040.2b'), 'Taxable interest', ['F1040.2b']);
  c.def('F8960.2', c.n('F1040.3b'), 'Ordinary dividends', ['F1040.3b']);
  c.def('F8960.4a', c.n('SchE.41'), 'Rental real estate, partnerships, S corporations', ['SchE.41']);
  c.def('F8960.5a', c.n('F1040.7'), 'Net gain from disposition of property', ['F1040.7']);
  c.def('F8960.8', c.n('F8960.1') + c.n('F8960.2') + c.n('F8960.4a') + c.n('F8960.5a'), 'Total investment income', ['F8960.1', 'F8960.2', 'F8960.4a', 'F8960.5a']);
  c.def('F8960.12', c.n('F8960.8'), 'Net investment income', ['F8960.8']);
  c.def('F8960.13', agi, 'Modified AGI', ['F1040.11']);
  c.def('F8960.17', rd(0.038 * Math.max(0, Math.min(c.n('F8960.12'), agi - p.niit_threshold))), '3.8% of the lesser of net investment income or MAGI over the threshold', ['F8960.12', 'F8960.13', 'F8960.14']);
  c.def('Sch2.12', c.n('F8960.17'), 'Net investment income tax', ['F8960.17']);
  c.def('Sch2.21', c.n('Sch2.4') + c.n('Sch2.11') + c.n('Sch2.12'), 'SE tax + additional Medicare + NIIT', ['Sch2.4', 'Sch2.11', 'Sch2.12']);
  c.def('F1040.23', c.n('Sch2.21'), 'Other taxes from Schedule 2', ['Sch2.21']);
  const totalTax = c.def('F1040.24', c.n('F1040.22') + c.n('F1040.23'), 'Tax after credits + other taxes', ['F1040.22', 'F1040.23']);

  // ---- Payments ----
  c.def('F1040.25d', c.n('F1040.25a'), 'Total withholding', ['F1040.25a']);
  c.def('Sch3.15', c.n('Sch3.10') + c.n('Sch3.11'), 'Extension payment + excess social security', ['Sch3.10', 'Sch3.11']);
  c.def('F1040.31', c.n('Sch3.15'), 'From Schedule 3 line 15', ['Sch3.15']);
  const payments = c.def('F1040.33', c.n('F1040.25d') + c.n('F1040.26') + c.n('F1040.31'), 'Withholding + estimates + other payments', ['F1040.25d', 'F1040.26', 'F1040.31']);
  c.def('F1040.37', Math.max(0, totalTax - payments), 'Total tax − total payments', ['F1040.24', 'F1040.33'], 'Amount you owe');
  if (payments > totalTax || c.has('F1040.34')) {
    c.def('F1040.34', Math.max(0, payments - totalTax), 'Total payments − total tax', ['F1040.33', 'F1040.24'], 'Amount overpaid (refund)');
  }

  // ---- Underpayment penalty (Form 2210) ----
  const required = rd(Math.min(0.9 * totalTax, 1.1 * f.priorYearTax));
  c.def('F2210.8', required, `Lesser of 90% of 2025 tax (${fmt(rd(0.9 * totalTax))}) or 110% of 2024 tax (${fmt(rd(1.1 * f.priorYearTax))})`, ['F1040.24', 'py:/return_2024/lines/F1040.24']);
  const sched = c.paymentSchedules.get('federal') ?? f.federalEstimates;
  const pen = federalPenalty(required, c.n('F1040.25d'), sched, f.extensionPayment, p.fed_underpayment_rate);
  c.def('F2210.19', pen.penalty, `Four installments of ${fmt(round2(required / 4))}; withholding treated as paid evenly; ${p.fed_underpayment_rate * 100}% a year to 2026-04-15`, ['F2210.8', 'F1040.25d', 'F1040.26']);
  const method = c.choices.get('penalty_method');
  c.def('F1040.38', c.n('F2210.19'), method === 'annualized' ? 'Annualized method gives no lower installment in any period; regular method amount' : 'Regular method', ['F2210.19', 'F2210.AI']);

  const carry = {
    minimum_tax_credit: mtc,
    sep_contribution_not_deductible: Math.max(0, f.sepContribution - c.n('Sch1.16')),
    capital_loss: Math.min(0, d16 - c.n('F1040.7')),
    scorp_stock_basis_end: c.n('F7203.15'),
  };
  return { lots, carry, pen };
}
