/**
 * Contract Tests for AI Educator Explanations (EXPL-001 through EXPL-010)
 * @see docs/specs/ai-educator-explanations.md § Contract Tests
 *
 * Strategy: mock generateText via vi.mock('ai'); no live Bedrock or AI Gateway calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  getState,
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  getDecisions,
} from '../../src/decision/store.js';
import { applySignals } from '../../src/state/engine.js';
import { evaluateState } from '../../src/decision/engine.js';
import { evaluateStateAsync } from '../../src/decision/engine-async.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import type { SignalEnvelope } from '../../src/shared/types.js';
import {
  selectExplanationGenerator,
  TemplateExplanationGenerator,
  buildUserPrompt,
  SYSTEM_PROMPT,
  postProcessExplanation,
  DEFAULT_EXPLANATION_MAX_CHARS,
  parseExplanationEnv,
  type ExplanationGenerator,
  type ExplanationInput,
} from '@8p3p/explanation';
import { AiSdkExplanationGenerator } from '../../services/explanation/dist/ai-sdk-generator.js';
import { APICallError } from 'ai';

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: generateTextMock,
  };
});

describe('AI Educator Explanations Contract Tests', () => {
  beforeAll(() => {
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy();
  });

  afterAll(() => {
    closeSignalLogStore();
    closeStateStore();
    closeDecisionStore();
  });

  beforeEach(() => {
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
    generateTextMock.mockReset();
  });

  function createReinforceTextEvidenceState(
    opts: { org_id?: string; learner_reference?: string } = {}
  ): {
    state_id: string;
    state_version: number;
    org_id: string;
    learner_reference: string;
  } {
    const org_id = opts.org_id ?? 'org-A';
    const learner_reference = opts.learner_reference ?? 'learner-1';
    const signal_id = `sig-expl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const accepted_at = new Date().toISOString();

    const envelope: SignalEnvelope = {
      org_id,
      signal_id,
      source_system: 'test',
      learner_reference,
      timestamp: accepted_at,
      schema_version: 'v1',
      payload: {
        skills: {
          text_evidence: {
            stabilityScore: 0.5,
            stabilityScore_direction: 'declining',
            masteryScore: 0.4,
          },
        },
      },
    };

    appendSignal(envelope, accepted_at);

    const outcome = applySignals({
      org_id,
      learner_reference,
      signal_ids: [signal_id],
      requested_at: accepted_at,
    });

    if (!outcome.ok) {
      throw new Error(`applySignals failed: ${JSON.stringify(outcome.errors)}`);
    }

    return {
      state_id: outcome.result.state_id,
      state_version: outcome.result.new_state_version,
      org_id,
      learner_reference,
    };
  }

  function buildEvaluateRequest(
    state: ReturnType<typeof createReinforceTextEvidenceState>
  ) {
    return {
      org_id: state.org_id,
      learner_reference: state.learner_reference,
      state_id: state.state_id,
      state_version: state.state_version,
      requested_at: new Date().toISOString(),
      signal_context: { skill: 'text_evidence' as const },
    };
  }

  function countDecisions(org_id: string, learner_reference: string): number {
    return getDecisions({
      org_id,
      learner_reference,
      from_time: '2000-01-01T00:00:00.000Z',
      to_time: '2100-01-01T00:00:00.000Z',
    }).decisions.length;
  }

  function sampleExplanationInput(): ExplanationInput {
    return {
      decision_type: 'reinforce',
      skill: 'text_evidence',
      rationale: 'Stability in text evidence is declining.',
      evaluated_fields: [
        {
          field: 'skills.text_evidence.stabilityScore',
          operator: 'lt',
          threshold: 0.7,
          actual_value: 0.5,
        },
      ],
      state_snapshot: {
        skills: {
          text_evidence: {
            stabilityScore: 0.5,
            stabilityScore_direction: 'declining',
          },
        },
      },
    };
  }

  function createAiSdkGenerator(timeoutMs = 4000): AiSdkExplanationGenerator {
    return new AiSdkExplanationGenerator(
      parseExplanationEnv({
        AI_EXPLANATIONS_ENABLED: 'true',
        AI_PROVIDER: 'amazon-bedrock',
        AI_TIMEOUT_MS: String(timeoutMs),
      })
    );
  }

  function findWarnLog(spy: ReturnType<typeof vi.spyOn>, code: string): unknown {
    return spy.mock.calls.find((call) => String(call[0]).includes(code));
  }

  // ---------------------------------------------------------------------------
  // EXPL-001: Disabled mode
  // ---------------------------------------------------------------------------

  describe('EXPL-001: Disabled mode is byte-identical to today', () => {
    it('returns null educator_explanation and uses TemplateExplanationGenerator', async () => {
      const state = createReinforceTextEvidenceState();
      const disabledGen = selectExplanationGenerator({ AI_EXPLANATIONS_ENABLED: 'false' });

      expect(disabledGen).toBeInstanceOf(TemplateExplanationGenerator);
      expect(await disabledGen.generate(sampleExplanationInput())).toBeNull();

      generateTextMock.mockClear();
      await disabledGen.generate(sampleExplanationInput());
      expect(generateTextMock).not.toHaveBeenCalled();

      const outcome = await evaluateState(buildEvaluateRequest(state), disabledGen);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok || !outcome.matched) return;

      expect(outcome.result.trace.educator_explanation).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-002: Happy path integration
  // ---------------------------------------------------------------------------

  describe('EXPL-002: Happy path produces grounded explanation', () => {
    it('persists non-empty explanation referencing skill and confidence', async () => {
      const state = createReinforceTextEvidenceState();
      const explanation =
        'Confidence in text evidence is declining as stability falls. Continued practice citing evidence should help rebuild stability.';

      const generator: ExplanationGenerator = {
        generate: vi.fn().mockResolvedValue(explanation),
      };

      const outcome = await evaluateState(buildEvaluateRequest(state), generator);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok || !outcome.matched) return;

      const stored = outcome.result.trace.educator_explanation;
      expect(typeof stored).toBe('string');
      expect(stored!.length).toBeGreaterThan(0);
      expect(stored!.toLowerCase()).toMatch(/text_evidence|text evidence/);
      expect(stored!.toLowerCase()).toMatch(/confidence|stability|declining/);
      expect(stored).not.toContain(state.learner_reference);
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-003: Prompt contains no PII
  // ---------------------------------------------------------------------------

  describe('EXPL-003: Prompt contains no PII', () => {
    it('buildUserPrompt excludes learner_reference and forbidden snapshot keys', () => {
      const input: ExplanationInput = {
        ...sampleExplanationInput(),
        state_snapshot: {
          learner_reference: 'learner-secret-999',
          student_email: 'student@school.edu',
          skills: {
            text_evidence: { stabilityScore: 0.5, stabilityScore_direction: 'declining' },
          },
        },
      };

      const prompt = buildUserPrompt(input);

      expect(prompt).not.toContain('learner-secret-999');
      expect(prompt).not.toContain('learner_reference');
      expect(prompt).toContain('text_evidence');
      expect(prompt).toContain('Stability in text evidence is declining.');
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-004: APICallError → null fallback, single write
  // ---------------------------------------------------------------------------

  describe('EXPL-004: LLM error → null fallback, single write', () => {
    it('returns null, persists exactly once, logs explanation_generation_degraded', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      generateTextMock.mockRejectedValueOnce(
        new APICallError({
          message: 'model unavailable',
          url: 'https://bedrock.example/invoke',
          requestBodyValues: {},
        })
      );

      const state = createReinforceTextEvidenceState();
      const beforeCount = countDecisions(state.org_id, state.learner_reference);
      const generator = createAiSdkGenerator();

      const outcome = await evaluateState(buildEvaluateRequest(state), generator);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok || !outcome.matched) return;
      expect(outcome.result.trace.educator_explanation).toBeNull();
      expect(countDecisions(state.org_id, state.learner_reference)).toBe(beforeCount + 1);
      expect(findWarnLog(warnSpy, ErrorCodes.EXPLANATION_GENERATION_DEGRADED)).toBeDefined();

      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-005: Timeout → null fallback
  // ---------------------------------------------------------------------------

  describe('EXPL-005: Timeout → null fallback', () => {
    it('returns null and logs explanation_generation_degraded on abort/timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      generateTextMock.mockRejectedValueOnce(
        Object.assign(new Error('request timed out'), { name: 'AbortError' })
      );

      const generator = createAiSdkGenerator();
      const result = await generator.generate(sampleExplanationInput());

      expect(result).toBeNull();
      expect(findWarnLog(warnSpy, ErrorCodes.EXPLANATION_GENERATION_DEGRADED)).toBeDefined();

      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-006: Rate limit (429) → null fallback
  // ---------------------------------------------------------------------------

  describe('EXPL-006: Rate limit (429) → null fallback', () => {
    it('returns null and logs explanation_generation_degraded', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      generateTextMock.mockRejectedValueOnce(
        new APICallError({
          message: 'rate limited',
          url: 'https://bedrock.example/invoke',
          requestBodyValues: {},
          statusCode: 429,
        })
      );

      const generator = createAiSdkGenerator();
      const result = await generator.generate(sampleExplanationInput());

      expect(result).toBeNull();
      expect(findWarnLog(warnSpy, ErrorCodes.EXPLANATION_GENERATION_DEGRADED)).toBeDefined();

      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-007: Over-length output truncated at word boundary
  // ---------------------------------------------------------------------------

  describe('EXPL-007: Over-length output truncated at word boundary', () => {
    it('truncates model output without mid-word cut', async () => {
      const longText = `${'practice '.repeat(120)}end`;
      generateTextMock.mockResolvedValueOnce({ text: longText });

      const generator = createAiSdkGenerator();
      const result = await generator.generate(sampleExplanationInput());

      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(DEFAULT_EXPLANATION_MAX_CHARS);
      expect(result!.endsWith('practice')).toBe(true);
      expect(result).not.toContain('end');
    });

    it('postProcessExplanation truncates at word boundary directly', () => {
      const processed = postProcessExplanation('alpha beta gamma delta', sampleExplanationInput(), 11);
      expect(processed.ok).toBe(true);
      if (!processed.ok) return;
      expect(processed.value).toBe('alpha beta');
      expect(processed.value.length).toBeLessThanOrEqual(11);
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-008: Guardrail trips on PII echo
  // ---------------------------------------------------------------------------

  describe('EXPL-008: Guardrail trips on detected PII in output', () => {
    it('discards output and logs explanation_guardrail_tripped', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const piiEmail = 'student@school.edu';
      generateTextMock.mockResolvedValueOnce({
        text: `The learner at ${piiEmail} needs more support with text evidence.`,
      });

      const generator = createAiSdkGenerator();
      const input: ExplanationInput = {
        ...sampleExplanationInput(),
        state_snapshot: {
          contact_email: piiEmail,
          skills: { text_evidence: { stabilityScore: 0.5 } },
        },
      };

      const result = await generator.generate(input);

      expect(result).toBeNull();
      expect(findWarnLog(warnSpy, ErrorCodes.EXPLANATION_GUARDRAIL_TRIPPED)).toBeDefined();

      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-009: Confidence framing, not grade
  // ---------------------------------------------------------------------------

  describe('EXPL-009: Confidence framing, not grade', () => {
    it('SYSTEM_PROMPT instructs confidence-not-grade framing', () => {
      expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/confidence/);
      expect(SYSTEM_PROMPT).toMatch(/not as a grade|letter grades|scores presented as grades/i);
      expect(SYSTEM_PROMPT).toMatch(/mastery/i);
    });
  });

  // ---------------------------------------------------------------------------
  // EXPL-010: Async path parity
  // ---------------------------------------------------------------------------

  describe('EXPL-010: Async (Lambda) path parity with sync', () => {
    it('evaluateStateAsync sets the same educator_explanation as sync', async () => {
      const state = createReinforceTextEvidenceState();
      const explanation =
        'Confidence in text evidence is declining; stability is falling and more practice is recommended.';

      const generator: ExplanationGenerator = {
        generate: vi.fn().mockResolvedValue(explanation),
      };

      const request = buildEvaluateRequest(state);

      const syncOutcome = await evaluateState(request, generator);
      expect(syncOutcome.ok).toBe(true);
      if (!syncOutcome.ok || !syncOutcome.matched) return;

      clearDecisionStore();
      const saveSpy = vi.fn().mockResolvedValue(undefined);

      const asyncOutcome = await evaluateStateAsync(
        request,
        {
          getState: (orgId, learnerRef) => Promise.resolve(getState(orgId, learnerRef)),
          saveDecision: saveSpy,
        },
        generator
      );

      expect(asyncOutcome.ok).toBe(true);
      if (!asyncOutcome.ok || !asyncOutcome.matched) return;

      expect(asyncOutcome.result.trace.educator_explanation).toBe(explanation);
      expect(asyncOutcome.result.trace.educator_explanation).toBe(
        syncOutcome.result.trace.educator_explanation
      );
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });
});
