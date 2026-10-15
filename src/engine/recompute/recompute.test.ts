import { describe, expect, it } from 'vitest';
import { loadTestPacket } from '../../test/packet';
import { computeReturn } from './index';

const p = loadTestPacket();

describe('independent recompute reproduces the engine', () => {
  for (const v of p.return_versions) {
    it(`matches every numeric line of ${v.version}`, () => {
      const c = computeReturn(p, v);
      const mismatches: string[] = [];
      for (const l of v.lines) {
        if (typeof l.value !== 'number') continue;
        const got = c.values.get(l.key);
        if (typeof got !== 'number' || Math.abs(got - l.value) > 0.006) mismatches.push(`${l.key}: engine ${l.value} recompute ${got}`);
      }
      expect(mismatches).toEqual([]);
    });
  }
});

import type { Edit } from './core';
import { summarize } from './index';

const WHAT_IF_EDITS: Record<string, Edit[]> = {
  equipment_section179: [
    { op: 'set', key: 'F4562-C.12', value: 38000 },
    { op: 'set', key: 'F4562-C.14', value: 0 },
    { op: 'set', key: 'FTB3885A.STU-PRINTER', value: 10314 },
    { op: 'set', key: 'FTB3885A.STU-CAMERA', value: 11839 },
    { op: 'set', key: 'FTB3885A.STU-WORKST', value: 5447 },
  ],
  equipment_no_bonus: [
    { op: 'set', key: 'F4562-C.14', value: 0 },
    { op: 'set', key: 'F4562-C.19a', value: 7600 },
  ],
  hvac_improvement: [
    { op: 'delta', key: 'SchE.14A', value: -11000 },
    { op: 'delta', key: 'F4562-E.total-A', value: 150 },
  ],
  standard_deduction: [{ op: 'choice', name: 'deduction', value: 'standard' }],
  penalty_annualized: [{ op: 'choice', name: 'penalty_method', value: 'annualized' }],
};

describe('independent recompute reproduces the engine what-if alternatives', () => {
  for (const alt of p.what_if.alternatives) {
    it(`matches ${alt.id}`, () => {
      const base = p.return_versions.find((v) => v.version === alt.base_version)!;
      const c = computeReturn(p, base, WHAT_IF_EDITS[alt.id]);
      const s = summarize(c);
      const fa = alt.federal.alternative;
      const ca = alt.california.alternative;
      expect({ agi: s.federal.agi, ti: s.federal.taxableIncome, tax: s.federal.totalTax, due: s.federal.balanceDue, pen: s.federal.penalty })
        .toEqual({ agi: fa.agi, ti: fa.taxable_income, tax: fa.total_tax, due: fa.balance_due, pen: fa.penalty });
      expect({ tagi: s.california.totalAgi, cagi: s.california.caAgi, tax: s.california.totalTax, due: s.california.balanceDue })
        .toEqual({ tagi: ca.total_agi, cagi: ca.ca_agi, tax: ca.total_tax, due: ca.balance_due });
      const lineMismatch = alt.changed_lines
        .filter((l) => typeof l.new === 'number')
        .filter((l) => Math.abs((c.values.get(l.key) as number) - (l.new as number)) > 0.006)
        .map((l) => `${l.key}: what-if ${l.new} recompute ${c.values.get(l.key)}`);
      expect(lineMismatch).toEqual([]);
    });
  }
});
