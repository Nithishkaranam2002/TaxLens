import { CircleCheck, CircleX, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { decide, isLocked, revert, withdraw } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { AREA } from '../../engine/areas';
import { signed } from '../format';
import { Avatar, Badge, Button, Diff, StatusPill, TextArea, cx } from '../kit';
import { RefChip } from '../Ref';
import { Notes, Section, Who } from './widgets';

export function AdjProof({ id }: { id: string }) {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const events = useApp((s) => s.events);
  const p = wp.proposals.find((x) => x.id === id);
  const [note, setNote] = useState('');
  if (!p) return <div className="p-5 text-fg-3">This change does not exist at this point in the season.</div>;
  const by = actors.find((a) => a.id === p.by);
  const canDecide = (me.role === 'reviewer' || me.role === 'partner') && p.status === 'proposed' && p.by !== me.id && !p.decisions.some((d) => d.by === me.id);
  const fx = p.fix;
  const ev = events.find((e) => e.id === p.eventId)!;
  const e = p.effect;
  return (
    <div>
      <div className="px-5 pt-4 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="mono text-[12px] text-fg-3">Change {p.seq}</span>
          <StatusPill status={p.status} />
          <Badge tone="neutral">{AREA[p.area].short}</Badge>
          {p.needsPartner && <Badge tone="violet">Over 1,000: partner approval</Badge>}
          {fx?.kind === 'data' && <Badge tone="info">Data correction</Badge>}
        </div>
        <h2 className="text-[17px] leading-snug font-semibold">{p.title}</h2>
        <div className="mt-1.5"><Who id={p.by} at={p.at} /></div>
      </div>

      <Section title="What changes">
        <div className="divide-y divide-line rounded-lg border border-line">
          {p.changes.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <button type="button" onClick={() => store.open(c.key.startsWith('household:') ? c.key : c.key)} className="min-w-0 truncate text-left hover:underline">{c.label}<span className="mono ml-1.5 text-[11px] text-fg-3">{c.key}</span></button>
              <Diff from={c.from} to={c.to} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-fg-3">The original value stays in the record. Undoing an approved change adds a reversing entry; nothing is deleted.</p>
      </Section>

      {fx?.kind !== 'data' && (
        <Section title="Tax effect at proposal">
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            <Effect label="Federal tax" v={e.fedTax} rate={p.rateEffect.fed} />
            <Effect label="California tax" v={e.caTax} rate={p.rateEffect.ca} />
            {e.fedBalance !== e.fedTax && <Effect label="Federal amount due" v={e.fedBalance} />}
            {e.caBalance !== e.caTax && <Effect label="California amount due" v={e.caBalance} />}
            {e.fedPenalty !== 0 && <Effect label="Federal penalty" v={e.fedPenalty} />}
          </div>
          <p className="mt-2 text-[12px] text-fg-3">Recomputed: TaxLens rebuilds the whole return with and without this change. The packet's per-dollar rate method is shown for comparison.</p>
        </Section>
      )}

      <Section title="Why">
        <p className="text-[13px] whitespace-pre-wrap text-fg-2">{p.reason}</p>
        <div className="mt-2 text-[12.5px]"><span className="font-medium">Authority:</span> <span className="text-fg-2">{p.authority}</span></div>
        <div className="mt-2 flex flex-wrap gap-1">{p.evidence.map((r) => <RefChip key={r} r={r} />)}</div>
        {fx?.checkId && <button type="button" className="mt-2 text-[12.5px] text-fg-2 underline" onClick={() => store.open(`check:${fx.checkId}`)}>Found by check {fx.checkId}</button>}
      </Section>

      <Section title="Approvals">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12.5px]"><Avatar actor={by} size={18} /><span>Proposed by {by?.name}</span></div>
          {p.decisions.map((d) => {
            const a = actors.find((x) => x.id === d.by);
            return (
              <div key={d.eventId} className="flex items-start gap-2 text-[12.5px]">
                <Avatar actor={a} size={18} />
                <div><span className={cx('font-medium', d.decision === 'reject' ? 'text-bad' : 'text-ok')}>{d.decision === 'approve' ? 'Approved' : 'Rejected'}</span> by {a?.name} ({a?.roleLabel}){d.note && <div className="text-fg-2">{d.note}</div>}</div>
              </div>
            );
          })}
          {p.status === 'proposed' && <div className="text-[12.5px] text-fg-3">Still needs: {p.needs.join(' and ') || '—'}.</div>}
        </div>
        {canDecide && (
          <div className="mt-3 space-y-2">
            <TextArea value={note} onChange={(ev2) => setNote(ev2.target.value)} placeholder="Note (required to reject)" className="min-h-[52px]" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="danger" icon={<CircleX className="size-3.5" />} onClick={() => { const r = store.run((x) => decide(x, p.id, 'reject', note)); if (r.ok) setNote(''); }}>Reject</Button>
              <Button size="sm" variant="ok" icon={<CircleCheck className="size-3.5" />} onClick={() => { const r = store.run((x) => decide(x, p.id, 'approve', note)); if (r.ok) setNote(''); }}>Approve</Button>
            </div>
          </div>
        )}
        {p.status === 'proposed' && p.by === me.id && (
          <div className="mt-3 flex justify-end"><Button size="sm" variant="ghost" onClick={() => store.run((x) => withdraw(x, p.id, 'Withdrawn by the preparer'))}>Withdraw</Button></div>
        )}
        {p.status === 'approved' && (me.id === p.by || me.role === 'partner') && !isLocked(wp) && (
          <div className="mt-3 flex justify-end"><Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => store.run((x) => revert(x, ev, 'Change reversed'))}>Reverse this change</Button></div>
        )}
      </Section>

      <Section title="Discussion"><Notes target={`adj:${p.id}`} area={p.area} /></Section>
    </div>
  );
}

function Effect({ label, v, rate }: { label: string; v: number; rate?: number }) {
  return (
    <div className="rounded-md bg-panel-2 p-2">
      <div className="text-fg-3">{label}</div>
      <div className={cx('num text-[15px] font-semibold', v > 0 ? 'text-bad' : v < 0 ? 'text-ok' : '')}>{signed(v)}</div>
      {rate !== undefined && <div className="text-[11.5px] text-fg-3">packet rate {Number.isFinite(rate) ? signed(rate) : 'n/a'}</div>}
    </div>
  );
}
