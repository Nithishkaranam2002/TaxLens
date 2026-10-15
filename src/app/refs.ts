import type { PacketIndex } from '../data/index';
import { formName } from '../engine/areas';
import type { Workpaper } from '../engine/workpaper';
import { money, value } from '../ui/format';
import { fmtDate } from '../engine/time';

export type RefKind =
  | 'line' | 'ev' | 'doc' | 'page' | 'qa' | 'msg' | 'call' | 'py' | 'agency' | 'asset' | 'household' | 'param' | 'fx'
  | 'timeline' | 'check' | 'adj' | 'note' | 'judgment' | 'whatif' | 'question' | 'step' | 'signoff' | 'unknown';

export interface RefInfo { kind: RefKind; id: string; title: string; detail: string; value?: string; docId?: string; page?: number }

export function pointer(root: unknown, ptr: string): unknown {
  if (!ptr || ptr === '/') return root;
  let cur: unknown = root;
  for (const raw of ptr.replace(/^\//, '').split('/')) {
    const k = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function kindOf(ref: string): RefKind {
  if (ref.startsWith('ev-')) return 'ev';
  if (/^D\d\d$/.test(ref)) return 'doc';
  if (ref.startsWith('doc:')) return 'page';
  if (ref.startsWith('qa-')) return 'qa';
  if (ref.startsWith('msg-')) return 'msg';
  if (ref.startsWith('call-')) return 'call';
  if (ref.startsWith('py:')) return 'py';
  if (ref.startsWith('agency:')) return 'agency';
  if (ref.startsWith('asset:')) return 'asset';
  if (ref.startsWith('household:')) return 'household';
  if (ref.startsWith('ref:param.')) return 'param';
  if (ref.startsWith('ref:fx.')) return 'fx';
  if (ref.startsWith('timeline:') || /^tl-\d+$/.test(ref)) return 'timeline';
  if (ref.startsWith('check:') || ref.startsWith('CHK-')) return 'check';
  if (ref.startsWith('adj:') || ref.startsWith('adj_')) return 'adj';
  if (ref.startsWith('note:')) return 'note';
  if (ref.startsWith('judgment:') || ref.startsWith('J-')) return 'judgment';
  if (ref.startsWith('whatif:')) return 'whatif';
  if (ref.startsWith('question:')) return 'question';
  if (ref.startsWith('step:')) return 'step';
  if (ref.startsWith('signoff:')) return 'signoff';
  if (/^[A-Za-z0-9-]+\.[A-Za-z0-9.-]+$/.test(ref)) return 'line';
  return 'unknown';
}

export function resolveRef(ix: PacketIndex, wp: Workpaper | null, ref: string): RefInfo {
  const kind = kindOf(ref);
  const p = ix.packet;
  switch (kind) {
    case 'ev': {
      const e = ix.evs.get(ref);
      if (!e) return { kind, id: ref, title: ref, detail: 'Unknown value' };
      return { kind, id: ref, title: `${e.label}`, detail: `${e.document_id} · page ${e.page} · read "${e.text_as_read || '(blank)'}" at ${e.confidence.toFixed(2)}`, value: e.value === null ? '—' : typeof e.value === 'number' ? money(e.value, { cents: e.value % 1 !== 0 }) : String(e.value), docId: e.document_id, page: e.page };
    }
    case 'doc': {
      const d = ix.docs.get(ref);
      return { kind, id: ref, title: d?.title ?? ref, detail: d ? `${d.issuer} · received ${fmtDate(d.received_at)} · ${d.page_count} page${d.page_count > 1 ? 's' : ''}` : '', docId: ref, page: 1 };
    }
    case 'page': {
      const m = /^doc:(D\d\d)#page(\d+)$/.exec(ref);
      const d = m ? ix.docs.get(m[1]) : undefined;
      return { kind, id: ref, title: d ? `${d.title}, page ${m![2]}` : ref, detail: 'Printed page (not extracted)', docId: m?.[1], page: m ? Number(m[2]) : 1 };
    }
    case 'qa': {
      const q = ix.qa.get(ref);
      return { kind, id: ref, title: q?.question ?? ref, detail: q ? `${q.answered_by}, ${fmtDate(q.answered_at)}` : '', value: q ? `"${q.answer}"` : undefined };
    }
    case 'msg': {
      const m = ix.messages.get(ref);
      return { kind, id: ref, title: m ? `Message from ${m.from}` : ref, detail: m ? fmtDate(m.sent_at) : '', value: m ? `"${m.text}"` : undefined };
    }
    case 'call': {
      const c = ix.calls.get(ref);
      return { kind, id: ref, title: c ? `Call with ${c.participants.join(' and ')}` : ref, detail: c ? fmtDate(c.date) : '', value: c ? `${c.notes.length} notes` : undefined };
    }
    case 'py': {
      const ptr = ref.slice(3);
      const v = pointer(p.prior_years, ptr);
      const label = ptr.split('/').pop() ?? ptr;
      const line = /\/lines\/(.+)$/.exec(ptr)?.[1];
      return { kind, id: ref, title: line ? `2024 return: ${p.prior_years.return_2024.line_labels[line] ?? line}` : `Prior years: ${label.replace(/_/g, ' ')}`, detail: ptr, value: typeof v === 'number' ? money(v) : typeof v === 'string' ? v : v ? 'record' : '—', docId: line ? 'D06' : undefined };
    }
    case 'agency': {
      const ptr = ref.slice(7);
      const v = pointer(p.tax_agency_records, ptr);
      return { kind, id: ref, title: `Agency record: ${ptr.split('/').filter((s) => !/^\d+$/.test(s)).pop()?.replace(/_/g, ' ') ?? ptr}`, detail: ptr, value: v && typeof v === 'object' && 'amount' in (v as object) ? `${(v as { date: string }).date} · ${money(Number((v as { amount: number }).amount))}` : undefined };
    }
    case 'asset': {
      const id = ref.slice(6);
      const a = wp?.version?.assets.find((x) => x.asset_id === id) ?? p.prior_years.asset_records.find((x) => x.asset_id === id);
      return { kind, id: ref, title: a ? `${id} · ${a.description}` : ref, detail: a ? `Cost ${money(a.cost)} · placed in service ${a.placed_in_service} · ${a.method}` : '' };
    }
    case 'household': {
      const id = ref.slice(10);
      const person = ix.people.get(id);
      return { kind, id: ref, title: person ? `${person.name} (${person.role})` : ref, detail: person ? `Born ${person.dob}${person.relationship ? ` · ${person.relationship}` : ''}` : '' };
    }
    case 'param': {
      const k = ref.slice(10);
      const v = (p.engine_reference.parameters as unknown as Record<string, unknown>)[k];
      return { kind, id: ref, title: `Engine parameter: ${k.replace(/_/g, ' ')}`, detail: 'engine_reference.parameters', value: typeof v === 'number' ? String(v) : Array.isArray(v) ? `${v.length} brackets` : '' };
    }
    case 'fx': {
      const k = ref.split('.').pop()!;
      return { kind, id: ref, title: `SEK per USD, ${k.replace(/_/g, ' ')}`, detail: 'engine_reference.parameters.fx', value: String(p.engine_reference.parameters.fx.SEK[k]) };
    }
    case 'timeline': {
      const id = ref.replace(/^timeline:/, '');
      const t = ix.timeline.get(id);
      return { kind, id: ref, title: t ? t.event.replace(/_/g, ' ') : id, detail: t ? `${fmtDate(t.at)}${t.actor ? ` · ${ix.staff.get(t.actor)?.name ?? t.actor}` : ''}` : '', value: t?.detail ?? undefined };
    }
    case 'check': {
      const id = ref.replace(/^check:/, '');
      const c = wp?.checks.find((x) => x.id === id);
      return { kind, id: ref, title: c?.title ?? id, detail: c?.summary ?? '' };
    }
    case 'adj': {
      const id = ref.replace(/^adj:/, '');
      const a = wp?.proposals.find((x) => x.id === id);
      return { kind, id: ref, title: a ? `Change ${a.seq}: ${a.title}` : id, detail: a?.status ?? '' };
    }
    case 'whatif': {
      const id = ref.slice(7);
      const a = p.what_if.alternatives.find((x) => x.id === id);
      return { kind, id: ref, title: a?.description ?? id, detail: a ? `Engine what-if on ${a.base_version}: federal ${a.federal.total_tax_change}, California ${a.california.total_tax_change}` : '' };
    }
    case 'line': {
      const v = wp?.ours?.values.get(ref);
      const label = wp?.ours?.labels.get(ref) ?? wp?.version?.lines.find((l) => l.key === ref)?.label ?? ref;
      return { kind, id: ref, title: label, detail: `${formName(ref)} · ${ref}`, value: v !== undefined ? value(v, ref) : undefined };
    }
    default:
      return { kind, id: ref, title: ref, detail: '' };
  }
}
