// Every action checks the firm's rules before anything is appended to the log. A refusal names the
// rule. Actions are pure: they read the current workpaper and return the events to append.

import type { PacketIndex } from '../data/index';
import type { AreaId } from '../engine/areas';
import { effectBetween, optionRateEffect } from '../engine/effects';
import { type AnyEvent, type EventType, type Level, type Payload, type VerificationType, isoSeconds, newId } from '../engine/events';
import type { FixDef } from '../engine/fixes';
import { DUE_DILIGENCE_QUESTIONS, JUDGMENTS } from '../engine/judgments';
import { type Actor, RULE, can } from '../engine/people';
import { type Edit, computeReturn, summarize } from '../engine/recompute';
import { type Workpaper, approvalFingerprintOf } from '../engine/workpaper';
import { firmDay, fmtDate } from '../engine/time';

export interface ActCtx {
  ix: PacketIndex;
  fixes: Map<string, FixDef>;
  actors: Actor[];
  wp: Workpaper;
  me: Actor;
  now: string;
}

export type Result = { ok: true; events: AnyEvent[]; message: string } | { ok: false; rule: string };

const refuse = (rule: string): Result => ({ ok: false, rule });

function ev<T extends EventType>(x: ActCtx, type: T, payload: Payload[T], batch?: string, offsetMs = 0): AnyEvent {
  const at = isoSeconds(Date.parse(x.now) + offsetMs);
  return { id: newId(), at, real: new Date().toISOString(), actor: x.me.id, type, payload, ...(batch ? { batch } : {}) } as AnyEvent;
}

/** Frozen at filing, unless an amendment is open on top of the filed return. */
export const isLocked = (wp: Workpaper) => !!wp.state.frozen && !wp.state.amendments.some((a) => !a.filed);

function gate(x: ActCtx, action: Parameters<typeof can>[1]): Result | null {
  const d = can(x.me, action, { now: x.now, frozen: isLocked(x.wp) });
  return d.ok ? null : refuse(d.rule);
}

/** Exact effect of edits on top of the return as it stands (the workpaper already holds that return). */
function effectOnOurs(x: ActCtx, edits: Edit[]) {
  const before = x.wp.summary.ours ?? summarize(computeReturn(x.ix.packet, x.wp.version!, approvedEdits(x)));
  return effectBetween(before, summarize(computeReturn(x.ix.packet, x.wp.version!, [...approvedEdits(x), ...edits])));
}

const approvedEdits = (x: ActCtx) => x.wp.proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '')).flatMap((p) => p.edits);

// ---------- adjustments ----------
export function proposeFix(x: ActCtx, fixId: string, optionId: string, reason?: string, batch?: string): Result {
  const g = gate(x, 'propose'); if (g) return g;
  const fix = x.fixes.get(fixId);
  if (!fix) return refuse('Unknown correction.');
  const v = x.wp.version;
  if (!v) return refuse('No engine output yet: there is no return to adjust.');
  const missing = fix.requiresDocs.filter((d) => !x.ix.received(d, x.now));
  if (missing.length) return refuse(`Needs ${missing.join(', ')}, which has not been received.`);
  const open = x.wp.proposals.find((p) => p.source.kind === 'fix' && p.source.fixId === fixId && (p.status === 'proposed' || p.status === 'approved'));
  if (open) return refuse(`Already ${open.status} as change ${open.seq}.`);
  const option = fix.options.find((o) => o.id === optionId) ?? fix.options[fix.recommended];
  const effect = effectOnOurs(x, option.edits);
  const rate = optionRateEffect(x.ix.packet, v, option, fix.engineWhatIf);
  const e = ev(x, 'adj.propose', {
    id: newId('adj_'), area: fix.area, source: { kind: 'fix', fixId, option: option.id }, title: fix.options.length > 1 ? `${fix.title}: ${option.label}` : fix.title,
    reason: reason?.trim() || fix.why, authority: fix.authority, evidence: fix.evidence, effect, rateEffect: rate,
  }, batch);
  return { ok: true, events: [e], message: 'Change proposed. It shows as a projection until a reviewer approves it.' };
}

