import * as cdk from 'aws-cdk-lib';
import { ControlLayerStack } from '../lib/control-layer-stack.js';

const app = new cdk.App();

new ControlLayerStack(app, 'ControlLayerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: '8P3P Control Layer — API Gateway + Lambda + DynamoDB (pilot)',
});
