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
