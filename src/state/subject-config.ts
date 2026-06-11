/**
 * Subject config loader and skill-to-subject resolver.
 * Spec: docs/specs/urs-aggregation.md § Subject Resolution
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SubjectConfig } from '../shared/types.js';
import { DEFAULT_SUBJECT } from './aggregation-constants.js';

/** Per-org subject config cache keyed on orgId */
const subjectConfigCache = new Map<string, SubjectConfig | null>();

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Loads and caches the subject config for an org from
 * `src/decision/policies/{orgId}/subjects.json`.
 *
 * Returns null if the file is missing or cannot be parsed.
 * Silently degrades on parse errors so a malformed config never breaks aggregation.
 */
export function loadSubjectConfigForOrg(orgId: string): SubjectConfig | null {
  if (subjectConfigCache.has(orgId)) {
    return subjectConfigCache.get(orgId) ?? null;
  }

  const configPath = path.join(process.cwd(), 'src/decision/policies', orgId, 'subjects.json');
  if (!fs.existsSync(configPath)) {
    subjectConfigCache.set(orgId, null);
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const raw = JSON.parse(content) as SubjectConfig;
    subjectConfigCache.set(orgId, raw);
    return raw;
  } catch {
    subjectConfigCache.set(orgId, null);
    return null;
  }
}

/**
 * Resolves a skill id to a subject string using the priority order from the spec
 * (first match wins):
 *   1. skillEntry.subject (non-blank string)
 *   2. config.explicit_map[skillId]
 *   3. config.prefix_rules — first rule where skillId.startsWith(rule.prefix)
 *   4. config.default_subject
 *   5. DEFAULT_SUBJECT ("General")
 */
export function resolveSubjectForSkill(
  skillId: string,
  skillEntry: Record<string, unknown> | undefined | null,
  config: SubjectConfig | null
): string {
  if (skillEntry && isNonBlankString(skillEntry['subject'])) {
    return skillEntry['subject'].trim();
  }

  const explicitSubject = config?.explicit_map?.[skillId];
  if (explicitSubject !== undefined) {
    return explicitSubject;
  }

  if (config?.prefix_rules) {
    for (const rule of config.prefix_rules) {
      if (skillId.startsWith(rule.prefix)) {
        return rule.subject;
      }
    }
  }

  if (config && isNonBlankString(config.default_subject)) {
    return config.default_subject;
  }

  return DEFAULT_SUBJECT;
}

/**
 * Clears the subject config cache. Intended for tests only.
 */
export function clearSubjectConfigCache(): void {
  subjectConfigCache.clear();
}
