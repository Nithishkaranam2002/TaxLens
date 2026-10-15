import {
  Activity, BadgeCheck, Building2, ClipboardList, FileStack, Gauge, GitCompareArrows, Inbox, Landmark, Library, ListChecks, Send, Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Route } from '../../app/route';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREAS } from '../../engine/areas';
import { cx } from '../kit';
import { Logo } from './Logo';

function Item({ icon, label, route, count, tone, active }: { icon: ReactNode; label: string; route: Route; count?: number; tone?: 'bad' | 'warn' | 'neutral'; active: boolean }) {
  return (
    <button type="button" onClick={() => store.go(route)} aria-current={active ? 'page' : undefined}
      className={cx('group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-base transition-colors', active ? 'bg-panel font-medium text-fg shadow-1' : 'text-fg-2 hover:bg-sunk hover:text-fg')}>
      <span className={cx('text-fg-3', active && 'text-fg')}>{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cx('num rounded px-1.5 text-cap font-semibold', tone === 'bad' ? 'bg-bad-bg text-bad' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-sunk text-fg-2')}>{count}</span>
      )}
    </button>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const route = useApp((s) => s.route);
  const wp = useWorkpaper();
  const me = useMe();
  const ix = useApp((s) => s.ix)!;
  const isClient = me.role === 'client';
  const open = wp.blockers.length;
  const findingsOpen = wp.findings.filter((f) => f.status === 'open').length;
  const pending = wp.proposals.filter((p) => p.status === 'proposed').length;
  // Values that disagree with their page count until the re-read finding is resolved.
  const rereadOpen = wp.findings.some((f) => f.check.id === 'CHK-REREAD' && f.blocking);
  const docsWaiting = rereadOpen ? wp.docs.filter((d) => d.received && d.problems > 0).length : 0;
  const qOpen = [...wp.state.questions.values()].filter((q) => !q.answer).length;
  const go = (r: Route) => { store.go(r); onNavigate?.(); };
  const is = (p: Route['page']) => route.page === p;
  const filed = !!wp.state.frozen;

  if (isClient) {
    return (
      <nav className="flex h-full flex-col gap-1 p-3" onClick={onNavigate}>
        <Logo />
        <div className="mt-4 mb-2 rounded-lg border border-line bg-panel p-3">
          <div className="text-base font-semibold">{ix.engagement.filers}</div>
          <div className="text-sm text-fg-3">{ix.engagement.year} tax return · {ix.packet.firm.name}</div>
        </div>
        <Item icon={<ClipboardList className="size-4" />} label="Your return" route={{ page: 'client' }} active={is('client')} count={qOpen} tone="warn" />
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col p-3">
      <Logo />
      <button type="button" onClick={() => go({ page: 'overview' })} className="mt-4 mb-3 rounded-lg border border-line bg-panel p-3 text-left hover:border-line-2">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-base font-semibold">{ix.engagement.fileName}</div>
          <span className="mono text-cap text-fg-3">{ix.packet.packet.client_id}</span>
        </div>
        <div className="text-sm text-fg-3">{ix.engagement.year} · {ix.engagement.filingStatusShort} · {ix.engagement.forms}</div>
        <div className="mt-2 flex items-center gap-1.5 text-cap">
          <span className={cx('size-1.5 rounded-full', filed ? 'bg-ok' : open ? 'bg-warn' : 'bg-ok')} />
          <span className="text-fg-2">{filed ? 'Filed and frozen' : open ? `${open} items before filing` : 'Ready to file'}</span>
        </div>
      </button>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1 scroll-thin">
        <div className="space-y-0.5">
          <Item icon={<Gauge className="size-4" />} label="Overview" route={{ page: 'overview' }} active={is('overview')} />
          <Item icon={<Inbox className="size-4" />} label="Open items" route={{ page: 'inbox' }} active={is('inbox')} count={findingsOpen + pending} tone="bad" />
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">Areas</div>
          <div className="space-y-0.5">
            {wp.areas.map((a) => {
              const def = AREAS.find((x) => x.id === a.id)!;
              const reopened = Object.values(a.signoffs).some((s) => s.state === 'reopened');
              const allSigned = Object.values(a.signoffs).every((s) => s.state === 'signed');
              const dot = a.findingsOpen ? 'bg-bad' : reopened ? 'bg-warn' : allSigned ? 'bg-ok' : a.signoffs.reviewer.state === 'signed' ? 'bg-ok/60' : 'bg-line-2';
              const active = route.page === 'area' && route.id === a.id;
              return (
                <button key={a.id} type="button" onClick={() => go({ page: 'area', id: a.id })} aria-current={active ? 'page' : undefined}
                  className={cx('flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-sm', active ? 'bg-panel font-medium text-fg shadow-1' : 'text-fg-2 hover:bg-sunk hover:text-fg')}>
                  <span className={cx('ml-1 size-2 shrink-0 rounded-full', dot)} />
                  <span className="flex-1 truncate text-left">{def.short}</span>
                  {a.findingsOpen > 0 && <span className="num text-cap text-bad">{a.findingsOpen}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">Evidence</div>
          <div className="space-y-0.5">
            <Item icon={<FileStack className="size-4" />} label="Documents" route={{ page: 'documents' }} active={is('documents')} count={docsWaiting} tone="warn" />
            <Item icon={<ListChecks className="size-4" />} label="Checks" route={{ page: 'checks' }} active={is('checks')} />
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">Return</div>
          <div className="space-y-0.5">
            <Item icon={<GitCompareArrows className="size-4" />} label="Changes" route={{ page: 'changes', tab: 'ledger' }} active={is('changes')} count={pending} tone="warn" />
            <Item icon={<Library className="size-4" />} label="Records" route={{ page: 'records' }} active={is('records')} />
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">People</div>
          <div className="space-y-0.5">
            <Item icon={<BadgeCheck className="size-4" />} label="Review & sign-off" route={{ page: 'review' }} active={is('review')} />
            <Item icon={<Users className="size-4" />} label="Client" route={{ page: 'client' }} active={is('client')} count={qOpen} />
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">Filing and after</div>
          <div className="space-y-0.5">
            <Item icon={<Send className="size-4" />} label="Filing" route={{ page: 'filing' }} active={is('filing')} />
            <Item icon={<Activity className="size-4" />} label="Activity" route={{ page: 'activity' }} active={is('activity')} />
          </div>
        </div>
        <div className="space-y-0.5">
          <Item icon={me.role === 'firm_administrator' ? <Building2 className="size-4" /> : <Landmark className="size-4" />} label="Firm" route={{ page: 'firm' }} active={is('firm')} />
        </div>
      </div>
    </nav>
  );
}
