import { CircleCheck, Lightbulb, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { decide, dispose, proposeFix } from '../../app/actions';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import type { Cell, EvidenceTable } from '../../engine/checks';
import type { FixDef } from '../../engine/fixes';
import { exactEffect, optionRateEffect } from '../../engine/effects';
import { money, signed } from '../format';
import { Badge, Button, Diff, Select, StatusPill, TextArea, cx } from '../kit';
import { RefChip } from '../Ref';
import { Notes, Section } from './widgets';

export function EvidenceTableView({ t }: { t: EvidenceTable }) {
  const cell = (c: Cell, i: number) => {
    if (c === null || c === undefined) return <span className="text-fg-3">—</span>;
    if (typeof c === 'object') {
      const text = typeof c.v === 'number' ? (t.money?.includes(i) || c.money ? money(c.v, { cents: c.v % 1 !== 0 }) : c.v.toLocaleString('en-US')) : c.v ?? '—';
      return c.ref ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); const m = /^(?:doc:)?(D\d\d)(?:#page(\d+))?$/.exec(c.ref!); store.open(m ? `doc:${m[1]}#page${m[2] ?? 1}` : c.ref!); }} className={cx('proof num text-left', c.strong && 'font-semibold')}>{text}</button>
      ) : <span className={cx(c.strong && 'font-semibold')}>{text}</span>;
    }
    if (typeof c === 'number') return money(c, { cents: c % 1 !== 0 });
    return c;
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-line scroll-thin">
      {t.title && <div className="border-b border-line bg-panel-2 px-3 py-1.5 text-sm font-medium">{t.title}</div>}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>{t.columns.map((c, i) => <th key={i} className={cx('border-b border-line bg-panel-2 px-2.5 py-1.5 text-left text-cap font-semibold tracking-wide text-fg-3 uppercase', t.money?.includes(i) && 'text-right')}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri} className={cx(r.status === 'bad' && 'bg-bad-bg/50', r.status === 'warn' && 'bg-warn-bg/40')}>
              {r.cells.map((c, i) => <td key={i} className={cx('border-b border-line px-2.5 py-1.5 align-top last:pr-3', t.money?.includes(i) && 'num text-right')}>{i === 0 && r.status ? <span className="inline-flex items-start gap-1.5"><span className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', r.status === 'ok' ? 'bg-ok' : r.status === 'bad' ? 'bg-bad' : r.status === 'warn' ? 'bg-warn' : 'bg-fg-3')} />{cell(c, i)}</span> : cell(c, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FixCard({ fix }: { fix: FixDef }) {
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const me = useMe();
  const [opt, setOpt] = useState(fix.options[fix.recommended].id);
  const option = fix.options.find((o) => o.id === opt)!;
  const proposal = wp.proposals.find((p) => p.source.kind === 'fix' && p.source.fixId === fix.id && p.status !== 'withdrawn' && p.status !== 'rejected');
  const { effect, rate } = useMemo(() => {
    if (!wp.version) return { effect: null, rate: null };
    const applied = wp.proposals.filter((p) => p.status === 'approved').sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '')).flatMap((p) => p.edits);
    const own = proposal?.status === 'approved' ? applied.filter((e) => !option.edits.includes(e)) : applied;
    return { effect: exactEffect(ix.packet, wp.version, own, option.edits), rate: optionRateEffect(ix.packet, wp.version, option, fix.engineWhatIf) };
  }, [wp, option, ix, fix, proposal?.status]);
  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
        <Wand2 className="mt-0.5 size-4 text-fg-3" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{fix.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <Badge tone={fix.certainty === 'certain' ? 'neutral' : 'warn'}>{fix.certainty === 'certain' ? 'Documents decide' : 'Judgment call'}</Badge>
            {fix.kind === 'data' && <Badge tone="info">Data correction · no tax effect</Badge>}
            {fix.kind === 'election' && <Badge tone="violet">Election</Badge>}
            {fix.engineWhatIf && <Badge tone="ok">Engine what-if confirms</Badge>}
          </div>
        </div>
        {proposal && <StatusPill status={proposal.status} />}
      </div>
      <div className="space-y-3 px-3 py-3">
        <p className="text-sm text-fg-2">{fix.why}</p>
        {fix.options.length > 1 && (
          <div className="space-y-1.5">
            {fix.options.map((o) => (
              <label key={o.id} className={cx('flex cursor-pointer items-start gap-2 rounded-md border p-2', opt === o.id ? 'border-fg-3 bg-panel-2' : 'border-line')}>
                <input type="radio" className="mt-1" checked={opt === o.id} onChange={() => setOpt(o.id)} disabled={!!proposal} />
                <span className="text-sm"><span className="font-medium">{o.label}{fix.options.indexOf(o) === fix.recommended && ' · recommended'}</span><span className="block text-fg-3">{o.detail}</span></span>
              </label>
            ))}
          </div>
        )}
        {option.changes.length > 0 && (
          <div className="divide-y divide-line rounded-md border border-line">
            {option.changes.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
                <button type="button" onClick={() => store.open(c.key)} className="min-w-0 truncate text-left hover:underline">{c.label} <span className="mono text-cap text-fg-3">{c.key}</span></button>
                <Diff from={c.from} to={c.to} />
              </div>
            ))}
          </div>
        )}
        {effect && fix.kind !== 'data' && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-panel-2 p-2"><div className="text-fg-3">Federal tax · recomputed</div><div className="num text-md font-semibold">{signed(effect.fedTax)}</div><div className="text-fg-3">packet rate {rate && Number.isFinite(rate.fed) ? signed(rate.fed) : '—'}{effect.fedBalance !== effect.fedTax ? ` · balance ${signed(effect.fedBalance)}` : ''}</div></div>
            <div className="rounded-md bg-panel-2 p-2"><div className="text-fg-3">California tax · recomputed</div><div className="num text-md font-semibold">{signed(effect.caTax)}</div><div className="text-fg-3">packet rate {rate && Number.isFinite(rate.ca) ? signed(rate.ca) : '—'}{effect.caBalance !== effect.caTax ? ` · balance ${signed(effect.caBalance)}` : ''}</div></div>
          </div>
        )}
        <div className="flex flex-wrap gap-1">{fix.evidence.map((e) => <RefChip key={e} r={e} />)}</div>
        <div className="text-sm text-fg-3"><span className="font-medium text-fg-2">Authority:</span> {fix.authority}</div>
        {fix.followUp && <div className="flex gap-1.5 rounded-md bg-warn-bg/60 px-2.5 py-1.5 text-sm text-fg-2"><Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn" />{fix.followUp}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {proposal ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => store.open(`adj:${proposal.id}`)}>Open change {proposal.seq}</Button>
              {proposal.status === 'proposed' && (me.role === 'reviewer' || me.role === 'partner') && proposal.by !== me.id && (
                <Button size="sm" variant="ok" icon={<CircleCheck className="size-3.5" />} onClick={() => store.run((x) => decide(x, proposal.id, 'approve', ''))}>Approve</Button>
              )}
            </>
          ) : me.role !== 'client' && me.role !== 'firm_administrator' && (
            <Button size="sm" variant="primary" onClick={() => store.run((x) => proposeFix(x, fix.id, opt))}>Propose this change</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CheckProof({ id }: { id: string }) {
  const wp = useWorkpaper();
  const me = useMe();
  const actors = useApp((s) => s.actors);
  const c = wp.checks.find((x) => x.id === id);
  const finding = wp.findings.find((f) => f.check.id === id);
  const [reason, setReason] = useState('');
  const [disp, setDisp] = useState<'reviewed' | 'no-change' | 'deferred' | ''>('');
  if (!c) return <div className="p-5 text-fg-3">This check did not run at this point in the season.</div>;
  return (
    <div>
      <div className="px-5 pt-4 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="mono text-sm text-fg-3">{c.id}</span><Badge tone="outline">{c.group}</Badge><StatusPill status={c.status} />{finding && finding.status !== 'open' && <StatusPill status={finding.status} />}</div>
        <h2 className="text-xl leading-snug font-semibold">{c.title}</h2>
        <p className="mt-1 text-base text-fg-2">{c.question}</p>
        <p className={cx('mt-3 rounded-lg px-3 py-2.5 text-base', c.status === 'fail' ? 'bg-bad-bg/70' : c.status === 'review' ? 'bg-warn-bg/70' : 'bg-ok-bg/70')}>{c.summary}</p>
        <p className="mt-2 text-sm text-fg-3"><span className="font-medium text-fg-2">How it works:</span> {c.method}{c.scanned ? ` Scanned ${c.scanned.toLocaleString('en-US')}.` : ''}</p>
      </div>
      {c.tables.filter((t) => t.rows.length).map((t, i) => <Section key={i} title={t.title ?? 'Evidence'}><EvidenceTableView t={t} /></Section>)}
      {c.fixes.length > 0 && (
        <Section title={`Proposed correction${c.fixes.length > 1 ? 's' : ''}`}>
          <div className="space-y-3">{c.fixes.map((f) => wp.fixes.get(f) && <FixCard key={f} fix={wp.fixes.get(f)!} />)}</div>
        </Section>
      )}
      {(c.status === 'review' || c.status === 'fail') && (
        <Section title="Disposition">
          {finding?.disposition && (
            <div className="mb-3 text-base"><Badge tone={finding.status === 'closed' ? 'ok' : 'warn'}>{finding.disposition.disposition}</Badge> <span className="text-fg-2">{finding.disposition.reason}</span><div className="mt-1 text-sm text-fg-3">{actors.find((a) => a.id === finding.disposition!.by)?.name}{finding.status !== 'closed' && finding.status !== 'resolved' ? ' · the finding stays open: an error needs a correction, or a reviewer\'s "no change"' : ''}</div></div>
          )}
          {(!finding?.disposition || finding.status === 'open') && me.role !== 'client' && me.role !== 'firm_administrator' && me.role !== 'quality_reviewer' ? (() => {
            // An error (fail) closes only with a correction, a reviewer's "no change", or a deferral; a question (review) closes with a recorded conclusion.
            const opts = c.status === 'review'
              ? [{ id: 'reviewed', label: 'Reviewed: conclusion recorded' }, { id: 'no-change', label: 'No change needed' }, { id: 'deferred', label: 'Deferred to next year' }]
              : [{ id: 'no-change', label: 'No change needed (reviewer or partner)' }, { id: 'deferred', label: 'Deferred to next year' }];
            const value = disp && opts.some((o) => o.id === disp) ? disp : opts[0].id;
            return (
              <div className="space-y-2">
                <Select value={value} onChange={(v) => setDisp(v as typeof disp)} options={opts} />
                <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conclusion and why" className="min-h-[56px]" />
                <div className="flex justify-end"><Button size="sm" onClick={() => { const r = store.run((x) => dispose(x, c.id, value as 'reviewed' | 'no-change' | 'deferred', reason)); if (r.ok) setReason(''); }}>Record</Button></div>
              </div>
            );
          })() : !finding?.disposition && <p className="text-sm text-fg-3">No disposition yet.</p>}
        </Section>
      )}
      <Section title="Sources it read"><div className="flex flex-wrap gap-1">{c.refs.slice(0, 30).map((r) => <RefChip key={r} r={r} />)}</div></Section>
      <Section title="Notes"><Notes target={`check:${c.id}`} area={c.area} /></Section>
    </div>
  );
}
