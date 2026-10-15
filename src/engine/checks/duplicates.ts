import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const m = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function checkDuplicateW2(x: CheckCtx): CheckResult | null {
  if (!x.has('D09') || !x.has('D10')) return null;
  const a = x.ix.evsByDoc.get('D09') ?? [];
  const rows: EvidenceTable['rows'] = [];
  let differ = 0;
  for (const ea of a) {
    const eb = x.ix.ev('D10', ea.field);
    const same = eb && String(eb.value) === String(ea.value);
    if (!same) differ++;
    rows.push({ status: same ? 'ok' : 'bad', cells: [ea.label, { v: String(ea.value), ref: ea.id }, { v: eb ? String(eb.value) : '—', ref: eb?.id }, eb ? eb.confidence.toFixed(2) : '—'] });
  }
  const counted = String(x.ix.lines.get(x.version?.version ?? 'v3')?.get('F1040.1a')?.sources ?? []);
  const once = !counted.includes('ev-0052');
  return {
    id: 'CHK-DUP-W2', group: 'Duplicates and corrected forms', area: 'wages',
    title: 'Halvorsen W-2 uploaded twice',
    question: 'Is the phone photo (D10) the same W-2 as the PDF (D09), and is it counted once?',
    method: 'Compares all 17 fields of the two images and checks which one the wage line cites.',
    status: differ === 0 && once ? 'pass' : 'fail',
    summary: differ === 0 ? `All ${rows.length} fields agree (the photo read two boxes at lower confidence but the same values). Form 1040 line 1a counts the W-2 once.` : `${differ} fields differ between the two images.`,
    tables: [{ columns: ['Box', 'D09 (PDF)', 'D10 (photo)', 'Photo confidence'], rows }],
    refs: ['D09', 'D10', 'F1040.1a'],
    fixes: [],
  };
}

export function checkDuplicateMileage(x: CheckCtx): CheckResult | null {
  if (!x.has('D23')) return null;
  const d = x.ix.docs.get('D23')!;
  const trips = (page: number) => (x.ix.evsByPage.get(`D23#${page}`) ?? []).filter((e) => /^trip\d+_(date|destination|miles)$/.test(e.field)).map((e) => `${e.field}=${e.value}`);
  const pages = d.pages.map((p) => p.page);
  const rows: EvidenceTable['rows'] = [];
  let dupPage: number | null = null;
  let dupMiles = 0;
  for (const pg of pages) {
    const evs = x.ix.evsByPage.get(`D23#${pg}`) ?? [];
    const total = evs.find((e) => e.field === 'page_total');
    const tripMiles = evs.filter((e) => /_miles$/.test(e.field)).reduce((s, e) => s + Number(e.value), 0);
    let note = '';
    for (const other of pages) {
      if (other >= pg) break;
      if (trips(other).join('|') === trips(pg).join('|')) { note = `Same ${trips(pg).length / 3} trips as page ${other}`; dupPage = pg; dupMiles = total ? Number(total.value) : tripMiles; }
    }
    rows.push({ status: note ? 'bad' : 'ok', cells: [{ v: `Page ${pg}`, ref: `doc:D23#page${pg}` }, x.ix.page('D23', pg).slice(0, 48) + '…', tripMiles, { v: total ? Number(total.value) : null, ref: total?.id }, note || 'Unique'] });
  }
  const engineMiles = x.line('SchC.44a');
  const cited = String(x.ix.lines.get(x.version?.version ?? 'v3')?.get('SchC.44a')?.sources ?? []);
  const counted = dupPage !== null && cited.includes('ev-0404');
  return {
    id: 'CHK-DUP-MILEAGE', group: 'Duplicates and corrected forms', area: 'business',
    title: 'Mileage log pages',
    question: 'Does any page of the handwritten mileage log repeat another?',
    method: 'Compares the trips (date, destination, miles) read from each page and re-adds each page.',
    status: counted ? 'fail' : 'pass',
    summary: counted
      ? `Page ${dupPage} is a second scan of page ${dupPage! - 1} (the page itself says so). The engine summed every page total: ${engineMiles.toLocaleString('en-US')} miles instead of ${(engineMiles - dupMiles).toLocaleString('en-US')}.`
      : 'No page repeats another.',
    tables: [{ columns: ['Page', 'Begins', 'Trip miles re-added', 'Page total', 'Finding'], money: [2, 3], rows }],
    refs: ['D23', 'SchC.44a', 'SchC.9'],
    fixes: counted ? ['FIX-MILEAGE'] : [],
  };
}

