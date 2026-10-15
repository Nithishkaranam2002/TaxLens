import { ArrowRight, FileText, Hash, ListChecks, Search, SquareFunction, User, Wand2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { store, useApp, useWorkpaper } from '../../app/store';
import { AREAS, formName } from '../../engine/areas';
import { money, value } from '../format';
import { cx } from '../kit';

interface Entry { id: string; kind: 'page' | 'line' | 'doc' | 'value' | 'check' | 'change' | 'person' | 'action'; title: string; sub: string; hay: string; run: () => void; weight: number }

const ICON = { page: ArrowRight, line: SquareFunction, doc: FileText, value: Hash, check: ListChecks, change: Wand2, person: User, action: Wand2 };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wp = useWorkpaper();
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const pages: [string, string, () => void][] = [
      ['Overview', 'Results, readiness and where the changes are', () => store.go({ page: 'overview' })],
      ['Open items', 'Findings, approvals, notes and sign-offs', () => store.go({ page: 'inbox' })],
      ['Documents', 'All 74 documents and where each one landed', () => store.go({ page: 'documents' })],
      ['Checks', 'Independent checks that do not trust the engine', () => store.go({ page: 'checks' })],
      ['Changes', 'Every adjustment with who, why and tax effect', () => store.go({ page: 'changes', tab: 'ledger' })],
      ['Compare versions', 'Engine v1, v2, v3, ours, as filed', () => store.go({ page: 'changes', tab: 'versions' })],
      ['What-ifs', 'Engine alternatives and live scenarios', () => store.go({ page: 'changes', tab: 'whatif' })],
      ['Records', 'Schedules a CPA expects', () => store.go({ page: 'records' })],
      ['Depreciation by asset', 'Federal, California and AMT', () => store.go({ page: 'records', tab: 'depreciation' })],
      ['Sales detail', '295 sales grouped and tied out', () => store.go({ page: 'records', tab: 'sales' })],
      ['State split', 'California part-year allocation', () => store.go({ page: 'records', tab: 'state' })],
      ['Review & sign-off', 'Sign-offs, notes, steps, judgments', () => store.go({ page: 'review' })],
      ['Client', 'Questions, messages and approval', () => store.go({ page: 'client' })],
      ['Filing', 'Extension, e-file, freeze, notices, next year', () => store.go({ page: 'filing' })],
      ['Activity', 'Audit trail and season replay', () => store.go({ page: 'activity' })],
      ['Firm', 'Standards, access, view log, time and budget', () => store.go({ page: 'firm' })],
    ];
    for (const [t, s, run] of pages) out.push({ id: 'p:' + t, kind: 'page', title: t, sub: s, hay: `${t} ${s}`.toLowerCase(), run, weight: 5 });
    for (const a of AREAS) out.push({ id: 'a:' + a.id, kind: 'page', title: a.name, sub: a.blurb, hay: `${a.name} ${a.blurb}`.toLowerCase(), run: () => store.go({ page: 'area', id: a.id }), weight: 5 });
    if (wp.ours) for (const [k, v] of wp.ours.values) {
      const label = wp.ours.labels.get(k) ?? k;
      const vt = typeof v === 'number' ? `${v} ${money(v)} ${money(v, { cents: true })}` : String(v);
      out.push({ id: 'l:' + k, kind: 'line', title: `${label}`, sub: `${formName(k)} · ${k} · ${value(v, k)}`, hay: `${k} ${label} ${vt} ${formName(k)}`.toLowerCase(), run: () => store.open(k), weight: 3 });
    }
    for (const d of ix.packet.documents) out.push({ id: 'd:' + d.id, kind: 'doc', title: `${d.id} · ${d.title}`, sub: `${d.issuer} · ${d.file_name}`, hay: `${d.id} ${d.title} ${d.issuer} ${d.file_name} ${d.document_type}`.toLowerCase(), run: () => store.open(`doc:${d.id}#page1`), weight: 4 });
    for (const e of ix.packet.extracted_values) {
      const vt = typeof e.value === 'number' ? `${e.value} ${money(e.value, { cents: true })}` : String(e.value);
      out.push({ id: 'e:' + e.id, kind: 'value', title: `${e.label}: ${typeof e.value === 'number' ? money(e.value, { cents: e.value % 1 !== 0 }) : String(e.value)}`, sub: `${e.id} · ${e.document_id} page ${e.page}`, hay: `${e.id} ${e.label} ${vt} ${e.document_id}`.toLowerCase(), run: () => store.open(e.id), weight: 1 });
    }
    for (const c of wp.checks) out.push({ id: 'c:' + c.id, kind: 'check', title: c.title, sub: c.summary, hay: `${c.id} ${c.title} ${c.question} ${c.summary}`.toLowerCase(), run: () => store.open(`check:${c.id}`), weight: 4 });
    for (const p of wp.proposals) out.push({ id: 'x:' + p.id, kind: 'change', title: `Change ${p.seq}: ${p.title}`, sub: p.status, hay: `change ${p.seq} ${p.title} ${p.status}`.toLowerCase(), run: () => store.open(`adj:${p.id}`), weight: 4 });
    for (const a of actors) out.push({ id: 'u:' + a.id, kind: 'person', title: `Work as ${a.name}`, sub: `${a.roleLabel}${a.clearance ? '' : a.role === 'client' ? '' : ' · no sensitive-data clearance'}`, hay: `${a.name} ${a.roleLabel} switch work as`.toLowerCase(), run: () => store.setMe(a.id), weight: 4 });
    return out;
  }, [wp, ix, actors]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/,/g, '');
    if (!t) return entries.filter((e) => e.kind === 'page').slice(0, 14);
    const toks = t.split(/\s+/);
    const scored: [number, Entry][] = [];
    for (const e of entries) {
      const hay = e.hay.replace(/,/g, '');
      if (!toks.every((k) => hay.includes(k))) continue;
      let s = e.weight;
      if (e.title.toLowerCase().startsWith(t)) s += 6;
      if (e.id.toLowerCase().endsWith(t)) s += 8;
      if (e.title.toLowerCase().includes(t)) s += 2;
      scored.push([s, e]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x[1]);
  }, [q, entries]);

  useLayoutEffect(() => { if (open) { setQ(''); setSel(0); inputRef.current?.focus(); } }, [open]);
  useEffect(() => setSel(0), [q]);
  if (!open) return null;

  const choose = (e: Entry | undefined) => { if (!e) return; onClose(); e.run(); };
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-[var(--scrim)] p-4 pt-[10vh] anim-fade" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-panel shadow-2 anim-rise" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-fg-3" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lines, amounts, documents, checks, people…"
            className="h-12 flex-1 bg-transparent text-md outline-none placeholder:text-fg-3"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter') choose(results[sel]);
              if (e.key === 'Escape') onClose();
            }} />
          <span className="text-cap text-fg-3">{results.length} results</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1 scroll-thin">
          {results.length === 0 && <div className="px-3 py-6 text-center text-base text-fg-3">Nothing matches. Try a line key (SchC.9), an amount (11,800) or a document (D23).</div>}
          {results.map((e, i) => {
            const Icon = ICON[e.kind];
            return (
              <button key={e.id} type="button" onMouseEnter={() => setSel(i)} onClick={() => choose(e)}
                className={cx('flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left', i === sel ? 'bg-sunk' : '')}>
                <Icon className="mt-0.5 size-4 shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{e.title}</span>
                  <span className="block truncate text-sm text-fg-3">{e.sub}</span>
                </span>
                <span className="mt-0.5 rounded-md bg-sunk px-1.5 text-cap text-fg-3">{e.kind}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
