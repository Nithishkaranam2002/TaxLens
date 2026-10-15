import clsx from 'clsx';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { store } from '../app/store';
import type { Actor } from '../engine/people';
import { money, signed } from './format';

export const cx = clsx;

// ---------- buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  busy?: boolean;
};
export function Button({ variant = 'secondary', size = 'md', icon, busy, className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8.5 px-3 text-[13px]',
        variant === 'primary' && 'bg-btn text-btn-fg hover:opacity-90',
        variant === 'secondary' && 'border border-line-2 bg-panel text-fg hover:bg-panel-2',
        variant === 'ghost' && 'text-fg-2 hover:bg-sunk hover:text-fg',
        variant === 'danger' && 'border border-bad/40 bg-bad-bg text-bad hover:border-bad',
        variant === 'ok' && 'border border-ok/40 bg-ok-bg text-ok hover:border-ok',
        className,
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('inline-flex size-8 items-center justify-center rounded-md text-fg-2 hover:bg-sunk hover:text-fg disabled:opacity-40', className)}>
      {children}
    </button>
  );
}

// ---------- labels ----------
export type Tone = 'neutral' | 'ok' | 'bad' | 'warn' | 'info' | 'violet' | 'outline';
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11.5px] font-medium leading-none whitespace-nowrap',
      tone === 'neutral' && 'bg-sunk text-fg-2',
      tone === 'ok' && 'bg-ok-bg text-ok',
      tone === 'bad' && 'bg-bad-bg text-bad',
      tone === 'warn' && 'bg-warn-bg text-warn',
      tone === 'info' && 'bg-info-bg text-info',
      tone === 'violet' && 'bg-sunk ink-violet',
      tone === 'outline' && 'border border-line-2 text-fg-2',
      className)}>
      {dot && <span className={cx('size-1.5 rounded-full', tone === 'ok' ? 'bg-ok' : tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : tone === 'info' ? 'bg-info' : 'bg-fg-3')} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono rounded border border-line-2 bg-panel-2 px-1 text-[10.5px] text-fg-3">{children}</kbd>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('eyebrow', className)}>{children}</div>;
}

// ---------- surfaces ----------
export function Card({ children, className, pad = true, as: As = 'section' }: { children: ReactNode; className?: string; pad?: boolean; as?: 'section' | 'div' }) {
  return <As className={cx('rounded-lg border border-line bg-panel shadow-1', pad && 'p-4', className)}>{children}</As>;
}

export function SectionHead({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-fg-3">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        {sub && <p className="mt-1 max-w-[72ch] text-[13px] text-fg-2">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 px-6 py-10 text-center">
      {icon && <div className="text-fg-3">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-[52ch] text-[13px] text-fg-3">{children}</div>}
    </div>
  );
}

// ---------- numbers ----------
/** A number you can click to see its proof. */
export function Money({ v, refKey, cents, sign, className, strong, title }: { v: number | null | undefined; refKey?: string; cents?: boolean; sign?: boolean; className?: string; strong?: boolean; title?: string }) {
  const text = sign ? signed(v ?? 0) : money(v, { cents });
  if (!refKey) return <span className={cx('num', strong && 'font-semibold', className)} title={title}>{text}</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); store.open(refKey); }} className={cx('num proof text-left', strong && 'font-semibold', className)} title={title ?? `Show how ${refKey} was built`}>
      {text}
    </button>
  );
}

export function Delta({ v, className, invert }: { v: number; className?: string; invert?: boolean }) {
  if (!v) return <span className={cx('num text-fg-3', className)}>—</span>;
  const good = invert ? v > 0 : v < 0;
  return <span className={cx('num font-medium', good ? 'text-ok' : 'text-bad', className)}>{signed(v)}</span>;
}

/** Old value struck through, new value in the ink of the change. */
export function Diff({ from, to, refKey }: { from: number | string | null; to: number | string | null; refKey?: string }) {
  const f = (x: number | string | null) => (x === null ? '—' : typeof x === 'number' ? money(x, { cents: x % 1 !== 0 }) : x);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      <span className="num text-fg-3 line-through decoration-fg-3/60">{f(from)}</span>
      <span className="text-fg-3">→</span>
      {refKey && typeof to === 'number' ? <Money v={to} refKey={refKey} strong /> : <span className="num font-semibold">{f(to)}</span>}
    </span>
  );
}

// ---------- people ----------
export function Avatar({ actor, size = 22, ring }: { actor: Actor | undefined; size?: number; ring?: boolean }) {
  if (!actor) return null;
  return (
    <span title={`${actor.name} · ${actor.roleLabel}`} className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[var(--on-ink)]', `bg-ink-${actor.ink}`, ring && 'ring-2 ring-panel')}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}>
      {actor.initials}
    </span>
  );
}

