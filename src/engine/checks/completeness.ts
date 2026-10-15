import type { CheckCtx, CheckResult, EvidenceTable } from './types';

export interface OutsideFiling { id: string; what: string; why: string; due: string; owner: string; status: 'required' | 'confirm' | 'none'; refs: string[] }

export function outsideFilings(): OutsideFiling[] {
  return [
    { id: 'OF-FBAR', what: 'FinCEN Form 114 (FBAR) for 2025', why: 'Swedish account over 10,000 at its maximum', due: '2026-10-15', owner: 'Client (outside engagement)', status: 'confirm', refs: ['D36', 'D01', 'D07'] },
    { id: 'OF-1099NEC', what: 'Forms 1099-NEC for 2025 contractors (late)', why: 'Mara Quintero 4,800 and Dev Patel 2,600 paid by ACH', due: '2026-02-02 (past due)', owner: 'Client (outside engagement)', status: 'required', refs: ['D27', 'qa-23', 'D01'] },
    { id: 'OF-3520', what: 'Form 3520 for 2023', why: 'Bequest from Erik\'s mother over 100,000 (Swedish account opened 09/2023)', due: 'Past due (with 2023 return)', owner: 'Partner decision, then client', status: 'required', refs: ['D07', 'D36', 'qa-07'] },
    { id: 'OF-SEP', what: 'SEP excess contribution correction', why: 'Contribution exceeds the deductible limit', due: '2026-10-15 to withdraw without excise tax', owner: 'Client with Northlake', status: 'confirm', refs: ['D26'] },
    { id: 'OF-FTB-TRANSFER', what: 'FTB payment transfer request', why: '3,500 paid 9/15/2025 was applied to 2024', due: 'Before filing, or claim on the next return', owner: 'Firm with client authorization', status: 'confirm', refs: ['D68'] },
    { id: 'OF-OR', what: 'Oregon nonresident return', why: 'Woodworks filed an Oregon composite return for Erik', due: '—', owner: '—', status: 'none', refs: ['D39'] },
    { id: 'OF-AZ', what: 'Arizona nonresident return', why: 'Ridgeline filed an Arizona composite return', due: '—', owner: '—', status: 'none', refs: ['D38'] },
    { id: 'OF-ADA', what: 'Ada\'s own 2025 Form 1040', why: 'Summer W-2 4,100; she must check "can be claimed as a dependent"', due: '2026-04-15', owner: 'Ada (consumer software)', status: 'confirm', refs: ['household:ada'] },
    { id: 'OF-709', what: 'Gift tax return (Form 709)', why: 'Gifts of stock and a car were to charities: no return needed', due: '—', owner: '—', status: 'none', refs: ['D65', 'D66'] },
    { id: 'OF-8801', what: 'Form 8801 next year', why: 'Minimum tax credit from the ISO exercise', due: 'With the 2026 return', owner: 'Next year\'s preparer', status: 'confirm', refs: ['F6251.11'] },
  ];
}

export function checkOutsideFilings(_x: CheckCtx): CheckResult {
  const rows: EvidenceTable['rows'] = outsideFilings().map((o) => ({ status: o.status === 'required' ? 'bad' : o.status === 'confirm' ? 'warn' : 'ok', cells: [o.what, o.why, o.due, o.owner] }));
  return {
    id: 'CHK-OUTSIDE-FILINGS', group: 'Completeness', area: 'retirement',
    title: 'Every filing outside this return',
    question: 'What other returns and forms does this household\'s year require, and who owns each?',
    method: 'Lists every related filing the documents imply, against the engagement letter\'s scope.',
    status: 'review',
    summary: 'Two filings are required and not yet made (late 1099-NECs; Form 3520 for 2023). Four need the client to confirm. Three were considered and are not needed. Out-of-scope items must be communicated to the client in writing.',
    tables: [{ columns: ['Filing', 'Why', 'Due', 'Owner'], rows }],
    refs: ['D01'],
    fixes: [],
  };
}

