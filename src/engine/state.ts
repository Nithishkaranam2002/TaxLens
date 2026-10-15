import type { AreaId } from './areas';
import type { AdjSource, AnyEvent, Effect, Level, Payload, Snapshot, TEvent, VerificationType } from './events';
import { eventOrder } from './events';

export interface Proposal {
  id: string;
  seq: number;
  area: AreaId;
  source: AdjSource;
  title: string;
  reason: string;
  authority: string;
  evidence: string[];
  effect: Effect;
  rateEffect: { fed: number; ca: number };
  by: string;
  at: string;
  eventId: string;
  status: 'proposed' | 'approved' | 'rejected' | 'withdrawn';
  decisions: { by: string; at: string; decision: 'approve' | 'reject'; note: string; eventId: string }[];
  needsPartner: boolean;
  approvedAt: string | null;
}

export interface Verification { target: string; method: VerificationType; note: string; evidence: string[]; by: string; at: string; eventId: string }
export interface Note {
  id: string; kind: 'review' | 'comment' | 'question'; target: string; area: AreaId; text: string; blocking: boolean; assignee: string | null; due: string | null;
  by: string; at: string; status: 'open' | 'resolved'; thread: { by: string; at: string; text: string; kind: 'reply' | 'resolve' | 'reopen' }[]; eventId: string;
}
export interface ClientQuestion { id: string; target: string; area: AreaId; text: string; due: string | null; by: string; at: string; answer: { by: string; at: string; text: string; attachments: string[] } | null; eventId: string }
export interface Attachment { id: string; target: string; name: string; mime: string; size: number; sha256: string; kind: 'file' | 'note' | 'message' | 'link'; text: string | null; by: string; at: string }
export interface Judgment { id: string; area: AreaId; topic: string; kind: Payload['judgment']['kind']; decision: string; rationale: string; authority: string; refs: string[]; needsPartner: boolean; by: string; at: string; approvedBy: string | null; approvedAt: string | null; eventId: string }
export interface SignOff { area: AreaId | 'return'; level: Level; fingerprint: string; snapshot: Snapshot; by: string; at: string; eventId: string }

export interface State {
  events: AnyEvent[];
  reverted: Set<string>;
  proposals: Map<string, Proposal>;
  verifications: Verification[];
  notes: Map<string, Note>;
  questions: Map<string, ClientQuestion>;
  clientMessages: { id: string; text: string; ref: string | null; by: string; at: string }[];
  attachments: Map<string, Attachment>;
  judgments: Map<string, Judgment>;
  dispositions: Map<string, { disposition: string; reason: string; by: string; at: string }>;
  diagDispositions: Map<string, { disposition: string; reason: string; by: string; at: string }>;
  variance: Map<string, { text: string; by: string; at: string }>;
  steps: Map<string, { by: string; at: string; note: string }>;
  dd: { by: string; at: string; answers: Record<string, string> } | null;
  signoffs: Map<string, SignOff>;
  assignments: Map<AreaId, Partial<Record<Level, string>>>;
  minutes: Map<string, number>;
  timeLog: { area: AreaId; minutes: number; by: string; at: string; note: string }[];
  reveals: { subject: string; field: string; reason: string; by: string; at: string }[];
  standards: Map<string, unknown>;
  clientApproval: { by: string; at: string; fingerprint: string; amounts: Payload['client.approve']['amounts'] } | null;
  transmissions: { jurisdiction: string; submissionId: string; at: string; by: string; returnHash: string }[];
  results: { jurisdiction: string; submissionId: string; status: string; errors: { code: string; message: string }[]; at: string; avoided?: string }[];
  frozen: { at: string; by: string; hash: string; values: Record<string, number | string> } | null;
  /** Every freeze in order: the original filing, then each amended filing. */
  filings: { at: string; by: string; hash: string; values: Record<string, number | string> }[];
  payments: { jurisdiction: string; amount: number; date: string; kind: string; at: string }[];
  amendments: { id: string; reason: string; by: string; at: string; filed: string | null }[];
  noticeResponses: { noticeId: string; hash: string; by: string; at: string; items: string[] }[];
  rollforward: { year: number; at: string; by: string } | null;
  seen: Map<string, string>;
  seasonLoaded: boolean;
}