export function proposeManual(x: ActCtx, p: { key: string; op: 'set' | 'delta'; value: number; title: string; reason: string; authority: string; evidence: string[] }): Result {
  const g = gate(x, 'propose'); if (g) return g;
  const v = x.wp.version;
  if (!v) return refuse('No engine output yet.');
  if (!p.reason.trim()) return refuse('Every change records why.');
  if (!p.authority.trim()) return refuse(RULE.authority);
  const edits = [{ op: p.op, key: p.key, value: p.value } as const];
  const effect = effectOnOurs(x, [...edits]);
  const area = (x.wp.areas.find((a) => a.lines.includes(p.key))?.id ?? 'totals') as AreaId;
  const e = ev(x, 'adj.propose', {
    id: newId('adj_'), area, source: { kind: 'manual', key: p.key, op: p.op, value: p.value }, title: p.title, reason: p.reason,
    authority: p.authority, evidence: p.evidence, effect, rateEffect: { fed: NaN, ca: NaN },
  });
  return { ok: true, events: [e], message: 'Change proposed.' };
}

export function decide(x: ActCtx, adjId: string, decision: 'approve' | 'reject', note: string, batch?: string): Result {
  const g = gate(x, 'approve'); if (g) return g;
  const p = x.wp.proposals.find((q) => q.id === adjId);
  if (!p) return refuse('Unknown change.');
  if (p.status !== 'proposed') return refuse(`This change is already ${p.status}.`);
  if (p.by === x.me.id) return refuse(RULE.selfReview);
  if (p.decisions.some((d) => d.by === x.me.id && d.decision === 'approve')) return refuse('You have already approved this change.');
  if (decision === 'reject' && !note.trim()) return refuse('Say why the change is rejected.');
  const e = ev(x, 'adj.decide', { id: adjId, decision, note }, batch);
  const stillNeeds = decision === 'approve' && p.needsPartner && x.me.role !== 'partner' && !p.decisions.some((d) => x.actors.find((a) => a.id === d.by)?.role === 'partner');
  return { ok: true, events: [e], message: decision === 'reject' ? 'Change rejected.' : stillNeeds ? 'Approved. Over 1,000 of tax effect: the partner must also approve.' : 'Approved. The return now includes this change.' };
}

export function withdraw(x: ActCtx, adjId: string, note: string): Result {
  const g = gate(x, 'withdraw'); if (g) return g;
  const p = x.wp.proposals.find((q) => q.id === adjId);
  if (!p) return refuse('Unknown change.');
  if (p.by !== x.me.id && x.me.role !== 'partner') return refuse('Only the person who proposed a change (or the partner) can withdraw it.');
  if (p.status !== 'proposed') return refuse('Only a pending change can be withdrawn. Approved changes are undone with a reversing change.');
  return { ok: true, events: [ev(x, 'adj.withdraw', { id: adjId, note })], message: 'Change withdrawn.' };
}

// ---------- evidence ----------
export function verify(x: ActCtx, target: string, method: VerificationType, note: string, evidence: string[] = [], batch?: string): Result {
  const g = gate(x, 'verify'); if (g) return g;
  return { ok: true, events: [ev(x, 'verify', { target, method, note, evidence }, batch)], message: 'Verification recorded.' };
}

export function attach(x: ActCtx, a: Omit<Payload['attach'], 'id'>): Result {
  if (x.me.role !== 'client') { const g = gate(x, 'attach'); if (g) return g; }
  return { ok: true, events: [ev(x, 'attach', { ...a, id: newId('att_') })], message: a.kind === 'file' ? 'File attached as evidence.' : 'Added as evidence.' };
}

