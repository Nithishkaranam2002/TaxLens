import type { Packet, ReturnVersion } from '../data/packet';
import type { Effect } from './events';
import type { FixOption, RateItem } from './fixes';
import { type Edit, computeReturn, summarize } from './recompute';
import type { Summary } from './recompute';

export function effectBetween(a: Summary, b: Summary): Effect {
  return {
    fedTax: b.federal.totalTax - a.federal.totalTax,
    caTax: b.california.totalTax - a.california.totalTax,
    fedBalance: b.federal.balanceDue - a.federal.balanceDue,
    caBalance: b.california.balanceDue - a.california.balanceDue,
    fedPenalty: b.federal.penalty - a.federal.penalty,
  };
}

/** Exact effect of adding `edits` on top of `applied`, by recomputing both. */
export function exactEffect(p: Packet, v: ReturnVersion, applied: Edit[], edits: Edit[]): Effect {
  const before = summarize(computeReturn(p, v, applied));
  const after = summarize(computeReturn(p, v, [...applied, ...edits]));
  return effectBetween(before, after);
}

/**
 * The packet's method: change × per-dollar rate from the version's tax_effect_rates. California
 * items that are wholly California-source use ca_source_income; items with no California source
 * keep only the part of the category rate that is not resident-day proration.
 */
export function rateEffect(v: ReturnVersion, items: RateItem[], residentShare: number): { fed: number; ca: number } {
  const r = v.tax_effect_rates;
  let fed = 0;
  let ca = 0;
  for (const it of items) {
    if (it.category === 'payment_federal') { fed += -it.amount; continue; }
    if (it.category === 'payment_california') { ca += -it.amount; continue; }
    const rate = r[it.category];
    if (!rate) continue;
    fed += it.amount * rate.federal_per_dollar;
    const src = r.ca_source_income?.california_per_dollar ?? 0;
    if (it.ca === 'ca') ca += it.amount * src;
    else if (it.ca === 'none') ca += it.amount * Math.max(0, rate.california_per_dollar - residentShare * src);
    else ca += it.amount * rate.california_per_dollar;
  }
  return { fed: Math.round(fed), ca: Math.round(ca) };
}

export function optionRateEffect(p: Packet, v: ReturnVersion, o: FixOption, engineWhatIf?: string): { fed: number; ca: number } {
  if (engineWhatIf) {
    const alt = p.what_if.alternatives.find((a) => a.id === engineWhatIf && a.base_version === v.version);
    if (alt) return { fed: alt.federal.total_tax_change, ca: alt.california.total_tax_change };
  }
  return rateEffect(v, o.rate, p.engine_reference.parameters.ca_resident_days / p.engine_reference.parameters.year_days);
}
