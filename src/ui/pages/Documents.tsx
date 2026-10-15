import { AlertTriangle, Search } from 'lucide-react';
import { useState } from 'react';
import { store, useApp, useWorkpaper } from '../../app/store';
import { AREA, AREAS } from '../../engine/areas';
import type { DocDisposition } from '../../engine/workpaper';
import { date, plural } from '../format';
import { Badge, Checkbox, Empty, Input, PageHead, Select, StatusPill, cx } from '../kit';
import { RefChip } from '../Ref';
import { Stat } from './common';

const GROUPS: { id: string; label: string; match: (d: DocDisposition) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'used', label: 'Lands on the return', match: (d) => d === 'used' },
  { id: 'supporting', label: 'Supporting', match: (d) => d === 'supporting' },
  { id: 'replaced', label: 'Duplicate or superseded', match: (d) => d === 'duplicate' || d === 'superseded' },
  { id: 'file', label: 'Engagement, identity, prior year, agency', match: (d) => ['engagement', 'identity', 'prior-year', 'agency'].includes(d) },
  { id: 'waiting', label: 'Not yet received', match: (d) => d === 'waiting' },
];

export function Documents() {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const [group, setGroup] = useState('all');
  const [area, setArea] = useState('all');
  const [q, setQ] = useState('');
  const [problems, setProblems] = useState(false);
  const g = GROUPS.find((x) => x.id === group)!;
  const rows = wp.docs.filter((d) => g.match(d.disposition) && (area === 'all' || d.area === area) && (!problems || d.problems > 0)
    && (!q.trim() || `${d.doc.id} ${d.doc.title} ${d.doc.issuer} ${d.doc.file_name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const received = wp.docs.filter((d) => d.received);
  const values = received.reduce((s, d) => s + d.evCount, 0);
  const flagged = received.reduce((s, d) => s + d.problems, 0);

  return (
    <div>
      <PageHead eyebrow="Evidence" title="Documents" sub={`Every document is accounted for: where its values landed on the return, or why they did not. Click one to open it with each value it gave the return highlighted on the page.`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Received" value={`${received.length} of ${wp.docs.length}`} sub={`${wp.docs.length - received.length} later in the season`} />
        <Stat label="Land on the return" value={wp.docs.filter((d) => d.disposition === 'used').length} sub="through their values" onClick={() => setGroup('used')} />
        <Stat label="Supporting only" value={wp.docs.filter((d) => d.disposition === 'supporting').length} sub="evidence for a check or change" onClick={() => setGroup('supporting')} />
        <Stat label="Values read" value={values.toLocaleString('en-US')} sub="from the received pages" />
        <Stat label="Values to look at" value={flagged} tone={flagged ? 'warn' : 'ok'} sub="re-read differs from the page" onClick={() => setProblems(true)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((x) => {
            const n = wp.docs.filter((d) => x.match(d.disposition)).length;
            return (
              <button key={x.id} type="button" onClick={() => setGroup(x.id)} className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px]', group === x.id ? 'border-fg bg-fg text-bg' : 'border-line-2 bg-panel text-fg-2 hover:border-fg-3')}>
                {x.label}<span className={cx('num text-[11px]', group === x.id ? 'opacity-80' : 'text-fg-3')}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Checkbox checked={problems} onChange={setProblems} label="Only with values to look at" />
          <Select value={area} onChange={setArea} options={[{ id: 'all', label: 'All areas' }, ...AREAS.map((a) => ({ id: a.id, label: a.short }))]} className="w-40" />
          <div className="relative w-52"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, issuer or D-number" className="pl-8" aria-label="Find a document" /></div>
        </div>
      </div>

      {rows.length === 0 ? <Empty title="No documents match" /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] tracking-wide text-fg-3 uppercase">
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Document</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Received</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-right font-semibold">Values</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Accounted for</th>
                <th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Lands on</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.doc.id} onClick={() => d.received && store.open(`doc:${d.doc.id}#page1`)} className={cx('align-top', d.received ? 'cursor-pointer hover:bg-panel-2' : 'opacity-60')}>
                  <td className="border-b border-line px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="mono mt-0.5 rounded bg-sunk px-1 text-[10.5px] text-fg-2">{d.doc.id}</span>
                      <div className="min-w-0">
                        <div className="font-medium">{d.doc.title}</div>
                        <div className="text-[12px] text-fg-3">{d.doc.issuer} · {plural(d.doc.page_count, 'page')} · <button type="button" className="hover:underline" onClick={(e) => { e.stopPropagation(); store.go({ page: 'area', id: d.area }); }}>{AREA[d.area].short}</button></div>
                        <div className="mt-1 flex flex-wrap gap-1">{d.flags.map((f) => <Badge key={f} tone={f === 'Corrected' ? 'info' : f === 'Late' ? 'warn' : 'neutral'}>{f}</Badge>)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-line px-3 py-2 whitespace-nowrap text-[12.5px]">
                    <div>{date(d.doc.received_at)}</div>
                    <div className="text-[12px] text-fg-3">{d.doc.uploaded_by === 'client' ? 'Client upload' : 'Firm'}</div>
                  </td>
                  <td className="border-b border-line px-3 py-2 text-right">
                    <div className="num">{d.evCount || '—'}</div>
                    {d.problems > 0 && <div className="inline-flex items-center gap-1 text-[12px] text-warn"><AlertTriangle className="size-3" />{d.problems}</div>}
                  </td>
                  <td className="border-b border-line px-3 py-2">
                    <StatusPill status={d.disposition} />
                    <div className="mt-1 max-w-[320px] text-[12.5px] text-fg-2">{d.reason}</div>
                    {d.doc.extraction.reason && <div className="mt-0.5 max-w-[320px] text-[12px] text-fg-3">{d.doc.extraction.reason}</div>}
                  </td>
                  <td className="border-b border-line px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {d.lines.slice(0, 4).map((l) => <RefChip key={l} r={l} />)}
                      {d.lines.length > 4 && <span className="text-[11px] text-fg-3">+{d.lines.length - 4}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[12px] text-fg-3">Pages are rendered from the packet's printed text ({ix.packet.documents.reduce((s, d) => s + d.pages.length, 0)} pages). An original scan can be attached to any page; the highlights then sit on the scan at the packet's recorded positions.</p>
    </div>
  );
}
