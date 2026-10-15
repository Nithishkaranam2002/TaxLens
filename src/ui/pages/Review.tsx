import { BadgeCheck, CircleCheck, Gavel, ListChecks, Scale, ShieldAlert, Sparkles, Stethoscope, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  approveJudgment, completeDueDiligence, disposeDiag, explainVariance, markStep, recordJudgment, signOff, signOffReturn, withdrawSignOff,
} from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import { type AnyEvent, newId } from '../../engine/events';
import { DUE_DILIGENCE_QUESTIONS, JUDGMENTS, type JudgmentTopic } from '../../engine/judgments';
import { RULE } from '../../engine/people';
import type { Workpaper } from '../../engine/workpaper';
import { ago, date, money, plural, signed } from '../format';
import { firmDay } from '../../engine/time';
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHead, SectionHead, Segmented, Select, StatusPill, Tabs, TextArea, Tick, cx } from '../kit';
import { RefChip } from '../Ref';
import { Who } from '../drawer/widgets';
import { LEVELS, SignState, StepIcon, openBlocker, useNow } from './common';

type Tab = 'signoffs' | 'notes' | 'judgments' | 'variances' | 'steps' | 'diligence' | 'diagnostics';

export function Review({ tab }: { tab?: string }) {
  const wp = useWorkpaper();
  const t = (['signoffs', 'notes', 'judgments', 'variances', 'steps', 'diligence', 'diagnostics'].includes(tab ?? '') ? tab : 'signoffs') as Tab;
  const openNotes = [...wp.state.notes.values()].filter((n) => n.status === 'open' && n.kind === 'review').length;
  const judg = wp.blockers.filter((b) => b.kind.startsWith('Judgment')).length;
  const vars = wp.variances.filter((v) => v.flagged && !v.explanation).length;
  const steps = wp.steps.filter((s) => !s.met).length;
  const diags = wp.diagnostics.filter((d) => d.status === 'open').length;
  return (
    <div>
      <PageHead eyebrow="People" title="Review & sign-off" sub="Review notes, judgment calls with their authority, due diligence and the firm's required steps. Sign-offs bind to what was reviewed and reopen when it changes." />
      <Tabs className="mb-5" value={t} onChange={(x) => store.go({ page: 'review', tab: x })} tabs={[
        { id: 'signoffs', label: <><BadgeCheck className="size-3.5" />Sign-offs</> },
        { id: 'notes', label: <><ShieldAlert className="size-3.5" />Review notes</>, count: openNotes || undefined },
        { id: 'judgments', label: <><Gavel className="size-3.5" />Judgment calls</>, count: judg || undefined },
        { id: 'variances', label: <><TrendingUp className="size-3.5" />Variances</>, count: vars || undefined },
        { id: 'steps', label: <><ListChecks className="size-3.5" />Required steps</>, count: steps || undefined },
        { id: 'diligence', label: <><Scale className="size-3.5" />Due diligence</> },
        { id: 'diagnostics', label: <><Stethoscope className="size-3.5" />Engine diagnostics</>, count: diags || undefined },
      ]} />
      {t === 'signoffs' && <SignOffs wp={wp} />}
      {t === 'notes' && <NotesTab wp={wp} />}
      {t === 'judgments' && <Judgments wp={wp} />}
      {t === 'variances' && <Variances wp={wp} />}
      {t === 'steps' && <Steps wp={wp} />}
      {t === 'diligence' && <Diligence wp={wp} />}
      {t === 'diagnostics' && <Diagnostics wp={wp} />}
    </div>
  );
}

