// The recorded season proves that every legitimate step passes the firm's rules. These tests prove the
// other half: the steps the rules must refuse are refused, and the refusal names the rule.

import { describe, expect, it } from 'vitest';
import { PacketIndex } from '../data/index';
import { type CheckResult, runChecks } from '../engine/checks';
import type { AnyEvent } from '../engine/events';
import { buildFixes } from '../engine/fixes';
import { RULE, buildActors } from '../engine/people';
import { buildWorkpaper } from '../engine/workpaper';
import { loadTestPacket } from '../test/packet';
import { type ActCtx, type Result, addNote, decide, proposeFix, recordJudgment, reveal, signOff, transmit } from './actions';

const p = loadTestPacket();
const ix = new PacketIndex(p, 'test');
const fixes = buildFixes(ix);
const fixMap = new Map(fixes.map((f) => [f.id, f]));
const actors = buildActors(p);
const NOW = '2026-07-01T14:00:00Z';
const checks: CheckResult[] = runChecks(ix, NOW, fixes);

/** A fresh file on July 1, 2026, with the given log, seen by one person. */
function ctx(me: string, events: AnyEvent[] = [], now = NOW): ActCtx {
  const wp = buildWorkpaper({ ix, fixes, actors, events, asOf: now, checks });
  return { ix, fixes: fixMap, actors, wp, me: actors.find((a) => a.id === me)!, now };
}
const ok = (r: Result): AnyEvent[] => { if (!r.ok) throw new Error(r.rule); return r.events; };
const refused = (r: Result): string => { if (r.ok) throw new Error('Expected a refusal, got ' + r.message); return r.rule; };

const P = 'st-01', D = 'st-02', H = 'st-03', M = 'st-04', J = 'st-05', S = 'st-06', C = 'cu-01';
const recommended = (fixId: string) => fixMap.get(fixId)!.options[fixMap.get(fixId)!.recommended].id;

