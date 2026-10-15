import { History, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { store, useApp, useMe } from '../app/store';
import { DocumentViewer } from './doc/DocumentViewer';
import { ProofDrawer } from './drawer/ProofDrawer';
import { date } from './format';
import { Button, Spinner } from './kit';
import { CommandPalette } from './shell/CommandPalette';
import { Logo } from './shell/Logo';
import { Sidebar } from './shell/Sidebar';
import { Toasts } from './shell/Toasts';
import { Topbar } from './shell/Topbar';
import { Welcome } from './shell/Welcome';
import { Overview } from './pages/Overview';

const Inbox = lazy(() => import('./pages/Inbox').then((m) => ({ default: m.Inbox })));
const AreaPage = lazy(() => import('./pages/Area').then((m) => ({ default: m.AreaPage })));
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const Checks = lazy(() => import('./pages/Checks').then((m) => ({ default: m.Checks })));
const Changes = lazy(() => import('./pages/Changes').then((m) => ({ default: m.Changes })));
const Records = lazy(() => import('./pages/Records').then((m) => ({ default: m.Records })));
const Review = lazy(() => import('./pages/Review').then((m) => ({ default: m.Review })));
const ClientPage = lazy(() => import('./pages/Client').then((m) => ({ default: m.ClientPage })));
const Filing = lazy(() => import('./pages/Filing').then((m) => ({ default: m.Filing })));
const ActivityPage = lazy(() => import('./pages/Activity').then((m) => ({ default: m.ActivityPage })));
const Firm = lazy(() => import('./pages/Firm').then((m) => ({ default: m.Firm })));

/** The page's data-theme before we set one; undefined while we have not set it. */
let hostTheme: string | null | undefined;

export function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    // Only touch data-theme when the person picks light or dark here; in "system" mode we leave
    // the page as we found it, so a host page's own theme attribute is respected.
    const root = document.documentElement;
    if (theme === 'system') {
      if (hostTheme !== undefined) {
        if (hostTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', hostTheme);
        hostTheme = undefined;
      }
    } else {
      if (hostTheme === undefined) hostTheme = root.getAttribute('data-theme');
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);
  if (status === 'loading') return <Loading />;
  if (status === 'error') return <LoadError error={error} />;
  return <Shell />;
}

function Shell() {
  const route = useApp((s) => s.route);
  const drawer = useApp((s) => s.drawer);
  const viewAsOf = useApp((s) => s.viewAsOf);
  const welcomed = useApp((s) => s.welcomed);
  const me = useMe();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const topDoc = drawer.length && drawer[drawer.length - 1].startsWith('doc:') ? drawer[drawer.length - 1] : null;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (store.actor().role === 'client') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => {
    if (me.role === 'client' && route.page !== 'client') store.go({ page: 'client' });
  }, [me.role, route.page]);

  const page = (() => {
    if (me.role === 'client') return <ClientPage />;
    switch (route.page) {
      case 'overview': return <Overview />;
      case 'inbox': return <Inbox />;
      case 'area': return <AreaPage id={route.id} />;
      case 'documents': return <Documents />;
      case 'checks': return <Checks focus={route.id} />;
      case 'changes': return <Changes tab={route.tab ?? 'ledger'} />;
      case 'records': return <Records tab={route.tab} />;
      case 'review': return <Review tab={route.tab} />;
      case 'client': return <ClientPage />;
      case 'filing': return <Filing tab={route.tab} />;
      case 'activity': return <ActivityPage />;
      case 'firm': return <Firm tab={route.tab} />;
    }
  })();

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-line bg-bg lg:block">
        <Sidebar />
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] lg:hidden" onClick={() => setMenu(false)}>
          <aside className="h-full w-[288px] max-w-[85vw] border-r border-line bg-bg anim-drawer" onClick={(e) => e.stopPropagation()} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <Sidebar onNavigate={() => setMenu(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenu(true)} onSearch={() => setPalette(true)} />
        {viewAsOf && (
          <div className="flex flex-wrap items-center gap-3 border-b border-warn/30 bg-warn-bg px-5 py-2.5 text-sm" style={{ paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))', paddingRight: 'max(20px, env(safe-area-inset-right, 0px))' }}>
            <History className="size-4 text-warn" />
            <span className="flex-1">You are looking at the workpaper as it stood on <b>{date(viewAsOf)}</b>. Documents, engine output, checks and every decision are shown as of that moment. Nothing can be changed here.</span>
            <Button size="sm" icon={<X className="size-3.5" />} onClick={() => store.setView(null)}>Back to now</Button>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1464px] flex-1 py-6 md:py-8" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <div className="md:px-2 lg:px-4">
            <Suspense fallback={<div className="flex h-40 items-center justify-center"><Spinner /></div>}>{page}</Suspense>
          </div>
        </main>
      </div>
      <ProofDrawer />
      {topDoc && <DocumentViewer refStr={topDoc} onClose={() => store.back()} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toasts />
      {!welcomed && <Welcome />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Logo />
      <div className="flex items-center gap-2 text-base text-fg-3"><Spinner />Loading the packet and running the checks…</div>
    </div>
  );
}

function LoadError({ error }: { error: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo />
      <h1 className="text-lg font-semibold">The packet could not be opened</h1>
      <p className="max-w-[60ch] text-base text-fg-2">{error}</p>
      <p className="max-w-[60ch] text-sm text-fg-3">TaxLens loads packet.json from the same folder as the app. Check that the file is published next to index.html and is the packet as delivered.</p>
      <Button onClick={() => location.reload()}>Try again</Button>
    </div>
  );
}
