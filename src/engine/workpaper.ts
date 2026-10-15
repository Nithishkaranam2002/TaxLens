// Derives everything the screens show from three inputs: the packet (immutable), the activity log
// (folded to State) and the time being viewed. No screen keeps its own copy of workpaper data.

import type { PacketIndex } from '../data/index';
import type { PacketDocument, ReturnVersion } from '../data/packet';
import { AREAS, type AreaId, areaOfDoc, areaOfLine } from './areas';
import type { CheckResult } from './checks';
import { optionRateEffect } from './effects';
import { type AnyEvent, type Level, type Snapshot, canonical, hash53 } from './events';
import type { FixDef, FixOption } from './fixes';
import { JUDGMENTS, STEP_IDS } from './judgments';
import type { Actor } from './people';
import { type Computed, type Edit, type Summary, computeReturn, summarize } from './recompute';
import { type Proposal, type State, fold, settleProposals } from './state';
import { rereadValue } from './checks/reread';
import { group } from './num';
import { fmtDate } from './time';

export interface ProposalView extends Proposal {
  fix: FixDef | null;
  option: FixOption | null;
  edits: Edit[];
  changes: { key: string; label: string; from: number | string | null; to: number | string | null }[];
  needs: string[];
}

export type FindingStatus = 'open' | 'proposed' | 'resolved' | 'closed' | 'waiting';
export interface Finding {
  check: CheckResult;
  status: FindingStatus;
  fixes: { def: FixDef; proposal: ProposalView | null }[];
  disposition: { disposition: string; reason: string; by: string; at: string } | null;
  blocking: boolean;
}

export type DocDisposition = 'used' | 'supporting' | 'duplicate' | 'superseded' | 'engagement' | 'identity' | 'prior-year' | 'agency' | 'waiting';
export interface DocAccount {
  doc: PacketDocument;
  received: boolean;
  area: AreaId;
  disposition: DocDisposition;
  reason: string;
  lines: string[];
  flags: string[];
  evCount: number;
  problems: number;
}

export type SignState = 'missing' | 'signed' | 'reopened';
export interface SignOffView { level: Level; state: SignState; by: string | null; at: string | null; diff: string[] }
export interface AreaStatus {
  id: AreaId;
  name: string;
  lines: string[];
  findingsOpen: number;
  proposalsPending: number;
  notesOpen: number;
  questionsOpen: number;
  fingerprint: string;
  snapshot: Snapshot;
  signoffs: Record<Level, SignOffView>;
  minutes: number;
  budgetHours: number | null;
  docs: string[];
}

export interface Variance { key: string; label: string; prior: number; current: number; delta: number; pct: number | null; flagged: boolean; suggestion: string; explanation: { text: string; by: string; at: string } | null }
export interface Blocker { kind: string; text: string; ref: string; area: AreaId | null }
export interface Step { id: string; met: boolean; how: string; auto: boolean; by?: string; at?: string }
export interface DiagView { code: string; severity: string; message: string; refs: string[]; status: 'open' | 'resolved'; how: string }

export interface Workpaper {
  asOf: string;
  version: ReturnVersion | null;
  state: State;
  base: Computed | null;
  ours: Computed | null;
  projected: Computed | null;
  summary: { engine: Summary | null; ours: Summary | null; projected: Summary | null };
  checks: CheckResult[];
  findings: Finding[];
  proposals: ProposalView[];
  docs: DocAccount[];
  areas: AreaStatus[];
  variances: Variance[];
  diagnostics: DiagView[];
  steps: Step[];
  blockers: Blocker[];
  returnFingerprint: string;
  clientApprovalState: 'none' | 'current' | 'lapsed';
  dataFixes: Map<string, string>;
  fixes: Map<string, FixDef>;
}

export interface BuildInput {
  ix: PacketIndex;
  fixes: FixDef[];
  actors: Actor[];
  events: AnyEvent[];
  asOf: string;
  checks: CheckResult[];
  /** Skip the projection with pending changes (used when only the rules need the workpaper). */
  noProjection?: boolean;
}

const LEVELS: Level[] = ['preparer', 'reviewer', 'partner'];

function proposalEdits(p: Proposal, fixes: Map<string, FixDef>): { fix: FixDef | null; option: FixOption | null; edits: Edit[] } {
  if (p.source.kind === 'fix') {
    const fix = fixes.get(p.source.fixId) ?? null;
    const opt = fix?.options.find((o) => o.id === (p.source as { option: string }).option) ?? fix?.options[0] ?? null;
    return { fix, option: opt, edits: opt?.edits ?? [] };
  }
  const s = p.source;
  return { fix: null, option: null, edits: [{ op: s.op, key: s.key, value: s.value, ...(s.op === 'set' && s.label ? { label: s.label } : {}) } as Edit] };
}

