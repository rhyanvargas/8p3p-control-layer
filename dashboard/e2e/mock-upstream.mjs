/**
 * Minimal mock control-layer API for Playwright e2e (NXMIG-001…016).
 * Listens on MOCK_UPSTREAM_PORT (default 9999).
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.MOCK_UPSTREAM_PORT ?? 9999);
const ORG_ID = 'e2e-org';
const LEARNER_REF = 'learner-1';
const LEARNER_REF_2 = 'learner-2';

const now = new Date();
const today = now.toISOString();
const todayDate = today.slice(0, 10);

/** @type {Set<string>} */
const acceptedSignalIds = new Set(['signal-001', 'signal-rejected-001', 'signal-dup-001']);

const decisionFixture = {
  org_id: ORG_ID,
  decision_id: 'decision-001',
  learner_reference: LEARNER_REF,
  decision_type: 'intervene',
  decided_at: today,
  decision_context: {},
  trace: {
    state_id: 'state-learner-1-v2',
    state_version: 2,
    policy_id: 'pilot-policy',
    policy_version: '1.0.0',
    matched_rule_id: 'rule-risk-threshold',
    state_snapshot: { masteryScore: 0.42, stabilityScore: 0.35, riskSignal: 0.72 },
    matched_rule: {
      rule_id: 'rule-risk-threshold',
      condition: { field: 'riskSignal', op: 'gte', value: 0.65 },
      evaluated_fields: [
        {
          field: 'riskSignal',
          operator: 'gte',
          threshold: 0.65,
          actual_value: 0.72,
        },
      ],
    },
    rationale:
      'riskSignal (0.72) exceeds intervention threshold (0.65); learner needs support.',
    educator_summary: 'Learner shows elevated risk — consider a check-in.',
  },
  output_metadata: { priority: 2 },
};

const stateV2 = {
  org_id: ORG_ID,
  learner_reference: LEARNER_REF,
  state_id: 'state-learner-1-v2',
  state_version: 2,
  updated_at: today,
  state: {
    masteryScore: 0.42,
    stabilityScore: 0.35,
    riskSignal: 0.72,
    timeSinceReinforcement: 86400,
  },
  provenance: {
    last_signal_id: 'signal-001',
    last_signal_timestamp: today,
  },
};

const stateV1 = {
  ...stateV2,
  state_id: 'state-learner-1-v1',
  state_version: 1,
  updated_at: new Date(now.getTime() - 86_400_000).toISOString(),
  state: {
    masteryScore: 0.38,
    stabilityScore: 0.4,
    riskSignal: 0.55,
    timeSinceReinforcement: 172800,
  },
};

const decisionFixture2 = {
  org_id: ORG_ID,
  decision_id: 'decision-002',
  learner_reference: LEARNER_REF_2,
  decision_type: 'pause',
  decided_at: today,
  decision_context: {},
  trace: {
    state_id: 'state-learner-2-v1',
    state_version: 1,
    policy_id: 'pilot-policy',
    policy_version: '1.0.0',
    matched_rule_id: 'rule-pause-threshold',
    state_snapshot: { masteryScore: 0.55, stabilityScore: 0.22, riskSignal: 0.48 },
    matched_rule: {
      rule_id: 'rule-pause-threshold',
      condition: { field: 'stabilityScore', op: 'lt', value: 0.25 },
      evaluated_fields: [
        {
          field: 'stabilityScore',
          operator: 'lt',
          threshold: 0.25,
          actual_value: 0.22,
        },
      ],
    },
    rationale: 'stabilityScore (0.22) below pause threshold (0.25).',
    educator_summary: 'Consider pausing new material until stability improves.',
  },
  output_metadata: { priority: 3 },
};

