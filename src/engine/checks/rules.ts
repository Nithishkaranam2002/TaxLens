import { rd, round2 } from '../recompute/core';
import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function checkInterestFx(x: CheckCtx): CheckResult | null {
  if (!x.has('D36') || !x.version) return null;
  const sek = x.ix.evNum('D36', 'interest_sek');
  const l = x.ix.lines.get(x.version.version)?.get('SchB.1.6');
  const usedPy = !!l?.sources.includes('ref:fx.SEK.2024_average');
  const fx = x.ix.params.fx.SEK;
  return {
    id: 'CHK-INTEREST-FX', group: 'Rules and judgment', area: 'investments',
    title: 'Swedish interest exchange rate',
    question: 'Is the SEK interest converted at a 2025 rate?',
    method: 'Reads which exchange rate the interest line cites and recomputes at each 2025 rate.',
    status: usedPy ? 'fail' : 'pass',
    summary: usedPy
      ? `The engine used the 2024 average (10.56) — last year's rate — for interest credited on 12/31/2025: ${fmt(rd(sek / 10.56))}. At the rate that day (9.71) it is ${fmt(rd(sek / fx['2025_year_end']))}; at the 2025 average (9.86), ${fmt(rd(sek / fx['2025_average']))}.`
      : 'Converted at a 2025 rate.',
    tables: [],
    refs: ['ev-0960', 'SchB.1.6', 'ref:fx.SEK.2024_average'],
    fixes: usedPy ? ['FIX-FX'] : [],
  };
}

export function checkForeign(x: CheckCtx): CheckResult | null {
  if (!x.has('D36')) return null;
  const fx = x.ix.params.fx.SEK['2025_year_end'];
  const max = rd(x.ix.evNum('D36', 'max_balance_sek') / fx);
  const ye = rd(x.ix.evNum('D36', 'balance_ye_sek') / fx);
  return {
    id: 'CHK-FOREIGN', group: 'Rules and judgment', area: 'retirement',
    title: 'Swedish account: Form 8938, FBAR and the inheritance',
    question: 'Are every foreign-account filing and the 2023 inheritance handled?',
    method: 'Converts the maximum and year-end balances at the Treasury year-end rate and tests each filing threshold.',
    status: 'review',
    summary: `Maximum ${fmt(max)}, year-end ${fmt(ye)} (at 9.71): Form 8938 is required (married filing jointly, over 100,000 at year end) and is on the return. FBAR is required (over 10,000) — the client filed it in prior years; it is outside this engagement and due 10/15/2026. Open since the prior preparer: the account came from Erik's mother in 2023, a bequest over 100,000 from a foreign person, which needs Form 3520 for 2023. No resolution is recorded.`,
    tables: [{ columns: ['Filing', 'Threshold', 'This year', 'Status'], rows: [
      { status: 'ok', cells: ['Form 8938 (with the return)', '100,000 at year end or 150,000 any time (MFJ)', fmt(ye), 'Included'] },
      { status: 'warn', cells: ['FinCEN Form 114 (FBAR)', '10,000 aggregate maximum', fmt(max), 'Client files separately — confirm for 2025'] },
      { status: 'bad', cells: ['Form 3520 for 2023', 'Bequest from a foreign person over 100,000', 'Account opened 09/2023 from the inheritance', 'Open item from the prior preparer'] },
    ] }],
    refs: ['D36', 'D07', 'qa-07', 'qa-08', 'F8938.req'],
    fixes: [],
  };
}

