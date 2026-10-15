// Types for the Miraflores packet, exactly as delivered (see public/packet.json and its README).
// Nothing in the app mutates a Packet. Everything people do lives in the activity log.

export type ValueType =
  | 'money' | 'date' | 'text' | 'integer' | 'quantity' | 'percent'
  | 'boolean' | 'code' | 'ssn' | 'ein' | 'account_number';

export interface Position { x0: number; y0: number; x1: number; y1: number }

export interface ExtractedValue {
  id: string;
  document_id: string;
  page: number;
  field: string;
  label: string;
  value: number | string | boolean | null;
  value_type: ValueType;
  text_as_read: string;
  position: Position;
  confidence: number;
}

export interface DocPage { page: number; printed_content: string }

export interface PacketDocument {
  id: string;
  title: string;
  document_type: string;
  issuer: string;
  belongs_to: string;
  tax_year: number;
  received_at: string;
  uploaded_by: 'client' | 'firm';
  file_name: string;
  page_count: number;
  pages: DocPage[];
  marked_corrected: boolean | null;
  extraction: { status: 'extracted' | 'partial' | 'not_extracted'; values: number; reason: string | null };
}

export interface Person {
  id: string;
  role: 'taxpayer' | 'spouse' | 'dependent';
  name: string;
  ssn: string;
  dob: string;
  occupation?: string;
  ip_pin?: string | null;
  phone?: string;
  email?: string;
  relationship?: string;
  months_lived_with_you?: number;
  full_time_student?: boolean;
  note?: string;
  own_income?: string;
}

export interface Household {
  filing_status: string;
  tax_year: number;
  entered_by: string;
  people: Person[];
  addresses: { from: string; to: string | null; address: string; type: string }[];
  residency: { state: string; from: string; to: string; status: string }[];
  bank_account_for_refund_or_payment: { routing: string; account: string; type: string; bank: string };
  prior_year_agi_for_esignature: number;
  related_returns: { who: string; return: string; prepared_by: string; in_this_packet: boolean | string }[];
}

export interface QA { id: string; question: string; answer: string; answered_by: string; answered_at: string }
export interface ClientMessage { id: string; sent_at: string; from: string; to: string; text: string }
export interface CallNote { id: string; date: string; participants: string[]; notes: string[] }

export interface Staff {
  id: string;
  name: string;
  role: 'preparer' | 'reviewer' | 'partner' | 'firm_administrator' | 'quality_reviewer';
  credential: string | null;
  sensitive_data_clearance: boolean;
  active_from: string;
  note?: string;
}

export interface Firm {
  name: string;
  staff: Staff[];
  firm_identity: {
    ein: string; address: string; phone: string; efin: string; ero_pin: string;
    ptins: Record<string, string>; paid_preparer_signing_returns: string;
  };
  client_users: { id: string; name: string; role: string }[];
  assignment_at_start: { preparer: string; reviewer: string; partner: string };
  deadlines: { what: string; date: string }[];
  budget_hours: Record<string, number>;
  starter_standards: {
    note: string;
    verification_types: string[];
    variance_review: { compare_to: string; flag_if_change_over_percent: number; and_over_amount: number };
    review_levels: string[];
    rules: string[];
    required_steps: string[];
  };
}

export interface AssetRecord {
  asset_id: string;
  description: string;
  activity: string;
  cost: number;
  placed_in_service: string;
  method: string;
  life_years: number;
  disposed: string | null;
  land_value: number | null;
  federal: Record<string, number>;
  california: Record<string, number>;
  amt_difference: Record<string, number>;
  sources: string[];
}

export interface PriorYears {
  return_2024: {
    prepared_by: string;
    filed: string;
    residency: string;
    dependents: { name: string; ssn: string }[];
    lines: Record<string, number | string>;
    line_labels: Record<string, string>;
    line_sources: Record<string, string>;
    notes: Record<string, string>;
    K1_1120S: Record<string, number>;
    K1_1065: Record<string, number | string>;
  };
  prior_preparer_workpaper: {
    source_document: string;
    summary_memo: string;
    notes: string[];
    open_items_left_by_prior_preparer: string[];
    depreciation_schedule: string;
  };
  asset_records: AssetRecord[];
  basis_records: Record<string, Record<string, unknown>[]>;
  carryovers_into_2025: Record<string, unknown> & {
    capital_loss_short: number; capital_loss_long: number;
    passive_1450_fremont: number; passive_1200_barton_hills: number;
  };
}

export interface Transaction { date: string; code: string; description: string; amount: number | string }

export interface AgencyRecords {
  irs_account_transcript_2025: { as_of: string; transactions: Transaction[] }[];
  ftb_account: {
    as_of: string;
    tax_year_2025_payments: { date: string; amount: number }[];
    tax_year_2024_payments_after_filing: { date: string; amount: number; note: string }[];
  };
  notices: {
    id: string; agency: string; type: string; tax_year: number; dated: string;
    summary?: string; status?: string; response_due?: string; document: string;
    items_under_examination?: string[];
  }[];
  efile: { date: string; jurisdiction: string; submission_id: string; status: string; errors?: { code: string; message: string }[] }[];
}

