// Fast en-US number formatting. Intl formatting costs tens of microseconds per call, and the
// recompute writes a formula string for every one of several hundred lines on each run.

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** Format with thousands separators and between minFrac and maxFrac decimals (half away from zero). */
export function group(n: number, minFrac = 0, maxFrac = 0): string {
  if (!Number.isFinite(n)) return String(n);
  const scale = 10 ** maxFrac;
  const scaled = Math.round(Math.abs(n) * scale + 1e-9);
  const int = Math.floor(scaled / scale);
  let frac = maxFrac ? String(scaled % scale).padStart(maxFrac, '0') : '';
  while (frac.length > minFrac && frac.endsWith('0')) frac = frac.slice(0, -1);
  const s = String(int).replace(GROUP, ',') + (frac ? '.' + frac : '');
  return n < 0 && scaled !== 0 ? '-' + s : s;
}