// ---------- notes and questions ----------
export function addNote(x: ActCtx, n: Omit<Payload['note.add'], 'id'>): Result {
  const g = gate(x, n.kind === 'review' ? 'note.review' : x.me.role === 'quality_reviewer' ? 'qr.note' : 'note.comment'); if (g) return g;
  if (!n.text.trim()) return refuse('Write the note first.');
  if (n.assignee) {
    const a = x.actors.find((y) => y.id === n.assignee);
    if (!a || !['preparer', 'reviewer', 'partner'].includes(a.role)) return refuse('A note can only be handed to engagement staff.');
    if (firmDay(x.now) < a.activeFrom) return refuse(`${a.name} is not active on this engagement until ${fmtDate(a.activeFrom)}.`);
  }
  if (n.due && n.due < firmDay(x.now)) return refuse('The due date is already past on the season clock.');
  const who = n.assignee ? x.actors.find((y) => y.id === n.assignee)?.name.split(' ')[0] : null;
  return { ok: true, events: [ev(x, 'note.add', { ...n, id: newId('note_') })], message: `${n.kind === 'review' && n.blocking ? 'Review note added. It blocks filing until cleared.' : 'Note added.'}${who ? ` ${who} is notified${n.due ? `; due ${fmtDate(n.due)}` : ''}.` : n.due ? ` Due ${fmtDate(n.due)}.` : ''}` };
}
export function reply(x: ActCtx, noteId: string, text: string): Result {
  if (x.me.role === 'client') return refuse('Clients reply through questions in the portal.');
  if (!text.trim()) return refuse('Write a reply first.');
  return { ok: true, events: [ev(x, 'note.reply', { noteId, text })], message: 'Reply added.' };
}
export function resolveNote(x: ActCtx, noteId: string, text: string): Result {
  const n = x.wp.state.notes.get(noteId);
  if (!n) return refuse('Unknown note.');
  if (n.kind === 'review') {
    const g = gate(x, 'note.resolve'); if (g) return g;
    if (n.by !== x.me.id && x.me.role !== 'partner') return refuse('A review note is cleared by the reviewer who wrote it, or the partner.');
  }
  return { ok: true, events: [ev(x, 'note.resolve', { noteId, text })], message: 'Note cleared.' };
}
export function reopenNote(x: ActCtx, noteId: string, text: string): Result {
  return { ok: true, events: [ev(x, 'note.reopen', { noteId, text })], message: 'Note reopened.' };
}
export function askClient(x: ActCtx, q: Omit<Payload['client.ask'], 'id'>): Result {
  const g = gate(x, 'client.ask'); if (g) return g;
  if (!q.text.trim()) return refuse('Write the question first.');
  return { ok: true, events: [ev(x, 'client.ask', { ...q, id: newId('q_') })], message: 'Question sent to the client portal.' };
}
export function answerClient(x: ActCtx, qid: string, text: string, attachments: string[] = []): Result {
  const g = gate(x, 'client.answer'); if (g) return g;
  if (!text.trim() && !attachments.length) return refuse('Write an answer or attach a file.');
  return { ok: true, events: [ev(x, 'client.answer', { qid, text, attachments })], message: 'Answer sent to your preparer. It becomes evidence in the file.' };
}
export function clientMessage(x: ActCtx, text: string): Result {
  const g = gate(x, 'client.message'); if (g) return g;
  return { ok: true, events: [ev(x, 'client.message', { id: newId('m_'), text, ref: null })], message: 'Message sent.' };
}

