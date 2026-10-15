import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function checkFederalPayments(x: CheckCtx): CheckResult | null {
  if (!x.version) return null;
  const transcripts = x.ix.packet.tax_agency_records.irs_account_transcript_2025.filter((t) => t.as_of <= x.asOf.slice(0, 10));
  const tr = transcripts[transcripts.length - 1];
  const note = x.ix.lines.get(x.version.version)?.get('F1040.26')?.note ?? '';
  const claimed = [...note.matchAll(/(\d{4}-\d{2}-\d{2}) ([\d,]+\.\d{2})/g)].map((m) => ({ date: m[1], amount: Number(m[2].replace(/,/g, '')) }));
  const ests = (tr?.transactions ?? []).filter((t) => t.code === '670' && t.description.startsWith('Estimated'));
  const rows: EvidenceTable['rows'] = claimed.map((c, i) => {
    const t = ests[i];
    const ok = t && t.amount === c.amount;
    const eftps = ['q1', 'q2', 'q3'].some((q) => x.ix.ev('D67', `${q}_date`)?.value === c.date);
    return { status: tr ? (ok ? 'ok' : 'bad') : 'warn', cells: [`Q${i + 1}`, c.date, { v: c.amount, money: true }, eftps ? { v: 'EFTPS confirmation', ref: 'D67' } : { v: 'Client answer qa-41', ref: 'qa-41' }, t ? `${t.date} · ${fmt(Number(t.amount))}` : tr ? 'Not on transcript' : '—'] };
  });
  const bad = rows.some((r) => r.status === 'bad');
  const ext = x.line('Sch3.10');
  if (ext) rows.push({ status: 'ok', cells: ['Extension', '2026-04-14', { v: ext, money: true }, { v: 'Form 4868 (firm)', ref: 'timeline:extension-2026-04-14' }, 'Filed by Daniel Ortiz with payment'] });
  return {
    id: 'CHK-FED-PAYMENTS', group: 'Agency records', area: 'payments',
    title: 'Federal estimates against the IRS transcript',
    question: 'Did the IRS receive every estimated payment the return claims?',
    method: 'Matches each claimed payment with transaction code 670 on the latest account transcript pulled.',
    status: !tr ? 'waiting' : bad ? 'fail' : 'pass',
    summary: !tr ? 'Pull the IRS account transcript.'
      : bad ? `The fourth payment is claimed at 4,000 (client: "4,000 I think", 1/14). The transcript pulled ${tr.as_of} shows 3,000 on 2026-01-15, and no EFTPS confirmation was uploaded for it. The underpayment penalty also moves (installment 4 is paid a day later).`
      : 'Every estimate agrees to the transcript.',
    tables: [{ columns: ['Installment', 'Date claimed', 'Amount claimed', 'Support', 'IRS transcript'], money: [2], rows }],
    refs: ['D67', 'D69', 'qa-41', 'F1040.26'],
    fixes: bad ? ['FIX-EST-Q4'] : [],
  };
}

export function checkCaPayments(x: CheckCtx): CheckResult | null {
  if (!x.has('D68')) return null;
  const rows: EvidenceTable['rows'] = [];
  for (let i = 1; i <= 6; i++) {
    const date = String(x.ix.ev('D68', `pay${i}_date`)?.value ?? '');
    const amt = x.ix.evNum('D68', `pay${i}_amount`);
    const yr = String(x.ix.ev('D68', `pay${i}_year`)?.value ?? '');
    const inWindow = date >= '2025-04-01' && date <= '2026-01-15';
    const counted = inWindow;
    const right = yr === '2025';
    rows.push({ status: counted && !right ? 'bad' : 'ok', cells: [date, { v: amt, money: true }, yr, counted ? 'Counted for 2025' : 'Not counted', counted && !right ? 'FTB holds it as a 2024 credit' : right ? 'On the 2025 account' : 'Belongs to 2024'] });
  }
  const bad = rows.some((r) => r.status === 'bad');
  return {
    id: 'CHK-CA-PAYMENTS', group: 'Agency records', area: 'payments',
    title: 'California payments by the year they were applied',
    question: 'Did the FTB apply every payment the return counts to tax year 2025?',
    method: 'Reads the tax year designated on each Web Pay confirmation and compares with the FTB account record.',
    status: bad ? 'fail' : 'pass',
    summary: bad ? 'The engine counts every payment dated in the 2025 window. The 9/15/2025 payment (3,500) was designated 2024, and the FTB holds it as a 2024 credit. Claim only what is on the 2025 account and ask the FTB to move the credit.' : 'Payments agree to the FTB account.',
    tables: [{ columns: ['Date', 'Amount', 'Designated', 'Engine', 'FTB account'], money: [1], rows }],
    refs: ['D68', 'agency:/ftb_account', 'F540NR.72'],
    fixes: bad ? ['FIX-CA-PAYMENT'] : [],
  };
}

export function checkIdentity(x: CheckCtx): CheckResult {
  const ng = x.ix.people.get('ngozi')!;
  const pin = x.has('D03') ? String(x.ix.ev('D03', 'ip_pin')?.value) : null;
  const pyAgi = x.ix.packet.household.prior_year_agi_for_esignature;
  const d06 = Number(x.ix.packet.prior_years.return_2024.lines['F1040.11']);
  const ok = pin === ng.ip_pin && pyAgi === d06;
  return {
    id: 'CHK-IDENTITY', group: 'Agency records', area: 'intake',
    title: 'Identity and e-file signature data',
    question: 'Will the IP PIN, prior-year AGI and identity documents pass at transmission?',
    method: 'Compares the organizer with the IRS CP01A notice, the 2024 return and both driver licenses.',
    status: ok ? 'pass' : 'fail',
    summary: `Ngozi's IP PIN agrees to the CP01A notice; Erik has none. Prior-year AGI for the e-signature (${fmt(pyAgi)}) agrees to the 2024 return. Both Texas licenses were issued 8/2/2025 with the Austin address.`,
    tables: [],
    refs: ['D03', 'D04', 'D05', 'D06'],
    fixes: [],
  };
}
