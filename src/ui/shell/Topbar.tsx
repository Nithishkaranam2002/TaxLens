import { Bell, CalendarClock, Check, Cloud, HardDrive, History, Menu as MenuIcon, Moon, Search, Sun, SunMoon } from 'lucide-react';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import type { Actor } from '../../engine/people';
import { notificationsFor } from '../../app/notify';
import { date, dateTime } from '../format';
import { Avatar, Badge, IconButton, Kbd, Menu, MenuItem, cx } from '../kit';

const TITLES: Record<string, string> = {
  overview: 'Overview', inbox: 'Open items', area: 'Area', documents: 'Documents', checks: 'Checks', changes: 'Changes', records: 'Records',
  review: 'Review & sign-off', client: 'Client', filing: 'Filing and after', activity: 'Activity', firm: 'Firm',
};

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const route = useApp((s) => s.route);
  const viewAsOf = useApp((s) => s.viewAsOf);
  const mode = useApp((s) => s.mode);
  const presence = useApp((s) => s.presence);
  const theme = useApp((s) => s.theme);
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const wp = useWorkpaper();
  const now = store.now();
  const notes = notificationsFor(wp, me, actors);
  const others = presence.filter((p) => Date.now() - p.at < 60000);

  return (
    <header className="sticky z-30 flex h-14 items-center gap-2 border-b border-line bg-panel px-3 md:gap-2.5 md:px-6" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <IconButton label="Menu" className="lg:hidden" onClick={onMenu}><MenuIcon className="size-5" /></IconButton>
      <div className="min-w-0 flex-1 truncate text-md font-semibold">
        {route.page === 'area' ? wp.areas.find((a) => a.id === route.id)?.name : TITLES[route.page]}
      </div>

      {me.role !== 'client' && <>
      <button type="button" onClick={onSearch} className="hidden h-10 w-64 items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 text-sm text-fg-3 transition-colors hover:border-line-2 md:flex xl:w-80">
        <Search className="size-4" />
        <span className="flex-1 truncate text-left whitespace-nowrap">Find a number, document or person</span>
        <Kbd>⌘K</Kbd>
      </button>
      <IconButton label="Search" className="md:hidden" onClick={onSearch}><Search className="size-[18px]" /></IconButton>

      <Menu width={300} trigger={() => (
        <button type="button" className={cx('flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium', viewAsOf ? 'border-warn bg-warn-bg text-warn' : 'border-line bg-panel text-fg-2 hover:border-line-2')} title="Season clock" aria-label="Season clock">
          {viewAsOf ? <History className="size-4" /> : <CalendarClock className="size-4" />}
          <span className="num hidden sm:inline">{date(viewAsOf ?? now)}</span>
        </button>
      )}>
        {(close) => (
          <div className="p-2">
            <div className="eyebrow mb-1">Season clock</div>
            <p className="mb-2 text-sm text-fg-2">Now in the season: <b>{dateTime(now)}</b>. Look back to see the workpaper exactly as it stood on an earlier day.</p>
            {[['2026-03-04T12:00:00Z', 'First engine run (v1)'], ['2026-03-20T12:00:00Z', 'After the corrected Meridian 1099 (v2)'], ['2026-04-09T12:00:00Z', 'After review'], ['2026-06-24T12:00:00Z', 'After the Ridgeline K-1 (v3)']].map(([d, l]) => (
              <MenuItem key={d} onClick={() => { store.setView(d < now ? d : null); close(); }} active={viewAsOf === d}>
                <History className="size-3.5 text-fg-3" /><span className="flex-1">{l}</span><span className="num text-cap text-fg-3">{date(d, false)}</span>
              </MenuItem>
            ))}
            <div className="my-1 border-t border-line" />
            <MenuItem onClick={() => { store.setView(null); close(); }} active={!viewAsOf}><Check className={cx('size-3.5', viewAsOf ? 'opacity-0' : '')} />Now</MenuItem>
            <MenuItem onClick={() => { store.go({ page: 'activity' }); close(); }}><History className="size-3.5 text-fg-3" />Replay any moment on the timeline…</MenuItem>
          </div>
        )}
      </Menu>
      </>}

      {me.role !== 'client' && (
      <span title={mode === 'shared' ? 'Live: everyone with this workspace link sees changes as they happen' : 'Saved in this browser and shared live between its tabs'}
        className="hidden size-9 items-center justify-center rounded-lg text-fg-3 sm:flex" aria-label={mode === 'shared' ? 'Live workspace' : 'Saved in this browser'}>
        {mode === 'shared' ? <span className="relative flex"><Cloud className="size-[18px] text-ok" /><span className="live-dot absolute -top-0.5 -right-0.5 size-2 rounded-full bg-ok" /></span> : <HardDrive className="size-[18px]" />}
      </span>
      )}

      {others.length > 0 && (
        <div className="hidden items-center -space-x-1.5 sm:flex" title="Also working on this file in other tabs">
          {others.slice(0, 4).map((p) => <Avatar key={p.tab} actor={actors.find((a) => a.id === p.actor)} ring size={22} />)}
        </div>
      )}

      <Menu width={340} trigger={() => (
        <IconButton label="Notifications" className="relative">
          <Bell className="size-[18px]" />
          {notes.length > 0 && <span className="num absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-cap leading-none font-semibold text-white">{notes.length}</span>}
        </IconButton>
      )}>
        {(close) => (
          <div className="p-1">
            <div className="eyebrow px-2 pt-1 pb-1.5">For {me.name.split(' ')[0]}</div>
            {notes.length === 0 && <div className="px-2 pb-2 text-sm text-fg-3">Nothing needs you right now.</div>}
            {notes.map((n, i) => (
              <MenuItem key={i} onClick={() => { n.go(); close(); }}>
                <span className={cx('mt-1 size-1.5 shrink-0 self-start rounded-full', n.tone === 'bad' ? 'bg-bad' : n.tone === 'warn' ? 'bg-warn' : 'bg-info')} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{n.title}</span><span className="block truncate text-sm text-fg-3">{n.detail}</span></span>
              </MenuItem>
            ))}
          </div>
        )}
      </Menu>

      <IconButton label={`Theme: ${theme}`} onClick={() => store.setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}>
        {theme === 'dark' ? <Moon className="size-[18px]" /> : theme === 'light' ? <Sun className="size-[18px]" /> : <SunMoon className="size-[18px]" />}
      </IconButton>

      <RoleSwitcher me={me} actors={actors} />
    </header>
  );
}

