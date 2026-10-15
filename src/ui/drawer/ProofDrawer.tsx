import { ArrowLeft, X } from 'lucide-react';
import { useEffect } from 'react';
import { kindOf, resolveRef } from '../../app/refs';
import { store, useApp, useWorkpaper } from '../../app/store';
import { IconButton } from '../kit';
import { AdjProof } from './AdjProof';
import { CheckProof } from './CheckProof';
import { LineProof } from './LineProof';
import { EvProof, NoteProof, RefProof } from './MiscProof';

export function ProofDrawer() {
  const stack = useApp((s) => s.drawer).filter((r) => !r.startsWith('doc:'));
  const ix = useApp((s) => s.ix);
  const wp = useWorkpaper();
  const top = stack[stack.length - 1];
  const redirect = top && ['judgment', 'question', 'step', 'signoff'].includes(kindOf(top)) ? kindOf(top) : null;
  useEffect(() => {
    if (!redirect) return;
    store.closeDrawer();
    if (redirect === 'judgment') store.go({ page: 'review', tab: 'judgments' });
    else if (redirect === 'question') store.go({ page: 'client' });
    else store.go({ page: 'review', tab: redirect === 'step' ? 'steps' : 'signoffs' });
  }, [redirect]);
  useEffect(() => {
    if (!top) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) store.back();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [top]);
  if (!top || !ix || redirect) return null;
  const kind = kindOf(top);
  const id = top.replace(/^(check|adj|note|judgment|question|step|signoff):/, '');
  let body: React.ReactNode;
  if (kind === 'line') body = <LineProof k={top} />;
  else if (kind === 'ev') body = <EvProof id={top} />;
  else if (kind === 'check') body = <CheckProof id={id} />;
  else if (kind === 'adj') body = <AdjProof id={id} />;
  else if (kind === 'note') body = <NoteProof id={id} />;
  else body = <RefProof r={top} />;
  const crumbs = stack.slice(-3, -1);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-[var(--scrim)] anim-fade lg:bg-transparent" onClick={() => store.closeDrawer()} />
      <aside role="complementary" aria-label="Proof" className="fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-[600px] flex-col border-l border-line bg-panel shadow-2 anim-drawer"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
          {stack.length > 1 ? <IconButton label="Back" onClick={() => store.back()}><ArrowLeft className="size-4" /></IconButton> : <span className="w-2" />}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm text-fg-3">
            {crumbs.map((c) => <span key={c} className="mono max-w-[140px] truncate">{resolveRef(ix, wp, c).id.replace(/^(check|adj):/, '')} ›</span>)}
            <span className="eyebrow">Proof</span>
          </div>
          <IconButton label="Close (Esc)" onClick={() => store.closeDrawer()}><X className="size-4" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-10 scroll-thin" key={top}>{body}</div>
      </aside>
    </>
  );
}
