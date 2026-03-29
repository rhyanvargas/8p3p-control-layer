import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * 8P3P Control Layer CDK Stack
 *
 * Current scope (policy-storage phase):
 *   - PoliciesTable (DynamoDB) — per docs/specs/policy-storage.md
 *   - Stub Lambda functions with correct IAM grants for PoliciesTable
 *
 * Remaining tables, API Gateway, Lambda bundling, and routes are implemented
 * in the AWS deployment work stream (aws-deployment.plan.md TASK-005 onward).
 */
export class ControlLayerStack extends cdk.Stack {
  /** DynamoDB table for per-tenant policy definitions */
  readonly policiesTable: dynamodb.Table;

  /** Lambda for signal ingestion — read access to PoliciesTable */
  readonly ingestFunction: lambda.Function;

  /** Lambda for read-only query paths (decisions, signals, state) — read access to PoliciesTable */
  readonly inspectFunction: lambda.Function;

  /** Lambda for admin operations (policy CRUD) — read-write access to PoliciesTable */
  readonly adminFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // DynamoDB: PoliciesTable
    // Schema per docs/specs/policy-storage.md
    //   PK: org_id (S) — e.g. "springs", "global"
    //   SK: policy_key (S) — e.g. "learner", "default", "routing"
    // -------------------------------------------------------------------------
    this.policiesTable = new dynamodb.Table(this, 'PoliciesTable', {
      tableName: 'PoliciesTable',
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'policy_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Point-in-time recovery for pilot safety; remove if cost is a concern
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------------------------
    // Lambda stubs — runtime, arch, and env wired correctly.
    // Handler bundling is implemented in aws-deployment TASK-009.
    // -------------------------------------------------------------------------
    const commonLambdaProps: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        POLICIES_TABLE: this.policiesTable.tableName,
      },
    };

    this.ingestFunction = new lambda.Function(this, 'IngestFunction', {
      ...commonLambdaProps,
      functionName: 'control-layer-ingest',
      // Placeholder handler — replaced with bundled code in aws-deployment TASK-009
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 503,
          body: JSON.stringify({ error: 'Not yet deployed' }),
        });
      `),
      handler: 'index.handler',
      description: 'Signal ingestion Lambda — POST /v1/signals',
    } as lambda.FunctionProps);

    this.inspectFunction = new lambda.Function(this, 'InspectFunction', {
      ...commonLambdaProps,
      functionName: 'control-layer-inspect',
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 503,
          body: JSON.stringify({ error: 'Not yet deployed' }),
        });
      `),
      handler: 'index.handler',
      description: 'Read-only query Lambda — GET /v1/signals, /v1/decisions, /v1/state, /v1/receipts',
    } as lambda.FunctionProps);

    // ADMIN_API_KEY is sourced from the ADMIN_API_KEY environment variable at deploy time.
    // For production, pass this from SSM Parameter Store or Secrets Manager via a deployment
    // script; for local CDK synth a placeholder value is acceptable.
    const adminApiKey = process.env.ADMIN_API_KEY ?? '';

    this.adminFunction = new lambda.Function(this, 'AdminFunction', {
      ...commonLambdaProps,
      functionName: 'control-layer-admin',
      // Placeholder handler — replaced with bundled src/lambda/admin-handler.ts in aws-deployment TASK-009
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 503,
          body: JSON.stringify({ error: 'Not yet deployed' }),
        });
      `),
      handler: 'index.handler',
      description: 'Admin Lambda — PUT/PATCH/DELETE/GET /v1/admin/policies',
      environment: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        POLICIES_TABLE: this.policiesTable.tableName,
        ADMIN_API_KEY: adminApiKey,
      },
    } as lambda.FunctionProps);

    // -------------------------------------------------------------------------
    // IAM: PoliciesTable grants
    // - IngestFunction + InspectFunction: read-only (GetItem, Query)
    // - AdminFunction: read-write (GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan)
    // -------------------------------------------------------------------------

    // Read-only: GetItem + Query (needed for policy resolution chain and inspection list)
    const policyReadStatement = new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:Query'],
      resources: [this.policiesTable.tableArn],
    });

    this.ingestFunction.addToRolePolicy(policyReadStatement);
    this.inspectFunction.addToRolePolicy(policyReadStatement);

    // Read-write for AdminFunction (full policy CRUD per policy-management-api.md)
    this.policiesTable.grantReadWriteData(this.adminFunction);

    // -------------------------------------------------------------------------
    // Stack outputs
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'PoliciesTableName', {
      value: this.policiesTable.tableName,
      description: 'DynamoDB PoliciesTable name — set as POLICIES_TABLE env var in Lambdas',
      exportName: 'ControlLayer-PoliciesTableName',
    });

    new cdk.CfnOutput(this, 'PoliciesTableArn', {
      value: this.policiesTable.tableArn,
      description: 'DynamoDB PoliciesTable ARN',
      exportName: 'ControlLayer-PoliciesTableArn',
    });

    new cdk.CfnOutput(this, 'AdminFunctionName', {
      value: this.adminFunction.functionName,
      description: 'AdminFunction Lambda name — handles PUT/PATCH/DELETE/GET /v1/admin/policies',
      exportName: 'ControlLayer-AdminFunctionName',
    });
  }
}
