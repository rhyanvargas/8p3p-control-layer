/**
 * Trajectory Handler Core — framework-agnostic
 * Covers GET /v1/state/trajectory
 */

import type { LearnerState, HandlerResult } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { getState, getStateVersionRange } from './store.js';
import { encodeTrajectoryPageToken, decodeTrajectoryPageToken } from './trajectory-pagination.js';

interface StateErrorResponse {
  code: string;
  message: string;
  field_path?: string;
}

type Direction = 'improving' | 'declining' | 'stable';

interface TrajectoryVersion {
  state_version: number;
  updated_at: string;
  values: Record<string, unknown>;
  directions: Record<string, Direction | null>;
}

interface FieldSummary {
  first_value: number;
  latest_value: number;
  overall_direction: Direction | null;
  version_count: number;
}

interface TrajectoryResponse {
  org_id: string;
  learner_reference: string;
  fields: string[];
  versions: TrajectoryVersion[];
  summary: Record<string, FieldSummary>;
  next_page_token: string | null;
}

const VALID_DIRECTIONS = new Set<string>(['improving', 'declining', 'stable']);

function parsePositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (typeof num !== 'number' || isNaN(num) || num < 1) return null;
  return num;
}

function validateTrajectoryParams(params: Record<string, unknown>): HandlerResult<StateErrorResponse> | {
  org_id: string;
  learner_reference: string;
  fields: string[];
  from_version: number;
  to_version: number | undefined;
  page_size: number;
  cursor: number | undefined;
} {
  // org_id
  if (!params.org_id || typeof params.org_id !== 'string' || params.org_id.trim() === '') {
    return { statusCode: 400, body: { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required and must be non-empty', field_path: 'org_id' } };
  }
  if (params.org_id.length > 128) {
    return { statusCode: 400, body: { code: ErrorCodes.INVALID_LENGTH, message: 'org_id must be 1-128 characters', field_path: 'org_id' } };
  }
  const orgId = params.org_id as string;

  // learner_reference
  if (!params.learner_reference || typeof params.learner_reference !== 'string' || params.learner_reference.trim() === '') {
    return { statusCode: 400, body: { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: "'learner_reference' is required", field_path: 'learner_reference' } };
  }
  if (params.learner_reference.length > 256) {
    return { statusCode: 400, body: { code: ErrorCodes.INVALID_LENGTH, message: 'learner_reference must be 1-256 characters', field_path: 'learner_reference' } };
  }
  const learnerRef = params.learner_reference as string;

  // fields
  if (!params.fields || typeof params.fields !== 'string' || params.fields.trim() === '') {
    return { statusCode: 400, body: { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: "'fields' is required", field_path: 'fields' } };
  }
  const rawFields = (params.fields as string).split(',').map(f => f.trim());
  const fields = [...new Set(rawFields)];

  for (const field of fields) {
    if (field === '') {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message: 'Field name must not be empty', field_path: 'fields' } };
    }
    if (field.length > 128) {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message: `Field name exceeds 128 characters: '${field}'`, field_path: 'fields' } };
    }
    if (field.includes('.')) {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message: 'Dot-path fields are not supported in v1.1. Use top-level canonical field names.', field_path: 'fields' } };
    }
  }

  if (fields.length > 10) {
    return { statusCode: 400, body: { code: ErrorCodes.INVALID_FORMAT, message: `Maximum 10 fields per trajectory request. Got ${fields.length}.`, field_path: 'fields' } };
  }

  // from_version
  let fromVersion = 1;
  if (params.from_version !== undefined && params.from_version !== '') {
    const parsed = parsePositiveInt(params.from_version);
    if (parsed === null) {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_TYPE, message: 'from_version must be a positive integer', field_path: 'from_version' } };
    }
    fromVersion = parsed;
  }

  // to_version (undefined means "resolve at query time")
  let toVersion: number | undefined;
  if (params.to_version !== undefined && params.to_version !== '') {
    const parsed = parsePositiveInt(params.to_version);
    if (parsed === null) {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_TYPE, message: 'to_version must be a positive integer', field_path: 'to_version' } };
    }
    toVersion = parsed;
  }

  // page_size
  let pageSize = 50;
  if (params.page_size !== undefined && params.page_size !== '') {
    const parsed = typeof params.page_size === 'string' ? parseInt(params.page_size, 10) : params.page_size;
    if (typeof parsed !== 'number' || isNaN(parsed) || parsed < 1 || parsed > 100) {
      return { statusCode: 400, body: { code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE, message: 'page_size must be between 1 and 100', field_path: 'page_size' } };
    }
    pageSize = parsed;
  }

  // page_token
  let cursor: number | undefined;
  if (params.page_token !== undefined && params.page_token !== '') {
    const decoded = decodeTrajectoryPageToken(params.page_token as string);
    if (decoded === null) {
      return { statusCode: 400, body: { code: ErrorCodes.INVALID_PAGE_TOKEN, message: 'page_token is malformed or invalid', field_path: 'page_token' } };
    }
    cursor = decoded;
  }

  return { org_id: orgId, learner_reference: learnerRef, fields, from_version: fromVersion, to_version: toVersion, page_size: pageSize, cursor };
}