// ---------- judgment ----------
export function recordJudgment(x: ActCtx, topicId: string, j: { decision: string; rationale: string; authority: string; refs: string[] }): Result {
  const g = gate(x, 'judgment'); if (g) return g;
  const t = JUDGMENTS.find((q) => q.id === topicId);
  if (!t) return refuse('Unknown topic.');
  if (!j.authority.trim()) return refuse(RULE.authority);
  if (!j.decision.trim()) return refuse('Record the decision.');
  return { ok: true, events: [ev(x, 'judgment', { id: topicId, area: t.area, topic: t.topic, kind: t.kind, decision: j.decision, rationale: j.rationale, authority: j.authority, refs: j.refs, needsPartner: t.needsPartner })], message: t.needsPartner ? 'Judgment recorded. The partner must approve it.' : 'Judgment recorded.' };
}
export function approveJudgment(x: ActCtx, id: string, note = ''): Result {
  const g = gate(x, 'judgment.approve'); if (g) return g;
  const j = x.wp.state.judgments.get(id);
  if (!j) return refuse('Record the judgment first.');
  if (j.by === x.me.id) return refuse(RULE.selfReview);
  return { ok: true, events: [ev(x, 'judgment.approve', { id, note })], message: 'Judgment approved.' };
}
export function dispose(x: ActCtx, checkId: string, disposition: Payload['finding.dispose']['disposition'], reason: string): Result {
  const g = gate(x, 'dispose'); if (g) return g;
  if (!reason.trim()) return refuse('Record why.');
  const f = x.wp.findings.find((y) => y.check.id === checkId);
  if (f?.check.status === 'fail' && disposition === 'no-change' && !['reviewer', 'partner'].includes(x.me.role)) return refuse('Closing a failed check without a change needs a reviewer or partner.');
  return { ok: true, events: [ev(x, 'finding.dispose', { checkId, disposition, reason })], message: 'Disposition recorded.' };
}
export function disposeDiag(x: ActCtx, code: string, disposition: Payload['diag.dispose']['disposition'], reason: string): Result {
  const g = gate(x, 'dispose'); if (g) return g;
  if (!reason.trim()) return refuse('Record why.');
  return { ok: true, events: [ev(x, 'diag.dispose', { code, disposition, reason })], message: 'Diagnostic disposed.' };
}
export function explainVariance(x: ActCtx, key: string, text: string, batch?: string): Result {
  const g = gate(x, 'variance'); if (g) return g;
  if (!text.trim()) return refuse('Write the explanation.');
  return { ok: true, events: [ev(x, 'variance.explain', { key, text }, batch)], message: 'Variance explained.' };
}
export function markStep(x: ActCtx, step: string, note: string): Result {
  const g = gate(x, 'step'); if (g) return g;
  return { ok: true, events: [ev(x, 'step.done', { step, note })], message: 'Step marked done.' };
}
export function completeDueDiligence(x: ActCtx, answers: Record<string, string>): Result {
  const g = gate(x, 'dd'); if (g) return g;
  const missing = DUE_DILIGENCE_QUESTIONS.filter((q) => !answers[q.id]?.trim());
  if (missing.length) return refuse(`Answer every question (${missing.length} left).`);
  return { ok: true, events: [ev(x, 'dd.complete', { answers })], message: 'Due diligence recorded.' };
}

