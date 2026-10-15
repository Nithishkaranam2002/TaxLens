// Shared helpers for the independent recompute ("shadow engine").
// The recompute rebuilds every derived line of a return version from its leaf inputs and the
// engine_reference parameters. It reproduces engine v1, v2 and v3 to the dollar (see tests), which
// is what lets TaxLens recompute the corrected return exactly instead of estimating it.

import type { EngineParams, ReturnLine, ReturnVersion } from '../../data/packet';
import { group } from '../num';

/** Round half away from zero to whole dollars, the convention the engine uses on every line. */
export function rd(x: number): number {
  const r = Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + 1e-9);
  return r === 0 ? 0 : r;
}
export const round2 = (x: number) => Math.round(x * 100 + Math.sign(x) * 1e-9) / 100;
export const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Tax from a bracket table [[upper|null, rate]...], exact (not rounded). */
export function bracketTax(income: number, brackets: [number | null, number][]): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper ?? Infinity;
    if (income <= lower) break;
    tax += (Math.min(income, top) - lower) * rate;
    lower = top;
  }
  return tax;
}

/** Tax on a slice of income [from, to] stacked on the bracket table, each dollar at min(rate, cap). */
export function sliceTax(from: number, to: number, brackets: [number | null, number][], cap = Infinity): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper ?? Infinity;
    const a = Math.max(from, lower);
    const b = Math.min(to, top);
    if (b > a) tax += (b - a) * Math.min(rate, cap);
    lower = top;
    if (lower >= to) break;
  }
  return tax;
}

export type Edit =
  | { op: 'set'; key: string; value: number | string; label?: string }
  | { op: 'delta'; key: string; value: number }
  | { op: 'remove'; key: string }
  | { op: 'lot'; id: string; set: Partial<Lot> }
  | { op: 'addLot'; lot: Lot }
  | { op: 'choice'; name: 'deduction' | 'penalty_method'; value: string }
  | { op: 'payments'; jurisdiction: 'federal' | 'california'; schedule: { date: string; amount: number }[] };

export interface Lot {
  id: string;
  box: string;
  desc: string;
  acquired: string;
  sold: string;
  proceeds: number;
  basis: number;
  adjCode: string | null;
  adj: number;
  sources: string[];
  origin: 'engine' | 'added';
}

export const lotGain = (l: Lot) => round2(l.proceeds - l.basis + l.adj);

export interface Formula { expr: string; inputs: string[] }

export interface Computed {
  version: string;
  values: Map<string, number | string>;
  labels: Map<string, string>;
  formulas: Map<string, Formula>;
  derived: Set<string>;
  forced: Set<string>;
  added: Set<string>;
  removed: Set<string>;
  lots: Lot[];
  /** Lines the recompute could only approximate (it says why). */
  approx: Map<string, string>;
  carryovers: Record<string, number>;
  penalty: { federal: number; california: number; federalSchedule: { installment: number; due: string; required: number; paid: number; underpaid: number; interest: number }[] };
}

/** Mutable context used while computing. */
export class Ctx {
  values = new Map<string, number | string>();
  labels = new Map<string, string>();
  formulas = new Map<string, Formula>();
  derived = new Set<string>();
  forced = new Set<string>();
  added = new Set<string>();
  removed = new Set<string>();
  approx = new Map<string, string>();
  choices = new Map<string, string>();
  paymentSchedules = new Map<string, { date: string; amount: number }[]>();
  private forcedValues = new Map<string, number | string>();
  private baseKeys: Set<string>;

  constructor(public base: ReturnVersion, public p: EngineParams, edits: Edit[]) {
    this.baseKeys = new Set(base.lines.map((l) => l.key));
    for (const l of base.lines) {
      this.values.set(l.key, l.value);
      this.labels.set(l.key, l.label);
    }
    // sets first, then deltas, then removals so that several adjustments on one line compose.
    for (const e of edits) {
      if (e.op === 'set') {
        if (!this.values.has(e.key)) this.added.add(e.key);
        this.forcedValues.set(e.key, e.value);
        this.values.set(e.key, e.value);
        if (e.label) this.labels.set(e.key, e.label);
      } else if (e.op === 'choice') {
        this.choices.set(e.name, e.value);
      } else if (e.op === 'payments') {
        this.paymentSchedules.set(e.jurisdiction, e.schedule);
      }
    }
    for (const e of edits) {
      if (e.op === 'delta') {
        const cur = this.forcedValues.has(e.key) ? this.forcedValues.get(e.key) : this.values.get(e.key);
        const next = (typeof cur === 'number' ? cur : 0) + e.value;
        this.forcedValues.set(e.key, next);
        this.values.set(e.key, next);
      }
    }
    for (const e of edits) {
      if (e.op === 'remove') {
        this.values.delete(e.key);
        this.forcedValues.delete(e.key);
        this.removed.add(e.key);
      }
    }
  }

  has(key: string) { return this.values.has(key); }

  /** Numeric value of a line (0 when absent). */
  n(key: string): number {
    const v = this.values.get(key);
    return typeof v === 'number' ? v : 0;
  }

  /** Define a derived line. A line with an explicit `set` edit keeps the edited value (forced). */
  def(key: string, value: number, expr: string, inputs: string[] = [], label?: string): number {
    if (this.forcedValues.has(key)) {
      this.forced.add(key);
      const fv = this.forcedValues.get(key)!;
      this.formulas.set(key, { expr: `${expr} — overridden by an approved change`, inputs });
      return typeof fv === 'number' ? fv : 0;
    }
    if (!this.baseKeys.has(key) && !this.values.has(key)) this.added.add(key);
    this.values.set(key, value);
    if (label && !this.labels.has(key)) this.labels.set(key, label);
    this.derived.add(key);
    this.formulas.set(key, { expr, inputs });
    return value;
  }

  keys(re: RegExp): string[] {
    return [...this.values.keys()].filter((k) => re.test(k));
  }
}

export function lineMap(v: ReturnVersion): Map<string, ReturnLine> {
  return new Map(v.lines.map((l) => [l.key, l]));
}

export const fmt = (n: number) => group(n, 0, 2);
