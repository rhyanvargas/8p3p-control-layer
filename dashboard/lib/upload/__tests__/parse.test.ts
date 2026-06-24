import { describe, expect, it } from 'vitest';

import { parseFile } from '@/lib/upload/parse';
import { UploadParseError } from '@/lib/upload/types';

function makeFile(content: string | ArrayBuffer, name: string, type: string): File {
  return new File([content], name, { type });
}

describe('UPL-PARSE-001: JSON array-of-objects', () => {
  it('parses a JSON array into columns and rows', async () => {
    const json = JSON.stringify([
      { signal_id: 's1', learner: 'l1', score: 0.5 },
      { signal_id: 's2', learner: 'l2', score: 0.6 },
    ]);
    const table = await parseFile(makeFile(json, 'signals.json', 'application/json'));
    expect(table.sourceFormat).toBe('json');
    expect(table.columns).toContain('signal_id');
    expect(table.rows).toHaveLength(2);
  });

  it('parses a JSON { signals: [...] } wrapper', async () => {
    const json = JSON.stringify({
      signals: [{ signal_id: 's1', learner: 'l1' }],
    });
    const table = await parseFile(makeFile(json, 'signals.json', 'application/json'));
    expect(table.sourceFormat).toBe('json');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.signal_id).toBe('s1');
  });
});

describe('UPL-PARSE-002: CSV with headers', () => {
  it('parses CSV with header row', async () => {
    const csv = 'signal_id,learner_reference,timestamp\ns1,learner-1,2026-01-01T00:00:00Z\n';
    const table = await parseFile(makeFile(csv, 'signals.csv', 'text/csv'));
    expect(table.sourceFormat).toBe('csv');
    expect(table.columns).toEqual(['signal_id', 'learner_reference', 'timestamp']);
    expect(table.rows[0]?.signal_id).toBe('s1');
  });
});

describe('UPL-PARSE-003: XLSX first sheet', () => {
  it('parses xlsx first sheet', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['signal_id', 'learner_reference'],
      ['s1', 'learner-1'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const table = await parseFile(makeFile(buffer, 'signals.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    expect(table.sourceFormat).toBe('xlsx');
    expect(table.rows[0]?.signal_id).toBe('s1');
  });
});

describe('parse guards', () => {
  it('rejects empty files', async () => {
    await expect(parseFile(makeFile('[]', 'empty.json', 'application/json'))).rejects.toThrow(
      UploadParseError
    );
  });
});