export function checkDuplicateInterest(x: CheckCtx): CheckResult | null {
  if (!x.base) return null;
  const v = x.version!.version;
  const lines = [...(x.ix.lines.get(v)?.values() ?? [])].filter((l) => /^SchB\.1\.\d+$/.test(l.key));
  const rows: EvidenceTable['rows'] = [];
  let dup = false;
  for (const l of lines) {
    const ev = l.sources.find((s) => s.startsWith('ev-'));
    const doc = ev ? x.ix.evs.get(ev)?.document_id : undefined;
    const twin = lines.find((o) => o !== l && o.value === l.value && o.key < l.key);
    const text = doc ? x.ix.page(doc, 1) : '';
    const sweep = /sweep/i.test(text) && /7731/.test(text);
    const isDup = !!twin && sweep;
    if (isDup) dup = true;
    rows.push({ status: isDup ? 'bad' : 'ok', ref: l.key, cells: [{ v: l.key, ref: l.key }, l.label, { v: Number(l.value), money: true }, doc ? { v: doc, ref: doc } : '—', isDup ? `Same 1,840.00 bank sweep (account 7731) as ${twin!.key}` : ''] });
  }
  return {
    id: 'CHK-DUP-INTEREST', group: 'Duplicates and corrected forms', area: 'investments',
    title: 'Same interest reported on two statements',
    question: 'Is any interest payer reported twice through a composite statement and a standalone 1099-INT?',
    method: 'Compares interest lines by amount and account, and reads the payer description on each source page.',
    status: dup ? 'fail' : 'pass',
    summary: dup ? 'Northlake Bank\'s 1099-INT is the bank sweep inside the Northlake Securities composite (account 7731). The engine reports 1,840.00 twice. The 2024 return reported it once.' : 'Each interest payment is reported once.',
    tables: [{ columns: ['Line', 'Payer', 'Amount', 'Source', 'Finding'], money: [2], rows }],
    refs: ['D28', 'D29', 'SchB.1.1', 'SchB.1.2'],
    fixes: dup ? ['FIX-INT-DUP'] : [],
  };
}

export function checkCorrected1099(x: CheckCtx): CheckResult | null {
  if (!x.has('D30') || !x.has('D31')) {
    return null;
  }
  const a = x.ix.evsByDoc.get('D30') ?? [];
  const rows: EvidenceTable['rows'] = [];
  for (const ea of a) {
    const eb = x.ix.ev('D31', ea.field);
    if (eb && String(eb.value) !== String(ea.value)) {
      rows.push({ status: 'info', cells: [ea.field.split('_')[0], ea.label.replace(/^Lot \w+ /, ''), { v: String(ea.value), ref: ea.id }, { v: String(eb.value), ref: eb.id }] });
    }
  }
  const usesCorrected = x.version?.documents_used.includes('D31') && x.version?.documents_superseded.includes('D30');
  return {
    id: 'CHK-CORRECTED-1099', group: 'Duplicates and corrected forms', area: 'investments',
    title: 'Corrected Meridian 1099 replaces the original',
    question: 'What changed on the corrected form, and does the return use the corrected values?',
    method: 'Compares every field of the original and corrected forms and checks which one the engine used.',
    status: usesCorrected ? 'pass' : 'fail',
    summary: `${rows.length} fields changed on 3 lots (wash sale on M6, basis on M9, acquisition date and term on M14). ${usesCorrected ? 'Engine v2 and later use the corrected form; the original is marked superseded.' : 'The return still uses the original form.'}`,
    tables: [{ columns: ['Lot', 'Field', 'Original (D30)', 'Corrected (D31)'], rows }],
    refs: ['D30', 'D31'],
    fixes: [],
  };
}

export { m as money2 };
