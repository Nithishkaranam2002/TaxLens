// Optional shared activity log for a workspace (Vercel Function + Postgres, e.g. Neon).
//
//   GET    /api/events?ws=main&status=1   → { db, epoch, count }
//   GET    /api/events?ws=main&after=42   → { events, cursor, epoch }   (events after the cursor, in order)
//   POST   /api/events?ws=main            ← { events, epoch? }          (idempotent by event id)
//   DELETE /api/events?ws=main            → { ok, epoch }               (start a new epoch; old rows are kept)
//
// Without DATABASE_URL every call answers { db: false } and the app keeps its log in the browser.
// The log is append-only: rows are never updated or deleted, so the server is as auditable as the client.

import { neon } from '@neondatabase/serverless';

export type Rows = Record<string, unknown>[];
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Rows>;
export interface Reply { status: number; body: unknown }

const WS = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BATCH = 2000;

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql`create table if not exists tm_workspaces (ws text primary key, epoch text not null, created_at timestamptz not null default now())`;
  await sql`create table if not exists tm_events (seq bigserial primary key, ws text not null, epoch text not null, id text not null, at text not null, actor text not null, type text not null, body jsonb not null, received_at timestamptz not null default now(), unique (ws, epoch, id))`;
  await sql`create index if not exists tm_events_ws_epoch_seq on tm_events (ws, epoch, seq)`;
}

const newEpoch = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function epochOf(sql: Sql, ws: string): Promise<string> {
  await sql`insert into tm_workspaces (ws, epoch) values (${ws}, ${newEpoch()}) on conflict (ws) do nothing`;
  const r = await sql`select epoch from tm_workspaces where ws = ${ws}`;
  return String(r[0].epoch);
}

function validEvent(e: unknown): e is { id: string; at: string; actor: string; type: string } {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  return typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 80 && typeof x.at === 'string' && x.at.length <= 40
    && typeof x.actor === 'string' && x.actor.length <= 40 && typeof x.type === 'string' && x.type.length <= 40 && 'payload' in x;
}

/** The API's logic, independent of the HTTP host so it can be tested against an in-process Postgres. */
export async function handle(sql: Sql | null, method: string, query: Record<string, string | undefined>, body: unknown): Promise<Reply> {
  if (!sql) return { status: 200, body: { db: false } };
  const ws = query.ws ?? 'main';
  if (!WS.test(ws)) return { status: 400, body: { error: 'Workspace names use letters, digits, - and _ (at most 64).' } };
  await ensureSchema(sql);
  const epoch = await epochOf(sql, ws);

  if (method === 'GET') {
    if (query.status) {
      const r = await sql`select count(*)::int as n from tm_events where ws = ${ws} and epoch = ${epoch}`;
      return { status: 200, body: { db: true, epoch, count: Number(r[0].n) } };
    }
    const after = Math.max(0, Number.parseInt(query.after ?? '0', 10) || 0);
    const rows = await sql`select seq, body from tm_events where ws = ${ws} and epoch = ${epoch} and seq > ${after} order by seq limit ${MAX_BATCH}`;
    const cursor = rows.length ? Number(rows[rows.length - 1].seq) : after;
    return { status: 200, body: { events: rows.map((r) => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body)), cursor, epoch } };
  }

  if (method === 'POST') {
    const b = (typeof body === 'string' ? JSON.parse(body) : body) as { events?: unknown; epoch?: string } | null;
    if (b?.epoch && b.epoch !== epoch) return { status: 409, body: { error: 'This workspace was reset.', epoch } };
    const events = Array.isArray(b?.events) ? b!.events : null;
    if (!events) return { status: 400, body: { error: 'Send { events: [...] }.' } };
    if (events.length > MAX_BATCH) return { status: 413, body: { error: `At most ${MAX_BATCH} events per request.` } };
    if (!events.every(validEvent)) return { status: 400, body: { error: 'Each event needs id, at, actor, type and payload.' } };
    if (!events.length) return { status: 200, body: { ok: true, inserted: 0, epoch } };
    // One statement for the whole batch, inserted in the order sent; ids already stored are skipped.
    const r = await sql`insert into tm_events (ws, epoch, id, at, actor, type, body)
      select ${ws}, ${epoch}, t.e->>'id', t.e->>'at', t.e->>'actor', t.e->>'type', t.e
      from jsonb_array_elements(${JSON.stringify(events)}::jsonb) with ordinality as t(e, n)
      order by t.n
      on conflict (ws, epoch, id) do nothing returning seq`;
    return { status: 200, body: { ok: true, inserted: r.length, epoch } };
  }

  if (method === 'DELETE') {
    const next = newEpoch();
    await sql`update tm_workspaces set epoch = ${next} where ws = ${ws}`;
    return { status: 200, body: { ok: true, epoch: next } };
  }

  return { status: 405, body: { error: 'Use GET, POST or DELETE.' } };
}

// ---- Vercel Node.js function
interface VercelReq { method?: string; query: Record<string, string | string[] | undefined>; body?: unknown }
interface VercelRes { status: (n: number) => VercelRes; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  res.setHeader('cache-control', 'no-store');
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const sql: Sql | null = url ? (neon(url) as unknown as Sql) : null;
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) query[k] = Array.isArray(v) ? v[0] : v;
  try {
    const r = await handle(sql, (req.method ?? 'GET').toUpperCase(), query, req.body);
    res.status(r.status).json(r.body);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
  }
}