// ---------- sign-offs ----------
export function signOff(x: ActCtx, area: AreaId, level: Level): Result {
  const g = gate(x, `signoff.${level}` as const); if (g) return g;
  const a = x.wp.areas.find((y) => y.id === area);
  if (!a) return refuse('Unknown area.');
  const prior = (['preparer', 'reviewer', 'partner'] as Level[]).filter((l) => l !== level).map((l) => x.wp.state.signoffs.get(`${area}:${l}`)).filter(Boolean);
  if (level !== 'preparer' && prior.some((s) => s!.by === x.me.id)) return refuse(RULE.selfReview);
  if (level === 'reviewer' && a.signoffs.preparer.state !== 'signed') return refuse('The preparer signs this area first (or re-signs after it reopened).');
  if (level === 'partner' && a.signoffs.reviewer.state !== 'signed') return refuse('The reviewer signs this area first.');
  const open = x.wp.findings.filter((f) => f.check.area === area && f.status === 'open');
  if (open.length) return refuse(`Resolve or propose a fix for ${open.length} open finding${open.length > 1 ? 's' : ''} in this area first: ${open.map((f) => f.check.title).join('; ')}.`);
  if (level !== 'preparer') {
    const pend = x.wp.proposals.filter((p) => p.area === area && p.status === 'proposed');
    if (pend.length) return refuse(`${pend.length} change${pend.length > 1 ? 's' : ''} in this area still await approval.`);
    const notes = [...x.wp.state.notes.values()].filter((n) => n.area === area && n.status === 'open' && n.blocking);
    if (notes.length) return refuse(RULE.notesBlock);
  }
  return { ok: true, events: [ev(x, 'signoff', { area, level, fingerprint: a.fingerprint, snapshot: a.snapshot })], message: `Signed off as ${level}. If anything in this area changes, the sign-off reopens.` };
}
export function signOffReturn(x: ActCtx): Result {
  const g = gate(x, 'signoff.partner'); if (g) return g;
  const notCurrent = x.wp.areas.filter((a) => a.signoffs.reviewer.state !== 'signed');
  if (notCurrent.length) return refuse(`Reviewer sign-off is missing or reopened in: ${notCurrent.map((a) => a.name).join(', ')}.`);
  const blockers = x.wp.blockers.filter((b) => !['Partner sign-off', 'Client approval', 'Sign-off missing', 'Sign-off reopened'].includes(b.kind));
  if (blockers.length) return refuse(`${blockers.length} item${blockers.length > 1 ? 's' : ''} still block filing: ${blockers.slice(0, 3).map((b) => b.text).join('; ')}${blockers.length > 3 ? '…' : ''}`);
  const snap = { lines: Object.fromEntries(x.wp.ours?.values ?? []), adjustments: x.wp.proposals.filter((p) => p.status === 'approved').map((p) => p.id), verified: x.wp.state.verifications.length, openNotes: 0, judgments: [...x.wp.state.judgments.keys()], docs: [] };
  return { ok: true, events: [ev(x, 'signoff', { area: 'return', level: 'partner', fingerprint: x.wp.returnFingerprint, snapshot: snap })], message: 'Return signed by the partner. It can now go to the client for approval.' };
}
export function withdrawSignOff(x: ActCtx, area: AreaId | 'return', level: Level, note: string): Result {
  const so = x.wp.state.signoffs.get(`${area}:${level}`);
  if (!so) return refuse('Nothing to withdraw.');
  if (so.by !== x.me.id && x.me.role !== 'partner') return refuse('Only the person who signed (or the partner) can withdraw a sign-off.');
  return { ok: true, events: [ev(x, 'signoff.withdraw', { area, level, note })], message: 'Sign-off withdrawn.' };
}

// ---------- people and firm ----------
export function assign(x: ActCtx, area: AreaId, role: Level, staff: string): Result {
  const g = gate(x, 'assign'); if (g) return g;
  return { ok: true, events: [ev(x, 'assign', { area, role, staff })], message: 'Assigned.' };
}
export function logTime(x: ActCtx, area: AreaId, minutes: number, note: string): Result {
  const g = gate(x, 'time'); if (g) return g;
  if (!(minutes > 0)) return refuse('Enter minutes.');
  return { ok: true, events: [ev(x, 'time', { area, minutes, note })], message: 'Time logged.' };
}
export function reveal(x: ActCtx, subject: string, field: string, reason: string): Result {
  const d = can(x.me, 'pii.reveal', { now: x.now });
  if (!d.ok) return refuse(d.rule);
  return { ok: true, events: [ev(x, 'pii.reveal', { subject, field, reason })], message: 'Shown. This view is logged.' };
}
export function setStandard(x: ActCtx, path: string, value: unknown, note: string): Result {
  const g = gate(x, 'standards'); if (g) return g;
  return { ok: true, events: [ev(x, 'standards.set', { path, value, note })], message: 'Firm standard updated. It applies from now on.' };
}
export function setClock(x: ActCtx, to: string, note: string): Result {
  const g = gate(x, 'clock'); if (g) return g;
  if (to < x.now.slice(0, to.length)) return refuse('The season clock only moves forward. Use the timeline to look back.');
  return { ok: true, events: [ev(x, 'clock.set', { to, note })], message: `Season clock moved to ${fmtDate(to)}.` };
}

// ---------- client approval, filing and after ----------
export function clientApprove(x: ActCtx, pins: { taxpayer: string; spouse: string }): Result {
  const g = gate(x, 'client.approve'); if (g) return g;
  const partner = x.wp.steps.find((s) => s.id === 'Partner sign-off');
  if (!partner?.met) return refuse('Your CPA has not sent the return for approval yet.');
  if (!/^\d{5}$/.test(pins.taxpayer) || !/^\d{5}$/.test(pins.spouse)) return refuse('Each of you enters a five-digit PIN (Form 8879).');
  const s = summarize(x.wp.ours!);
  return { ok: true, events: [ev(x, 'client.approve', { fingerprint: approvalFingerprintOf(x.wp), amounts: { fedTotalTax: s.federal.totalTax, fedBalance: s.federal.balanceDue, caTotalTax: s.california.totalTax, caBalance: s.california.balanceDue }, pins: { taxpayer: '•••••', spouse: '•••••' } })], message: 'Thank you. Your return is approved and signed for e-file.' };
}

