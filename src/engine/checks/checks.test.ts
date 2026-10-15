import { describe, expect, it } from 'vitest';
import { PacketIndex } from '../../data/index';
import { loadTestPacket } from '../../test/packet';
import { buildFixes } from '../fixes';
import { runChecks } from './index';

const p = loadTestPacket();
const ix = new PacketIndex(p, 'test');
const fixes = buildFixes(ix);

describe('checks on the packet as delivered (as of 2026-07-01)', () => {
  const res = runChecks(ix, '2026-07-01T14:00:00Z', fixes);
  const by = new Map(res.map((r) => [r.id, r]));
  it('runs without errors', () => {
    expect(res.filter((r) => r.id.startsWith('CHK-ERROR'))).toEqual([]);
    console.log(res.map((r) => `${r.status.padEnd(7)} ${r.id.padEnd(22)} ${r.fixes.join(',')} | ${r.summary.slice(0, 110)}`).join('\n'));
  });
  it('finds the planted errors', () => {
    const failing = res.filter((r) => r.status === 'fail').map((r) => r.id);
    for (const id of ['CHK-REREAD', 'CHK-UNREAD-PAGES', 'CHK-DUP-MILEAGE', 'CHK-DUP-INTEREST', 'CHK-BROKER-TIEOUT', 'CHK-RSU-BASIS', 'CHK-SCHC-RECEIPTS',
      'CHK-BOOKS-TO-TAX', 'CHK-RENTAL-A', 'CHK-INTEREST-FX', 'CHK-SEHI', 'CHK-HOME-OFFICE', 'CHK-MORTGAGE', 'CHK-PROPERTY-TAX', 'CHK-CHARITY',
      'CHK-DEP-CARE', 'CHK-DEPENDENTS', 'CHK-CRYPTO-BASIS', 'CHK-FED-PAYMENTS', 'CHK-CA-PAYMENTS', 'CHK-CA-WAGES']) expect(failing, id).toContain(id);
  });
  it('passes the things that are right', () => {
    for (const id of ['CHK-DUP-W2', 'CHK-CORRECTED-1099', 'CHK-ESPP', 'CHK-ISO', 'CHK-WAGES', 'CHK-DEPRECIATION', 'CHK-4797', 'CHK-PASSIVE',
      'CHK-SCORP-BASIS', 'CHK-PARTNERSHIP', 'CHK-IRA-BASIS', 'CHK-HSA', 'CHK-SALT-CAP', 'CHK-IDENTITY', 'CHK-CARRYOVERS', 'CHK-REFOOT', 'CHK-RECOMPUTE'])
      expect(by.get(id)?.status, id).toBe('pass');
  });
  it('re-read flags the transposed tax ID, blank-as-zero bases and the ambiguous receipt', () => {
    const r = by.get('CHK-REREAD')!;
    for (const ev of ['ev-1045', 'ev-0498', 'ev-0516', 'ev-0525', 'ev-1049', 'ev-0919']) expect(r.refs, ev).toContain(ev);
  });
  it('waits for documents before they arrive (as of 2026-03-05)', () => {
    const early = runChecks(ix, '2026-03-05T00:00:00Z', fixes);
    const ids = new Map(early.map((r) => [r.id, r]));
    expect(ids.get('CHK-PARTNERSHIP')?.status).toBe('waiting');
    expect(ids.get('CHK-SCORP-BASIS')?.status).toBe('fail');
    expect(ids.get('CHK-CA-WAGES')?.fixes).toEqual([]);
  });
});
