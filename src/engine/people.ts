import type { Packet } from '../data/packet';

export type RoleKind = 'preparer' | 'reviewer' | 'partner' | 'firm_administrator' | 'quality_reviewer' | 'client';

export interface Actor {
  id: string;
  name: string;
  initials: string;
  role: RoleKind;
  roleLabel: string;
  credential: string | null;
  clearance: boolean;
  activeFrom: string;
  note?: string;
  /** Ink color token: who touched a number is visible from its color. */
  ink: 'blue' | 'green' | 'violet' | 'amber' | 'slate' | 'teal';
}

export const ROLE_LABEL: Record<RoleKind, string> = {
  preparer: 'Preparer',
  reviewer: 'Reviewer',
  partner: 'Partner',
  firm_administrator: 'Firm administrator',
  quality_reviewer: 'Quality reviewer',
  client: 'Client',
};

const INK: Record<RoleKind, Actor['ink']> = {
  preparer: 'blue', reviewer: 'green', partner: 'violet', firm_administrator: 'slate', quality_reviewer: 'teal', client: 'amber',
};

export function buildActors(p: Packet): Actor[] {
  const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const staff: Actor[] = p.firm.staff.map((s) => ({
    id: s.id, name: s.name, initials: initials(s.name), role: s.role, roleLabel: ROLE_LABEL[s.role], credential: s.credential,
    clearance: s.sensitive_data_clearance, activeFrom: s.active_from, note: s.note, ink: INK[s.role],
  }));
  const clients: Actor[] = p.firm.client_users.map((c) => ({
    id: c.id, name: c.name, initials: initials(c.name), role: 'client', roleLabel: 'Client', credential: null,
    clearance: false, activeFrom: '2026-01-01', ink: 'amber',
  }));
  return [...staff, ...clients];
}

export type Action =
  | 'verify' | 'propose' | 'approve' | 'withdraw' | 'note.review' | 'note.comment' | 'note.resolve' | 'client.ask' | 'client.answer'
  | 'client.message' | 'attach' | 'judgment' | 'judgment.approve' | 'dispose' | 'variance' | 'step' | 'dd' | 'signoff.preparer'
  | 'signoff.reviewer' | 'signoff.partner' | 'assign' | 'time' | 'pii.reveal' | 'standards' | 'clock' | 'client.approve'
  | 'efile' | 'amend' | 'notice' | 'rollforward' | 'revert' | 'qr.note';

export type Decision = { ok: true } | { ok: false; rule: string };
const no = (rule: string): Decision => ({ ok: false, rule });
const OK: Decision = { ok: true };

/** Firm rules quoted where a refusal applies (starter standards, as adopted). */
export const RULE = {
  selfReview: 'A person may not review or sign off on work they prepared.',
  partnerOver: 'Any adjustment with a tax effect over 1,000 (federal or state) requires partner sign-off.',
  authority: 'Every judgment call records the authority relied on.',
  dueDiligence: 'Due diligence must be documented for the child tax credit, credit for other dependents, American opportunity credit, earned income credit and head of household status.',
  notesBlock: 'Open review notes block filing.',
  masked: 'Staff without sensitive-data clearance see SSNs, bank and account numbers and IP PINs masked; every unmasked view is logged.',
  retention: 'Records are retained 7 years after filing, then destroyed.',
};

const STAFF_WORK = new Set<RoleKind>(['preparer', 'reviewer', 'partner']);

export function can(actor: Actor, action: Action, opts: { now: string; frozen?: boolean } = { now: '2026-07-01' }): Decision {
  if (actor.role !== 'client' && opts.now.slice(0, 10) < actor.activeFrom) {
    return no(`${actor.name} is not active on this engagement until ${actor.activeFrom}.`);
  }
  const changesReturn: Action[] = ['propose', 'approve', 'verify', 'judgment', 'variance', 'dispose', 'signoff.preparer', 'signoff.reviewer', 'signoff.partner'];
  if (opts.frozen && changesReturn.includes(action) && !['amend'].includes(action)) {
    return no('The return is frozen at filing. Open an amendment to change it.');
  }
  const r = actor.role;
  switch (action) {
    case 'verify': case 'propose': case 'note.comment': case 'client.ask': case 'attach': case 'judgment': case 'dispose':
    case 'variance': case 'time': case 'step': case 'dd': case 'withdraw': case 'revert':
      if (STAFF_WORK.has(r)) return OK;
      if (r === 'quality_reviewer' && (action === 'note.comment' || action === 'attach')) return OK;
      return no(r === 'client' ? 'Clients work in the client portal.' : `${ROLE_LABEL[r]}s do not change return work.`);
    case 'signoff.preparer':
      return STAFF_WORK.has(r) ? OK : no('Only engagement staff sign off.');
    case 'approve': case 'note.review': case 'note.resolve': case 'signoff.reviewer': case 'efile':
      return r === 'reviewer' || r === 'partner' ? OK : no(r === 'preparer' ? 'Preparers cannot approve or review. A reviewer or partner must.' : 'Reviewer or partner only.');
    case 'judgment.approve': case 'signoff.partner': case 'amend': case 'notice':
      return r === 'partner' ? OK : no('Partner only.');
    case 'qr.note':
      return r === 'quality_reviewer' || r === 'partner' ? OK : no('Quality reviewer only.');
    case 'client.answer': case 'client.message': case 'client.approve':
      return r === 'client' ? OK : no('Only the client can answer, message or approve in the portal.');
    case 'pii.reveal':
      return actor.clearance ? OK : no(RULE.masked);
    case 'standards': case 'assign':
      return r === 'firm_administrator' || r === 'partner' ? OK : no('Firm administrator or partner only.');
    case 'clock': case 'rollforward':
      return r === 'client' ? no('Staff only.') : OK;
  }
  return no('Not allowed.');
}

export const SENSITIVE = /\b(\d{3})-(\d{2})-(\d{4})\b/g;

export function maskSsn(s: string): string {
  return s.replace(SENSITIVE, (_m, _a, _b, c) => `•••-••-${c}`);
}
export function maskAccount(s: string): string {
  return s.length > 4 ? '•'.repeat(Math.min(8, s.length - 4)) + s.slice(-4) : s;
}

/** Mask every sensitive identifier in free text: SSNs, foreign account numbers and IP PINs. */
export function maskSensitive(s: string): string {
  return maskSsn(s)
    .replace(/\b([A-Z]{2}\d{2})((?: \d{4}){4,7})\b/g, (_m, cc: string, rest: string) => `${cc}${rest.replace(/\d/g, '•').slice(0, -4)}${rest.slice(-4)}`)
    .replace(/(Identity Protection PIN[^.]*? is )(\d{6})/g, (_m, a: string) => `${a}••••••`)
    .replace(/\b(PIN )(\d{5})\b/g, (_m, a: string) => `${a}•••••`);
}
export const hasSensitive = (s: string) => /\b\d{3}-\d{2}-\d{4}\b/.test(s) || /\b[A-Z]{2}\d{2}(?: \d{4}){4,7}\b/.test(s) || /Identity Protection PIN/.test(s) || /\bPIN \d{5}\b/.test(s);
