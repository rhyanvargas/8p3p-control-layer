/**
 * Policy Loader
 * Loads policy JSON, validates structure, and evaluates conditions against state.
 * Uses a module-level cached policy (singleton pattern).
 *
 * DynamoDB read path (v1.1):
 *   When POLICIES_TABLE env var is set, loadPolicyForContext and loadRoutingConfigForOrg
 *   attempt to resolve from DynamoDB first (three-candidate chain) before falling back to
 *   bundled filesystem files. Resolved entries are cached in memory with a configurable TTL
 *   (POLICY_CACHE_TTL_MS, default 5 minutes). On TTL expiry the cached (stale) value is
 *   served immediately and a background refresh is fired so subsequent calls get the updated
 *   policy. This keeps loadPolicyForContext synchronous — no changes to the decision engine.
 *
 *   To pre-warm the cache (Lambda cold-start or tests), call:
 *     await warmupPolicyForContext(orgId, userType)
 *     await warmupRoutingConfigForOrg(orgId)
 *
 *   For local development (POLICIES_TABLE unset) the filesystem path is unchanged.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  ConditionAll,
  ConditionAny,
  ConditionLeaf,
  ConditionNode,
  PolicyDefinition,
  PolicyEvaluationResult,
  PolicyRoutingConfig,
  EvaluatedField,
  MatchedRule,
} from '../shared/types.js';
import { DECISION_TYPES } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';

/**
 * Semver regex — matches MAJOR.MINOR.PATCH with optional prerelease/build metadata.
 * Examples: 1.0.0, 2.1.0-beta.1, 3.0.0+build.42
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

const VALID_OPERATORS: readonly ConditionLeaf['operator'][] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;

let cachedPolicy: PolicyDefinition | null = null;

/** Per-context filesystem cache keyed on `${orgId}:${userType}` (no TTL — local dev only) */
const contextPolicyCache = new Map<string, PolicyDefinition>();

// =============================================================================
// DynamoDB — TTL cache, client, and resolution helpers
// =============================================================================

const DEFAULT_POLICY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getPolicyCacheTTLMs(): number {
  const raw = process.env.POLICY_CACHE_TTL_MS;
  if (!raw) return DEFAULT_POLICY_CACHE_TTL_MS;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_POLICY_CACHE_TTL_MS : parsed;
}

interface DynamoPolicyCacheEntry {
  policy: PolicyDefinition;
  loadedAt: number;
}

interface DynamoRoutingCacheEntry {
  config: PolicyRoutingConfig | null;
  loadedAt: number;
}

/** In-memory TTL cache for DynamoDB-resolved policies. Key: `${orgId}:${userType}` */
const dynamoContextCache = new Map<string, DynamoPolicyCacheEntry>();

/** In-memory TTL cache for DynamoDB-resolved routing configs. Key: orgId */
const dynamoRoutingCache = new Map<string, DynamoRoutingCacheEntry>();

/** Tracks in-progress background refreshes to avoid duplicate concurrent calls */
const policyRefreshInProgress = new Set<string>();
const routingRefreshInProgress = new Set<string>();

/** Lazily-created DynamoDB client (injectable for testing) */
let _dynamoClient: DynamoDBClient | null = null;

function getDynamoClient(): DynamoDBClient {
  if (!_dynamoClient) {
    _dynamoClient = new DynamoDBClient({});
  }
  return _dynamoClient;
}

/**
 * Inject a DynamoDB client for testing.
 * Pass null to reset to the default lazy-created client.
 */
export function _setDynamoClientForTesting(client: DynamoDBClient | null): void {
  _dynamoClient = client;
}

/**
 * Clears the DynamoDB TTL caches for policies and routing configs.
 * Intended for tests only — simulates TTL expiry or cold-start state.
 */
export function clearDynamoContextCache(): void {
  dynamoContextCache.clear();
  dynamoRoutingCache.clear();
}

/**
 * Attempts a single DynamoDB GetItem for one (org_id, policy_key) candidate.
 * Returns:
 *  - { policy } if item exists and status === "active"
 *  - null if item not found, status !== "active", or DynamoDB error
 *
 * Side effects: logs structured warnings for degraded/disabled states.
 */