function buildLearnerSummary(learnerRef, recentDecisions) {
  const stateId =
    learnerRef === LEARNER_REF_2 ? 'state-learner-2-v1' : stateV2.state_id;
  const fields =
    learnerRef === LEARNER_REF_2
      ? {
          masteryScore: 0.55,
          masteryScore_direction: 'stable',
          stabilityScore: 0.22,
          stabilityScore_direction: 'declining',
          riskSignal: 0.48,
          riskSignal_direction: 'stable',
        }
      : {
          masteryScore: 0.42,
          masteryScore_direction: 'improving',
          stabilityScore: 0.35,
          stabilityScore_direction: 'declining',
          riskSignal: 0.72,
          riskSignal_direction: 'declining',
        };

  return {
    org_id: ORG_ID,
    learner_reference: learnerRef,
    generated_at: today,
    current_state: {
      state_id: stateId,
      state_version: learnerRef === LEARNER_REF_2 ? 1 : 2,
      updated_at: today,
      fields,
      mastery_breakdown: null,
    },
    recent_decisions: recentDecisions,
    field_trajectories: {
      masteryScore: {
        first_value: 0.3,
        latest_value: fields.masteryScore,
        overall_direction: 'improving',
        version_count: 2,
      },
    },
    active_policy: {
      policy_id: 'pilot-policy',
      policy_key: 'learner',
      policy_version: '1.0.0',
      rule_count: 5,
    },
    signals_summary: {
      total_count: 3,
      first_signal_at: new Date(now.getTime() - 172_800_000).toISOString(),
      last_signal_at: today,
    },
  };
}

const learnerSummary = buildLearnerSummary(LEARNER_REF, [
  {
    decision_id: decisionFixture.decision_id,
    decision_type: decisionFixture.decision_type,
    decided_at: today,
    matched_rule_id: decisionFixture.trace.matched_rule_id,
    educator_summary: decisionFixture.trace.educator_summary,
    rationale: decisionFixture.trace.rationale,
    policy_version: decisionFixture.trace.policy_version,
  },
]);

const learnerSummary2 = buildLearnerSummary(LEARNER_REF_2, [
  {
    decision_id: decisionFixture2.decision_id,
    decision_type: decisionFixture2.decision_type,
    decided_at: today,
    matched_rule_id: decisionFixture2.trace.matched_rule_id,
    educator_summary: decisionFixture2.trace.educator_summary,
    rationale: decisionFixture2.trace.rationale,
    policy_version: decisionFixture2.trace.policy_version,
  },
]);

/** @type {Record<string, object>} */
const learnerSummariesByRef = {
  [LEARNER_REF]: learnerSummary,
  [LEARNER_REF_2]: learnerSummary2,
};

/** @type {Record<string, object>} */
const decisionsById = {
  [decisionFixture.decision_id]: decisionFixture,
  [decisionFixture2.decision_id]: decisionFixture2,
};

/** @type {Record<string, Array<object>>} */
const feedbackByDecisionId = {};

/** @type {Record<string, Array<object>>} */
const viewsByDecisionId = {};

const REJECT_REASON_CATEGORIES = new Set([
  'not_at_risk',
  'wrong_skill',
  'wrong_timing',
  'wrong_decision_type',
  'data_stale',
  'other',
]);

const APPROVE_REASON_CATEGORIES = new Set([
  'agree_primary',
  'agree_after_review',
  'agree_would_have_missed',
]);

const IGNORE_REASON_CATEGORIES = new Set([
  'not_applicable_now',
  'duplicate',
  'deferred',
  'other',
]);

const DECISION_TYPES = new Set(['reinforce', 'advance', 'intervene', 'pause']);

const VIEW_DEDUP_SECONDS = 60;

const ingestionEntries = [
  {
    signal_id: 'signal-001',
    source_system: 'lms-demo',
    learner_reference: LEARNER_REF,
    timestamp: today,
    schema_version: 'v1',
    outcome: 'accepted',
    received_at: today,
    rejection_reason: null,
  },
  {
    signal_id: 'signal-rejected-001',
    source_system: 'lms-demo',
    learner_reference: LEARNER_REF,
    timestamp: today,
    schema_version: 'v1',
    outcome: 'rejected',
    received_at: today,
    rejection_reason: { code: 'INVALID_FIELD', field_path: 'payload.masteryScore' },
  },
  {
    signal_id: 'signal-dup-001',
    source_system: 'lms-demo',
    learner_reference: LEARNER_REF,
    timestamp: today,
    schema_version: 'v1',
    outcome: 'duplicate',
    received_at: today,
    rejection_reason: null,
  },
];

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function readFbSession(req) {
  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)fb_session=([^;]*)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1].trim());
  return value.length > 0 ? value : null;
}

function emptyStringToNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return String(value);
  return value.length === 0 ? null : value;
}

function validateFeedbackBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      body: { code: 'invalid_action', message: 'Request body must be a JSON object.' },
    };
  }

  const action = body.action;
  if (typeof action !== 'string' || !['approve', 'reject', 'ignore'].includes(action)) {
    return {
      ok: false,
      status: 400,
      body: { code: 'invalid_action', message: 'action must be approve, reject, or ignore.' },
    };
  }

  const reasonCategory = emptyStringToNull(body.reason_category);
  const reasonText = emptyStringToNull(body.reason_text);
  const suggestedDecisionType = emptyStringToNull(body.suggested_decision_type);

  const allowedByAction = {
    approve: APPROVE_REASON_CATEGORIES,
    reject: REJECT_REASON_CATEGORIES,
    ignore: IGNORE_REASON_CATEGORIES,
  };

  if (reasonCategory !== null && !allowedByAction[action].has(reasonCategory)) {
    return {
      ok: false,
      status: 400,
      body: {
        code: 'invalid_reason_category',
        message: 'reason_category is not valid for this action.',
      },
    };
  }

  if (reasonText !== null && reasonText.length > 2000) {
    return {
      ok: false,
      status: 400,
      body: { code: 'reason_text_too_long', message: 'reason_text must be at most 2000 characters.' },
    };
  }

  if (action === 'reject' && reasonCategory === 'wrong_decision_type') {
    if (suggestedDecisionType === null) {
      return {
        ok: false,
        status: 400,
        body: {
          code: 'suggested_decision_type_required',
          message: 'suggested_decision_type is required when reason_category is wrong_decision_type.',
        },
      };
    }
    if (!DECISION_TYPES.has(suggestedDecisionType)) {
      return {
        ok: false,
        status: 400,
        body: {
          code: 'invalid_reason_category',
          message: 'suggested_decision_type must be a valid decision type.',
        },
      };
    }
  } else if (suggestedDecisionType !== null) {
    return {
      ok: false,
      status: 400,
      body: {
        code: 'suggested_decision_type_forbidden',
        message: 'suggested_decision_type must be omitted unless reason_category is wrong_decision_type.',
      },
    };
  }

  return {
    ok: true,
    value: {
      action,
      reasonCategory,
      reasonText,
      suggestedDecisionType,
    },
  };
}

function listFeedback(decisionId) {
  return feedbackByDecisionId[decisionId] ?? [];
}

function appendFeedback(decisionId, row) {
  if (!feedbackByDecisionId[decisionId]) {
    feedbackByDecisionId[decisionId] = [];
  }
  feedbackByDecisionId[decisionId].push(row);
  return row;
}

function recordView(decisionId, sessionId, viewedAt) {
  const rows = viewsByDecisionId[decisionId] ?? [];
  const latestForSession = [...rows]
    .reverse()
    .find((row) => row.session_id === sessionId);
  if (latestForSession) {
    const elapsedMs =
      Date.parse(viewedAt) - Date.parse(latestForSession.viewed_at);
    if (elapsedMs >= 0 && elapsedMs < VIEW_DEDUP_SECONDS * 1000) {
      return { recorded: false, reason: 'dedup_window' };
    }
  }

  const viewRow = {
    view_id: crypto.randomUUID(),
    decision_id: decisionId,
    org_id: ORG_ID,
    session_id: sessionId,
    viewed_at: viewedAt,
  };
  if (!viewsByDecisionId[decisionId]) {
    viewsByDecisionId[decisionId] = [];
  }
  viewsByDecisionId[decisionId].push(viewRow);
  return { recorded: true, viewed_at: viewedAt };
}

function resetFeedbackState() {
  for (const key of Object.keys(feedbackByDecisionId)) {
    delete feedbackByDecisionId[key];
  }
  for (const key of Object.keys(viewsByDecisionId)) {
    delete viewsByDecisionId[key];
  }
}

