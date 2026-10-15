import { Ctx, type Lot, bracketTax, fmt, lotGain, rd, round4 } from './core';
import type { Facts } from './federal';
import { californiaPenalty } from './penalty';

export function computeCalifornia(c: Ctx, lots: Lot[], f: Facts, ridgelineCaShare: number | null) {
  const p = c.p;
  const share = f.caResidentDays / f.yearDays;
  const shareTxt = `${f.caResidentDays}/${f.yearDays} California resident days`;

  // Schedule CA (540NR): column A federal, B subtractions, C additions, D = A − B + C, E California amount.
  const colD = (line: string) => c.n(`SchCA540NR.${line}.A`) - c.n(`SchCA540NR.${line}.B`) + c.n(`SchCA540NR.${line}.C`);
  const dInputs = (line: string) => ['A', 'B', 'C'].map((x) => `SchCA540NR.${line}.${x}`).filter((k) => c.has(k));

  c.def('SchCA540NR.1.A', c.n('F1040.1z'), 'Federal wages', ['F1040.1z']);
  c.def('SchCA540NR.1.D', colD('1'), 'A − B + C (California taxes employer HSA contributions)', dInputs('1'));
  // 1.E is a leaf (W-2 box 16) unless an approved change sets the California-source amount.

  c.def('SchCA540NR.2.A', c.n('F1040.2b'), 'Federal taxable interest', ['F1040.2b']);
  c.def('SchCA540NR.2.D', colD('2'), 'A − B (U.S. obligation interest is exempt)', dInputs('2'));
  c.def('SchCA540NR.2.E', rd(c.n('SchCA540NR.2.D') * share), `Column D × ${shareTxt}`, ['SchCA540NR.2.D', 'ref:param.ca_resident_days']);

  c.def('SchCA540NR.3.A', c.n('F1040.3b'), 'Federal ordinary dividends', ['F1040.3b']);
  c.def('SchCA540NR.3.D', colD('3'), 'No California difference', dInputs('3'));
  c.def('SchCA540NR.3.E', rd(c.n('SchCA540NR.3.D') * share), `Column D × ${shareTxt}`, ['SchCA540NR.3.D', 'ref:param.ca_resident_days']);

  c.def('SchCA540NR.4.A', c.n('F1040.4b'), 'Federal taxable IRA distributions', ['F1040.4b']);
  c.def('SchCA540NR.4.D', colD('4'), 'No California difference', dInputs('4'));

  c.def('SchCA540NR.7.A', c.n('F1040.7'), 'Federal capital gain', ['F1040.7']);
  c.def('SchCA540NR.7.D', colD('7'), 'No California difference', dInputs('7'));
  const caLots = lots.filter((l) => l.id !== 'SCORP' && l.sold <= f.caResidencyEnd);
  const lotPart = caLots.reduce((s, l) => s + lotGain(l), 0);
  const ptKeys = ['SchD.12', 'SchD.13', 'SchD.6', 'SchD.14', 'F7203.excess'];
  const pt = ptKeys.reduce((s, k) => s + c.n(k), 0);
  c.def('SchCA540NR.7.E', rd(lotPart + pt * share), `Sales dated during California residency (${caLots.length} lots, ${fmt(Math.round(lotPart))}) + pass-through gains, distributions and carryovers ${fmt(pt)} × ${shareTxt}`, ['SchCA540NR.7.D', ...ptKeys]);

  const caStudioDep = c.keys(/^FTB3885A\.STU-/).reduce((s, k) => s + c.n(k), 0);
  c.def('SchCA540NR.12.A', c.n('SchC.31'), 'Federal Schedule C profit', ['SchC.31']);
  c.def('SchCA540NR.12.C', c.n('F4562-C.22') - caStudioDep, `Federal depreciation ${fmt(c.n('F4562-C.22'))} − California depreciation ${fmt(caStudioDep)} (no special depreciation in California)`, ['F4562-C.22', ...c.keys(/^FTB3885A\.STU-/)]);
  c.def('SchCA540NR.12.D', colD('12'), 'A − B + C', dInputs('12'));
  c.def('SchCA540NR.12.E', rd(c.n('SchCA540NR.12.D') * share), `Column D × ${shareTxt}`, ['SchCA540NR.12.D']);

  c.def('SchCA540NR.17.A', c.n('SchE.41'), 'Federal Schedule E total', ['SchE.41']);
  c.def('SchCA540NR.17.D', colD('17'), 'A − B (California depreciation difference)', dInputs('17'));
  const fremont = c.n('SchE.22A') - c.n('SchCA540NR.17.B');
  const condo = c.n('SchE.22B') * share;
  const woodworks = c.n('SchE.28A') * share;
  const ridgeline = c.has('SchE.28B') ? c.n('SchE.28B') * share + c.n('SchE.28B') * (ridgelineCaShare ?? 0) * (1 - share) : 0;
  c.def('SchCA540NR.17.E', rd(fremont + condo + woodworks + ridgeline),
    `Sacramento rental 100% (${fmt(Math.round(fremont))}) + condo and K-1s × resident days` + (c.has('SchE.28B') ? ` + Ridgeline California share ${((ridgelineCaShare ?? 0) * 100).toFixed(0)}% for the nonresident period` : ''),
    ['SchE.22A', 'SchCA540NR.17.B', 'SchE.22B', 'SchE.28A', ...(c.has('SchE.28B') ? ['SchE.28B', 'ev-0971'] : [])]);

  const dLines = ['1', '2', '3', '4', '7', '12', '17'].map((l) => `SchCA540NR.${l}.D`);
  const eLines = ['1', '2', '3', '4', '7', '12', '17'].map((l) => `SchCA540NR.${l}.E`);
  c.def('SchCA540NR.22.D', dLines.reduce((s, k) => s + c.n(k), 0), 'Total income using California law', dLines);
  c.def('SchCA540NR.22.E', eLines.reduce((s, k) => s + c.n(k), 0), 'Total California-source income', eLines);
  c.def('SchCA540NR.26.D', c.n('Sch1.26'), 'Adjustments (½ SE tax, SEP, SE health insurance) — California conforms', ['Sch1.26']);
  c.def('SchCA540NR.26.E', rd(c.n('SchCA540NR.26.D') * share), `Column D × ${shareTxt}`, ['SchCA540NR.26.D']);

  // Form 540NR
  c.def('F540NR.13', c.n('F1040.11'), 'Federal AGI', ['F1040.11']);
  const totalAgi = c.def('F540NR.17', c.n('SchCA540NR.22.D') - c.n('SchCA540NR.26.D'), 'Total AGI using California law', ['SchCA540NR.22.D', 'SchCA540NR.26.D']);
  const caItem = c.n('SchA.10') + c.n('SchA.14') + c.n('SchA.5b');
  c.def('SchCA540NR.A.itemized', caItem, 'Mortgage interest + gifts + real estate taxes (no state income tax, no cap)', ['SchA.10', 'SchA.14', 'SchA.5b']);
  if (totalAgi > p.ca_itemized_phaseout_start) c.approx.set('SchCA540NR.A.itemized', 'Above the California itemized deduction phase-out start; limitation not modeled.');
  const ded = c.def('F540NR.18', Math.max(caItem, p.ca_std_deduction_mfj), caItem > p.ca_std_deduction_mfj ? 'California itemized deductions' : 'California standard deduction', ['SchCA540NR.A.itemized', 'ref:param.ca_std_deduction_mfj']);
  const totalTi = c.def('F540NR.19', Math.max(0, totalAgi - ded), 'Total AGI − deductions', ['F540NR.17', 'F540NR.18']);
  const tax31 = c.def('F540NR.31', rd(bracketTax(totalTi, p.ca_brackets_mfj)), 'California rate schedule on total taxable income', ['F540NR.19', 'ref:param.ca_brackets_mfj']);
  const caAgi = c.def('F540NR.32', c.n('SchCA540NR.22.E') - c.n('SchCA540NR.26.E'), 'California AGI', ['SchCA540NR.22.E', 'SchCA540NR.26.E']);
  const ratio34 = c.def('F540NR.34', round4(totalAgi ? caAgi / totalAgi : 0), 'California AGI ÷ total AGI', ['F540NR.32', 'F540NR.17']);
  const caTi = c.def('F540NR.35', Math.max(0, rd(caAgi - (totalAgi ? (ded * caAgi) / totalAgi : 0))), `California AGI − deductions × deduction percentage (${ratio34.toFixed(4)}, unrounded in the product)`, ['F540NR.32', 'F540NR.18', 'F540NR.34']);
  const rate36 = c.def('F540NR.36', round4(totalTi ? tax31 / totalTi : 0), 'Tax on total income ÷ total taxable income', ['F540NR.31', 'F540NR.19']);
  c.def('F540NR.37', rd(caTi * rate36), 'California taxable income × rate', ['F540NR.35', 'F540NR.36']);
  const credits = 2 * p.ca_personal_credit + (f.dependents.under17 + f.dependents.other) * p.ca_dependent_credit;
  c.def('F540NR.39', rd(totalTi ? (credits * caTi) / totalTi : 0), `Exemption credits ${fmt(credits)} × California taxable income ÷ total taxable income`, ['F540NR.35', 'F540NR.19']);
  c.def('F540NR.40', Math.max(0, c.n('F540NR.37') - c.n('F540NR.39')), 'Tax − exemption credits', ['F540NR.37', 'F540NR.39']);
  c.def('ScheduleS.credit', rd(f.oregonTaxPaid * share), `Oregon composite tax ${fmt(f.oregonTaxPaid)} × ${shareTxt}`, ['ev-0982']);
  const caTax = c.def('F540NR.64', Math.max(0, c.n('F540NR.40') - c.n('ScheduleS.credit') + c.n('F540NR.61')), 'Regular tax − other-state credit + AMT', ['F540NR.40', 'ScheduleS.credit', 'F540NR.61']);
  const pay = c.def('F540NR.78', c.n('F540NR.71') + c.n('F540NR.72') + c.n('F540NR.73'), 'Withholding + estimates + extension payment', ['F540NR.71', 'F540NR.72', 'F540NR.73']);
  c.def('F540NR.97', Math.max(0, pay - caTax), 'Overpaid tax', ['F540NR.78', 'F540NR.64'], 'Overpaid tax');
  if (caTax > pay || c.has('F540NR.111')) c.def('F540NR.111', Math.max(0, caTax - pay), 'Amount you owe', ['F540NR.64', 'F540NR.78'], 'Amount you owe');

  const required = Math.min(0.9 * caTax, 1.1 * f.caPriorYearTax);
  const sched = c.paymentSchedules.get('california') ?? f.caEstimates;
  c.def('FTB5805.penalty', californiaPenalty(required, c.n('F540NR.71'), sched, p.ca_underpayment_rate), 'Regular method, installments 30% / 40% / 0% / 30%', ['F540NR.64', 'F540NR.71', 'F540NR.72']);
}