async function tryGetPolicyItemFromDynamo(
  tableName: string,
  orgId: string,
  policyKey: string
): Promise<PolicyDefinition | null> {
  try {
    const result = await getDynamoClient().send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          org_id: { S: orgId },
          policy_key: { S: policyKey },
        },
      })
    );

    if (!result.Item) return null;

    const item = unmarshall(result.Item) as Record<string, unknown>;

    if (item['status'] !== 'active') {
      console.warn(JSON.stringify({
        event: 'policy_skipped',
        code: ErrorCodes.POLICY_SKIPPED_DISABLED,
        org_id: orgId,
        policy_key: policyKey,
        status: item['status'],
      }));
      return null;
    }

    const policyJson = item['policy_json'];
    try {
      validatePolicyStructure(policyJson);
    } catch (validationErr) {
      // Policy data from DynamoDB failed structural validation — treat as degraded
      console.warn(JSON.stringify({
        event: 'policy_dynamo_degraded',
        code: ErrorCodes.POLICY_DYNAMO_DEGRADED,
        org_id: orgId,
        policy_key: policyKey,
        error: validationErr instanceof Error ? validationErr.message : String(validationErr),
      }));
      return null;
    }
    return policyJson as PolicyDefinition;
  } catch (err) {
    // DynamoDB transport error — log degraded, let caller fall through to bundled
    console.warn(JSON.stringify({
      event: 'policy_dynamo_degraded',
      code: ErrorCodes.POLICY_DYNAMO_DEGRADED,
      org_id: orgId,
      policy_key: policyKey,
      error: err instanceof Error ? err.message : String(err),
    }));
    return null;
  }
}

/**
 * Attempts a single DynamoDB GetItem for routing config (policy_key = "routing").
 */
async function tryGetRoutingItemFromDynamo(
  tableName: string,
  orgId: string
): Promise<PolicyRoutingConfig | null> {
  try {
    const result = await getDynamoClient().send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          org_id: { S: orgId },
          policy_key: { S: 'routing' },
        },
      })
    );

    if (!result.Item) return null;

    const item = unmarshall(result.Item) as Record<string, unknown>;

    if (item['status'] !== 'active') {
      console.warn(JSON.stringify({
        event: 'policy_skipped',
        code: ErrorCodes.POLICY_SKIPPED_DISABLED,
        org_id: orgId,
        policy_key: 'routing',
        status: item['status'],
      }));
      return null;
    }

    const routingJson = item['routing_json'] ?? item['policy_json'];
    if (!routingJson || typeof routingJson !== 'object') return null;
    return routingJson as PolicyRoutingConfig;
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'policy_dynamo_degraded',
      code: ErrorCodes.POLICY_DYNAMO_DEGRADED,
      org_id: orgId,
      policy_key: 'routing',
      error: err instanceof Error ? err.message : String(err),
    }));
    return null;
  }
}

/**
 * Runs the three-candidate DynamoDB resolution chain for a given org + userType:
 *   1. (org_id=orgId, policy_key=userType)
 *   2. (org_id=orgId, policy_key="default")
 *   3. (org_id="global", policy_key="default")
 *
 * Returns the first active PolicyDefinition found, or null if all candidates
 * are absent, disabled, or DynamoDB is unreachable.
 */
async function resolvePolicyFromDynamo(
  tableName: string,
  orgId: string,
  userType: string
): Promise<PolicyDefinition | null> {
  const candidates = [
    { o: orgId, k: userType },
    { o: orgId, k: 'default' },
    { o: 'global', k: 'default' },
  ];
  for (const { o, k } of candidates) {
    const result = await tryGetPolicyItemFromDynamo(tableName, o, k);
    if (result !== null) return result;
  }
  return null;
}

/**
 * Background refresh: re-fetches policy from DynamoDB and updates the TTL cache.
 * No-ops if a refresh for the same key is already in progress.
 * Exported for use in tests (allows awaiting the refresh explicitly).
 */
export async function warmupPolicyForContext(orgId: string, userType: string): Promise<void> {
  const tableName = process.env.POLICIES_TABLE;
  if (!tableName) return;

  const cacheKey = `${orgId}:${userType}`;
  if (policyRefreshInProgress.has(cacheKey)) return;
  policyRefreshInProgress.add(cacheKey);

  try {
    const policy = await resolvePolicyFromDynamo(tableName, orgId, userType);
    if (policy !== null) {
      dynamoContextCache.set(cacheKey, { policy, loadedAt: Date.now() });
    } else {
      // All DynamoDB candidates were absent or disabled — remove stale entry
      // so filesystem fallback is used on the next sync call
      dynamoContextCache.delete(cacheKey);
    }
  } finally {
    policyRefreshInProgress.delete(cacheKey);
  }
}