export function buildWorkpaper(inp: BuildInput): Workpaper {
  const { ix, asOf } = inp;
  const fixes = new Map(inp.fixes.map((f) => [f.id, f]));
  const events = inp.events.filter((e) => e.at <= asOf);
  const thresholdRaw = 1000;
  const state = fold(events, thresholdRaw);
  const roleOf = (id: string) => inp.actors.find((a) => a.id === id)?.role;
  settleProposals(state, roleOf);
  const version = ix.versionAsOf(asOf);

  // ---- Proposals and the return they produce ----
  const proposals: ProposalView[] = [...state.proposals.values()].map((p) => {
    const { fix, option, edits } = proposalEdits(p, fixes);
    const changes = option?.changes ?? (p.source.kind === 'manual' ? [{ key: p.source.key, label: p.title, from: null, to: p.source.value }] : []);
    const needs: string[] = [];
    if (p.status === 'proposed') {
      const approvals = p.decisions.filter((d) => d.decision === 'approve' && d.by !== p.by);
      if (!approvals.some((d) => ['reviewer', 'partner'].includes(roleOf(d.by) ?? ''))) needs.push('reviewer');
      if (p.needsPartner && !approvals.some((d) => roleOf(d.by) === 'partner')) needs.push('partner');
    }
    return { ...p, fix, option, edits, changes, needs };
  });
  const approved = proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
  const pending = proposals.filter((p) => p.status === 'proposed');
  const approvedEdits = approved.flatMap((p) => p.edits);
  const base = version ? baseOf(ix, version) : null;
  const ours = version ? (approvedEdits.length ? computeReturn(ix.packet, version, approvedEdits) : base) : null;
  const projected = version ? (pending.length && !inp.noProjection ? computeReturn(ix.packet, version, [...approvedEdits, ...pending.flatMap((p) => p.edits)]) : ours) : null;

  const dataFixes = new Map<string, string>();
  for (const p of approved) {
    if (p.fix?.dataChange) dataFixes.set(`${p.fix.dataChange.subject}.${p.fix.dataChange.field}`, p.fix.dataChange.to);
  }

  // ---- Findings ----
  const approvedFix = new Map<string, ProposalView>();
  const pendingFix = new Map<string, ProposalView>();
  for (const p of proposals) {
    if (p.source.kind !== 'fix') continue;
    if (p.status === 'approved') approvedFix.set(p.source.fixId, p);
    if (p.status === 'proposed') pendingFix.set(p.source.fixId, p);
  }
  const findings: Finding[] = [];
  for (const c of inp.checks) {
    if (c.status === 'pass' || c.status === 'info') continue;
    const fx = c.fixes.map((id) => ({ def: fixes.get(id)!, proposal: approvedFix.get(id) ?? pendingFix.get(id) ?? null })).filter((f) => f.def);
    const disp = state.dispositions.get(c.id) ?? null;
    let status: FindingStatus;
    if (c.status === 'waiting') status = 'waiting';
    else if (fx.length && fx.every((f) => approvedFix.has(f.def.id))) status = 'resolved';
    else if (disp && (c.status === 'review' || disp.disposition !== 'reviewed')) status = 'closed';
    else if (fx.some((f) => pendingFix.has(f.def.id) || approvedFix.has(f.def.id))) status = 'proposed';
    else status = 'open';
    findings.push({ check: c, status, fixes: fx, disposition: disp, blocking: status === 'open' || status === 'proposed' || status === 'waiting' });
  }

  // ---- Documents accounted for ----
  const vKey = version?.version ?? 'v3';
  const assetSources = new Set((version?.assets ?? []).flatMap((a) => a.sources));
  const fixEvidenceDocs = new Map<string, string[]>();
  for (const f of inp.fixes) for (const e of f.evidence) {
    const d = /^D\d\d$/.test(e) ? e : e.startsWith('ev-') ? ix.evs.get(e)?.document_id : /^doc:(D\d\d)/.exec(e)?.[1];
    if (d) fixEvidenceDocs.set(d, [...(fixEvidenceDocs.get(d) ?? []), f.id]);
  }
  const checkDocs = new Map<string, string[]>();
  for (const c of inp.checks) for (const r of c.refs) {
    const d = /^D\d\d$/.test(r) ? r : /^doc:(D\d\d)/.exec(r)?.[1];
    if (d) checkDocs.set(d, [...(checkDocs.get(d) ?? []), c.id]);
  }
  const docs: DocAccount[] = ix.packet.documents.map((doc) => {
    const received = doc.received_at <= asOf;
    const landing = ix.docLanding(vKey, doc.id);
    const lines = [...new Set(landing.flatMap((l) => l.lines))];
    const assetHit = (ix.evsByDoc.get(doc.id) ?? []).some((e) => assetSources.has(e.id));
    const flags: string[] = [];
    if (doc.marked_corrected) flags.push('Corrected');
    if (doc.extraction.status === 'partial') flags.push('Partly read');
    if (doc.extraction.status === 'not_extracted') flags.push('Not extracted');
    if (doc.received_at > '2026-03-02T22:15:00Z') flags.push('Late');
    const problems = received ? docProblems(ix, doc.id) : 0;
    let disposition: DocDisposition;
    let reason: string;
    if (!received) { disposition = 'waiting'; reason = `Arrives ${fmtDate(doc.received_at)}`; }
    else if (version?.documents_superseded.includes(doc.id)) { disposition = 'superseded'; reason = 'Replaced by the corrected form (D31); kept for the record.'; }
    else if (doc.id === 'D10') { disposition = 'duplicate'; reason = 'Second image of the Halvorsen W-2 (D09); all 17 fields agree; counted once.'; }
    else if (['D01', 'D02'].includes(doc.id)) { disposition = 'engagement'; reason = 'Engagement letter and §7216 consent, signed 1/12/2026.'; }
    else if (['D03', 'D04', 'D05', 'D71'].includes(doc.id)) { disposition = 'identity'; reason = doc.id === 'D03' ? 'IP PIN used for e-file.' : doc.id === 'D71' ? 'Confirms Theo\'s SSN as on the 2024 return.' : 'Identity verified for e-file.'; }
    else if (['D06', 'D07'].includes(doc.id)) { disposition = 'prior-year'; reason = doc.id === 'D06' ? '2024 return: carryovers, variances, prior-year AGI and dependent SSNs.' : 'Prior preparer\'s memo, open items and depreciation schedule.'; }
    else if (['D69', 'D70', 'D72'].includes(doc.id)) { disposition = 'agency'; reason = doc.id === 'D69' ? 'Estimated payments agreed to TC 670 entries.' : doc.id === 'D70' ? 'Resolved 2023 notice; no effect on 2025.' : '2028 examination letter; response built from the frozen record.'; }
    else if (lines.length || assetHit) { disposition = 'used'; reason = lines.length ? `Lands on ${lines.length} line${lines.length === 1 ? '' : 's'}.` : 'Feeds the depreciation schedule.'; }
    else if (fixEvidenceDocs.has(doc.id) || checkDocs.has(doc.id)) {
      disposition = 'supporting';
      const why: Record<string, string> = {
        D13: 'Form 3922 supports the ESPP ordinary income and basis.',
        D15: 'QuickBooks detail: 1099-K overlap, personal items, deposits without a 1099.',
        D22: 'Equipment invoice: cost and placed-in-service date.',
        D47: 'HVAC invoice: whole system replaced (capital).',
        D54: 'Closing statement: seller\'s share of 2025 property tax; purchase points.',
        D73: 'Paystub at the move: California wages through 7/15.',
        D14: 'Books: profit and loss and balance sheet.',
      };
      reason = why[doc.id] ?? `Evidence for ${[...(fixEvidenceDocs.get(doc.id) ?? []), ...(checkDocs.get(doc.id) ?? [])].slice(0, 2).join(', ')}.`;
    } else { disposition = 'supporting'; reason = 'Reviewed; no amount lands on the return.'; }
    return { doc, received, area: areaOfDoc(doc.id), disposition, reason, lines, flags, evCount: (ix.evsByDoc.get(doc.id) ?? []).length, problems };
  });

  // ---- Areas: fingerprints and sign-offs ----
  const verifiedArea = (t: string): AreaId | null => {
    if (t.startsWith('ev-')) { const d = ix.evs.get(t)?.document_id; return d ? areaOfDoc(d) : null; }
    if (/^D\d\d$/.test(t)) return areaOfDoc(t);
    return areaOfLine(t);
  };
  // After filing, correspondence that arrives later (a card, a notice) does not reopen what was filed;
  // while an amendment is open, it does.
  const docCutoff = state.frozen && !state.amendments.some((a) => !a.filed) ? state.frozen.at : asOf;
  const areaSnapshot = (area: AreaId | 'return'): Snapshot => {
    const vals: Record<string, number | string> = {};
    if (ours) for (const [k, v] of ours.values) if (area === 'return' || areaOfLine(k) === area) vals[k] = v;
    return {
      lines: vals,
      adjustments: approved.filter((p) => area === 'return' || p.area === area).map((p) => p.id).sort(),
      verified: state.verifications.filter((v) => area === 'return' || verifiedArea(v.target) === area).length,
      openNotes: [...state.notes.values()].filter((n) => n.status === 'open' && (area === 'return' || n.area === area)).length,
      judgments: [...state.judgments.values()].filter((j) => area === 'return' || j.area === area).map((j) => `${j.id}:${hash53(j.decision)}`).sort(),
      docs: docs.filter((d) => d.received && d.doc.received_at <= docCutoff && (area === 'return' || d.area === area)).map((d) => d.doc.id),
    };
  };
  const fingerprintOf = (s: Snapshot) => hash53(canonical({ l: s.lines, a: s.adjustments, j: s.judgments, d: s.docs }));
  const diffSnapshots = (a: Snapshot, b: Snapshot): string[] => {
    const out: string[] = [];
    for (const k of new Set([...Object.keys(a.lines), ...Object.keys(b.lines)])) {
      if (a.lines[k] !== b.lines[k] && !/^F8949\.[A-L]\.(?!total)/.test(k)) {
        const f = (v: number | string | undefined) => (v === undefined ? '—' : typeof v === 'number' ? group(v, 0, 4) : v);
        const label = ours?.labels.get(k) ?? base?.labels.get(k);
        out.push(`${k}${label ? ` (${label})` : ''}: ${f(a.lines[k])} → ${f(b.lines[k])}`);
      }
    }
    for (const id of b.adjustments) if (!a.adjustments.includes(id)) out.push(`Change ${state.proposals.get(id)?.seq ?? ''} approved: ${state.proposals.get(id)?.title ?? id}`);
    for (const id of a.adjustments) if (!b.adjustments.includes(id)) out.push(`Change ${state.proposals.get(id)?.seq ?? ''} no longer applied`);
    for (const j of b.judgments) if (!a.judgments.includes(j)) out.push(`Judgment ${j.split(':')[0]} recorded or changed`);
    for (const d of b.docs) if (!a.docs.includes(d)) out.push(`Document ${d} received`);
    return out;
  };

  const areas: AreaStatus[] = AREAS.map((a) => {
    const snap = areaSnapshot(a.id);
    const fp = fingerprintOf(snap);
    const signoffs = {} as Record<Level, SignOffView>;
    for (const lvl of LEVELS) {
      const so = state.signoffs.get(`${a.id}:${lvl}`);
      if (!so) signoffs[lvl] = { level: lvl, state: 'missing', by: null, at: null, diff: [] };
      else if (so.fingerprint === fp) signoffs[lvl] = { level: lvl, state: 'signed', by: so.by, at: so.at, diff: [] };
      else signoffs[lvl] = { level: lvl, state: 'reopened', by: so.by, at: so.at, diff: diffSnapshots(so.snapshot, snap) };
    }
    return {
      id: a.id, name: a.name,
      lines: ours ? [...ours.values.keys()].filter((k) => areaOfLine(k) === a.id) : [],
      findingsOpen: findings.filter((f) => f.check.area === a.id && f.blocking).length,
      proposalsPending: pending.filter((p) => p.area === a.id).length,
      notesOpen: [...state.notes.values()].filter((n) => n.area === a.id && n.status === 'open').length,
      questionsOpen: [...state.questions.values()].filter((q) => q.area === a.id && !q.answer).length,
      fingerprint: fp, snapshot: snap, signoffs,
      minutes: state.minutes.get(a.id) ?? 0,
      budgetHours: a.budgetKey ? ix.packet.firm.budget_hours[a.budgetKey] ?? null : null,
      docs: docs.filter((d) => d.area === a.id).map((d) => d.doc.id),
    };
  });
  const returnSnap = areaSnapshot('return');
  const returnFingerprint = fingerprintOf(returnSnap);

  // ---- Variances against the prior year ----
  const vr = ix.packet.firm.starter_standards.variance_review;
  const pct = Number(state.standards.get('variance_review.flag_if_change_over_percent') ?? vr.flag_if_change_over_percent);
  const amt = Number(state.standards.get('variance_review.and_over_amount') ?? vr.and_over_amount);
  const py = ix.packet.prior_years.return_2024;
  // 2024 was a full-year Form 540; line numbers that mean the same thing on the 540NR are aligned.
  const MAP: Record<string, string> = {
    'CA540.13': 'F540NR.13', 'CA540.17': 'F540NR.17', 'CA540.18': 'F540NR.18', 'CA540.19': 'F540NR.19', 'CA540.31': 'F540NR.31', 'CA540.32': 'F540NR.39',
    'CA540.64': 'F540NR.64', 'CA540.71': 'F540NR.71', 'CA540.72': 'F540NR.72', 'CA540.SchCA.adds': 'SchCA540NR.1.C', 'F8995.15': 'F1040.13', 'F8938': 'F8938.1.max', 'SchD.21': 'F1040.7',
  };
  // Payer-level detail lines are numbered differently each year; their totals are compared instead.
  const SKIP = /^(F8582\.unallowed|SchE\.22|F8582\.1c|F1040\.34|CA540\.111|SchB\.1\.\d|SchB\.5\.\d)/;
  const fixedNow = (id: string) => approved.some((p) => p.fix?.id === id);
  const curOf = (ck: string): number | undefined => {
    if (ck === 'SchC.27a') { const parts = [...ours!.values.entries()].filter(([k]) => k.startsWith('SchC.27a.')); return parts.length ? parts.reduce((t, [, v]) => t + (typeof v === 'number' ? v : 0), 0) : undefined; }
    const v = ours!.values.get(ck);
    return typeof v === 'number' ? v : undefined;
  };
  const variances: Variance[] = [];
  const seenKeys = new Set<string>();
  if (ours) {
    for (const [k, pv] of Object.entries(py.lines)) {
      if (typeof pv !== 'number' || SKIP.test(k)) continue;
      const ck = MAP[k] ?? k;
      if (seenKeys.has(ck)) continue;
      seenKeys.add(ck);
      const cv = curOf(ck);
      if (cv === undefined && Math.abs(pv) < amt) continue;
      const cur = cv ?? 0;
      const delta = cur - pv;
      const p = pv !== 0 ? delta / Math.abs(pv) : null;
      const flagged = Math.abs(delta) > amt && (p === null || Math.abs(p) * 100 > pct);
      const label = (ck === 'SchC.27a' ? 'Other expenses' : ours.labels.get(ck)) ?? py.line_labels[k] ?? ck;
      variances.push({ key: ck, label, prior: pv, current: cur, delta, pct: p, flagged, suggestion: varianceSuggestion(ck, fixedNow, (x) => curOf(x) ?? 0), explanation: state.variance.get(ck) ?? null });
    }
  }

  // ---- Engine diagnostics ----
  const findingStatus = (id: string) => findings.find((f) => f.check.id === id)?.status;
  const fixApproved = (id: string) => approvedFix.has(id);
  const judged = (id: string) => state.judgments.has(id);
  const diagnostics: DiagView[] = (version?.diagnostics ?? []).map((d) => {
    const disp = state.diagDispositions.get(d.code);
    const link: Record<string, [boolean, string]> = {
      SCORP_BASIS_INCOMPLETE: [ix.received('D40', asOf), 'Resolved by the 2023 K-1 (engine v3).'],
      DIGITAL_ASSET_BASIS_MISSING: [fixApproved('FIX-C6'), 'Basis from the 2021 purchase (change approved).'],
      K1_EXPECTED_NOT_RECEIVED: [ix.received('D37', asOf), 'Ridgeline K-1 received 6/22.'],
      AMT_CREDIT_CARRYFORWARD: [true, 'Carried to the 2026 roll-forward (Form 8801).'],
      AOTC_PHASED_OUT: [true, 'Confirmed: phased out at this AGI.'],
      FBAR_OUTSIDE_RETURN: [judged('J-3520') || !!state.dispositions.get('CHK-OUTSIDE-FILINGS'), 'Listed in outside filings; client informed.'],
      FORM_1099_FILING: [judged('J-1099NEC'), 'Judgment J-1099NEC recorded.'],
      DUE_DILIGENCE_REQUIRED: [!!state.dd, 'Form 8867 completed.'],
      CA_AMT_NOT_COMPUTED: [!!state.judgments.get('J-CA-AMT')?.approvedBy, 'Partner judgment J-CA-AMT approved.'],
      HOME_OFFICE_AREA_CHANGE: [fixApproved('FIX-HOMEOFFICE'), 'Home office corrected (change approved).'],
      QUESTIONNAIRE_SALES_CONFLICT: [findingStatus('CHK-QUESTIONNAIRE') === 'closed', 'Conflicts resolved by documents.'],
      LOW_CONFIDENCE_READ: [judged('J-STBRIGID'), 'Amount confirmed by bank statement; acknowledgment judgment recorded.'],
      BROKER_SUMMARY_DETAIL_MISMATCH: [fixApproved('FIX-M18'), 'Page 32 lot added (change approved).'],
    };
    const [ok, how] = link[d.code] ?? [false, ''];
    return { ...d, status: ok || disp ? 'resolved' : 'open', how: disp ? `${disp.disposition}: ${disp.reason}` : ok ? how : 'Needs a disposition.' };
  });

  // ---- Client approval ----
  const amounts = ours ? summarize(ours) : null;
  const approvalFingerprint = amounts ? hash53(canonical({ f: [amounts.federal.totalTax, amounts.federal.balanceDue], c: [amounts.california.totalTax, amounts.california.balanceDue], r: returnFingerprint })) : '';
  const clientApprovalState: Workpaper['clientApprovalState'] = !state.clientApproval ? 'none' : state.clientApproval.fingerprint === approvalFingerprint ? 'current' : 'lapsed';

  // ---- Required steps ----
  const stepDone = (id: string) => state.steps.get(id);
  const allReviewer = areas.every((a) => a.signoffs.reviewer.state === 'signed');
  const partner = state.signoffs.get('return:partner');
  const steps: Step[] = STEP_IDS.map((id) => {
    switch (id) {
      case 'Engagement letter and consents signed':
        return { id, met: ix.received('D01', asOf) && ix.received('D02', asOf), auto: true, how: 'Signed by both spouses 1/12/2026 (D01, D02).' };
      case 'All documents accounted for': {
        const n = docs.filter((d) => d.received).length;
        return { id, met: docs.every((d) => !d.received || d.disposition !== 'waiting'), auto: true, how: `${n} of ${n} received documents have a disposition.` };
      }
      case 'Prior-year variances explained': {
        const f = variances.filter((v) => v.flagged);
        const done = f.filter((v) => v.explanation).length;
        return { id, met: done === f.length, auto: true, how: `${done} of ${f.length} flagged variances explained.` };
      }
      case 'Carryovers agreed to prior year':
        return { id, met: inp.checks.find((c) => c.id === 'CHK-CARRYOVERS')?.status === 'pass', auto: true, how: 'Check: carryovers agree to the 2024 return.' };
      case 'Estimated payments agreed to IRS and FTB records': {
        const ok = ['CHK-FED-PAYMENTS', 'CHK-CA-PAYMENTS'].every((c) => ['resolved', undefined].includes(findingStatus(c)));
        return { id, met: ok, auto: true, how: ok ? 'Payments agree to the IRS transcript and FTB account.' : 'Payment findings still open.' };
      }
      case 'Due diligence completed':
        return { id, met: !!state.dd, auto: false, by: state.dd?.by, at: state.dd?.at, how: state.dd ? 'Form 8867 checklist completed.' : 'Complete the Form 8867 checklist.' };
      case 'Diagnostics resolved': {
        const open = diagnostics.filter((d) => d.status === 'open').length;
        return { id, met: open === 0, auto: true, how: `${diagnostics.length - open} of ${diagnostics.length} engine diagnostics resolved.` };
      }
      case 'Reviewer sign-off':
        return { id, met: allReviewer, auto: true, how: `${areas.filter((a) => a.signoffs.reviewer.state === 'signed').length} of ${areas.length} areas signed by the reviewer and current.` };
      case 'Partner sign-off':
        return { id, met: !!partner && partner.fingerprint === returnFingerprint, auto: true, by: partner?.by, at: partner?.at, how: !partner ? 'Partner signs the whole return last.' : partner.fingerprint === returnFingerprint ? 'Signed and current.' : 'Reopened: the return changed after the partner signed.' };
      case 'Client approval and e-file authorization':
        return { id, met: clientApprovalState === 'current', auto: true, how: clientApprovalState === 'none' ? 'Waiting for the client.' : clientApprovalState === 'current' ? 'Approved with Form 8879 PINs.' : 'Lapsed: amounts changed after approval.' };
      default: {
        const d = stepDone(id);
        return { id, met: !!d, auto: false, by: d?.by, at: d?.at, how: d?.note ?? 'Mark done when complete.' };
      }
    }
  });

  // ---- Blockers to filing ----
  const blockers: Blocker[] = [];
  for (const f of findings) if (f.blocking) blockers.push({ kind: 'Finding', text: f.check.title, ref: `check:${f.check.id}`, area: f.check.area });
  for (const p of pending) blockers.push({ kind: 'Change awaiting approval', text: p.title, ref: `adj:${p.id}`, area: p.area });
  for (const n of state.notes.values()) if (n.status === 'open' && n.blocking) blockers.push({ kind: 'Review note', text: n.text, ref: `note:${n.id}`, area: n.area });
  for (const j of JUDGMENTS) {
    const rec = state.judgments.get(j.id);
    if (!rec) blockers.push({ kind: 'Judgment to record', text: j.topic, ref: `judgment:${j.id}`, area: j.area });
    else if (j.needsPartner && !rec.approvedBy) blockers.push({ kind: 'Judgment awaiting partner', text: j.topic, ref: `judgment:${j.id}`, area: j.area });
  }
  for (const s of steps) if (!s.met && s.id !== 'Client approval and e-file authorization' && s.id !== 'Partner sign-off' && s.id !== 'Reviewer sign-off') blockers.push({ kind: 'Required step', text: s.id, ref: `step:${s.id}`, area: null });
  for (const a of areas) for (const lvl of LEVELS) {
    const so = a.signoffs[lvl];
    if (so.state !== 'signed') blockers.push({ kind: so.state === 'reopened' ? 'Sign-off reopened' : 'Sign-off missing', text: `${a.name} · ${lvl}`, ref: `signoff:${a.id}:${lvl}`, area: a.id });
  }
  if (!partner || partner.fingerprint !== returnFingerprint) blockers.push({ kind: 'Partner sign-off', text: 'Whole return', ref: 'signoff:return:partner', area: null });
  if (clientApprovalState !== 'current') blockers.push({ kind: 'Client approval', text: clientApprovalState === 'lapsed' ? 'Approval lapsed: amounts changed' : 'Form 8879 not signed', ref: 'client:approve', area: null });

  return {
    asOf, version, state, base, ours, projected,
    summary: { engine: base ? summarize(base) : null, ours: ours ? summarize(ours) : null, projected: projected ? summarize(projected) : null },
    checks: inp.checks, findings, proposals, docs, areas, variances, diagnostics, steps, blockers, returnFingerprint,
    clientApprovalState, dataFixes, fixes,
  };
}