describe('firm rules are enforced in the actions', () => {
  it('a preparer cannot approve a change, and nobody can approve their own', () => {
    const proposed = ok(proposeFix(ctx(P), 'FIX-1099K', recommended('FIX-1099K')));
    const id = (proposed[0].payload as { id: string }).id;
    expect(refused(decide(ctx(P, proposed), id, 'approve', ''))).toMatch(/Preparers cannot approve/);
    // Daniel proposes a different change himself: he cannot be the one to approve it.
    const own = ok(proposeFix(ctx(D), 'FIX-SPOTIFY', recommended('FIX-SPOTIFY')));
    const ownId = (own[0].payload as { id: string }).id;
    expect(refused(decide(ctx(D, own), ownId, 'approve', ''))).toBe(RULE.selfReview);
    // The reviewer approving the preparer's change is fine.
    expect(decide(ctx(D, proposed), id, 'approve', '').ok).toBe(true);
  });

  it('a change over 1,000 of tax needs the partner as well as the reviewer', () => {
    const proposed = ok(proposeFix(ctx(P), 'FIX-RSU-BASIS', recommended('FIX-RSU-BASIS')));
    const id = (proposed[0].payload as { id: string }).id;
    const x = ctx(D, proposed);
    const prop = x.wp.proposals.find((q) => q.id === id)!;
    expect(Math.abs(prop.effect.fedTax)).toBeGreaterThan(1000);
    expect(prop.needsPartner).toBe(true);
    const r = decide(x, id, 'approve', '');
    expect(r.ok && r.message).toMatch(/partner must also approve/);
    // After the reviewer alone, the change is still not applied.
    const after = ctx(H, [...proposed, ...ok(r)]);
    expect(after.wp.proposals.find((q) => q.id === id)!.status).toBe('proposed');
    // The partner's approval applies it.
    const done = ctx(P, [...proposed, ...ok(r), ...ok(decide(after, id, 'approve', ''))]);
    expect(done.wp.proposals.find((q) => q.id === id)!.status).toBe('approved');
  });

  it('a small change applies on the reviewer\'s approval alone', () => {
    const proposed = ok(proposeFix(ctx(P), 'FIX-SPOTIFY', recommended('FIX-SPOTIFY')));
    const id = (proposed[0].payload as { id: string }).id;
    const prop = ctx(D, proposed).wp.proposals.find((q) => q.id === id)!;
    expect(Math.abs(prop.effect.fedTax)).toBeLessThanOrEqual(1000);
    expect(prop.needsPartner).toBe(false);
    const done = ctx(P, [...proposed, ...ok(decide(ctx(D, proposed), id, 'approve', ''))]);
    expect(done.wp.proposals.find((q) => q.id === id)!.status).toBe('approved');
  });

  it('a judgment call cannot be recorded without the authority relied on', () => {
    expect(refused(recordJudgment(ctx(P), 'J-PENALTY', { decision: 'Accept the penalty.', rationale: '', authority: '   ', refs: [] }))).toBe(RULE.authority);
    expect(recordJudgment(ctx(P), 'J-PENALTY', { decision: 'Accept the penalty.', rationale: 'No waiver applies.', authority: 'IRC §6654', refs: [] }).ok).toBe(true);
  });

  it('staff without clearance cannot unmask an identifier; a cleared view is logged', () => {
    expect(refused(reveal(ctx(M), 'doc:D04', 'identifiers', 'Checking the SSN'))).toBe(RULE.masked);
    const shown = ok(reveal(ctx(D), 'doc:D04', 'identifiers', 'Checking the SSN'));
    expect(shown[0].type).toBe('pii.reveal');
    expect(ctx(D, shown).wp.state.reveals).toHaveLength(1);
  });

  it('the firm administrator and the client do not change return work', () => {
    expect(refused(proposeFix(ctx(J), 'FIX-1099K', recommended('FIX-1099K')))).toMatch(/do not change return work/);
    expect(refused(proposeFix(ctx(C), 'FIX-1099K', recommended('FIX-1099K')))).toMatch(/client portal/);
  });

  it('staff are not active before their start date', () => {
    // Sam Adeyemi joins on January 4, 2027: on July 1, 2026 he cannot act at all.
    expect(refused(addNote(ctx(S), { kind: 'comment', target: 'F1040.24', area: 'totals', text: 'Looks fine.', blocking: false, assignee: null }))).toMatch(/not active on this engagement until 2027-01-04/);
  });

  it('nobody signs an area with open findings, and sign-offs go preparer, reviewer, partner', () => {
    expect(refused(signOff(ctx(P), 'business', 'preparer'))).toMatch(/open finding/);
    expect(refused(signOff(ctx(D), 'business', 'reviewer'))).toMatch(/preparer signs this area first/);
    expect(refused(signOff(ctx(H), 'business', 'partner'))).toMatch(/reviewer signs this area first/);
  });

  it('an open blocking review note blocks filing', () => {
    const note = ok(addNote(ctx(D), { kind: 'review', target: 'F1040.24', area: 'totals', text: 'Tie the extension payment to the IRS transcript before we file.', blocking: true, assignee: P }));
    const x = ctx(D, note);
    expect(x.wp.blockers.some((b) => /note/i.test(b.kind))).toBe(true);
    expect(refused(transmit(x))).toMatch(/block filing/);
  });

  it('a note handed to someone carries a due date that is not already past', () => {
    expect(refused(addNote(ctx(D), { kind: 'review', target: 'F1040.24', area: 'totals', text: 'Please re-add the payments.', blocking: true, assignee: P, due: '2026-06-30' }))).toMatch(/already past/);
    expect(refused(addNote(ctx(D), { kind: 'review', target: 'F1040.24', area: 'totals', text: 'Please re-add the payments.', blocking: true, assignee: C }))).toMatch(/engagement staff/);
    const r = addNote(ctx(D), { kind: 'review', target: 'F1040.24', area: 'totals', text: 'Please re-add the payments.', blocking: true, assignee: P, due: '2026-07-03' });
    expect(r.ok && r.message).toMatch(/Priya is notified; due Jul 3, 2026/);
  });
});
