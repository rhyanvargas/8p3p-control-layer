/**
 * Canonical error codes for Signal Ingestion
 * These codes are used in rejection reasons and must match the spec
 */

export const ErrorCodes = {
  /** Required field is absent */
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  
  /** Field has wrong type */
  INVALID_TYPE: 'invalid_type',
  
  /** Field format is wrong (e.g., malformed JSON) */
  INVALID_FORMAT: 'invalid_format',
  
  /** Timestamp not RFC3339 or missing timezone */
  INVALID_TIMESTAMP: 'invalid_timestamp',
  
  /** Field exceeds length limits */
  INVALID_LENGTH: 'invalid_length',
  
  /** Field contains invalid characters */
  INVALID_CHARSET: 'invalid_charset',
  
  /** schema_version doesn't match ^v[0-9]+$ */
  INVALID_SCHEMA_VERSION: 'invalid_schema_version',
  
  /** Payload is not a JSON object */
  PAYLOAD_NOT_OBJECT: 'payload_not_object',
  
  /** Forbidden semantic key detected in payload */
  FORBIDDEN_SEMANTIC_KEY_DETECTED: 'forbidden_semantic_key_detected',
  
  /** Signal already ingested (duplicate) */
  DUPLICATE_SIGNAL_ID: 'duplicate_signal_id',
  
  /** Missing or blank org_id */
  ORG_SCOPE_REQUIRED: 'org_scope_required',
  
  /** Request body exceeds size limit */
  REQUEST_TOO_LARGE: 'request_too_large',
  
  // ==========================================================================
  // Signal Log Error Codes (Stage 2)
  // ==========================================================================
  
  /** from_time is after to_time */
  INVALID_TIME_RANGE: 'invalid_time_range',
  
  /** page_token is malformed or invalid */
  INVALID_PAGE_TOKEN: 'invalid_page_token',
  
  /** page_size is 0, negative, or > 1000 */
  PAGE_SIZE_OUT_OF_RANGE: 'page_size_out_of_range',
  
  /** No signals found for the learner in time range (informational) */
  LEARNER_NOT_FOUND: 'learner_not_found',

  // ==========================================================================
  // STATE Engine Error Codes (Stage 3)
  // ==========================================================================

  /** Signal ID not found in Signal Log */
  UNKNOWN_SIGNAL_ID: 'unknown_signal_id',

  /** Signal belongs to a different org than request */
  SIGNALS_NOT_IN_ORG_SCOPE: 'signals_not_in_org_scope',

  /** State payload is not a JSON object */
  STATE_PAYLOAD_NOT_OBJECT: 'state_payload_not_object',

  /** Optimistic lock failed (state_version conflict on save) */
  STATE_VERSION_CONFLICT: 'state_version_conflict',

  // ==========================================================================
  // Decision Engine Error Codes (Stage 4)
  // ==========================================================================

  /** Decision type not in closed set */
  INVALID_DECISION_TYPE: 'invalid_decision_type',

  /** decision_context is not a JSON object */
  DECISION_CONTEXT_NOT_OBJECT: 'decision_context_not_object',

  /** Trace field absent from decision */
  MISSING_TRACE: 'missing_trace',

  /** Trace references state that doesn't match evaluation input */
  TRACE_STATE_MISMATCH: 'trace_state_mismatch',

  /** No state exists for learner — cannot evaluate */
  STATE_NOT_FOUND: 'state_not_found',

  /** No policy loaded or available */
  POLICY_NOT_FOUND: 'policy_not_found',

  /** policy_version is not valid semver (e.g. 1.0.0) */
  INVALID_POLICY_VERSION: 'invalid_policy_version',

  // ==========================================================================
  // API Key Middleware (v1 pilot)
  // ==========================================================================

  /** API key header missing */
  API_KEY_REQUIRED: 'api_key_required',

  /** API key does not match */
  API_KEY_INVALID: 'api_key_invalid',

  // ==========================================================================
  // Inspection API (v1 pilot)
  // ==========================================================================

  /** Requested state version does not exist for this learner */
  STATE_VERSION_NOT_FOUND: 'state_version_not_found',

  /** outcome parameter is not one of: accepted, rejected, duplicate */
  INVALID_OUTCOME_FILTER: 'invalid_outcome_filter',

  /** limit parameter is 0, negative, or > 500 */
  LIMIT_OUT_OF_RANGE: 'limit_out_of_range',

  // ==========================================================================
  // Policy Storage — DynamoDB (v1.1)
  // ==========================================================================

  /**
   * DynamoDB read failed for a policy item; fell back to bundled or cached policy.
   * Logged as a structured warning — never returned to the caller.
   */
  POLICY_DYNAMO_DEGRADED: 'policy_dynamo_degraded',

  /**
   * Policy item found in DynamoDB but status === "disabled"; skipped in resolution chain.
   * Logged as a structured warning — never returned to the caller.
   */
  POLICY_SKIPPED_DISABLED: 'policy_skipped_disabled',

  // ==========================================================================
  // Policy Management Admin API (v1.1)
  // ==========================================================================

  /** Admin endpoint called without a valid x-admin-api-key header (401) */
  ADMIN_KEY_REQUIRED: 'admin_key_required',

  /**
   * Optimistic lock conflict: If-Match version does not match the current
   * policy_version in DynamoDB (409).
   */
  VERSION_CONFLICT: 'version_conflict',

  /** PATCH body status field is not "active" or "disabled" (400) */
  INVALID_STATUS_VALUE: 'invalid_status_value',

  /**
   * PUT/POST validate body failed structural validation via validatePolicyStructure (400).
   * Maps all validation throws from policy-loader to this single admin-facing code.
   */
  INVALID_POLICY_STRUCTURE: 'invalid_policy_structure',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
