import { AREA } from '../engine/areas';
import { JUDGMENTS } from '../engine/judgments';
import type { Actor } from '../engine/people';
import { firmDay, fmtDate } from '../engine/time';
import type { Workpaper } from '../engine/workpaper';
import { store } from './store';

export interface Notice { title: string; detail: string; tone: 'bad' | 'warn' | 'info'; go: () => void }

/** Firm deadlines are warned about this many days ahead on the season clock. */
export const DEADLINE_WARNING_DAYS = 14;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Which firm deadlines concern which role; the client's own filings are left to the client. */
function deadlineFor(what: string, role: Actor['role']): boolean {
  if (/outside engagement/i.test(what)) return false;
  if (/hand-off/i.test(what)) return role === 'preparer';
  if (/review complete/i.test(what)) return role === 'reviewer' || role === 'partner';
  return ['preparer', 'reviewer', 'partner', 'firm_administrator'].includes(role);
}

/** Whether a firm deadline is already satisfied by the work on the file. */
function deadlineMet(what: string, wp: Workpaper): boolean {
  if (wp.state.frozen) return true;
  if (/hand-off/i.test(what)) return wp.areas.every((a) => a.signoffs.preparer.state === 'signed');
  if (/review complete/i.test(what)) return wp.areas.every((a) => a.signoffs.reviewer.state === 'signed');
  if (/original due date/i.test(what)) return store.s.ix!.packet.timeline.some((t) => t.event === 'extension_filed_with_payment' && t.at <= wp.asOf);
  return false;
}

/** What needs this person, derived from the workpaper (nothing is stored). */
export function notificationsFor(wp: Workpaper, me: Actor, actors: Actor[]): Notice[] {
  const out: Notice[] = [];
  const name = (id: string) => actors.find((a) => a.id === id)?.name.split(' ')[0] ?? id;
  const today = firmDay(wp.asOf);
  if (me.role === 'client') {
    for (const q of wp.state.questions.values()) if (!q.answer) out.push({ title: 'Question from your CPA', detail: q.due ? `${q.text} · please answer by ${fmtDate(q.due)}` : q.text, tone: q.due && q.due < today ? 'bad' : 'warn', go: () => store.go({ page: 'client' }) });
    if (wp.steps.find((s) => s.id === 'Partner sign-off')?.met && wp.clientApprovalState !== 'current') out.push({ title: 'Your return is ready to approve', detail: 'Review the summary and sign Form 8879.', tone: 'bad', go: () => store.go({ page: 'client' }) });
    return out;
  }

  // Changes waiting for my approval.
  for (const p of wp.proposals) {
    if (p.status !== 'proposed' || p.by === me.id || p.decisions.some((d) => d.by === me.id)) continue;
    if ((me.role === 'reviewer' && p.needs.includes('reviewer')) || (me.role === 'partner' && (p.needs.includes('partner') || p.needs.includes('reviewer'))))
      out.push({ title: `Approve change ${p.seq}`, detail: `${p.title} · proposed by ${name(p.by)}`, tone: 'bad', go: () => store.open(`adj:${p.id}`) });
  }
  for (const p of wp.proposals) if (p.by === me.id && p.status === 'rejected') out.push({ title: `Change ${p.seq} was rejected`, detail: p.decisions.find((d) => d.decision === 'reject')?.note ?? '', tone: 'warn', go: () => store.open(`adj:${p.id}`) });

  // Notes: handed to me, overdue, or answered.
  for (const n of wp.state.notes.values()) {
    if (n.status !== 'open') continue;
    const overdue = !!n.due && n.due < today;
    const due = n.due ? ` · ${overdue ? 'was due' : 'due'} ${fmtDate(n.due)}` : '';
    if (n.kind === 'review' && n.by === me.id && n.thread.length) out.push({ title: 'Reply to your review note', detail: n.thread[n.thread.length - 1].text, tone: 'info', go: () => store.open(`note:${n.id}`) });
    else if (n.assignee === me.id || (!n.assignee && n.kind === 'review' && me.role === 'preparer' && !n.thread.length))
      out.push({ title: overdue ? 'Overdue note' : n.kind === 'review' ? 'Review note to address' : 'Note for you', detail: `${n.text}${due}`, tone: overdue || n.blocking ? 'bad' : 'info', go: () => store.open(`note:${n.id}`) });
    else if (overdue && n.by === me.id) out.push({ title: `Your note to ${n.assignee ? name(n.assignee) : 'the preparer'} is overdue`, detail: `${n.text}${due}`, tone: 'warn', go: () => store.open(`note:${n.id}`) });
  }

  // Sign-offs I gave that reopened because the area changed.
  for (const a of wp.areas) {
    for (const so of Object.values(a.signoffs)) {
      if (so.state === 'reopened' && so.by === me.id) out.push({ title: `Your ${AREA[a.id].short} sign-off reopened`, detail: so.diff.slice(0, 2).join('; ') || 'Something in the area changed after you signed.', tone: 'warn', go: () => store.go({ page: 'area', id: a.id }) });
    }
  }

  if (me.role === 'partner') {
    for (const j of JUDGMENTS) {
      const r = wp.state.judgments.get(j.id);
      if (r && j.needsPartner && !r.approvedBy && r.by !== me.id) out.push({ title: 'Judgment needs your approval', detail: j.topic, tone: 'bad', go: () => store.go({ page: 'review', tab: 'judgments' }) });
    }
  }

  // Client questions I asked: answered, or past the date I asked for.
  for (const q of wp.state.questions.values()) {
    if (q.by !== me.id) continue;
    if (q.answer && !wp.state.verifications.some((v) => v.target === `question:${q.id}`) && q.answer.at > (wp.state.seen.get(me.id) ?? '')) out.push({ title: 'Client answered', detail: q.answer.text, tone: 'info', go: () => store.go({ page: 'client' }) });
    else if (!q.answer && q.due && q.due < today) out.push({ title: 'Client has not answered', detail: `${q.text} · asked for by ${fmtDate(q.due)}`, tone: 'warn', go: () => store.go({ page: 'client' }) });
  }

  // The preparer's own queue, so the bell is never silent while findings wait.
  if (me.role === 'preparer') {
    const open = wp.findings.filter((f) => f.status === 'open' && f.blocking).length;
    if (open) out.push({ title: `${open} finding${open > 1 ? 's' : ''} to work`, detail: 'Each one names its evidence and, where the documents decide it, a correction to propose.', tone: 'warn', go: () => store.go({ page: 'inbox' }) });
  }

  // Firm deadlines near or passed on the season clock, while the work they describe is still open.
  if (!wp.state.frozen) {
    for (const d of store.s.ix!.packet.firm.deadlines) {
      if (!deadlineFor(d.what, me.role) || deadlineMet(d.what, wp)) continue;
      const days = daysBetween(today, d.date);
      if (days > DEADLINE_WARNING_DAYS) continue;
      const when = days < 0 ? `passed ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'is today' : `in ${days} day${days === 1 ? '' : 's'}`;
      out.push({ title: days < 0 ? 'Deadline passed' : 'Deadline near', detail: `${d.what} · ${fmtDate(d.date)} ${when}`, tone: days < 0 ? 'bad' : 'warn', go: () => store.go({ page: 'firm', tab: 'status' }) });
    }
  }
  return out.slice(0, 12);
}
