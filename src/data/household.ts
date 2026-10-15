// Facts about the engagement that the screens repeat, read once from the packet so no household
// detail is typed into the UI. A different packet changes every label with it.

import type { Packet } from './packet';
import { fmtDate } from '../engine/time';

const FILING_STATUS: Record<string, [string, string]> = {
  single: ['Single', 'Single'],
  married_filing_jointly: ['Married filing jointly', 'MFJ'],
  married_filing_separately: ['Married filing separately', 'MFS'],
  head_of_household: ['Head of household', 'HoH'],
  qualifying_surviving_spouse: ['Qualifying surviving spouse', 'QSS'],
};

const STATE_NAME: Record<string, string> = { CA: 'California', TX: 'Texas' };
const cityOf = (address: string) => address.split(',').slice(-2)[0]?.trim() ?? address;

export interface Engagement {
  year: number;
  /** The two filers, e.g. "Ngozi Okafor & Erik Lindqvist". */
  filers: string;
  /** Short file name from the filers' last names, e.g. "Okafor-Lindqvist". */
  fileName: string;
  filingStatus: string;
  filingStatusShort: string;
  /** "1040 + CA 540NR" */
  forms: string;
  /** "Moved from Sacramento to Austin on July 15, 2025." or null for a full-year resident. */
  move: string | null;
  /** The extended (or original) due date of the return, from the firm's deadlines. */
  due: { date: string; extended: boolean } | null;
  priorPreparer: string;
}

export function engagementOf(p: Packet): Engagement {
  const h = p.household;
  const filers = h.people.filter((x) => x.role === 'taxpayer' || x.role === 'spouse');
  const last = (n: string) => n.split(' ').pop() ?? n;
  const [fs, fsShort] = FILING_STATUS[h.filing_status] ?? [h.filing_status.replace(/_/g, ' '), h.filing_status];
  const res = [...h.residency].sort((a, b) => a.from.localeCompare(b.from));
  const states = [...new Set(res.map((r) => r.state))];
  const partYear = states.length > 1;
  const moveTo = partYear ? res[res.length - 1] : null;
  const from = partYear ? h.addresses.find((a) => a.to === res[0].to) : null;
  const to = partYear ? h.addresses.find((a) => a.from === moveTo!.from) : null;
  const stateForms = states.filter((s) => s !== 'TX').map((s) => `${s} ${s === 'CA' ? (partYear ? '540NR' : '540') : 'return'}`);
  const ext = p.firm.deadlines.find((d) => /extended due date/i.test(d.what));
  const orig = p.firm.deadlines.find((d) => /original due date/i.test(d.what));
  return {
    year: h.tax_year,
    filers: filers.map((x) => x.name).join(' & '),
    fileName: filers.map((x) => last(x.name)).join('-'),
    filingStatus: fs,
    filingStatusShort: fsShort,
    forms: ['1040', ...stateForms].join(' + '),
    move: partYear && from && to ? `Moved from ${cityOf(from.address)} to ${cityOf(to.address)} on ${fmtDate(moveTo!.from)}.` : partYear ? `Part-year ${states.map((s) => STATE_NAME[s] ?? s).join(' and ')} resident.` : null,
    due: ext ? { date: ext.date, extended: true } : orig ? { date: orig.date, extended: false } : null,
    priorPreparer: p.prior_years.return_2024.prepared_by,
  };
}
