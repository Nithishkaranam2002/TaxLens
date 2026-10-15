import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { type Sql, handle } from '../api/events';

const db = new PGlite();
const sql: Sql = async (strings, ...values) => (await db.sql(strings, ...values)).rows as Record<string, unknown>[];
const ev = (id: string, at: string) => ({ id, at, real: at, actor: 'st-01', type: 'verify', payload: { target: 'F1040.1a', method: 'recalculated', note: '', evidence: [] } });

describe('shared activity log API', () => {
  it('answers db:false without a database', async () => {
    expect((await handle(null, 'GET', { ws: 'main', status: '1' }, null)).body).toEqual({ db: false });
  });

  it('appends events once, in order, and pages with a cursor', async () => {
    const s = await handle(sql, 'GET', { ws: 'w1', status: '1' }, null);
    expect(s.body).toMatchObject({ db: true, count: 0 });
    const epoch = (s.body as { epoch: string }).epoch;
    const p1 = await handle(sql, 'POST', { ws: 'w1' }, { events: [ev('a', '2026-03-09T15:00:00Z'), ev('b', '2026-03-09T15:01:00Z')], epoch });
    expect(p1.body).toMatchObject({ ok: true, inserted: 2 });
    const p2 = await handle(sql, 'POST', { ws: 'w1' }, { events: [ev('b', '2026-03-09T15:01:00Z'), ev('c', '2026-03-09T15:02:00Z')], epoch });
    expect(p2.body).toMatchObject({ inserted: 1 });
    const all = (await handle(sql, 'GET', { ws: 'w1', after: '0' }, null)).body as { events: { id: string }[]; cursor: number };
    expect(all.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    const more = (await handle(sql, 'GET', { ws: 'w1', after: String(all.cursor) }, null)).body as { events: unknown[] };
    expect(more.events).toEqual([]);
  });

  it('keeps workspaces apart and refuses bad input', async () => {
    expect(((await handle(sql, 'GET', { ws: 'w2', after: '0' }, null)).body as { events: unknown[] }).events).toEqual([]);
    expect((await handle(sql, 'GET', { ws: 'bad name!' }, null)).status).toBe(400);
    expect((await handle(sql, 'POST', { ws: 'w2' }, { events: [{ id: 'x' }] })).status).toBe(400);
  });

  it('a reset starts a new epoch; stale writers are told so', async () => {
    const before = ((await handle(sql, 'GET', { ws: 'w1', status: '1' }, null)).body as { epoch: string }).epoch;
    const r = (await handle(sql, 'DELETE', { ws: 'w1' }, null)).body as { epoch: string };
    expect(r.epoch).not.toBe(before);
    expect(((await handle(sql, 'GET', { ws: 'w1', after: '0' }, null)).body as { events: unknown[] }).events).toEqual([]);
    expect((await handle(sql, 'POST', { ws: 'w1' }, { events: [ev('d', '2026-03-10T15:00:00Z')], epoch: before })).status).toBe(409);
  });
});
