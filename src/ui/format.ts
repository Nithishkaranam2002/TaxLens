import { group } from '../engine/num';
import { FIRM_TZ, fmtDate } from '../engine/time';

export function money(n: number | null | undefined, opts: { cents?: boolean; sign?: boolean; zero?: string } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n === 0 && opts.zero !== undefined) return opts.zero;
  const abs = Math.abs(n);
  const s = opts.cents ? group(abs, 2, 2) : group(abs);
  if (n < 0) return opts.sign ? `−${s}` : `(${s})`;
  return opts.sign && n > 0 ? `+${s}` : s;
}

export function signed(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  return (n > 0 ? '+' : '−') + group(Math.abs(Math.round(n)));
}

export function value(v: number | string | null | undefined, key?: string): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (key && /\.(34|36)$/.test(key) && key.startsWith('F540NR') ) return v.toFixed(4);
  if (key && key === 'F8606.10') return v.toFixed(5);
  if (key && key.startsWith('F8949.') && !key.endsWith('.total')) return money(v, { cents: true });
  if (Math.abs(v) < 1 && v !== 0) return v.toFixed(4);
  return money(v);
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TZ, hour: 'numeric', minute: '2-digit' });

/** A date or timestamp on the firm's calendar (Central time), so a date always agrees with the time beside it. */
export function date(iso: string | null | undefined, withYear = true): string {
  return fmtDate(iso, withYear);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${date(iso)} · ${timeFmt.format(Date.parse(iso))}`;
}

export function ago(iso: string, now: string): string {
  const s = (Date.parse(now) - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 45) return `${d} day${d === 1 ? '' : 's'} ago`;
  return date(iso);
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${group(n)} ${n === 1 ? one : many}`;
}

export function hours(min: number): string {
  return (min / 60).toFixed(1);
}
