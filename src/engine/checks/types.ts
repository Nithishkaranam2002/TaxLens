import type { PacketIndex } from '../../data/index';
import type { ReturnVersion } from '../../data/packet';
import type { AreaId } from '../areas';
import type { FixDef } from '../fixes';
import type { Computed } from '../recompute';

export type CheckStatus = 'pass' | 'fail' | 'review' | 'info' | 'waiting';

export type CheckGroup =
  | 'Re-read the documents'
  | 'Duplicates and corrected forms'
  | 'Reconciliations'
  | 'Rules and judgment'
  | 'Agency records'
  | 'California'
  | 'Prior year and client answers'
  | 'Engine'
  | 'Completeness';

export const GROUP_ORDER: CheckGroup[] = [
  'Re-read the documents', 'Duplicates and corrected forms', 'Reconciliations', 'Rules and judgment',
  'Agency records', 'California', 'Prior year and client answers', 'Engine', 'Completeness',
];

export type Cell = string | number | null | { v: string | number | null; ref?: string; status?: RowStatus; money?: boolean; strong?: boolean };
export type RowStatus = 'ok' | 'bad' | 'warn' | 'info';

export interface EvidenceTable {
  title?: string;
  columns: string[];
  /** Column indexes that hold money and should be right-aligned with tabular numbers. */
  money?: number[];
  rows: { cells: Cell[]; status?: RowStatus; ref?: string }[];
  foot?: Cell[];
}

export interface CheckResult {
  id: string;
  group: CheckGroup;
  area: AreaId;
  title: string;
  /** The question the check answers, in plain words. */
  question: string;
  /** How it works, in one sentence. Shown to people who want to know why to trust it. */
  method: string;
  status: CheckStatus;
  summary: string;
  tables: EvidenceTable[];
  refs: string[];
  fixes: string[];
  /** Counts for checks that scan many items. */
  scanned?: number;
  flagged?: number;
}

export interface CheckCtx {
  ix: PacketIndex;
  asOf: string;
  version: ReturnVersion | null;
  base: Computed | null;
  fixes: Map<string, FixDef>;
  has: (docId: string) => boolean;
  line: (key: string) => number;
  lineText: (key: string) => string;
}
