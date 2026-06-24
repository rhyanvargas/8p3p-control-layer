export type ParsedTable = {
  columns: string[];
  rows: Record<string, unknown>[];
  sourceFormat: 'json' | 'csv' | 'xlsx';
};

export type SignalEnvelopeFields = {
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  payload: Record<string, unknown>;
};

export type FieldMapping = {
  signal_id?: string;
  source_system?: string;
  learner_reference?: string;
  timestamp?: string;
  schema_version?: string;
  payloadColumns: string[];
};

export type ValidationError = {
  field_path: string;
  code: string;
  message: string;
};

export type RowValidationResult = {
  rowIndex: number;
  valid: boolean;
  errors: ValidationError[];
  envelope?: SignalEnvelopeFields;
};

export type PreflightVerdict =
  | 'clean'
  | 'pii_blocking'
  | 'semantic_blocking'
  | 'semantic_resolvable_by_mapping';

export type PreflightResult = {
  disabled?: boolean;
  verdict?: PreflightVerdict;
  forbidden_pii?: Array<{ key: string; path: string }>;
  forbidden_semantic_raw?: Array<{ key: string; path: string }>;
  mapping_suggestions?: Array<{
    raw_key: string;
    raw_path: string;
    suggested_canonical: string | null;
    rationale: string;
  }>;
  note?: string;
  mapping_error?: string;
};

export type CommitRowResult = {
  rowIndex: number;
  signal_id: string;
  outcome: 'accepted' | 'rejected' | 'duplicate';
  rejection_reason?: { code: string; field_path?: string };
};

export type CommitSummary = {
  accepted: number;
  rejected: number;
  duplicate: number;
  results: CommitRowResult[];
  /** Rejected rows with reason codes — ready for CSV export. */
  rejections: CommitRowResult[];
};

export class UploadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadParseError';
  }
}
