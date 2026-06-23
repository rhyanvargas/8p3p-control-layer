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

export type IngestionOutcome = 'accepted' | 'rejected' | 'duplicate';

export interface IngestionLogEntry {
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  outcome: IngestionOutcome;
  received_at: string;
  rejection_reason: { code: string; field_path?: string } | null;
}

export interface IngestionLogResponse {
  org_id: string;
  entries: IngestionLogEntry[];
  next_cursor: string | null;
}

/** Mirrors OpenAPI TrajectoryFieldSummary (subset used by dashboards). */
export interface TrajectoryFieldSummary {
  first_value: number | null;
  latest_value: number | null;
  overall_direction: 'improving' | 'declining' | 'stable' | null;
  version_count: number;
}

/** Closed URS projection on GET /v1/learners/:ref/summary current_state.fields. */
export interface LearnerStateProjection {
  masteryScore?: number | null;
  masteryScore_delta?: number | null;
  masteryScore_direction?: 'improving' | 'declining' | 'stable' | null;
  stabilityScore?: number | null;
  stabilityScore_delta?: number | null;
  stabilityScore_direction?: 'improving' | 'declining' | 'stable' | null;
  timeSinceReinforcement?: number | null;
  timeSinceReinforcement_delta?: number | null;
  timeSinceReinforcement_direction?: 'improving' | 'declining' | 'stable' | null;
  riskSignal?: number | null;
  riskSignal_delta?: number | null;
  riskSignal_direction?: 'improving' | 'declining' | 'stable' | null;
  skill?: string | null;
}

export interface RecentDecisionItem {
  decision_id: string;
  decision_type: DecisionType | string;
  decided_at: string;
  matched_rule_id: string | null;
  educator_summary: string;
  rationale: string;
  policy_version: string;
}

export interface ActivePolicySummary {
  policy_id: string;
  policy_key: 'learner' | 'staff';
  policy_version: string;
  description?: string;
  rule_count: number;
}

export interface SignalsSummary {
  total_count: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
}

export interface LearnerSummaryCurrentState {
  state_id: string;
  state_version: number;
  updated_at: string;
  fields: LearnerStateProjection;
  mastery_breakdown: Record<string, unknown> | null;
}

/** Mirrors GET /v1/learners/:learner_reference/summary (OpenAPI LearnerSummaryResponse). */
export interface LearnerSummaryResponse {
  org_id: string;
  learner_reference: string;
  generated_at: string;
  current_state: LearnerSummaryCurrentState;
  recent_decisions: RecentDecisionItem[];
  field_trajectories: Record<string, TrajectoryFieldSummary>;
  active_policy: ActivePolicySummary | null;
  signals_summary: SignalsSummary;
}

/** Mirrors GET /v1/policies (OpenAPI PolicyListResponse). */
export interface PolicySummary {
  policy_id: string;
  policy_version: string;
  policy_key: string;
  description: string;
  rule_count: number;
}

export interface PolicyRoutingConfig {
  source_system_map?: Record<string, string>;
  default_policy_key?: string;
}

export interface PolicyListResponse {
  org_id: string;
  policies: PolicySummary[];
  routing: PolicyRoutingConfig | null;
}

/** Mirrors GET /v1/program-metrics (see docs/specs/program-metrics.md). */
export interface ProgramMetricValue {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  window: { from: string; to: string };
  computed_at: string;
  source_note?: string;
}

export interface ProgramMetricsReport {
  org_id: string;
  window: { from: string; to: string };
  metrics: Record<string, ProgramMetricValue>;
}
