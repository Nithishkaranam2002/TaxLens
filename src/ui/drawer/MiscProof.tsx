import { FileText } from 'lucide-react';
import { pointer, resolveRef } from '../../app/refs';
import { store, useApp, useWorkpaper } from '../../app/store';
import { rereadValue } from '../../engine/checks/reread';
import { date, money } from '../format';
import { Badge, Button, KV, StatusPill } from '../kit';
import { RefChip } from '../Ref';
import { Notes, Section, Sensitive, Verifications } from './widgets';

export function EvProof({ id }: { id: string }) {
  const ix = useApp((s) => s.ix)!;
  const wp = useWorkpaper();
  const e = ix.evs.get(id);
  if (!e) return <div className="p-5 text-fg-3">Unknown value.</div>;
  const doc = ix.docs.get(e.document_id)!;
  const rr = rereadValue(e, ix.page(e.document_id, e.page));
  const uses = ix.versionOrder.map((v) => ({ v, lines: ix.evUses.get(v)?.get(id) ?? [] }));
  return (
    <div>
      <div className="px-5 pt-4 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="mono text-[12px] text-fg-3">{e.id}</span><Badge tone="outline">{e.value_type}</Badge>{rr.kind !== 'ok' && rr.kind !== 'skipped' && <Badge tone={rr.kind === 'zero-not-printed' ? 'neutral' : 'bad'}>{rr.kind.replace(/-/g, ' ')}</Badge>}</div>
        <h2 className="text-[17px] leading-snug font-semibold">{e.label}</h2>
        <div className="num mt-2 text-[22px] font-semibold">{e.value === null ? '—' : typeof e.value === 'number' ? money(e.value, { cents: e.value % 1 !== 0 }) : e.value_type === 'ssn' ? <Sensitive value={String(e.value)} subject={e.id} field="value" /> : String(e.value)}</div>
        {rr.reason && <p className="mt-2 rounded-md bg-bad-bg/60 px-3 py-2 text-[12.5px]">{rr.reason}</p>}
      </div>
      <Section title="As read">
        <KV k="Document"><button type="button" className="hover:underline" onClick={() => store.open(`doc:${e.document_id}#page${e.page}@${e.id}`)}>{doc.id} · {doc.title}</button></KV>
        <KV k="Page">{e.page}</KV>
        <KV k="Field">{e.field}</KV>
        <KV k="Text as read"><span className="mono">{e.text_as_read || '(blank)'}</span></KV>
        <KV k="Confidence"><span className="num">{e.confidence.toFixed(2)}</span></KV>
        <div className="mt-3"><Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => store.open(`doc:${e.document_id}#page${e.page}@${e.id}`)}>Open the page with this field highlighted</Button></div>
      </Section>
      <Section title="Where it landed">
        {uses.every((u) => !u.lines.length) ? <p className="text-[12.5px] text-fg-3">Not used on any line. {wp.docs.find((d) => d.doc.id === e.document_id)?.reason}</p> : (
          <div className="space-y-1.5">{uses.filter((u) => u.lines.length).map((u) => <div key={u.v} className="flex flex-wrap items-center gap-1.5 text-[12.5px]"><span className="w-7 text-fg-3">{u.v}</span>{u.lines.map((l) => <RefChip key={l} r={l} />)}</div>)}</div>
        )}
      </Section>
      <Section title="Verification"><Verifications target={id} /></Section>
      <Section title="Notes"><Notes target={id} area={wp.docs.find((d) => d.doc.id === e.document_id)?.area ?? 'intake'} /></Section>
    </div>
  );
}

export function NoteProof({ id }: { id: string }) {
  const wp = useWorkpaper();
  const n = wp.state.notes.get(id);
  if (!n) return <div className="p-5 text-fg-3">Note not found at this point in the season.</div>;
  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <div className="mb-1 flex items-center gap-1.5"><Badge tone={n.blocking && n.status === 'open' ? 'bad' : 'neutral'}>{n.kind === 'review' ? 'Review note' : 'Note'}</Badge><StatusPill status={n.status === 'open' ? 'open' : 'resolved'} /></div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-2">On <RefChip r={n.target} /></div>
      </div>
      <Section title="Thread"><Notes target={n.target} area={n.area} /></Section>
    </div>
  );
}

