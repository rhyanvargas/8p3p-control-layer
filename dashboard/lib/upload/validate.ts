import type {
  RowValidationResult,
  SignalEnvelopeFields,
  ValidationError,
} from '@/lib/upload/types';

const SIGNAL_ID_RE = /^[A-Za-z0-9._:-]+$/;
const SCHEMA_VERSION_RE = /^v[0-9]+$/;
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function validateEnvelope(row: Record<string, unknown>): {
  valid: boolean;
  errors: ValidationError[];
  envelope?: SignalEnvelopeFields;
} {
  const errors: ValidationError[] = [];

  const requiredFields = [
    'signal_id',
    'source_system',
    'learner_reference',
    'timestamp',
    'schema_version',
  ] as const;

  for (const field of requiredFields) {
    const val = asString(row[field]);
    if (!val) {
      errors.push({
        field_path: field,
        code: 'missing_required_field',
        message: `${field} is required.`,
      });
    }
  }

  const signalId = asString(row.signal_id);
  if (signalId) {
    if (signalId.length > 256 || !SIGNAL_ID_RE.test(signalId)) {
      errors.push({
        field_path: 'signal_id',
        code: 'invalid_charset',
        message: 'signal_id must match ^[A-Za-z0-9._:-]+$ (1..256).',
      });
    }
  }

  const schemaVersion = asString(row.schema_version);
  if (schemaVersion && !SCHEMA_VERSION_RE.test(schemaVersion)) {
    errors.push({
      field_path: 'schema_version',
      code: 'invalid_format',
      message: 'schema_version must match ^v[0-9]+$.',
    });
  }

  const timestamp = asString(row.timestamp);
  if (timestamp) {
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed) || !RFC3339_RE.test(timestamp)) {
      errors.push({
        field_path: 'timestamp',
        code: 'invalid_timestamp',
        message: 'timestamp must be RFC3339 with timezone.',
      });
    }
  }

  let payload: Record<string, unknown>;
  if (row.payload == null) {
    errors.push({
      field_path: 'payload',
      code: 'missing_required_field',
      message: 'payload is required.',
    });
    payload = {};
  } else if (typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    errors.push({
      field_path: 'payload',
      code: 'invalid_format',
      message: 'payload must be an object.',
    });
    payload = {};
  } else {
    payload = row.payload as Record<string, unknown>;
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    envelope: {
      signal_id: signalId!,
      source_system: asString(row.source_system)!,
      learner_reference: asString(row.learner_reference)!,
      timestamp: timestamp!,
      schema_version: schemaVersion!,
      payload,
    },
  };
}

export function validateRows(rows: Record<string, unknown>[]): RowValidationResult[] {
  return rows.map((row, rowIndex) => {
    const result = validateEnvelope(row);
    return {
      rowIndex,
      valid: result.valid,
      errors: result.errors,
      envelope: result.envelope,
    };
  });
}

export function validateRow(row: Record<string, unknown>, rowIndex = 0): RowValidationResult {
  const result = validateEnvelope(row);
  return {
    rowIndex,
    valid: result.valid,
    errors: result.errors,
    envelope: result.envelope,
  };
}
