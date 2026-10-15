import { useSyncExternalStore } from 'react';
import { PacketIndex, sha256Hex } from '../data/index';
import type { Packet } from '../data/packet';
import { type CheckResult, runChecks } from '../engine/checks';
import { type AnyEvent, eventOrder, isoSeconds } from '../engine/events';
import { type FixDef, buildFixes } from '../engine/fixes';
import { type Actor, buildActors } from '../engine/people';
import { type Workpaper, buildWorkpaper } from '../engine/workpaper';
import type { ActCtx, Result } from './actions';
import * as persist from './persist';
import { type Route, parseHash, routeToHash } from './route';

export const DEFAULT_CLOCK = '2026-07-01T14:00:00Z';

/** Events that cannot be undone: what was filed, sent, signed or seen stays on the record. */
export const FINAL = new Set(['freeze', 'efile.result', 'efile.transmit', 'client.approve', 'pii.reveal', 'clock.set', 'notice.respond', 'amend.file', 'seen', 'workspace.load']);

export interface Toast { id: number; text: string; tone: 'ok' | 'error' | 'info'; undo?: AnyEvent[]; rule?: boolean }

export interface Presence { tab: string; actor: string; page: string; at: number }

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  ix: PacketIndex | null;
  packetText: string | null;
  fixes: FixDef[];
  fixMap: Map<string, FixDef>;
  actors: Actor[];
  events: AnyEvent[];
  me: string;
  viewAsOf: string | null;
  route: Route;
  toasts: Toast[];
  drawer: string[];
  mode: 'local' | 'shared';
  workspace: string;
  presence: Presence[];
  storageOk: boolean;
  tick: number;
  welcomed: boolean;
  theme: 'system' | 'light' | 'dark';
}

type Listener = () => void;
const TAB = Math.random().toString(36).slice(2, 8);

class Store {
  s: AppState = {
    status: 'loading', error: null, ix: null, packetText: null, fixes: [], fixMap: new Map(), actors: [], events: [], me: 'st-01',
    viewAsOf: null, route: { page: 'overview' }, toasts: [], drawer: [], mode: 'local', workspace: 'main', presence: [], storageOk: true, tick: 0,
    welcomed: false, theme: 'system',
  };
  private listeners = new Set<Listener>();
  private chan: ReturnType<typeof persist.channel> | null = null;
  private checksCache = new Map<string, CheckResult[]>();
  private wpCache: { key: string; wp: Workpaper } | null = null;
  private cursor = 0;
  private epoch: string | null = null;
  private toastSeq = 0;

  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  get = () => this.s;
  private set(patch: Partial<AppState>) { this.s = { ...this.s, ...patch }; for (const l of this.listeners) l(); }