export function RoleSwitcher({ me, actors }: { me: Actor; actors: Actor[] }) {
  const now = store.now();
  return (
    <Menu width={330} trigger={(open) => (
      <button type="button" className={cx('flex h-10 items-center gap-2.5 rounded-lg border pr-3 pl-1.5 text-left', open ? 'border-line-2 bg-panel-2' : 'border-line bg-panel hover:border-line-2')} aria-label="Switch person">
        <Avatar actor={me} size={28} />
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-semibold">{me.name}</span>
          <span className="block text-cap text-fg-3">{me.roleLabel}{me.credential ? `, ${me.credential}` : ''}</span>
        </span>
      </button>
    )}>
      {(close) => (
        <div className="p-1">
          <div className="px-2 pt-1 pb-2 text-sm text-fg-3">Each browser tab is one person. Open a second tab and pick someone else to work side by side; changes appear in both.</div>
          {actors.map((a) => {
            const inactive = a.role !== 'client' && now.slice(0, 10) < a.activeFrom;
            return (
              <MenuItem key={a.id} onClick={() => { store.setMe(a.id); close(); }} active={a.id === me.id}>
                <Avatar actor={a} size={24} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-cap text-fg-3">{a.roleLabel}{a.credential ? `, ${a.credential}` : ''}{!a.clearance && a.role !== 'client' ? ' · no sensitive-data clearance' : ''}</span>
                </span>
                {inactive && <Badge tone="neutral">from {date(a.activeFrom)}</Badge>}
                {a.id === me.id && <Check className="size-3.5" />}
              </MenuItem>
            );
          })}
        </div>
      )}
    </Menu>
  );
}
