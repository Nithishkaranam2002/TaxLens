import { ChevronLeft, ChevronRight, ImagePlus, Layers, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { attach } from '../../app/actions';
import { getFile, putFile, sha256Blob } from '../../app/persist';
import { store, useApp, useMe, useWorkpaper } from '../../app/store';
import { rereadValue } from '../../engine/checks/reread';
import { hasSensitive, maskSensitive } from '../../engine/people';
import { reveal } from '../../app/actions';
import { dateTime, money } from '../format';
import { Badge, Button, IconButton, Segmented, StatusPill, cx, isTopDialog, isTyping } from '../kit';
import { RefChip } from '../Ref';
import { Notes, Verifications } from '../drawer/widgets';
import { anchorsFor } from './anchors';

export function parseDocRef(ref: string): { docId: string; page: number; ev: string | null } | null {
  const m = /^doc:(D\d\d)#page(\d+)(?:@(ev-\d+))?$/.exec(ref);
  return m ? { docId: m[1], page: Number(m[2]), ev: m[3] ?? null } : null;
}

export function DocumentViewer({ refStr, onClose }: { refStr: string; onClose: () => void }) {
  const parsed = parseDocRef(refStr)!;
  const ix = useApp((s) => s.ix)!;
  const wp = useWorkpaper();
  const me = useMe();
  const doc = ix.docs.get(parsed.docId)!;
  const [page, setPage] = useState(parsed.page);
  const [active, setActive] = useState<string | null>(parsed.ev);
  const [view, setView] = useState<'simulated' | 'original'>('simulated');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPage(parsed.page); setActive(parsed.ev); }, [refStr, parsed.page, parsed.ev]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Only the dialog on top reacts, and arrow keys belong to a field while someone types in it.
      if (!isTopDialog(panelRef.current)) return;
      if (e.key === 'Escape') onClose();
      if (isTyping(e.target)) return;
      if (e.key === 'ArrowRight') setPage((p) => Math.min(doc.page_count, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [doc.page_count, onClose]);

  const text = ix.page(doc.id, page);
  const evs = useMemo(() => ix.evsByPage.get(`${doc.id}#${page}`) ?? [], [ix, doc.id, page]);
  const anchors = useMemo(() => anchorsFor(text, evs), [text, evs]);
  const account = wp.docs.find((d) => d.doc.id === doc.id)!;
  const vKey = wp.version?.version ?? 'v3';
  const usesOf = (id: string) => ix.evUses.get(vKey)?.get(id) ?? [];
  const now = store.now();
  const sensitive = hasSensitive(text);
  const revealed = wp.state.reveals.some((r) => r.by === me.id && r.subject === `doc:${doc.id}` && Date.parse(now) - Date.parse(r.at) < 15 * 60000);
  const masked = !revealed;
  const original = [...wp.state.attachments.values()].find((a) => a.target === `doc:${doc.id}#page${page}` && a.mime.startsWith('image/'));

  useEffect(() => {
    let url: string | null = null;
    setImgUrl(null);
    if (original) void getFile(original.id).then((b) => { if (b) { url = URL.createObjectURL(b); setImgUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [original]);

  useEffect(() => {
    if (!active) return;
    const el = pageRef.current?.querySelector(`[data-ev="${active}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, page, view]);

  const segments = useMemo(() => {
    const out: { t: string; ev?: string }[] = [];
    let pos = 0;
    for (const a of anchors) {
      if (a.start < pos) continue;
      out.push({ t: text.slice(pos, a.start) });
      out.push({ t: text.slice(a.start, a.end), ev: a.ev.id });
      pos = a.end;
    }
    out.push({ t: text.slice(pos) });
    return out;
  }, [anchors, text]);

  const upload = async (f: File) => {
    const sha = await sha256Blob(f);
    const r = store.run((x) => attach(x, { target: `doc:${doc.id}#page${page}`, name: f.name, mime: f.type, size: f.size, sha256: sha, kind: 'file', text: null }));
    if (r.ok) { await putFile((r.events[0].payload as { id: string }).id, f); setView('original'); }
  };

  const fmtEv = (v: unknown, type: string) => (v === null ? '—' : typeof v === 'number' ? money(v, { cents: v % 1 !== 0 }) : (type === 'ssn' || type === 'account_number') && masked ? maskSensitive(String(v)) : String(v));
  const shownText = (t: string) => (masked ? maskSensitive(t) : t).replace(/; /g, ';\n').replace(/\. (?=[A-Z])/g, '.\n');

  return (
    <div className="fixed inset-0 z-50 flex bg-[var(--scrim)] anim-fade" onMouseDown={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`${doc.id} ${doc.title}`} className="m-auto flex h-[min(94vh,980px)] w-[min(1400px,96vw)] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2 anim-rise" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="mono rounded bg-sunk px-1.5 py-0.5 text-[12px]">{doc.id}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{doc.title}</div>
            <div className="truncate text-[12px] text-fg-3">{doc.issuer} · {doc.file_name} · received {dateTime(doc.received_at)} · uploaded by {doc.uploaded_by}</div>
          </div>
          {sensitive && me.role !== 'client' && (masked ? (
            <Button size="sm" variant="ghost" onClick={() => store.run((x) => reveal(x, `doc:${doc.id}`, 'identifiers', 'Viewed in the document viewer'), { undoable: false })} title={me.clearance ? 'This view is logged' : 'Needs sensitive-data clearance'}>Show identifiers</Button>
          ) : <Badge tone="warn">Identifiers shown · logged</Badge>)}
          <StatusPill status={account.disposition} />
          {account.flags.map((f) => <Badge key={f} tone={f === 'Corrected' ? 'info' : f === 'Late' ? 'warn' : 'neutral'}>{f}</Badge>)}
          <IconButton label="Close (Esc)" onClick={onClose}><X className="size-4" /></IconButton>
        </header>
        <div className="flex min-h-0 flex-1">
          {doc.page_count > 1 && (
            <aside className="hidden w-[76px] shrink-0 overflow-y-auto border-r border-line bg-panel-2 p-2 scroll-thin md:block">
              {doc.pages.map((p) => {
                const n = (ix.evsByPage.get(`${doc.id}#${p.page}`) ?? []).length;
                return (
                  <button key={p.page} type="button" onClick={() => setPage(p.page)} className={cx('mb-1.5 flex w-full flex-col items-center rounded-md border px-1 py-2 text-[11px]', p.page === page ? 'border-fg-3 bg-panel' : 'border-transparent hover:border-line-2')}>
                    <span className="font-medium">{p.page}</span>
                    <span className={cx('num text-[10px]', n ? 'text-fg-3' : 'text-bad')}>{n ? `${n} values` : /\d\.\d\d/.test(p.printed_content) ? 'unread' : '—'}</span>
                  </button>
                );
              })}
            </aside>
          )}
          <div className="min-w-0 flex-1 overflow-y-auto bg-sunk p-4 scroll-thin md:p-8" ref={pageRef}>
            <div className="mx-auto mb-3 flex max-w-[760px] flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconButton label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></IconButton>
                <span className="num text-[12.5px] text-fg-2">Page {page} of {doc.page_count}</span>
                <IconButton label="Next page" disabled={page >= doc.page_count} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></IconButton>
              </div>
              <div className="flex items-center gap-2">
                <Segmented size="sm" value={view} onChange={setView} options={[{ id: 'simulated', label: 'From packet text' }, { id: 'original', label: 'Original page' }]} />
              </div>
            </div>
            {view === 'simulated' || !imgUrl ? (
              <article className="paper mx-auto min-h-[560px] max-w-[760px] rounded-sm">
                <div className="paper-margin ml-10 px-6 py-7 sm:ml-14 sm:px-8">
                  <div className="mb-5 flex items-start justify-between gap-4 border-b border-line-2 pb-3">
                    <div>
                      <div className="text-[11px] tracking-[0.12em] text-fg-3 uppercase">{doc.document_type.replace(/_/g, ' ')}</div>
                      <div className="serif text-[18px] leading-tight">{doc.issuer}</div>
                    </div>
                    <div className="text-right text-[11px] text-fg-3">Tax year {doc.tax_year}<br />{doc.file_name}</div>
                  </div>
                  <div className={cx('text-[14px] leading-[28px] whitespace-pre-wrap', /letter|engagement|notice|consent/.test(doc.document_type) ? 'serif' : 'mono text-[13px]')}>
                    {segments.map((s, i) => s.ev ? (
                      <mark key={i} data-ev={s.ev} onClick={() => setActive(s.ev!)} title={s.ev}
                        className={cx('hl', active === s.ev && 'active', (() => { const e = ix.evs.get(s.ev!)!; const r = rereadValue(e, text); return r.kind === 'mismatch' || r.kind === 'blank-as-zero' || r.kind === 'low-confidence'; })() && 'bad')}>
                        {masked ? maskSensitive(s.t) : s.t}
                      </mark>
                    ) : <span key={i}>{shownText(s.t)}</span>)}
                  </div>
                </div>
              </article>
            ) : (
              <div className="relative mx-auto max-w-[760px] shadow-2">
                <img src={imgUrl} alt={`${doc.title}, page ${page}`} className="block w-full" />
                {evs.map((e) => (
                  <button key={e.id} type="button" data-ev={e.id} onClick={() => setActive(e.id)} title={e.label}
                    className={cx('absolute rounded-sm border-2', active === e.id ? 'border-[var(--hl-strong)] bg-[var(--hl)]/40' : 'border-[var(--hl-strong)]/60')}
                    style={{ left: `${e.position.x0 * 100}%`, top: `${e.position.y0 * 100}%`, width: `${(e.position.x1 - e.position.x0) * 100}%`, height: `${(e.position.y1 - e.position.y0) * 100}%` }} />
                ))}
              </div>
            )}
            <div className="mx-auto mt-3 max-w-[760px] text-[11.5px] text-fg-3">
              {view === 'simulated' ? (
                <>Rendered from the packet's printed text; no scan was provided. Highlights are found by re-reading the text, not from the synthetic positions. When an original page is attached, the same values are drawn at their recorded positions.</>
              ) : imgUrl ? <>Original page attached. Boxes sit at each value's recorded position.</> : <>No original attached for this page.</>}
              {me.role !== 'client' && (
                <>
                  <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
                  <button type="button" className="ml-1 inline-flex items-center gap-1 underline" onClick={() => fileInput.current?.click()}><ImagePlus className="size-3" />Attach the original page image</button>
                </>
              )}
            </div>
          </div>
          <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-line scroll-thin lg:block">
            <div className="border-b border-line p-4">
              <div className="eyebrow mb-1.5">This document</div>
              <p className="text-[13px] text-fg-2">{account.reason}</p>
              {account.lines.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{account.lines.slice(0, 16).map((l) => <RefChip key={l} r={l} />)}{account.lines.length > 16 && <span className="text-[11px] text-fg-3">+{account.lines.length - 16}</span>}</div>}
              {doc.extraction.reason && <p className="mt-2 text-[12px] text-fg-3">{doc.extraction.reason}</p>}
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between"><div className="eyebrow">Values on page {page}</div><Layers className="size-3.5 text-fg-3" /></div>
              {evs.length === 0 && <p className="text-[12.5px] text-fg-3">The pipeline read nothing on this page.</p>}
              <div className="space-y-1">
                {evs.map((e) => {
                  const rr = rereadValue(e, text);
                  const bad = rr.kind === 'mismatch' || rr.kind === 'blank-as-zero' || rr.kind === 'missing' || rr.kind === 'low-confidence';
                  const uses = usesOf(e.id);
                  return (
                    <button key={e.id} type="button" onClick={() => setActive(e.id)} className={cx('block w-full rounded-md border px-2.5 py-1.5 text-left', active === e.id ? 'border-fg-3 bg-panel-2' : bad ? 'border-bad/40 bg-bad-bg/40' : 'border-transparent hover:border-line')}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px]">{e.label}</span>
                        <span className="num shrink-0 text-[12.5px] font-medium">{fmtEv(e.value, e.value_type)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
                        <span className="mono">{e.id}</span><span>· {e.confidence.toFixed(2)}</span>
                        {uses.length ? <span>· {uses.length === 1 ? uses[0] : `${uses.length} lines`}</span> : <span>· not on a line</span>}
                      </div>
                      {bad && <div className="text-[11px] text-bad">{rr.reason}</div>}
                    </button>
                  );
                })}
              </div>
              {active && ix.evs.get(active) && (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <div className="mb-1 text-[12.5px] font-medium">{ix.evs.get(active)!.label}</div>
                  <div className="mb-2 flex flex-wrap gap-1">{usesOf(active).map((l) => <RefChip key={l} r={l} />)}</div>
                  <Button size="sm" variant="ghost" onClick={() => store.open(active)}>Open this value</Button>
                </div>
              )}
            </div>
            <div className="border-t border-line p-4">
              <div className="eyebrow mb-2">Verification</div>
              <Verifications target={doc.id} />
            </div>
            <div className="border-t border-line p-4">
              <div className="eyebrow mb-2">Notes</div>
              <Notes target={doc.id} area={account.area} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