/**
 * Background refresh: re-fetches routing config from DynamoDB and updates the TTL cache.
 * Exported for use in tests.
 */
export async function warmupRoutingConfigForOrg(orgId: string): Promise<void> {
  const tableName = process.env.POLICIES_TABLE;
  if (!tableName) return;

  if (routingRefreshInProgress.has(orgId)) return;
  routingRefreshInProgress.add(orgId);

  try {
    const config = await tryGetRoutingItemFromDynamo(tableName, orgId);
    dynamoRoutingCache.set(orgId, { config, loadedAt: Date.now() });
  } finally {
    routingRefreshInProgress.delete(orgId);
  }
}

function isConditionLeaf(node: ConditionNode): node is ConditionLeaf {
  return 'field' in node && 'operator' in node && 'value' in node;
}

function isConditionAll(node: ConditionNode): node is ConditionAll {
  return 'all' in node && Array.isArray((node as ConditionAll).all);
}

function isConditionAny(node: ConditionNode): node is ConditionAny {
  return 'any' in node && Array.isArray((node as ConditionAny).any);
}

/**
 * Throws an Error with a canonical code property for loadPolicy validation failures.
 */
function throwPolicyError(code: string, message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  throw err;
}

/**
 * Validates a condition node (structure only). Throws on invalid structure.
 * - Leaf: must have field, operator in closed set, value.
 * - Compound (all/any): must have ≥2 children; no mixed leaf/compound (each child is one kind).
 */
function validateConditionNode(node: unknown, pathPrefix: string): void {
  if (node === null || typeof node !== 'object') {
    throwPolicyError(ErrorCodes.INVALID_TYPE, `${pathPrefix}: condition node must be an object`);
  }
  const obj = node as Record<string, unknown>;
  const hasField = 'field' in obj;
  const hasAll = 'all' in obj;
  const hasAny = 'any' in obj;
  const count = [hasField, hasAll, hasAny].filter(Boolean).length;
  if (count !== 1) {
    throwPolicyError(
      ErrorCodes.INVALID_TYPE,
      `${pathPrefix}: condition node must be exactly one of leaf (field/operator/value), all, or any`
    );
  }
  if (hasField) {
    const valueOk =
      typeof obj.value === 'string' || typeof obj.value === 'number' || typeof obj.value === 'boolean';
    if (
      typeof obj.field !== 'string' ||
      !VALID_OPERATORS.includes(obj.operator as ConditionLeaf['operator']) ||
      !valueOk
    ) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: leaf must have field (string), operator (eq|neq|gt|gte|lt|lte), value (string|number|boolean)`
      );
    }
    return;
  }
  if (hasAll) {
    const children = obj.all as unknown[];
    if (!Array.isArray(children) || children.length < 2) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: "all" must have at least 2 children`
      );
    }
    children.forEach((child, i) => validateConditionNode(child, `${pathPrefix}.all[${i}]`));
    return;
  }
  if (hasAny) {
    const children = obj.any as unknown[];
    if (!Array.isArray(children) || children.length < 2) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: "any" must have at least 2 children`
      );
    }
    children.forEach((child, i) => validateConditionNode(child, `${pathPrefix}.any[${i}]`));
  }
}

/**
 * Validates a loaded policy structure. Throws on invalid structure.
 * Exported for admin API use — maps all thrown errors to `invalid_policy_structure`.
 */
export function validatePolicyStructure(raw: unknown): asserts raw is PolicyDefinition {
  if (raw === null || typeof raw !== 'object') {
    throwPolicyError(ErrorCodes.INVALID_TYPE, 'Policy must be a JSON object');
  }
  const policy = raw as Record<string, unknown>;
  if (
    typeof policy.policy_id !== 'string' ||
    typeof policy.policy_version !== 'string' ||
    typeof policy.description !== 'string' ||
    !Array.isArray(policy.rules) ||
    typeof policy.default_decision_type !== 'string'
  ) {
    throwPolicyError(
      ErrorCodes.INVALID_TYPE,
      'Policy must have policy_id, policy_version, description (strings), rules (array), default_decision_type (string)'
    );
  }
  if (!SEMVER_REGEX.test(policy.policy_version as string)) {
    throwPolicyError(
      ErrorCodes.INVALID_POLICY_VERSION,
      `policy_version must be valid semver (e.g. 1.0.0), got: "${policy.policy_version}"`
    );
  }
  if (!DECISION_TYPES.includes(policy.default_decision_type as Parameters<typeof DECISION_TYPES.includes>[0])) {
    throwPolicyError(
      ErrorCodes.INVALID_DECISION_TYPE,
      `default_decision_type must be one of: ${DECISION_TYPES.join(', ')}`
    );
  }
  const seenRuleIds = new Set<string>();
  policy.rules.forEach((rule: unknown, index: number) => {
    if (rule === null || typeof rule !== 'object') {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}] must be an object`);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.rule_id !== 'string') {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}].rule_id must be a string`);
    }
    if (seenRuleIds.has(r.rule_id)) {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `Duplicate rule_id: ${r.rule_id}`);
    }
    seenRuleIds.add(r.rule_id);
    if (!DECISION_TYPES.includes(r.decision_type as Parameters<typeof DECISION_TYPES.includes>[0])) {
      throwPolicyError(
        ErrorCodes.INVALID_DECISION_TYPE,
        `rules[${index}].decision_type must be one of: ${DECISION_TYPES.join(', ')}`
      );
    }
    if (r.condition === undefined) {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}].condition is required`);
    }
    validateConditionNode(r.condition, `rules[${index}].condition`);
  });
}