export function emptyState(): State {
  return {
    events: [], reverted: new Set(), proposals: new Map(), verifications: [], notes: new Map(), questions: new Map(), clientMessages: [],
    attachments: new Map(), judgments: new Map(), dispositions: new Map(), diagDispositions: new Map(), variance: new Map(), steps: new Map(),
    dd: null, signoffs: new Map(), assignments: new Map(), minutes: new Map(), timeLog: [], reveals: [], standards: new Map(), clientApproval: null,
    transmissions: [], results: [], frozen: null, filings: [], payments: [], amendments: [], noticeResponses: [], rollforward: null, seen: new Map(), seasonLoaded: false,
  };
}

/** Which events are in effect: reverts cancel their target; reverting a revert restores it. */
export function effective(events: AnyEvent[]): { live: AnyEvent[]; reverted: Set<string> } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const reverted = new Set<string>();
  // Process reverts newest first so a revert of a revert wins.
  const reverts = events.filter((e) => e.type === 'revert' || e.type === 'revert.batch').sort(eventOrder).reverse();
  for (const r of reverts) {
    if (reverted.has(r.id)) continue;
    if (r.type === 'revert') {
      const p = r.payload as Payload['revert'];
      if (byId.has(p.eventId)) reverted.add(p.eventId);
    } else {
      const p = r.payload as Payload['revert.batch'];
      for (const e of events) if (e.batch === p.batch && e.id !== r.id) reverted.add(e.id);
    }
  }
  return { live: events.filter((e) => !reverted.has(e.id) && e.type !== 'revert' && e.type !== 'revert.batch'), reverted };
}