// ---------------------------------------------------------------- sign-offs
function SignOffs({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const start = useApp((s) => s.ix)!.packet.firm.assignment_at_start;
  const partner = wp.state.signoffs.get('return:partner');
  const partnerStep = wp.steps.find((s) => s.id === 'Partner sign-off')!;
  const pre = wp.blockers.filter((b) => !['Partner sign-off', 'Client approval'].includes(b.kind));
  return (
    <div className="space-y-6">
      <section>
        <SectionHead title="By area" sub="Preparer, then reviewer, then partner. No one signs a level above their own work. A changed area reopens its sign-offs and lists what changed." />
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
          <table className="w-full min-w-[760px] border-collapse text-base">
            <thead><tr className="text-cap tracking-wide text-fg-3 uppercase"><th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Area</th>{LEVELS.map((l) => <th key={l} className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">{l}</th>)}<th className="border-b border-line bg-panel-2 px-3 py-2 text-left font-semibold">Open</th></tr></thead>
            <tbody>
              {wp.areas.map((a) => (
                <tr key={a.id} className="align-top hover:bg-panel-2">
                  <td className="border-b border-line px-3 py-2"><button type="button" className="font-medium hover:underline" onClick={() => store.go({ page: 'area', id: a.id })}>{AREA[a.id].name}</button><div className="mono text-cap text-fg-3">{a.fingerprint.slice(0, 8)}</div></td>
                  {LEVELS.map((l) => {
                    const so = a.signoffs[l];
                    const preparerId = wp.state.assignments.get(a.id)?.preparer ?? start.preparer;
                    const can = (l === 'preparer' && (me.role === 'preparer' || me.id === preparerId)) || (l === 'reviewer' && ['reviewer', 'partner'].includes(me.role)) || (l === 'partner' && me.role === 'partner');
                    return (
                      <td key={l} className={cx('border-b border-line px-3 py-2', so.state === 'reopened' && 'bg-warn-bg/40')}>
                        <SignState state={so.state} by={so.by} at={so.at} />
                        {so.state === 'reopened' && <div className="mt-1 line-clamp-2 text-cap text-fg-3" title={so.diff.join('\n')}>{so.diff.slice(0, 2).join('; ')}{so.diff.length > 2 ? ` +${so.diff.length - 2}` : ''}</div>}
                        <div className="mt-1 flex gap-1.5">
                          {can && so.state !== 'signed' && <Button size="sm" variant="ghost" onClick={() => store.run((x) => signOff(x, a.id, l))}>{so.state === 'reopened' ? 'Re-sign' : 'Sign'}</Button>}
                          {so.state !== 'missing' && (so.by === me.id || me.role === 'partner') && so.state === 'signed' && <Button size="sm" variant="ghost" onClick={() => store.run((x) => withdrawSignOff(x, a.id, l, 'Withdrawn'))}>Withdraw</Button>}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-line px-3 py-2 text-sm">
                    {a.findingsOpen > 0 && <div className="text-bad">{plural(a.findingsOpen, 'finding')}</div>}
                    {a.proposalsPending > 0 && <div className="text-info">{a.proposalsPending} to approve</div>}
                    {a.notesOpen > 0 && <div className="text-warn">{plural(a.notesOpen, 'note')}</div>}
                    {!a.findingsOpen && !a.proposalsPending && !a.notesOpen && <span className="text-fg-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHead title="Partner sign-off on the whole return" sub="Last before the client approves. It binds to the return's fingerprint; any later change to an amount reopens it." />
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><StepIcon state={partnerStep.met ? 'done' : partner ? 'blocked' : 'na'} /><span className="text-md font-semibold">{partnerStep.met ? 'Signed and current' : partner ? 'Reopened' : 'Not signed'}</span></div>
              <p className="mt-1 text-sm text-fg-2">{partnerStep.how}{partner && <> · <Who id={partner.by} at={partner.at} /></>}</p>
              <p className="mono mt-1 text-cap text-fg-3">Return fingerprint {wp.returnFingerprint}</p>
              {pre.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium">{plural(pre.length, 'item')} still open before the partner can sign:</div>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg-2">
                    {pre.slice(0, 8).map((b, i) => <li key={i}><button type="button" className="text-left hover:underline" onClick={() => openBlocker(b.ref)}><span className="text-fg-3">{b.kind}:</span> {b.text}</button></li>)}
                    {pre.length > 8 && <li className="text-fg-3">and {pre.length - 8} more (Open items)</li>}
                  </ul>
                </div>
              )}
            </div>
            {me.role === 'partner' && !partnerStep.met && <Button variant="primary" icon={<Tick ink="violet" size={14} />} onClick={() => store.run((x) => signOffReturn(x))}>Sign the return</Button>}
          </div>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- notes
function NotesTab({ wp }: { wp: Workpaper }) {
  const actors = useApp((s) => s.actors);
  const now = useNow();
  const today = firmDay(now);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const notes = [...wp.state.notes.values()].filter((n) => (show === 'all' || n.status === 'open')).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-fg-3">{RULE.notesBlock} A review note is cleared by the reviewer who wrote it, or the partner. Notes are added from any number, check, change or document.</p>
        <Segmented value={show} onChange={setShow} options={[{ id: 'open', label: 'Open' }, { id: 'all', label: 'All' }]} />
      </div>
      {notes.length === 0 ? <Empty title="No open notes">Add one from any number's proof.</Empty> : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {notes.map((n) => {
              const a = actors.find((x) => x.id === n.by);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => store.open(`note:${n.id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2">
                    <Avatar actor={a} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="font-medium">{a?.name}</span><span className="text-fg-3">{ago(n.at, now)} on</span><RefChip r={n.target} />{n.kind === 'review' ? <Badge tone={n.blocking && n.status === 'open' ? 'bad' : 'neutral'}>{n.blocking ? 'Blocks filing' : 'Review note'}</Badge> : <Badge>Comment</Badge>}{n.status === 'resolved' && <Badge tone="ok">Cleared</Badge>}{n.assignee && <span className="text-fg-3">for {actors.find((x) => x.id === n.assignee)?.name.split(' ')[0]}</span>}{n.due && n.status === 'open' && <Badge tone={n.due < today ? 'bad' : 'warn'}>{n.due < today ? 'Overdue' : 'Due'} {date(n.due)}</Badge>}</div>
                      <p className="mt-1 text-base">{n.text}</p>
                      {n.thread.length > 0 && <p className="mt-1 text-sm text-fg-3">{n.thread.length} repl{n.thread.length === 1 ? 'y' : 'ies'} · last: {n.thread[n.thread.length - 1].text || n.thread[n.thread.length - 1].kind}</p>}
                    </div>
                    <span className="text-sm text-fg-3">{AREA[n.area].short}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- judgments
function Judgments({ wp }: { wp: Workpaper }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-3">{RULE.authority} Calls marked “partner” need the partner's approval before filing. Suggestions are computed from the current return and can be edited.</p>
      {JUDGMENTS.map((j) => <JudgmentCard key={j.id} j={j} wp={wp} />)}
    </div>
  );
}

function JudgmentCard({ j, wp }: { j: JudgmentTopic; wp: Workpaper }) {
  const me = useMe();
  const rec = wp.state.judgments.get(j.id);
  const n = (k: string) => { const v = wp.ours?.values.get(k); return typeof v === 'number' ? v : 0; };
  const sug = useMemo(() => j.suggest(n), [wp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(sug.decision);
  const [r, setR] = useState(sug.rationale);
  const [a, setA] = useState(sug.authority);
  const canRecord = ['preparer', 'reviewer', 'partner'].includes(me.role);
  const state = !rec ? 'open' : j.needsPartner && !rec.approvedBy ? 'proposed' : 'resolved';
  return (
    <Card pad={false} className={cx(state === 'open' && 'border-l-2 border-l-warn')}>
      <div className="flex flex-wrap items-start gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-md font-semibold">{j.topic}</span><Badge tone="outline">{j.kind}</Badge>{j.needsPartner && <Badge tone="violet">partner</Badge>}<span className="text-sm text-fg-3">{AREA[j.area].short}</span></div>
          <p className="mt-0.5 text-sm text-fg-2">{j.question}</p>
        </div>
        <StatusPill status={state === 'open' ? 'open' : state === 'proposed' ? 'proposed' : 'resolved'} />
      </div>
      {rec ? (
        <div className="space-y-2 border-t border-line px-4 py-3 text-base">
          <p><span className="font-medium">Decision.</span> {rec.decision}</p>
          {rec.rationale && <p className="text-fg-2"><span className="font-medium text-fg">Why.</span> {rec.rationale}</p>}
          <p className="text-fg-2"><span className="font-medium text-fg">Authority.</span> {rec.authority}</p>
          {rec.refs.length > 0 && <div className="flex flex-wrap gap-1">{rec.refs.map((x) => <RefChip key={x} r={x} />)}</div>}
          <div className="flex flex-wrap items-center gap-3 pt-1"><Who id={rec.by} at={rec.at} />{rec.approvedBy && <span className="inline-flex items-center gap-1 text-sm text-ok"><CircleCheck className="size-3.5" />Approved · <Who id={rec.approvedBy} at={rec.approvedAt!} /></span>}</div>
          <div className="flex flex-wrap gap-2">
            {j.needsPartner && !rec.approvedBy && me.role === 'partner' && <Button size="sm" variant="ok" onClick={() => store.run((x) => approveJudgment(x, j.id))}>Approve</Button>}
            {canRecord && <Button size="sm" variant="ghost" onClick={() => { setD(rec.decision); setR(rec.rationale); setA(rec.authority); setOpen(true); }}>Revise</Button>}
          </div>
        </div>
      ) : !open && canRecord ? (
        <div className="border-t border-line px-4 py-3">
          <div className="rounded-md bg-panel-2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-medium"><Sparkles className="size-3.5 text-fg-3" />Suggested from the documents</div>
            <p>{sug.decision}</p>
            <p className="mt-1 text-fg-3">{sug.authority}</p>
          </div>
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => setOpen(true)}>Record this judgment</Button></div>
        </div>
      ) : null}
      {open && (
        <div className="space-y-2.5 border-t border-line bg-panel-2/60 px-4 py-3">
          <Field label="Decision"><TextArea value={d} onChange={(e) => setD(e.target.value)} className="min-h-[60px]" /></Field>
          <Field label="Why"><TextArea value={r} onChange={(e) => setR(e.target.value)} className="min-h-[80px]" /></Field>
          <Field label="Authority relied on"><Input value={a} onChange={(e) => setA(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-1">{sug.refs.map((x) => <RefChip key={x} r={x} />)}</div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => { const res = store.run((x) => recordJudgment(x, j.id, { decision: d, rationale: r, authority: a, refs: sug.refs })); if (res.ok) setOpen(false); }}>Record</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- variances
function Variances({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const [show, setShow] = useState<'flagged' | 'all'>('flagged');
  const [edit, setEdit] = useState<string | null>(null);
  const [text, setText] = useState('');
  const rows = wp.variances.filter((v) => show === 'all' || v.flagged).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const todo = wp.variances.filter((v) => v.flagged && !v.explanation);
  const canExplain = ['preparer', 'reviewer', 'partner'].includes(me.role);
  const useAll = () => {
    const batch = newId('b_');
    store.run((x) => {
      const evs: AnyEvent[] = [];
      for (const v of todo) { const r = explainVariance(x, v.key, v.suggestion, batch); if (!r.ok) return r; evs.push(...r.events); }
      return { ok: true, events: evs, message: `${plural(evs.length, 'variance')} explained with the suggested reasons. One undo reverses them all.` };
    });
  };
  const thr = wp.state.standards.get('variance_review.flag_if_change_over_percent') ?? 10;
  const amt = wp.state.standards.get('variance_review.and_over_amount') ?? 1000;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-3">Against the 2024 return. Flagged when a line moves by more than {String(thr)}% and more than {money(Number(amt))} (firm standard). Suggestions come from the documents; check each one before using it.</p>
        <div className="flex gap-2">
          {todo.length > 0 && canExplain && <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={useAll}>Use suggested for {todo.length}</Button>}
          <Segmented value={show} onChange={setShow} options={[{ id: 'flagged', label: 'Flagged' }, { id: 'all', label: 'All lines' }]} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-1 scroll-thin">
        <table className="w-full min-w-[820px] border-collapse text-base">
          <thead><tr className="text-cap tracking-wide text-fg-3 uppercase">{['Line', '2024', '2025', 'Change', 'Explanation'].map((h, i) => <th key={h} className={cx('border-b border-line bg-panel-2 px-3 py-2 font-semibold', i >= 1 && i <= 3 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.key} className="align-top">
                <td className="border-b border-line px-3 py-2"><button type="button" className="text-left hover:underline" onClick={() => store.open(v.key)}>{v.label}</button><div className="mono text-cap text-fg-3">{v.key}</div></td>
                <td className="num border-b border-line px-3 py-2 text-right text-fg-2">{money(v.prior)}</td>
                <td className="num border-b border-line px-3 py-2 text-right">{money(v.current)}</td>
                <td className={cx('num border-b border-line px-3 py-2 text-right', v.flagged && 'font-medium')}>{signed(v.delta)}<div className="text-cap text-fg-3">{v.pct === null ? 'new' : `${Math.round(v.pct * 100)}%`}</div></td>
                <td className="border-b border-line px-3 py-2">
                  {edit === v.key ? (
                    <div className="space-y-2">
                      <TextArea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[56px]" />
                      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button size="sm" variant="primary" onClick={() => { const r = store.run((x) => explainVariance(x, v.key, text)); if (r.ok) setEdit(null); }}>Save</Button></div>
                    </div>
                  ) : v.explanation ? (
                    <div className="text-sm"><p>{v.explanation.text}</p><div className="mt-1"><Who id={v.explanation.by} at={v.explanation.at} /></div></div>
                  ) : v.flagged ? (
                    <div className="text-sm"><p className="text-fg-3"><span className="font-medium text-fg-2">Suggested:</span> {v.suggestion}</p>{canExplain && <div className="mt-1 flex gap-2"><Button size="sm" variant="ghost" onClick={() => store.run((x) => explainVariance(x, v.key, v.suggestion))}>Use</Button><Button size="sm" variant="ghost" onClick={() => { setText(v.suggestion); setEdit(v.key); }}>Edit</Button></div>}</div>
                  ) : <span className="text-sm text-fg-3">Within threshold</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- steps
function Steps({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <div>
      <p className="mb-3 text-sm text-fg-3">The firm's required steps. Most are met automatically from the work itself; a few are confirmed by a person.</p>
      <Card pad={false}>
        <ol className="divide-y divide-line">
          {wp.steps.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="mono w-5 pt-0.5 text-cap text-fg-3">{i + 1}</span>
              <StepIcon state={s.met ? 'done' : 'open'} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium">{s.id} {s.auto && <Badge tone="outline" className="ml-1">automatic</Badge>}</div>
                <div className="text-sm text-fg-2">{s.how}</div>
                {s.by && s.at && <div className="mt-1"><Who id={s.by} at={s.at} /></div>}
              </div>
              {!s.met && !s.auto && ['preparer', 'reviewer', 'partner'].includes(me.role) && (
                s.id === 'Due diligence completed'
                  ? <Button size="sm" onClick={() => store.go({ page: 'review', tab: 'diligence' })}>Open checklist</Button>
                  : <div className="flex gap-2"><Input value={note[s.id] ?? ''} onChange={(e) => setNote((x) => ({ ...x, [s.id]: e.target.value }))} placeholder="How (optional)" className="w-48" /><Button size="sm" onClick={() => store.run((x) => markStep(x, s.id, note[s.id] || defaultStepNote(s.id)))}>Mark done</Button></div>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

const defaultStepNote = (id: string) => (id === 'Identity verified' ? 'Driver licenses (D04, D05) and IP PIN notice (D03) agree to the organizer.' : id === 'Prior-year return reviewed' ? '2024 return (D06) and prior preparer memo (D07) read; open items carried into this file.' : 'Done.');

// ---------------------------------------------------------------- due diligence
function Diligence({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const done = wp.state.dd;
  const [ans, setAns] = useState<Record<string, string>>(() => Object.fromEntries(DUE_DILIGENCE_QUESTIONS.map((q) => [q.id, done?.answers[q.id] ?? ''])));
  const canDo = ['preparer', 'reviewer', 'partner'].includes(me.role);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-3">{RULE.dueDiligence} This return claims the child tax credit (Theo) and the credit for other dependents (Ada); the American opportunity credit is phased out but was considered.</p>
      {done && <Card className="flex items-center gap-2 border-ok/40 bg-ok-bg/40"><CircleCheck className="size-4 text-ok" /><span className="text-base">Completed</span><Who id={done.by} at={done.at} /></Card>}
      <Card pad={false}>
        <ol className="divide-y divide-line">
          {DUE_DILIGENCE_QUESTIONS.map((q, i) => (
            <li key={q.id} className="px-4 py-3">
              <div className="text-base font-medium"><span className="mono mr-2 text-cap text-fg-3">{i + 1}</span>{q.q}</div>
              {done ? <p className="mt-1 text-base text-fg-2">{done.answers[q.id]}</p> : (
                <div className="mt-2 space-y-1.5">
                  <TextArea value={ans[q.id]} onChange={(e) => setAns((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Answer" className="min-h-[52px]" disabled={!canDo} />
                  {canDo && !ans[q.id] && <button type="button" className="text-sm text-fg-3 hover:text-fg" onClick={() => setAns((a) => ({ ...a, [q.id]: q.suggested }))}>Use suggested: “{q.suggested.slice(0, 90)}{q.suggested.length > 90 ? '…' : ''}”</button>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>
      {!done && canDo && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAns(Object.fromEntries(DUE_DILIGENCE_QUESTIONS.map((q) => [q.id, q.suggested])))}>Fill all suggested</Button>
          <Button variant="primary" onClick={() => store.run((x) => completeDueDiligence(x, ans))}>Complete Form 8867 checklist</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- diagnostics
function Diagnostics({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [disp, setDisp] = useState<'resolved' | 'accepted' | 'outside-scope'>('accepted');
  const [reason, setReason] = useState('');
  if (!wp.diagnostics.length) return <Empty title="No engine diagnostics" />;
  return (
    <div>
      <p className="mb-3 text-sm text-fg-3">Messages from the engine's {wp.version?.version} run. Most are resolved automatically by the work that answers them; the rest need a recorded disposition.</p>
      <Card pad={false}>
        <ul className="divide-y divide-line">
          {wp.diagnostics.map((d) => (
            <li key={d.code} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <StatusPill status={d.status === 'open' ? 'open' : 'resolved'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="mono text-sm font-medium">{d.code}</span><Badge tone={d.severity === 'warning' ? 'warn' : 'neutral'}>{d.severity}</Badge></div>
                  <p className="mt-0.5 text-base">{d.message}</p>
                  <p className="mt-1 text-sm text-fg-3">{d.how}</p>
                  {d.refs.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.refs.map((r) => <RefChip key={r} r={r} />)}</div>}
                </div>
                {d.status === 'open' && ['preparer', 'reviewer', 'partner'].includes(me.role) && <Button size="sm" variant="ghost" onClick={() => { setOpen(d.code); setReason(''); }}>Dispose</Button>}
              </div>
              {open === d.code && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-panel-2 p-2.5">
                  <Select value={disp} onChange={(v) => setDisp(v as typeof disp)} options={[{ id: 'accepted', label: 'Accepted as is' }, { id: 'resolved', label: 'Resolved' }, { id: 'outside-scope', label: 'Outside this engagement' }]} className="w-52" />
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" className="min-w-[220px] flex-1" />
                  <Button size="sm" variant="primary" onClick={() => { const r = store.run((x) => disposeDiag(x, d.code, disp, reason)); if (r.ok) setOpen(null); }}>Record</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