export function checkIraBasis(x: CheckCtx): CheckResult | null {
  if (!x.has('D41')) return null;
  const py = Number(x.ix.packet.prior_years.return_2024.lines['F8606.14']);
  const has5498 = x.has('D42');
  return {
    id: 'CHK-IRA-BASIS', group: 'Rules and judgment', area: 'retirement',
    title: 'Backdoor Roth basis (Form 8606)',
    question: 'Is the nondeductible basis supported, and is the conversion taxed correctly?',
    method: 'Agrees basis to the 2024 Form 8606 and both Forms 5498, and recomputes the pro-rata rule.',
    status: has5498 ? 'pass' : 'review',
    summary: `Basis 14,000 = 2024 contribution 7,000 (2024 Form 8606 line 14; Form 5498 for 2024, made 2/12/2025) + 2025 contribution 7,000. Converted 14,026; year-end traditional IRA balance 0, so only the 26 of earnings is taxable. The client answered "no prior basis" (qa-31); the 2024 return and Form 5498 show otherwise, and documents govern.`,
    tables: [{ columns: ['Item', 'Amount', 'Source'], money: [1], rows: [
      { status: 'ok', cells: ['Basis carried from 2024', { v: py, money: true }, { v: '2024 Form 8606 line 14', ref: 'py:/return_2024/lines/F8606.14' }] },
      { status: has5498 ? 'ok' : 'warn', cells: ['2024 contribution (Form 5498)', { v: x.ix.evNum('D42', 'box1'), money: true }, { v: 'D42', ref: 'D42' }] },
      { status: 'ok', cells: ['2025 contribution', { v: x.line('F8606.1'), money: true }, { v: 'F8606.1', ref: 'F8606.1' }] },
      { status: 'ok', cells: ['Converted (1099-R)', { v: x.ix.evNum('D41', 'box1'), money: true }, { v: 'ev-0987', ref: 'ev-0987' }] },
      { status: 'ok', cells: ['Taxable conversion', { v: x.line('F8606.18'), money: true }, { v: 'F8606.18', ref: 'F8606.18' }] },
    ] }],
    refs: ['D41', 'D42', 'D43', 'qa-31'],
    fixes: [],
  };
}

export function checkHsa(x: CheckCtx): CheckResult | null {
  if (!x.has('D45')) return null;
  return {
    id: 'CHK-HSA', group: 'Rules and judgment', area: 'retirement',
    title: 'HSA contributions and distributions',
    question: 'Are HSA contributions within the family limit and distributions qualified?',
    method: 'Compares W-2 code W and Form 5498-SA to the limit and reads the distribution code and client answer.',
    status: 'pass',
    summary: `Employer contributions 6,000 (2,500 + 3,500, code W) are within the 8,550 family limit; no contributions outside payroll (qa-28). Distributions 2,150 (code 1) paid medical expenses (qa-29). California adds the 6,000 back to wages.`,
    tables: [],
    refs: ['D44', 'D45', 'qa-28', 'qa-29', 'F8889.3'],
    fixes: [],
  };
}

export function checkSehi(x: CheckCtx): CheckResult | null {
  if (!x.has('D25')) return null;
  const claimed = x.line('Sch1.17');
  return {
    id: 'CHK-SEHI', group: 'Rules and judgment', area: 'business',
    title: 'Self-employed health insurance eligibility',
    question: 'Could Erik join a spouse\'s employer plan in any month?',
    method: 'Reads the eligibility answer and the prior-year treatment.',
    status: claimed > 0 ? 'fail' : 'pass',
    summary: claimed > 0
      ? `Deducted ${fmt(claimed)}. Both of Ngozi's employers offered family coverage Erik could join (qa-25), so no month qualifies. The 2024 return took no deduction for the same reason.`
      : 'No deduction claimed.',
    tables: [],
    refs: ['qa-25', 'D25', 'Sch1.17', 'py:/return_2024/notes/Sch1.17'],
    fixes: claimed > 0 ? ['FIX-SEHI'] : [],
  };
}

export function checkSep(x: CheckCtx): CheckResult | null {
  if (!x.base) return null;
  const contrib = x.has('D26') ? x.ix.evNum('D26', 'amount') : 18000;
  const deducted = x.line('Sch1.16');
  return {
    id: 'CHK-SEP', group: 'Rules and judgment', area: 'business',
    title: 'SEP contribution against the limit',
    question: 'Is the SEP contribution within the deductible limit for Erik\'s profit?',
    method: 'Recomputes 20% of (net profit − ½ SE tax) after every approved change and compares it with the deposit.',
    status: contrib > deducted ? 'review' : 'pass',
    summary: contrib > deducted
      ? `Deposited ${fmt(contrib)} on 4/10/2026; deductible ${fmt(deducted)} at the engine's profit. The excess grows as Schedule C corrections lower profit. Decide with the client: withdraw the excess and its earnings before 10/15/2026, or carry the nondeductible amount forward and handle any excise tax.`
      : 'Contribution within the limit.',
    tables: [],
    refs: ['D26', 'qa-26', 'Sch1.16'],
    fixes: [],
  };
}