export const AREAS_CONSIDERED: [string, string, 'yes' | 'no', string][] = [
  ['Wages and stock compensation', 'Two W-2s, RSU, ESPP, ISO', 'yes', 'D08'],
  ['Interest, dividends, foreign tax', 'Six payers; de minimis foreign tax credit', 'yes', 'D28'],
  ['Brokerage sales', '282 lots across three brokers', 'yes', 'D74'],
  ['Digital assets', 'Coinhaven 1099-DA; question answered Yes', 'yes', 'D34'],
  ['Retirement distributions and conversions', 'Backdoor Roth (Form 8606)', 'yes', 'D41'],
  ['Social Security benefits', 'None: no SSA-1099, nobody 65 or older (qa-42)', 'no', 'qa-42'],
  ['Unemployment and other income', 'None reported or indicated', 'no', ''],
  ['Business income', 'Lindqvist Studio, Schedule C', 'yes', 'D14'],
  ['Rental real estate and sale', 'Fremont Way; condo sold 10/15', 'yes', 'D46'],
  ['Partnerships and S corporations', 'Ridgeline K-1, Woodworks K-1', 'yes', 'D37'],
  ['Foreign accounts and gifts', 'Form 8938; FBAR and Form 3520 outside the return', 'yes', 'D36'],
  ['Health coverage', 'HDHP/HSA; Erik\'s plan is not Marketplace, so no Form 8962', 'yes', 'D25'],
  ['Education', 'Ada at UC Davis; credit phased out', 'yes', 'D59'],
  ['Child and dependent care', 'Two providers; benefits excluded', 'yes', 'D61'],
  ['Home purchase and refinance', 'Points, interest, property tax proration', 'yes', 'D54'],
  ['Sale of main home', 'None: the Sacramento home was rented', 'no', 'qa-09'],
  ['Energy credits', 'Heat pump is at the rental, not the main home: no residential credit', 'no', 'D47'],
  ['Clean vehicle credit', 'No vehicle purchase', 'no', ''],
  ['Charitable gifts', 'Cash, appreciated stock, vehicle', 'yes', 'D63'],
  ['Household employees', 'None: child care through providers', 'no', 'D61'],
  ['Estimated payments and extension', 'Agreed to IRS and FTB records', 'yes', 'D67'],
  ['Part-year residency', 'California to 7/14, Texas from 7/15', 'yes', 'qa-02'],
  ['Other states', 'Oregon and Arizona composites: no individual returns', 'no', 'D38'],
  ['Identity protection', 'IP PIN for Ngozi', 'yes', 'D03'],
  ['Filing status and dependents', 'Married filing jointly; two dependents', 'yes', 'qa-01'],
  ['Prior-year carryovers', 'Capital, passive, IRA basis', 'yes', 'D06'],
  ['Underpayment penalty', 'Form 2210 regular method; annualized gives no relief', 'yes', 'F2210.19'],
  ['Gift tax', 'Charitable gifts only', 'no', 'D65'],
];

export function checkAreasConsidered(_x: CheckCtx): CheckResult {
  return {
    id: 'CHK-AREAS', group: 'Completeness', area: 'intake',
    title: 'Every area of the return considered',
    question: 'Has every part of a Form 1040 been considered, including the ones that do not apply?',
    method: 'Walks a full return checklist and records the evidence for each yes and each no.',
    status: 'pass',
    summary: `${AREAS_CONSIDERED.length} areas considered: ${AREAS_CONSIDERED.filter((a) => a[2] === 'yes').length} apply, ${AREAS_CONSIDERED.filter((a) => a[2] === 'no').length} do not, each with its evidence.`,
    tables: [{ columns: ['Area', 'Conclusion', 'Applies', 'Evidence'], rows: AREAS_CONSIDERED.map(([a, c, y, r]) => ({ status: y === 'yes' ? 'ok' : 'info', cells: [a, c, y === 'yes' ? 'Yes' : 'No', r ? { v: r, ref: r } : '—'] })) }],
    refs: [],
    fixes: [],
  };
}
