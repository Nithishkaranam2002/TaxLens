import { CalendarClock, CheckCircle2, Clock, Download, ExternalLink, FastForward, FileCheck2, FileText, Inbox, Lock, Mail, Play, Send, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  addNote, clientApprove, decide, fileAmendment, openAmendment, proposeFix, recordPayment, respondNotice, rollForward, setClock, signOff, signOffReturn, transmit,
} from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { outsideFilings } from '../../engine/checks/completeness';
import type { Level } from '../../engine/events';
import type { Workpaper } from '../../engine/workpaper';
import { date, dateTime, money, plural, signed, value } from '../format';
import { Badge, Button, Card, Empty, Field, PageHead, SectionHead, StatusPill, Tabs, TextArea, cx } from '../kit';
import { RefChip } from '../Ref';
import { Who } from '../drawer/widgets';
import { LineRows, StepIcon, download, num, openBlocker, outcome, useNow } from './common';
import { clientCopyHtml, noticePackageHtml } from './filingDocs';

type Tab = 'efile' | 'season' | 'amend' | 'notices' | 'nextyear';

export function Filing({ tab }: { tab?: string }) {
  const wp = useWorkpaper();
  const t = (['efile', 'season', 'amend', 'notices', 'nextyear'].includes(tab ?? '') ? tab : 'efile') as Tab;
  return (
    <div>
      <PageHead eyebrow="Filing and after" title={wp.state.frozen ? 'Filed' : 'Filing'} sub="Transmit when nothing blocks it. The return freezes at acceptance; later changes become an amendment on top of it, and a notice years later is answered from the frozen record."
        right={wp.state.frozen ? <Badge tone="ok" dot>Frozen {date(wp.state.frozen.at)} · {wp.state.frozen.hash.slice(0, 8)}</Badge> : <Badge tone={wp.blockers.length ? 'warn' : 'ok'} dot>{wp.blockers.length ? `${plural(wp.blockers.length, 'item')} before filing` : 'Ready to file'}</Badge>} />
      <Tabs className="mb-5" value={t} onChange={(x) => store.go({ page: 'filing', tab: x })} tabs={[
        { id: 'efile', label: 'E-file and status' }, { id: 'season', label: 'Season replay' }, { id: 'amend', label: 'Amendments', count: wp.state.amendments.length || undefined },
        { id: 'notices', label: 'Notices' }, { id: 'nextyear', label: 'Next year' },
      ]} />
      {t === 'efile' && <EFile wp={wp} />}
      {t === 'season' && <Season wp={wp} />}
      {t === 'amend' && <Amend wp={wp} />}
      {t === 'notices' && <Notices wp={wp} />}
      {t === 'nextyear' && <NextYear wp={wp} />}
    </div>
  );
}

