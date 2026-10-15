import { CircleDashed, CircleDot, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { store, useApp } from '../../app/store';
import { AREA, type AreaId } from '../../engine/areas';
import type { Level } from '../../engine/events';
import type { Summary } from '../../engine/recompute';
import type { AreaStatus, Workpaper } from '../../engine/workpaper';
import { date, money, value } from '../format';
import { Avatar, Tick, cx } from '../kit';
import { firmDay } from '../../engine/time';

export const LEVELS: Level[] = ['preparer', 'reviewer', 'partner'];
export const LEVEL_SHORT: Record<Level, string> = { preparer: 'P', reviewer: 'R', partner: 'Pt' };

/** The date of the packet's first engine run, read from the packet. */
export function useFirstRun(): string {
  const ix = useApp((s) => s.ix)!;
  const v = ix.versions.get(ix.versionOrder[0]);
  return v ? date(v.computed_at) : '';
}

/** The season clock, re-read whenever the app ticks. */
export function useNow(): string {
  useApp((s) => s.tick);
  useApp((s) => s.events.length);
  return store.now();
}

export const num = (wp: Workpaper, k: string, which: 'ours' | 'base' | 'projected' = 'ours'): number => {
  const c = wp[which];
  const v = c?.values.get(k);
  return typeof v === 'number' ? v : 0;
};

/** What the household gets back or owes, penalty included. */
export function outcome(s: Summary['federal'] | Summary['california']): { kind: 'refund' | 'owe' | 'even'; amount: number; detail: string } {
  const bal = s.balanceDue;
  const pen = s.penalty;
  if (bal > 0) return { kind: 'owe', amount: bal + pen, detail: pen ? `${money(bal)} tax + ${money(pen)} penalty` : 'Tax less payments' };
  const back = -bal - pen;
  if (back > 0) return { kind: 'refund', amount: back, detail: pen ? `Overpaid ${money(-bal)} less the ${money(pen)} penalty` : 'Payments less tax' };
  if (back < 0) return { kind: 'owe', amount: -back, detail: `Penalty ${money(pen)} exceeds the overpayment` };
  return { kind: 'even', amount: 0, detail: '' };
}

/** Three small marks for preparer, reviewer and partner sign-off on an area. */
export function SignDots({ a, size = 'md' }: { a: AreaStatus; size?: 'sm' | 'md' }) {
  const actors = useApp((s) => s.actors);
  return (
    <span className="inline-flex items-center gap-1">
      {LEVELS.map((l) => {
        const so = a.signoffs[l];
        const who = actors.find((x) => x.id === so.by);
        const title = so.state === 'missing' ? `${l}: not signed` : so.state === 'signed' ? `${l}: signed by ${who?.name}` : `${l}: reopened (signed by ${who?.name}, then the area changed)`;
        return (
          <span key={l} title={title} className={cx('inline-flex items-center justify-center rounded font-semibold', size === 'sm' ? 'h-6 min-w-7 px-1 text-cap' : 'h-6 min-w-8 px-1.5 text-cap',
            so.state === 'signed' ? 'bg-ok-bg text-ok' : so.state === 'reopened' ? 'bg-warn-bg text-warn' : 'border border-dashed border-line-2 text-fg-3')}>
            {so.state === 'reopened' ? <RotateCcw className="size-2.5" /> : LEVEL_SHORT[l]}
          </span>
        );
      })}
    </span>
  );
}

export function SignState({ state, by, at }: { state: 'missing' | 'signed' | 'reopened'; by: string | null; at: string | null }) {
  const actors = useApp((s) => s.actors);
  const a = actors.find((x) => x.id === by);
  if (state === 'missing') return <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-fg-3"><CircleDashed className="size-4" />Not signed</span>;
  if (state === 'reopened') return <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-warn"><RotateCcw className="size-4" />Reopened · {a?.name.split(' ')[0]}</span>;
  return <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap"><Tick ink={a?.ink} size={14} /><span>{a?.name}</span>{at && <span className="text-fg-3">{firmDay(at).slice(5, 10).replace('-', '/')}</span>}</span>;
}

export function AreaLink({ id, className }: { id: AreaId | null; className?: string }) {
  if (!id) return <span className={cx('text-fg-3', className)}>Whole return</span>;
  return <button type="button" onClick={(e) => { e.stopPropagation(); store.go({ page: 'area', id }); }} className={cx('text-left hover:underline', className)}>{AREA[id].short}</button>;
}

export function Person({ id, size = 18, short }: { id: string; size?: number; short?: boolean }) {
  const actors = useApp((s) => s.actors);
  const a = actors.find((x) => x.id === id);
  return <span className="inline-flex items-center gap-1.5"><Avatar actor={a} size={size} /><span>{short ? a?.name.split(' ')[0] : a?.name ?? id}</span></span>;
}

/** A table of return lines: label, key, engine, ours (clickable to the proof), optional prior year. */
export function LineRows({ wp, keys, prior, emphasize = [], dense }: { wp: Workpaper; keys: (string | [string, string])[]; prior?: Record<string, number | string>; emphasize?: string[]; dense?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="text-cap text-fg-3">
            <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-left font-semibold">Line</th>
            {prior && <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">2024</th>}
            <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">Engine {wp.version?.version}</th>
            <th className="border-b border-line bg-panel-2 px-4 py-2.5 text-right font-semibold">Ours</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((entry) => {
            const [k, alias] = Array.isArray(entry) ? entry : [entry, null];
            const b = wp.base?.values.get(k);
            const o = wp.ours?.values.get(k);
            const label = alias ?? wp.ours?.labels.get(k) ?? wp.base?.labels.get(k) ?? k;
            const changed = b !== o;
            const strong = emphasize.includes(k);
            const pv = prior?.[k];
            return (
              <tr key={k} className={cx('hover:bg-panel-2', strong && 'bg-panel-2/70')}>
                <td className={cx('border-b border-line px-4 align-top', dense ? 'py-2' : 'py-3')}>
                  <button type="button" onClick={() => store.open(k)} className={cx('text-left hover:underline', strong && 'font-semibold')}>{label}</button>
                  <span className="mono ml-2 text-cap text-fg-3">{k}</span>
                </td>
                {prior && <td className={cx('num border-b border-line px-4 text-right text-fg-3', dense ? 'py-2' : 'py-3')}>{pv === undefined ? '—' : value(pv, k)}</td>}
                <td className={cx('num border-b border-line px-4 text-right', dense ? 'py-2' : 'py-3', changed ? 'text-fg-3 line-through decoration-fg-3/50' : 'text-fg-2')}>{b === undefined ? '—' : value(b, k)}</td>
                <td className={cx('border-b border-line px-4 text-right', dense ? 'py-2' : 'py-3')}>
                  {o === undefined ? <span className="text-fg-3">{b === undefined ? '—' : 'removed'}</span> : (
                    <button type="button" onClick={() => store.open(k)} className={cx('num proof', strong && 'font-semibold', changed && 'ink-blue font-semibold')}>{value(o, k)}</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value: v, sub, tone, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn'; onClick?: () => void }) {
  const El = onClick ? 'button' : 'div';
  return (
    <El type={onClick ? 'button' : undefined} onClick={onClick} className={cx('flex flex-col rounded-xl border border-line bg-panel p-4 text-left', onClick && 'hover:border-line-2')}>
      <span className="text-sm text-fg-3">{label}</span>
      <span className={cx('num mt-0.5 text-xl leading-tight font-semibold', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{v}</span>
      {sub && <span className="mt-0.5 text-sm text-fg-3">{sub}</span>}
    </El>
  );
}

export function StepIcon({ state }: { state: 'done' | 'open' | 'blocked' | 'na' }) {
  if (state === 'done') return <Tick ink="green" size={16} />;
  if (state === 'blocked') return <CircleDot className="size-4 text-bad" />;
  if (state === 'open') return <CircleDot className="size-4 text-warn" />;
  return <CircleDashed className="size-4 text-fg-3" />;
}

/** Open whatever a filing blocker points at. */
export function openBlocker(ref: string) {
  if (ref === 'client:approve') store.go({ page: 'client' });
  else store.open(ref);
}

/** Download a text or JSON file from the browser. */
export function download(name: string, content: string, mime = 'application/json') {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    store.toast('This browser blocked the download.', 'error');
  }
}