/**
 * Evaluates a single condition node against state (internal helper).
 * - Leaf: strict comparison; undefined field → false; non-numeric for gt/gte/lt/lte → false.
 * - all: every child true (short-circuit on false).
 * - any: at least one child true (short-circuit on true).
 */
export function evaluateCondition(state: Record<string, unknown>, node: ConditionNode): boolean {
  return evaluateConditionCollecting(state, node, []);
}

/**
 * Evaluates condition and collects EvaluatedField for each leaf evaluated.
 * Used by evaluatePolicy to build matched_rule.evaluated_fields.
 */
function evaluateConditionCollecting(
  state: Record<string, unknown>,
  node: ConditionNode,
  collected: EvaluatedField[]
): boolean {
  if (isConditionLeaf(node)) {
    const raw = state[node.field];
    collected.push({
      field: node.field,
      operator: node.operator,
      threshold: node.value,
      actual_value: raw,
    });
    if (raw === undefined) return false;
    const { operator, value } = node;
    switch (operator) {
      case 'eq':
        return raw === value;
      case 'neq':
        return raw !== value;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const numState = Number(raw);
        const numValue = Number(value);
        if (Number.isNaN(numState) || Number.isNaN(numValue)) return false;
        switch (operator) {
          case 'gt':
            return numState > numValue;
          case 'gte':
            return numState >= numValue;
          case 'lt':
            return numState < numValue;
          case 'lte':
            return numState <= numValue;
          default:
            return false;
        }
      }
      default:
        return false;
    }
  }
  if (isConditionAll(node)) {
    for (const child of node.all) {
      if (!evaluateConditionCollecting(state, child, collected)) return false;
    }
    return true;
  }
  if (isConditionAny(node)) {
    for (const child of node.any) {
      if (evaluateConditionCollecting(state, child, collected)) return true;
    }
    return false;
  }
  return false;
}

/** Per-org routing config cache keyed on orgId */
const routingConfigCache = new Map<string, PolicyRoutingConfig | null>();

/**
 * Loads and caches the routing config for an org.
 *
 * Resolution order:
 *   1. DynamoDB TTL cache (when POLICIES_TABLE is set and cache entry is fresh)
 *   2. DynamoDB GetItem (policy_key="routing") — stale-while-revalidate on TTL expiry
 *   3. Filesystem: policies/{orgId}/routing.json
 *   4. null (no routing config — caller falls through to "learner" default)
 *
 * Returns null if no routing config is found anywhere.
 * Silently degrades on parse errors so a malformed config never breaks decisions.
 */
