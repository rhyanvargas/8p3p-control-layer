import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';

export interface ControlLayerStackProps extends cdk.StackProps {
  stage?: string;
  /**
   * Custom domain for the API, e.g. "api.8p3p.dev" (prod) or "api-dev.8p3p.dev" (dev).
   * When set, an ACM certificate and Route 53 alias record are provisioned.
   * Requires HOSTED_ZONE_ID and HOSTED_ZONE_NAME env vars at synth time.
   */
  customDomain?: string;
}

/**
 * 8P3P Control Layer CDK Stack
 *
 * Provisions:
 *   - DynamoDB tables: SignalsTable, StateTable, AppliedSignalsTable, DecisionsTable,
 *     IdempotencyTable, IngestionLogTable, PoliciesTable, FieldMappingsTable, TenantsTable
 *   - Four Lambda functions: Ingest, Query, Inspect, Admin (arm64, Node.js 22)
 *   - REST API Gateway with usage plan, API key enforcement on /v1/*,
 *     public /health and /docs endpoints
 *
 * Per docs/specs/aws-deployment.md
 */
export class ControlLayerStack extends cdk.Stack {
  readonly policiesTable: dynamodb.Table;
  readonly signalsTable: dynamodb.Table;
  readonly stateTable: dynamodb.Table;
  readonly appliedSignalsTable: dynamodb.Table;
  readonly decisionsTable: dynamodb.Table;
  readonly idempotencyTable: dynamodb.Table;
  readonly ingestionLogTable: dynamodb.Table;
  readonly fieldMappingsTable: dynamodb.Table;
  readonly tenantsTable: dynamodb.Table;

  readonly ingestFunction: lambda.Function;
  readonly queryFunction: lambda.Function;
  readonly inspectFunction: lambda.Function;
  readonly adminFunction: lambda.Function;

  readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ControlLayerStackProps = {}) {
    super(scope, id, props);

    const stage = props.stage ?? 'prod';

    // -------------------------------------------------------------------------
    // DynamoDB Tables
    // -------------------------------------------------------------------------

    this.signalsTable = new dynamodb.Table(this, 'SignalsTable', {
      tableName: `control-layer-signals-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'signal_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.signalsTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-learner-time',
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'learner_timestamp', type: dynamodb.AttributeType.STRING },
    });

    this.stateTable = new dynamodb.Table(this, 'StateTable', {
      tableName: `control-layer-state-${stage}`,
      partitionKey: { name: 'org_learner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'state_version', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.appliedSignalsTable = new dynamodb.Table(this, 'AppliedSignalsTable', {
      tableName: `control-layer-applied-signals-${stage}`,
      partitionKey: { name: 'org_learner', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'signal_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.decisionsTable = new dynamodb.Table(this, 'DecisionsTable', {
      tableName: `control-layer-decisions-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'decision_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.decisionsTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-learner-time',
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'learner_decided_at', type: dynamodb.AttributeType.STRING },
    });

    this.idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: `control-layer-idempotency-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'signal_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.ingestionLogTable = new dynamodb.Table(this, 'IngestionLogTable', {
      tableName: `control-layer-ingestion-log-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'received_at_signal_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.policiesTable = new dynamodb.Table(this, 'PoliciesTable', {
      tableName: `control-layer-policies-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'policy_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.fieldMappingsTable = new dynamodb.Table(this, 'FieldMappingsTable', {
      tableName: `control-layer-field-mappings-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'source_system', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.tenantsTable = new dynamodb.Table(this, 'TenantsTable', {
      tableName: `control-layer-tenants-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------------------------
    // Common Lambda config
    // -------------------------------------------------------------------------

    const commonEnv: Record<string, string> = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      SIGNALS_TABLE: this.signalsTable.tableName,
      STATE_TABLE: this.stateTable.tableName,
      APPLIED_SIGNALS_TABLE: this.appliedSignalsTable.tableName,
      DECISIONS_TABLE: this.decisionsTable.tableName,
      IDEMPOTENCY_TABLE: this.idempotencyTable.tableName,
      INGESTION_LOG_TABLE: this.ingestionLogTable.tableName,
      POLICIES_TABLE: this.policiesTable.tableName,
      FIELD_MAPPINGS_TABLE: this.fieldMappingsTable.tableName,
      TENANTS_TABLE: this.tenantsTable.tableName,
      STAGE: stage,
    };

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      code: lambda.Code.fromAsset('../dist/lambda'),
    } as const;

    // -------------------------------------------------------------------------
    // Lambda: IngestFunction — POST /v1/signals
    // -------------------------------------------------------------------------

    this.ingestFunction = new lambda.Function(this, 'IngestFunction', {
      ...commonProps,
      functionName: `control-layer-ingest-${stage}`,
      handler: 'ingest.handler',
      description: 'Signal ingestion — POST /v1/signals',
      environment: { ...commonEnv },
    });

    // -------------------------------------------------------------------------
    // Lambda: QueryFunction — GET /v1/signals, /v1/decisions, /v1/receipts
    // -------------------------------------------------------------------------

    this.queryFunction = new lambda.Function(this, 'QueryFunction', {
      ...commonProps,
      functionName: `control-layer-query-${stage}`,
      handler: 'query.handler',
      description: 'Read-path queries — GET /v1/signals, /v1/decisions, /v1/receipts',
      environment: { ...commonEnv },
    });

    // -------------------------------------------------------------------------
    // Lambda: InspectFunction — GET /v1/state, /v1/state/list, /v1/ingestion
    // -------------------------------------------------------------------------

    this.inspectFunction = new lambda.Function(this, 'InspectFunction', {
      ...commonProps,
      functionName: `control-layer-inspect-${stage}`,
      handler: 'inspect.handler',
      description: 'Inspection API — GET /v1/state, /v1/state/list, /v1/ingestion',
      environment: { ...commonEnv },
    });

    // -------------------------------------------------------------------------
    // Lambda: AdminFunction — PUT/PATCH/DELETE /v1/admin/policies
    // -------------------------------------------------------------------------

    this.adminFunction = new lambda.Function(this, 'AdminFunction', {
      ...commonProps,
      functionName: `control-layer-admin-${stage}`,
      handler: 'admin.handler',
      description: 'Admin API — policy and field-mapping management',
      environment: {
        ...commonEnv,
        ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? '',
      },
    });

    // -------------------------------------------------------------------------
    // IAM: DynamoDB grants
    // -------------------------------------------------------------------------

    // IngestFunction: read-write on data tables; read-only on config tables
    this.signalsTable.grantReadWriteData(this.ingestFunction);
    this.stateTable.grantReadWriteData(this.ingestFunction);
    this.appliedSignalsTable.grantReadWriteData(this.ingestFunction);
    this.decisionsTable.grantReadWriteData(this.ingestFunction);
    this.idempotencyTable.grantReadWriteData(this.ingestFunction);
    this.ingestionLogTable.grantReadWriteData(this.ingestFunction);
    this.policiesTable.grantReadData(this.ingestFunction);
    this.fieldMappingsTable.grantReadData(this.ingestFunction);
    this.tenantsTable.grantReadData(this.ingestFunction);

    // QueryFunction: read-only on data tables
    this.signalsTable.grantReadData(this.queryFunction);
    this.decisionsTable.grantReadData(this.queryFunction);
    this.policiesTable.grantReadData(this.queryFunction);

    // InspectFunction: read-only
    this.stateTable.grantReadData(this.inspectFunction);
    this.ingestionLogTable.grantReadData(this.inspectFunction);
    this.policiesTable.grantReadData(this.inspectFunction);

    // AdminFunction: read-write on policies and field mappings
    this.policiesTable.grantReadWriteData(this.adminFunction);
    this.fieldMappingsTable.grantReadWriteData(this.adminFunction);

    // -------------------------------------------------------------------------
    // API Gateway: REST API with API key enforcement on /v1/*
    // -------------------------------------------------------------------------

    this.api = new apigateway.RestApi(this, 'ControlLayerApi', {
      restApiName: `8p3p-control-layer-${stage}`,
      description: '8P3P Control Layer API — signals, state, decisions, inspection',
      deployOptions: {
        stageName: stage,
        throttlingBurstLimit: 50,
        throttlingRateLimit: 20,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
      },
      apiKeySourceType: apigateway.ApiKeySourceType.HEADER,
      defaultMethodOptions: { apiKeyRequired: true },
    });

    // Usage plan — enforces API key + throttling
    const usagePlan = this.api.addUsagePlan('PilotUsagePlan', {
      name: `control-layer-pilot-${stage}`,
      throttle: { burstLimit: 50, rateLimit: 20 },
    });
    usagePlan.addApiStage({ api: this.api, stage: this.api.deploymentStage });

    // Pilot API key — consumers supply this via x-api-key header.
    // For production, keys should be provisioned per-tenant via the admin API.
    const pilotApiKey = this.api.addApiKey('PilotApiKey', {
      apiKeyName: `control-layer-pilot-key-${stage}`,
      description: 'Default pilot API key for the 8P3P Control Layer',
    });
    usagePlan.addApiKey(pilotApiKey);

    // -------------------------------------------------------------------------
    // Public endpoints: /health and /docs (no API key required)
    // -------------------------------------------------------------------------

    const healthFn = new lambda.Function(this, 'HealthFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        `exports.handler = async () => ({ statusCode: 200, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'ok' }) });`
      ),
      functionName: `control-layer-health-${stage}`,
    });

    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(healthFn),
      { apiKeyRequired: false }
    );

    // /docs: serves OpenAPI UI via inspect Lambda (no API key)
    const docsResource = this.api.root.addResource('docs');
    docsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.inspectFunction),
      { apiKeyRequired: false }
    );
    docsResource.addProxy({
      defaultIntegration: new apigateway.LambdaIntegration(this.inspectFunction),
      anyMethod: true,
      defaultMethodOptions: { apiKeyRequired: false },
    });

    // -------------------------------------------------------------------------
    // /v1 routes (all API key required via defaultMethodOptions)
    // -------------------------------------------------------------------------

    const v1 = this.api.root.addResource('v1');

    // POST /v1/signals → IngestFunction
    const signals = v1.addResource('signals');
    signals.addMethod('POST', new apigateway.LambdaIntegration(this.ingestFunction));

    // GET /v1/signals → QueryFunction
    signals.addMethod('GET', new apigateway.LambdaIntegration(this.queryFunction));

    // GET /v1/decisions → QueryFunction
    const decisions = v1.addResource('decisions');
    decisions.addMethod('GET', new apigateway.LambdaIntegration(this.queryFunction));

    // GET /v1/receipts → QueryFunction
    const receipts = v1.addResource('receipts');
    receipts.addMethod('GET', new apigateway.LambdaIntegration(this.queryFunction));

    // GET /v1/state → InspectFunction
    const state = v1.addResource('state');
    state.addMethod('GET', new apigateway.LambdaIntegration(this.inspectFunction));

    // GET /v1/state/list → InspectFunction
    const stateList = state.addResource('list');
    stateList.addMethod('GET', new apigateway.LambdaIntegration(this.inspectFunction));

    // GET /v1/ingestion → InspectFunction
    const ingestion = v1.addResource('ingestion');
    ingestion.addMethod('GET', new apigateway.LambdaIntegration(this.inspectFunction));

    // /v1/admin/* → AdminFunction (still API key required, but admin-key checked in Lambda)
    const admin = v1.addResource('admin');
    const adminPolicies = admin.addResource('policies');
    adminPolicies.addMethod('GET', new apigateway.LambdaIntegration(this.adminFunction));
    const adminPolicyOrg = adminPolicies.addResource('{org_id}');
    const adminPolicyKey = adminPolicyOrg.addResource('{policy_key}');
    adminPolicyKey.addMethod('PUT', new apigateway.LambdaIntegration(this.adminFunction));
    adminPolicyKey.addMethod('PATCH', new apigateway.LambdaIntegration(this.adminFunction));
    adminPolicyKey.addMethod('DELETE', new apigateway.LambdaIntegration(this.adminFunction));
    const adminPoliciesValidate = adminPolicies.addResource('validate');
    adminPoliciesValidate.addMethod('POST', new apigateway.LambdaIntegration(this.adminFunction));

    // /v1/admin/mappings → AdminFunction
    const adminMappings = admin.addResource('mappings');
    adminMappings.addMethod('GET', new apigateway.LambdaIntegration(this.adminFunction));
    adminMappings.addMethod('PUT', new apigateway.LambdaIntegration(this.adminFunction));

    // -------------------------------------------------------------------------
    // Stack outputs
    // -------------------------------------------------------------------------

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway base URL',
      exportName: `ControlLayer-ApiUrl-${stage}`,
    });
    new cdk.CfnOutput(this, 'PoliciesTableName', {
      value: this.policiesTable.tableName,
      exportName: `ControlLayer-PoliciesTableName-${stage}`,
    });
    new cdk.CfnOutput(this, 'SignalsTableName', {
      value: this.signalsTable.tableName,
      exportName: `ControlLayer-SignalsTableName-${stage}`,
    });
    new cdk.CfnOutput(this, 'IngestFunctionName', {
      value: this.ingestFunction.functionName,
      exportName: `ControlLayer-IngestFunctionName-${stage}`,
    });

    // -------------------------------------------------------------------------
    // Custom domain (TASK-014) — optional, requires HOSTED_ZONE_ID + HOSTED_ZONE_NAME
    // Set props.customDomain to enable, e.g. "api-dev.8p3p.dev" or "api.8p3p.dev"
    // -------------------------------------------------------------------------

    const customDomain = props.customDomain ?? process.env.CUSTOM_DOMAIN;
    const hostedZoneId = process.env.HOSTED_ZONE_ID;
    const hostedZoneName = process.env.HOSTED_ZONE_NAME;

    if (customDomain && hostedZoneId && hostedZoneName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId,
        zoneName: hostedZoneName,
      });

      const cert = new acm.Certificate(this, 'ApiCertificate', {
        domainName: customDomain,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      const domainName = this.api.addDomainName('CustomDomain', {
        domainName: customDomain,
        certificate: cert,
        endpointType: apigateway.EndpointType.EDGE,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });

      new route53.ARecord(this, 'ApiAliasRecord', {
        zone: hostedZone,
        recordName: customDomain,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.ApiGatewayDomain(domainName)
        ),
      });

      new cdk.CfnOutput(this, 'CustomDomainUrl', {
        value: `https://${customDomain}`,
        description: 'Custom domain URL for the API',
        exportName: `ControlLayer-CustomDomainUrl-${stage}`,
      });
    }
  }
}
