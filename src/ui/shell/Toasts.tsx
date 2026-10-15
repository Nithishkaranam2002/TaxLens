import { CheckCircle2, Info, ShieldAlert, Undo2, X } from 'lucide-react';
import { store, useApp } from '../../app/store';
import { revert } from '../../app/actions';
import { cx } from '../kit';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-panel p-3 shadow-2 anim-rise', t.tone === 'error' ? 'border-bad/40' : 'border-line')}>
          {t.tone === 'error' ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" /> : t.tone === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-info" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
          <div className="min-w-0 flex-1 text-[13px]">
            {t.rule && <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-bad uppercase">Not allowed</div>}
            {t.text}
          </div>
          {t.undo && t.undo.length > 0 && (
            <button type="button" className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12.5px] font-medium text-fg-2 hover:bg-sunk hover:text-fg"
              onClick={() => { store.run((x) => revert(x, t.undo![0], 'Undone from the confirmation'), { undoable: false }); store.dismissToast(t.id); }}>
              <Undo2 className="size-3.5" />Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="shrink-0 text-fg-3 hover:text-fg" onClick={() => store.dismissToast(t.id)}><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