export function fold(all: AnyEvent[], partnerThreshold = 1000): State {
  const s = emptyState();
  const sorted = [...all].sort(eventOrder);
  s.events = sorted;
  const { live, reverted } = effective(sorted);
  s.reverted = reverted;
  let seq = 0;
  for (const e of live) {
    const by = e.actor;
    const at = e.at;
    switch (e.type) {
      case 'adj.propose': {
        const p = e.payload;
        const thr = Number(s.standards.get('partner_threshold') ?? partnerThreshold);
        const big = Math.abs(p.effect.fedTax) > thr || Math.abs(p.effect.caTax) > thr
          || Math.abs(p.effect.fedBalance) > thr || Math.abs(p.effect.caBalance) > thr;
        s.proposals.set(p.id, { id: p.id, seq: ++seq, area: p.area, source: p.source, title: p.title, reason: p.reason, authority: p.authority, evidence: p.evidence,
          effect: p.effect, rateEffect: p.rateEffect, by, at, eventId: e.id, status: 'proposed', decisions: [], needsPartner: big, approvedAt: null });
        break;
      }
      case 'adj.decide': {
        const pr = s.proposals.get(e.payload.id);
        if (!pr || pr.status === 'withdrawn') break;
        pr.decisions.push({ by, at, decision: e.payload.decision, note: e.payload.note, eventId: e.id });
        break;
      }
      case 'adj.withdraw': {
        const pr = s.proposals.get(e.payload.id);
        if (pr && pr.status === 'proposed') pr.status = 'withdrawn';
        break;
      }
      case 'verify':
        s.verifications.push({ ...e.payload, by, at, eventId: e.id });
        break;
      case 'note.add':
        s.notes.set(e.payload.id, { ...e.payload, due: e.payload.due ?? null, by, at, status: 'open', thread: [], eventId: e.id });
        break;
      case 'note.reply': {
        const n = s.notes.get(e.payload.noteId);
        if (n) n.thread.push({ by, at, text: e.payload.text, kind: 'reply' });
        break;
      }
      case 'note.resolve': {
        const n = s.notes.get(e.payload.noteId);
        if (n) { n.status = 'resolved'; n.thread.push({ by, at, text: e.payload.text, kind: 'resolve' }); }
        break;
      }
      case 'note.reopen': {
        const n = s.notes.get(e.payload.noteId);
        if (n) { n.status = 'open'; n.thread.push({ by, at, text: e.payload.text, kind: 'reopen' }); }
        break;
      }
      case 'client.ask':
        s.questions.set(e.payload.id, { ...e.payload, by, at, answer: null, eventId: e.id });
        break;
      case 'client.answer': {
        const q = s.questions.get(e.payload.qid);
        if (q) q.answer = { by, at, text: e.payload.text, attachments: e.payload.attachments };
        break;
      }
      case 'client.message':
        s.clientMessages.push({ ...e.payload, by, at });
        break;
      case 'attach':
        s.attachments.set(e.payload.id, { ...e.payload, by, at });
        break;
      case 'judgment':
        s.judgments.set(e.payload.id, { ...e.payload, by, at, approvedBy: null, approvedAt: null, eventId: e.id });
        break;
      case 'judgment.approve': {
        const j = s.judgments.get(e.payload.id);
        if (j) { j.approvedBy = by; j.approvedAt = at; }
        break;
      }
      case 'finding.dispose':
        s.dispositions.set(e.payload.checkId, { disposition: e.payload.disposition, reason: e.payload.reason, by, at });
        break;
      case 'diag.dispose':
        s.diagDispositions.set(e.payload.code, { disposition: e.payload.disposition, reason: e.payload.reason, by, at });
        break;
      case 'variance.explain':
        s.variance.set(e.payload.key, { text: e.payload.text, by, at });
        break;
      case 'step.done':
        s.steps.set(e.payload.step, { by, at, note: e.payload.note });
        break;
      case 'dd.complete':
        s.dd = { by, at, answers: e.payload.answers };
        break;
      case 'signoff':
        s.signoffs.set(`${e.payload.area}:${e.payload.level}`, { ...e.payload, by, at, eventId: e.id });
        break;
      case 'signoff.withdraw':
        s.signoffs.delete(`${e.payload.area}:${e.payload.level}`);
        break;
      case 'assign': {
        const a = s.assignments.get(e.payload.area) ?? {};
        a[e.payload.role] = e.payload.staff;
        s.assignments.set(e.payload.area, a);
        break;
      }
      case 'time':
        s.minutes.set(e.payload.area, (s.minutes.get(e.payload.area) ?? 0) + e.payload.minutes);
        s.timeLog.push({ ...e.payload, by, at });
        break;
      case 'pii.reveal':
        s.reveals.push({ ...e.payload, by, at });
        break;
      case 'standards.set':
        s.standards.set(e.payload.path, e.payload.value);
        break;
      case 'client.approve':
        s.clientApproval = { by, at, fingerprint: e.payload.fingerprint, amounts: e.payload.amounts };
        break;
      case 'efile.transmit':
        s.transmissions.push({ ...e.payload, at, by });
        break;
      case 'efile.result':
        s.results.push({ ...e.payload, at });
        break;
      case 'freeze':
        s.frozen = { at, by, hash: e.payload.hash, values: e.payload.values };
        s.filings.push(s.frozen);
        break;
      case 'payment':
        s.payments.push({ ...e.payload, at });
        break;
      case 'amend.open':
        s.amendments.push({ id: e.payload.id, reason: e.payload.reason, by, at, filed: null });
        break;
      case 'amend.file': {
        const a = s.amendments.find((x) => x.id === e.payload.id);
        if (a) a.filed = at;
        break;
      }
      case 'notice.respond':
        s.noticeResponses.push({ ...e.payload, by, at });
        break;
      case 'rollforward':
        s.rollforward = { year: e.payload.year, at, by };
        break;
      case 'seen':
        s.seen.set(by, e.payload.at);
        break;
      case 'workspace.load':
        s.seasonLoaded = true;
        break;
      default:
        break;
    }
  }
  // Resolve proposal status from decisions: approval by a reviewer or partner who did not propose,
  // plus a partner approval when the effect is over the threshold. Any rejection rejects.
  for (const p of s.proposals.values()) {
    if (p.status === 'withdrawn') continue;
    p.status = 'proposed';
    p.approvedAt = null;
    for (const d of p.decisions) {
      if (d.decision === 'reject') { p.status = 'rejected'; break; }
    }
  }
  return s;
}

/** Applied after fold, once actor roles are known. */
export function settleProposals(s: State, roleOf: (id: string) => string | undefined): void {
  for (const p of s.proposals.values()) {
    if (p.status !== 'proposed') continue;
    const approvals = p.decisions.filter((d) => d.decision === 'approve' && d.by !== p.by);
    const reviewerOk = approvals.find((d) => ['reviewer', 'partner'].includes(roleOf(d.by) ?? ''));
    const partnerOk = approvals.find((d) => roleOf(d.by) === 'partner');
    if (reviewerOk && (!p.needsPartner || partnerOk)) {
      p.status = 'approved';
      p.approvedAt = (p.needsPartner ? [reviewerOk, partnerOk!] : [reviewerOk]).map((d) => d.at).sort().pop()!;
    }
  }
}

export type { TEvent };
