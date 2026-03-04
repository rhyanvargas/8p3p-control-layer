/**
 * Shared TypeScript types for the 8P3P Control Layer
 * Signal Ingestion component types
 */

/**
 * Signal status enumeration
 */
export type SignalStatus = 'accepted' | 'rejected' | 'duplicate';

/**
 * Rejection reason details
 */
export interface RejectionReason {
  code: string;
  message: string;
  field_path?: string;
}

/**
 * Optional metadata for request tracing
 */
export interface SignalMetadata {
  correlation_id?: string;
  trace_id?: string;
}

/**
 * Input signal structure (request)
 * All required fields must be present for acceptance
 */
export interface SignalEnvelope {
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  payload: Record<string, unknown>;
  metadata?: SignalMetadata;
}

/**
 * Signal ingestion result (response)
 */
export interface SignalIngestResult {
  org_id: string;
  signal_id: string;
  status: SignalStatus;
  received_at: string;
  rejection_reason?: RejectionReason;
}

/**
 * Validation result from schema validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: RejectionReason[];
}

/**
 * Forbidden key detection result
 */
export interface ForbiddenKeyResult {
  key: string;
  path: string;
}

/**
 * Idempotency check result
 */
export interface IdempotencyResult {
  isDuplicate: boolean;
  receivedAt?: string;
}

// =============================================================================
// Ingestion Log Types (Inspection API)
// =============================================================================

/** Outcome of an ingestion attempt */
export type IngestionOutcomeType = 'accepted' | 'rejected' | 'duplicate';

/** Entry to append to the ingestion log */
export interface IngestionOutcomeEntry {
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  outcome: IngestionOutcomeType;
  received_at: string;
  rejection_reason?: RejectionReason | null;
}

/** Single ingestion outcome as returned from the log */
export interface IngestionOutcome {
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  outcome: IngestionOutcomeType;
  received_at: string;
  rejection_reason: RejectionReason | null;
}

/** Request for GET /v1/ingestion */
export interface GetIngestionOutcomesRequest {
  org_id: string;
  limit?: number;
  outcome?: IngestionOutcomeType;
  cursor?: string;
}

/** Response from GET /v1/ingestion */
export interface IngestionLogResponse {
  org_id: string;
  entries: IngestionOutcome[];
  next_cursor: string | null;
}

// =============================================================================
// Signal Log Types (Stage 2)
// =============================================================================

/**
 * Signal record stored in the Signal Log
 * Extends SignalEnvelope with accepted_at timestamp
 */
export interface SignalRecord extends SignalEnvelope {
  /** When the signal was accepted by ingestion (RFC3339) */
  accepted_at: string;
}

/**
 * Query parameters for GET /signals endpoint
 */
export interface SignalLogReadRequest {
  /** Organization ID (required for tenant isolation) */
  org_id: string;
  /** Learner identifier to query signals for */
  learner_reference: string;
  /** Start of time window (RFC3339) */
  from_time: string;
  /** End of time window (RFC3339) */
  to_time: string;
  /** Opaque pagination token from previous response */
  page_token?: string;
  /** Number of results per page (1-1000, default 100) */
  page_size?: number;
}

/**
 * Response from GET /signals endpoint
 */
export interface SignalLogReadResponse {
  /** Organization ID for the query */
  org_id: string;
  /** Learner identifier queried */
  learner_reference: string;
  /** Array of signal records matching the query */
  signals: SignalRecord[];
  /** Token for next page, or null if no more results */
  next_page_token: string | null;
}

/**
 * Internal query result from signal log store
 */
export interface SignalLogQueryResult {
  /** Signal records for current page */
  signals: SignalRecord[];
  /** Whether there are more results after this page */
  hasMore: boolean;
  /** Cursor position for next page (internal use) */
  nextCursor?: number;
}

// =============================================================================
// STATE Engine Types (Stage 3)
// =============================================================================

/**
 * Provenance for a learner state snapshot (last applied signal)
 */
export interface StateProvenance {
  last_signal_id: string;
  last_signal_timestamp: string;
}

/**
 * Learner state snapshot stored by the STATE Engine
 */
export interface LearnerState {
  org_id: string;
  learner_reference: string;
  state_id: string;
  state_version: number;
  updated_at: string;
  state: Record<string, unknown>;
  provenance: StateProvenance;
}

/** Lightweight learner summary for GET /v1/state/list */
export interface StateSummary {
  learner_reference: string;
  state_version: number;
  updated_at: string;
}

/**
 * Internal request to apply signals to learner state
 */
export interface ApplySignalsRequest {
  org_id: string;
  learner_reference: string;
  signal_ids: string[];
  requested_at: string;
}

/**
 * Result of applying signals to learner state
 */
export interface ApplySignalsResult {
  org_id: string;
  learner_reference: string;
  prior_state_version: number;
  new_state_version: number;
  state_id: string;
  applied_signal_ids: string[];
  updated_at: string;
}

