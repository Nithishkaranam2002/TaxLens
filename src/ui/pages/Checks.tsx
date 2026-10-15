import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { store, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import { GROUP_ORDER } from '../../engine/checks';
import { Card, Empty, Input, PageHead, SectionHead, Segmented, StatusPill, cx } from '../kit';
import { date } from '../format';
import { Stat } from './common';

export function Checks({ focus }: { focus?: string }) {
  const wp = useWorkpaper();
  const [status, setStatus] = useState<'all' | 'attention' | 'pass'>('attention');
  const [q, setQ] = useState('');
  useEffect(() => { if (focus) store.open(`check:${focus}`); }, [focus]);
  const fstat = (id: string) => wp.findings.find((f) => f.check.id === id)?.status;
  const rows = wp.checks.filter((c) => {
    const fs = fstat(c.id);
    if (status === 'attention' && (c.status === 'pass' || c.status === 'info' || fs === 'resolved' || fs === 'closed')) return false;
    if (status === 'pass' && !(c.status === 'pass' || c.status === 'info' || fs === 'resolved' || fs === 'closed')) return false;
    return !q.trim() || `${c.id} ${c.title} ${c.summary} ${c.question}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  const n = (s: string) => wp.checks.filter((c) => c.status === s).length;
  const resolved = wp.findings.filter((f) => f.status === 'resolved' || f.status === 'closed').length;

  return (
    <div>
      <PageHead eyebrow="Evidence" title="Checks"
        sub="Independent of the engine. They rebuild numbers from the printed pages, agency records, the prior year and the client's answers, then compare. A failure names its evidence and, where the documents decide it, a correction with its exact tax effect." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Checks run" value={wp.checks.length} sub={`as of ${date(wp.asOf)}`} />
        <Stat label="Pass" value={n('pass') + n('info')} tone="ok" />
        <Stat label="Errors found" value={n('fail')} tone={n('fail') ? 'bad' : 'ok'} onClick={() => setStatus('attention')} />
        <Stat label="Need a conclusion" value={n('review')} tone={n('review') ? 'warn' : 'ok'} />
        <Stat label="Resolved or closed" value={`${resolved} of ${wp.findings.length}`} sub="by approved changes or dispositions" onClick={() => setStatus('pass')} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={setStatus} options={[{ id: 'attention', label: 'Need attention' }, { id: 'pass', label: 'Pass or resolved' }, { id: 'all', label: 'All' }]} />
        <div className="relative ml-auto w-60"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a check" className="pl-8" aria-label="Find a check" /></div>
      </div>
      {rows.length === 0 ? <Empty title="Nothing here">{status === 'attention' ? 'Every check passes or its finding is resolved.' : 'No checks match.'}</Empty> : (
        <div className="space-y-6">
          {GROUP_ORDER.map((g) => {
            const list = rows.filter((c) => c.group === g);
            if (!list.length) return null;
            return (
              <section key={g}>
                <SectionHead title={g} />
                <Card pad={false}>
                  <ul className="divide-y divide-line">
                    {list.map((c) => {
                      const fs = fstat(c.id);
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => store.open(`check:${c.id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2">
                            <div className="flex w-[92px] shrink-0 flex-col items-start gap-1">
                              <StatusPill status={c.status} />
                              {fs && fs !== 'open' && <StatusPill status={fs} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-[13.5px] font-medium">{c.title}</span><span className="mono text-[11px] text-fg-3">{c.id}</span></div>
                              <div className="text-[12.5px] text-fg-3">{c.question}</div>
                              <div className={cx('mt-1 text-[12.5px]', c.status === 'fail' ? 'text-fg' : 'text-fg-2')}>{c.summary}</div>
                            </div>
                            <div className="hidden w-28 shrink-0 text-right text-[12px] text-fg-3 sm:block">
                              <div>{AREA[c.area].short}</div>
                              {c.scanned ? <div className="num">{c.scanned.toLocaleString('en-US')} scanned</div> : null}
                              {c.fixes.length > 0 && <div>{c.fixes.length} correction{c.fixes.length > 1 ? 's' : ''}</div>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
