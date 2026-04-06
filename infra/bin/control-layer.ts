import * as cdk from 'aws-cdk-lib';
import { ControlLayerStack } from '../lib/control-layer-stack.js';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') as string | undefined ?? process.env.STAGE ?? 'prod';

new ControlLayerStack(app, 'ControlLayerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  stage,
  customDomain: process.env.CUSTOM_DOMAIN,
  description: '8P3P Control Layer — API Gateway + Lambda + DynamoDB (pilot)',
});