export function loadRoutingConfigForOrg(orgId: string): PolicyRoutingConfig | null {
  const tableName = process.env.POLICIES_TABLE;
  const ttl = getPolicyCacheTTLMs();

  if (tableName) {
    const cached = dynamoRoutingCache.get(orgId);
    if (cached !== undefined) {
      if (Date.now() - cached.loadedAt < ttl) {
        // Fresh cache hit — return (may be null if org has no routing config in DynamoDB)
        if (cached.config !== null) return cached.config;
        // null entry means DynamoDB had no routing for this org — fall through to filesystem
      } else {
        // TTL expired: serve stale while background refresh fires
        void warmupRoutingConfigForOrg(orgId);
        if (cached.config !== null) return cached.config;
        // stale was null — fall through to filesystem
      }
    } else {
      // Cache miss: fire background warmup, fall through to filesystem this request
      void warmupRoutingConfigForOrg(orgId);
    }
  }

  // Filesystem fallback (local dev or DynamoDB miss)
  return loadRoutingConfigFromFs(orgId);
}

/**
 * Internal filesystem-only routing config loader (unchanged from original).
 * Silently swallows parse errors so a malformed routing.json degrades gracefully.
 */
function loadRoutingConfigFromFs(orgId: string): PolicyRoutingConfig | null {
  if (routingConfigCache.has(orgId)) return routingConfigCache.get(orgId) ?? null;

  const routingPath = path.join(process.cwd(), 'src/decision/policies', orgId, 'routing.json');
  if (!fs.existsSync(routingPath)) {
    routingConfigCache.set(orgId, null);
    return null;
  }

  try {
    const content = fs.readFileSync(routingPath, 'utf-8');
    const raw = JSON.parse(content) as PolicyRoutingConfig;
    routingConfigCache.set(orgId, raw);
    return raw;
  } catch {
    routingConfigCache.set(orgId, null);
    return null;
  }
}

/**
 * Resolves a policy key (e.g. "learner" | "staff") from an org's routing config.
 * Resolution order:
 *   1. `policies/{orgId}/routing.json` source_system_map[sourceSystem]
 *   2. `policies/{orgId}/routing.json` default_policy_key
 *   3. Hard fallback: "learner"
 */
export function resolveUserTypeFromSourceSystem(orgId: string, sourceSystem: string): string {
  const config = loadRoutingConfigForOrg(orgId);
  if (!config) return 'learner';
  return config.source_system_map[sourceSystem] ?? config.default_policy_key;
}

/**
 * Clears the routing config cache. Intended for tests only.
 */
export function clearRoutingConfigCache(): void {
  routingConfigCache.clear();
}

/**
 * Loads policy from JSON file, validates structure, and caches it.
 * Default path: DECISION_POLICY_PATH env or cwd/src/decision/policies/default.json.
 * @throws Error with code policy_not_found if file is missing
 * @throws Error with code invalid_decision_type if any decision_type is invalid
 * @throws Error (or SyntaxError from JSON.parse) on invalid JSON
 */