async function routeRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/health') {
    json(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && path === '/__e2e__/reset-feedback') {
    resetFeedbackState();
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && path === '/v1/signals') {
    const body = await readJsonBody(req);
    const signalId = body.signal_id;
    if (!signalId) {
      json(res, 400, { error: { code: 'missing_required_field', message: 'signal_id required' } });
      return;
    }
    if (acceptedSignalIds.has(signalId)) {
      json(res, 200, {
        org_id: ORG_ID,
        signal_id: signalId,
        status: 'duplicate',
        received_at: today,
      });
      return;
    }
    acceptedSignalIds.add(signalId);
    ingestionEntries.push({
      signal_id: signalId,
      source_system: body.source_system ?? 'lms-demo',
      learner_reference: body.learner_reference ?? LEARNER_REF,
      timestamp: body.timestamp ?? today,
      schema_version: body.schema_version ?? 'v1',
      outcome: 'accepted',
      received_at: today,
      rejection_reason: null,
    });
    json(res, 200, {
      org_id: ORG_ID,
      signal_id: signalId,
      status: 'accepted',
      received_at: today,
    });
    return;
  }

  if (req.method === 'POST' && path === '/v1/admin/ingestion/preflight') {
    const body = await readJsonBody(req);
    const payload = body.payload ?? {};
    const hasPii = JSON.stringify(payload).includes('ssn');
    json(res, 200, {
      preflight_id: 'pf-mock',
      received_at: today,
      forbidden_pii: hasPii ? [{ key: 'ssn', path: 'payload.ssn' }] : [],
      forbidden_semantic_raw: [],
      forbidden_semantic_after_mapping: null,
      mapping_suggestions: [],
      verdict: hasPii ? 'pii_blocking' : 'clean',
    });
    return;
  }

  const feedbackMatch = path.match(/^\/v1\/decisions\/([^/]+)\/feedback$/);
  if (feedbackMatch) {
    const decisionId = decodeURIComponent(feedbackMatch[1]);
    const decision = decisionsById[decisionId];
    if (!decision) {
      json(res, 404, {
        code: 'decision_not_found',
        message: 'Decision not found for this organization.',
      });
      return;
    }

    if (req.method === 'GET') {
      const rows = listFeedback(decisionId);
      json(res, 200, {
        decision_id: decisionId,
        feedback: rows.map((row) => ({
          feedback_id: row.feedback_id,
          action: row.action,
          reason_category: row.reason_category,
          reason_text: row.reason_text,
          suggested_decision_type: row.suggested_decision_type,
          created_at: row.created_at,
        })),
        latest_action: rows.length === 0 ? null : rows[rows.length - 1].action,
      });
      return;
    }

    if (req.method === 'POST') {
      const sessionId = readFbSession(req);
      if (!sessionId) {
        json(res, 401, {
          code: 'session_required',
          message: 'Dashboard session cookie required.',
        });
        return;
      }

      const body = await readJsonBody(req);
      const validation = validateFeedbackBody(body);
      if (!validation.ok) {
        json(res, validation.status, validation.body);
        return;
      }

      const createdAt = new Date().toISOString();
      const row = appendFeedback(decisionId, {
        feedback_id: crypto.randomUUID(),
        decision_id: decisionId,
        org_id: ORG_ID,
        learner_reference: decision.learner_reference,
        session_id: sessionId,
        action: validation.value.action,
        reason_category: validation.value.reasonCategory,
        reason_text: validation.value.reasonText,
        suggested_decision_type: validation.value.suggestedDecisionType,
        created_at: createdAt,
      });

      json(res, 201, {
        feedback_id: row.feedback_id,
        decision_id: decisionId,
        action: row.action,
        reason_category: row.reason_category,
        created_at: row.created_at,
      });
      return;
    }
  }

  const viewMatch = path.match(/^\/v1\/decisions\/([^/]+)\/view$/);
  if (viewMatch && req.method === 'POST') {
    const decisionId = decodeURIComponent(viewMatch[1]);
    const decision = decisionsById[decisionId];
    if (!decision) {
      json(res, 404, {
        code: 'decision_not_found',
        message: 'Decision not found for this organization.',
      });
      return;
    }

    const sessionId = readFbSession(req);
    if (!sessionId) {
      json(res, 401, {
        code: 'session_required',
        message: 'Dashboard session cookie required.',
      });
      return;
    }

    const viewedAt = new Date().toISOString();
    const result = recordView(decisionId, sessionId, viewedAt);
    json(res, 200, result);
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (path === '/v1/state/list') {
    json(res, 200, {
      org_id: ORG_ID,
      learners: [
        {
          learner_reference: LEARNER_REF,
          state_version: 2,
          updated_at: today,
        },
        {
          learner_reference: LEARNER_REF_2,
          state_version: 1,
          updated_at: today,
        },
      ],
      next_cursor: null,
    });
    return;
  }

  if (path === '/v1/state') {
    const version = url.searchParams.get('version');
    if (version === '1') {
      json(res, 200, stateV1);
      return;
    }
    json(res, 200, stateV2);
    return;
  }

  if (path === '/v1/decisions') {
    const learnerRef = url.searchParams.get('learner_reference') ?? LEARNER_REF;
    const decisions =
      learnerRef === LEARNER_REF_2 ? [decisionFixture2] : [decisionFixture];
    json(res, 200, {
      org_id: ORG_ID,
      learner_reference: learnerRef,
      decisions,
      next_page_token: null,
    });
    return;
  }

  if (path === '/v1/ingestion') {
    const outcome = url.searchParams.get('outcome');
    let entries = ingestionEntries;
    if (outcome) {
      entries = ingestionEntries.filter((e) => e.outcome === outcome);
    }
    json(res, 200, {
      org_id: ORG_ID,
      entries,
      next_cursor: null,
    });
    return;
  }

  const summaryMatch = path.match(/^\/v1\/learners\/([^/]+)\/summary$/);
  if (summaryMatch) {
    const learnerRef = decodeURIComponent(summaryMatch[1]);
    const summary = learnerSummariesByRef[learnerRef] ?? {
      ...learnerSummary,
      learner_reference: learnerRef,
    };
    json(res, 200, summary);
    return;
  }

  if (path === '/v1/policies') {
    json(res, 200, {
      org_id: ORG_ID,
      policies: [
        {
          policy_id: 'pilot-policy',
          policy_version: '1.0.0',
          policy_key: 'learner',
          description: 'Pilot learner policy',
          rule_count: 2,
        },
      ],
      routing: null,
    });
    return;
  }

  const policyDetailMatch = path.match(/^\/v1\/policies\/([^/]+)$/);
  if (policyDetailMatch) {
    const policyKey = decodeURIComponent(policyDetailMatch[1]);
    json(res, 200, {
      org_id: ORG_ID,
      policy_key: policyKey,
      policy: {
        policy_id: 'pilot-policy',
        policy_version: '1.0.0',
        description: 'Pilot learner policy',
        rules: [
          {
            rule_id: 'rule-intervene',
            decision_type: 'intervene',
            condition: {
              all: [
                { field: 'stabilityScore', operator: 'lt', value: 0.3 },
                { field: 'timeSinceReinforcement', operator: 'gt', value: 172800 },
              ],
            },
          },
          {
            rule_id: 'rule-reinforce',
            decision_type: 'reinforce',
            condition: {
              field: 'stabilityScore',
              operator: 'gte',
              value: 0,
            },
          },
        ],
      },
    });
    return;
  }

  if (path === '/v1/program-metrics') {
    json(res, 200, {
      org_id: ORG_ID,
      window: { from: `${todayDate}T00:00:00.000Z`, to: today },
      metrics: {
        intervention_rate: {
          value: 0.15,
          numerator: 3,
          denominator: 20,
          window: { from: `${todayDate}T00:00:00.000Z`, to: today },
          computed_at: today,
        },
      },
    });
    return;
  }

  json(res, 404, { error: 'not_found', path });
}

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch((err) => {
    json(res, 500, { error: 'mock_upstream_error', message: String(err) });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`mock-upstream listening on http://127.0.0.1:${PORT}\n`);
});
