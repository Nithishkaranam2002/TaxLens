// The activity log. Every action anyone takes is one immutable event. Nothing is edited or deleted:
// undo appends a revert. The workpaper's state at any moment is fold(events up to that moment).

import type { AreaId } from './areas';

export type Level = 'preparer' | 'reviewer' | 'partner';
export type VerificationType =
  | 'agreed_to_source_document' | 'recalculated' | 'confirmed_with_client' | 'agreed_to_prior_year' | 'agreed_to_third_party_record';

export const VERIFICATION_LABEL: Record<string, string> = {
  agreed_to_source_document: 'Agreed to source document',
  recalculated: 'Recalculated',
  confirmed_with_client: 'Confirmed with client',
  agreed_to_prior_year: 'Agreed to prior year',
  agreed_to_third_party_record: 'Agreed to third-party record',
};

export interface Effect { fedTax: number; caTax: number; fedBalance: number; caBalance: number; fedPenalty: number }

export type AdjSource =
  | { kind: 'fix'; fixId: string; option: string }
  | { kind: 'manual'; key: string; op: 'set' | 'delta'; value: number; label?: string };

export type Payload = {
  'adj.propose': { id: string; area: AreaId; source: AdjSource; title: string; reason: string; authority: string; evidence: string[]; effect: Effect; rateEffect: { fed: number; ca: number } };
  'adj.decide': { id: string; decision: 'approve' | 'reject'; note: string };
  'adj.withdraw': { id: string; note: string };
  verify: { target: string; method: VerificationType; note: string; evidence: string[] };
  'note.add': { id: string; kind: 'review' | 'comment' | 'question'; target: string; area: AreaId; text: string; blocking: boolean; assignee: string | null; due?: string | null };
  'note.reply': { noteId: string; text: string };
  'note.resolve': { noteId: string; text: string };
  'note.reopen': { noteId: string; text: string };
  'client.ask': { id: string; target: string; area: AreaId; text: string; due: string | null };
  'client.answer': { qid: string; text: string; attachments: string[] };
  'client.message': { id: string; text: string; ref: string | null };
  attach: { id: string; target: string; name: string; mime: string; size: number; sha256: string; kind: 'file' | 'note' | 'message' | 'link'; text: string | null };
  judgment: { id: string; area: AreaId; topic: string; kind: 'judgment' | 'election' | 'penalty' | 'due-diligence' | 'position'; decision: string; rationale: string; authority: string; refs: string[]; needsPartner: boolean };
  'judgment.approve': { id: string; note: string };
  'finding.dispose': { checkId: string; disposition: 'no-change' | 'deferred' | 'reviewed'; reason: string };
  'diag.dispose': { code: string; disposition: 'resolved' | 'accepted' | 'outside-scope'; reason: string };
  'variance.explain': { key: string; text: string };
  'step.done': { step: string; note: string };
  'dd.complete': { answers: Record<string, string> };
  signoff: { area: AreaId | 'return'; level: Level; fingerprint: string; snapshot: Snapshot };
  'signoff.withdraw': { area: AreaId | 'return'; level: Level; note: string };
  assign: { area: AreaId; role: Level; staff: string };
  time: { area: AreaId; minutes: number; note: string };
  'pii.reveal': { subject: string; field: string; reason: string };
  'standards.set': { path: string; value: unknown; note: string };
  'clock.set': { to: string; note: string };
  'client.approve': { fingerprint: string; amounts: { fedTotalTax: number; fedBalance: number; caTotalTax: number; caBalance: number }; pins: { taxpayer: string; spouse: string } };
  'efile.transmit': { jurisdiction: 'federal' | 'california'; submissionId: string; returnHash: string };
  'efile.result': { jurisdiction: 'federal' | 'california'; submissionId: string; status: 'accepted' | 'rejected' | 'not_transmitted'; errors: { code: string; message: string }[]; avoided?: string };
  freeze: { hash: string; values: Record<string, number | string>; summary: { fed: Effect | null; amounts: Record<string, number> } };
  payment: { jurisdiction: 'federal' | 'california'; amount: number; date: string; kind: 'balance' | 'refund' | 'interest' };
  'amend.open': { id: string; reason: string };
  'amend.file': { id: string; hash: string };
  'notice.respond': { noticeId: string; hash: string; items: string[] };
  rollforward: { year: number; hash: string };
  seen: { at: string };
  revert: { eventId: string; reason: string };
  'revert.batch': { batch: string; reason: string };
  'workspace.load': { what: 'season'; note: string };
};

export type EventType = keyof Payload;

export interface TEvent<T extends EventType = EventType> {
  id: string;
  /** Scenario time (the season clock), ISO. */
  at: string;
  /** Wall-clock time the event was recorded. */
  real: string;
  actor: string;
  type: T;
  payload: Payload[T];
  batch?: string;
}

export type AnyEvent = { [K in EventType]: TEvent<K> }[EventType];

export interface Snapshot {
  lines: Record<string, number | string>;
  adjustments: string[];
  verified: number;
  openNotes: number;
  judgments: string[];
  docs: string[];
}

// ---------- ids ----------
const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = 0;
let seq = 0;
/** Sortable unique id: 10 chars of time + 6 random. */
export function newId(prefix = ''): string {
  let t = Date.now();
  if (t <= lastTime) { t = lastTime; seq++; } else { lastTime = t; seq = 0; }
  let s = '';
  for (let i = 0; i < 10; i++) { s = ENC[t % 32] + s; t = Math.floor(t / 32); }
  let r = '';
  for (let i = 0; i < 6; i++) r += ENC[Math.floor(Math.random() * 32)];
  return prefix + s + String(seq).padStart(2, '0') + r;
}

/** Synchronous 53-bit hash (cyrb53) used for fingerprints. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/**
 * Scenario timestamps are kept at whole seconds in the packet's own format (2026-03-18T21:09:00Z),
 * so that every time in the packet and in the log compares correctly as a string.
 */
export const isoSeconds = (ms: number): string => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export const eventOrder = (a: AnyEvent, b: AnyEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
