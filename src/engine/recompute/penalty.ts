import { round2 } from './core';

const FED_DUE = ['2025-04-15', '2025-06-15', '2025-09-15', '2026-01-15'];
const FED_END = '2026-04-15';
const days = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

export interface PenaltyRow { installment: number; due: string; required: number; paid: number; underpaid: number; interest: number }

/**
 * Form 2210 regular method: four equal required installments, withholding treated as paid evenly on
 * the due dates, payments applied to the earliest unpaid installment, interest at the annual rate
 * until paid or 2026-04-15. Rounded down to whole dollars, which reproduces engine v1-v3 exactly.
 */
export function federalPenalty(
  requiredAnnual: number,
  withholding: number,
  estimates: { date: string; amount: number }[],
  extension: { date: string; amount: number } | null,
  rate: number,
): { penalty: number; rows: PenaltyRow[] } {
  const inst = requiredAnnual / 4;
  const credits: { date: string; amount: number }[] = FED_DUE.map((d) => ({ date: d, amount: withholding / 4 }))
    .concat(estimates)
    .concat(extension && extension.date <= FED_END ? [extension] : [])
    .sort((a, b) => a.date.localeCompare(b.date));
  const remaining = [inst, inst, inst, inst];
  const applied: { date: string; amount: number }[][] = [[], [], [], []];
  for (const cr of credits) {
    let amt = cr.amount;
    for (let i = 0; i < 4 && amt > 1e-9; i++) {
      if (remaining[i] > 1e-9) {
        const x = Math.min(remaining[i], amt);
        remaining[i] -= x;
        amt -= x;
        applied[i].push({ date: cr.date, amount: x });
      }
    }
  }
  const rows: PenaltyRow[] = [];
  let total = 0;
  for (let i = 0; i < 4; i++) {
    let interest = 0;
    let late = 0;
    let timely = 0;
    for (const a of applied[i]) {
      if (a.date > FED_DUE[i]) {
        interest += (a.amount * rate * days(FED_DUE[i], a.date < FED_END ? a.date : FED_END)) / 365;
        late += a.amount;
      } else timely += a.amount;
    }
    if (remaining[i] > 1e-9) {
      interest += (remaining[i] * rate * days(FED_DUE[i], FED_END)) / 365;
      late += remaining[i];
    }
    total += interest;
    rows.push({ installment: i + 1, due: FED_DUE[i], required: round2(inst), paid: round2(timely), underpaid: round2(late), interest: round2(interest) });
  }
  return { penalty: Math.floor(total + 1e-9), rows };
}

const CA_DUE = ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'];
const CA_PCT = [0.3, 0.4, 0, 0.3];
const CA_END = '2026-04-15';

/** FTB 5805 regular method with the 30/40/0/30 installment pattern. */
export function californiaPenalty(
  requiredAnnual: number,
  withholding: number,
  estimates: { date: string; amount: number }[],
  rate: number,
): number {
  const credits = CA_DUE.map((d) => ({ date: d, amount: withholding / 4 }))
    .concat(estimates)
    .sort((a, b) => a.date.localeCompare(b.date));
  const remaining = CA_PCT.map((p) => requiredAnnual * p);
  let total = 0;
  for (const cr of credits) {
    let amt = cr.amount;
    for (let i = 0; i < 4 && amt > 1e-9; i++) {
      if (remaining[i] > 1e-9) {
        const x = Math.min(remaining[i], amt);
        remaining[i] -= x;
        amt -= x;
        if (cr.date > CA_DUE[i]) total += (x * rate * days(CA_DUE[i], cr.date < CA_END ? cr.date : CA_END)) / 365;
      }
    }
  }
  remaining.forEach((r, i) => {
    if (r > 1e-9) total += (r * rate * days(CA_DUE[i], CA_END)) / 365;
  });
  return Math.floor(total + 1e-9);
}