export interface TimelineEvent { id: string; at: string; event: string; actor: string | null; detail: string | null; refs: string[] }

export interface ReturnLine {
  key: string;
  jurisdiction: 'federal' | 'california';
  form: string;
  line: string;
  label: string;
  value: number | string;
  rule: string;
  inputs: string[];
  sources: string[];
  note: string | null;
}

export interface Totals {
  agi?: number; taxable_income?: number; total_tax: number; payments: number; balance_due: number; penalty: number;
  total_agi?: number; ca_agi?: number;
}

export interface EngineAsset {
  asset_id: string;
  description: string;
  activity: string;
  cost: number;
  land_value_not_depreciated: number | null;
  placed_in_service: string;
  method: string;
  life_years: number;
  federal: { prior_accumulated: number; depreciation_2025: number; accumulated_end: number };
  california: { prior_accumulated: number; depreciation_2025: number; accumulated_end: number };
  amt: { depreciation_2025: number; difference_from_regular: number };
  disposed: string | null;
  sources: string[];
  disposition?: { date: string; sold_with: string; unrecaptured_1250_depreciation: number; section_1250_ordinary_recapture: number };
}

export interface Diagnostic { code: string; severity: 'info' | 'warning'; message: string; refs: string[] }

export interface ReturnVersion {
  version: string;
  computed_at: string;
  trigger: string;
  documents_used: string[];
  documents_superseded: string[];
  summary: { federal: Totals; california: Totals };
  tax_effect_rates: Record<string, { federal_per_dollar: number; california_per_dollar: number }>;
  carryovers_out: { federal: Record<string, number | null>; california: Record<string, unknown> };
  assets: EngineAsset[];
  diagnostics: Diagnostic[];
  changes_from_previous: { key: string; change: 'added' | 'changed' | 'removed'; old?: number | string; new?: number | string }[];
  lines: ReturnLine[];
}

export interface WhatIf {
  id: string;
  description: string;
  base_version: string;
  choices: Record<string, string>;
  federal: { base: Totals; alternative: Totals; total_tax_change: number; penalty_change: number };
  california: { base: Totals; alternative: Totals; total_tax_change: number };
  changed_lines: { key: string; change: string; old?: number | string; new?: number | string }[];
}

export interface Packet {
  packet: { name: string; version: string; generated: string; client_id: string };
  readme: Record<string, unknown> & { sections: Record<string, string>; reference_formats: Record<string, string> };
  household: Household;
  documents: PacketDocument[];
  extracted_values: ExtractedValue[];
  client: { questionnaire: QA[]; messages: ClientMessage[]; call_notes: CallNote[] };
  firm: Firm;
  prior_years: PriorYears;
  tax_agency_records: AgencyRecords;
  timeline: TimelineEvent[];
  engine_reference: { parameters: EngineParams; rules: Record<string, string> };
  return_versions: ReturnVersion[];
  what_if: {
    alternatives: WhatIf[];
    extension: {
      computed_at: string; based_on_version: string;
      federal: { estimated_total_tax: number; payments: number; estimated_balance: number; paid_with_form_4868: number; rule: string };
      california: { estimated_total_tax: number; payments: number; estimated_balance: number; paid_with_ftb_3519: number; rule: string };
    };
  };
  planning_reference_2026: {
    federal_estimate_due_dates: string[];
    federal_safe_harbor: string;
    california_estimate_due_dates: string[];
    california_installment_percentages: number[];
    california_safe_harbor: string;
    known_2026_changes_for_this_household: string[];
  };
  post_filing_rates: {
    irs_underpayment_interest_rate_annual: number;
    irs_failure_to_pay_penalty_per_month: number;
    ftb_interest_rate_annual: number;
    ftb_late_payment_penalty: string;
    note: string;
  };
  fx_rates: { SEK_per_USD: Record<string, number> };
}

export interface EngineParams {
  std_deduction_mfj: number;
  brackets_mfj: [number | null, number][];
  ltcg_0_top: number;
  ltcg_15_top: number;
  salt_cap: number;
  salt_cap_phase_start: number;
  salt_cap_phase_rate: number;
  salt_cap_floor: number;
  ss_wage_base: number;
  se_factor: number;
  addl_medicare_threshold: number;
  niit_threshold: number;
  amt_exemption: number;
  amt_phaseout_start: number;
  amt_28_start: number;
  qbi_threshold: number;
  qbi_range: number;
  ctc_per_child: number;
  odc_per_dependent: number;
  ctc_phaseout_start: number;
  aotc_phaseout: [number, number];
  hsa_family_limit: number;
  dep_care_limit_one: number;
  dep_care_exclusion_max: number;
  mileage_rate: number;
  home_office_rate: number;
  fed_underpayment_rate: number;
  prior_year_tax: number;
  prior_year_agi: number;
  fx: { SEK: Record<string, number> };
  ca_brackets_mfj: [number | null, number][];
  ca_std_deduction_mfj: number;
  ca_personal_credit: number;
  ca_dependent_credit: number;
  ca_itemized_phaseout_start: number;
  ca_section179_limit: number;
  ca_prior_year_tax: number;
  ca_underpayment_rate: number;
  ca_resident_days: number;
  year_days: number;
}