export function checkHomeOffice(x: CheckCtx): CheckResult | null {
  if (!x.has('D24')) return null;
  const engine = x.line('SchC.30');
  const label = x.lineText('SchC.30');
  const averaged = /average/i.test(label);
  return {
    id: 'CHK-HOME-OFFICE', group: 'Rules and judgment', area: 'business',
    title: 'Home office across two homes',
    question: 'Is the simplified method applied to one home, as the rules require?',
    method: 'Rebuilds the monthly square footage for each home from the client\'s measurements and move date.',
    status: averaged ? 'fail' : 'pass',
    summary: averaged
      ? `The engine averaged both homes (${fmt(engine)}). The simplified method covers one home per year; the other needs actual expenses. Austin by itself: 650. The 2024 return used 300 sq ft ("2 rooms combined?"); the client measured 220, so 2024 was overstated by about 400 — immaterial, noted for the record.`
      : 'Applied to one home.',
    tables: [{ columns: ['Month', 'Sacramento (220 sq ft)', 'Austin (260 sq ft)'], rows: [
      { status: 'ok', cells: ['January – June', 'Used all month', '—'] },
      { status: 'warn', cells: ['July', '14 days (under 15: counts as 0)', '16 days (counts)'] },
      { status: 'ok', cells: ['August – December', '—', 'Used all month'] },
    ] }],
    refs: ['D24', 'qa-19', 'SchC.30', 'D07'],
    fixes: averaged ? ['FIX-HOMEOFFICE'] : [],
  };
}

export function checkQbi(x: CheckCtx): CheckResult | null {
  if (!x.base) return null;
  const ti = x.line('F8995.33');
  const below = ti <= x.ix.params.qbi_threshold;
  return {
    id: 'CHK-QBI', group: 'Rules and judgment', area: 'totals',
    title: 'QBI deduction inputs',
    question: 'Are the QBI inputs complete, and does the wage limit apply?',
    method: 'Compares taxable income to the threshold and lists the property counted for the studio.',
    status: 'pass',
    summary: `Taxable income before QBI ${fmt(ti)} is ${below ? 'below' : 'above'} the ${fmt(x.ix.params.qbi_threshold)} threshold${below ? ', so neither business is wage- or property-limited' : ''}. The studio's UBIA counts the 2025 equipment (38,000) but not the 2022 laptop (2,800), which is still in its ten-year period. No effect this year; fix the input before income crosses the threshold.`,
    tables: [],
    refs: ['F8995.15.1', 'F8995.15.2', 'asset:STU-LAPTOP'],
    fixes: [],
  };
}

export function checkMortgage(x: CheckCtx): CheckResult | null {
  if (!x.has('D55') || !x.version) return null;
  const l = x.ix.lines.get(x.version.version)?.get('SchA.8a');
  const dbl = !!l?.sources.includes('ev-1032');
  return {
    id: 'CHK-MORTGAGE', group: 'Rules and judgment', area: 'deductions',
    title: 'Home mortgage interest and points',
    question: 'Is each dollar of home interest counted once, with points treated correctly?',
    method: 'Ties interest to each Form 1098 and reads the payoff statement for what it says the 1098 includes.',
    status: dbl ? 'fail' : 'pass',
    summary: dbl
      ? 'The Lonestar payoff interest (2,150) is added on top of the Lonestar Form 1098, which already includes interest paid at payoff — the payoff statement says so. Purchase points (4,800) are deductible in 2025; refinance points (3,200) are amortized (9 this year). Both loans are under the 750,000 limit.'
      : 'Interest counted once; points treated correctly.',
    tables: [{ columns: ['Lender', 'Interest', 'Source'], money: [1], rows: [
      { status: 'ok', cells: ['Lonestar Mortgage (Form 1098)', { v: x.ix.evNum('D55', 'box1'), money: true }, { v: 'ev-1029', ref: 'ev-1029' }] },
      { status: 'ok', cells: ['Pecan Federal Savings (Form 1098)', { v: x.ix.evNum('D57', 'box1'), money: true }, { v: 'ev-1034', ref: 'ev-1034' }] },
      { status: dbl ? 'bad' : 'ok', cells: ['Lonestar payoff statement interest', { v: x.ix.evNum('D56', 'interest'), money: true }, { v: '"Interest is reported on the 2025 Form 1098"', ref: 'doc:D56#page1' }] },
      { status: 'ok', cells: ['Purchase points (Form 1098 box 6)', { v: x.ix.evNum('D55', 'box6'), money: true }, { v: 'ev-1030', ref: 'ev-1030' }] },
    ] }],
    refs: ['D55', 'D56', 'D57', 'SchA.8a'],
    fixes: dbl ? ['FIX-MORTGAGE'] : [],
  };
}

