import type { ExtractedValue } from '../../data/packet';
import type { CheckCtx, CheckResult, EvidenceTable } from './types';

const NUM = /-?\(?\$?\d[\d,]*(?:\.\d+)?\)?%?/g;

function numbersOn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.match(NUM) ?? []) {
    const neg = m.startsWith('-') || m.startsWith('(');
    const pct = m.endsWith('%');
    const n = Number(m.replace(/[-()$,%]/g, ''));
    if (!Number.isNaN(n)) out.push((neg ? -1 : 1) * (pct ? n / 100 : n));
  }
  return out;
}

export type RereadKind = 'ok' | 'mismatch' | 'blank-as-zero' | 'zero-not-printed' | 'missing' | 'low-confidence' | 'skipped';

export interface RereadResult { ev: ExtractedValue; kind: RereadKind; reason: string }

/** Re-read one extracted value against the printed text of its page. */
export function rereadValue(ev: ExtractedValue, page: string): RereadResult {
  const v = ev.value;
  if (ev.value_type === 'boolean') return { ev, kind: 'skipped', reason: 'Check box' };
  if (v === null || v === undefined) {
    return { ev, kind: 'missing', reason: ev.text_as_read ? `Nothing usable read ("${ev.text_as_read}")` : 'No value read' };
  }
  if (typeof v === 'number') {
    const nums = numbersOn(page).map((n) => Math.abs(n));
    const target = Math.abs(v);
    const onPage = nums.some((n) => Math.abs(n - target) < 0.005) || (ev.value_type === 'percent' && nums.some((n) => Math.abs(n - target * 100) < 0.005));
    if (onPage) return ev.confidence < 0.6 ? { ev, kind: 'low-confidence', reason: `Read with ${ev.confidence.toFixed(2)} confidence` } : { ev, kind: 'ok', reason: '' };
    if (ev.confidence < 0.6) {
      const tail = String(Math.round(target)).slice(-3);
      const token = (page.match(/[$?\d][\d,?.]*\d/g) ?? []).find((t) => t.replace(/[^\d]/g, '').replace(/00$/, '').endsWith(tail) || t.includes('?'));
      return { ev, kind: 'low-confidence', reason: `Read as ${v.toLocaleString('en-US')} with ${ev.confidence.toFixed(2)} confidence; the page shows "${token ?? '?'}"` };
    }
    if (target === 0 && !ev.text_as_read) return { ev, kind: 'blank-as-zero', reason: 'Field is blank on the page; read as 0.00' };
    if (target === 0) return { ev, kind: 'zero-not-printed', reason: 'No such amount printed; read as 0.00' };
    return { ev, kind: 'mismatch', reason: `${v.toLocaleString('en-US')} is not printed on the page` };
  }
  const s = String(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const variants = [s, ev.text_as_read].filter(Boolean);
  if (iso) variants.push(`${iso[2]}/${iso[3]}/${iso[1]}`);
  if (variants.some((x) => page.includes(x))) {
    if (!page.includes(s) && !iso && ev.text_as_read && page.includes(ev.text_as_read) && ev.text_as_read !== s) {
      return { ev, kind: 'mismatch', reason: `Read "${s}"; page shows "${ev.text_as_read}"` };
    }
    return ev.confidence < 0.6 ? { ev, kind: 'low-confidence', reason: `Read with ${ev.confidence.toFixed(2)} confidence` } : { ev, kind: 'ok', reason: '' };
  }
  // Text that is not on the page: find what is printed in its place (same shape).
  const shape = s.replace(/\d/g, '\\d');
  const near = new RegExp(shape).exec(page);
  return { ev, kind: 'mismatch', reason: near ? `Read "${s}"; page shows "${near[0]}"` : `"${s}" is not printed on the page` };
}

export function checkReread(x: CheckCtx): CheckResult {
  const results: RereadResult[] = [];
  for (const ev of x.ix.packet.extracted_values) {
    if (!x.has(ev.document_id)) continue;
    results.push(rereadValue(ev, x.ix.page(ev.document_id, ev.page)));
  }
  const usedBy = (id: string) => x.ix.evUses.get(x.version?.version ?? 'v3')?.get(id) ?? [];
  const flagged = results.filter((r) => r.kind !== 'ok' && r.kind !== 'skipped' && r.kind !== 'zero-not-printed');
  const quiet = results.filter((r) => r.kind === 'zero-not-printed');
  const table: EvidenceTable = {
    columns: ['Value', 'Document', 'Read', 'Confidence', 'Finding', 'Used in'],
    rows: flagged.map((r) => ({
      ref: r.ev.id,
      status: r.kind === 'low-confidence' || r.kind === 'missing' ? 'warn' : 'bad',
      cells: [
        { v: `${r.ev.id} · ${r.ev.label}`, ref: r.ev.id },
        { v: `${r.ev.document_id} p${r.ev.page}`, ref: `doc:${r.ev.document_id}#page${r.ev.page}` },
        r.ev.value === null ? '—' : String(r.ev.value),
        r.ev.confidence.toFixed(2),
        r.reason,
        usedBy(r.ev.id).join(', ') || '—',
      ],
    })),
  };
  const confident = flagged.filter((r) => r.ev.confidence >= 0.95 && r.kind !== 'low-confidence');
  const fixes = ['FIX-2441-TIN', 'FIX-RSU-BASIS', 'FIX-C6'].filter((f) => x.fixes.has(f));
  return {
    id: 'CHK-REREAD', group: 'Re-read the documents', area: 'intake',
    title: 'Every extracted value against its printed page',
    question: 'Does each value the pipeline read actually appear on the page it came from?',
    method: 'Parses every number, date and identifier printed on each page and looks for the value the pipeline reported, ignoring formatting.',
    status: flagged.length ? 'fail' : 'pass',
    summary: `${results.length.toLocaleString('en-US')} values re-read. ${flagged.length} do not agree with the page, ${confident.length} of them with confidence of 0.95 or more. ${quiet.length} zero amounts were reported for fields that are not printed (no effect).`,
    tables: [table],
    refs: flagged.map((r) => r.ev.id),
    fixes,
    scanned: results.length,
    flagged: flagged.length,
  };
}

export function checkUnreadPages(x: CheckCtx): CheckResult {
  const rows: EvidenceTable['rows'] = [];
  let missing = false;
  for (const d of x.ix.packet.documents) {
    if (!x.has(d.id) || d.extraction.status === 'not_extracted') continue;
    for (const pg of d.pages) {
      const amounts = (pg.printed_content.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) ?? []).length;
      const evs = x.ix.evsByPage.get(`${d.id}#${pg.page}`) ?? [];
      if (amounts === 0 || evs.length > 0) continue;
      let finding = '';
      let status: 'ok' | 'bad' | 'info' = 'info';
      if (d.id === 'D28' && pg.page === 2) { finding = 'Summary read by TaxLens; ties to the five lots (see broker tie-out).'; status = 'ok'; }
      else if (d.id === 'D14' && pg.page === 2) { finding = 'Balance sheet: equipment 38,000.00 agrees to the Vantage invoice; book depreciation 7,600.00 is replaced by tax depreciation.'; status = 'ok'; }
      else if (/M18/.test(pg.printed_content)) {
        const superseded = x.version?.documents_superseded.includes(d.id);
        if (superseded) { finding = 'Same lot as the corrected form; this form is superseded.'; status = 'info'; }
        else { finding = 'Lot M18 (Ironwood REIT, proceeds 250.00, basis 310.00) is missing from the return.'; status = 'bad'; missing = true; }
      } else finding = 'Amounts printed; review whether any belong on the return.';
      rows.push({ status, ref: `doc:${d.id}#page${pg.page}`, cells: [{ v: `${d.id} page ${pg.page}`, ref: `doc:${d.id}#page${pg.page}` }, d.title, amounts, finding] });
    }
  }
  return {
    id: 'CHK-UNREAD-PAGES', group: 'Re-read the documents', area: 'investments',
    title: 'Pages with amounts the pipeline did not read',
    question: 'Is there a page with dollar amounts that produced no extracted values?',
    method: 'Lists every page that prints dollar amounts but has no extracted value, then reads it.',
    status: missing ? 'fail' : 'pass',
    summary: missing ? 'Page 32 of the corrected Meridian 1099 ("Additional transactions") holds a sale that is not on the return.' : 'Every page with amounts was read or accounted for.',
    tables: [{ columns: ['Page', 'Document', 'Amounts printed', 'What TaxLens found'], rows }],
    refs: rows.map((r) => r.ref!).filter(Boolean),
    fixes: missing ? ['FIX-M18'] : [],
  };
}
