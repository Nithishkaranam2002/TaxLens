// Where the activity log lives. Always in the browser (localStorage, shared live across tabs with
// BroadcastChannel). Optionally also on the server (/api/events with Postgres), so a workspace link
// can be shared across devices. Files people attach live in IndexedDB.

import type { AnyEvent } from '../engine/events';

const LS_KEY = (ws: string) => `tickmark:v1:${ws}:events`;

export function loadLocal(ws: string): AnyEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY(ws));
    return raw ? (JSON.parse(raw) as AnyEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveLocal(ws: string, events: AnyEvent[]): boolean {
  try {
    localStorage.setItem(LS_KEY(ws), JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(ws: string) {
  try { localStorage.removeItem(LS_KEY(ws)); } catch { /* storage unavailable */ }
}

export function session<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(`tickmark:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function setSession(key: string, v: unknown) {
  try { sessionStorage.setItem(`tickmark:${key}`, JSON.stringify(v)); } catch { /* ignore */ }
}
export function pref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`tickmark:pref:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function setPref(key: string, v: unknown) {
  try { localStorage.setItem(`tickmark:pref:${key}`, JSON.stringify(v)); } catch { /* ignore */ }
}

// ---------- live sync between tabs ----------
export type SyncMessage =
  | { type: 'events'; ws: string; events: AnyEvent[] }
  | { type: 'reset'; ws: string }
  | { type: 'presence'; ws: string; tab: string; actor: string; page: string; at: number };

export function channel(onMessage: (m: SyncMessage) => void): { post: (m: SyncMessage) => void; close: () => void } {
  try {
    const bc = new BroadcastChannel('tickmark');
    bc.onmessage = (e) => onMessage(e.data as SyncMessage);
    return { post: (m) => { try { bc.postMessage(m); } catch { /* ignore */ } }, close: () => bc.close() };
  } catch {
    return { post: () => undefined, close: () => undefined };
  }
}

// ---------- optional shared server log ----------
export interface ServerStatus { db: boolean; epoch?: string; count?: number }

export async function serverStatus(ws: string): Promise<ServerStatus> {
  try {
    const r = await fetch(`api/events?ws=${encodeURIComponent(ws)}&status=1`, { headers: { accept: 'application/json' } });
    if (!r.ok) return { db: false };
    const j = (await r.json()) as ServerStatus;
    return typeof j.db === 'boolean' ? j : { db: false };
  } catch {
    return { db: false };
  }
}

export async function serverPull(ws: string, after: number): Promise<{ events: AnyEvent[]; cursor: number; epoch: string } | null> {
  try {
    const r = await fetch(`api/events?ws=${encodeURIComponent(ws)}&after=${after}`);
    if (!r.ok) return null;
    return (await r.json()) as { events: AnyEvent[]; cursor: number; epoch: string };
  } catch {
    return null;
  }
}

/** Push events to the shared log. Returns 'reset' when the workspace was reset since this tab last pulled. */
export async function serverPush(ws: string, events: AnyEvent[], epoch?: string | null): Promise<boolean | 'reset'> {
  try {
    const r = await fetch(`api/events?ws=${encodeURIComponent(ws)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events, epoch: epoch ?? undefined }) });
    if (r.status === 409) return 'reset';
    return r.ok;
  } catch {
    return false;
  }
}

export async function serverReset(ws: string): Promise<boolean> {
  try {
    const r = await fetch(`api/events?ws=${encodeURIComponent(ws)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------- attached files (IndexedDB) ----------
const DB = 'tickmark-files';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}
export async function putFile(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(blob, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}
export async function getFile(id: string): Promise<Blob | null> {
  try {
    const db = await idb();
    return await new Promise<Blob | null>((res) => {
      const tx = db.transaction('files', 'readonly');
      const r = tx.objectStore('files').get(id);
      r.onsuccess = () => res((r.result as Blob) ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