// The engine's own return, recomputed with no changes, depends only on the version.
const baseCache = new WeakMap<ReturnVersion, Computed>();
function baseOf(ix: PacketIndex, v: ReturnVersion): Computed {
  let c = baseCache.get(v);
  if (!c) { c = computeReturn(ix.packet, v); baseCache.set(v, c); }
  return c;
}

// Re-reading a document's values against its printed pages depends only on the packet, so it is done once.
const problemCache = new WeakMap<PacketIndex, Map<string, number>>();
function docProblems(ix: PacketIndex, docId: string): number {
  let m = problemCache.get(ix);
  if (!m) { m = new Map(); problemCache.set(ix, m); }
  let n = m.get(docId);
  if (n === undefined) {
    n = (ix.evsByDoc.get(docId) ?? []).filter((e) => {
      const r = rereadValue(e, ix.page(docId, e.page));
      return r.kind === 'mismatch' || r.kind === 'blank-as-zero' || r.kind === 'missing' || r.kind === 'low-confidence';
    }).length;
    m.set(docId, n);
  }
  return n;
}

export function rateFor(ix: PacketIndex, v: ReturnVersion, fix: FixDef, option: FixOption) {
  return optionRateEffect(ix.packet, v, option, fix.engineWhatIf);
}

export const approvalFingerprintOf = (w: Workpaper): string => {
  const s = w.summary.ours;
  if (!s) return '';
  return hash53(canonical({ f: [s.federal.totalTax, s.federal.balanceDue], c: [s.california.totalTax, s.california.balanceDue], r: w.returnFingerprint }));
};

