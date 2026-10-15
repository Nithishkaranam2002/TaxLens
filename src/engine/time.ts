/**
 * The firm is in Austin, so calendar days and clock times are shown in Central time for every
 * viewer, wherever their browser is. Timestamps in the packet and the log stay in UTC; only the
 * way a day is named changes. A plain date ("2026-04-15") is already a calendar day.
 */
export const FIRM_TZ = 'America/Chicago';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const cache = new Map<string, string>();

const isStamp = (iso: string) => iso.length > 10 && iso[10] === 'T';

function dayOfMs(ms: number): string {
  const p = parts.formatToParts(ms);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The firm's calendar day (YYYY-MM-DD) for a date or a timestamp. */
export function firmDay(iso: string): string {
  if (!isStamp(iso)) return iso.slice(0, 10);
  let hit = cache.get(iso);
  if (hit === undefined) {
    const ms = Date.parse(iso);
    hit = Number.isNaN(ms) ? iso.slice(0, 10) : dayOfMs(ms);
    cache.set(iso, hit);
  }
  return hit;
}

/** The last second of a firm calendar day, as a UTC timestamp in packet format. */
export function firmEndOfDay(day: string): string {
  // Central time is UTC−5 or UTC−6, so the day ends at 04:59:59 or 05:59:59 UTC the next morning.
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  for (const h of ['05', '04']) {
    const t = `${next}T${h}:59:59Z`;
    if (firmDay(t) === day) return t;
  }
  return `${day}T23:59:59Z`;
}

/** "Mar 12, 2026" (or "Mar 12") for a date or a timestamp, on the firm's calendar. */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—';
  const [y, m, d] = firmDay(iso).split('-').map(Number);
  return `${MON[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}
