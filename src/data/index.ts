import { type Engagement, engagementOf } from './household';
import type {
  CallNote, ClientMessage, ExtractedValue, Packet, PacketDocument, Person, QA, ReturnLine, ReturnVersion, Staff, TimelineEvent,
} from './packet';

/** Read-only indexes over the packet. Built once when the packet loads. */
export class PacketIndex {
  readonly docs = new Map<string, PacketDocument>();
  readonly evs = new Map<string, ExtractedValue>();
  readonly evsByDoc = new Map<string, ExtractedValue[]>();
  readonly evsByPage = new Map<string, ExtractedValue[]>();
  readonly evByDocField = new Map<string, ExtractedValue>();
  readonly versions = new Map<string, ReturnVersion>();
  readonly lines = new Map<string, Map<string, ReturnLine>>();
  /** version -> line key -> keys of lines that use it as an input */
  readonly consumers = new Map<string, Map<string, string[]>>();
  /** version -> ev id -> keys of lines that cite it as a source */
  readonly evUses = new Map<string, Map<string, string[]>>();
  readonly staff = new Map<string, Staff>();
  readonly people = new Map<string, Person>();
  readonly qa = new Map<string, QA>();
  readonly messages = new Map<string, ClientMessage>();
  readonly calls = new Map<string, CallNote>();
  readonly timeline = new Map<string, TimelineEvent>();
  readonly versionOrder: string[];
  /** The engagement's labels (filers, filing status, forms, move, due date), read from the packet. */
  readonly engagement: Engagement;

  constructor(readonly packet: Packet, readonly sha256: string) {
    this.engagement = engagementOf(packet);
    for (const d of packet.documents) this.docs.set(d.id, d);
    for (const e of packet.extracted_values) {
      this.evs.set(e.id, e);
      push(this.evsByDoc, e.document_id, e);
      push(this.evsByPage, `${e.document_id}#${e.page}`, e);
      this.evByDocField.set(`${e.document_id}:${e.field}`, e);
    }
    for (const v of packet.return_versions) {
      this.versions.set(v.version, v);
      const lm = new Map<string, ReturnLine>();
      const cons = new Map<string, string[]>();
      const uses = new Map<string, string[]>();
      for (const l of v.lines) {
        lm.set(l.key, l);
        for (const i of l.inputs) push(cons, i, l.key);
        for (const s of l.sources) if (s.startsWith('ev-')) push(uses, s, l.key);
      }
      this.lines.set(v.version, lm);
      this.consumers.set(v.version, cons);
      this.evUses.set(v.version, uses);
    }
    this.versionOrder = packet.return_versions.map((v) => v.version);
    for (const s of packet.firm.staff) this.staff.set(s.id, s);
    for (const p of packet.household.people) this.people.set(p.id, p);
    for (const q of packet.client.questionnaire) this.qa.set(q.id, q);
    for (const m of packet.client.messages) this.messages.set(m.id, m);
    for (const c of packet.client.call_notes) this.calls.set(c.id, c);
    for (const t of packet.timeline) this.timeline.set(t.id, t);
  }

  get params() { return this.packet.engine_reference.parameters; }

  ev(docId: string, field: string): ExtractedValue | undefined {
    return this.evByDocField.get(`${docId}:${field}`);
  }

  evNum(docId: string, field: string): number {
    const v = this.ev(docId, field)?.value;
    return typeof v === 'number' ? v : 0;
  }

  page(docId: string, page: number): string {
    return this.docs.get(docId)?.pages.find((p) => p.page === page)?.printed_content ?? '';
  }

  /** The latest engine version computed on or before a date (ISO). */
  versionAsOf(at: string): ReturnVersion | null {
    let out: ReturnVersion | null = null;
    for (const v of this.packet.return_versions) if (v.computed_at <= at) out = v;
    return out;
  }

  docsAsOf(at: string): PacketDocument[] {
    return this.packet.documents.filter((d) => d.received_at <= at);
  }

  received(docId: string, at: string): boolean {
    const d = this.docs.get(docId);
    return !!d && d.received_at <= at;
  }

  /** Lines (in a version) that a document lands on, directly through its extracted values. */
  docLanding(version: string, docId: string): { ev: ExtractedValue; lines: string[] }[] {
    const uses = this.evUses.get(version);
    return (this.evsByDoc.get(docId) ?? []).map((ev) => ({ ev, lines: uses?.get(ev.id) ?? [] }));
  }

  /** Walk consumers upward from a line to the return's totals. */
  flowsTo(version: string, key: string, limit = 400): string[] {
    const cons = this.consumers.get(version);
    const seen = new Set<string>();
    const queue = [key];
    while (queue.length && seen.size < limit) {
      const k = queue.shift()!;
      for (const c of cons?.get(k) ?? []) if (!seen.has(c)) { seen.add(c); queue.push(c); }
    }
    return [...seen];
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
