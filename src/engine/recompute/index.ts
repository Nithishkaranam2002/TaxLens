import type { Packet, ReturnVersion } from '../../data/packet';
import { computeCalifornia } from './california';
import { type Computed, Ctx, type Edit } from './core';
import { type Facts, computeFederal } from './federal';
import { applyLotEdits, parseLots } from './lots';

export type { Computed, Edit, Lot } from './core';

const SCHEDULE = /(\d{4}-\d{2}-\d{2}) ([\d,]+\.\d{2})/g;
function parseSchedule(note: string | null | undefined): { date: string; amount: number }[] {
  if (!note) return [];
  return [...note.matchAll(SCHEDULE)].map((m) => ({ date: m[1], amount: Number(m[2].replace(/,/g, '')) }));
}

function evValue(p: Packet, id: string): number {
  const ev = p.extracted_values.find((e) => e.id === id);
  return typeof ev?.value === 'number' ? ev.value : 0;
}

export function buildFacts(p: Packet, v: ReturnVersion): Facts {
  const line = (k: string) => v.lines.find((l) => l.key === k);
  const sepNote = line('Sch1.16')?.note ?? '';
  const sepMatch = /Contribution ([\d,]+\.\d{2})/.exec(sepNote);
  const studioLabel = line('F8995.15.1')?.label ?? '';
  const ubia = /UBIA ([\d,]+)/.exec(studioLabel);
  const w2 = /W-2 wages ([\d,]+)/.exec(studioLabel);
  const ext = typeof line('Sch3.10')?.value === 'number' ? (line('Sch3.10')!.value as number) : 0;
  const extEvent = p.timeline.find((t) => t.event === 'extension_filed_with_payment');
  const caRes = p.household.residency.find((r) => r.state === 'CA');
  const co = p.prior_years.carryovers_into_2025;
  return {
    odometerStart: evValue(p, 'ev-0478'),
    odometerEnd: evValue(p, 'ev-0479'),
    sepContribution: sepMatch ? Number(sepMatch[1].replace(/,/g, '')) : evValue(p, 'ev-0485'),
    sehiPremiums: evValue(p, 'ev-0484'),
    studio: { w2: w2 ? Number(w2[1].replace(/,/g, '')) : 0, ubia: ubia ? Number(ubia[1].replace(/,/g, '')) : 0 },
    woodworks: { w2: evValue(p, 'ev-0980'), ubia: evValue(p, 'ev-0981') },
    oregonTaxPaid: evValue(p, 'ev-0982'),
    caResidentDays: p.engine_reference.parameters.ca_resident_days,
    yearDays: p.engine_reference.parameters.year_days,
    caResidencyEnd: caRes?.to ?? '2025-07-14',
    priorUnallowed: { A: co.passive_1450_fremont, B: co.passive_1200_barton_hills },
    federalEstimates: parseSchedule(line('F1040.26')?.note),
    extensionPayment: ext > 0 ? { date: (extEvent?.at ?? '2026-04-14').slice(0, 10), amount: ext } : null,
    priorYearTax: p.engine_reference.parameters.prior_year_tax,
    priorYearAgi: p.engine_reference.parameters.prior_year_agi,
    caPriorYearTax: p.engine_reference.parameters.ca_prior_year_tax,
    caWithholdingSchedule: 0,
    caEstimates: parseSchedule(line('F540NR.72')?.note),
    dependents: {
      under17: Number(line('F8812.4')?.value ?? 0),
      other: Number(line('F8812.6')?.value ?? 0),
    },
    isoAdjustment: Number(line('F6251.2i')?.value ?? 0),
  };
}

/**
 * Recompute a return version with a set of edits. With no edits the result equals the engine's
 * output line for line (tested on v1, v2 and v3).
 */
export function computeReturn(p: Packet, v: ReturnVersion, edits: Edit[] = [], factsOverride?: Partial<Facts>): Computed {
  const facts = { ...buildFacts(p, v), ...factsOverride };
  const c = new Ctx(v, p.engine_reference.parameters, edits);
  const lots = applyLotEdits(parseLots(v), edits);
  const fed = computeFederal(c, lots, facts);
  const usesRidgelineSupplement = v.documents_used.includes('D38');
  const caShare = usesRidgelineSupplement ? evValue(p, 'ev-0971') : null;
  computeCalifornia(c, fed.lots, facts, caShare);
  return {
    version: v.version,
    values: c.values,
    labels: c.labels,
    formulas: c.formulas,
    derived: c.derived,
    forced: c.forced,
    added: c.added,
    removed: c.removed,
    lots: fed.lots,
    approx: c.approx,
    carryovers: fed.carry,
    penalty: { federal: c.n('F1040.38'), california: c.n('FTB5805.penalty'), federalSchedule: fed.pen.rows },
  };
}

export interface Summary {
  federal: { agi: number; taxableIncome: number; totalTax: number; payments: number; balanceDue: number; penalty: number };
  california: { totalAgi: number; caAgi: number; totalTax: number; payments: number; balanceDue: number; penalty: number };
}

export function summarize(c: Computed): Summary {
  const n = (k: string) => {
    const v = c.values.get(k);
    return typeof v === 'number' ? v : 0;
  };
  return {
    federal: {
      agi: n('F1040.11'),
      taxableIncome: n('F1040.15'),
      totalTax: n('F1040.24'),
      payments: n('F1040.33'),
      balanceDue: n('F1040.24') - n('F1040.33'),
      penalty: n('F1040.38'),
    },
    california: {
      totalAgi: n('F540NR.17'),
      caAgi: n('F540NR.32'),
      totalTax: n('F540NR.64'),
      payments: n('F540NR.78'),
      balanceDue: n('F540NR.64') - n('F540NR.78'),
      penalty: n('FTB5805.penalty'),
    },
  };
}