export function RefProof({ r }: { r: string }) {
  const ix = useApp((s) => s.ix)!;
  const wp = useWorkpaper();
  const info = resolveRef(ix, wp, r);
  const p = ix.packet;
  let body: React.ReactNode = null;
  if (info.kind === 'qa') {
    const q = ix.qa.get(r)!;
    body = <><Quote text={q.answer} who={`${q.answered_by}, ${date(q.answered_at)}`} /></>;
  } else if (info.kind === 'msg') {
    const m = ix.messages.get(r)!;
    body = <Quote text={m.text} who={`${m.from} → ${m.to}, ${date(m.sent_at)}`} />;
  } else if (info.kind === 'call') {
    const c = ix.calls.get(r)!;
    body = <ul className="list-disc space-y-1 pl-5 text-[13px]">{c.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  } else if (info.kind === 'py' || info.kind === 'agency') {
    const root = info.kind === 'py' ? p.prior_years : p.tax_agency_records;
    const v = pointer(root, r.slice(info.kind === 'py' ? 3 : 7));
    body = <pre className="mono max-h-80 overflow-auto rounded-lg bg-panel-2 p-3 text-[11.5px] whitespace-pre-wrap scroll-thin">{JSON.stringify(v, null, 2)}</pre>;
  } else if (info.kind === 'household') {
    const person = ix.people.get(r.slice(10))!;
    const fixed = wp.dataFixes.get(`${r}.ssn`);
    body = (
      <div>
        <KV k="Name">{person.name}</KV>
        <KV k="Role">{person.role}{person.relationship ? ` · ${person.relationship}` : ''}</KV>
        <KV k="Born">{person.dob}</KV>
        <KV k="SSN (organizer)"><Sensitive value={person.ssn} subject={r} field="ssn" /></KV>
        {fixed && <KV k="SSN (corrected)"><Sensitive value={fixed} subject={r} field="ssn-corrected" /></KV>}
        {person.ip_pin && <KV k="IP PIN"><Sensitive value={person.ip_pin} subject={r} field="ip_pin" kind="pin" /></KV>}
        {person.note && <KV k="Note">{person.note}</KV>}
      </div>
    );
  } else if (info.kind === 'asset') {
    const id = r.slice(6);
    const a = wp.version?.assets.find((x) => x.asset_id === id);
    body = a ? (
      <div>
        <KV k="Cost">{money(a.cost, { cents: true })}</KV>
        {a.land_value_not_depreciated ? <KV k="Land (not depreciated)">{money(a.land_value_not_depreciated)}</KV> : null}
        <KV k="Placed in service">{a.placed_in_service}</KV>
        <KV k="Method">{a.method} · {a.life_years} years</KV>
        <KV k="Federal 2025">{money(a.federal.depreciation_2025, { cents: true })}</KV>
        <KV k="California 2025">{money(a.california.depreciation_2025, { cents: true })}</KV>
        <KV k="Accumulated (federal)">{money(a.federal.accumulated_end, { cents: true })}</KV>
        {a.disposition && <KV k="Disposed">{a.disposition.date} · unrecaptured §1250 {money(a.disposition.unrecaptured_1250_depreciation, { cents: true })}</KV>}
      </div>
    ) : null;
  } else if (info.kind === 'whatif') {
    const a = p.what_if.alternatives.find((x) => `whatif:${x.id}` === r)!;
    body = <div><KV k="Federal tax change">{money(a.federal.total_tax_change)}</KV><KV k="California tax change">{money(a.california.total_tax_change)}</KV><KV k="Lines changed">{a.changed_lines.length}</KV></div>;
  } else if (info.kind === 'timeline') {
    const t = ix.timeline.get(r.replace(/^timeline:/, ''));
    body = t ? <div><KV k="When">{t.at}</KV><KV k="Who">{t.actor ? ix.staff.get(t.actor)?.name : '—'}</KV>{t.detail && <p className="mt-2 text-[13px]">{t.detail}</p>}<div className="mt-2 flex flex-wrap gap-1">{t.refs.map((x) => <RefChip key={x} r={x.startsWith('v') ? x : x} />)}</div></div> : null;
  } else if (info.value) {
    body = <div className="num text-[18px] font-semibold">{info.value}</div>;
  }
  return (
    <div>
      <div className="px-5 pt-4 pb-4">
        <div className="mono mb-1 text-[12px] text-fg-3">{r}</div>
        <h2 className="text-[17px] leading-snug font-semibold">{info.title}</h2>
        {info.detail && <p className="mt-1 text-[12.5px] text-fg-3">{info.detail}</p>}
      </div>
      {body && <Section title="Record">{body}</Section>}
      {info.docId && <Section title="Document"><Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => store.open(`doc:${info.docId}#page${info.page ?? 1}`)}>Open {info.docId}</Button></Section>}
      <Section title="Verification"><Verifications target={r} /></Section>
    </div>
  );
}

function Quote({ text, who }: { text: string; who: string }) {
  return (
    <figure className="rounded-lg border-l-4 border-line-2 bg-panel-2 px-4 py-3">
      <blockquote className="text-[14px]">“{text}”</blockquote>
      <figcaption className="mt-1.5 text-[12px] text-fg-3">{who}</figcaption>
    </figure>
  );
}