  async init(packetUrl = 'packet.json') {
    try {
      const ws = (() => { try { return new URLSearchParams(location.search).get('ws') || 'main'; } catch { return 'main'; } })();
      const res = await fetch(packetUrl);
      if (!res.ok) throw new Error(`Could not load the packet (${res.status}).`);
      const text = await res.text();
      await this.openPacket(text, ws);
      this.startSync();
      window.addEventListener('hashchange', () => this.set({ route: parseHash(location.hash) ?? this.s.route }));
      setInterval(() => this.set({ tick: this.s.tick + 1 }), 30000);
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  async openPacket(text: string, ws: string) {
    const packet = JSON.parse(text) as Packet;
    validatePacket(packet);
    const sha = await sha256Hex(text);
    const ix = new PacketIndex(packet, sha);
    const fixes = buildFixes(ix);
    const actors = buildActors(packet);
    const events = persist.loadLocal(ws).sort(eventOrder);
    const me = persist.session<string>('me', 'st-01');
    const route = (() => { try { return parseHash(location.hash); } catch { return null; } })() ?? { page: 'overview' as const };
    this.checksCache.clear();
    this.wpCache = null;
    this.set({
      status: 'ready', ix, packetText: text, fixes, fixMap: new Map(fixes.map((f) => [f.id, f])), actors, events, me: actors.some((a) => a.id === me) ? me : 'st-01',
      workspace: ws, route, welcomed: persist.session<boolean>('welcomed', false) || events.length > 0, theme: persist.pref('theme', 'system'),
    });
  }

  // ---------- clock ----------
  /** Season clock: the latest clock.set (or the default) advanced by real time elapsed since it was set. */
  now(): string {
    const sets = this.s.events.filter((e) => e.type === 'clock.set');
    const last = sets[sets.length - 1];
    const baseAt = last ? (last.payload as { to: string }).to : DEFAULT_CLOCK;
    const baseReal = last ? Date.parse(last.real) : Date.parse(this.s.events.find((e) => e.type === 'workspace.load')?.real ?? new Date().toISOString());
    const latestEvent = this.s.events.length ? this.s.events[this.s.events.length - 1].at : baseAt;
    const elapsed = Math.max(0, Math.min(Date.now() - baseReal, 6 * 3600 * 1000));
    const t = Date.parse(baseAt) + elapsed;
    const latest = Date.parse(latestEvent);
    return isoSeconds(t > latest ? t : latest + 1000);
  }

  asOf(): string { return this.s.viewAsOf ?? this.now(); }

  // ---------- derived ----------
  checks(asOf: string): CheckResult[] {
    const ix = this.s.ix!;
    const v = ix.versionAsOf(asOf)?.version ?? 'none';
    const docs = ix.packet.documents.filter((d) => d.received_at <= asOf).length;
    const msgs = ix.packet.client.messages.filter((m) => m.sent_at <= asOf).length;
    const tr = ix.packet.tax_agency_records.irs_account_transcript_2025.filter((t) => t.as_of <= asOf.slice(0, 10)).length;
    const key = `${v}|${docs}|${msgs}|${tr}`;
    let c = this.checksCache.get(key);
    if (!c) { c = runChecks(ix, asOf, this.s.fixes); this.checksCache.set(key, c); }
    return c;
  }

  workpaper(): Workpaper {
    const asOf = this.asOf();
    const ix = this.s.ix!;
    const checks = this.checks(asOf);
    const last = this.s.events[this.s.events.length - 1];
    const minute = asOf.slice(0, 16);
    const key = `${this.s.events.length}|${last?.id ?? ''}|${minute}|${checks.length}|${this.s.viewAsOf ?? ''}`;
    if (this.wpCache?.key === key) return this.wpCache.wp;
    const wp = buildWorkpaper({ ix, fixes: this.s.fixes, actors: this.s.actors, events: this.s.events, asOf, checks });
    this.wpCache = { key, wp };
    return wp;
  }

  /** The workpaper as it stood at another moment (for comparisons; not cached). */
  workpaperAt(asOf: string): Workpaper {
    return buildWorkpaper({ ix: this.s.ix!, fixes: this.s.fixes, actors: this.s.actors, events: this.s.events, asOf, checks: this.checks(asOf) });
  }

  actor(id = this.s.me): Actor { return this.s.actors.find((a) => a.id === id) ?? this.s.actors[0]; }

  ctx(actorId?: string): ActCtx {
    return { ix: this.s.ix!, fixes: this.s.fixMap, actors: this.s.actors, wp: this.workpaper(), me: this.actor(actorId), now: this.now() };
  }

  // ---------- acting ----------
  run(fn: (x: ActCtx) => Result, opts: { quiet?: boolean; actor?: string; undoable?: boolean } = {}): Result {
    if (this.s.viewAsOf) {
      const r: Result = { ok: false, rule: 'You are looking at the past. Return to now to make changes.' };
      this.toast(r.rule, 'error', undefined, true);
      return r;
    }
    const r = fn(this.ctx(opts.actor));
    if (!r.ok) { this.toast(r.rule, 'error', undefined, true); return r; }
    this.append(r.events);
    const final = r.events.some((e) => FINAL.has(e.type));
    if (!opts.quiet && r.message) this.toast(r.message, 'ok', opts.undoable === false || final ? undefined : r.events);
    return r;
  }

  append(evs: AnyEvent[], broadcast = true) {
    if (!evs.length) return;
    const ids = new Set(this.s.events.map((e) => e.id));
    const fresh = evs.filter((e) => !ids.has(e.id));
    if (!fresh.length) return;
    const events = [...this.s.events, ...fresh].sort(eventOrder);
    const ok = persist.saveLocal(this.s.workspace, events);
    this.set({ events, storageOk: ok });
    if (broadcast) {
      this.chan?.post({ type: 'events', ws: this.s.workspace, events: fresh });
      if (this.s.mode === 'shared') void this.push(fresh);
    }
  }

  private async push(evs: AnyEvent[]) {
    const r = await persist.serverPush(this.s.workspace, evs, this.epoch);
    if (r === 'reset') this.adoptServerReset();
  }

  /** Someone reset the shared workspace: drop the local copy and pull the new epoch from the start. */
  private adoptServerReset() {
    this.epoch = null;
    this.cursor = 0;
    this.wpCache = null;
    persist.clearLocal(this.s.workspace);
    this.set({ events: [], viewAsOf: null, drawer: [] });
    this.toast('This shared workspace was reset by someone else.', 'info');
  }

  replaceAll(events: AnyEvent[]) {
    const sorted = [...events].sort(eventOrder);
    const ok = persist.saveLocal(this.s.workspace, sorted);
    this.wpCache = null;
    this.set({ events: sorted, storageOk: ok });
  }

  async reset() {
    persist.clearLocal(this.s.workspace);
    if (this.s.mode === 'shared') await persist.serverReset(this.s.workspace);
    this.chan?.post({ type: 'reset', ws: this.s.workspace });
    this.cursor = 0;
    this.epoch = null;
    this.wpCache = null;
    this.set({ events: [], viewAsOf: null, drawer: [] });
  }

  /** Replace the log with the recorded season (built by running the firm's actions through its rules). */
  async loadSeason(as = 'st-02') {
    const { buildSeason } = await import('./season');
    const ix = this.s.ix!;
    const events = buildSeason({ ix, fixes: this.s.fixes, actors: this.s.actors, checks: (asOf) => this.checks(asOf) });
    await this.reset();
    this.append(events);
    persist.setSession('me', as);
    this.set({ me: as, drawer: [], viewAsOf: null });
    this.welcome();
    this.go({ page: 'overview' });
    this.toast(`Recorded season loaded: ${events.length} actions by ${new Set(events.map((e) => e.actor)).size} people. You are ${this.actor(as).name}.`, 'info');
  }

  /** Import a log exported from another browser (Firm → Data). */
  importLog(events: AnyEvent[]) {
    if (!Array.isArray(events) || events.some((e) => !e || typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.at !== 'string')) throw new Error('This file is not a Tickmark activity log.');
    this.replaceAll(events);
    this.chan?.post({ type: 'events', ws: this.s.workspace, events });
    if (this.s.mode === 'shared') void this.push(events);
  }

  // ---------- ui state ----------
  setMe(id: string) {
    if (id === this.s.me) return;
    persist.setSession('me', id);
    this.set({ me: id, drawer: [] });
    this.toast(`You are now ${this.actor(id).name} (${this.actor(id).roleLabel}).`, 'info');
    this.announce();
  }
  setView(asOf: string | null) { this.wpCache = null; this.set({ viewAsOf: asOf }); }
  go(route: Route) {
    this.set({ route, drawer: [] });
    try { history.replaceState(null, '', routeToHash(route)); } catch { /* sandboxed */ }
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
    this.announce();
  }
  open(ref: string) { this.set({ drawer: [...this.s.drawer.filter((r) => r !== ref), ref] }); }
  back() { this.set({ drawer: this.s.drawer.slice(0, -1) }); }
  closeDrawer() { this.set({ drawer: [] }); }
  welcome() { persist.setSession('welcomed', true); this.set({ welcomed: true }); }
  setTheme(t: AppState['theme']) { persist.setPref('theme', t); this.set({ theme: t }); }

  toast(text: string, tone: Toast['tone'] = 'ok', undo?: AnyEvent[], rule = false) {
    const id = ++this.toastSeq;
    this.set({ toasts: [...this.s.toasts.slice(-2), { id, text, tone, undo, rule }] });
    setTimeout(() => this.set({ toasts: this.s.toasts.filter((t) => t.id !== id) }), tone === 'error' ? 9000 : 6500);
  }
  dismissToast(id: number) { this.set({ toasts: this.s.toasts.filter((t) => t.id !== id) }); }

  // ---------- sync ----------
  private announce() {
    this.chan?.post({ type: 'presence', ws: this.s.workspace, tab: TAB, actor: this.s.me, page: this.s.route.page, at: Date.now() });
  }

  private startSync() {
    this.chan = persist.channel((m) => {
      if (m.ws !== this.s.workspace) return;
      if (m.type === 'events') this.append(m.events, false);
      else if (m.type === 'reset') { this.wpCache = null; this.set({ events: [], viewAsOf: null }); }
      else if (m.type === 'presence') {
        const others = this.s.presence.filter((p) => p.tab !== m.tab && Date.now() - p.at < 60000);
        this.set({ presence: [...others, { tab: m.tab, actor: m.actor, page: m.page, at: m.at }] });
      }
    });
    this.announce();
    setInterval(() => this.announce(), 20000);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.endsWith(':events') && e.key.includes(`:${this.s.workspace}:`)) {
        const local = persist.loadLocal(this.s.workspace);
        if (local.length !== this.s.events.length) this.replaceAll(local);
      }
    });
    void this.tryServer();
  }

  private async tryServer() {
    const st = await persist.serverStatus(this.s.workspace);
    if (!st.db) return;
    this.set({ mode: 'shared' });
    const pull = async () => {
      const r = await persist.serverPull(this.s.workspace, this.cursor);
      if (!r) return;
      if (this.epoch && r.epoch !== this.epoch) { this.adoptServerReset(); return; }
      this.epoch = r.epoch;
      this.cursor = r.cursor;
      if (r.events.length) this.append(r.events, false);
    };
    // Push anything this browser has that the server does not.
    const first = await persist.serverPull(this.s.workspace, 0);
    if (first) {
      this.epoch = first.epoch;
      const serverIds = new Set(first.events.map((e) => e.id));
      const mine = this.s.events.filter((e) => !serverIds.has(e.id));
      if (mine.length) await persist.serverPush(this.s.workspace, mine, this.epoch);
      this.cursor = first.cursor;
      this.append(first.events, false);
    }
    window.setInterval(() => void pull(), 2500);
  }
}

export const store = new Store();

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

/** The workpaper for the time being viewed. Recomputed only when the log or the clock minute changes. */
export function useWorkpaper(): Workpaper {
  useApp((s) => s.events);
  useApp((s) => s.viewAsOf);
  useApp((s) => s.tick);
  return store.workpaper();
}

export function useMe(): Actor {
  const me = useApp((s) => s.me);
  useApp((s) => s.actors);
  return store.actor(me);
}

function validatePacket(p: Packet) {
  const need = ['documents', 'extracted_values', 'return_versions', 'household', 'firm', 'prior_years', 'tax_agency_records', 'timeline', 'engine_reference'] as const;
  for (const k of need) if (!(k in p)) throw new Error(`The packet is missing "${k}".`);
  if (!Array.isArray(p.documents) || !p.documents.length) throw new Error('The packet has no documents.');
  if (!p.return_versions.length) throw new Error('The packet has no return versions.');
}
