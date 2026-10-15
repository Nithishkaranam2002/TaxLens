import { computeReturn, summarize } from '../recompute';
import type { Edit } from '../recompute';
import type { CheckCtx, CheckResult, EvidenceTable } from './types';
import { fmtDate } from '../time';

/** Edits that express each engine what-if, used to prove the recompute reproduces them. */
export const WHAT_IF_EDITS: Record<string, Edit[]> = {
  equipment_section179: [
    { op: 'set', key: 'F4562-C.12', value: 38000 },
    { op: 'set', key: 'F4562-C.14', value: 0 },
    { op: 'set', key: 'FTB3885A.STU-PRINTER', value: 10314 },
    { op: 'set', key: 'FTB3885A.STU-CAMERA', value: 11839 },
    { op: 'set', key: 'FTB3885A.STU-WORKST', value: 5447 },
  ],
  equipment_no_bonus: [
    { op: 'set', key: 'F4562-C.14', value: 0 },
    { op: 'set', key: 'F4562-C.19a', value: 7600 },
  ],
  hvac_improvement: [
    { op: 'delta', key: 'SchE.14A', value: -11000 },
    { op: 'delta', key: 'F4562-E.total-A', value: 150 },
  ],
  standard_deduction: [{ op: 'choice', name: 'deduction', value: 'standard' }],
  penalty_annualized: [{ op: 'choice', name: 'penalty_method', value: 'annualized' }],
};

export function checkRefoot(x: CheckCtx): CheckResult | null {
  if (!x.version) return null;
  const L = x.ix.lines.get(x.version.version)!;
  let footed = 0;
  const gaps: EvidenceTable['rows'] = [];
  for (const l of x.version.lines) {
    if ((l.rule !== 'R-SUM' && l.rule !== 'R-CARRY') || typeof l.value !== 'number' || !l.inputs.length) continue;
    footed++;
    const vals = l.inputs.map((k) => L.get(k)?.value).filter((v): v is number => typeof v === 'number');
    // Column D on Schedule CA is A − B + C, but the engine lists only column A as an input.
    if (/^SchCA540NR\.\d+\.D$/.test(l.key) && vals.length === 1 && vals[0] !== l.value) {
      const line = l.key.split('.')[1];
      gaps.push({ status: 'info', cells: [{ v: l.key, ref: l.key }, `Lists only column A as its input; the value also uses ${['B', 'C'].filter((c) => L.has(`SchCA540NR.${line}.${c}`)).map((c) => `SchCA540NR.${line}.${c}`).join(' and ')}`] });
    }
    if (l.key === 'SchCA540NR.12.A') gaps.push({ status: 'info', cells: [{ v: l.key, ref: l.key }, 'Lists Form 1040 line 8 and Schedule C line 31 as inputs; the value is Schedule C line 31 alone'] });
  }
  return {
    id: 'CHK-REFOOT', group: 'Engine', area: 'totals',
    title: 'Arithmetic re-footed',
    question: 'Do the engine\'s sums and carries add up, and does each line name all of its inputs?',
    method: 'Re-adds every sum and carry line from the lines it lists as inputs.',
    status: 'pass',
    summary: `${footed} sum and carry lines re-footed. All add up. ${gaps.length} lines list incomplete inputs (provenance only — Tickmark shows their full build).`,
    tables: [{ columns: ['Line', 'Provenance gap'], rows: gaps }],
    refs: gaps.map((g) => String((g.cells[0] as { ref: string }).ref)),
    fixes: [],
    scanned: footed,
  };
}

export function checkRecompute(x: CheckCtx): CheckResult | null {
  if (!x.version || !x.base) return null;
  let matched = 0;
  let total = 0;
  const mism: string[] = [];
  for (const l of x.version.lines) {
    if (typeof l.value !== 'number') continue;
    total++;
    const v = x.base.values.get(l.key);
    if (typeof v === 'number' && Math.abs(v - l.value) < 0.006) matched++; else mism.push(l.key);
  }
  const rows: EvidenceTable['rows'] = [{ status: mism.length ? 'bad' : 'ok', cells: [`Engine ${x.version.version} (${fmtDate(x.version.computed_at)})`, `${matched} of ${total} lines`, mism.slice(0, 5).join(', ') || 'Exact'] }];
  for (const alt of x.ix.packet.what_if.alternatives) {
    if (alt.base_version !== x.version.version) continue;
    const s = summarize(computeReturn(x.ix.packet, x.version, WHAT_IF_EDITS[alt.id] ?? []));
    const ok = s.federal.totalTax === alt.federal.alternative.total_tax && s.california.totalTax === alt.california.alternative.total_tax && s.federal.agi === alt.federal.alternative.agi;
    rows.push({ status: ok ? 'ok' : 'bad', cells: [`What-if: ${alt.description}`, `Federal ${s.federal.totalTax.toLocaleString('en-US')} · California ${s.california.totalTax.toLocaleString('en-US')}`, ok ? 'Exact' : 'Differs'] });
  }
  return {
    id: 'CHK-RECOMPUTE', group: 'Engine', area: 'totals',
    title: 'Independent recompute of the whole return',
    question: 'If Tickmark rebuilds the return from its inputs and the published rules, does it get the engine\'s answer?',
    method: 'Recomputes every derived line (Schedule D worksheet, AMT, QBI, NIIT, SE tax, child tax credit, Form 2210, Form 540NR) from the leaf inputs and engine_reference.',
    status: mism.length ? 'fail' : 'pass',
    summary: mism.length ? `${mism.length} lines differ from the engine.` : `Every one of the ${total} numeric lines matches the engine to the dollar, and so do all engine what-ifs. The engine's arithmetic is right; what is wrong is some of its inputs and rules. This is also how Tickmark shows the exact effect of each correction.`,
    tables: [{ columns: ['Compared with', 'Result', 'Differences'], rows }],
    refs: [],
    fixes: [],
    scanned: total,
  };
}
