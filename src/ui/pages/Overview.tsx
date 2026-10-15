import { ArrowRight, Bell, CheckCheck, ChevronDown, Clock3, Eye, FileClock, History, Info, Sparkles } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { markSeen } from '../../app/actions';
import { notificationsFor } from '../../app/notify';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import type { Summary } from '../../engine/recompute';
import type { AreaStatus, Workpaper } from '../../engine/workpaper';
import { ago, date, hours, money, plural, signed } from '../format';
import { Avatar, Badge, Button, Card, Disclosure, Empty, Meter, PageHead, cx } from '../kit';
import { QUIET, describe } from './describe';
import { AreaLink, LineRows, SignDots, StepIcon, outcome, useFirstRun, useNow } from './common';

export function Overview() {
  const firstRun = useFirstRun();
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const now = useNow();
  const p = ix.packet;
  const eng = ix.engagement;
  const filed = !!wp.state.frozen;
  const pending = wp.proposals.filter((x) => x.status === 'proposed');
  const approved = wp.proposals.filter((x) => x.status === 'approved');

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow={<>{eng.year} · Form {eng.forms.replace('CA ', 'California ')} · {eng.filingStatus} · {p.packet.client_id}</>}
        title={eng.filers}
        sub={<>{eng.move ? `${eng.move} ` : ''}Two W-2 jobs, a design studio, two rentals and a condo sale, three brokerages and crypto, two K-1s, a Swedish account. Engine {wp.version?.version ?? '—'} computed {wp.version ? date(wp.version.computed_at) : '—'}.</>}
        right={filed ? <Badge tone="ok" dot>Filed and frozen {date(wp.state.frozen!.at)}</Badge> : <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={() => store.go({ page: 'inbox' })}>{wp.blockers.length ? `${plural(wp.blockers.length, 'item')} before filing` : 'Ready to file'}</Button>}
      />

      {!wp.version ? (
        <Empty icon={<FileClock />} title="No engine output yet" action={<Button onClick={() => store.setView(null)}>Return to now</Button>}>The first engine run is on {firstRun}. Move the season clock forward or return to now.</Empty>
      ) : (
        <section aria-label="Results" className="space-y-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <ResultCard title="Federal" engine={wp.summary.engine!.federal} ours={wp.summary.ours!.federal} projected={pending.length ? wp.summary.projected!.federal : null} taxKey="F1040.24" balKey={wp.summary.ours!.federal.balanceDue > 0 ? 'F1040.37' : 'F1040.34'} penaltyKey="F1040.38" />
            <ResultCard title="California" engine={wp.summary.engine!.california} ours={wp.summary.ours!.california} projected={pending.length ? wp.summary.projected!.california : null} taxKey="F540NR.64" balKey="F540NR.97" penaltyKey="FTB5805.penalty" />
          </div>
          <p className="max-w-[110ch] text-sm text-fg-3">
            “Ours” is the engine's return with the {plural(approved.length, 'approved change')} applied, rebuilt line by line by TaxLens's independent recompute, which reproduces every engine run to the dollar.
            {pending.length > 0 && <> {plural(pending.length, 'more change')} {pending.length === 1 ? 'is' : 'are'} proposed and shown only as a projection until approved.</>}
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:gap-6">
        <PathToFiling wp={wp} />
        <div className="space-y-8">
          <NeedsYou />
          <SinceLastLooked now={now} />
        </div>
      </div>

      <AreasTable wp={wp} />

      <div className="space-y-3">
        {wp.ours && (
          <Disclosure title="Return summary against last year" sub={`${eng.year - 1} as filed by ${eng.priorPreparer}, the engine's current run, and ours.`}
            right={<Button size="sm" variant="ghost" onClick={() => store.go({ page: 'records', tab: 'summary' })}>All records</Button>}>
            <div className="p-3 sm:p-4">
              <LineRows wp={wp} dense prior={p.prior_years.return_2024.lines} emphasize={['F1040.11', 'F1040.15', 'F1040.24']}
                keys={['F1040.1a', 'F1040.7', 'F1040.8', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.23', 'F1040.24', 'F1040.33']} />
            </div>
          </Disclosure>
        )}
        {me.role !== 'client' && <People wp={wp} />}
      </div>
    </div>
  );
}

function ResultCard({ title, engine, ours, projected, taxKey, balKey, penaltyKey }: { title: string; engine: Summary['federal'] | Summary['california']; ours: Summary['federal'] | Summary['california']; projected: Summary['federal'] | Summary['california'] | null; taxKey: string; balKey: string; penaltyKey: string }) {
  const o = outcome(ours);
  const e = outcome(engine);
  const pr = projected ? outcome(projected) : null;
  const diff = ours.totalTax - engine.totalTax;
  const same = e.kind === o.kind && e.amount === o.amount;
  const label = (x: ReturnType<typeof outcome>) => (x.kind === 'refund' ? 'Refund' : x.kind === 'owe' ? 'Balance due' : 'Even');
  return (
    <Card className="flex flex-col" pad={false}>
      <div className="flex-1 px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md font-semibold">{title}</h2>
          <span className="text-sm text-fg-3">{label(o)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-cap text-fg-3">Ours</div>
            <button type="button" onClick={() => store.open(balKey)} title={`Show how ${balKey} was built`}
              className={cx('num proof text-display font-semibold tracking-[-0.02em]', o.kind === 'refund' ? 'text-ok' : 'text-fg')}>{money(o.amount)}</button>
          </div>
          <div className="pb-1.5">
            <div className="text-cap text-fg-3">Engine as delivered</div>
            {same
              ? <div className="text-base text-fg-3">No approved changes yet</div>
              : <div className="num text-xl text-fg-3 line-through decoration-fg-3/60 decoration-2">{label(e)} {money(e.amount)}</div>}
          </div>
        </div>
        <div className="mt-2 text-sm text-fg-2">{o.detail}</div>
        {pr && (pr.kind !== o.kind || pr.amount !== o.amount) && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
            <Info className="size-4 shrink-0" />
            <span>If pending changes are approved: <span className="num font-semibold">{label(pr)} {money(pr.amount)}</span></span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 border-t border-line">
        <Cell label="Total tax" v={<button type="button" className="num proof font-semibold" onClick={() => store.open(taxKey)}>{money(ours.totalTax)}</button>} sub={diff ? <span className={diff < 0 ? 'text-ok' : 'text-bad'}>{signed(diff)} vs engine</span> : 'same as engine'} />
        <Cell label="Payments" v={<span className="num font-semibold">{money(ours.payments)}</span>} sub={ours.payments !== engine.payments ? <span className="text-bad">{signed(ours.payments - engine.payments)} vs engine</span> : 'same as engine'} />
        <Cell label="Penalty" v={<button type="button" className="num proof font-semibold" onClick={() => store.open(penaltyKey)}>{money(ours.penalty)}</button>} sub={ours.penalty !== engine.penalty ? `${signed(ours.penalty - engine.penalty)} vs engine` : 'same as engine'} />
      </div>
    </Card>
  );
}

function Cell({ label, v, sub }: { label: string; v: ReactNode; sub: ReactNode }) {
  return (
    <div className="min-w-0 border-r border-line px-4 py-3.5 last:border-r-0 sm:px-6">
      <div className="text-cap text-fg-3">{label}</div>
      <div className="mt-0.5 text-md">{v}</div>
      <div className="text-cap text-fg-3">{sub}</div>
    </div>
  );
}

type StepRow = { label: string; detail: string; state: 'done' | 'open' | 'blocked' | 'na'; go: () => void };

function PathToFiling({ wp }: { wp: Workpaper }) {
  const [showDone, setShowDone] = useState(false);
  const received = wp.docs.filter((d) => d.received).length;
  const waiting = wp.docs.filter((d) => !d.received && d.doc.received_at < '2027-01-01').length;
  const blockingFindings = wp.findings.filter((f) => f.blocking);
  const openF = blockingFindings.filter((f) => f.status === 'open').length;
  const pending = wp.proposals.filter((p) => p.status === 'proposed').length;
  const notes = [...wp.state.notes.values()].filter((n) => n.status === 'open' && n.blocking).length;
  const judg = wp.blockers.filter((b) => b.kind.startsWith('Judgment')).length;
  const steps = wp.steps.filter((s) => !s.met && !['Reviewer sign-off', 'Partner sign-off', 'Client approval and e-file authorization'].includes(s.id));
  const signedAreas = wp.areas.filter((a) => a.signoffs.preparer.state === 'signed' && a.signoffs.reviewer.state === 'signed').length;
  const reopened = wp.areas.filter((a) => Object.values(a.signoffs).some((s) => s.state === 'reopened')).length;
  const partner = wp.steps.find((s) => s.id === 'Partner sign-off')!;
  const accepted = wp.state.results.filter((r) => r.status === 'accepted');
  const rows: StepRow[] = [
    { label: 'Documents received and accounted for', detail: `${received} received, each with a disposition${waiting ? ` · ${waiting} still to come` : ''}`, state: 'done', go: () => store.go({ page: 'documents' }) },
    { label: 'Findings resolved', detail: blockingFindings.length ? `${openF} open · ${blockingFindings.length - openF} proposed or waiting` : 'All findings resolved or closed', state: openF ? 'blocked' : blockingFindings.length ? 'open' : 'done', go: () => store.go({ page: 'inbox' }) },
    { label: 'Changes approved', detail: pending ? `${plural(pending, 'change')} waiting for a reviewer or the partner` : `${wp.proposals.filter((p) => p.status === 'approved').length} approved`, state: pending ? 'open' : 'done', go: () => store.go({ page: 'changes', tab: 'ledger' }) },
    { label: 'Review notes cleared', detail: notes ? `${plural(notes, 'blocking note')} open` : 'None open', state: notes ? 'blocked' : 'done', go: () => store.go({ page: 'review', tab: 'notes' }) },
    { label: 'Judgment calls recorded', detail: judg ? `${judg} to record or approve` : 'All recorded with authority', state: judg ? 'open' : 'done', go: () => store.go({ page: 'review', tab: 'judgments' }) },
    { label: 'Firm steps', detail: steps.length ? `${steps.length} left: ${steps.slice(0, 2).map((s) => s.id.toLowerCase()).join(', ')}${steps.length > 2 ? '…' : ''}` : 'All required steps met', state: steps.length ? 'open' : 'done', go: () => store.go({ page: 'review', tab: 'steps' }) },
    { label: 'Area sign-offs', detail: `${signedAreas} of ${wp.areas.length} areas signed by preparer and reviewer${reopened ? ` · ${reopened} reopened by later changes` : ''}`, state: signedAreas === wp.areas.length ? 'done' : reopened ? 'blocked' : 'open', go: () => store.go({ page: 'review', tab: 'signoffs' }) },
    { label: 'Partner sign-off on the return', detail: partner.how, state: partner.met ? 'done' : 'na', go: () => store.go({ page: 'review', tab: 'signoffs' }) },
    { label: 'Client approval and Form 8879', detail: wp.clientApprovalState === 'current' ? 'Approved; signatures current' : wp.clientApprovalState === 'lapsed' ? 'Lapsed: amounts changed after approval' : 'Not yet', state: wp.clientApprovalState === 'current' ? 'done' : wp.clientApprovalState === 'lapsed' ? 'blocked' : 'na', go: () => store.go({ page: 'client' }) },
    { label: 'E-filed and accepted', detail: wp.state.frozen ? `Accepted: ${accepted.map((r) => (r.jurisdiction === 'federal' ? 'IRS' : 'FTB')).join(' and ')}` : wp.state.results.some((r) => r.status === 'rejected') ? 'Rejected — see Filing' : 'Not filed', state: wp.state.frozen ? 'done' : wp.state.results.some((r) => r.status === 'rejected') ? 'blocked' : 'na', go: () => store.go({ page: 'filing' }) },
  ];
  const done = rows.filter((r) => r.state === 'done').length;
  const shown = showDone ? rows : rows.filter((r) => r.state !== 'done');
  return (
    <Card pad={false} title="Path to filing" sub="What stands between this file and an accepted return. Each step opens the place to act."
      action={<span className="num text-sm font-medium text-fg-2">{done} of {rows.length} done</span>}>
      <div className="px-4 pt-1 sm:px-5"><Meter value={done} max={rows.length} tone={done === rows.length ? 'ok' : 'neutral'} /></div>
      <ol className="mt-2">
        {shown.map((r) => (
          <li key={r.label}>
            <button type="button" onClick={r.go} className="group flex w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-panel-2 sm:px-5">
              <StepIcon state={r.state} />
              <span className="min-w-0 flex-1">
                <span className={cx('block text-base font-medium', r.state === 'done' && 'text-fg-2')}>{r.label}</span>
                <span className="block truncate text-sm text-fg-3">{r.detail}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ol>
      {done > 0 && (
        <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-medium text-fg-2 hover:bg-panel-2">
          <ChevronDown className={cx('size-4 transition-transform', showDone && 'rotate-180')} />{showDone ? 'Hide completed steps' : `Show ${plural(done, 'completed step')}`}
        </button>
      )}
    </Card>
  );
}

/** One status per area, the most pressing; the rest is plain text. */
function areaStatus(a: AreaStatus): { tone: 'bad' | 'info' | 'warn' | 'neutral' | 'ok'; text: string; more: string[] } {
  const parts: { tone: 'bad' | 'info' | 'warn' | 'neutral'; text: string }[] = [];
  if (a.findingsOpen > 0) parts.push({ tone: 'bad', text: plural(a.findingsOpen, 'finding') });
  if (a.proposalsPending > 0) parts.push({ tone: 'info', text: `${a.proposalsPending} to approve` });
  if (a.notesOpen > 0) parts.push({ tone: 'warn', text: plural(a.notesOpen, 'note') });
  if (a.questionsOpen > 0) parts.push({ tone: 'neutral', text: `${a.questionsOpen} asked` });
  if (!a.findingsOpen && !a.proposalsPending && !a.notesOpen) return { tone: 'ok', text: 'Nothing open', more: parts.map((p) => p.text) };
  return { tone: parts[0].tone, text: parts[0].text, more: parts.slice(1).map((p) => p.text) };
}

function AreasTable({ wp }: { wp: Workpaper }) {
  return (
    <Card pad={false} title="Areas" sub="Each area has its own findings, changes and sign-offs. A sign-off reopens when anything in its area changes.">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr className="text-left text-cap text-fg-3">
              <th className="px-4 py-2 font-semibold sm:px-5">Area</th>
              <th className="px-3 py-2 font-semibold">Sign-offs</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 text-right font-semibold sm:px-5">Hours</th>
            </tr>
          </thead>
          <tbody>
            {wp.areas.map((a) => {
              const def = AREA[a.id];
              const budget = a.budgetHours ? a.budgetHours * 60 : 0;
              const st = areaStatus(a);
              return (
                <tr key={a.id} onClick={() => store.go({ page: 'area', id: a.id })} className="cursor-pointer border-t border-line hover:bg-panel-2">
                  <td className="px-4 py-2.5 sm:px-5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); store.go({ page: 'area', id: a.id }); }} className="text-left text-base font-medium whitespace-nowrap hover:underline">{def.name}</button>
                    <div className="text-sm text-fg-3">{[a.lines.length ? plural(a.lines.length, 'line') : '', a.docs.length ? plural(a.docs.length, 'document') : ''].filter(Boolean).join(' · ') || 'Computed from the other areas'}</div>
                  </td>
                  <td className="px-3 py-2.5"><SignDots a={a} size="sm" /></td>
                  <td className="px-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className={cx('size-2 shrink-0 rounded-full', st.tone === 'bad' ? 'bg-bad' : st.tone === 'info' ? 'bg-info' : st.tone === 'warn' ? 'bg-warn' : st.tone === 'ok' ? 'bg-ok' : 'bg-fg-3')} />
                      <span className={cx(st.tone === 'ok' ? 'text-fg-2' : 'font-medium text-fg')}>{st.text}</span>
                    </span>
                    {st.more.length > 0 && <div className="pl-4 text-cap whitespace-nowrap text-fg-3">{st.more.join(' · ')}</div>}
                  </td>
                  <td className="px-4 py-2.5 sm:px-5">
                    {budget > 0 ? (
                      <div className="ml-auto flex w-36 items-center gap-2 text-sm text-fg-3">
                        <Clock3 className="size-3.5 shrink-0" />
                        <Meter value={a.minutes} max={budget} tone={a.minutes > budget ? 'bad' : a.minutes > budget * 0.8 ? 'warn' : 'neutral'} className="flex-1" />
                        <span className="num whitespace-nowrap">{hours(a.minutes)} / {a.budgetHours}</span>
                      </div>
                    ) : <div className="text-right text-sm text-fg-3">—</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NeedsYou() {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const [all, setAll] = useState(false);
  const items = notificationsFor(wp, me, actors);
  const shown = all ? items : items.slice(0, 5);
  return (
    <Card pad={false} title={<span className="inline-flex items-center gap-2"><Bell className="size-4 text-fg-3" />Needs you{items.length > 0 && <span className="num rounded-full bg-sunk px-2 text-cap text-fg-2">{items.length}</span>}</span>}
      sub={`Work waiting for ${me.name.split(' ')[0]} (${me.roleLabel.toLowerCase()}).`}>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-ok-bg text-ok"><CheckCheck className="size-5" /></span>
          <div className="text-base font-medium">Nothing is waiting for you</div>
          {me.role === 'preparer' && <Button size="sm" onClick={() => store.go({ page: 'inbox' })}>Open items</Button>}
        </div>
      ) : (
        <>
          <ul>
            {shown.map((n, i) => (
              <li key={i} className="border-b border-line last:border-b-0">
                <button type="button" onClick={n.go} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2 sm:px-5">
                  <span className={cx('mt-2 size-2 shrink-0 rounded-full', n.tone === 'bad' ? 'bg-bad' : n.tone === 'warn' ? 'bg-warn' : 'bg-info')} />
                  <span className="min-w-0 flex-1"><span className="block text-base font-medium">{n.title}</span><span className="block truncate text-sm text-fg-3">{n.detail}</span></span>
                </button>
              </li>
            ))}
          </ul>
          {items.length > 5 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-medium text-fg-2 hover:bg-panel-2">
              <ChevronDown className={cx('size-4 transition-transform', all && 'rotate-180')} />{all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function SinceLastLooked({ now }: { now: string }) {
  const wp = useWorkpaper();
  const me = useMe();
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const all = useApp((s) => s.events);
  const viewAsOf = useApp((s) => s.viewAsOf);
  const seen = wp.state.seen.get(me.id) ?? null;
  const fresh = useMemo(() => all.filter((e) => e.at <= wp.asOf && e.actor !== me.id && !QUIET.has(e.type) && (!seen || e.at > seen) && !wp.state.reverted.has(e.id)), [all, wp.asOf, me.id, seen, wp.state.reverted]);
  const shown = fresh.slice(-5).reverse();
  return (
    <Card pad={false}
      title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-fg-3" />Since you last looked</span>}
      sub={seen ? `Changes by others since ${ago(seen, now)}.` : 'Everything others have done on this file.'}
      action={fresh.length > 0 && !viewAsOf ? <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} onClick={() => store.run((x) => markSeen(x), { quiet: true })}>Mark all seen</Button> : undefined}>
      {shown.length === 0 ? <div className="flex items-center justify-center gap-2 px-5 py-8 text-base text-fg-3"><Eye className="size-4" />You are up to date.</div> : (
        <ul>
          {shown.map((e) => {
            const d = describe(e, ix, all, actors);
            const a = actors.find((x) => x.id === e.actor);
            return (
              <li key={e.id} className="border-b border-line last:border-b-0">
                <button type="button" disabled={!d.ref} onClick={() => d.ref && store.open(d.ref)} className="flex w-full items-start gap-3 px-4 py-3 text-left enabled:hover:bg-panel-2 sm:px-5">
                  <Avatar actor={a} size={24} />
                  <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">{a?.name.split(' ')[0]}</span> <span className="text-fg-2">{d.text}</span><span className="block text-cap text-fg-3">{ago(e.at, now)}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {fresh.length > shown.length && (
        <button type="button" onClick={() => store.go({ page: 'activity' })} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-medium text-fg-2 hover:bg-panel-2"><History className="size-4" />{fresh.length - shown.length} more in Activity</button>
      )}
    </Card>
  );
}

function People({ wp }: { wp: Workpaper }) {
  const actors = useApp((s) => s.actors);
  const ix = useApp((s) => s.ix)!;
  const start = ix.packet.firm.assignment_at_start;
  const team = [start.preparer, start.reviewer, start.partner, ...new Set([...wp.state.assignments.values()].flatMap((x) => Object.values(x)))].filter((v, i, arr) => v && arr.indexOf(v) === i) as string[];
  return (
    <Disclosure title="Team" sub={`${plural(team.length, 'person', 'people')}: assigned at the start, plus anyone assigned to an area since.`}
      right={<Button size="sm" variant="ghost" onClick={() => store.go({ page: 'firm', tab: 'people' })}>People & access</Button>}>
      <ul className="grid grid-cols-1 md:grid-cols-2">
        {team.map((id) => {
          const a = actors.find((x) => x.id === id);
          const areas = [...wp.state.assignments.entries()].filter(([, v]) => Object.values(v).includes(id)).map(([k]) => k);
          const mins = wp.state.timeLog.filter((t) => t.by === id).reduce((s, t) => s + t.minutes, 0);
          return (
            <li key={id} className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5 md:odd:border-r">
              <Avatar actor={a} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium">{a?.name} <span className="font-normal text-fg-3">· {a?.roleLabel}{a?.credential ? `, ${a.credential}` : ''}</span></div>
                <div className="truncate text-sm text-fg-3">{areas.length ? <>Also on {areas.map((x, i) => <span key={x}>{i ? ', ' : ''}<AreaLink id={x} /></span>)}</> : id === start.preparer ? 'Preparer on every area' : id === start.reviewer ? 'Reviewer on every area' : id === start.partner ? 'Partner on the return' : ''}</div>
              </div>
              <span className="num text-sm text-fg-3">{hours(mins)} h</span>
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}
