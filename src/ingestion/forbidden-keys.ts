/**
 * Forbidden Keys Detector
 * Recursively scans payload for keys that indicate semantic/UI/workflow coupling or PII.
 *
 * @see docs/specs/ingestion-preflight.md § Requirements — Forbidden-key categorization
 *
 * Reserved suffixes (NOT forbidden): `_delta` and `_direction` are emitted by the
 * state delta detection system (computeStateDeltas in state/engine.ts). These suffixes
 * must never appear in these sets — client-supplied fields sharing the suffix are silently
 * overwritten by the engine's authoritative computed value.
 */

import type { ForbiddenKeyResult } from '../shared/types.js';

/** PII keys — personal data must never enter STATE or receipts (CEO directive 2026-02-24). */
export const FORBIDDEN_PII_KEYS = new Set([
  'firstName',
  'lastName',
  'first_name',
  'last_name',
  'fullName',
  'full_name',
  'email',
  'emailAddress',
  'email_address',
  'phone',
  'phoneNumber',
  'phone_number',
  'ssn',
  'social_security',
  'socialSecurity',
  'birthdate',
  'birthday',
  'birth_date',
  'date_of_birth',
  'dateOfBirth',
  'dob',
  'address',
  'streetAddress',
  'street_address',
  'zipCode',
  'zip_code',
  'postalCode',
  'postal_code',
]);

/** Semantic/UI/workflow/LMS keys — indicate coupling to vendor concepts. */
export const FORBIDDEN_SEMANTIC_KEYS = new Set([
  // UI/Frontend keys
  'ui',
  'screen',
  'view',
  'page',
  'route',
  'url',
  'link',
  'button',
  'cta',

  // Workflow keys
  'workflow',
  'task',
  'job',
  'assignment',
  'assignee',
  'owner',

  // Status/Progress keys
  'status',
  'step',
  'stage',
  'completion',
  'progress_percent',

  // LMS-specific keys
  'course',
  'lesson',
  'module',
  'quiz',
  'score',
  'grade',

  // Content keys
  'content_id',
  'content_url',
]);

/** Union of PII and semantic forbidden keys (backward-compatible export). */
export const FORBIDDEN_KEYS = new Set([
  ...FORBIDDEN_PII_KEYS,
  ...FORBIDDEN_SEMANTIC_KEYS,
]);

/**
 * Recursively detect forbidden keys in an object
 *
 * @param obj - The object to scan (usually the payload)
 * @param basePath - The current path for error reporting (e.g., "payload")
 * @returns ForbiddenKeyResult if a forbidden key is found, null otherwise
 *
 * @example
 * // Top-level forbidden key
 * detectForbiddenKeys({ ui: { screen: 'home' } }, 'payload')
 * // Returns: { key: 'ui', path: 'payload.ui', category: 'semantic' }
 *
 * @example
 * // Nested forbidden key
 * detectForbiddenKeys({ x: { y: { workflow: {} } } }, 'payload')
 * // Returns: { key: 'workflow', path: 'payload.x.y.workflow', category: 'semantic' }
 *
 * @example
 * // Clean payload
 * detectForbiddenKeys({ learner_id: '123', data: {} }, 'payload')
 * // Returns: null
 */
export function detectForbiddenKeys(
  obj: unknown,
  basePath: string
): ForbiddenKeyResult | null {
  // Only scan objects (not arrays, primitives, null)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }

  // Scan each key in the object
  for (const key of Object.keys(obj)) {
    const currentPath = `${basePath}.${key}`;

    if (FORBIDDEN_PII_KEYS.has(key)) {
      return { key, path: currentPath, category: 'pii' };
    }
    if (FORBIDDEN_SEMANTIC_KEYS.has(key)) {
      return { key, path: currentPath, category: 'semantic' };
    }

    // Recursively check nested objects
    const nestedResult = detectForbiddenKeys(
      (obj as Record<string, unknown>)[key],
      currentPath
    );

    if (nestedResult) {
      return nestedResult;
    }
  }

  return null;
}
