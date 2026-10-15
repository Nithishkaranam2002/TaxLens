import { CheckCircle2, Info, ShieldAlert, Undo2, X } from 'lucide-react';
import { store, useApp } from '../../app/store';
import { revert } from '../../app/actions';
import { cx } from '../kit';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 lg:left-auto lg:right-6 lg:translate-x-0" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('pointer-events-auto flex items-start gap-3 rounded-xl border bg-panel px-4 py-3 shadow-2 anim-rise', t.tone === 'error' ? 'border-bad/40' : 'border-line')}>
          {t.tone === 'error' ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" /> : t.tone === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-info" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
          <div className="min-w-0 flex-1 text-base">
            {t.rule && <div className="mb-0.5 text-sm font-semibold text-bad">Not allowed</div>}
            {t.text}
          </div>
          {t.undo && t.undo.length > 0 && (
            <button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg hover:bg-sunk"
              onClick={() => { store.run((x) => revert(x, t.undo![0], 'Undone from the confirmation'), { undoable: false }); store.dismissToast(t.id); }}>
              <Undo2 className="size-3.5" />Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-sunk hover:text-fg" onClick={() => store.dismissToast(t.id)}><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