function buildVersions(states: LearnerState[], fields: string[]): TrajectoryVersion[] {
  return states.map(s => {
    const values: Record<string, unknown> = {};
    const directions: Record<string, Direction | null> = {};

    for (const field of fields) {
      values[field] = (field in s.state) ? s.state[field] : null;
      const dirKey = `${field}_direction`;
      const dirVal = s.state[dirKey];
      directions[field] = (typeof dirVal === 'string' && VALID_DIRECTIONS.has(dirVal))
        ? dirVal as Direction
        : null;
    }

    return {
      state_version: s.state_version,
      updated_at: s.updated_at,
      values,
      directions,
    };
  });
}

function buildSummary(versions: TrajectoryVersion[], fields: string[]): Record<string, FieldSummary> {
  const summary: Record<string, FieldSummary> = {};

  for (const field of fields) {
    let firstValue: number | undefined;
    let latestValue: number | undefined;
    let versionCount = 0;

    for (const v of versions) {
      const val = v.values[field];
      if (val !== null && typeof val === 'number') {
        versionCount++;
        if (firstValue === undefined) firstValue = val;
        latestValue = val;
      }
    }

    if (versionCount === 0) {
      summary[field] = { first_value: null as unknown as number, latest_value: null as unknown as number, overall_direction: null, version_count: 0 };
      continue;
    }

    let overallDirection: Direction | null = null;
    if (versionCount >= 2) {
      if (latestValue! > firstValue!) overallDirection = 'improving';
      else if (latestValue! < firstValue!) overallDirection = 'declining';
      else overallDirection = 'stable';
    }

    summary[field] = {
      first_value: firstValue!,
      latest_value: latestValue!,
      overall_direction: overallDirection,
      version_count: versionCount,
    };
  }

  return summary;
}

export async function handleTrajectoryQueryCore(
  params: Record<string, unknown>
): Promise<HandlerResult<TrajectoryResponse | StateErrorResponse>> {
  const validation = validateTrajectoryParams(params);

  if ('statusCode' in validation) {
    return validation;
  }

  const { org_id: orgId, learner_reference: learnerRef, fields, from_version: fromVersion, page_size: pageSize, cursor } = validation;

  // Resolve to_version if omitted
  let toVersion = validation.to_version;
  if (toVersion === undefined) {
    const currentState = getState(orgId, learnerRef);
    if (!currentState) {
      return {
        statusCode: 404,
        body: { code: ErrorCodes.STATE_NOT_FOUND, message: `No state found for learner '${learnerRef}' in org '${orgId}'` },
      };
    }
    toVersion = currentState.state_version;
  }

  // Validate from_version <= to_version
  if (fromVersion > toVersion) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_FORMAT, message: 'from_version must not exceed to_version', field_path: 'from_version' },
    };
  }

  const { states, nextCursor } = getStateVersionRange(orgId, learnerRef, fromVersion, toVersion, pageSize, cursor);

  // 404 on first page with empty results and no state at all
  if (states.length === 0 && cursor === undefined) {
    const currentState = getState(orgId, learnerRef);
    if (!currentState) {
      return {
        statusCode: 404,
        body: { code: ErrorCodes.STATE_NOT_FOUND, message: `No state found for learner '${learnerRef}' in org '${orgId}'` },
      };
    }
  }

  const versions = buildVersions(states, fields);
  const summary = buildSummary(versions, fields);

  return {
    statusCode: 200,
    body: {
      org_id: orgId,
      learner_reference: learnerRef,
      fields,
      versions,
      summary,
      next_page_token: nextCursor !== null ? encodeTrajectoryPageToken(nextCursor) : null,
    },
  };
}
