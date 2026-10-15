import { ArrowRight, Bell, CheckCheck, Clock3, Eye, History, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { markSeen } from '../../app/actions';
import { notificationsFor } from '../../app/notify';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import type { Summary } from '../../engine/recompute';
import type { Workpaper } from '../../engine/workpaper';
import { ago, date, hours, money, plural, signed } from '../format';
import { Avatar, Badge, Button, Card, Empty, Meter, PageHead, SectionHead, cx } from '../kit';
import { QUIET, describe } from './describe';
import { AreaLink, LineRows, SignDots, StepIcon, outcome, useNow } from './common';

export function Overview() {
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
    <div className="space-y-6">
      <PageHead
        eyebrow={<>{eng.year} · Form {eng.forms.replace('CA ', 'California ')} · {eng.filingStatus} · {p.packet.client_id}</>}
        title={eng.filers}
        sub={<>{eng.move ? `${eng.move} ` : ''}Two W-2 jobs, a design studio, two rentals and a condo sale, three brokerages and crypto, two K-1s, a Swedish account. Engine {wp.version?.version ?? '—'} computed {wp.version ? date(wp.version.computed_at) : '—'}.</>}
        right={filed ? <Badge tone="ok" dot>Filed and frozen {date(wp.state.frozen!.at)}</Badge> : <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={() => store.go({ page: 'inbox' })}>{wp.blockers.length ? `${plural(wp.blockers.length, 'item')} before filing` : 'Ready to file'}</Button>}
      />

      {!wp.version ? (
        <Empty title="No engine output yet">The first engine run is on March 4, 2026. Move the season clock forward or return to now.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ResultCard title="Federal" engine={wp.summary.engine!.federal} ours={wp.summary.ours!.federal} projected={pending.length ? wp.summary.projected!.federal : null} taxKey="F1040.24" balKey={wp.summary.ours!.federal.balanceDue > 0 ? 'F1040.37' : 'F1040.34'} penaltyKey="F1040.38" />
            <ResultCard title="California" engine={wp.summary.engine!.california} ours={wp.summary.ours!.california} projected={pending.length ? wp.summary.projected!.california : null} taxKey="F540NR.64" balKey="F540NR.97" penaltyKey="FTB5805.penalty" />
          </div>
          <p className="-mt-3 text-sm text-fg-3">
            “Ours” is the engine's return with the {plural(approved.length, 'approved change')} applied, rebuilt line by line by TaxLens's independent recompute, which reproduces every engine run to the dollar.
            {pending.length > 0 && <> {plural(pending.length, 'more change')} {pending.length === 1 ? 'is' : 'are'} proposed and shown only as a projection until approved.</>}
          </p>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PathToFiling wp={wp} />
          <AreasGrid wp={wp} />
        </div>
        <div className="space-y-6">
          <NeedsYou />
          <SinceLastLooked now={now} />
          {me.role !== 'client' && <People wp={wp} />}
        </div>
      </div>

      {wp.ours && (
        <section>
          <SectionHead title="Return summary against last year" sub={`${eng.year - 1} as filed by ${eng.priorPreparer}, the engine's current run, and ours. Click a number for its proof.`} right={<Button size="sm" variant="ghost" onClick={() => store.go({ page: 'records', tab: 'summary' })}>All records</Button>} />
          <LineRows wp={wp} dense prior={p.prior_years.return_2024.lines} emphasize={['F1040.11', 'F1040.15', 'F1040.24']}
            keys={['F1040.1a', 'F1040.7', 'F1040.8', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.23', 'F1040.24', 'F1040.33']} />
        </section>
      )}
    </div>
  );
}

function ResultCard({ title, engine, ours, projected, taxKey, balKey, penaltyKey }: { title: string; engine: Summary['federal'] | Summary['california']; ours: Summary['federal'] | Summary['california']; projected: Summary['federal'] | Summary['california'] | null; taxKey: string; balKey: string; penaltyKey: string }) {
  const o = outcome(ours);
  const e = outcome(engine);
  const pr = projected ? outcome(projected) : null;
  const diff = ours.totalTax - engine.totalTax;
  const label = (x: ReturnType<typeof outcome>) => (x.kind === 'refund' ? 'Refund' : x.kind === 'owe' ? 'Balance due' : 'Even');
  return (
    <Card className="relative overflow-hidden" pad={false}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="eyebrow">{title}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-medium text-fg-2">{label(o)}</span>
          </div>
          <button type="button" onClick={() => store.open(balKey)} className={cx('num proof mt-0.5 text-display leading-none font-semibold tracking-[-0.02em]', o.kind === 'refund' ? 'text-ok' : o.kind === 'owe' ? 'text-fg' : '')}>{money(o.amount)}</button>
          <div className="mt-1.5 text-sm text-fg-3">{o.detail}</div>
        </div>
        <div className="text-right text-sm">
          <div className="text-fg-3">Engine as delivered</div>
          {e.kind === o.kind && e.amount === o.amount ? <div className="text-sm text-fg-3">No approved changes yet</div> : <div className="num text-md text-fg-3 line-through decoration-fg-3/50">{label(e)} {money(e.amount)}</div>}
          {pr && (pr.kind !== o.kind || pr.amount !== o.amount) && (
            <div className="mt-2 rounded-md border border-dashed border-info/50 bg-info-bg/50 px-2 py-1 text-info">
              <div className="text-cap">If pending changes are approved</div>
              <div className="num font-semibold">{label(pr)} {money(pr.amount)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 border-t border-line text-sm">
        <Cell label="Total tax" v={<button type="button" className="num proof font-semibold" onClick={() => store.open(taxKey)}>{money(ours.totalTax)}</button>} sub={diff ? <span className={diff < 0 ? 'text-ok' : 'text-bad'}>{signed(diff)} vs engine</span> : 'same as engine'} />
        <Cell label="Payments" v={<span className="num font-semibold">{money(ours.payments)}</span>} sub={ours.payments !== engine.payments ? <span className="text-bad">{signed(ours.payments - engine.payments)} vs engine</span> : 'same as engine'} />
        <Cell label="Penalty" v={<button type="button" className="num proof font-semibold" onClick={() => store.open(penaltyKey)}>{money(ours.penalty)}</button>} sub={ours.penalty !== engine.penalty ? `${signed(ours.penalty - engine.penalty)} vs engine` : 'same as engine'} />
      </div>
    </Card>
  );
}

function Cell({ label, v, sub }: { label: string; v: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="border-r border-line px-4 py-2.5 last:border-r-0">
      <div className="text-fg-3">{label}</div>
      <div className="text-md">{v}</div>
      <div className="text-cap text-fg-3">{sub}</div>
    </div>
  );
}

function PathToFiling({ wp }: { wp: Workpaper }) {
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
  const rows: { label: string; detail: string; state: 'done' | 'open' | 'blocked' | 'na'; go: () => void }[] = [
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
  return (
    <section>
      <SectionHead title="Path to filing" sub="What stands between this file and an accepted return. Each row opens the place to act." />
      <Card pad={false}>
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.label}>
              <button type="button" onClick={r.go} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel-2">
                <StepIcon state={r.state} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{r.label}</span>
                  <span className="block truncate text-sm text-fg-3">{r.detail}</span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-fg-3" />
              </button>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

function AreasGrid({ wp }: { wp: Workpaper }) {
  return (
    <section>
      <SectionHead title="Areas" sub="Each area has its own findings, changes and sign-offs. A sign-off reopens when anything in its area changes." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {wp.areas.map((a) => {
          const def = AREA[a.id];
          const budget = a.budgetHours ? a.budgetHours * 60 : 0;
          return (
            <button key={a.id} type="button" onClick={() => store.go({ page: 'area', id: a.id })} className="flex flex-col rounded-lg border border-line bg-panel p-3 text-left shadow-1 hover:border-line-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{def.name}</div>
                  <div className="text-sm text-fg-3">{[a.lines.length ? plural(a.lines.length, 'line') : '', a.docs.length ? plural(a.docs.length, 'document') : ''].filter(Boolean).join(' · ') || 'Computed from the other areas'}</div>
                </div>
                <SignDots a={a} size="sm" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.findingsOpen > 0 && <Badge tone="bad">{plural(a.findingsOpen, 'finding')}</Badge>}
                {a.proposalsPending > 0 && <Badge tone="info">{a.proposalsPending} to approve</Badge>}
                {a.notesOpen > 0 && <Badge tone="warn">{plural(a.notesOpen, 'note')}</Badge>}
                {a.questionsOpen > 0 && <Badge tone="neutral">{a.questionsOpen} asked</Badge>}
                {!a.findingsOpen && !a.proposalsPending && !a.notesOpen && <Badge tone="ok">Nothing open</Badge>}
              </div>
              {budget > 0 && (
                <div className="mt-2.5 flex items-center gap-2 text-cap text-fg-3">
                  <Clock3 className="size-3" />
                  <Meter value={a.minutes} max={budget} tone={a.minutes > budget ? 'bad' : a.minutes > budget * 0.8 ? 'warn' : 'neutral'} className="flex-1" />
                  <span className="num">{hours(a.minutes)} / {a.budgetHours} h</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NeedsYou() {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const items = notificationsFor(wp, me, actors);
  return (
    <section>
      <SectionHead title={<span className="inline-flex items-center gap-2"><Bell className="size-4 text-fg-3" />Needs you</span>} sub={`Work waiting for ${me.name.split(' ')[0]} (${me.roleLabel.toLowerCase()}).`} />
      <Card pad={false}>
        {items.length === 0 ? <div className="px-4 py-6 text-center text-base text-fg-3">Nothing is waiting for you.{me.role === 'preparer' ? ' Open items lists every finding to work.' : ''}</div> : (
          <ul className="divide-y divide-line">
            {items.slice(0, 7).map((n, i) => (
              <li key={i}>
                <button type="button" onClick={n.go} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-panel-2">
                  <span className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', n.tone === 'bad' ? 'bg-bad' : n.tone === 'warn' ? 'bg-warn' : 'bg-info')} />
                  <span className="min-w-0 flex-1"><span className="block text-base font-medium">{n.title}</span><span className="block truncate text-sm text-fg-3">{n.detail}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
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
  const shown = fresh.slice(-8).reverse();
  return (
    <section>
      <SectionHead
        title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-fg-3" />Since you last looked</span>}
        sub={seen ? `Changes by others since ${ago(seen, now)}.` : 'Everything others have done on this file.'}
        right={fresh.length > 0 && !viewAsOf ? <Button size="sm" variant="ghost" icon={<CheckCheck className="size-3.5" />} onClick={() => store.run((x) => markSeen(x), { quiet: true })}>Mark all seen</Button> : undefined}
      />
      <Card pad={false}>
        {shown.length === 0 ? <div className="flex items-center justify-center gap-2 px-4 py-6 text-base text-fg-3"><Eye className="size-4" />You are up to date.</div> : (
          <ul className="divide-y divide-line">
            {shown.map((e) => {
              const d = describe(e, ix, all, actors);
              const a = actors.find((x) => x.id === e.actor);
              return (
                <li key={e.id}>
                  <button type="button" disabled={!d.ref} onClick={() => d.ref && store.open(d.ref)} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left enabled:hover:bg-panel-2">
                    <Avatar actor={a} size={20} />
                    <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{a?.name.split(' ')[0]}</span> <span className="text-fg-2">{d.text}</span><span className="block text-cap text-fg-3">{ago(e.at, now)}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {fresh.length > shown.length && (
          <button type="button" onClick={() => store.go({ page: 'activity' })} className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2 text-sm text-fg-2 hover:bg-panel-2"><History className="size-3.5" />{fresh.length - shown.length} more in Activity</button>
        )}
      </Card>
    </section>
  );
}

function People({ wp }: { wp: Workpaper }) {
  const actors = useApp((s) => s.actors);
  const ix = useApp((s) => s.ix)!;
  const start = ix.packet.firm.assignment_at_start;
  const team = [start.preparer, start.reviewer, start.partner, ...new Set([...wp.state.assignments.values()].flatMap((x) => Object.values(x)))].filter((v, i, arr) => v && arr.indexOf(v) === i) as string[];
  return (
    <section>
      <SectionHead title="Team" sub="Assigned at the start, plus anyone assigned to an area since." right={<Button size="sm" variant="ghost" onClick={() => store.go({ page: 'firm', tab: 'people' })}>People & access</Button>} />
      <Card pad={false}>
        <ul className="divide-y divide-line">
          {team.map((id) => {
            const a = actors.find((x) => x.id === id);
            const areas = [...wp.state.assignments.entries()].filter(([, v]) => Object.values(v).includes(id)).map(([k]) => k);
            const mins = wp.state.timeLog.filter((t) => t.by === id).reduce((s, t) => s + t.minutes, 0);
            return (
              <li key={id} className="flex items-center gap-2.5 px-4 py-2">
                <Avatar actor={a} size={24} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{a?.name} <span className="font-normal text-fg-3">· {a?.roleLabel}{a?.credential ? `, ${a.credential}` : ''}</span></div>
                  <div className="truncate text-fg-3">{areas.length ? <>Also on {areas.map((x, i) => <span key={x}>{i ? ', ' : ''}<AreaLink id={x} /></span>)}</> : id === start.preparer ? 'Preparer on every area' : id === start.reviewer ? 'Reviewer on every area' : id === start.partner ? 'Partner on the return' : ''}</div>
                </div>
                <span className="num text-sm text-fg-3">{hours(mins)} h</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