/** The tickmark glyph, drawn in the verifier's ink. */
export function Tick({ ink = 'graphite', size = 14, title }: { ink?: Actor['ink'] | 'graphite'; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`ink-${ink} shrink-0`} aria-label={title ?? 'Verified'} role="img">
      {title && <title>{title}</title>}
      <path d="M2.2 8.6c1.4.9 2.5 2.2 3.3 3.9C7.4 7.6 10.2 4.2 14 2.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- status ----------
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [Tone, string]> = {
    pass: ['ok', 'Passes'], fail: ['bad', 'Fails'], review: ['warn', 'Review'], info: ['neutral', 'Info'], waiting: ['neutral', 'Waiting'],
    open: ['bad', 'Open'], overdue: ['bad', 'Overdue'], proposed: ['info', 'Proposed'], resolved: ['ok', 'Resolved'], closed: ['neutral', 'Closed'],
    approved: ['ok', 'Approved'], rejected: ['bad', 'Rejected'], withdrawn: ['neutral', 'Withdrawn'],
    signed: ['ok', 'Signed'], reopened: ['warn', 'Reopened'], missing: ['neutral', 'Not signed'],
    used: ['ok', 'Used'], supporting: ['info', 'Supporting'], duplicate: ['neutral', 'Duplicate'], superseded: ['neutral', 'Superseded'],
    engagement: ['neutral', 'Engagement'], identity: ['neutral', 'Identity'], 'prior-year': ['neutral', 'Prior year'], agency: ['neutral', 'Agency'],
  };
  const [tone, label] = map[status] ?? ['neutral', status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

// ---------- tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-line scroll-thin', className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} type="button" onClick={() => onChange(t.id)}
          className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-[13px] font-medium transition-colors',
            value === t.id ? 'border-fg text-fg' : 'border-transparent text-fg-3 hover:text-fg-2')}>
          {t.label}
          {t.count !== undefined && <span className={cx('num rounded px-1 text-[11px]', value === t.id ? 'bg-sunk text-fg-2' : 'text-fg-3')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-md border border-line-2 bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={cx('rounded px-2.5 font-medium transition-colors', size === 'sm' ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]', value === o.id ? 'bg-panel text-fg shadow-1' : 'text-fg-3 hover:text-fg-2')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- form ----------
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-fg-3">{hint}</span>}
    </label>
  );
}
export const inputCls = 'w-full rounded-md border border-line-2 bg-panel px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-3 focus:border-focus focus:outline-none';
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[72px] resize-y leading-snug', props.className)} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, 'h-8.5', props.className)} />;
}
export function Select({ value, onChange, options, className, id }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; className?: string; id?: string }) {
  return (
    <div className={cx('relative', className)}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'h-8.5 appearance-none pr-7')}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  );
}
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={(e) => { e.stopPropagation(); onChange(!checked); }} className="inline-flex items-center gap-2 text-[13px]">
      <span className={cx('flex size-4 items-center justify-center rounded border transition-colors', checked ? 'border-btn bg-btn text-btn-fg' : 'border-line-2 bg-panel')}>
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

// ---------- overlays ----------
/** True when el is the dialog on top (the last one in the page), so Escape closes only that one. */
export function isTopDialog(el: Element | null): boolean {
  if (!el) return false;
  const all = document.querySelectorAll('[role="dialog"]');
  return all[all.length - 1] === el;
}

/** True while the person is typing in a field, so page shortcuts leave their keys alone. */
export function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopDialog(ref.current)) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-4 pt-[8vh] anim-fade" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('w-full rounded-xl border border-line bg-panel shadow-2 anim-rise', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 scroll-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Menu({ trigger, children, align = 'right', width = 280 }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f);
    window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cx('absolute z-40 mt-1.5 max-h-[75vh] overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-2 anim-rise scroll-thin', align === 'right' ? 'right-0' : 'left-0')} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, active, disabled }: { onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40', active ? 'bg-sunk' : 'hover:bg-panel-2')}>
      {children}
    </button>
  );
}

// ---------- data display ----------
export function KV({ k, children, className }: { k: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0', className)}>
      <span className="text-[12.5px] text-fg-2">{k}</span>
      <span className="text-right text-[13px]">{children}</span>
    </div>
  );
}

export function Meter({ value, max, tone = 'neutral', className }: { value: number; max: number; tone?: 'neutral' | 'ok' | 'bad' | 'warn'; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-sunk', className)}>
      <div className={cx('h-full rounded-full', tone === 'ok' ? 'bg-ok' : tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-fg-2')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cx('sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-panel-2 px-3 py-2 text-left text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase', right && 'text-right', className)}>{children}</th>;
}
export function Td({ children, right, className, colSpan }: { children?: ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cx('border-b border-line px-3 py-2 align-top text-[13px]', right && 'text-right num', className)}>{children}</td>;
}
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto rounded-lg border border-line bg-panel scroll-thin', className)}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function Spinner() {
  return <Loader2 className="size-4 animate-spin text-fg-3" />;
}