export function checkPropertyTax(x: CheckCtx): CheckResult | null {
  if (!x.has('D54') || !x.has('D58')) return null;
  const bill = x.ix.evNum('D58', 'paid');
  const credit = x.ix.evNum('D54', 'tax_credit');
  const days = 177;
  return {
    id: 'CHK-PROPERTY-TAX', group: 'Rules and judgment', area: 'deductions',
    title: 'Property tax in the year the home was bought',
    question: 'Is only the buyer\'s share of 2025 property tax deducted?',
    method: 'Compares the escrow payment with the seller\'s credit at closing and prorates the bill by days owned.',
    status: x.line('SchA.5b') > bill - credit ? 'fail' : 'pass',
    summary: `Escrow paid the full 2025 bill (${fmt(bill)}) in December. The seller credited ${fmt(credit)} for 1/1–7/7 at closing; that share is the seller's deduction. Buyer's share ${fmt(bill - credit)} = ${fmt(round2(bill * days / 365))} (${days}/365 days), so the two methods agree.`,
    tables: [],
    refs: ['D54', 'D57', 'D58', 'SchA.5b'],
    fixes: x.line('SchA.5b') > bill - credit ? ['FIX-PROPTAX'] : [],
  };
}

export function checkCharity(x: CheckCtx): CheckResult | null {
  if (!x.has('D63')) return null;
  const veh = x.line('F8283.A1.vehicle');
  const proceeds = x.has('D66') ? x.ix.evNum('D66', 'box4c') : veh;
  // Ngozi confirms the parish amount against the bank statement on 7/1 (msg-08).
  const confirmed = (x.ix.messages.get('msg-08')?.sent_at ?? '9999') <= x.asOf;
  const rows: EvidenceTable['rows'] = [
    { status: 'ok', cells: ['Sacramento Food Bank (cash)', { v: x.ix.evNum('D63', 'amount'), money: true }, 'Receipt states no goods or services', { v: 'D63', ref: 'D63' }] },
    { status: 'ok', cells: ['Hill Country Animal Rescue (cash)', 1250, 'Receipt states no goods or services', { v: 'D63', ref: 'doc:D63#page2' }] },
    { status: 'warn', cells: ['St. Brigid Parish (check #2207)', { v: x.ix.evNum('D64', 'amount'), money: true }, `Amount ambiguous ($?,500)${confirmed ? '; client confirmed 1,500 with the bank statement (msg-08)' : ', read as 1,500 at low confidence: confirm with the bank statement'}. Receipt has no goods-or-services statement, which a gift of 250 or more needs.`, { v: 'D64', ref: 'D64' }] },
    { status: 'ok', cells: ['200 sh Northlake index fund to donor-advised fund', { v: x.ix.evNum('D65', 'fmv'), money: true }, 'Held since 2019 (long-term), publicly traded: fair market value, no appraisal', { v: 'D65', ref: 'D65' }] },
    { status: veh > proceeds ? 'bad' : 'ok', cells: ['2012 Subaru Outback', { v: veh, money: true }, `Charity sold it for ${fmt(proceeds)} (Form 1098-C box 4c) — deduction is limited to the proceeds`, { v: 'D66', ref: 'D66' }] },
  ];
  return {
    id: 'CHK-CHARITY', group: 'Rules and judgment', area: 'deductions',
    title: 'Charitable gifts and their paperwork',
    question: 'Is each gift valued correctly and backed by the acknowledgment the law requires?',
    method: 'Reads each receipt for amount, date and goods-or-services statement, and applies the vehicle and appreciated-stock rules.',
    status: veh > proceeds ? 'fail' : 'review',
    summary: `The Subaru is valued at the client's estimate (${fmt(veh)}) though the charity sold it for ${fmt(proceeds)}. ${confirmed ? 'St. Brigid\'s 1,500 is confirmed by the bank statement, but' : 'St. Brigid\'s amount is hard to read (confirm 1,500 with the client), and'} the handwritten receipt lacks the goods-or-services statement: get a written acknowledgment from the parish before filing.`,
    tables: [{ columns: ['Gift', 'Claimed', 'Finding', 'Document'], money: [1], rows }],
    refs: ['D63', 'D64', 'D65', 'D66', ...(confirmed ? ['msg-08'] : []), 'qa-39'],
    fixes: veh > proceeds ? ['FIX-VEHICLE'] : [],
  };
}

