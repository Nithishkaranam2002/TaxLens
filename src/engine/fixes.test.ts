import { describe, expect, it } from 'vitest';
import { PacketIndex } from '../data/index';
import { loadTestPacket } from '../test/packet';
import { buildFixes } from './fixes';
import { computeReturn, summarize } from './recompute';

const p = loadTestPacket();
const ix = new PacketIndex(p, 'test');
const v3 = ix.versions.get('v3')!;

describe('fix catalog', () => {
  const fixes = buildFixes(ix);
  it('every fix has evidence, authority and at least one option', () => {
    for (const f of fixes) {
      expect(f.evidence.length, f.id).toBeGreaterThan(0);
      expect(f.authority.length, f.id).toBeGreaterThan(5);
      expect(f.options.length, f.id).toBeGreaterThan(0);
    }
  });
  it('prints the corrected return', () => {
    const base = summarize(computeReturn(p, v3));
    const edits = fixes.flatMap((f) => f.options[f.recommended].edits);
    const c = computeReturn(p, v3, edits);
    const s = summarize(c);
    console.log(JSON.stringify({ base, corrected: s, carry: c.carryovers }, null, 1));
    for (const f of fixes) {
      const only = summarize(computeReturn(p, v3, f.options[f.recommended].edits));
      console.log(f.id.padEnd(16), 'fed tax', String(only.federal.totalTax - base.federal.totalTax).padStart(7), 'fed bal', String(only.federal.balanceDue - base.federal.balanceDue).padStart(7), 'pen', only.federal.penalty - base.federal.penalty, '| CA tax', String(only.california.totalTax - base.california.totalTax).padStart(6), 'CA bal', only.california.balanceDue - base.california.balanceDue);
    }
    for (const k of ['F1040.11','F1040.12','F1040.13','F1040.15','F1040.16','F6251.11','F8812.12','F1040.24','F1040.33','F1040.34','F1040.37','F1040.38','Sch1.16','Sch1.17','SchC.31','SchA.5e','F8960.17','F540NR.17','F540NR.32','F540NR.64','F540NR.97','SchCA540NR.1.E','SchCA540NR.7.E']) console.log(k, c.values.get(k));
    expect(s.federal.totalTax).toBeGreaterThan(0);
  });
});