type Explain = string | ((fixed: (fixId: string) => boolean, n: (key: string) => number) => string);
const m = (x: number) => group(x);

const EXPLAIN: Record<string, Explain> = {
  'F1040.1a': 'Two employers (Corvane to May, Halvorsen from June), including RSU vests of 38,200 (W-2 box 14).',
  'F1040.2b': 'Higher bank and sweep balances, Swedish interest converted at a 2025 rate, and K-1 interest.',
  'F1040.7': 'Sale of the Austin condo (Form 4797 gain 105,040), S corporation distributions above basis, and brokerage gains; 2024 had a net loss.',
  'F1040.8': 'Schedule C profit up; Schedule E is now a loss because the condo sale released the suspended rental losses.',
  'F1040.9': 'Condo sale gain and higher wages.',
  'F1040.10': (f) => (f('FIX-SEHI') ? 'SEP contribution added this year, plus half of self-employment tax.' : 'SEP contribution and the self-employed health insurance the engine claims, plus half of self-employment tax.'),
  'F1040.11': 'Condo sale gain and higher wages.',
  'F1040.12': 'Itemizing this year: new home mortgage interest and points, SALT up to the cap, charitable gifts of stock and a vehicle. 2024 took the standard deduction.',
  'F1040.13': 'QBI deduction lower: smaller studio QBI after the SEP and the income limitation.',
  'F1040.15': 'Higher income (condo sale, wages) partly offset by itemized deductions.',
  'F1040.16': 'Higher taxable income, including the condo gain taxed at capital gain rates.',
  'F1040.19': (_f, n) => `Child tax credit and credit for other dependents (${m(n('F8812.8'))}) phase out to ${m(n('F8812.12'))}: 50 for each 1,000 of AGI over 400,000.`,
  'F1040.23': 'NIIT on the condo gain and investment income, plus additional Medicare tax, on top of self-employment tax.',
  'F1040.24': 'Higher income; AMT from the ISO exercise; NIIT.',
  'F1040.25a': 'Less withheld than in 2024 despite higher wages (W-2 box 2 from both employers, D08 and D09).',
  'F1040.26': (f) => (f('FIX-EST-Q4') ? 'Four payments of 3,000 per the IRS transcript; 2024 had 6,000 in all.' : 'The engine uses 4,000 for the January payment from the organizer; the IRS transcript shows 3,000 (CHK-FED-PAYMENTS).'),
  'F1040.33': 'Extension payment of 36,000 and higher estimates.',
  'Sch1.3': 'Higher studio profit: more receipts, less the 38,000 of equipment expensed this year.',
  'Sch1.5': 'Rental losses are allowed in full this year, including 16,150 suspended from prior years: the condo\'s sale gain is passive income and the condo was sold in a fully taxable sale.',
  'Sch1.17': (f) => (f('FIX-SEHI') ? 'No deduction, as in 2024: Erik could join Ngozi\'s employer plan.' : 'The engine claims 14,400; 2024 claimed none because Erik could join Ngozi\'s employer plan, and he still could in 2025 (qa-25, CHK-SEHI).'),
  'SchC.1': (f) => (f('FIX-1099K') ? 'More client work: five 1099-NECs (142,000) plus 9,300 from clients without a 1099.' : 'Includes the 12,400 Form 1099-K a second time (CHK-SCHC-RECEIPTS). Without it: 151,300 = five 1099-NECs plus clients without a 1099.'),
  'SchC.9': (f) => (f('FIX-MILEAGE') ? 'Rate 0.70 (0.67 in 2024) and more business miles.' : 'The engine counts the duplicated page of the mileage log: 11,800 miles instead of 8,100 (CHK-DUP-MILEAGE).'),
  'SchC.11': 'Two contractors this year: Mara Quintero 4,800 and Dev Patel 2,600 (D27).',
  'SchC.13': 'Studio equipment (38,000) placed in service in March and fully expensed.',
  'SchC.24a': 'Agrees to the 2025 books (D14, travel account).',
  'SchC.27a': (_f, n) => `Software and subscriptions (${m(n('SchC.27a.1'))}) and bank fees (${m(n('SchC.27a.2'))}) per the books (D14); 2024 also had print production (7,982).`,
  'SchC.28': 'Mainly the studio equipment expensed this year (38,000, line 13).',
  'SchC.29': 'Higher receipts, less the 38,000 of equipment expensed this year.',
  'SchC.31': 'Higher receipts, less the 38,000 of equipment expensed this year.',
  'SchC.44a': (f) => (f('FIX-MILEAGE') ? 'More business miles than 2024.' : 'The engine adds a duplicated page of the mileage log (CHK-DUP-MILEAGE).'),
  'SchD.7': 'Short-term brokerage, RSU and crypto sales, less the 3,200 short-term carryover; 2024 had a net short-term loss.',
  'SchD.15': 'The condo sale (Form 4797 gain 105,040), S corporation distributions above basis and long-term brokerage gains, less the 11,000 long-term carryover.',
  'SchD.16': 'Condo sale gain, S corporation distributions above basis and brokerage gains; 2024 was a net loss.',
  'SchE.14A': (f) => (f('FIX-HVAC') ? 'Routine repairs only; the 11,000 HVAC replacement is capitalized and depreciated.' : 'Includes the 11,000 HVAC replacement booked as a repair; it is an improvement (CHK-RENTAL-A).'),
  'SchE.20A': (f) => (f('FIX-HVAC') ? 'Repairs lower and depreciation includes the HVAC improvement.' : 'Repairs include the 11,000 HVAC replacement (CHK-RENTAL-A).'),
  'SchE.21A': (f) => (f('FIX-HVAC') ? 'Smaller loss: higher rent, and the HVAC replacement is depreciated instead of expensed.' : 'Larger loss: the 11,000 HVAC replacement is expensed as a repair (CHK-RENTAL-A).'),
  'SchE.3B': 'Condo rented nine months at 2,250 (lease ended 9/30); 2024 had four vacant months.',
  'SchE.12B': 'Condo loan paid off at the sale in October (Form 1098, D53).',
  'SchE.14B': 'Only the make-ready repairs before listing (1,800).',
  'SchE.16B': 'Property tax to the sale date (seller\'s proration at closing).',
  'SchE.18B': 'Building and flooring depreciated to the sale date (October 15).',
  'SchE.20B': 'Part year: rented nine months, sold October 15.',
  'SchE.21B': 'Condo rented nine months and sold.',
  'SchE.26': 'Both rentals\' losses, now including the 16,150 of prior-year suspended losses released this year.',
  'SchE.41': 'Rental losses allowed in full this year (suspended losses released), net of K-1 passive income.',
  'F8582.1b': 'Smaller condo loss (part year, then sold), partly offset by Fremont Way.',
  'F8582.4': 'Net passive income instead of a net loss: the condo sale gain (105,040) is passive income.',
  'F8606.3': '7,000 contributed for 2025 plus 7,000 of basis from 2024 (that contribution was made in February 2025).',
  'F8606.14': 'Both contributions were converted to Roth in 2025, so no basis carries to 2026.',
  'F2441.2': 'Theo\'s care at two providers this year (Bright Oak and Little Sprouts).',
  'SchSE.12': 'Higher Schedule C profit.',
  'F540NR.13': 'Federal AGI (Form 1040 line 11): condo sale gain and higher wages.',
  'F540NR.17': 'Total income, including the period after the move, sets the California rate.',
  'F540NR.18': 'California itemized deductions this year instead of the 2024 standard deduction.',
  'F540NR.19': 'Taxable income on all income: a part-year return computes the rate on everything.',
  'F540NR.31': 'Tax on total taxable income, which sets the California rate.',
  'F540NR.39': 'Exemption credits prorated by the California share of income (line 34).',
  'F540NR.64': 'Part-year resident: only income while a California resident and California-source income after the move.',
  'F540NR.71': 'Both employers withheld California tax; Halvorsen kept withholding it until September, after the move (qa-45).',
  'F540NR.72': (f) => (f('FIX-CA-PAYMENT') ? 'Three Web Pay payments of 3,500 credited to 2025 (FTB account); 2024 had one 3,000 payment.' : 'Four Web Pay payments of 3,500, but the FTB applied the 9/15/2025 one to 2024 (CHK-CA-PAYMENTS).'),
  'SchCA540NR.1.C': 'Employer HSA contributions added back for California, which does not exclude them (6,000 this year).',
};

function varianceSuggestion(key: string, fixed: (fixId: string) => boolean, n: (key: string) => number): string {
  const e = EXPLAIN[key];
  if (!e) return 'Agree the change to this year\'s documents for the line.';
  return typeof e === 'string' ? e : e(fixed, n);
}
