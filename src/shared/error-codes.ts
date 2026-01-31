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
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
