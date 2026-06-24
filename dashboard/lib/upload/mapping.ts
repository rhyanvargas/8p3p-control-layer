import type { FieldMapping, ParsedTable } from '@/lib/upload/types';

const ENVELOPE_FIELDS = [
  'signal_id',
  'source_system',
  'learner_reference',
  'timestamp',
  'schema_version',
] as const;

export type EnvelopeField = (typeof ENVELOPE_FIELDS)[number];

export const ENVELOPE_FIELD_OPTIONS: Array<{ value: EnvelopeField | 'payload'; label: string }> = [
  { value: 'signal_id', label: 'Signal ID' },
  { value: 'source_system', label: 'Source system' },
  { value: 'learner_reference', label: 'Learner reference' },
  { value: 'timestamp', label: 'Timestamp' },
  { value: 'schema_version', label: 'Schema version' },
  { value: 'payload', label: 'Payload (nested)' },
];

const HEADER_HEURISTICS: Record<EnvelopeField, RegExp[]> = {
  signal_id: [/^signal[_-]?id$/i, /^id$/i],
  source_system: [/^source[_-]?system$/i, /^source$/i, /^system$/i, /^lms$/i],
  learner_reference: [
    /^learner[_-]?ref(erence)?$/i,
    /^learner$/i,
    /^student(_id)?$/i,
    /^user(_id)?$/i,
  ],
  timestamp: [/^timestamp$/i, /^time$/i, /^date$/i, /^created[_-]?at$/i],
  schema_version: [/^schema[_-]?version$/i, /^version$/i],
};

function matchColumn(columns: string[], patterns: RegExp[]): string | undefined {
  for (const col of columns) {
    const normalized = col.trim();
    if (patterns.some((p) => p.test(normalized))) return col;
  }
  return undefined;
}

export function autoMap(columns: string[]): FieldMapping {
  const mapping: FieldMapping = { payloadColumns: [] };
  const used = new Set<string>();

  for (const field of ENVELOPE_FIELDS) {
    const match = matchColumn(
      columns.filter((c) => !used.has(c)),
      HEADER_HEURISTICS[field]
    );
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }

  mapping.payloadColumns = columns.filter((c) => !used.has(c));
  return mapping;
}

export function applyMapping(
  table: ParsedTable,
  mapping: FieldMapping,
  defaults: { source_system?: string; schema_version?: string }
): Record<string, unknown>[] {
  return table.rows.map((row) => {
    const payload: Record<string, unknown> = {};
    for (const col of mapping.payloadColumns) {
      if (col in row) payload[col] = row[col];
    }

    const mapped: Record<string, unknown> = { payload };
    for (const field of ENVELOPE_FIELDS) {
      const col = mapping[field];
      if (col && col in row) {
        mapped[field] = row[col];
      }
    }

    if (!mapped.source_system && defaults.source_system) {
      mapped.source_system = defaults.source_system;
    }
    if (!mapped.schema_version && defaults.schema_version) {
      mapped.schema_version = defaults.schema_version;
    }

    return mapped;
  });
}

const REQUIRED_FIELDS: EnvelopeField[] = [
  'signal_id',
  'source_system',
  'learner_reference',
  'timestamp',
  'schema_version',
];

export type RequiredFieldStatus = {
  field: EnvelopeField;
  label: string;
  satisfied: boolean;
  source: 'column' | 'default' | 'missing';
  detail?: string;
};

export function getRequiredFieldStatuses(
  mapping: FieldMapping,
  defaults: { source_system?: string; schema_version?: string }
): RequiredFieldStatus[] {
  const labels: Record<EnvelopeField, string> = {
    signal_id: 'Signal ID',
    source_system: 'Source system',
    learner_reference: 'Learner reference',
    timestamp: 'Timestamp',
    schema_version: 'Schema version',
  };

  return REQUIRED_FIELDS.map((field) => {
    const column = mapping[field];
    if (column) {
      return {
        field,
        label: labels[field],
        satisfied: true,
        source: 'column' as const,
        detail: column,
      };
    }

    if (field === 'source_system' && defaults.source_system) {
      return {
        field,
        label: labels[field],
        satisfied: true,
        source: 'default' as const,
        detail: defaults.source_system,
      };
    }

    if (field === 'schema_version' && defaults.schema_version) {
      return {
        field,
        label: labels[field],
        satisfied: true,
        source: 'default' as const,
        detail: defaults.schema_version,
      };
    }

    return {
      field,
      label: labels[field],
      satisfied: false,
      source: 'missing' as const,
    };
  });
}

export function isMappingComplete(
  mapping: FieldMapping,
  defaults: { source_system?: string; schema_version?: string },
  columns?: string[]
): boolean {
  if (columns && getUnassignedColumns(columns, mapping).length > 0) return false;
  return getRequiredFieldStatuses(mapping, defaults).every((status) => status.satisfied);
}

export function isColumnAssigned(column: string, mapping: FieldMapping): boolean {
  for (const field of ENVELOPE_FIELDS) {
    if (mapping[field] === column) return true;
  }
  return mapping.payloadColumns.includes(column);
}

export function getUnassignedColumns(columns: string[], mapping: FieldMapping): string[] {
  return columns.filter((column) => !isColumnAssigned(column, mapping));
}
