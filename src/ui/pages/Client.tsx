import { CheckCircle2, Download, FileSignature, MessageSquare, Paperclip, Send, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { answerClient, askClient, attach, clientApprove, clientMessage, verify } from '../../app/actions';
import { putFile, sha256Blob } from '../../app/persist';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREAS, type AreaId } from '../../engine/areas';
import type { Workpaper } from '../../engine/workpaper';
import { ago, date, dateTime, money } from '../format';
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHead, SectionHead, Select, Tabs, TextArea, Tick, cx } from '../kit';
import { RefChip } from '../Ref';
import { Who } from '../drawer/widgets';
import { StepIcon, outcome, useNow } from './common';
import { clientCopyHtml } from './filingDocs';
import { firmDay } from '../../engine/time';

export function ClientPage() {
  const me = useMe();
  return me.role === 'client' ? <Portal /> : <StaffClient />;
}

// ---------------------------------------------------------------- staff view
function StaffClient() {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const now = useNow();
  const [tab, setTab] = useState<'questions' | 'messages' | 'organizer' | 'calls'>('questions');
  const qs = [...wp.state.questions.values()].sort((a, b) => b.at.localeCompare(a.at));
  const verified = (id: string) => wp.state.verifications.find((v) => v.target === `question:${id}`);
  const msgs = [
    ...ix.packet.client.messages.filter((m) => m.sent_at <= wp.asOf).map((m) => ({ id: m.id, at: m.sent_at, from: m.from, text: m.text, packet: true })),
    ...wp.state.clientMessages.map((m) => ({ id: m.id, at: m.at, from: actors.find((a) => a.id === m.by)?.name ?? m.by, text: m.text, packet: false })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const [area, setArea] = useState<AreaId>('intake');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const canAsk = ['preparer', 'reviewer', 'partner'].includes(me.role);
  return (
    <div>
      <PageHead eyebrow="People" title="Client" sub="Questions to the client and their answers become evidence in the file: an answer is verified, linked to the numbers it supports, and kept with the return." right={<Badge tone={wp.clientApprovalState === 'current' ? 'ok' : wp.clientApprovalState === 'lapsed' ? 'bad' : 'neutral'} dot>{wp.clientApprovalState === 'current' ? 'Client approved; 8879 signed' : wp.clientApprovalState === 'lapsed' ? 'Approval lapsed' : 'Not yet approved by the client'}</Badge>} />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { id: 'questions', label: 'Questions', count: qs.filter((q) => !q.answer).length || undefined },
        { id: 'messages', label: 'Messages', count: msgs.length },
        { id: 'organizer', label: 'Organizer answers', count: ix.packet.client.questionnaire.length },
        { id: 'calls', label: 'Call notes', count: ix.packet.client.call_notes.filter((c) => c.date <= wp.asOf).length },
      ]} />
      {tab === 'questions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {qs.length === 0 ? <Empty title="No questions yet">Ask from any number, check or document, or here.</Empty> : qs.map((q) => {
              const v = verified(q.id);
              const by = actors.find((a) => a.id === q.by);
              return (
                <Card key={q.id} pad={false}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Avatar actor={by} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3"><span className="font-medium text-fg">{by?.name}</span>asked {ago(q.at, now)} · on <RefChip r={q.target} />{q.due && <Badge tone="warn">due {date(q.due)}</Badge>}</div>
                      <p className="mt-1 text-[13.5px]">{q.text}</p>
                    </div>
                  </div>
                  <div className="border-t border-line bg-panel-2/60 px-4 py-3">
                    {q.answer ? (
                      <div className="text-[13px]">
                        <div className="mb-1 flex flex-wrap items-center gap-2"><Avatar actor={actors.find((a) => a.id === q.answer!.by)} size={18} /><span className="font-medium">{actors.find((a) => a.id === q.answer!.by)?.name}</span><span className="text-[12px] text-fg-3">answered {ago(q.answer.at, now)}</span></div>
                        <p className="serif text-[14px]">“{q.answer.text}”</p>
                        {q.answer.attachments.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-fg-2">{q.answer.attachments.map((a) => <span key={a} className="inline-flex items-center gap-1"><Paperclip className="size-3" />{a}</span>)}</div>}
                        <div className="mt-2">{v ? <span className="inline-flex items-center gap-1.5 text-[12px] text-ok"><Tick ink={actors.find((a) => a.id === v.by)?.ink} size={14} />Accepted as evidence · <Who id={v.by} at={v.at} /></span>
                          : canAsk && <Button size="sm" icon={<ShieldCheck className="size-3.5" />} onClick={() => store.run((x) => verify(x, `question:${q.id}`, 'confirmed_with_client', `Client answer accepted as evidence for ${q.target}`, [q.target]))}>Accept as evidence</Button>}</div>
                      </div>
                    ) : <span className="text-[12.5px] text-fg-3">Waiting for the client. It appears in their portal.</span>}
                  </div>
                </Card>
              );
            })}
          </div>
          {canAsk && (
            <Card className="h-fit space-y-3">
              <div className="text-[14px] font-semibold">Ask the client</div>
              <Field label="Area"><Select value={area} onChange={(v) => setArea(v as AreaId)} options={AREAS.map((a) => ({ id: a.id, label: a.name }))} /></Field>
              <Field label="Question"><TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Plain words; one question at a time" /></Field>
              <Field label="Answer by (optional)"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              <Button variant="primary" icon={<Send className="size-3.5" />} disabled={!text.trim()} onClick={() => { const r = store.run((x) => askClient(x, { target: area, area, text, due: due || null })); if (r.ok) { setText(''); setDue(''); } }}>Send to portal</Button>
              <p className="text-[12px] text-fg-3">To tie a question to a number, ask it from that number's proof instead.</p>
            </Card>
          )}
        </div>
      )}
      {tab === 'messages' && (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {msgs.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                <MessageSquare className="mt-0.5 size-4 text-fg-3" />
                <div className="min-w-0 flex-1"><div className="text-[12px] text-fg-3"><span className="font-medium text-fg">{m.from}</span> · {dateTime(m.at)}{m.packet && <span className="mono ml-2">{m.id}</span>}</div><p className="mt-0.5 text-[13px]">{m.text}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === 'organizer' && (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {ix.packet.client.questionnaire.map((q) => (
              <li key={q.id} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="text-[12.5px] text-fg-2"><span className="mono mr-2 text-[11px] text-fg-3">{q.id}</span>{q.question}</div>
                <div className="text-[13px]">“{q.answer}” <span className="text-[11.5px] text-fg-3">— {q.answered_by}</span></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === 'calls' && (
        <div className="space-y-3">
          {ix.packet.client.call_notes.filter((c) => c.date <= wp.asOf).map((c) => (
            <Card key={c.id}><div className="text-[12px] text-fg-3">{dateTime(c.date)} · {c.participants.join(', ')} <span className="mono ml-1">{c.id}</span></div><ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- client portal
function Portal() {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const now = useNow();
  const firm = ix.packet.firm;
  const partnerSigned = wp.steps.find((s) => s.id === 'Partner sign-off')?.met;
  const approved = wp.clientApprovalState === 'current';
  const filed = !!wp.state.frozen;
  const open = [...wp.state.questions.values()].filter((q) => !q.answer);
  const answered = [...wp.state.questions.values()].filter((q) => q.answer);
  const stages: [string, boolean][] = [['Documents received', true], ['Your CPA prepares and reviews', !!partnerSigned], ['You approve and sign', approved || filed], ['Filed and accepted', filed]];
  return (
    <div className="mx-auto max-w-[880px]">
      <PageHead eyebrow={firm.name} title={`Hello, ${me.name.split(' ')[0]}`} sub="Your 2025 federal and California returns. Everything your CPA needs from you is here." />
      <Card className="mb-6">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {stages.map(([l, d], i) => (
            <li key={l} className="flex items-center gap-2 text-[13px]"><StepIcon state={d ? 'done' : i === stages.findIndex(([, x]) => !x) ? 'open' : 'na'} /><span className={cx(d ? 'font-medium' : 'text-fg-2')}>{l}</span></li>
          ))}
        </ol>
      </Card>

      {open.length > 0 && (
        <section className="mb-6">
          <SectionHead title={`Questions from your CPA (${open.length})`} sub="Your answers go straight into your file." />
          <div className="space-y-3">{open.map((q) => <AnswerCard key={q.id} id={q.id} text={q.text} due={q.due} />)}</div>
        </section>
      )}

      <section className="mb-6">
        <SectionHead title="Your return" />
        {!partnerSigned && !filed ? (
          <Card><p className="text-[13.5px]">Your CPA is still preparing and reviewing your return. When it's ready you'll review the results here and sign the e-file authorization (Form 8879).</p></Card>
        ) : <ApproveCard wp={wp} />}
      </section>

      {answered.length > 0 && (
        <section className="mb-6">
          <SectionHead title="Answered" />
          <Card pad={false}>
            <ul className="divide-y divide-line">{answered.map((q) => <li key={q.id} className="px-4 py-2.5 text-[13px]"><div className="text-fg-2">{q.text}</div><div className="mt-0.5">“{q.answer!.text}” <span className="text-[12px] text-fg-3">· {ago(q.answer!.at, now)}</span></div></li>)}</ul>
          </Card>
        </section>
      )}

      <MessageBox />
    </div>
  );
}

function AnswerCard({ id, text, due }: { id: string; text: string; due: string | null }) {
  const now = useNow();
  const [a, setA] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (f: File) => {
    const sha = await sha256Blob(f);
    const r = store.run((x) => attach(x, { target: `question:${id}`, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, sha256: sha, kind: 'file', text: null }), { quiet: true });
    if (r.ok) { await putFile((r.events[0].payload as { id: string }).id, f); setFiles((x) => [...x, f.name]); }
  };
  return (
    <Card>
      <p className="text-[14px] font-medium">{text}</p>
      {due && (due < firmDay(now) ? <p className="mt-0.5 text-[12px] text-bad">This was due {date(due)}. Please answer as soon as you can.</p> : <p className="mt-0.5 text-[12px] text-warn">Please answer by {date(due)}</p>)}
      <TextArea className="mt-3" value={a} onChange={(e) => setA(e.target.value)} placeholder="Your answer" />
      {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-fg-2">{files.map((f) => <span key={f} className="inline-flex items-center gap-1"><Paperclip className="size-3" />{f}</span>)}</div>}
      <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      <div className="mt-2 flex justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<Paperclip className="size-3.5" />} onClick={() => input.current?.click()}>Attach a photo or file</Button>
        <Button size="sm" variant="primary" onClick={() => { const r = store.run((x) => answerClient(x, id, a, files)); if (r.ok) { setA(''); setFiles([]); } }}>Send answer</Button>
      </div>
    </Card>
  );
}

function ApproveCard({ wp }: { wp: Workpaper }) {
  const me = useMe();
  const ix = useApp((s) => s.ix)!;
  const [tp, setTp] = useState('');
  const [sp, setSp] = useState('');
  const [agree, setAgree] = useState(false);
  const s = wp.summary.ours!;
  const fed = outcome(s.federal);
  const ca = outcome(s.california);
  const py = ix.packet.prior_years.return_2024.lines;
  const amending = wp.state.amendments.some((a) => !a.filed);
  const filed = amending ? null : wp.state.frozen;
  const people = ix.packet.household.people;
  return (
    <Card pad={false}>
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
        {[['Federal', fed, s.federal.totalTax, Number(py['F1040.24'])] as const, ['California', ca, s.california.totalTax, Number(py['CA540.64'])] as const].map(([t, o, tax, pt]) => (
          <div key={t} className="bg-panel p-5">
            <div className="eyebrow">{t}</div>
            <div className="mt-1 text-[13px] text-fg-2">{o.kind === 'refund' ? 'Your refund' : o.kind === 'owe' ? 'You owe' : 'Nothing due'}</div>
            <div className={cx('num text-[30px] leading-tight font-semibold', o.kind === 'refund' && 'text-ok')}>{money(o.amount)}</div>
            <div className="mt-1 text-[12.5px] text-fg-3">Total tax {money(tax)} · last year {money(pt)}</div>
          </div>
        ))}
      </div>
      <details className="border-t border-line px-5 py-3 text-[13px]">
        <summary className="cursor-pointer font-medium">The main figures, with last year</summary>
        <table className="mt-2 w-full border-collapse text-[13px]">
          <thead><tr className="text-[11px] tracking-wide text-fg-3 uppercase"><th className="py-1 text-left font-semibold">Federal</th><th className="py-1 text-right font-semibold">2024</th><th className="py-1 text-right font-semibold">2025</th></tr></thead>
          <tbody>
            {([['F1040.1a', 'Wages', 'F1040.1a'], ['F1040.9', 'Total income', 'F1040.9'], ['F1040.11', 'Adjusted gross income', 'F1040.11'], ['F1040.12', 'Deductions', 'F1040.12'], ['F1040.15', 'Taxable income', 'F1040.15'], ['F1040.24', 'Total tax', 'F1040.24'], ['F1040.33', 'Payments and withholding', 'F1040.33'], ['F540NR.64', 'California tax', 'CA540.64']] as const).map(([k, l, pk]) => (
              <tr key={k} className="border-t border-line"><td className="py-1.5">{l}</td><td className="num py-1.5 text-right text-fg-3">{typeof py[pk] === 'number' ? money(Number(py[pk])) : '—'}</td><td className="num py-1.5 text-right font-medium">{money(Number(wp.ours!.values.get(k) ?? 0))}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="space-y-3 border-t border-line px-5 py-4 text-[13px]">
        {filed ? (
          <div className="flex flex-wrap items-center gap-3">
            <CheckCircle2 className="size-5 text-ok" />
            <span className="flex-1">Filed and accepted by the IRS and the California FTB on {date(filed.at)}.</span>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(clientCopyHtml(wp, ix)); w.document.close(); } }}>Your copy</Button>
          </div>
        ) : wp.clientApprovalState === 'current' ? (
          <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-ok" /><span>You approved this return and signed Form 8879 on {date(wp.state.clientApproval!.at)}. Your CPA will file it.</span></div>
        ) : (
          <>
            {amending ? <p className="rounded-md bg-warn-bg px-3 py-2">Your CPA has prepared an amended return. Please review the figures and sign again.</p> : wp.clientApprovalState === 'lapsed' && <p className="rounded-md bg-warn-bg px-3 py-2">The amounts changed after you approved, so we need your approval again.</p>}
            <p>By signing, you declare that you have examined this return and it is true, correct and complete to the best of your knowledge, and you authorize {ix.packet.firm.name} to file it electronically.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`${people[0].name} — five-digit PIN`}><Input value={tp} onChange={(e) => setTp(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" type="password" autoComplete="off" /></Field>
              <Field label={`${people[1].name} — five-digit PIN`}><Input value={sp} onChange={(e) => setSp(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" type="password" autoComplete="off" /></Field>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />We have reviewed the summary and approve the return.</label>
            <div className="flex justify-end"><Button variant="primary" icon={<FileSignature className="size-4" />} disabled={!agree || tp.length !== 5 || sp.length !== 5} onClick={() => store.run((x) => clientApprove(x, { taxpayer: tp, spouse: sp }))}>Approve and sign as {me.name.split(' ')[0]}</Button></div>
            <p className="text-[12px] text-fg-3">Both of you can sign from either account. PINs are not stored; only the fact of signing and the amounts you approved are kept.</p>
          </>
        )}
      </div>
    </Card>
  );
}

function MessageBox() {
  const [t, setT] = useState('');
  return (
    <section>
      <SectionHead title="Message your CPA" />
      <Card>
        <TextArea value={t} onChange={(e) => setT(e.target.value)} placeholder="Anything we should know?" />
        <div className="mt-2 flex justify-end"><Button size="sm" icon={<Send className="size-3.5" />} disabled={!t.trim()} onClick={() => { const r = store.run((x) => clientMessage(x, t)); if (r.ok) setT(''); }}>Send</Button></div>
      </Card>
    </section>
  );
}
