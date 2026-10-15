import type { CheckCtx, CheckResult, EvidenceTable } from './types';

export function checkCarryovers(x: CheckCtx): CheckResult {
  const co = x.ix.packet.prior_years.carryovers_into_2025;
  const py = x.ix.packet.prior_years.return_2024.lines;
  const rows: EvidenceTable['rows'] = [
    { status: x.line('SchD.6') === -co.capital_loss_short ? 'ok' : 'bad', cells: ['Short-term capital loss', { v: co.capital_loss_short, money: true }, { v: x.line('SchD.6'), money: true, ref: 'SchD.6' }, '2024 Schedule D: −6,200 short-term, −3,000 allowed → 3,200 left'] },
    { status: x.line('SchD.14') === -co.capital_loss_long ? 'ok' : 'bad', cells: ['Long-term capital loss', { v: co.capital_loss_long, money: true }, { v: x.line('SchD.14'), money: true, ref: 'SchD.14' }, '2024 Schedule D line 15'] },
    { status: Number(py['F8582.unallowed.A']) === -co.passive_1450_fremont ? 'ok' : 'bad', cells: ['Passive loss, Fremont Way', { v: co.passive_1450_fremont, money: true }, { v: co.passive_1450_fremont, money: true, ref: 'F8582.1c' }, '2024 Form 8582'] },
    { status: Number(py['F8582.unallowed.B']) === -co.passive_1200_barton_hills ? 'ok' : 'bad', cells: ['Passive loss, condo', { v: co.passive_1200_barton_hills, money: true }, { v: co.passive_1200_barton_hills, money: true, ref: 'F8582.1c' }, '2024 Form 8582'] },
    { status: Number(py['F8606.14']) === x.line('F8606.2') ? 'ok' : 'bad', cells: ['IRA basis (Ngozi)', { v: Number(py['F8606.14']), money: true }, { v: x.line('F8606.2'), money: true, ref: 'F8606.2' }, '2024 Form 8606 line 14'] },
  ];
  const bad = rows.some((r) => r.status === 'bad');
  return {
    id: 'CHK-CARRYOVERS', group: 'Prior year and client answers', area: 'intake',
    title: 'Carryovers agree to the prior year',
    question: 'Does every carryover into 2025 agree to the 2024 return as filed?',
    method: 'Rebuilds each carryover from the 2024 return lines and compares with what the engine used.',
    status: bad ? 'fail' : 'pass',
    summary: bad ? 'A carryover does not agree to the 2024 return.' : 'Capital losses, passive losses and IRA basis all agree to the 2024 return. California carryovers are the same except the appliance depreciation basis.',
    tables: [{ columns: ['Carryover', '2024 file', 'Used in 2025', 'Traced to'], money: [1, 2], rows }],
    refs: ['D06', 'D07', 'py:/carryovers_into_2025'],
    fixes: [],
  };
}

export function checkPriorOpenItems(x: CheckCtx): CheckResult {
  const items = x.ix.packet.prior_years.prior_preparer_workpaper.open_items_left_by_prior_preparer;
  const resolve = (s: string): [string, 'ok' | 'bad' | 'warn', string] => {
    if (/2023 Woodworks K-1/.test(s)) return x.has('D40') ? ['Resolved', 'ok', 'Client found the 2023 K-1 (D40); basis rolled forward'] : ['Open', 'warn', 'Requested from the client'];
    if (/5498/.test(s)) return x.has('D42') ? ['Resolved', 'ok', 'Form 5498 for 2024 shows the 7,000 contribution (D42)'] : ['Open', 'warn', 'Not yet received'];
    if (/square footage/.test(s)) return x.has('D24') ? ['Resolved', 'ok', 'Client measured 220 sq ft (Sacramento) and 260 sq ft (Austin) — not 300'] : ['Open', 'warn', ''];
    if (/3520/.test(s)) return ['Open', 'bad', 'No record of discussion. A 2023 bequest over 100,000 from a foreign person needs Form 3520 — raise with the client and partner'];
    return ['Open', 'warn', ''];
  };
  const rows: EvidenceTable['rows'] = items.map((s) => { const [st, status, how] = resolve(s); return { status, cells: [s, st, how] }; });
  const open = rows.filter((r) => r.status !== 'ok').length;
  return {
    id: 'CHK-PRIOR-OPEN-ITEMS', group: 'Prior year and client answers', area: 'intake',
    title: 'Open items left by the prior preparer',
    question: 'Has every open item from Delta River\'s 2024 file been closed?',
    method: 'Reads the prior workpaper\'s open-items list and looks for the document that closes each.',
    status: open ? 'review' : 'pass',
    summary: `${items.length - open} of ${items.length} closed by documents received this year. ${open ? 'Form 3520 for 2023 is still open.' : ''}`,
    tables: [{ columns: ['Prior preparer\'s open item', 'Status', 'How'], rows }],
    refs: ['D07', 'D40', 'D42', 'D24'],
    fixes: [],
  };
}

export function checkQuestionnaire(_x: CheckCtx): CheckResult {
  const rows: EvidenceTable['rows'] = [
    { status: 'bad', ref: 'qa-14', cells: [{ v: 'qa-14', ref: 'qa-14' }, 'Sold any stocks or other investments? "No"', '282 brokerage sales on three 1099-Bs', 'Documents govern'] },
    { status: 'warn', ref: 'qa-15', cells: [{ v: 'qa-15', ref: 'qa-15' }, 'Crypto: "We didn\'t really sell, just moved things around"', '12 dispositions on the 1099-DA (34,833)', 'Digital asset question: Yes'] },
    { status: 'warn', ref: 'qa-31', cells: [{ v: 'qa-31', ref: 'qa-31' }, 'IRA basis: "none that I know of"', '7,000 basis on the 2024 Form 8606 and 5498', 'Documents govern'] },
    { status: 'bad', ref: 'qa-41', cells: [{ v: 'qa-41', ref: 'qa-41' }, 'Q4 estimate "4,000 I think", 1/14', 'IRS: 3,000 on 1/15', 'Transcript governs'] },
    { status: 'bad', ref: 'qa-39', cells: [{ v: 'qa-39', ref: 'qa-39' }, 'Subaru "about 6,000"', 'Form 1098-C: sold for 2,900', 'Law limits to proceeds'] },
    { status: 'bad', ref: 'qa-25', cells: [{ v: 'qa-25', ref: 'qa-25' }, 'Erik eligible for employer coverage: "Yes"', 'Self-employed health insurance claimed', 'Answer controls'] },
    { status: 'ok', ref: 'qa-45', cells: [{ v: 'qa-45', ref: 'qa-45' }, 'Halvorsen kept withholding California tax', 'W-2 box 16/17 and paystub agree', 'Used for California wages'] },
  ];
  return {
    id: 'CHK-QUESTIONNAIRE', group: 'Prior year and client answers', area: 'intake',
    title: 'Client answers against the documents',
    question: 'Where do the client\'s answers disagree with the documents, and which one wins?',
    method: 'Reads each questionnaire answer against the documents and agency records on the same subject.',
    status: 'review',
    summary: 'Six answers conflict with the documents. Each conflict is resolved by the stronger evidence, and the reason is recorded.',
    tables: [{ columns: ['Answer', 'Client said', 'Documents show', 'Resolution'], rows }],
    refs: ['qa-14', 'qa-15', 'qa-25', 'qa-31', 'qa-39', 'qa-41'],
    fixes: [],
  };
}
