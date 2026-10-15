// Plain-English sentences for activity-log events, used by the activity feed, "since you last
// looked" and notice packages. One place, so every screen tells the same story.

import type { PacketIndex } from '../../data/index';
import { AREA, type AreaId } from '../../engine/areas';
import { type AnyEvent, VERIFICATION_LABEL } from '../../engine/events';
import { JUDGMENTS } from '../../engine/judgments';
import type { Actor } from '../../engine/people';
import { money } from '../format';
import { fmtDate } from '../../engine/time';

export interface Described { text: string; ref?: string; tone?: 'ok' | 'bad' | 'warn' | 'info'; kind: string }

const areaName = (a: AreaId | 'return') => (a === 'return' ? 'the whole return' : AREA[a]?.short ?? a);
const quote = (s: string, n = 90) => `“${s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s}”`;

export function describe(e: AnyEvent, ix: PacketIndex, all: AnyEvent[], actors: Actor[]): Described {
  const titleOf = (adjId: string) => {
    const p = all.find((x) => x.type === 'adj.propose' && x.payload.id === adjId);
    return p && p.type === 'adj.propose' ? p.payload.title : 'a change';
  };
  const name = (id: string) => actors.find((a) => a.id === id)?.name ?? id;
  const target = (t: string) => {
    if (t.startsWith('ev-')) return ix.evs.get(t)?.label ?? t;
    if (/^D\d\d$/.test(t)) return ix.docs.get(t)?.title ?? t;
    if (t.startsWith('check:')) return t.slice(6);
    if (t.startsWith('adj:')) return titleOf(t.slice(4));
    if (t.startsWith('question:')) return 'a client answer';
    return t;
  };
  switch (e.type) {
    case 'adj.propose': return { kind: 'Change', text: `proposed ${e.payload.title}`, ref: `adj:${e.payload.id}`, tone: 'info' };
    case 'adj.decide': return { kind: 'Change', text: `${e.payload.decision === 'approve' ? 'approved' : 'rejected'} ${titleOf(e.payload.id)}${e.payload.note ? ` — ${quote(e.payload.note, 60)}` : ''}`, ref: `adj:${e.payload.id}`, tone: e.payload.decision === 'approve' ? 'ok' : 'bad' };
    case 'adj.withdraw': return { kind: 'Change', text: `withdrew ${titleOf(e.payload.id)}`, ref: `adj:${e.payload.id}` };
    case 'verify': return { kind: 'Verification', text: `verified ${target(e.payload.target)} (${(VERIFICATION_LABEL[e.payload.method] ?? e.payload.method).toLowerCase()})`, ref: e.payload.target.startsWith('question:') ? undefined : e.payload.target, tone: 'ok' };
    case 'note.add': {
      const who = e.payload.assignee ? actors.find((a) => a.id === e.payload.assignee)?.name.split(' ')[0] ?? e.payload.assignee : null;
      const handed = who ? ` for ${who}` : '';
      const due = e.payload.due ? `, due ${fmtDate(e.payload.due)}` : '';
      return { kind: e.payload.kind === 'review' ? 'Review note' : 'Note', text: `${e.payload.kind === 'review' ? `left a${e.payload.blocking ? ' blocking' : ''} review note` : 'commented'} on ${target(e.payload.target)}${handed}${due}: ${quote(e.payload.text)}`, ref: `note:${e.payload.id}`, tone: e.payload.kind === 'review' && e.payload.blocking ? 'warn' : undefined };
    }
    case 'note.reply': return { kind: 'Note', text: `replied: ${quote(e.payload.text)}`, ref: `note:${e.payload.noteId}` };
    case 'note.resolve': return { kind: 'Note', text: `cleared a note${e.payload.text ? `: ${quote(e.payload.text, 70)}` : ''}`, ref: `note:${e.payload.noteId}`, tone: 'ok' };
    case 'note.reopen': return { kind: 'Note', text: `reopened a note: ${quote(e.payload.text, 70)}`, ref: `note:${e.payload.noteId}`, tone: 'warn' };
    case 'client.ask': return { kind: 'Client', text: `asked the client: ${quote(e.payload.text)}`, tone: 'info' };
    case 'client.answer': return { kind: 'Client', text: `answered: ${quote(e.payload.text)}`, tone: 'info' };
    case 'client.message': return { kind: 'Client', text: `sent a message: ${quote(e.payload.text)}` };
    case 'attach': return { kind: 'Evidence', text: `attached ${e.payload.kind === 'file' ? e.payload.name : 'a note'} to ${target(e.payload.target)}`, ref: e.payload.target };
    case 'judgment': return { kind: 'Judgment', text: `recorded the judgment “${e.payload.topic}”`, ref: `judgment:${e.payload.id}` };
    case 'judgment.approve': return { kind: 'Judgment', text: `approved the judgment “${JUDGMENTS.find((j) => j.id === e.payload.id)?.topic ?? e.payload.id}”`, ref: `judgment:${e.payload.id}`, tone: 'ok' };
    case 'finding.dispose': return { kind: 'Finding', text: `closed ${e.payload.checkId} (${e.payload.disposition}): ${quote(e.payload.reason, 70)}`, ref: `check:${e.payload.checkId}` };
    case 'diag.dispose': return { kind: 'Diagnostic', text: `disposed engine diagnostic ${e.payload.code} (${e.payload.disposition})` };
    case 'variance.explain': return { kind: 'Variance', text: `explained the change from 2024 on ${e.payload.key}`, ref: e.payload.key };
    case 'step.done': return { kind: 'Step', text: `marked “${e.payload.step}” done`, tone: 'ok' };
    case 'dd.complete': return { kind: 'Due diligence', text: 'completed the due diligence checklist (Form 8867)', tone: 'ok' };
    case 'signoff': return { kind: 'Sign-off', text: `signed off ${areaName(e.payload.area)} as ${e.payload.level}`, ref: `signoff:${e.payload.area}:${e.payload.level}`, tone: 'ok' };
    case 'signoff.withdraw': return { kind: 'Sign-off', text: `withdrew the ${e.payload.level} sign-off on ${areaName(e.payload.area)}`, tone: 'warn' };
    case 'assign': return { kind: 'Assignment', text: `assigned ${name(e.payload.staff)} as ${e.payload.role} on ${areaName(e.payload.area)}` };
    case 'time': return { kind: 'Time', text: `logged ${(e.payload.minutes / 60).toFixed(1)} h on ${areaName(e.payload.area)}${e.payload.note ? ` (${e.payload.note})` : ''}` };
    case 'pii.reveal': return { kind: 'Sensitive data', text: `viewed ${e.payload.field.replace(/_/g, ' ')} of ${e.payload.subject.replace(/^household:/, '')} unmasked`, tone: 'warn' };
    case 'standards.set': return { kind: 'Firm', text: `changed the firm standard ${e.payload.path} to ${JSON.stringify(e.payload.value)}${e.payload.note ? ` — ${e.payload.note}` : ''}` };
    case 'clock.set': return { kind: 'Clock', text: `moved the season clock to ${fmtDate(e.payload.to)}${e.payload.note ? ` (${e.payload.note})` : ''}` };
    case 'client.approve': return { kind: 'Client', text: `approved the return and signed Form 8879 (federal ${money(e.payload.amounts.fedBalance)} · California ${money(e.payload.amounts.caBalance)})`, tone: 'ok' };
    case 'efile.transmit': return { kind: 'E-file', text: `transmitted the ${e.payload.jurisdiction} return (submission ${e.payload.submissionId})`, tone: 'info' };
    case 'efile.result': return { kind: 'E-file', text: `${e.payload.jurisdiction === 'federal' ? 'IRS' : 'FTB'}: ${e.payload.status.replace('_', ' ')}${e.payload.errors.length ? ` — ${e.payload.errors[0].code}` : ''}`, tone: e.payload.status === 'accepted' ? 'ok' : 'bad' };
    case 'freeze': return { kind: 'Filing', text: `froze the return as filed (fingerprint ${e.payload.hash.slice(0, 8)})`, tone: 'ok' };
    case 'payment': return { kind: 'Payment', text: `${e.payload.jurisdiction === 'federal' ? 'IRS' : 'FTB'} ${e.payload.kind === 'refund' ? 'refund issued' : e.payload.kind === 'balance' ? 'balance paid' : 'interest'}: ${money(e.payload.amount)} on ${e.payload.date}` };
    case 'amend.open': return { kind: 'Amendment', text: `opened an amendment: ${quote(e.payload.reason, 70)}`, tone: 'warn' };
    case 'amend.file': return { kind: 'Amendment', text: 'filed the amended return', tone: 'ok' };
    case 'notice.respond': return { kind: 'Notice', text: `sent the response to ${e.payload.noticeId} (${e.payload.items.length} items, fingerprint ${e.payload.hash.slice(0, 8)})`, tone: 'ok' };
    case 'rollforward': return { kind: 'Next year', text: `started the ${e.payload.year} file from this workpaper` };
    case 'seen': return { kind: 'Seen', text: 'caught up' };
    case 'revert': {
      const t = all.find((x) => x.id === e.payload.eventId);
      return { kind: 'Undo', text: `undid: ${t ? describe(t, ix, all, actors).text : 'an action'}`, tone: 'warn' };
    }
    case 'revert.batch': return { kind: 'Undo', text: `undid a group of ${all.filter((x) => x.batch === e.payload.batch && x.id !== e.id).length} actions`, tone: 'warn' };
    case 'workspace.load': return { kind: 'Workspace', text: 'loaded the recorded 2026 season' };
  }
  return { kind: 'Other', text: 'did something' };
}

/** Events that are bookkeeping rather than work, hidden from feeds by default. */
export const QUIET = new Set(['seen', 'clock.set', 'workspace.load']);