export function checkSaltCap(x: CheckCtx): CheckResult | null {
  if (!x.base) return null;
  const agi = x.line('F1040.11');
  const p = x.ix.params;
  const cap = Math.max(p.salt_cap_floor, p.salt_cap - p.salt_cap_phase_rate * Math.max(0, agi - p.salt_cap_phase_start));
  return {
    id: 'CHK-SALT-CAP', group: 'Rules and judgment', area: 'deductions',
    title: 'State and local tax cap',
    question: 'Is the SALT cap right at this AGI, and are state income taxes those paid in 2025?',
    method: 'Recomputes the cap from AGI and lists every state payment dated in 2025.',
    status: Math.abs(Math.min(x.line('SchA.5d'), cap) - x.line('SchA.5e')) < 1 ? 'pass' : 'fail',
    summary: `AGI ${fmt(agi)} is under ${fmt(p.salt_cap_phase_start)}, so the cap is ${fmt(cap)}. State income taxes 27,870 = California withholding 13,130 + FTB payments made in 2025 (including the 2024 balance and the 9/15 payment); the 1/15/2026 payment belongs to 2026. Because AMT applies, SALT has no federal effect at the margin.`,
    tables: [],
    refs: ['SchA.5a', 'SchA.5e', 'D68'],
    fixes: [],
  };
}

export function checkDepCare(x: CheckCtx): CheckResult | null {
  if (!x.has('D61') || !x.has('D62')) return null;
  const a = x.lineText('F2441.1a');
  const b = x.lineText('F2441.1b');
  const nameBad = !/Bright Oak Kids Club/.test(a);
  const tinBad = !b.includes('74-3829156');
  return {
    id: 'CHK-DEP-CARE', group: 'Rules and judgment', area: 'deductions',
    title: 'Child care providers',
    question: 'Are both providers\' names and tax IDs right, and do the benefits and expenses work?',
    method: 'Compares Form 2441 provider details with each statement and recomputes the credit after excluded benefits.',
    status: nameBad || tinBad ? 'fail' : 'pass',
    summary: `${nameBad ? 'Bright Oak is named "Bright Oak Preschool"; the statement and 2024 return say "Bright Oak Kids Club". ' : ''}${tinBad ? 'Little Sprouts\' tax ID was read as 74-3829516; the statement prints 74-3829156. ' : ''}Expenses 9,600 cover the 5,000 of excluded benefits (Halvorsen box 10); the credit is 0 because the 3,000 limit is used up by the exclusion.`,
    tables: [{ columns: ['Provider', 'On Form 2441', 'On the statement'], rows: [
      { status: nameBad ? 'bad' : 'ok', cells: [{ v: 'Bright Oak', ref: 'D61' }, a.replace('Care provider: ', ''), 'Bright Oak Kids Club, 68-0412257'] },
      { status: tinBad ? 'bad' : 'ok', cells: [{ v: 'Little Sprouts', ref: 'D62' }, b.replace('Care provider: ', ''), 'Little Sprouts Learning Center, 74-3829156'] },
    ] }],
    refs: ['D61', 'D62', 'ev-1045', 'F2441.1a', 'F2441.1b'],
    fixes: [...(tinBad ? ['FIX-2441-TIN'] : []), ...(nameBad ? ['FIX-2441-NAME'] : [])],
  };
}

export function checkDependents(x: CheckCtx): CheckResult {
  const theo = x.ix.people.get('theo')!;
  const py = x.ix.packet.prior_years.return_2024.dependents.find((d) => d.name.startsWith('Theo'));
  const card = x.has('D71') ? String(x.ix.ev('D71', 'ssn')?.value ?? '') : null;
  const bad = py && py.ssn !== theo.ssn;
  return {
    id: 'CHK-DEPENDENTS', group: 'Rules and judgment', area: 'intake',
    title: 'Dependents and their numbers',
    question: 'Do the dependents\' identifying numbers agree with prior filings, and do both qualify?',
    method: 'Compares organizer SSNs with the 2024 return as filed (and the card when it arrives), and tests age, student status and residency.',
    status: bad ? 'fail' : 'pass',
    summary: bad
      ? `Theo's SSN in the organizer (${theo.ssn}) differs from the 2024 return (${py!.ssn})${card ? ` and his Social Security card (${card})` : ''}. Filing with the organizer number will be rejected. Ada (19, full-time student) and Theo (8) both qualify; Ada files her own return and checked "can be claimed as a dependent".`
      : 'Dependents\' numbers agree with prior filings; both qualify.',
    tables: [{ columns: ['Dependent', 'Organizer', '2024 return', 'Card'], rows: [
      { status: 'ok', cells: ['Ada (daughter, student)', x.ix.people.get('ada')!.ssn, x.ix.packet.prior_years.return_2024.dependents[0].ssn, '—'] },
      { status: bad ? 'bad' : 'ok', cells: ['Theo (son, age 8)', theo.ssn, py?.ssn ?? '—', card ?? 'Not received'] },
    ] }],
    refs: ['household:theo', 'D06', 'D71'],
    fixes: bad ? ['FIX-THEO-SSN'] : [],
  };
}

