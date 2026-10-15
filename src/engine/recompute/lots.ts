import type { ReturnVersion } from '../../data/packet';
import { type Edit, type Lot, lotGain, round2 } from './core';
import { group } from '../num';

const LOT_LABEL =
  /^(?<desc>.*) \(acquired (?<acq>[^,]+), sold (?<sold>[^;]+); proceeds (?<proc>[\d,.-]+), basis (?<basis>[\d,.-]+)(?:, adjustment (?<code>\w+) (?<adj>[\d,.-]+))?\)$/;

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, '')) : 0);

/** Every Form 8949 lot in an engine version, parsed from its line. */
export function parseLots(v: ReturnVersion): Lot[] {
  const lots: Lot[] = [];
  for (const l of v.lines) {
    if (l.form !== 'F8949' || l.line.endsWith('.total')) continue;
    const m = LOT_LABEL.exec(l.label);
    if (!m?.groups) continue;
    const g = m.groups;
    const [box, id] = l.line.split('.');
    lots.push({
      id,
      box,
      desc: g.desc,
      acquired: g.acq,
      sold: g.sold,
      proceeds: num(g.proc),
      basis: num(g.basis),
      adjCode: g.code ?? null,
      adj: num(g.adj),
      sources: l.sources,
      origin: 'engine',
    });
  }
  return lots;
}

export function applyLotEdits(lots: Lot[], edits: Edit[]): Lot[] {
  let out = lots.map((l) => ({ ...l }));
  for (const e of edits) {
    if (e.op === 'lot') {
      out = out.map((l) => (l.id === e.id ? { ...l, ...e.set } : l));
    } else if (e.op === 'addLot') {
      out = out.filter((l) => l.id !== e.lot.id).concat({ ...e.lot });
    }
  }
  return out;
}

export interface BoxTotal { box: string; proceeds: number; basis: number; adj: number; gain: number; count: number }

export function boxTotals(lots: Lot[]): Map<string, BoxTotal> {
  const m = new Map<string, BoxTotal>();
  for (const l of lots) {
    const t = m.get(l.box) ?? { box: l.box, proceeds: 0, basis: 0, adj: 0, gain: 0, count: 0 };
    t.proceeds = round2(t.proceeds + l.proceeds);
    t.basis = round2(t.basis + l.basis);
    t.adj = round2(t.adj + l.adj);
    t.gain = round2(t.gain + lotGain(l));
    t.count += 1;
    m.set(l.box, t);
  }
  return m;
}

export const fmtCents = (n: number) => group(n, 2, 2);

export function lotLabel(l: Lot): string {
  const adj = l.adjCode ? `, adjustment ${l.adjCode} ${fmtCents(l.adj)}` : '';
  return `${l.desc} (acquired ${l.acquired}, sold ${l.sold}; proceeds ${fmtCents(l.proceeds)}, basis ${fmtCents(l.basis)}${adj})`;
}

/** Short-term or long-term from the dates: long-term when sold after the one-year anniversary. */
export function holdingTerm(acquired: string, sold: string): 'short' | 'long' {
  const [y, m, d] = acquired.split('-').map(Number);
  const anniv = new Date(Date.UTC(y + 1, m - 1, d));
  if (m === 2 && d === 29) anniv.setUTCDate(1), anniv.setUTCMonth(2);
  return new Date(sold + 'T00:00:00Z') > anniv ? 'long' : 'short';
}

/** Schedule D line for each Form 8949 box, as the engine maps them. */
export const BOX_TO_SCHD: Record<string, string> = {
  A: 'SchD.1b', B: 'SchD.2', C: 'SchD.3', G: 'SchD.1b', H: 'SchD.3', I: 'SchD.3',
  D: 'SchD.8b', E: 'SchD.9', F: 'SchD.10', J: 'SchD.8b', K: 'SchD.10', L: 'SchD.10',
};

export const BOX_LABEL: Record<string, string> = {
  A: 'Short-term, basis reported to the IRS',
  B: 'Short-term, basis not reported',
  C: 'Short-term, no Form 1099-B',
  D: 'Long-term, basis reported to the IRS',
  E: 'Long-term, basis not reported',
  F: 'Long-term, no Form 1099-B',
  G: 'Short-term digital assets, basis reported',
  H: 'Short-term digital assets, basis not reported',
  I: 'Short-term digital assets, no Form 1099-DA',
  J: 'Long-term digital assets, basis reported',
  K: 'Long-term digital assets, basis not reported',
  L: 'Long-term digital assets, no Form 1099-DA',
};

export const isShortBox = (box: string) => ['A', 'B', 'C', 'G', 'H', 'I'].includes(box);

export { lotGain };
