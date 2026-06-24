import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { UploadParseError, type ParsedTable } from '@/lib/upload/types';

export const MAX_UPLOAD_ROWS = 5000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function capRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length > MAX_UPLOAD_ROWS) {
    throw new UploadParseError(`File exceeds the ${MAX_UPLOAD_ROWS} row limit.`);
  }
  return rows;
}

function normalizeColumns(rows: Record<string, unknown>[]): ParsedTable {
  if (rows.length === 0) {
    throw new UploadParseError('File contains no data rows.');
  }
  const columns = Object.keys(rows[0] ?? {});
  if (columns.length === 0) {
    throw new UploadParseError('File has no columns.');
  }
  return { columns, rows: capRows(rows), sourceFormat: 'json' };
}

async function parseJsonFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UploadParseError('Invalid JSON file.');
  }

  if (Array.isArray(parsed)) {
    if (!parsed.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
      throw new UploadParseError('JSON array must contain objects.');
    }
    return { ...normalizeColumns(parsed as Record<string, unknown>[]), sourceFormat: 'json' };
  }

  if (typeof parsed === 'object' && parsed !== null && 'signals' in parsed) {
    const signals = (parsed as { signals: unknown }).signals;
    if (!Array.isArray(signals)) {
      throw new UploadParseError('JSON "signals" property must be an array.');
    }
    if (!signals.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
      throw new UploadParseError('JSON "signals" array must contain objects.');
    }
    return { ...normalizeColumns(signals as Record<string, unknown>[]), sourceFormat: 'json' };
  }

  throw new UploadParseError('JSON must be an array of objects or { "signals": [...] }.');
}

async function parseCsvFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors.length > 0) {
    throw new UploadParseError(result.errors[0]?.message ?? 'CSV parse failed.');
  }

  return { ...normalizeColumns(result.data), sourceFormat: 'csv' };
}

async function parseXlsxFile(file: File): Promise<ParsedTable> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new UploadParseError('Excel file has no sheets.');
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return { ...normalizeColumns(rows), sourceFormat: 'xlsx' };
}

export async function parseFile(file: File): Promise<ParsedTable> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadParseError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB size limit.`);
  }

  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return parseJsonFile(file);
  if (name.endsWith('.csv')) return parseCsvFile(file);
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsxFile(file);

  throw new UploadParseError('Unsupported file type. Use .json, .csv, or .xlsx.');
}