export function transmit(x: ActCtx): Result {
  const g = gate(x, 'efile'); if (g) return g;
  if (x.wp.state.frozen) return refuse('This return is already filed and accepted. Open an amendment to change it.');
  const blockers = x.wp.blockers;
  if (blockers.length) return refuse(`${blockers.length} item${blockers.length > 1 ? 's' : ''} block filing. First: ${blockers[0].kind} — ${blockers[0].text}.`);
  const ag = x.ix.packet.tax_agency_records.efile;
  const theoFixed = x.wp.dataFixes.has('household:theo.ssn');
  const prevFed = x.wp.state.results.filter((r) => r.jurisdiction === 'federal');
  const batch = newId('b_');
  const out: AnyEvent[] = [];
  const firstFed = ag.find((a) => a.jurisdiction === 'federal' && a.status === 'rejected');
  const okFed = ag.find((a) => a.jurisdiction === 'federal' && a.status === 'accepted');
  const okCa = ag.find((a) => a.jurisdiction === 'california' && a.status === 'accepted');
  const heldCa = ag.find((a) => a.jurisdiction === 'california' && a.status === 'not_transmitted');
  const hash = x.wp.returnFingerprint;
  if (!theoFixed && firstFed && !prevFed.length) {
    out.push(ev(x, 'efile.transmit', { jurisdiction: 'federal', submissionId: firstFed.submission_id, returnHash: hash }, batch));
    out.push(ev(x, 'efile.result', { jurisdiction: 'federal', submissionId: firstFed.submission_id, status: 'rejected', errors: firstFed.errors ?? [] }, batch, 1000));
    if (heldCa) out.push(ev(x, 'efile.result', { jurisdiction: 'california', submissionId: heldCa.submission_id, status: 'not_transmitted', errors: heldCa.errors ?? [] }, batch, 2000));
    return { ok: true, events: out, message: 'Federal return rejected: dependent 2 (Theo) TIN does not match. California is held.' };
  }
  if (!theoFixed) return refuse('Fix Theo\'s SSN before transmitting again (rejection R0000-504-02).');
  if (okFed) {
    out.push(ev(x, 'efile.transmit', { jurisdiction: 'federal', submissionId: okFed.submission_id, returnHash: hash }, batch));
    out.push(ev(x, 'efile.result', { jurisdiction: 'federal', submissionId: okFed.submission_id, status: 'accepted', errors: [], ...(prevFed.length ? {} : { avoided: firstFed ? `The scripted season shows this return rejected on ${fmtDate(firstFed.date)} for Theo's TIN (${firstFed.errors?.[0]?.code}). TaxLens corrected the TIN before transmission, so it was accepted on the first attempt.` : undefined }) }, batch, 1000));
  }
  if (okCa) {
    out.push(ev(x, 'efile.transmit', { jurisdiction: 'california', submissionId: okCa.submission_id, returnHash: hash }, batch, 2000));
    out.push(ev(x, 'efile.result', { jurisdiction: 'california', submissionId: okCa.submission_id, status: 'accepted', errors: [] }, batch, 3000));
  }
  const values: Record<string, number | string> = Object.fromEntries(x.wp.ours!.values);
  const s = summarize(x.wp.ours!);
  out.push(ev(x, 'freeze', { hash, values, summary: { fed: null, amounts: { fedTotalTax: s.federal.totalTax, fedBalance: s.federal.balanceDue, caTotalTax: s.california.totalTax, caBalance: s.california.balanceDue, fedPenalty: s.federal.penalty } } }, batch, 4000));
  return { ok: true, events: out, message: 'Accepted by the IRS and the FTB. The return is frozen as filed; later changes go into an amendment.' };
}