export function checkCryptoBasis(x: CheckCtx): CheckResult | null {
  if (!x.has('D34') || !x.has('D35')) return null;
  const answered = x.ix.packet.client.messages.some((m) => m.id === 'msg-07' && m.sent_at <= x.asOf);
  const total = x.ix.evNum('D34', 'total');
  const lots = (x.ix.evsByDoc.get('D34') ?? []).filter((e) => /^C\d+_proceeds$/.test(e.field));
  const sumLots = lots.reduce((s, e) => s + Number(e.value), 0);
  return {
    id: 'CHK-CRYPTO-BASIS', group: 'Rules and judgment', area: 'investments',
    title: 'Coinhaven 1099-DA and lot basis',
    question: 'Do the 1099-DA proceeds tie to the CSV, and does every lot have a basis?',
    method: 'Adds the 12 dispositions, matches each to its CSV lot and flags lots without basis.',
    status: 'fail',
    summary: `12 dispositions, proceeds ${sumLots.toLocaleString('en-US')} = 1099-DA total ${total.toLocaleString('en-US')}. Lot C6 (0.05 BTC, 5,325) was transferred in, so it has no basis and the engine used zero and the transfer date. ${answered ? 'Erik says it was bought on CryptoNorth on 3/15/2021 for about 3,050 (msg-07), which makes it long-term.' : 'Ask Erik where and when this BTC was bought.'} The questionnaire said "we didn't really sell" (qa-15): Form 1040's digital asset question must be answered Yes.`,
    tables: [],
    refs: ['D34', 'D35', 'ev-0918', 'ev-0919', 'msg-07', 'qa-15'],
    fixes: answered ? ['FIX-C6'] : [],
  };
}

export function checkCryptoMethod(x: CheckCtx): CheckResult | null {
  if (!x.has('D35')) return null;
  const rows: EvidenceTable['rows'] = [];
  const held = (x.ix.evsByDoc.get('D35') ?? []).filter((e) => /^buy\d+_date$/.test(e.field));
  const asset = (n: number) => /(BTC|ETH|SOL)/.exec(x.ix.page('D35', 1).split(`Buy ${n} `)[1] ?? '')?.[1];
  for (const c of ['C1', 'C2', 'C5']) {
    const acq = String(x.ix.ev('D35', `${c}_acquired`)?.value);
    const sym = String(x.ix.ev('D34', `${c}_asset`)?.value);
    const older = held.filter((h) => asset(Number(h.field.match(/\d+/)![0])) === sym && String(h.value) < acq).map((h) => String(h.value)).sort();
    if (older.length) rows.push({ status: 'warn', cells: [c, sym, acq, older.slice(0, 3).join(', ')] });
  }
  return {
    id: 'CHK-CRYPTO-METHOD', group: 'Rules and judgment', area: 'investments',
    title: 'Crypto lot selection method',
    question: 'Were the lots sold chosen the way the export says (first in, first out)?',
    method: 'For each sale, looks for older lots of the same asset that were still held afterwards.',
    status: rows.length ? 'review' : 'pass',
    summary: rows.length
      ? 'The export says "FIFO", but several sales used newer lots while older ones stayed in the account. From 2025, lots at a broker must be identified at the time of sale or FIFO applies by default. Ask whether Erik gave Coinhaven standing lot instructions; if not, the sales may need to be recomputed under FIFO (holdings quantities needed).'
      : 'Lots follow FIFO.',
    tables: [{ columns: ['Sale', 'Asset', 'Lot used (acquired)', 'Older lots still held'], rows }],
    refs: ['D35', 'qa-15'],
    fixes: [],
  };
}