export function loadPolicy(policyPath?: string): PolicyDefinition {
  const pathToLoad =
    policyPath ?? process.env.DECISION_POLICY_PATH ?? path.join(process.cwd(), 'src/decision/policies/default.json');
  let content: string;
  try {
    content = fs.readFileSync(pathToLoad, 'utf-8');
  } catch (err) {
    const nodeErr = err as { code?: string };
    if (nodeErr?.code === 'ENOENT') {
      const e = new Error(`Policy file not found: ${pathToLoad}`) as Error & { code: string };
      e.code = ErrorCodes.POLICY_NOT_FOUND;
      throw e;
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throwPolicyError(ErrorCodes.INVALID_FORMAT, 'Policy file is not valid JSON');
  }
  validatePolicyStructure(raw);
  cachedPolicy = raw;
  return cachedPolicy;
}

/**
 * Loads and caches a policy for a given org + userType context.
 *
 * Resolution order:
 *   1. DynamoDB TTL cache (when POLICIES_TABLE is set and cache entry is fresh)
 *   2. DynamoDB GetItem chain (stale-while-revalidate on TTL expiry)
 *      — tries (orgId, userType) → (orgId, "default") → ("global", "default")
 *      — skips disabled items; logs policy_skipped_disabled per item skipped
 *      — on read failure, logs policy_dynamo_degraded and falls through to filesystem
 *   3. Filesystem: policies/{orgId}/{userType}.json → policies/{orgId}/default.json → policies/default.json
 *
 * The function is intentionally synchronous. DynamoDB reads happen in a background
 * async refresh (stale-while-revalidate). For cold-start or test pre-warming, call
 * `await warmupPolicyForContext(orgId, userType)` before the first sync call.
 *
 * @throws Error with code policy_not_found if no filesystem candidate exists (DynamoDB path
 * never throws — it only degrades to the filesystem fallback)
 */
export function loadPolicyForContext(orgId: string, userType: string): PolicyDefinition {
  const tableName = process.env.POLICIES_TABLE;
  const ttl = getPolicyCacheTTLMs();

  if (tableName) {
    const cacheKey = `${orgId}:${userType}`;
    const cached = dynamoContextCache.get(cacheKey);

    if (cached !== undefined) {
      if (Date.now() - cached.loadedAt < ttl) {
        return cached.policy; // Fresh cache hit
      }
      // TTL expired: serve stale, trigger background refresh
      void warmupPolicyForContext(orgId, userType);
      return cached.policy;
    }

    // Cache miss: trigger background refresh, fall through to filesystem this request
    void warmupPolicyForContext(orgId, userType);
  }

  return loadPolicyForContextFromFs(orgId, userType);
}

/**
 * Internal filesystem-only resolution (original loadPolicyForContext logic).
 * Results are cached in contextPolicyCache (no TTL — files don't change at runtime).
 *
 * @throws Error with code policy_not_found if none of the candidate files exist
 */
function loadPolicyForContextFromFs(orgId: string, userType: string): PolicyDefinition {
  const cacheKey = `${orgId}:${userType}`;
  const cached = contextPolicyCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const policiesRoot = path.join(process.cwd(), 'src/decision/policies');
  const candidates = [
    path.join(policiesRoot, orgId, `${userType}.json`),
    path.join(policiesRoot, orgId, 'default.json'),
    path.join(policiesRoot, 'default.json'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    let content: string;
    try {
      content = fs.readFileSync(candidate, 'utf-8');
    } catch (err) {
      const nodeErr = err as { code?: string };
      if (nodeErr?.code === 'ENOENT') continue;
      throw err;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throwPolicyError(ErrorCodes.INVALID_FORMAT, `Policy file is not valid JSON: ${candidate}`);
    }
    validatePolicyStructure(raw);
    contextPolicyCache.set(cacheKey, raw);
    return raw;
  }

  const e = new Error(
    `No policy found for org='${orgId}' userType='${userType}'. Tried: ${candidates.join(', ')}`
  ) as Error & { code: string };
  e.code = ErrorCodes.POLICY_NOT_FOUND;
  throw e;
}

/**
 * Evaluates state against policy rules in order. First matching rule wins.
 * If no rule matches, returns default_decision_type with matched_rule_id null.
 * When a rule matches, returns matched_rule with evaluated_fields for trace enrichment.
 */
export function evaluatePolicy(state: Record<string, unknown>, policy: PolicyDefinition): PolicyEvaluationResult {
  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]!;
    const evaluatedFields: EvaluatedField[] = [];
    if (evaluateConditionCollecting(state, rule.condition, evaluatedFields)) {
      const matchedRule: MatchedRule = {
        rule_id: rule.rule_id,
        decision_type: rule.decision_type,
        condition: rule.condition,
        evaluated_fields: evaluatedFields,
      };
      return {
        decision_type: rule.decision_type,
        matched_rule_id: rule.rule_id,
        matched_rule: matchedRule,
        evaluated_fields: evaluatedFields,
      };
    }
  }
  return {
    decision_type: policy.default_decision_type,
    matched_rule_id: null,
    matched_rule: null,
    evaluated_fields: [],
  };
}

/**
 * Returns the version string of the currently cached policy.
 * @throws Error if no policy has been loaded
 */
export function getLoadedPolicyVersion(): string {
  if (cachedPolicy === null) {
    const err = new Error('No policy loaded. Call loadPolicy first.') as Error & { code: string };
    err.code = ErrorCodes.POLICY_NOT_FOUND;
    throw err;
  }
  return cachedPolicy.policy_version;
}

/**
 * Returns the currently loaded policy (for tests). Null if not loaded.
 */
export function getLoadedPolicy(): PolicyDefinition | null {
  return cachedPolicy;
}
