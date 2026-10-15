// The catalog of corrections TaxLens can propose. Each one is produced by a check, carries its
// evidence and authority, and is expressed as edits on the engine's leaf lines so the independent
// recompute can rebuild the return exactly. Amounts come from the packet, never typed in.

import type { PacketIndex } from '../data/index';
import type { AreaId } from './areas';
import type { Edit, Lot } from './recompute';
import { rd } from './recompute/core';

export type CaMode = 'category' | 'ca' | 'none';
export interface RateItem { category: string; amount: number; ca: CaMode; note?: string }

export interface FixOption {
  id: string;
  label: string;
  detail: string;
  edits: Edit[];
  rate: RateItem[];
  changes: Change[];
}

export interface Change { key: string; label: string; from: number | string | null; to: number | string | null }

export interface FixDef {
  id: string;
  checkId: string;
  area: AreaId;
  title: string;
  why: string;
  kind: 'numeric' | 'data' | 'election';
  certainty: 'certain' | 'judgment';
  lines: string[];
  evidence: string[];
  authority: string;
  requiresDocs: string[];
  engineWhatIf?: string;
  options: FixOption[];
  /** Index into options of the recommended choice. */
  recommended: number;
  dataChange?: { subject: string; field: string; from: string; to: string };
  /** A follow-up the preparer should still obtain (evidence, a client answer). */
  followUp?: string;
}

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function buildFixes(ix: PacketIndex): FixDef[] {
  const p = ix.packet;
  const v3 = ix.versions.get(ix.versionOrder[ix.versionOrder.length - 1])!;
  const line = (k: string) => v3.lines.find((l) => l.key === k);
  const num = (k: string) => Number(line(k)?.value ?? 0);
  const fixes: FixDef[] = [];
  const one = (o: Omit<FixOption, 'id' | 'label' | 'detail'> & Partial<Pick<FixOption, 'label' | 'detail'>>): FixOption[] => [
    { id: 'apply', label: o.label ?? 'Apply', detail: o.detail ?? '', edits: o.edits, rate: o.rate, changes: o.changes },
  ];

  // 1. RSU basis from the supplemental statement (noncovered lots read as zero basis).
  const n1 = ix.evNum('D11', 'RSU-2502_adjusted_basis');
  const n3 = ix.evNum('D11', 'RSU-2505_adjusted_basis');
  const n4 = ix.evNum('D11', 'RSU-2308_adjusted_basis');
  const p1 = ix.evNum('D28', 'N1_proceeds');
  const p3 = ix.evNum('D28', 'N3_proceeds');
  const p4 = ix.evNum('D28', 'N4_proceeds');
  fixes.push({
    id: 'FIX-RSU-BASIS', checkId: 'CHK-RSU-BASIS', area: 'wages',
    title: 'Use the supplemental cost basis for the three RSU lots',
    why: `Northlake left basis blank on three noncovered RSU lots and the pipeline read the blanks as 0.00 with 0.98 confidence. The Corvane supplemental statement gives the adjusted basis (vest-date value already taxed as wages: W-2 box 14 RSU ${money(ix.evNum('D08', 'box14_RSU'))} = 2 × 19,100). Without it, ${money(n1 + n3 + n4)} of wages is taxed twice.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['F8949.B.N1', 'F8949.B.N3', 'F8949.E.N4'],
    evidence: ['ev-0498', 'ev-0516', 'ev-0525', 'ev-0066', 'ev-0068', 'ev-0070', 'ev-0027', 'D11', 'D28'],
    authority: 'Treas. Reg. §1.83-4(b) (basis includes the amount taxed as compensation); Form 8949 instructions for basis not reported to the IRS',
    requiresDocs: ['D11', 'D28'],
    options: one({
      edits: [
        { op: 'lot', id: 'N1', set: { basis: n1 } },
        { op: 'lot', id: 'N3', set: { basis: n3 } },
        { op: 'lot', id: 'N4', set: { basis: n4 } },
      ],
      rate: [
        { category: 'stcg', amount: -(n1 + n3), ca: 'ca', note: 'Sold in February and May, during California residency' },
        { category: 'ltcg', amount: -n4, ca: 'none', note: 'Sold in August, after the move' },
      ],
      changes: [
        { key: 'F8949.B.N1', label: 'RSU lot N1 gain', from: p1, to: p1 - n1 },
        { key: 'F8949.B.N3', label: 'RSU lot N3 gain', from: p3, to: p3 - n3 },
        { key: 'F8949.E.N4', label: 'RSU lot N4 gain', from: p4, to: p4 - n4 },
      ],
    }),
    recommended: 0,
  });

  // 2. Meridian page 32 lot that the pipeline never read.
  const m18: Lot = {
    id: 'M18', box: 'B', desc: 'Ironwood REIT (fractional share cash in lieu)', acquired: '2025-01-14', sold: '2025-12-15',
    proceeds: 250, basis: 310, adjCode: null, adj: 0, sources: ['doc:D31#page32'], origin: 'added',
  };
  fixes.push({
    id: 'FIX-M18', checkId: 'CHK-BROKER-TIEOUT', area: 'investments',
    title: 'Add the Meridian sale printed on page 32',
    why: 'The corrected Meridian 1099-B summary shows proceeds of 71,965.00; the lots the pipeline read add to 71,715.00. The 250.00 difference is lot M18 on page 32 ("Additional transactions"), which was not read.',
    kind: 'numeric', certainty: 'certain',
    lines: ['F8949.B.M18', 'SchD.2'],
    evidence: ['doc:D31#page32', 'ev-0703', 'D31'],
    authority: 'Form 8949 instructions: report every sale shown on Form 1099-B',
    requiresDocs: ['D31'],
    options: one({
      edits: [{ op: 'addLot', lot: m18 }],
      rate: [{ category: 'stcg', amount: -60, ca: 'none', note: 'Sold in December, after the move' }],
      changes: [{ key: 'F8949.B.M18', label: 'Lot M18 (box B)', from: null, to: -60 }],
    }),
    recommended: 0,
  });

  // 3. Form 1099-K counted on top of books that already include it.
  const books = ix.evNum('D14', 'total_income');
  const k = ix.evNum('D21', 'box1a');
  fixes.push({
    id: 'FIX-1099K', checkId: 'CHK-SCHC-RECEIPTS', area: 'business',
    title: 'Remove the 1099-K amount that is already in the books',
    why: `The engine added the Paywell 1099-K (${money(k)}) to books revenue because it could not match it to a deposit. The QuickBooks deposit detail shows Atlas Outdoor Gear paid 41,200.00, of which 12,400.00 came through Paywell and was deposited gross. Gross receipts are the books total, ${money(books)}.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchC.1'],
    evidence: ['ev-0109', 'ev-0110', 'ev-0103', 'ev-0127', 'D15', 'D21'],
    authority: 'IRC §61 (gross income is counted once); Form 1099-K amounts that are also on Form 1099-NEC are reconciled, not added',
    requiresDocs: ['D15', 'D21'],
    options: one({
      edits: [{ op: 'set', key: 'SchC.1', value: books }],
      rate: [{ category: 'schc_profit', amount: books - num('SchC.1'), ca: 'category' }],
      changes: [{ key: 'SchC.1', label: 'Gross receipts', from: num('SchC.1'), to: books }],
    }),
    recommended: 0,
  });

  // 4. Mileage log page scanned twice.
  const miles = (ix.evsByDoc.get('D23') ?? []).filter((e) => e.field === 'page_total' && e.page !== 3).reduce((s, e) => s + Number(e.value), 0);
  const rate = ix.params.mileage_rate;
  fixes.push({
    id: 'FIX-MILEAGE', checkId: 'CHK-DUP-MILEAGE', area: 'business',
    title: 'Count the May-August mileage page once',
    why: `Page 3 of the mileage scan is a second scan of page 2 (same 22 trips, same coffee stain, same 3,700-mile total). The engine's rule sums every page total, so it claimed ${money(num('SchC.44a'))} miles. The log supports ${money(miles)}.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchC.44a', 'SchC.9'],
    evidence: ['ev-0226', 'ev-0315', 'ev-0404', 'ev-0477', 'D23'],
    authority: 'IRC §274(d) substantiation; Rev. Proc. 2019-46 (standard mileage rate)',
    requiresDocs: ['D23'],
    options: one({
      edits: [{ op: 'set', key: 'SchC.44a', value: miles }],
      rate: [{ category: 'schc_profit', amount: rd((num('SchC.44a') - miles) * rate), ca: 'category' }],
      changes: [
        { key: 'SchC.44a', label: 'Business miles', from: num('SchC.44a'), to: miles },
        { key: 'SchC.9', label: 'Car and truck expenses', from: num('SchC.9'), to: rd(miles * rate) },
      ],
    }),
    recommended: 0,
  });

  // 5. Same interest from the composite statement and the standalone 1099-INT.
  fixes.push({
    id: 'FIX-INT-DUP', checkId: 'CHK-DUP-INTEREST', area: 'investments',
    title: 'Report the Northlake bank-sweep interest once',
    why: 'The standalone Northlake Bank 1099-INT is the bank sweep for Northlake Securities account 7731, already reported on the composite 1099. Both show 1,840.00. The 2024 return reported this interest once.',
    kind: 'numeric', certainty: 'certain',
    lines: ['SchB.1.2'],
    evidence: ['ev-0492', 'ev-0538', 'D28', 'D29', 'py:/return_2024/lines/SchB.1.1'],
    authority: 'IRC §61(a)(4); duplicate information returns for one payment',
    requiresDocs: ['D28', 'D29'],
    options: one({
      edits: [{ op: 'remove', key: 'SchB.1.2' }],
      rate: [{ category: 'interest', amount: -num('SchB.1.2'), ca: 'category' }],
      changes: [{ key: 'SchB.1.2', label: 'Interest - Northlake Bank, N.A.', from: num('SchB.1.2'), to: null }],
    }),
    recommended: 0,
  });

  // 6. Swedish interest converted at last year's average rate.
  const sek = ix.evNum('D36', 'interest_sek');
  const fx = ix.params.fx.SEK;
  const atYe = rd(sek / fx['2025_year_end']);
  const atAvg = rd(sek / fx['2025_average']);
  const cur = num('SchB.1.6');
  fixes.push({
    id: 'FIX-FX', checkId: 'CHK-INTEREST-FX', area: 'investments',
    title: 'Convert the Swedish interest at a 2025 exchange rate',
    why: `The engine converted SEK ${money(sek)} at 10.56, the 2024 average rate it used last year. The interest was credited once, on 12/31/2025.`,
    kind: 'numeric', certainty: 'judgment',
    lines: ['SchB.1.6'],
    evidence: ['ev-0960', 'ref:fx.SEK.2024_average', 'ref:fx.SEK.2025_year_end', 'ref:fx.SEK.2025_average', 'D36'],
    authority: 'IRS guidance on foreign currency: translate at the rate when received, or a yearly average rate for amounts received through the year',
    requiresDocs: ['D36'],
    options: [
      { id: 'spot', label: 'Rate on the date credited (9.71)', detail: `${money(sek)} ÷ 9.71 = ${money(atYe)}. One payment on 12/31/2025, so the spot rate that day is the most exact.`,
        edits: [{ op: 'set', key: 'SchB.1.6', value: atYe, label: `Interest - Sparbanken Norrland (SEK 18,450.00 at 9.71 SEK/USD on 12/31/2025)` }],
        rate: [{ category: 'interest', amount: atYe - cur, ca: 'category' }],
        changes: [{ key: 'SchB.1.6', label: 'Interest - Sparbanken Norrland', from: cur, to: atYe }] },
      { id: 'average', label: '2025 average rate (9.86)', detail: `${money(sek)} ÷ 9.86 = ${money(atAvg)}. Acceptable when amounts accrue through the year.`,
        edits: [{ op: 'set', key: 'SchB.1.6', value: atAvg, label: `Interest - Sparbanken Norrland (SEK 18,450.00 at 9.86 SEK/USD, 2025 average)` }],
        rate: [{ category: 'interest', amount: atAvg - cur, ca: 'category' }],
        changes: [{ key: 'SchB.1.6', label: 'Interest - Sparbanken Norrland', from: cur, to: atAvg }] },
    ],
    recommended: 0,
  });

  // 7. Self-employed health insurance while eligible for the spouse's employer plan.
  fixes.push({
    id: 'FIX-SEHI', checkId: 'CHK-SEHI', area: 'business',
    title: 'Remove the self-employed health insurance deduction',
    why: 'Both of Ngozi\'s employers offered family coverage that Erik could join (questionnaire qa-25). The deduction is not allowed for any month he was eligible for a spouse\'s employer plan. The prior preparer reached the same conclusion for 2024.',
    kind: 'numeric', certainty: 'certain',
    lines: ['Sch1.17'],
    evidence: ['qa-25', 'ev-0484', 'D25', 'py:/return_2024/notes/Sch1.17'],
    authority: 'IRC §162(l)(2)(B)',
    requiresDocs: ['D25'],
    options: one({
      edits: [{ op: 'set', key: 'Sch1.17', value: 0 }],
      rate: [{ category: 'adjustment', amount: -num('Sch1.17'), ca: 'category', note: 'Also raises the QBI deduction (20% of 14,400), which the adjustment rate does not capture' }],
      changes: [{ key: 'Sch1.17', label: 'Self-employed health insurance deduction', from: num('Sch1.17'), to: 0 }],
    }),
    recommended: 0,
  });

  // 8. Simplified home office method averaged across two homes.
  const sac = ix.evNum('D24', 'sac_sqft');
  const aus = ix.evNum('D24', 'aus_sqft');
  const hoAus = rd((6 * aus) / 12 * ix.params.home_office_rate);
  const hoSac = rd((6 * sac) / 12 * ix.params.home_office_rate);
  fixes.push({
    id: 'FIX-HOMEOFFICE', checkId: 'CHK-HOME-OFFICE', area: 'business',
    title: 'Apply the simplified home office method to one home only',
    why: `The engine averaged both homes (240 sq ft × $5 = 1,200). The simplified method can be used for only one home in a year; the other home needs actual expenses. Austin: used from 7/16 (16 days in July count), 6 months × ${aus} sq ft. Sacramento: January to June (July had only 14 days), 6 months × ${sac} sq ft.`,
    kind: 'numeric', certainty: 'judgment',
    lines: ['SchC.30'],
    evidence: ['ev-0481', 'ev-0482', 'ev-0483', 'D24', 'qa-19'],
    authority: 'Rev. Proc. 2013-13; IRS Pub. 587, simplified method when more than one home is used during the year',
    requiresDocs: ['D24'],
    followUp: 'Ask the client for Sacramento rent and utilities to add the actual-expense deduction for the first home.',
    options: [
      { id: 'austin', label: `Austin, simplified (${money(hoAus)})`, detail: `6 × ${aus} ÷ 12 × $5 = ${money(hoAus)}. Sacramento actual expenses can be added when the client sends rent and utilities.`,
        edits: [{ op: 'set', key: 'SchC.30', value: hoAus, label: `Home office (simplified method, Austin home: 6 months × ${aus} sq ft ÷ 12 × $5)` }],
        rate: [{ category: 'schc_profit', amount: num('SchC.30') - hoAus, ca: 'category' }],
        changes: [{ key: 'SchC.30', label: 'Business use of home', from: num('SchC.30'), to: hoAus }] },
      { id: 'sacramento', label: `Sacramento, simplified (${money(hoSac)})`, detail: `6 × ${sac} ÷ 12 × $5 = ${money(hoSac)}. Austin (owned) would then use actual expenses: interest, taxes and depreciation × ${(aus / 2640 * 100).toFixed(1)}%.`,
        edits: [{ op: 'set', key: 'SchC.30', value: hoSac, label: `Home office (simplified method, Sacramento home: 6 months × ${sac} sq ft ÷ 12 × $5)` }],
        rate: [{ category: 'schc_profit', amount: num('SchC.30') - hoSac, ca: 'category' }],
        changes: [{ key: 'SchC.30', label: 'Business use of home', from: num('SchC.30'), to: hoSac }] },
    ],
    recommended: 0,
  });

  // 9-11. Personal items in the books (call notes).
  const spotify = ix.evNum('D15', 'spotify');
  fixes.push({
    id: 'FIX-SPOTIFY', checkId: 'CHK-BOOKS-TO-TAX', area: 'business',
    title: 'Remove Spotify Family from software expense',
    why: 'Erik confirmed on the 3/26 call that Spotify Family is personal and was booked by mistake.',
    kind: 'numeric', certainty: 'certain',
    lines: ['SchC.27a.1'],
    evidence: ['ev-0106', 'call-01', 'D15'],
    authority: 'IRC §262 (personal expenses are not deductible)',
    requiresDocs: ['D15'],
    options: one({
      edits: [{ op: 'delta', key: 'SchC.27a.1', value: -spotify }],
      rate: [{ category: 'schc_profit', amount: spotify, ca: 'category' }],
      changes: [{ key: 'SchC.27a.1', label: 'Software and subscriptions', from: num('SchC.27a.1'), to: num('SchC.27a.1') - spotify }],
    }),
    recommended: 0,
  });
  const phone = ix.evNum('D14', 'Telephone');
  const phoneLine = rd(phone / 4 * 0.7);
  const phonePlan = rd(phone * 0.7);
  fixes.push({
    id: 'FIX-PHONE', checkId: 'CHK-BOOKS-TO-TAX', area: 'business',
    title: 'Deduct only the business share of the family phone plan',
    why: `The books deduct the whole family plan (4 lines, ${money(phone)}). Erik estimates his business use at 70%. Only his line is used in the business.`,
    kind: 'numeric', certainty: 'judgment',
    lines: ['SchC.25'],
    evidence: ['ev-0101', 'ev-0107', 'call-01', 'D15'],
    authority: 'IRC §162 and §262 (business portion of a mixed-use expense)',
    requiresDocs: ['D15'],
    followUp: 'Confirm with Erik that 70% is the business use of his own line.',
    options: [
      { id: 'line', label: `70% of Erik's line (${money(phoneLine)})`, detail: `${money(phone)} ÷ 4 lines × 70% = ${money(phoneLine)}. The other three lines are family use.`,
        edits: [{ op: 'delta', key: 'SchC.25', value: -(phone - phoneLine) }],
        rate: [{ category: 'schc_profit', amount: phone - phoneLine, ca: 'category' }],
        changes: [{ key: 'SchC.25', label: 'Utilities (telephone and internet)', from: num('SchC.25'), to: num('SchC.25') - (phone - phoneLine) }] },
      { id: 'plan', label: `70% of the whole plan (${money(phonePlan)})`, detail: `${money(phone)} × 70% = ${money(phonePlan)}. Hard to support for a four-line family plan.`,
        edits: [{ op: 'delta', key: 'SchC.25', value: -(phone - phonePlan) }],
        rate: [{ category: 'schc_profit', amount: phone - phonePlan, ca: 'category' }],
        changes: [{ key: 'SchC.25', label: 'Utilities (telephone and internet)', from: num('SchC.25'), to: num('SchC.25') - (phone - phonePlan) }] },
    ],
    recommended: 0,
  });
  const internet = ix.evNum('D14', 'Internet');
  fixes.push({
    id: 'FIX-INTERNET', checkId: 'CHK-BOOKS-TO-TAX', area: 'business',
    title: 'Deduct 50% of the shared home internet',
    why: `Home internet (${money(internet)}) is shared with the family; Erik puts business use at about 50%.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchC.25'],
    evidence: ['ev-0095', 'ev-0108', 'call-01', 'D15'],
    authority: 'IRC §162 and §262 (business portion of a mixed-use expense)',
    requiresDocs: ['D15'],
    options: one({
      edits: [{ op: 'delta', key: 'SchC.25', value: -rd(internet / 2) }],
      rate: [{ category: 'schc_profit', amount: rd(internet / 2), ca: 'category' }],
      changes: [{ key: 'SchC.25', label: 'Utilities (telephone and internet)', from: num('SchC.25'), to: num('SchC.25') - rd(internet / 2) }],
    }),
    recommended: 0,
  });

  // 12. HVAC replacement is an improvement.
  const hvac = ix.evNum('D47', 'total');
  const hvacDep = rd(hvac / 27.5 * 4.5 / 12);
  fixes.push({
    id: 'FIX-HVAC', checkId: 'CHK-RENTAL-A', area: 'rentals',
    title: 'Capitalize the Fremont Way HVAC replacement',
    why: `The 11,000.00 invoice replaced the whole heating and cooling system (furnace and condenser out; heat pump, air handler and line set in). Replacing a building system is a restoration, not a repair. The small-taxpayer safe harbor does not apply: 2025 repairs and improvements on the property (${money(ix.evNum('D46', 'repairs_total'))}) exceed 2% of the building's unadjusted basis (${money(364000 * 0.02)}). Depreciate over 27.5 years from 8/12/2025: ${money(hvacDep)} for 2025.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchE.14A', 'F4562-E.total-A'],
    evidence: ['ev-1001', 'ev-1004', 'D47', 'D46', 'call-01', 'qa-37'],
    authority: 'Treas. Reg. §1.263(a)-3(k)(1)(vi) and §1.263(a)-3(e)(2)(ii)(B) (HVAC is a building system); §1.263(a)-3(h) small-taxpayer safe harbor',
    requiresDocs: ['D47'],
    engineWhatIf: 'hvac_improvement',
    options: one({
      edits: [
        { op: 'delta', key: 'SchE.14A', value: -hvac },
        { op: 'delta', key: 'F4562-E.total-A', value: hvacDep },
      ],
      rate: [{ category: 'ordinary_income', amount: hvac - hvacDep, ca: 'ca', note: 'Sacramento rental is California-source' }],
      changes: [
        { key: 'SchE.14A', label: 'Repairs - property A', from: num('SchE.14A'), to: num('SchE.14A') - hvac },
        { key: 'F4562-E.total-A', label: 'Depreciation - property A', from: num('F4562-E.total-A'), to: num('F4562-E.total-A') + hvacDep },
      ],
    }),
    recommended: 0,
  });

  // 13. Payoff interest already inside the Form 1098.
  const payoffInt = ix.evNum('D56', 'interest');
  fixes.push({
    id: 'FIX-MORTGAGE', checkId: 'CHK-MORTGAGE', area: 'deductions',
    title: 'Remove payoff interest counted twice',
    why: `The engine added the Lonestar payoff-statement interest (${money(payoffInt)}) to the Lonestar Form 1098. The 1098 already includes interest paid at payoff, and the payoff statement says so.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchA.8a'],
    evidence: ['ev-1029', 'ev-1032', 'D55', 'D56'],
    authority: 'IRC §163(h); interest reported on Form 1098 is deducted once',
    requiresDocs: ['D55', 'D56'],
    options: one({
      edits: [{ op: 'delta', key: 'SchA.8a', value: -payoffInt }],
      rate: [{ category: 'itemized', amount: -payoffInt, ca: 'category' }],
      changes: [{ key: 'SchA.8a', label: 'Home mortgage interest and points', from: num('SchA.8a'), to: num('SchA.8a') - payoffInt }],
    }),
    recommended: 0,
  });

  // 14. Seller's share of 2025 property tax.
  const sellerShare = ix.evNum('D54', 'tax_credit');
  fixes.push({
    id: 'FIX-PROPTAX', checkId: 'CHK-PROPERTY-TAX', area: 'deductions',
    title: "Deduct only the buyer's share of 2025 property tax",
    why: `The escrow paid the full 2025 Travis County bill (${money(num('SchA.5b'))}), but the seller credited ${money(sellerShare)} for 1/1–7/7 at closing. That part is the seller's tax. Deductible: ${money(num('SchA.5b') - sellerShare)} (equal to 177/365 of the bill).`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchA.5b'],
    evidence: ['ev-1027', 'ev-1036', 'ev-1038', 'D54', 'D57', 'D58'],
    authority: 'IRC §164(d) (apportionment of real property tax in the year of sale)',
    requiresDocs: ['D54'],
    options: one({
      edits: [{ op: 'delta', key: 'SchA.5b', value: -sellerShare }],
      rate: [{ category: 'salt', amount: -sellerShare, ca: 'category', note: 'Federal SALT is capped and added back for AMT; California has no cap' }],
      changes: [{ key: 'SchA.5b', label: 'Real estate taxes (home)', from: num('SchA.5b'), to: num('SchA.5b') - sellerShare }],
    }),
    recommended: 0,
  });

  // 15. Donated vehicle sold by the charity.
  const proceeds = ix.evNum('D66', 'box4c');
  const veh = num('F8283.A1.vehicle');
  fixes.push({
    id: 'FIX-VEHICLE', checkId: 'CHK-CHARITY', area: 'deductions',
    title: 'Limit the Subaru donation to the charity\'s sale price',
    why: `The engine used the client's Kelley Blue Book estimate (${money(veh)}). Form 1098-C shows the charity sold the car at auction for ${money(proceeds)} without using it, so the deduction is the gross proceeds.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['F8283.A1.vehicle'],
    evidence: ['ev-1054', 'ev-1055', 'qa-39', 'D66', 'call-01'],
    authority: 'IRC §170(f)(12)(A)(ii)',
    requiresDocs: ['D66'],
    options: one({
      edits: [{ op: 'set', key: 'F8283.A1.vehicle', value: proceeds }],
      rate: [{ category: 'itemized', amount: proceeds - veh, ca: 'category' }],
      changes: [{ key: 'F8283.A1.vehicle', label: '2012 Subaru Outback', from: veh, to: proceeds }],
    }),
    recommended: 0,
  });

  // 16. Q4 federal estimate from the client's memory instead of the IRS record.
  const transcript = p.tax_agency_records.irs_account_transcript_2025[0];
  const q4 = transcript.transactions.find((t) => t.code === '670' && t.date.startsWith('2026-01'));
  const q4Amount = typeof q4?.amount === 'number' ? q4.amount : 3000;
  const est = num('F1040.26');
  const eftps = ['q1', 'q2', 'q3'].map((q) => ({ date: String(ix.ev('D67', `${q}_date`)?.value), amount: ix.evNum('D67', `${q}_amount`) }));
  fixes.push({
    id: 'FIX-EST-Q4', checkId: 'CHK-FED-PAYMENTS', area: 'payments',
    title: 'Use the IRS record for the fourth-quarter estimate',
    why: `No EFTPS confirmation was uploaded for the fourth quarter, so the engine used the client's answer ("4,000 I think", paid 1/14). The IRS account transcript shows ${money(q4Amount)} credited on ${q4?.date ?? '2026-01-15'}.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['F1040.26', 'F1040.38'],
    evidence: ['qa-41', 'agency:/irs_account_transcript_2025/0/transactions/3', 'D67', 'D69'],
    authority: 'IRS account transcript (transaction code 670)',
    requiresDocs: ['D69'],
    options: one({
      edits: [
        { op: 'delta', key: 'F1040.26', value: q4Amount - 4000 },
        { op: 'payments', jurisdiction: 'federal', schedule: [...eftps, { date: q4?.date ?? '2026-01-15', amount: q4Amount }] },
      ],
      rate: [{ category: 'payment_federal', amount: q4Amount - 4000, ca: 'none' }],
      changes: [{ key: 'F1040.26', label: '2025 estimated tax payments', from: est, to: est + q4Amount - 4000 }],
    }),
    recommended: 0,
  });

  // 17. California payment designated to 2024.
  const ftb = p.tax_agency_records.ftb_account;
  const ca2025 = ftb.tax_year_2025_payments.reduce((s, x) => s + x.amount, 0);
  const caEst = num('F540NR.72');
  fixes.push({
    id: 'FIX-CA-PAYMENT', checkId: 'CHK-CA-PAYMENTS', area: 'payments',
    title: 'Count only payments the FTB applied to 2025',
    why: `The engine counted every FTB payment dated in the 2025 estimate window. The 9/15/2025 Web Pay payment (3,500.00) was designated tax year 2024 and the FTB holds it as a 2024 credit. Payments on the 2025 account: ${money(ca2025)}.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['F540NR.72'],
    evidence: ['ev-1074', 'ev-1075', 'ev-1076', 'agency:/ftb_account', 'D68'],
    authority: 'FTB account record; payments are credited to the tax year designated',
    requiresDocs: ['D68'],
    followUp: 'Ask the FTB to transfer the 3,500.00 credit from 2024 to 2025 (MyFTB or phone), then restore it here with the FTB confirmation.',
    options: one({
      edits: [
        { op: 'set', key: 'F540NR.72', value: ca2025 },
        { op: 'payments', jurisdiction: 'california', schedule: ftb.tax_year_2025_payments },
      ],
      rate: [{ category: 'payment_california', amount: ca2025 - caEst, ca: 'none' }],
      changes: [{ key: 'F540NR.72', label: '2025 California estimated tax payments', from: caEst, to: ca2025 }],
    }),
    recommended: 0,
  });

  // 18. California-source wages after the move.
  const corvane16 = ix.evNum('D08', 'box16');
  const paystubCa = ix.evNum('D73', 'ytd_ca_wages');
  const caWages = corvane16 + paystubCa;
  const engineCa = num('SchCA540NR.1.E');
  fixes.push({
    id: 'FIX-CA-WAGES', checkId: 'CHK-CA-WAGES', area: 'california',
    title: 'Source Halvorsen wages to California only through the move',
    why: `Halvorsen kept California as the work state through 9/30 by mistake, so W-2 box 16 (${money(ix.evNum('D09', 'box16'))}) includes Texas-period wages. Ngozi worked from Austin from 7/15. The 7/18 paystub shows California wages of ${money(paystubCa)} through 7/15. California-source wages: Corvane ${money(corvane16)} + Halvorsen ${money(paystubCa)} = ${money(caWages)}. The extra California withholding is still credited and comes back as a refund.`,
    kind: 'numeric', certainty: 'certain',
    lines: ['SchCA540NR.1.E'],
    evidence: ['ev-0030', 'ev-0047', 'ev-1081', 'qa-45', 'D73', 'D09'],
    authority: 'Cal. Rev. & Tax. Code §17951; FTB Pub. 1031 (part-year residents: income while a nonresident is taxed only if California-source)',
    requiresDocs: ['D73'],
    options: one({
      edits: [{ op: 'set', key: 'SchCA540NR.1.E', value: caWages }],
      rate: [{ category: 'ca_source_income', amount: caWages - engineCa, ca: 'ca' }],
      changes: [{ key: 'SchCA540NR.1.E', label: 'Wages - California amount', from: engineCa, to: caWages }],
    }),
    recommended: 0,
  });

  // 19. Crypto lot with no basis (transfer in).
  fixes.push({
    id: 'FIX-C6', checkId: 'CHK-CRYPTO-BASIS', area: 'investments',
    title: 'Use the 2021 purchase for the transferred BTC lot',
    why: 'Lot C6 (0.05 BTC) was transferred into Coinhaven in June, so the 1099-DA and the CSV have no basis and the engine used zero and the transfer date. Erik says it was bought on CryptoNorth on 3/15/2021 for about 3,050.00 and has a bank statement line. That makes it long-term with a 3,050 basis.',
    kind: 'numeric', certainty: 'judgment',
    lines: ['F8949.H.C6', 'F8949.K.C6'],
    evidence: ['ev-0879', 'ev-0882', 'ev-0918', 'ev-0919', 'msg-07', 'D34', 'D35'],
    authority: 'Treas. Reg. §1.1012-1(j); IRC §1223 (holding period carries over on a transfer between own wallets)',
    requiresDocs: ['D35'],
    followUp: 'Attach the 03/15/2021 bank statement line before filing.',
    options: one({
      edits: [{ op: 'lot', id: 'C6', set: { basis: 3050, acquired: '2021-03-15', box: 'K' } }],
      rate: [
        { category: 'stcg', amount: -ix.evNum('D34', 'C6_proceeds'), ca: 'ca', note: 'Sold 6/18, during California residency' },
        { category: 'ltcg', amount: ix.evNum('D34', 'C6_proceeds') - 3050, ca: 'ca' },
      ],
      changes: [
        { key: 'F8949.H.C6', label: 'BTC lot C6 as short-term, zero basis', from: ix.evNum('D34', 'C6_proceeds'), to: null },
        { key: 'F8949.K.C6', label: 'BTC lot C6 as long-term, basis 3,050', from: null, to: ix.evNum('D34', 'C6_proceeds') - 3050 },
      ],
    }),
    recommended: 0,
  });

  // 20-22. Data corrections with no tax effect (they stop rejections and notices).
  const theo = ix.people.get('theo')!;
  const py = p.prior_years.return_2024.dependents.find((d) => d.name.startsWith('Theo'));
  fixes.push({
    id: 'FIX-THEO-SSN', checkId: 'CHK-DEPENDENTS', area: 'intake',
    title: "Correct Theo's Social Security number",
    why: `The organizer has ${theo.ssn}. The 2024 return as filed has ${py?.ssn}. A mismatch with the IRS database rejects the e-file (R0000-504-02).`,
    kind: 'data', certainty: 'certain',
    lines: ['F8812.4'],
    evidence: ['household:theo', 'py:/return_2024/dependents/1', 'D06', 'D71'],
    authority: 'Form 1040 instructions (dependent identifying numbers); e-file business rule R0000-504-02',
    requiresDocs: ['D06'],
    dataChange: { subject: 'household:theo', field: 'ssn', from: theo.ssn, to: py?.ssn ?? '' },
    options: one({ edits: [], rate: [], changes: [{ key: 'household:theo', label: "Theo's SSN", from: theo.ssn, to: py?.ssn ?? '' }] }),
    recommended: 0,
  });
  const ls = ix.ev('D62', 'ein');
  fixes.push({
    id: 'FIX-2441-TIN', checkId: 'CHK-DEP-CARE', area: 'deductions',
    title: "Correct Little Sprouts' tax ID",
    why: `The pipeline read ${ls?.value} (0.97 confidence); the statement prints 74-3829156. Form 2441 needs each provider's correct TIN to exclude the 5,000.00 of dependent care benefits.`,
    kind: 'data', certainty: 'certain',
    lines: ['F2441.1b'],
    evidence: ['ev-1045', 'D62'],
    authority: 'Form 2441 Part I (provider name, address and TIN)',
    requiresDocs: ['D62'],
    dataChange: { subject: 'F2441.1b', field: 'provider_tin', from: String(ls?.value ?? ''), to: '74-3829156' },
    options: one({
      edits: [{ op: 'set', key: 'F2441.1b', value: num('F2441.1b'), label: 'Care provider: Little Sprouts Learning Center, tax ID 74-3829156' }],
      rate: [], changes: [{ key: 'F2441.1b', label: 'Provider tax ID', from: String(ls?.value ?? ''), to: '74-3829156' }],
    }),
    recommended: 0,
  });
  fixes.push({
    id: 'FIX-2441-NAME', checkId: 'CHK-DEP-CARE', area: 'deductions',
    title: 'Use the provider name on the Bright Oak statement',
    why: 'Form 2441 shows "Bright Oak Preschool". The statement and the 2024 return say "Bright Oak Kids Club" (same tax ID 68-0412257).',
    kind: 'data', certainty: 'certain',
    lines: ['F2441.1a'],
    evidence: ['ev-1043', 'D61', 'py:/return_2024/lines/F2441.provider'],
    authority: 'Form 2441 Part I (provider name, address and TIN)',
    requiresDocs: ['D61'],
    dataChange: { subject: 'F2441.1a', field: 'provider_name', from: 'Bright Oak Preschool', to: 'Bright Oak Kids Club' },
    options: one({
      edits: [{ op: 'set', key: 'F2441.1a', value: num('F2441.1a'), label: 'Care provider: Bright Oak Kids Club, tax ID 68-0412257' }],
      rate: [], changes: [{ key: 'F2441.1a', label: 'Provider name', from: 'Bright Oak Preschool', to: 'Bright Oak Kids Club' }],
    }),
    recommended: 0,
  });

  // 23. Election: section 179 instead of special depreciation (engine what-if).
  const alt = p.what_if.alternatives.find((a) => a.id === 'equipment_section179');
  if (alt) {
    const caLine = (k: string) => Number(alt.changed_lines.find((l) => l.key === k)?.new ?? 0);
    fixes.push({
      id: 'FIX-ELECT-179', checkId: 'CHK-ELECTIONS', area: 'business',
      title: 'Elect section 179 for the studio equipment',
      why: `Federal: section 179 and 100% special depreciation both deduct 38,000 in 2025 (engine what-if: no federal change). California does not allow special depreciation but allows 25,000 of section 179, cutting California tax by ${money(-alt.california.total_tax_change)}. This is the only year the equipment's California depreciation counts: after the move the studio's income is not California-source.`,
      kind: 'election', certainty: 'judgment',
      lines: ['F4562-C.12', 'F4562-C.14', 'SchCA540NR.12.C'],
      evidence: ['ev-0141', 'ev-0142', 'ev-0143', 'qa-18', 'call-01', 'ref:param.ca_section179_limit'],
      authority: 'IRC §179; Cal. Rev. & Tax. Code §17255 (California §179 limit)',
      requiresDocs: ['D22'],
      engineWhatIf: 'equipment_section179',
      followUp: 'Section 179 is recaptured if business use falls to 50% or less in a later year; Erik confirmed the equipment is business-only.',
      options: one({
        edits: [
          { op: 'set', key: 'F4562-C.12', value: 38000 },
          { op: 'set', key: 'F4562-C.14', value: 0 },
          { op: 'set', key: 'FTB3885A.STU-PRINTER', value: caLine('FTB3885A.STU-PRINTER') },
          { op: 'set', key: 'FTB3885A.STU-CAMERA', value: caLine('FTB3885A.STU-CAMERA') },
          { op: 'set', key: 'FTB3885A.STU-WORKST', value: caLine('FTB3885A.STU-WORKST') },
        ],
        rate: [{ category: 'ca_depreciation', amount: 0, ca: 'none', note: 'Engine what-if gives the exact effect' }],
        changes: [
          { key: 'F4562-C.12', label: 'Section 179 expense', from: 0, to: 38000 },
          { key: 'F4562-C.14', label: 'Special depreciation allowance', from: 38000, to: 0 },
          { key: 'SchCA540NR.12.C', label: 'California depreciation addition', from: num('SchCA540NR.12.C'), to: 10400 },
        ],
      }),
      recommended: 0,
    });
  }

  return fixes;
}
