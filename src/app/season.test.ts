import { describe, expect, it } from 'vitest';
import { PacketIndex } from '../data/index';
import { type CheckResult, runChecks } from '../engine/checks';
import type { AnyEvent } from '../engine/events';
import { buildFixes } from '../engine/fixes';
import { buildActors } from '../engine/people';
import { summarize } from '../engine/recompute';
import { buildWorkpaper } from '../engine/workpaper';
import { loadTestPacket } from '../test/packet';
import { buildSeason } from './season';

const p = loadTestPacket();
const ix = new PacketIndex(p, 'test');
const fixes = buildFixes(ix);
const actors = buildActors(p);
const cache = new Map<string, CheckResult[]>();
const checks = (asOf: string) => {
  const key = `${ix.versionAsOf(asOf)?.version}|${p.documents.filter((d) => d.received_at <= asOf).length}|${p.client.messages.filter((m) => m.sent_at <= asOf).length}`;
  if (!cache.has(key)) cache.set(key, runChecks(ix, asOf, fixes));
  return cache.get(key)!;
};

describe('recorded season', () => {
  const t0 = performance.now();
  const events = buildSeason({ ix, fixes, actors, checks });
  const ms = performance.now() - t0;
  const at = '2026-07-01T14:00:00.000Z';
  const wp = buildWorkpaper({ ix, fixes, actors, events, asOf: at, checks: checks(at) });

  it('plays every step through the firm rules', () => {
    expect(events.length).toBeGreaterThan(120);
    console.log(`season: ${events.length} events by ${new Set(events.map((e) => e.actor)).size} people in ${Math.round(ms)} ms`);
  });

  it('leaves three changes for the reviewer on July 1, each under the partner threshold at its exact effect', () => {
    const pending = wp.proposals.filter((x) => x.status === 'proposed');
    expect(pending.map((x) => x.fix?.id).sort()).toEqual(['FIX-C6', 'FIX-ELECT-179', 'FIX-HOMEOFFICE']);
    // C6 alone would move federal tax by about 1,300 on the engine's return; after the earlier
    // corrections lower the bracket, its exact effect is under 1,000, so the reviewer can approve it.
    expect(pending.every((x) => !x.needsPartner)).toBe(true);
  });

  it('sent the six large corrections through the partner', () => {
    const big = wp.proposals.filter((x) => x.needsPartner);
    expect(big.map((x) => x.fix?.id).sort()).toEqual(['FIX-1099K', 'FIX-CA-PAYMENT', 'FIX-CA-WAGES', 'FIX-HVAC', 'FIX-RSU-BASIS', 'FIX-SEHI']);
    expect(big.every((x) => x.status === 'approved' && x.decisions.some((d) => d.by === 'st-03'))).toBe(true);
  });

  it('has the home office review note open, with Priya\'s reply', () => {
    const n = [...wp.state.notes.values()].find((x) => x.target === 'SchC.30')!;
    expect(n.status).toBe('open');
    expect(n.thread.length).toBe(1);
  });

  it('approving the home office change reopens the Schedule C sign-off and names what changed', () => {
    expect(wp.areas.find((a) => a.id === 'business')!.signoffs.preparer.state).toBe('signed');
    const pid = wp.proposals.find((x) => x.fix?.id === 'FIX-HOMEOFFICE')!.id;
    const later = '2026-07-01T15:00:00.000Z';
    const approve = { id: 'evt-test-approve', at: later, real: later, actor: 'st-02', type: 'adj.decide', payload: { id: pid, decision: 'approve', note: '' } } as AnyEvent;
    const wp2 = buildWorkpaper({ ix, fixes, actors, events: [...events, approve], asOf: later, checks: checks(later) });
    const so = wp2.areas.find((a) => a.id === 'business')!.signoffs.preparer;
    expect(so.state).toBe('reopened');
    expect(so.diff.some((d) => d.startsWith('SchC.30'))).toBe(true);
  });

  it('applies the approved corrections and moves the federal result to a refund', () => {
    expect(wp.proposals.filter((x) => x.status === 'approved').length).toBe(20);
    expect(summarize(wp.ours!).federal.balanceDue).toBeLessThan(0);
  });

  it('records time against areas and logs every unmasked view', () => {
    expect(wp.state.reveals.length).toBe(3);
    expect(wp.state.timeLog.length).toBeGreaterThan(20);
  });
});