// ---------------------------------------------------------------- e-file
function EFile({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const ix = useApp((s) => s.ix)!;
  const f = wp.state.frozen;
  const ext = ix.packet.what_if.extension;
  const rates = ix.packet.post_filing_rates;
  const eng = wp.summary.engine?.federal;
  const ours = wp.summary.ours?.federal;
  // What the engine's return as delivered would have cost after April 15 (filed and paid as scripted).
  const engDue = eng ? eng.balanceDue : 0;
  const days = (Date.parse('2026-07-20') - Date.parse('2026-04-15')) / 86400000;
  const engInterest = engDue > 0 ? engDue * rates.irs_underpayment_interest_rate_annual * days / 365 : 0;
  const engFtp = engDue > 0 ? engDue * rates.irs_failure_to_pay_penalty_per_month * 4 : 0;
  return (
    <div className="space-y-6">
      {!f && (
        <section>
          <SectionHead title="Before transmitting" sub="Everything must be resolved, approved and signed. The client's approval must still match the return." />
          <Card pad={false}>
            {wp.blockers.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                <CheckCircle2 className="size-5 text-ok" />
                <span className="flex-1 text-base">Nothing blocks filing. Federal and California go together; California is held if the federal return is rejected.</span>
                {(me.role === 'reviewer' || me.role === 'partner') && <Button variant="primary" icon={<Send className="size-4" />} onClick={() => store.run((x) => transmit(x))}>Transmit federal and California</Button>}
              </div>
            ) : (
              <>
                <ul className="max-h-[360px] divide-y divide-line overflow-y-auto scroll-thin">
                  {wp.blockers.map((b, i) => (
                    <li key={i}><button type="button" onClick={() => openBlocker(b.ref)} className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-panel-2"><StepIcon state="open" /><span className="min-w-0 flex-1 text-base"><span className="text-fg-3">{b.kind}:</span> {b.text}</span></button></li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-sm text-fg-3"><span>{plural(wp.blockers.length, 'item')} to clear. Transmitting is refused until then.</span>{(me.role === 'reviewer' || me.role === 'partner') && <Button size="sm" icon={<Send className="size-3.5" />} onClick={() => store.run((x) => transmit(x))}>Try to transmit</Button>}</div>
              </>
            )}
          </Card>
        </section>
      )}

      {(wp.state.transmissions.length > 0 || wp.state.results.length > 0) && (
        <section>
          <SectionHead title="E-file history" />
          <Card pad={false}>
            <ul className="divide-y divide-line">
              {wp.state.results.map((r, i) => (
                <li key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  {r.status === 'accepted' ? <CheckCircle2 className="mt-0.5 size-4.5 text-ok" /> : r.status === 'rejected' ? <XCircle className="mt-0.5 size-4.5 text-bad" /> : <ShieldAlert className="mt-0.5 size-4.5 text-warn" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium">{r.jurisdiction === 'federal' ? 'IRS' : 'California FTB'}: {r.status.replace('_', ' ')}</div>
                    <div className="mono text-cap text-fg-3">{r.submissionId} · {dateTime(r.at)}</div>
                    {r.errors.map((e) => <div key={e.code} className="mt-1 rounded-md bg-bad-bg/60 px-2.5 py-1.5 text-sm"><span className="mono font-medium">{e.code}</span> {e.message}{e.code === 'R0000-504-02' && <div className="mt-1"><Button size="sm" variant="ghost" onClick={() => store.open('check:CHK-DEPENDENTS')}>Open the dependent check and its correction</Button></div>}</div>)}
                    {r.avoided && <div className="mt-1 rounded-md bg-ok-bg/60 px-2.5 py-1.5 text-sm">{r.avoided}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {f && (
        <section>
          <SectionHead title="Frozen as filed" sub="Nothing on the filed return can change. A correction opens an amendment on top of it." />
          <Card>
            <div className="flex flex-wrap items-start gap-4">
              <Lock className="mt-0.5 size-5 text-fg-3" />
              <div className="min-w-0 flex-1 text-base">
                <div className="flex flex-wrap items-center gap-1.5">Filed by <Who id={f.by} at={f.at} /></div>
                <div className="mono mt-0.5 text-cap text-fg-3">Fingerprint {f.hash} · {Object.keys(f.values).length} lines · retained until {String(Number(f.at.slice(0, 4)) + 7)}-{f.at.slice(5, 10)} (firm standard: 7 years)</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(['federal', 'california'] as const).map((j) => {
                    const o = outcome(wp.summary.ours![j]);
                    return <div key={j} className="rounded-md bg-panel-2 px-3 py-2"><div className="text-sm text-fg-3">{j === 'federal' ? 'Federal' : 'California'}</div><div className="num font-semibold">{o.kind === 'refund' ? 'Refund' : 'Due'} {money(o.amount)}</div></div>;
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(clientCopyHtml(wp, ix)); w.document.close(); } else download('2025-return-client-copy.html', clientCopyHtml(wp, ix), 'text/html'); }}>Client copy</Button>
                <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => download(`2025-return-frozen-${f.hash.slice(0, 8)}.json`, JSON.stringify({ filed: f.at, fingerprint: f.hash, values: f.values }, null, 2))}>Frozen lines (JSON)</Button>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHead title="Extension and payment" sub={`Filed ${date(ext.computed_at)} from engine ${ext.based_on_version}. An extension of time to file is not an extension of time to pay.`} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <div className="eyebrow">Federal · Form 4868</div>
            <div className="mt-2 space-y-1 text-base">
              <Line l="Estimated total tax (v2)" v={money(ext.federal.estimated_total_tax)} />
              <Line l="Payments before the extension" v={money(ext.federal.payments)} />
              <Line l={`Paid with the extension (${ext.federal.rule})`} v={money(ext.federal.paid_with_form_4868)} strong />
              <Line l="Our total tax" v={money(ours?.totalTax)} />
              <Line l="Our payments, including the extension" v={money(ours?.payments)} />
              <Line l="Result" v={ours ? (ours.balanceDue > 0 ? `Short ${money(ours.balanceDue)}: interest and failure-to-pay from April 15` : `Covered; overpaid ${money(-ours.balanceDue)}`) : '—'} strong />
            </div>
            {engDue > 0 && ours && ours.balanceDue <= 0 && (
              <p className="mt-3 rounded-md bg-ok-bg/60 px-3 py-2 text-sm">The engine's return as delivered owed {money(engDue)} after the extension. Paid on July 20 it would have added about {money(engInterest)} of interest ({Math.round(rates.irs_underpayment_interest_rate_annual * 100)}% for {Math.round(days)} days) and {money(engFtp)} of failure-to-pay penalty. The corrected return is fully paid, so neither applies.</p>
            )}
          </Card>
          <Card>
            <div className="eyebrow">California · FTB 3519</div>
            <div className="mt-2 space-y-1 text-base">
              <Line l="Estimated total tax (v2)" v={money(ext.california.estimated_total_tax)} />
              <Line l="Payments before the extension" v={money(ext.california.payments)} />
              <Line l="Paid with the extension" v={money(ext.california.paid_with_ftb_3519)} strong />
              <Line l="Our total tax" v={money(wp.summary.ours?.california.totalTax)} />
              <Line l="Our payments (agreed to the FTB account)" v={money(wp.summary.ours?.california.payments)} />
            </div>
            <p className="mt-3 text-sm text-fg-3">The FTB applied the 9/15/2025 payment of 3,500 to 2024, so it is not a 2025 payment. Ask the FTB to transfer it, or claim it on the 2024 account (outside filings).</p>
          </Card>
        </div>
      </section>

      {wp.state.payments.length > 0 && (
        <section>
          <SectionHead title="After filing" />
          <Card pad={false}><ul className="divide-y divide-line">{wp.state.payments.map((p, i) => <li key={i} className="flex justify-between px-4 py-2 text-base"><span>{p.jurisdiction === 'federal' ? 'IRS' : 'FTB'} · {p.kind === 'refund' ? 'refund issued' : p.kind === 'balance' ? 'balance paid' : 'interest and penalty'} · {p.date}</span><span className="num font-medium">{money(p.amount, { cents: p.amount % 1 !== 0 })}</span></li>)}</ul></Card>
        </section>
      )}
    </div>
  );
}

const Line = ({ l, v, strong }: { l: string; v: React.ReactNode; strong?: boolean }) => <div className={cx('flex justify-between gap-3', strong && 'font-semibold')}><span className={strong ? '' : 'text-fg-2'}>{l}</span><span className="num text-right">{v}</span></div>;

// ---------------------------------------------------------------- season replay
interface Milestone { id: string; at: string; title: string; detail: string; who: string; done: (wp: Workpaper) => boolean; run: () => boolean; skip?: (wp: Workpaper) => boolean; needsFiling?: boolean }

function useMilestones(): Milestone[] {
  const ix = useApp((s) => s.ix)!;
  return useMemo(() => {
    const clock = (to: string, note: string) => {
      if (store.now() >= to) return true;
      const actor = ['client'].includes(store.actor().role) ? 'st-02' : store.s.me;
      return store.run((x) => setClock(x, to, note), { actor, quiet: true }).ok;
    };
    const as = (actor: string, fn: Parameters<typeof store.run>[0]) => store.run(fn, { actor }).ok;
    const resign = (area: Parameters<typeof signOff>[1], lvl: Level, actor: string) => {
      const a = store.workpaper().areas.find((y) => y.id === area)!;
      return a.signoffs[lvl].state === 'signed' || as(actor, (x) => signOff(x, area, lvl));
    };
    const fed = () => store.workpaper().summary.ours!.federal;
    const ca = () => store.workpaper().summary.ours!.california;
    return [
      {
        id: 'approve', at: '2026-07-10T20:05:00Z', title: 'Client approves and signs Form 8879', who: 'Ngozi Okafor', detail: 'From the portal, with both spouses\' PINs. Refused if the partner has not signed the return.',
        done: (wp) => !!wp.state.clientApproval || !!wp.state.frozen,
        run: () => clock('2026-07-10T20:05:00Z', 'Season replay: client approval') && as('cu-01', (x) => clientApprove(x, { taxpayer: '41207', spouse: '88310' })),
      },
      {
        id: 'transmit', at: '2026-07-13T17:04:00Z', title: 'Daniel transmits the returns', who: 'Daniel Ortiz', detail: 'The packet scripts a rejection for Theo\'s SSN here. If the SSN was corrected, the return is accepted the first time.',
        done: (wp) => wp.state.results.length > 0,
        run: () => clock('2026-07-13T17:04:00Z', 'Season replay: e-file') && as('st-02', (x) => transmit(x)),
      },
      {
        id: 'refile', at: '2026-07-14T16:22:00Z', title: 'Correct Theo\'s SSN and transmit again', who: 'Priya, Daniel, Helen, Ngozi', detail: 'Only if rejected. The card arrives (D71); the correction is proposed and approved, the reopened sign-offs and the client\'s approval are redone, and the return goes again.',
        skip: (wp) => !wp.state.results.some((r) => r.status === 'rejected') || !!wp.state.frozen,
        done: (wp) => !!wp.state.frozen,
        run: () => {
          if (!clock('2026-07-14T15:00:00Z', 'Season replay: refile')) return false;
          let wp = store.workpaper();
          if (!wp.dataFixes.has('household:theo.ssn')) {
            if (!wp.proposals.some((p) => p.fix?.id === 'FIX-THEO-SSN' && p.status === 'proposed') && !as('st-01', (x) => proposeFix(x, 'FIX-THEO-SSN', 'apply', 'Social Security card received (D71); the organizer had two digits transposed.'))) return false;
            wp = store.workpaper();
            const p = wp.proposals.find((q) => q.fix?.id === 'FIX-THEO-SSN' && q.status === 'proposed')!;
            if (!as('st-02', (x) => decide(x, p.id, 'approve', 'Agrees to the card (D71) and the 2024 return.'))) return false;
          }
          for (const a of store.workpaper().areas) {
            if (!resign(a.id, 'preparer', 'st-01') || !resign(a.id, 'reviewer', 'st-02') || !resign(a.id, 'partner', 'st-03')) return false;
          }
          if (!store.workpaper().steps.find((s) => s.id === 'Partner sign-off')!.met && !as('st-03', (x) => signOffReturn(x))) return false;
          if (store.workpaper().clientApprovalState !== 'current' && !(clock('2026-07-14T15:40:00Z', 'Season replay: re-approval') && as('cu-01', (x) => clientApprove(x, { taxpayer: '41207', spouse: '88310' })))) return false;
          return clock('2026-07-14T16:22:00Z', 'Season replay: e-file again') && as('st-02', (x) => transmit(x));
        },
      },
      {
        id: 'fed-settle', at: '2026-07-20T14:00:00Z', title: 'Federal refund or balance', who: 'IRS', detail: 'The packet scripts a balance paid by direct debit; a refund is recorded instead when the filed return is a refund.',
        done: (wp) => wp.state.payments.some((p) => p.jurisdiction === 'federal'),
        needsFiling: true,
        run: () => {
          if (!clock('2026-07-20T14:00:00Z', 'Season replay: federal settlement')) return false;
          const f = fed();
          const o = outcome(f);
          if (o.kind === 'refund') return as(store.s.me === 'cu-01' ? 'st-02' : store.s.me, (x) => recordPayment(x, { jurisdiction: 'federal', amount: o.amount, date: '2026-07-20', kind: 'refund' }));
          const days = (Date.parse('2026-07-20') - Date.parse('2026-04-15')) / 86400000;
          const rates = ix.packet.post_filing_rates;
          const interest = Math.round((f.balanceDue * rates.irs_underpayment_interest_rate_annual * days / 365 + f.balanceDue * rates.irs_failure_to_pay_penalty_per_month * 4) * 100) / 100;
          return as('st-02', (x) => recordPayment(x, { jurisdiction: 'federal', amount: o.amount, date: '2026-07-20', kind: 'balance' })) && as('st-02', (x) => recordPayment(x, { jurisdiction: 'federal', amount: interest, date: '2026-07-20', kind: 'interest' }));
        },
      },
      {
        id: 'ca-settle', at: '2026-08-21T14:00:00Z', title: 'California refund issued', who: 'FTB', detail: 'Overpayment refunded by direct deposit.',
        done: (wp) => wp.state.payments.some((p) => p.jurisdiction === 'california'),
        needsFiling: true,
        run: () => {
          if (!clock('2026-08-21T14:00:00Z', 'Season replay: California refund')) return false;
          const o = outcome(ca());
          return as('st-02', (x) => recordPayment(x, { jurisdiction: 'california', amount: o.amount, date: '2026-08-21', kind: o.kind === 'refund' ? 'refund' : 'balance' }));
        },
      },
      {
        id: 'qr', at: '2027-01-04T15:00:00Z', title: 'Quality review selects this return', who: 'Sam Adeyemi', detail: 'Sam joins on January 4, 2027 and reviews the filed workpaper. Their note is computed from the record.',
        needsFiling: true,
        done: (wp) => [...wp.state.notes.values()].some((n) => n.by === 'st-06'),
        run: () => {
          if (!clock('2027-01-04T15:00:00Z', 'Season replay: quality review')) return false;
          const wp = store.workpaper();
          const appr = wp.proposals.filter((p) => p.status === 'approved');
          const text = `Quality review of the filed return: ${appr.length} changes, every one with evidence, authority and an approval by someone other than the preparer (${appr.filter((p) => p.needsPartner).length} also approved by the partner). ${wp.state.judgments.size} judgment calls recorded with authority. Due diligence ${wp.state.dd ? 'completed' : 'not recorded'}. ${wp.state.reveals.length} unmasked views of identifiers, all by cleared staff. No exceptions.`;
          return as('st-06', (x) => addNote(x, { kind: 'comment', target: 'F1040.24', area: 'totals', text, blocking: false, assignee: null }));
        },
      },
      {
        id: 'rollforward', at: '2027-01-15T15:00:00Z', title: 'Priya starts the 2026 file', who: 'Priya Raman', detail: 'Carryovers, open items and the 2026 estimate plan come from this workpaper.',
        needsFiling: true,
        done: (wp) => !!wp.state.rollforward,
        run: () => clock('2027-01-15T15:00:00Z', 'Season replay: next year') && as('st-01', (x) => rollForward(x, x.wp.state.frozen!.hash)),
      },
      {
        id: 'notice', at: '2028-01-26T15:00:00Z', title: 'IRS Letter 566 arrives', who: 'IRS', detail: 'An examination of the 2025 return. Answer it from Notices.',
        needsFiling: true,
        done: (wp) => wp.asOf >= '2028-01-26T15:00:00Z',
        run: () => clock('2028-01-26T15:00:00Z', 'Season replay: IRS letter'),
      },
    ];
  }, [ix]);
}

function Season({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const now = useNow();
  const ms = useMilestones();
  const viewAsOf = useApp((s) => s.viewAsOf);
  const [busy, setBusy] = useState(false);
  const runTo = async (i: number) => {
    setBusy(true);
    try {
      for (const m of ms.slice(0, i + 1)) {
        const w = store.workpaper();
        if (m.skip?.(w) || m.done(w)) continue;
        if (m.needsFiling && !w.state.frozen) { store.toast('The return has not been filed yet. Transmit it (or run the steps above) first.', 'info'); break; }
        if (!m.run()) break;
        await new Promise((r) => setTimeout(r, 40));
      }
    } finally { setBusy(false); }
  };
  const packetTl = useApp((s) => s.ix)!.packet.timeline;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 text-fg-3" />
        <div className="min-w-0 flex-1 text-base">
          <div className="font-medium">The season clock is at {dateTime(now)}.</div>
          <p className="mt-0.5 text-fg-2">The packet scripts what happens after July 1. Replay moves the clock forward and performs each step as the person who does it, through the same rules: a step that the rules refuse stops the replay and says why. The clock only moves forward; look back any time from the clock menu.</p>
        </div>
      </Card>
      {me.role === 'client' || viewAsOf ? <Empty icon={<Clock />} title="Replay is for staff, at the present moment">Return to now (top bar) to run the rest of the season.</Empty> : (
        <Card pad={false}>
          <ol className="divide-y divide-line">
            {ms.map((m, i) => {
              const done = m.done(wp);
              const skipped = !done && m.skip?.(wp);
              const waits = !done && !skipped && m.needsFiling && !wp.state.frozen;
              const next = !done && !skipped && ms.slice(0, i).every((p) => p.done(wp) || p.skip?.(wp));
              return (
                <li key={m.id} className={cx('flex flex-wrap items-start gap-3 px-4 py-3', skipped && 'opacity-55')}>
                  <StepIcon state={done ? 'done' : next ? 'open' : 'na'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium">{m.title}</div>
                    <div className="text-sm text-fg-3">{dateTime(m.at)} · {m.who}{waits ? ' · after filing' : ''}</div>
                    <p className="mt-0.5 text-sm text-fg-2">{m.detail}</p>
                  </div>
                  {done ? <Badge tone="ok">Done</Badge> : skipped ? <Badge>{m.id === 'refile' && !wp.state.results.length ? 'Only if rejected' : 'Not needed'}</Badge> : (
                    <Button size="sm" variant={next ? 'primary' : 'secondary'} busy={busy} icon={next ? <Play className="size-3.5" /> : <FastForward className="size-3.5" />} onClick={() => void runTo(i)}>{next ? 'Run' : 'Run to here'}</Button>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <section>
        <SectionHead title="The packet's timeline" sub="As scripted. TaxLens's replay follows it, except where the corrected return changes the outcome." />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {packetTl.map((t) => (
              <li key={t.id} className={cx('flex flex-wrap items-start gap-3 px-4 py-2 text-sm', t.at > now && 'text-fg-3')}>
                <span className="num w-36 shrink-0">{dateTime(t.at)}</span>
                <span className="min-w-0 flex-1"><span className="font-medium">{t.event.replace(/_/g, ' ')}</span>{t.detail && <span className="text-fg-3"> — {t.detail.replace(/PIN \d{5}/g, 'PIN •••••')}</span>}</span>
                <div className="flex flex-wrap gap-1">{t.refs.slice(0, 3).map((r) => <RefChip key={r} r={r} />)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- amendments
function Amend({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const [reason, setReason] = useState('');
  const f = wp.state.frozen;
  const open = wp.state.amendments.find((a) => !a.filed);
  if (!f) return <Empty icon={<FileCheck2 />} title="Nothing filed yet">Until the return is accepted, change it directly. After filing, changes go into an amendment here.</Empty>;
  const original = wp.state.filings[open ? wp.state.filings.length - 1 : Math.max(0, wp.state.filings.length - 2)] ?? f;
  const keys = ['F1040.11', 'F1040.12', 'F1040.15', 'F1040.16', 'F1040.19', 'F1040.23', 'F1040.24', 'F1040.33', 'F540NR.17', 'F540NR.32', 'F540NR.64'];
  const since = open ? wp.proposals.filter((p) => p.at >= open.at) : [];
  return (
    <div className="space-y-6">
      {!open ? (
        <Card>
          <div className="text-md font-semibold">Open an amendment</div>
          <p className="mt-1 text-sm text-fg-2">The filed return stays frozen. The amendment is built on top of it with the same evidence, approval and sign-off rules, and is filed as Form 1040-X and an amended 540NR. Partner only.</p>
          <Field label="Why the return is being amended"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corrected Form 1099-B received after filing" className="mt-1" /></Field>
          <div className="mt-2 flex justify-end"><Button variant="primary" disabled={me.role !== 'partner'} onClick={() => { const r = store.run((x) => openAmendment(x, reason)); if (r.ok) setReason(''); }}>Open amendment</Button></div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-md font-semibold">Amendment open</div>
              <p className="mt-0.5 text-base text-fg-2">{open.reason}</p>
              <div className="mt-1"><Who id={open.by} at={open.at} /></div>
              <p className="mt-2 text-sm text-fg-3">Propose changes from any number or check as usual. {plural(since.filter((p) => p.status === 'approved').length, 'change')} approved, {since.filter((p) => p.status === 'proposed').length} waiting.</p>
            </div>
            {me.role === 'partner' && <Button variant="primary" onClick={() => store.run((x) => fileAmendment(x))}>File the amended return</Button>}
          </div>
        </Card>
      )}
      <section>
        <SectionHead title={open ? 'As filed and as amended' : 'Filed return'} sub="Form 1040-X layout: original, net change, correct amount." />
        <div className="overflow-x-auto rounded-xl border border-line bg-panel scroll-thin">
          <table className="w-full min-w-[640px] border-collapse text-base">
            <thead><tr className="text-cap text-fg-3">{['Line', 'A · As filed', 'B · Net change', 'C · Correct'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-4 py-2.5 font-semibold', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            <tbody>
              {keys.map((k) => {
                const a = Number(original.values[k] ?? 0);
                const c = num(wp, k);
                return <tr key={k}><td className="border-b border-line px-3 py-1.5"><button type="button" className="hover:underline" onClick={() => store.open(k)}>{wp.ours?.labels.get(k) ?? k}</button> <span className="mono text-cap text-fg-3">{k}</span></td><td className="num border-b border-line px-3 py-1.5 text-right">{value(a, k)}</td><td className={cx('num border-b border-line px-3 py-1.5 text-right', c - a > 0 ? 'text-bad' : c - a < 0 ? 'text-ok' : 'text-fg-3')}>{c - a ? signed(c - a) : '—'}</td><td className="num border-b border-line px-3 py-1.5 text-right font-medium">{value(c, k)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
      {wp.state.amendments.filter((a) => a.filed).length > 0 && (
        <section><SectionHead title="Filed amendments" /><Card pad={false}><ul className="divide-y divide-line">{wp.state.amendments.filter((a) => a.filed).map((a) => <li key={a.id} className="px-4 py-2 text-base">{a.reason} <span className="text-fg-3">· opened {date(a.at)} · filed {date(a.filed)}</span></li>)}</ul></Card></section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- notices
function Notices({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const notices = ix.packet.tax_agency_records.notices.filter((n) => ix.received(n.document, wp.asOf));
  const [preview, setPreview] = useState<string | null>(null);
  const pkg = useMemo(() => (preview ? noticePackageHtml(wp, ix, actors, preview) : null), [preview, wp, ix, actors]);
  if (!notices.length) return <Empty icon={<Inbox />} tone="ok" title="No notices">Notices from the IRS or the FTB appear here when they arrive.</Empty>;
  return (
    <div className="space-y-4">
      {notices.map((n) => {
        const sent = wp.state.noticeResponses.find((r) => r.noticeId === n.id);
        const about2025 = n.tax_year === 2025;
        return (
          <Card key={n.id} pad={false}>
            <div className="flex flex-wrap items-start gap-3 px-4 py-3">
              <Mail className="mt-0.5 size-4.5 text-fg-3" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-md font-semibold">{n.agency} {n.type}</span><Badge tone="outline">Tax year {n.tax_year}</Badge>{n.status ? <Badge tone="ok">Resolved</Badge> : sent ? <Badge tone="ok">Response sent</Badge> : <Badge tone="warn">Response due {date(n.response_due)}</Badge>}</div>
                <div className="text-sm text-fg-3">Dated {date(n.dated)} · <RefChip r={n.document} /></div>
                {n.summary && <p className="mt-1 text-base">{n.summary}</p>}
                {n.status && <p className="mt-0.5 text-sm text-fg-2">{n.status}</p>}
                {n.items_under_examination && <ul className="mt-2 list-disc space-y-1 pl-5 text-base">{n.items_under_examination.map((x) => <li key={x}>{x}</li>)}</ul>}
                {sent && <p className="mt-2 text-sm text-ok">Sent <Who id={sent.by} at={sent.at} /> · package fingerprint <span className="mono">{sent.hash}</span></p>}
              </div>
              {about2025 && wp.state.frozen && (
                <div className="flex flex-col gap-2">
                  <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => setPreview(preview === n.id ? null : n.id)}>{preview === n.id ? 'Hide package' : 'Build response package'}</Button>
                </div>
              )}
            </div>
            {preview === n.id && pkg && (
              <div className="border-t border-line">
                <div className="flex flex-wrap items-center gap-2 bg-panel-2 px-4 py-2 text-sm">
                  <span className="flex-1 text-fg-2">Built from the frozen return and its evidence only · fingerprint <span className="mono">{pkg.hash}</span></span>
                  <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => download(`response-${n.id}.html`, pkg.html, 'text/html')}>Download</Button>
                  {!sent && <Button size="sm" variant="primary" disabled={me.role !== 'partner'} title={me.role !== 'partner' ? 'Partner only' : undefined} onClick={() => store.run((x) => respondNotice(x, n.id, pkg.hash, pkg.items))}>Record as sent</Button>}
                </div>
                <iframe title="Response package" srcDoc={pkg.html} className="h-[640px] w-full bg-white" sandbox="" />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- next year
function NextYear({ wp }: { wp: Workpaper }) {
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const plan = ix.packet.planning_reference_2026;
  const fedTax = wp.summary.ours?.federal.totalTax ?? 0;
  const caTax = wp.summary.ours?.california.totalTax ?? 0;
  const fedSafe = Math.ceil(fedTax * 1.1);
  const caSafe = Math.ceil(caTax * 1.1);
  const of = outsideFilings().filter((o) => o.status !== 'none');
  const rf = wp.state.rollforward;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-base">{rf ? <>The 2026 file was started from this workpaper · <Who id={rf.by} at={rf.at} /></> : 'When the 2026 engagement starts, the next file opens with these carryovers, open items and the estimate plan.'}</div>
        {!rf && ['preparer', 'reviewer', 'partner'].includes(me.role) && <Button variant="primary" disabled={!wp.state.frozen} title={!wp.state.frozen ? 'After filing' : undefined} onClick={() => store.run((x) => rollForward(x, x.wp.state.frozen?.hash ?? x.wp.returnFingerprint))}>Start the 2026 file</Button>}
      </Card>
      <section>
        <SectionHead title="2026 estimated tax" sub="Safe harbor from this return. Texas residents all of 2026: California taxes only California-source income, so its estimate is likely much lower than the safe harbor." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <div className="eyebrow">Federal</div>
            <p className="mt-1 text-sm text-fg-2">{plan.federal_safe_harbor}</p>
            <div className="num mt-2 text-base">110% × {money(fedTax)} = <b>{money(fedSafe)}</b></div>
            <ul className="mt-2 divide-y divide-line text-base">{plan.federal_estimate_due_dates.map((d) => <li key={d} className="flex justify-between py-1"><span>{date(d)}</span><span className="num">{money(Math.ceil(fedSafe / 4))}</span></li>)}</ul>
          </Card>
          <Card>
            <div className="eyebrow">California</div>
            <p className="mt-1 text-sm text-fg-2">{plan.california_safe_harbor}</p>
            <div className="num mt-2 text-base">110% × {money(caTax)} = <b>{money(caSafe)}</b></div>
            <ul className="mt-2 divide-y divide-line text-base">{plan.california_estimate_due_dates.map((d, i) => <li key={d} className="flex justify-between py-1"><span>{date(d)} · {Math.round(plan.california_installment_percentages[i] * 100)}%</span><span className="num">{money(Math.ceil(caSafe * plan.california_installment_percentages[i]))}</span></li>)}</ul>
          </Card>
        </div>
      </section>
      <section>
        <SectionHead title="Carried into 2026" />
        <LineRows wp={wp} dense keys={['F6251.11', 'F7203.excess', 'Sch1.16']} />
        <ul className="mt-3 space-y-1 text-base">
          <li>Minimum tax credit: <b className="num">{money(wp.ours?.carryovers.minimum_tax_credit ?? 0)}</b> (Form 8801).</li>
          <li>SEP contribution not deductible for 2025: <b className="num">{money(wp.ours?.carryovers.sep_contribution_not_deductible ?? 0)}</b>, unless withdrawn by October 15, 2026.</li>
          <li>ISO shares still held: regular basis 12,000, AMT basis 52,000 (Form 3921, D12).</li>
          <li>California depreciation basis differences on the studio equipment and the 2021 appliances.</li>
          <li>Ridgeline: ending capital 63,660; outside basis to be set up.</li>
        </ul>
      </section>
      <section>
        <SectionHead title="Known changes for 2026" />
        <Card pad={false}><ul className="divide-y divide-line">{plan.known_2026_changes_for_this_household.map((x) => <li key={x} className="px-4 py-2 text-base">{x}</li>)}</ul></Card>
      </section>
      <section>
        <SectionHead title="Open items to carry" sub="Outside this return; each has an owner." />
        <Card pad={false}><ul className="divide-y divide-line">{of.map((o) => <li key={o.id} className="flex flex-wrap items-start gap-3 px-4 py-2 text-base"><StatusPill status={o.status === 'required' ? 'open' : 'review'} /><span className="min-w-0 flex-1"><span className="font-medium">{o.what}</span><span className="block text-sm text-fg-3">{o.why} · {o.owner} · due {o.due}</span></span></li>)}</ul></Card>
      </section>
    </div>
  );
}