// ==========================================================================
// Decision Engine Types (Stage 4)
// ==========================================================================

/** Leaf condition: compares a state field against a value */
export interface ConditionLeaf {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number | boolean;
}

/** Compound AND condition */
export interface ConditionAll {
  all: ConditionNode[];
}

/** Compound OR condition */
export interface ConditionAny {
  any: ConditionNode[];
}

/** Recursive condition node (leaf | all | any) */
export type ConditionNode = ConditionLeaf | ConditionAll | ConditionAny;

/** Single policy rule */
export interface PolicyRule {
  rule_id: string;
  condition: ConditionNode;
  decision_type: DecisionType;
}

/**
 * Per-org routing config loaded from `policies/{orgId}/routing.json`.
 * Maps source_system values to policy keys (e.g. "learner" | "staff").
 */
export interface PolicyRoutingConfig {
  source_system_map: Record<string, string>;
  default_policy_key: string;
}

/** Policy definition loaded from JSON */
export interface PolicyDefinition {
  policy_id: string;
  policy_version: string;
  description: string;
  rules: PolicyRule[];
  default_decision_type: DecisionType;
}

/** Closed set of 4 decision types */
export type DecisionType = 'reinforce' | 'advance' | 'intervene' | 'pause';

/** Runtime constant for decision type validation */
export const DECISION_TYPES: readonly DecisionType[] = ['reinforce', 'advance', 'intervene', 'pause'] as const;

/** Single leaf comparison result for trace (field, operator, threshold, actual value) */
export interface EvaluatedField {
  field: string;
  operator: string;
  threshold: string | number | boolean;
  actual_value: unknown;
}

/** Matched rule with evaluated fields (for enriched trace) */
export interface MatchedRule {
  rule_id: string;
  decision_type: DecisionType;
  condition: ConditionNode;
  evaluated_fields: EvaluatedField[];
}

/** Policy evaluation result */
export interface PolicyEvaluationResult {
  decision_type: DecisionType;
  matched_rule_id: string | null;
  /** Full rule when a rule matched; null when default matched */
  matched_rule?: MatchedRule | null;
  /** Leaf evaluations for the matching path */
  evaluated_fields?: EvaluatedField[];
}

/** Output metadata for downstream routing (priority, TTL, targets) */
export interface OutputMetadata {
  priority: number | null;
  ttl_seconds?: number | null;
  downstream_targets?: string[];
}

/** Canonical Decision object */
export interface Decision {
  org_id: string;
  decision_id: string;
  learner_reference: string;
  decision_type: DecisionType;
  decided_at: string;
  decision_context: Record<string, unknown>;
  trace: {
    state_id: string;
    state_version: number;
    /** Policy name (e.g. springs:learner, springs:staff) — distinguishes policies with same version */
    policy_id?: string;
    policy_version: string;
    matched_rule_id: string | null;
    /** Frozen state at evaluation time (enriched trace) */
    state_snapshot: Record<string, unknown>;
    /** Full matched rule with evaluated_fields (enriched trace) */
    matched_rule: MatchedRule | null;
    /** Human-readable rationale (enriched trace) */
    rationale: string;
  };
  /** Output metadata for downstream (priority = 1-based rule index) */
  output_metadata?: OutputMetadata;
}

/** Request to evaluate state for a decision */
export interface EvaluateStateForDecisionRequest {
  org_id: string;
  learner_reference: string;
  state_id: string;
  state_version: number;
  requested_at: string;
  /** Org-defined user category (e.g. "learner" | "staff"). Defaults to "learner". */
  user_type?: string;
  evaluation_context?: Record<string, unknown>;
}

/** Discriminated outcome for evaluateState */
export type EvaluateDecisionOutcome =
  | { ok: true; result: Decision }
  | { ok: false; errors: RejectionReason[] };

/** Request for GET /v1/decisions */
export interface GetDecisionsRequest {
  org_id: string;
  learner_reference: string;
  from_time: string;
  to_time: string;
  page_token?: string;
  page_size?: number;
}

/** Response for GET /v1/decisions */
export interface GetDecisionsResponse {
  org_id: string;
  learner_reference: string;
  decisions: Decision[];
  next_page_token: string | null;
}

// =============================================================================
// Receipts API (GET /v1/receipts) — Compliance/audit projection of Decision.trace
// =============================================================================

/** Receipt: projection of Decision for compliance/audit (decision_id, decision_type, decided_at, trace) */
export type Receipt = Pick<Decision, 'decision_id' | 'decision_type' | 'decided_at' | 'trace'>;

/** Response for GET /v1/receipts */
export interface GetReceiptsResponse {
  org_id: string;
  learner_reference: string;
  receipts: Receipt[];
  next_page_token: string | null;
}
