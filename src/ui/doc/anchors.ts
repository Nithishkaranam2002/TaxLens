import type { ExtractedValue } from '../../data/packet';

export interface Anchor { ev: ExtractedValue; start: number; end: number }

function candidates(ev: ExtractedValue): string[] {
  const out = new Set<string>();
  if (ev.text_as_read) out.add(ev.text_as_read);
  const v = ev.value;
  if (typeof v === 'number') {
    out.add(v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    out.add(v.toLocaleString('en-US', { maximumFractionDigits: 4 }));
    out.add(String(v));
    if (ev.value_type === 'percent') out.add(`${Math.round(v * 100)}%`);
  } else if (typeof v === 'string') {
    out.add(v);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (iso) out.add(`${iso[2]}/${iso[3]}/${iso[1]}`);
  }
  return [...out].filter((s) => s.length > 0).sort((a, b) => b.length - a.length);
}

function hints(ev: ExtractedValue): string[] {
  const h: string[] = [];
  const box = /^Box (\w+)/.exec(ev.label);
  if (box) h.push(`Box ${box[1]}`, `box ${box[1]}`);
  const lot = /^([MNXC]\d+)_/.exec(ev.field);
  if (lot) h.push(`${lot[1]} `);
  const buy = /^buy(\d+)_/.exec(ev.field);
  if (buy) h.push(`Buy ${buy[1]} `);
  const pay = /^(pay|q)(\d+)_/.exec(ev.field);
  if (pay) h.push(pay[2]);
  const words = ev.label.replace(/^(Lot \w+|Box \w+|C\d+|Buy \d+)\s*/, '').split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
  h.push(...words);
  return h;
}

/** Find where each extracted value is printed on the page (text spans). Positions are synthetic, so text wins. */
export function anchorsFor(text: string, evs: ExtractedValue[]): Anchor[] {
  const used: [number, number][] = [];
  const overlaps = (s: number, e: number) => used.some(([a, b]) => s < b && e > a);
  const out: Anchor[] = [];
  // Trips on the mileage log repeat the same shape; anchor them in order.
  const tripCursor = { pos: 0 };
  for (const ev of evs) {
    if (ev.value_type === 'boolean') continue;
    const cands = candidates(ev);
    const hs = hints(ev);
    let best: { s: number; e: number; score: number } | null = null;
    const trip = /^trip(\d+)_/.exec(ev.field);
    for (const c of cands) {
      let i = text.indexOf(c, trip ? tripCursor.pos : 0);
      while (i !== -1) {
        const s = i;
        const e = i + c.length;
        const before = text.slice(Math.max(0, s - 90), s);
        const after = text[e] ?? '';
        const boundary = !/\d/.test(text[s - 1] ?? '') && !/\d/.test(after);
        if (boundary && !overlaps(s, e)) {
          let score = 1000 - s / 1000;
          for (const h of hs) {
            const at = before.lastIndexOf(h);
            if (at !== -1) score += 2000 - (before.length - at) * 5;
          }
          if (!best || score > best.score) best = { s, e, score };
          if (trip) break;
        }
        i = text.indexOf(c, i + 1);
      }
      if (best && trip) break;
    }
    if (best) {
      used.push([best.s, best.e]);
      out.push({ ev, start: best.s, end: best.e });
      if (trip && /_miles$/.test(ev.field)) tripCursor.pos = best.e;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