export function recordPayment(x: ActCtx, p: Payload['payment']): Result {
  const g = gate(x, 'clock'); if (g) return g;
  return { ok: true, events: [ev(x, 'payment', p)], message: 'Recorded.' };
}

export function openAmendment(x: ActCtx, reason: string): Result {
  const g = gate(x, 'amend'); if (g) return g;
  if (!x.wp.state.frozen) return refuse('Nothing filed yet. Change the return directly.');
  if (!reason.trim()) return refuse('Say why the return is being amended.');
  return { ok: true, events: [ev(x, 'amend.open', { id: newId('amd_'), reason })], message: 'Amendment opened on top of the filed return.' };
}

export function fileAmendment(x: ActCtx): Result {
  const g = gate(x, 'amend'); if (g) return g;
  const open = x.wp.state.amendments.find((a) => !a.filed);
  if (!open) return refuse('No amendment is open.');
  const pending = x.wp.proposals.filter((p) => p.status === 'proposed' && p.at >= open.at);
  if (pending.length) return refuse(`${pending.length} change${pending.length > 1 ? 's' : ''} in the amendment still await approval.`);
  const filedAt = x.wp.state.frozen?.at ?? '';
  const changed = x.wp.proposals.filter((p) => p.status === 'approved' && (p.approvedAt ?? '') > filedAt);
  if (!changed.length) return refuse('The amendment has no approved changes yet.');
  // An amended return goes through the same review, partner sign-off and client signature as the original.
  if (x.wp.blockers.length) return refuse(`${x.wp.blockers.length} item${x.wp.blockers.length > 1 ? 's' : ''} block filing the amendment. First: ${x.wp.blockers[0].kind} — ${x.wp.blockers[0].text}.`);
  const hash = x.wp.returnFingerprint;
  const s = summarize(x.wp.ours!);
  const batch = newId('b_');
  return { ok: true, events: [
    ev(x, 'amend.file', { id: open.id, hash }, batch),
    ev(x, 'freeze', { hash, values: Object.fromEntries(x.wp.ours!.values), summary: { fed: null, amounts: { fedTotalTax: s.federal.totalTax, fedBalance: s.federal.balanceDue, caTotalTax: s.california.totalTax, caBalance: s.california.balanceDue, fedPenalty: s.federal.penalty } } }, batch, 1000),
  ], message: 'Amended return filed (Form 1040-X and 540NR amended). The return is frozen again as amended.' };
}

export function respondNotice(x: ActCtx, noticeId: string, hash: string, items: string[]): Result {
  const g = gate(x, 'notice'); if (g) return g;
  return { ok: true, events: [ev(x, 'notice.respond', { noticeId, hash, items })], message: 'Response package recorded. Its fingerprint proves what was sent.' };
}

export function rollForward(x: ActCtx, hash: string): Result {
  const g = gate(x, 'rollforward'); if (g) return g;
  return { ok: true, events: [ev(x, 'rollforward', { year: 2026, hash })], message: '2026 file started from this workpaper.' };
}

export function markSeen(x: ActCtx): Result {
  return { ok: true, events: [ev(x, 'seen', { at: x.now })], message: '' };
}

export function revert(x: ActCtx, target: AnyEvent, reason: string): Result {
  const g = gate(x, 'revert');
  if (g && x.me.role !== 'client') return g;
  if (target.actor !== x.me.id && x.me.role !== 'partner') return refuse('Only the person who did this (or the partner) can undo it.');
  if (['freeze', 'efile.result', 'efile.transmit', 'client.approve', 'amend.file', 'notice.respond'].includes(target.type)) return refuse('What was filed, signed or sent cannot be undone. Amend instead.');
  if (['pii.reveal', 'clock.set', 'seen', 'workspace.load'].includes(target.type)) return refuse('This is part of the record and cannot be undone.');
  if (target.batch) return { ok: true, events: [ev(x, 'revert.batch', { batch: target.batch, reason })], message: 'Undone.' };
  return { ok: true, events: [ev(x, 'revert', { eventId: target.id, reason })], message: 'Undone.' };
}
