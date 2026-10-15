import { FileText, Hash, Landmark, MessageSquare, Phone, Scale, SquareFunction, User } from 'lucide-react';
import { kindOf, resolveRef } from '../app/refs';
import { store, useApp } from '../app/store';
import { cx } from './kit';

const ICON: Record<string, typeof FileText> = {
  ev: Hash, doc: FileText, page: FileText, qa: MessageSquare, msg: MessageSquare, call: Phone, py: FileText, agency: Landmark,
  asset: SquareFunction, household: User, param: Scale, fx: Scale, line: SquareFunction,
};

/** A small chip for any reference in the packet or the workpaper. Click to open its proof. */
export function RefChip({ r, label, className }: { r: string; label?: string; className?: string }) {
  useApp((s) => s.status);
  const k = kindOf(r);
  const Icon = ICON[k] ?? Hash;
  const short = label ?? (k === 'py' ? '2024 file' : k === 'agency' ? 'Agency record' : k === 'param' ? r.slice(10) : k === 'fx' ? r.slice(4) : k === 'household' ? r.slice(10) : k === 'page' ? r.slice(4).replace('#page', ' p') : r);
  const title = (() => {
    try {
      const ix = store.get().ix;
      if (!ix) return r;
      const info = resolveRef(ix, null, r);
      return `${info.title}${info.value ? ` — ${info.value}` : ''}`;
    } catch { return r; }
  })();
  const open = () => {
    if (k === 'doc' || k === 'page') {
      const m = /^(?:doc:)?(D\d\d)(?:#page(\d+))?$/.exec(r);
      if (m) { store.open(`doc:${m[1]}#page${m[2] ?? 1}`); return; }
    }
    store.open(r);
  };
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(); }} title={title}
      className={cx('mono inline-flex h-5 max-w-full items-center gap-1 truncate rounded border border-line bg-panel-2 px-1.5 text-cap text-fg-2 hover:border-line-2 hover:text-fg', className)}>
      <Icon className="size-3 shrink-0 text-fg-3" />
      <span className="truncate">{short}</span>
    </button>
  );
}

export function RefList({ refs, max = 8 }: { refs: string[]; max?: number }) {
  const uniq = [...new Set(refs)];
  return (
    <div className="flex flex-wrap gap-1">
      {uniq.slice(0, max).map((r) => <RefChip key={r} r={r} />)}
      {uniq.length > max && <span className="text-cap text-fg-3">+{uniq.length - max} more</span>}
    </div>
  );
}

export function LineLink({ k, children, className }: { k: string; children?: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); store.open(k); }} className={cx('mono text-sm text-fg-2 underline decoration-line-2 underline-offset-2 hover:text-fg hover:decoration-fg', className)}>
      {children ?? k}
    </button>
  );
}
