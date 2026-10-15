import { ChevronRight, Eye, EyeOff, MessageSquarePlus, Paperclip, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { addNote, askClient, attach, reply, resolveNote, reveal, verify } from '../../app/actions';
import { putFile, sha256Blob } from '../../app/persist';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import type { AreaId } from '../../engine/areas';
import { VERIFICATION_LABEL, type VerificationType } from '../../engine/events';
import { maskAccount, maskSsn } from '../../engine/people';
import { firmDay } from '../../engine/time';
import { ago, date, dateTime } from '../format';
import { Avatar, Badge, Button, Checkbox, Input, Select, TextArea, Tick, cx } from '../kit';
import { RefChip } from '../Ref';

/** A proof section. Sections fold, so the drawer opens on the questions that matter first. */
export function Section({ title, right, children, className, defaultOpen = true, count }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx('border-t border-line px-5 sm:px-6', className)}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-13 flex-1 items-center gap-2 py-3 text-left">
          <ChevronRight className={cx('size-4 shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
          <h3 className="text-md font-semibold">{title}</h3>
          {count !== undefined && count > 0 && <span className="num rounded-full bg-sunk px-2 text-cap font-medium text-fg-2">{count}</span>}
        </button>
        {right && <span className="text-fg-3 [&_svg]:size-4">{right}</span>}
      </div>
      {open && <div className="pb-5">{children}</div>}
    </section>
  );
}

const METHODS: VerificationType[] = ['agreed_to_source_document', 'recalculated', 'confirmed_with_client', 'agreed_to_prior_year', 'agreed_to_third_party_record'];

export function Verifications({ target, compact }: { target: string; compact?: boolean }) {
  const wp = useWorkpaper();
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const now = store.now();
  const list = wp.state.verifications.filter((v) => v.target === target);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<VerificationType>('agreed_to_source_document');
  const [note, setNote] = useState('');
  const standards = (wp.state.standards.get('verification_types') as string[] | undefined) ?? METHODS;
  return (
    <div className="space-y-2">
      {list.length === 0 && !compact && <p className="text-sm text-fg-3">Not verified yet.</p>}
      {list.map((v) => {
        const a = actors.find((x) => x.id === v.by);
        return (
          <div key={v.eventId} className="flex items-start gap-2 text-sm">
            <Tick ink={a?.ink} size={15} title={`${VERIFICATION_LABEL[v.method]} by ${a?.name}`} />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{VERIFICATION_LABEL[v.method] ?? v.method}</span>
              <span className="text-fg-3"> · {a?.name} · {ago(v.at, now)}</span>
              {v.note && <div className="text-fg-2">{v.note}</div>}
              {v.evidence.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{v.evidence.map((e) => <RefChip key={e} r={e} />)}</div>}
            </div>
          </div>
        );
      })}
      {me.role !== 'client' && !open && <Button size="sm" icon={<ShieldCheck className="size-3.5" />} onClick={() => setOpen(true)}>Record how this was verified</Button>}
      {open && (
        <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-3">
          <Select value={method} onChange={(v) => setMethod(v as VerificationType)} options={standards.map((m) => ({ id: m, label: VERIFICATION_LABEL[m] ?? m }))} />
          <TextArea placeholder="What you compared it with (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[56px]" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => { const r = store.run((x) => verify(x, target, method, note)); if (r.ok) { setOpen(false); setNote(''); } }}>Record</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Notes({ target, area }: { target: string; area: AreaId }) {
  const wp = useWorkpaper();
  const actors = useApp((s) => s.actors);
  const me = useMe();
  const now = store.now();
  const notes = [...wp.state.notes.values()].filter((n) => n.target === target);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'comment' | 'review'>(me.role === 'reviewer' || me.role === 'partner' ? 'review' : 'comment');
  const [blocking, setBlocking] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const canReview = me.role === 'reviewer' || me.role === 'partner';
  // Who a note can be handed to: engagement staff who are active on the season clock, other than the writer.
  const today = firmDay(now);
  const staff = actors.filter((a) => ['preparer', 'reviewer', 'partner'].includes(a.role) && a.id !== me.id && today >= a.activeFrom);
  return (
    <div className="space-y-3">
      {notes.map((n) => {
        const a = actors.find((x) => x.id === n.by);
        return (
          <div key={n.id} className={cx('rounded-lg border p-3', n.status === 'open' && n.blocking ? 'border-bad/40 bg-bad-bg/40' : 'border-line bg-panel-2')}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-sm">
              <Avatar actor={a} size={18} />
              <span className="font-medium">{a?.name}</span>
              <span className="text-fg-3">{ago(n.at, now)}</span>
              {n.kind === 'review' && <Badge tone={n.blocking && n.status === 'open' ? 'bad' : 'neutral'}>{n.blocking ? 'Review note · blocks filing' : 'Review note'}</Badge>}
              {n.status === 'resolved' && <Badge tone="ok">Cleared</Badge>}
              {n.assignee && <span className="inline-flex items-center gap-1 text-fg-3">· for <Avatar actor={actors.find((x) => x.id === n.assignee)} size={14} />{actors.find((x) => x.id === n.assignee)?.name.split(' ')[0] ?? n.assignee}</span>}
              {n.due && n.status === 'open' && <Badge tone={n.due < today ? 'bad' : 'warn'}>{n.due < today ? 'Overdue' : 'Due'} {date(n.due)}</Badge>}
              {n.due && n.status !== 'open' && <span className="text-fg-3">· was due {date(n.due)}</span>}
            </div>
            <p className="text-base whitespace-pre-wrap">{n.text}</p>
            {n.thread.map((t, i) => {
              const ta = actors.find((x) => x.id === t.by);
              return (
                <div key={i} className="mt-2 flex gap-2 border-l-2 border-line-2 pl-2.5 text-sm">
                  <Avatar actor={ta} size={16} />
                  <div><span className="font-medium">{ta?.name.split(' ')[0]}</span> <span className="text-fg-3">{t.kind === 'resolve' ? 'cleared' : t.kind === 'reopen' ? 'reopened' : 'replied'} · {ago(t.at, now)}</span>{t.text && <div className="text-fg-2">{t.text}</div>}</div>
                </div>
              );
            })}
            {me.role !== 'client' && n.status === 'open' && (
              replyTo === n.id ? (
                <div className="mt-2 space-y-2">
                  <TextArea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Reply" className="min-h-[52px]" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => { const r = store.run((x) => reply(x, n.id, replyText)); if (r.ok) { setReplyTo(null); setReplyText(''); } }}>Reply</Button>
                    {(n.by === me.id || me.role === 'partner' || n.kind !== 'review') && <Button size="sm" variant="ok" onClick={() => { const r = store.run((x) => resolveNote(x, n.id, replyText)); if (r.ok) { setReplyTo(null); setReplyText(''); } }}>Clear note</Button>}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setReplyTo(n.id)}>Reply or clear</Button>
                </div>
              )
            )}
          </div>
        );
      })}
      {me.role !== 'client' && (
        <div className="space-y-2">
          <TextArea placeholder={canReview ? 'Write a review note or comment' : 'Write a note for the reviewer'} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[56px]" />
          <div className="flex flex-wrap items-center gap-3">
            {canReview && (
              <Select value={kind} onChange={(v) => setKind(v as 'comment' | 'review')} options={[{ id: 'review', label: 'Review note' }, { id: 'comment', label: 'Comment' }]} className="w-36" />
            )}
            {kind === 'review' && canReview && <Checkbox checked={blocking} onChange={setBlocking} label="Blocks filing" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-3">
              <span>For</span>
              <Select value={assignee} onChange={setAssignee} options={[{ id: '', label: kind === 'review' && canReview ? 'The preparer' : 'No one in particular' }, ...staff.map((a) => ({ id: a.id, label: `${a.name} · ${a.roleLabel.toLowerCase()}` }))]} className="w-48" />
              <span>by</span>
              <div className="w-40"><Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date" /></div>
            </div>
            <Button size="sm" icon={<MessageSquarePlus className="size-3.5" />} disabled={!text.trim()}
              onClick={() => { const r = store.run((x) => addNote(x, { kind: canReview ? kind : 'comment', target, area, text, blocking: canReview && kind === 'review' ? blocking : false, assignee: assignee || null, due: due || null })); if (r.ok) { setText(''); setAssignee(''); setDue(''); } }}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Attachments({ target }: { target: string }) {
  const wp = useWorkpaper();
  const actors = useApp((s) => s.actors);
  const now = store.now();
  const me = useMe();
  const files = [...wp.state.attachments.values()].filter((a) => a.target === target);
  const input = useRef<HTMLInputElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [text, setText] = useState('');
  const onFile = async (f: File) => {
    const sha = await sha256Blob(f);
    const r = store.run((x) => attach(x, { target, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, sha256: sha, kind: 'file', text: null }));
    if (r.ok) {
      const id = (r.events[0].payload as { id: string }).id;
      const ok = await putFile(id, f);
      if (!ok) store.toast('The file is recorded in the log, but this browser could not store its contents.', 'error');
    }
  };
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div key={f.id} className="flex items-start gap-2 text-sm">
          <Paperclip className="mt-0.5 size-3.5 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{f.kind === 'file' ? f.name : f.kind === 'note' ? 'Note' : f.name}</div>
            {f.text && <div className="whitespace-pre-wrap text-fg-2">{f.text}</div>}
            <div className="text-fg-3">{actors.find((a) => a.id === f.by)?.name} · {ago(f.at, now)}{f.kind === 'file' ? ` · ${(f.size / 1024).toFixed(0)} KB · sha256 ${f.sha256.slice(0, 10)}…` : ''}</div>
          </div>
        </div>
      ))}
      <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      {(me.role !== 'firm_administrator') && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Paperclip className="size-3.5" />} onClick={() => input.current?.click()}>Attach a file</Button>
          <Button size="sm" variant="ghost" onClick={() => setNoteOpen((o) => !o)}>Add a note or message as evidence</Button>
        </div>
      )}
      {noteOpen && (
        <div className="space-y-2">
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email, text message or note" />
          <div className="flex justify-end"><Button size="sm" onClick={() => { const r = store.run((x) => attach(x, { target, name: 'Note', mime: 'text/plain', size: text.length, sha256: '', kind: 'note', text })); if (r.ok) { setText(''); setNoteOpen(false); } }}>Add as evidence</Button></div>
        </div>
      )}
    </div>
  );
}

export function AskClient({ target, area, suggestion }: { target: string; area: AreaId; suggestion?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(suggestion ?? '');
  const me = useMe();
  if (me.role === 'client' || me.role === 'firm_administrator') return null;
  return open ? (
    <div className="space-y-2">
      <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Question for the client (appears in their portal)" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={() => { const r = store.run((x) => askClient(x, { target, area, text, due: null })); if (r.ok) { setOpen(false); setText(''); } }}>Send to client</Button>
      </div>
    </div>
  ) : (
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Ask the client</Button>
  );
}

/** Masked identifiers. Revealing needs clearance and is logged. */
export function Sensitive({ value, subject, field, kind = 'ssn' }: { value: string; subject: string; field: string; kind?: 'ssn' | 'account' | 'pin' }) {
  const me = useMe();
  const wp = useWorkpaper();
  const shown = wp.state.reveals.some((r) => r.by === me.id && r.subject === subject && r.field === field && Date.parse(store.now()) - Date.parse(r.at) < 15 * 60000);
  const masked = kind === 'ssn' ? maskSsn(value) : kind === 'account' ? maskAccount(value) : '•'.repeat(value.length);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="mono num">{shown ? value : masked}</span>
      {me.role !== 'client' && (
        <button type="button" className="text-fg-3 hover:text-fg" title={me.clearance ? (shown ? 'Shown (logged)' : 'Show — this view is logged') : 'Needs sensitive-data clearance'}
          onClick={() => { if (!shown) store.run((x) => reveal(x, subject, field, 'Viewed in the workpaper'), { undoable: false }); }}>
          {shown ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      )}
    </span>
  );
}

export function Who({ id, at }: { id: string; at: string }) {
  const actors = useApp((s) => s.actors);
  const a = actors.find((x) => x.id === id);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-fg-2">
      <Avatar actor={a} size={16} />
      <span>{a?.name ?? id}</span>
      <span className="text-fg-3">· {dateTime(at)}</span>
    </span>
  );
}
