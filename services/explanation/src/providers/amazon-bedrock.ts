/**
 * Amazon Bedrock model factory (Lambda/production path).
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { LanguageModel } from 'ai';

import type { ExplanationEnvConfig } from '../env-config.js';

/** Resolve Bedrock language model via IAM credential chain. */
export function createBedrockModel(env: ExplanationEnvConfig): LanguageModel {
  const bedrock = createAmazonBedrock({
    region: env.region,
    credentialProvider: fromNodeProviderChain(),
  });
  return bedrock(env.model);
}
