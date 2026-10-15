export type AreaId =
  | 'intake' | 'wages' | 'investments' | 'business' | 'rentals' | 'passthroughs'
  | 'retirement' | 'deductions' | 'payments' | 'california' | 'totals';

export interface AreaDef {
  id: AreaId;
  name: string;
  short: string;
  budgetKey: string | null;
  docs: string[];
  blurb: string;
}

export const AREAS: AreaDef[] = [
  { id: 'intake', name: 'Engagement & household', short: 'Household', budgetKey: 'intake_and_engagement', docs: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D71'], blurb: 'Engagement, identity, filing status, dependents and the prior-year file.' },
  { id: 'wages', name: 'Wages & stock compensation', short: 'Wages & stock', budgetKey: 'wages_and_stock_compensation', docs: ['D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D73'], blurb: 'Two W-2s, RSU and ESPP sales, the ISO exercise and payroll-level checks.' },
  { id: 'investments', name: 'Investments & digital assets', short: 'Investments', budgetKey: 'investments_and_digital_assets', docs: ['D28', 'D29', 'D30', 'D31', 'D32', 'D33', 'D34', 'D35', 'D74'], blurb: 'Three brokerages, 282 sales, interest and dividends, and Coinhaven crypto.' },
  { id: 'business', name: 'Business (Lindqvist Studio)', short: 'Business', budgetKey: 'business', docs: ['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27'], blurb: 'Books to Schedule C, equipment, vehicle, home office, SE tax, SEP and health insurance.' },
  { id: 'rentals', name: 'Rentals & condo sale', short: 'Rentals', budgetKey: 'rentals_and_sale', docs: ['D46', 'D47', 'D48', 'D49', 'D50', 'D51', 'D52', 'D53'], blurb: '1450 Fremont Way all year, the Austin condo until its sale, passive losses and Form 4797.' },
  { id: 'passthroughs', name: 'K-1s & basis', short: 'K-1s & basis', budgetKey: 'pass_throughs_and_basis', docs: ['D37', 'D38', 'D39', 'D40'], blurb: 'Woodworks (S corporation) basis by year and the late Ridgeline K-1.' },
  { id: 'retirement', name: 'Retirement, HSA & foreign', short: 'Retirement & foreign', budgetKey: null, docs: ['D36', 'D41', 'D42', 'D43', 'D44', 'D45'], blurb: 'Backdoor Roth (Form 8606), HSA, the Swedish account, Form 8938 and outside filings.' },
  { id: 'deductions', name: 'Deductions & credits', short: 'Deductions', budgetKey: 'deductions_and_credits', docs: ['D54', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62', 'D63', 'D64', 'D65', 'D66'], blurb: 'Home purchase and refinance, taxes, charity, child care, education and the child tax credit.' },
  { id: 'payments', name: 'Payments & penalties', short: 'Payments', budgetKey: null, docs: ['D67', 'D68', 'D69', 'D70', 'D72'], blurb: 'Withholding, estimates agreed to IRS and FTB records, the extension and Form 2210.' },
  { id: 'california', name: 'California (540NR)', short: 'California', budgetKey: 'california', docs: [], blurb: 'Part-year residency to July 14, source of income, depreciation differences and other-state credit.' },
  { id: 'totals', name: 'Tax computation & totals', short: 'Totals', budgetKey: 'partner_review', docs: [], blurb: 'AGI to total tax: deductions, QBI, regular tax, AMT, credits, SE, Medicare and NIIT.' },
];

export const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, AreaDef>;

const RULES: [RegExp, AreaId][] = [
  [/^F8949\.[A-L]\.(N1|N2|N3|N4)$/, 'wages'],
  [/^F8949\.F\.SCORP$/, 'passthroughs'],
  [/^F8949\./, 'investments'],
  [/^(F1040\.1a|F1040\.1z|F8959\.|Sch2\.11$|Sch3\.11$|F6251\.2i$)/, 'wages'],
  [/^(SchB\.7a|SchB\.7b|SchB\.8)$/, 'retirement'],
  [/^(SchB\.|F1040\.2b$|F1040\.3a$|F1040\.3b$|SchD\.(1b|2|3|6|7|8b|9|10|13|14|15|16|18)$|F1040\.7$|F8960\.|Sch2\.12$|Sch3\.1$)/, 'investments'],
  [/^(SchC\.|SchSE\.|F4562-C\.|Sch1\.(3|15|16|17)$|F8995\.(2|15)\.1$|Sch2\.4$)/, 'business'],
  [/^(SchE\.(1|2|3|9|11|12|14|16|18|19|20|21|22)[AB]$|SchE\.26$|F4562-E\.|F4797\.|F8582\.|SchD\.(11|19)$)/, 'rentals'],
  [/^(SchE\.28|SchE\.32$|F7203\.|SchD\.12$|F8995\.(2|15)\.2$)/, 'passthroughs'],
  [/^(F8606\.|F1040\.4[ab]$|F8889\.|Sch1\.13$|F8938\.)/, 'retirement'],
  [/^(SchA\.|F8283\.|F1040\.12$|F8812\.|F8863\.|F2441\.|F8867\.|F1040\.19$|F1040\.20$|Sch3\.8$)/, 'deductions'],
  [/^(F1040\.(25a|25d|26|31|33|34|37|38)$|Sch3\.(10|15)$|F2210\.)/, 'payments'],
  [/^(SchCA540NR\.|F540NR\.|ScheduleS\.|FTB3885A\.|FTB5805\.)/, 'california'],
];

const lineArea = new Map<string, AreaId>();
export function areaOfLine(key: string): AreaId {
  let a = lineArea.get(key);
  if (a) return a;
  a = 'totals';
  for (const [re, area] of RULES) if (re.test(key)) { a = area; break; }
  lineArea.set(key, a);
  return a;
}

export function areaOfDoc(docId: string): AreaId {
  for (const a of AREAS) if (a.docs.includes(docId)) return a.id;
  return 'intake';
}

export const FORM_NAMES: Record<string, string> = {
  F1040: 'Form 1040', Sch1: 'Schedule 1', Sch2: 'Schedule 2', Sch3: 'Schedule 3', SchA: 'Schedule A', SchB: 'Schedule B',
  SchC: 'Schedule C', SchD: 'Schedule D', SchE: 'Schedule E', SchSE: 'Schedule SE', F8949: 'Form 8949', F4797: 'Form 4797',
  'F4562-C': 'Form 4562 (Schedule C)', 'F4562-E': 'Form 4562 (rentals)', F8582: 'Form 8582', F6251: 'Form 6251', F8959: 'Form 8959',
  F8960: 'Form 8960', F8995: 'Form 8995-A', F8995A: 'Form 8995-A', F8812: 'Schedule 8812', F8863: 'Form 8863', F2441: 'Form 2441',
  F8889: 'Form 8889', F8606: 'Form 8606', F8283: 'Form 8283', F7203: 'Form 7203', F8938: 'Form 8938', F2210: 'Form 2210',
  F8867: 'Form 8867', SchCA540NR: 'Schedule CA (540NR)', F540NR: 'Form 540NR', ScheduleS: 'Schedule S', FTB3885A: 'FTB 3885A',
  FTB5805: 'FTB 5805', CA540: 'Form 540',
};

export const formOf = (key: string) => key.split('.')[0];
export const formName = (key: string) => FORM_NAMES[formOf(key)] ?? formOf(key);
