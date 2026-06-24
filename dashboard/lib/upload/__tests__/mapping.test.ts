import { describe, expect, it } from 'vitest';

import {
  applyMapping,
  autoMap,
  getRequiredFieldStatuses,
  getUnassignedColumns,
  isMappingComplete,
} from '@/lib/upload/mapping';
import type { ParsedTable } from '@/lib/upload/types';

describe('UPL-MAP-001: autoMap header heuristics', () => {
  it('maps common column names to envelope fields', () => {
    const mapping = autoMap([
      'signal_id',
      'source_system',
      'student_id',
      'created_at',
      'schema_version',
      'masteryScore',
    ]);

    expect(mapping.signal_id).toBe('signal_id');
    expect(mapping.source_system).toBe('source_system');
    expect(mapping.learner_reference).toBe('student_id');
    expect(mapping.timestamp).toBe('created_at');
    expect(mapping.schema_version).toBe('schema_version');
    expect(mapping.payloadColumns).toContain('masteryScore');
    expect(
      isMappingComplete(mapping, { source_system: '', schema_version: 'v1' })
    ).toBe(true);
  });

  it('maps learner and source/time aliases', () => {
    const mapping = autoMap(['id', 'system', 'learner', 'date', 'score']);

    expect(mapping.signal_id).toBe('id');
    expect(mapping.source_system).toBe('system');
    expect(mapping.learner_reference).toBe('learner');
    expect(mapping.timestamp).toBe('date');
    expect(mapping.payloadColumns).toEqual(['score']);
  });

  it('reports missing required fields until defaults or columns are set', () => {
    const mapping = autoMap(['signal_id', 'learner', 'created_at', 'score']);
    const emptyDefaults = { source_system: '', schema_version: '' };

    expect(isMappingComplete(mapping, emptyDefaults)).toBe(false);

    const statuses = getRequiredFieldStatuses(mapping, emptyDefaults);
    expect(statuses.find((s) => s.field === 'source_system')?.satisfied).toBe(false);
    expect(statuses.find((s) => s.field === 'schema_version')?.satisfied).toBe(false);

    expect(
      isMappingComplete(mapping, { source_system: 'lms-demo', schema_version: 'v1' })
    ).toBe(true);
  });

  it('blocks completion when a column is not assigned to envelope or payload', () => {
    const mapping = autoMap(['signal_id', 'learner', 'score']);
    mapping.payloadColumns = [];

    expect(getUnassignedColumns(['signal_id', 'learner', 'score'], mapping)).toEqual(['score']);
    expect(
      isMappingComplete(mapping, { source_system: 'lms', schema_version: 'v1' }, [
        'signal_id',
        'learner',
        'score',
      ])
    ).toBe(false);
  });
});

describe('applyMapping', () => {
  const table: ParsedTable = {
    columns: ['signal_id', 'learner', 'score'],
    rows: [{ signal_id: 's1', learner: 'l1', score: 0.9 }],
    sourceFormat: 'csv',
  };

  it('builds envelope rows with defaults and nested payload columns', () => {
    const mapping = autoMap(table.columns);
    const rows = applyMapping(table, mapping, {
      source_system: 'lms-demo',
      schema_version: 'v1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      signal_id: 's1',
      source_system: 'lms-demo',
      learner_reference: 'l1',
      schema_version: 'v1',
      payload: { score: 0.9 },
    });
  });
});
