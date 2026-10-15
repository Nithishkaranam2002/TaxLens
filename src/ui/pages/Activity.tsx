import { Download, FileInput, History, Search, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { revert } from '../../app/actions';
import { FINAL, store, useApp, useMe, useWorkpaper } from '../../app/store';
import { canonical, hash53 } from '../../engine/events';
import { date, dateTime, plural } from '../format';
import { Avatar, Badge, Button, Card, Checkbox, Empty, Input, PageHead, Select, cx } from '../kit';
import { download, useNow } from './common';
import { QUIET, describe } from './describe';
import { firmDay, firmEndOfDay } from '../../engine/time';

interface Row { id: string; at: string; actor: string | null; text: string; kind: string; ref?: string; tone?: string; reverted: boolean; packet: boolean; canUndo: boolean; batch?: string }

export function ActivityPage() {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const all = useApp((s) => s.events);
  const viewAsOf = useApp((s) => s.viewAsOf);
  const me = useMe();
  const now = useNow();
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [packet, setPacket] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const [day, setDay] = useState(firmDay(viewAsOf ?? now));

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const e of all) {
      if (e.at > wp.asOf || e.type === 'revert' || e.type === 'revert.batch') continue;
      if (!quiet && QUIET.has(e.type)) continue;
      const d = describe(e, ix, all, actors);
      const filing = FINAL.has(e.type);
      out.push({ id: e.id, at: e.at, actor: e.actor, text: d.text, kind: d.kind, ref: d.ref, tone: d.tone, reverted: wp.state.reverted.has(e.id), packet: false, canUndo: !filing && !viewAsOf && (e.actor === me.id || me.role === 'partner') && me.role !== 'client', batch: e.batch });
    }
    for (const e of all) {
      if (e.at > wp.asOf || (e.type !== 'revert' && e.type !== 'revert.batch')) continue;
      out.push({ id: e.id, at: e.at, actor: e.actor, ...describe(e, ix, all, actors), reverted: wp.state.reverted.has(e.id), packet: false, canUndo: false });
    }
    if (packet) {
      for (const d of ix.packet.documents) if (d.received_at <= wp.asOf) out.push({ id: `pk-${d.id}`, at: d.received_at, actor: null, text: `${d.uploaded_by === 'client' ? 'Client uploaded' : 'Firm added'} ${d.id} · ${d.title}`, kind: 'Document', ref: `doc:${d.id}#page1`, reverted: false, packet: true, canUndo: false });
      for (const v of ix.packet.return_versions) if (v.computed_at <= wp.asOf) out.push({ id: `pk-${v.version}`, at: v.computed_at, actor: null, text: `Engine ${v.version} computed: ${v.trigger}`, kind: 'Engine', reverted: false, packet: true, canUndo: false });
      for (const m of ix.packet.client.messages) if (m.sent_at <= wp.asOf) out.push({ id: `pk-${m.id}`, at: m.sent_at, actor: null, text: `${m.from}: “${m.text}”`, kind: 'Client message', ref: m.id, reverted: false, packet: true, canUndo: false });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [all, wp, ix, actors, me, packet, quiet, viewAsOf]);

  const kinds = [...new Set(rows.map((r) => r.kind))].sort();
  const shown = rows.filter((r) => (who === 'all' || r.actor === who || (who === 'packet' && r.packet)) && (kind === 'all' || r.kind === kind) && (!q.trim() || r.text.toLowerCase().includes(q.trim().toLowerCase())));
  const logHash = useMemo(() => hash53(canonical(all.map((e) => [e.id, e.at, e.actor, e.type, e.payload]))), [all]);
  const people = new Set(all.map((e) => e.actor));
  const byDay = new Map<string, Row[]>();
  for (const r of shown.slice(0, 600)) { const k = firmDay(r.at); byDay.set(k, [...(byDay.get(k) ?? []), r]); }

  return (
    <div>
      <PageHead eyebrow="Filing and after" title="Activity" sub="The workpaper is an append-only log. Every action by every person, with nothing edited or deleted: undo adds a reversing entry. Look at the whole file as it stood on any day."
        right={<>
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => download(`taxlens-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ packetSha256: ix.sha256, exported: new Date().toISOString(), events: all }, null, 2))}>Export log</Button>
        </>} />
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card><div className="text-sm text-fg-3">Actions recorded</div><div className="num text-xl font-semibold">{all.length.toLocaleString('en-US')}</div><div className="text-sm text-fg-3">by {plural(people.size, 'person', 'people')} · {wp.state.reverted.size} undone</div></Card>
        <Card><div className="text-sm text-fg-3">Log fingerprint</div><div className="mono text-md font-semibold">{logHash}</div><div className="text-sm text-fg-3">Changes if any entry is altered</div></Card>
        <Card>
          <div className="flex items-center gap-1.5 text-sm text-fg-3"><History className="size-3.5" />Look at the workpaper on a day</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Input type="date" value={day} min="2026-01-12" max={firmDay(now)} onChange={(e) => setDay(e.target.value)} className="w-40" />
            <Button size="sm" variant="primary" onClick={() => { const t = firmEndOfDay(day); store.setView(t >= now ? null : t); }}>View</Button>
            {viewAsOf && <Button size="sm" variant="ghost" onClick={() => store.setView(null)}>Back to now</Button>}
          </div>
        </Card>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={who} onChange={setWho} options={[{ id: 'all', label: 'Everyone' }, { id: 'packet', label: 'Packet (documents, engine)' }, ...actors.filter((a) => people.has(a.id)).map((a) => ({ id: a.id, label: a.name }))]} className="w-56" />
        <Select value={kind} onChange={setKind} options={[{ id: 'all', label: 'All kinds' }, ...kinds.map((k) => ({ id: k, label: k }))]} className="w-44" />
        <Checkbox checked={packet} onChange={setPacket} label="Packet events" />
        <Checkbox checked={quiet} onChange={setQuiet} label="Clock and bookkeeping" />
        <div className="relative ml-auto w-60"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the log" className="pl-8" aria-label="Search the log" /></div>
      </div>
      {shown.length === 0 ? <Empty title="Nothing recorded yet" icon={<FileInput className="size-5" />}>Actions appear here as people work. Load the recorded season from the Firm page to see a full one.</Empty> : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([d, list]) => (
            <section key={d}>
              <div className="eyebrow sticky top-[52px] z-10 -mx-1 mb-1.5 bg-bg/95 px-1 py-1 backdrop-blur">{date(d)}</div>
              <Card pad={false}>
                <ul className="divide-y divide-line">
                  {list.map((r) => {
                    const a = actors.find((x) => x.id === r.actor);
                    return (
                      <li key={r.id} className={cx('flex items-start gap-3 px-4 py-2', r.reverted && 'opacity-50')}>
                        {r.packet ? <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sunk text-cap font-semibold text-fg-3">PK</span> : <Avatar actor={a} size={28} />}
                        <button type="button" disabled={!r.ref} onClick={() => r.ref && store.open(r.ref)} className="min-w-0 flex-1 text-left text-base enabled:hover:underline">
                          {!r.packet && <span className="font-medium">{a?.name.split(' ')[0]} </span>}
                          <span className={cx(r.reverted && 'line-through', r.tone === 'bad' && 'text-bad', r.tone === 'ok' && '')}>{r.text}</span>
                        </button>
                        <Badge tone="outline" className="hidden sm:inline-flex">{r.kind}</Badge>
                        <span className="num w-16 shrink-0 text-right text-cap text-fg-3">{dateTime(r.at).split(' · ')[1]}</span>
                        {r.canUndo && !r.reverted ? (
                          <button type="button" title={r.batch ? 'Undo this group' : 'Undo'} onClick={() => { const ev = all.find((e) => e.id === r.id); if (ev) store.run((x) => revert(x, ev, 'Undone from the activity log'), { undoable: false }); }} className="text-fg-3 hover:text-fg"><Undo2 className="size-3.5" /></button>
                        ) : <span className="w-3.5" />}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          {shown.length > 600 && <p className="text-sm text-fg-3">Showing the latest 600 of {shown.length}. Narrow with the filters.</p>}
        </div>
      )}
    </div>
  );
}