export function checkWashSales(x: CheckCtx): CheckResult | null {
  if (!x.has('D74') && !x.has('D31')) return null;
  type L = { id: string; desc: string; acq: string; sold: string; gain: number; wash: number; doc: string };
  const read = (doc: string, prefix: string): L[] => {
    const evs = x.ix.evsByDoc.get(doc) ?? [];
    const ids = [...new Set(evs.filter((e) => new RegExp(`^${prefix}\\d+_`).test(e.field)).map((e) => e.field.split('_')[0]))];
    return ids.map((id) => {
      const g = (f: string) => x.ix.ev(doc, `${id}_${f}`)?.value;
      return { id, doc, desc: String(g('desc') ?? g('description')), acq: String(g('acq') ?? g('acquired')), sold: String(g('sold')), gain: Number(g('proceeds')) - Number(g('basis')), wash: Number(g('wash') ?? 0) };
    });
  };
  const all = [...(x.has('D31') ? read('D31', 'M') : []), ...(x.has('D74') ? read('D74', 'X') : [])];
  const day = (s: string) => Date.parse(s + 'T00:00:00Z') / 86400000;
  const candidates = all.filter((a) => a.gain < 0 && a.wash === 0 && all.some((b) => b !== a && b.desc === a.desc && b.doc === a.doc && Math.abs(day(b.acq) - day(a.sold)) <= 30 && day(b.acq) > day(a.sold)));
  const rows = candidates.slice(0, 12).map((a) => {
    const b = all.find((o) => o !== a && o.desc === a.desc && o.doc === a.doc && Math.abs(day(o.acq) - day(a.sold)) <= 30 && day(o.acq) > day(a.sold))!;
    return { status: 'warn' as const, cells: [{ v: a.id, ref: a.doc }, a.desc, a.sold, { v: round2(a.gain), money: true }, `${b.id} bought ${b.acq}`] };
  });
  return {
    id: 'CHK-WASH-SALES', group: 'Rules and judgment', area: 'investments',
    title: 'Losses followed by a repurchase',
    question: 'Are there losses where the same security was bought again within 30 days but no wash sale was reported?',
    method: 'Screens every losing sale against later purchases of the same security in the same account.',
    status: candidates.length ? 'review' : 'pass',
    summary: candidates.length
      ? `${candidates.length} losing sales were followed within 30 days by a purchase of the same security with no wash sale reported. Brokers report wash sales for covered lots in the same account, so these usually reflect partial-share or lot-level matching. Review with the broker's realized-gain detail; no change proposed.`
      : 'No unreported repurchases found.',
    tables: [{ columns: ['Sale', 'Security', 'Sold', 'Loss', 'Repurchase'], money: [3], rows }],
    refs: ['D31', 'D74'],
    fixes: [],
    scanned: all.length,
    flagged: candidates.length,
  };
}

export function checkElections(x: CheckCtx): CheckResult | null {
  const wi = x.ix.packet.what_if.alternatives;
  if (!wi.length) return null;
  const rows: EvidenceTable['rows'] = wi.map((a) => ({
    status: a.id === 'equipment_section179' ? 'warn' as const : 'ok' as const,
    cells: [a.description, { v: a.federal.total_tax_change, money: true }, { v: a.california.total_tax_change, money: true },
      a.id === 'equipment_section179' ? 'Better: same federal result, lower California tax' : a.id === 'equipment_no_bonus' ? 'Worse' : a.id === 'standard_deduction' ? 'Worse: keep itemizing' : a.id === 'penalty_annualized' ? 'No benefit' : 'Required (see the HVAC finding)'],
  }));
  return {
    id: 'CHK-ELECTIONS', group: 'Rules and judgment', area: 'business',
    title: 'Elections and the engine\'s what-ifs',
    question: 'Is each available election the best one for this household?',
    method: 'Reads every engine what-if (exact results) and compares federal and California effects.',
    status: 'review',
    summary: 'Electing section 179 for the studio equipment instead of special depreciation costs nothing federally and saves 1,050 of California tax. Itemizing is right (standard deduction would cost 12,306). The annualized penalty method gives no relief.',
    tables: [{ columns: ['Alternative', 'Federal tax change', 'California tax change', 'Read'], money: [1, 2], rows }],
    refs: wi.map((a) => `whatif:${a.id}`),
    fixes: ['FIX-ELECT-179'],
  };
}
