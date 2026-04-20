/** Mirrors GET /v1/decisions decision records (subset used by the Decision Panel). */
export type DecisionType = 'reinforce' | 'advance' | 'intervene' | 'pause';

export interface OutputMetadata {
  priority: number | null;
  ttl_seconds?: number | null;
  downstream_targets?: string[];
}

export interface DecisionTrace {
  state_id: string;
  state_version: number;
  policy_id: string;
  policy_version: string;
  matched_rule_id: string | null;
  state_snapshot: Record<string, unknown>;
  matched_rule: unknown;
  rationale: string;
  educator_summary: string;
}

export interface Decision {
  org_id: string;
  decision_id: string;
  learner_reference: string;
  decision_type: DecisionType;
  decided_at: string;
  decision_context: Record<string, unknown>;
  trace: DecisionTrace;
  output_metadata?: OutputMetadata;
}

export interface GetDecisionsResponse {
  org_id: string;
  learner_reference: string;
  decisions: Decision[];
  next_page_token: string | null;
}

export interface LearnerListItem {
  learner_reference: string;
  state_version: number;
  updated_at: string;
}

export interface StateListResponse {
  org_id: string;
  learners: LearnerListItem[];
  next_cursor: string | null;
}

export interface StateProvenance {
  last_signal_id: string;
  last_signal_timestamp: string;
}

export interface LearnerStateResponse {
  org_id: string;
  learner_reference: string;
  state_id: string;
  state_version: number;
  updated_at: string;
  state: Record<string, unknown>;
  provenance: StateProvenance;
}

export interface SignalRecord {
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  payload: Record<string, unknown>;
  accepted_at: string;
}

export interface SignalsResponse {
  org_id: string;
  learner_reference: string;
  signals: SignalRecord[];
  next_page_token: string | null;
}
