---
description: "Prefer existing libraries, SDK abstractions, and MCP tools over custom code. Check before building."
alwaysApply: true
---

# Prefer Existing Solutions

Before writing custom code, you MUST verify that no existing library, SDK abstraction, or MCP tool already solves the problem. Custom code is justified only when it is cheaper, faster, less complex, or provides measurably higher DX than the available alternative.

## Decision Checklist (mandatory for `/draft-spec`, `/plan-impl`, `/implement-spec`)

For every requirement that involves an external service, data format, or well-known pattern:

1. **Check installed dependencies** — Does `package.json` already include a library that handles this? Does the library expose a higher-level abstraction (e.g. `DynamoDBDocumentClient` vs low-level `DynamoDBClient` + `marshall`)?
2. **Check MCP tools** — Query relevant MCP servers for official best practices:
   - `user-awslabs.aws-documentation-mcp-server` → `search_documentation`, `read_sections` for AWS service patterns
   - `user-awslabs-dynamodb-mcp-server` → `dynamodb_data_modeling` for DynamoDB table design
   - `user-awslabs.aws-iac-mcp-server` → CDK/CloudFormation patterns
3. **Check SDK docs** — Is there an official SDK method, utility, or pattern that handles the task with less code?
4. **Justify custom code** — If you still choose to write custom code, document the reason in the spec or plan using one of these justifications:
   - **Cheaper**: The library adds unacceptable bundle size or licensing cost
   - **Performance**: Measurable latency/throughput gain from a custom implementation
   - **Less complex**: The library's API is more complex than a focused hand-written solution
   - **Higher DX**: The library's ergonomics are worse for this specific use case

## Examples

### Good (use existing)
- Use `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` instead of raw `DynamoDBClient` + `marshall`/`unmarshall`
- Use `ProvisionedThroughputExceededException` instanceof check instead of generic error string matching
- Use Fastify's built-in validation hooks instead of hand-written request body validators

### Good (justified custom)
- Custom restricted expression parser (no library exists for this exact whitelist grammar — justified by security constraint)
- Custom TTL cache (simpler than adding DAX for low-frequency config reads — justified by complexity + cost)

## When This Rule Applies

- **Always** during `/draft-spec` — spec should reference official docs/patterns for each external integration
- **Always** during `/plan-impl` — plan tasks should prefer existing SDK/library APIs
- **Always** during `/implement-spec` — implementation should use the highest-level abstraction available
- **Always** during `/review` — reviewer should flag custom code that duplicates library functionality
