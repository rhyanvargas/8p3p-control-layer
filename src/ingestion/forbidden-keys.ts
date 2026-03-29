/**
 * Forbidden Semantic Keys Detector
 * Recursively scans payload for keys that indicate semantic/UI/workflow coupling
 */

import type { ForbiddenKeyResult } from '../shared/types.js';

/**
 * Set of globally forbidden keys in payload at any nesting depth.
 * Two categories:
 * 1. Semantic/UI/workflow/LMS keys — indicate coupling to vendor concepts
 * 2. PII keys — personal data must never enter STATE or receipts (CEO directive 2026-02-24)
 *
 * Reserved suffixes (NOT forbidden): `_delta` and `_direction` are emitted by the
 * state delta detection system (computeStateDeltas in state/engine.ts). These suffixes
 * must never appear in this set — client-supplied fields sharing the suffix are silently
 * overwritten by the engine's authoritative computed value.
 */
export const FORBIDDEN_KEYS = new Set([
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

  // PII keys — pilot operates with pseudonymous IDs only; personal data rejected at ingestion
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
 * // Returns: { key: 'ui', path: 'payload.ui' }
 * 
 * @example
 * // Nested forbidden key
 * detectForbiddenKeys({ x: { y: { workflow: {} } } }, 'payload')
 * // Returns: { key: 'workflow', path: 'payload.x.y.workflow' }
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
    
    // Check if this key is forbidden
    if (FORBIDDEN_KEYS.has(key)) {
      return {
        key,
        path: currentPath,
      };
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
