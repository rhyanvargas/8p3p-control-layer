/**
 * Static mapping suggestions catalog for ingestion preflight.
 * Per-source-system hints when forbidden semantic keys appear in raw payloads.
 *
 * @see docs/specs/ingestion-preflight.md § Mapping Suggestion Catalog
 */

export interface MappingSuggestion {
  raw_key: string; // matches forbidden-semantic key
  suggested_canonical: string | null; // canonical field name; null when no auto-map (e.g. status)
  rationale: string; // one-line operator-facing explanation
  applies_to_source_systems: string[] | '*'; // e.g. ['canvas-lms'], or '*' for universal
}

export const MAPPING_SUGGESTIONS_CATALOG: MappingSuggestion[] = [
  {
    raw_key: 'score',
    suggested_canonical: 'masteryScore',
    applies_to_source_systems: ['canvas-lms'],
    rationale:
      'Canvas submission.score ÷ submission.total → masteryScore ∈ [0,1]',
  },
  {
    raw_key: 'grade',
    suggested_canonical: 'masteryScore',
    applies_to_source_systems: ['canvas-lms'],
    rationale:
      'Letter/numeric grade normalization required; operator picks scheme',
  },
  {
    raw_key: 'completion',
    suggested_canonical: 'stabilityScore',
    applies_to_source_systems: ['i-ready'],
    rationale:
      'I-Ready lesson completion is a proxy for mastery stability',
  },
  {
    raw_key: 'progress_percent',
    suggested_canonical: 'stabilityScore',
    applies_to_source_systems: ['i-ready', 'branching-minds'],
    rationale: 'Percent-complete → [0,1] stability',
  },
  {
    raw_key: 'status',
    suggested_canonical: null,
    applies_to_source_systems: '*',
    rationale: 'No suggestion — operator must decide semantic meaning',
  },
];

export function findMappingSuggestions(
  rawKey: string,
  sourceSystem: string | null
): MappingSuggestion[] {
  return MAPPING_SUGGESTIONS_CATALOG.filter(
    (s) =>
      s.raw_key === rawKey &&
      (s.applies_to_source_systems === '*' ||
        (sourceSystem !== null &&
          s.applies_to_source_systems.includes(sourceSystem)))
  );
}
