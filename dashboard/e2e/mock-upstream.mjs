/**
 * Minimal mock control-layer API for Playwright e2e (NXMIG-001…016).
 * Listens on MOCK_UPSTREAM_PORT (default 9999).
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.MOCK_UPSTREAM_PORT ?? 9999);
const ORG_ID = 'e2e-org';
const LEARNER_REF = 'learner-1';

const now = new Date();
const today = now.toISOString();
const todayDate = today.slice(0, 10);

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

const learnerSummary = {
  org_id: ORG_ID,
  learner_reference: LEARNER_REF,
  generated_at: today,
  current_state: {
    state_id: stateV2.state_id,
    state_version: 2,
    updated_at: today,
    fields: {
      masteryScore: 0.42,
      masteryScore_direction: 'improving',
      stabilityScore: 0.35,
      stabilityScore_direction: 'declining',
      riskSignal: 0.72,
      riskSignal_direction: 'declining',
    },
    mastery_breakdown: null,
  },
  recent_decisions: [
    {
      decision_id: decisionFixture.decision_id,
      decision_type: decisionFixture.decision_type,
      decided_at: today,
      matched_rule_id: decisionFixture.trace.matched_rule_id,
      educator_summary: decisionFixture.trace.educator_summary,
      rationale: decisionFixture.trace.rationale,
      policy_version: decisionFixture.trace.policy_version,
    },
  ],
  field_trajectories: {
    masteryScore: {
      first_value: 0.3,
      latest_value: 0.42,
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

function routeRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/health') {
    json(res, 200, { status: 'ok' });
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
    json(res, 200, {
      org_id: ORG_ID,
      learner_reference: url.searchParams.get('learner_reference') ?? LEARNER_REF,
      decisions: [decisionFixture],
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
    json(res, 200, { ...learnerSummary, learner_reference: decodeURIComponent(summaryMatch[1]) });
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
          rule_count: 5,
        },
      ],
      routing: null,
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
  try {
    routeRequest(req, res);
  } catch (err) {
    json(res, 500, { error: 'mock_upstream_error', message: String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`mock-upstream listening on http://127.0.0.1:${PORT}\n`);
});
