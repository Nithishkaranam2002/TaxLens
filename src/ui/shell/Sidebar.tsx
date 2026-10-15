import {
  Activity, BadgeCheck, Building2, ClipboardList, FileStack, Gauge, GitCompareArrows, Inbox, Landmark, Library, ListChecks, Send, Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Route } from '../../app/route';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREAS } from '../../engine/areas';
import { cx } from '../kit';
import { Logo } from './Logo';

const itemCls = (active: boolean) => cx(
  'relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
  active ? 'bg-panel font-semibold text-fg shadow-1 before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-fg' : 'text-fg-2 hover:bg-sunk hover:text-fg',
);

function Item({ icon, label, route, count, tone, active, onNavigate }: { icon: ReactNode; label: string; route: Route; count?: number; tone?: 'bad' | 'neutral'; active: boolean; onNavigate?: () => void }) {
  return (
    <button type="button" onClick={() => { store.go(route); onNavigate?.(); }} aria-current={active ? 'page' : undefined} className={itemCls(active)}>
      <span className={cx('shrink-0 [&_svg]:size-[18px]', active ? 'text-fg' : 'text-fg-3')}>{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cx('num min-w-6 rounded-full px-1.5 text-center text-cap font-semibold', tone === 'bad' ? 'bg-bad text-white' : 'bg-sunk text-fg-2')}>{count}</span>
      )}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2.5 text-cap font-semibold text-fg-3">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** A small ring for the share of firm steps met. */
function Ring({ value, max }: { value: number; max: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const pct = max ? value / max : 0;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--line)" strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke={pct >= 1 ? 'var(--ok)' : 'var(--fg-2)'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
    </svg>
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
  const is = (p: Route['page']) => route.page === p;
  const filed = !!wp.state.frozen;
  const stepsMet = wp.steps.filter((s) => s.met).length;
  const nav = { onNavigate };

  if (isClient) {
    return (
      <nav className="flex h-full flex-col gap-1 p-4" onClick={onNavigate}>
        <Logo />
        <div className="mt-5 mb-3 rounded-xl border border-line bg-panel p-4">
          <div className="text-base font-semibold">{ix.engagement.filers}</div>
          <div className="text-sm text-fg-3">{ix.engagement.year} tax return · {ix.packet.firm.name}</div>
        </div>
        <Item icon={<ClipboardList />} label="Your return" route={{ page: 'client' }} active={is('client')} count={qOpen} />
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col px-3 pt-4 pb-3">
      <Logo />
      <button type="button" onClick={() => { store.go({ page: 'overview' }); onNavigate?.(); }} className="mt-5 mb-5 rounded-xl border border-line bg-panel p-3.5 text-left transition-colors hover:border-line-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-base font-semibold">{ix.engagement.fileName}</div>
          <span className="mono text-cap text-fg-3">{ix.packet.packet.client_id}</span>
        </div>
        <div className="text-sm text-fg-3">{ix.engagement.year} · {ix.engagement.filingStatusShort} · {ix.engagement.forms}</div>
        <div className="mt-3 flex items-center gap-2 text-sm" title={`${stepsMet} of ${wp.steps.length} firm steps met`}>
          <Ring value={filed ? 1 : stepsMet} max={filed ? 1 : wp.steps.length} />
          <span className={cx('font-medium', filed || !open ? 'text-ok' : 'text-fg-2')}>{filed ? 'Filed and frozen' : open ? `${open} items before filing` : 'Ready to file'}</span>
        </div>
      </button>

      <div className="-mx-1 flex-1 space-y-5 overflow-y-auto px-1 pb-2 scroll-thin">
        <Group label="Work">
          <Item icon={<Gauge />} label="Overview" route={{ page: 'overview' }} active={is('overview')} {...nav} />
          <Item icon={<Inbox />} label="Open items" route={{ page: 'inbox' }} active={is('inbox')} count={findingsOpen + pending} tone="bad" {...nav} />
        </Group>
        <Group label="Areas">
          {wp.areas.map((a) => {
            const def = AREAS.find((x) => x.id === a.id)!;
            const reopened = Object.values(a.signoffs).some((s) => s.state === 'reopened');
            const allSigned = Object.values(a.signoffs).every((s) => s.state === 'signed');
            const dot = a.findingsOpen ? 'bg-bad' : reopened ? 'bg-warn' : allSigned ? 'bg-ok' : a.signoffs.reviewer.state === 'signed' ? 'bg-ok/60' : 'bg-line-2';
            const state = a.findingsOpen ? `${a.findingsOpen} open` : reopened ? 'sign-off reopened' : allSigned ? 'signed' : 'in progress';
            const active = route.page === 'area' && route.id === a.id;
            return (
              <button key={a.id} type="button" onClick={() => { store.go({ page: 'area', id: a.id }); onNavigate?.(); }} aria-current={active ? 'page' : undefined}
                title={`${def.name}: ${state}`} className={itemCls(active)}>
                <span className="flex size-[18px] shrink-0 items-center justify-center"><span className={cx('size-2 rounded-full', dot)} /></span>
                <span className="flex-1 truncate text-left">{def.short}</span>
                {a.findingsOpen > 0 && <span className="num text-cap font-semibold text-bad">{a.findingsOpen}</span>}
              </button>
            );
          })}
        </Group>
        <Group label="Evidence">
          <Item icon={<FileStack />} label="Documents" route={{ page: 'documents' }} active={is('documents')} count={docsWaiting} {...nav} />
          <Item icon={<ListChecks />} label="Checks" route={{ page: 'checks' }} active={is('checks')} {...nav} />
        </Group>
        <Group label="Return">
          <Item icon={<GitCompareArrows />} label="Changes" route={{ page: 'changes', tab: 'ledger' }} active={is('changes')} count={pending} {...nav} />
          <Item icon={<Library />} label="Records" route={{ page: 'records' }} active={is('records')} {...nav} />
        </Group>
        <Group label="People">
          <Item icon={<BadgeCheck />} label="Review & sign-off" route={{ page: 'review' }} active={is('review')} {...nav} />
          <Item icon={<Users />} label="Client" route={{ page: 'client' }} active={is('client')} count={qOpen} {...nav} />
        </Group>
        <Group label="Filing and after">
          <Item icon={<Send />} label="Filing" route={{ page: 'filing' }} active={is('filing')} {...nav} />
          <Item icon={<Activity />} label="Activity" route={{ page: 'activity' }} active={is('activity')} {...nav} />
        </Group>
        <div className="border-t border-line pt-3">
          <Item icon={me.role === 'firm_administrator' ? <Building2 /> : <Landmark />} label="Firm" route={{ page: 'firm' }} active={is('firm')} {...nav} />
        </div>
      </div>
    </nav>
  );
}
