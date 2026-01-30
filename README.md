# 8P3P Learning Intelligence Control Layer

**A vendor-agnostic, contract-driven intelligence engine for adaptive learning systems**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## Overview

The 8P3P Control Layer is an enterprise-grade intelligence infrastructure that transforms learning signals into actionable decisions while maintaining complete separation from UI, workflows, and domain-specific implementations. Built on immutable principles and contract-first design, it provides the foundational intelligence layer for adaptive learning platforms at scale.

### Core Capabilities

- **Signal Ingestion** — Accept learning events from any source system via API or event streams
- **Immutable State Management** — Maintain append-only learner state with full provenance tracking
- **Deterministic Decision Engine** — Generate consistent, traceable decisions from state
- **Multi-Tenant Architecture** — Built-in org-level isolation with zero cross-tenant leakage
- **Contract-First Design** — Comprehensive interface contracts with structural validation
- **Vendor Neutrality** — No platform lock-in, no domain assumptions, pure intelligence layer

---

## Architecture

### Lifecycle Flow

```
┌─────────────────┐
│  External       │
│  Systems        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Signal         │────▶│  Signal Log     │
│  Ingestion      │     │  (Immutable)    │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  STATE Engine   │
                        │  (Authority)    │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Decision       │
                        │  Engine         │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Output         │
                        │  Interfaces     │
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Downstream     │
                        │  Systems        │
                        └─────────────────┘
```

### Key Principles

| Principle | Description |
|-----------|-------------|
| **API-First** | All access via defined interface contracts |
| **Immutability** | Append-only signal log, no state overwrites |
| **Determinism** | Same state always produces same decision |
| **STATE Authority** | No external state overrides permitted |
| **Idempotency** | Safe retry for all operations |
| **Vendor Neutrality** | Zero platform or domain coupling |

---

## Decision Types

The control layer supports seven decision types, forming a closed set:

| Decision Type | Description |
|--------------|-------------|
| `reinforce` | Continue current learning path |
| `advance` | Progress to next level |
| `intervene` | Require assistance |
| `pause` | Temporary hold |
| `escalate` | Elevate to human review |
| `recommend` | Suggest content |
| `reroute` | Change learning path |

---

## Interface Contracts

### Signal Envelope

All inbound signals conform to the `SignalEnvelope` schema:

```json
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "RFC3339 with timezone",
  "schema_version": "v[0-9]+",
  "payload": {},
  "metadata": {
    "correlation_id": "string",
    "trace_id": "string"
  }
}
```

### Decision Object

All outbound decisions follow the `Decision` schema:

```json
{
  "org_id": "string",
  "decision_id": "string",
  "learner_reference": "string",
  "decision_type": "reinforce | advance | intervene | pause | escalate | recommend | reroute",
  "decided_at": "RFC3339",
  "decision_context": {},
  "trace": {
    "state_id": "string",
    "state_version": "integer"
  }
}
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Component Interface Contracts](docs/foundation/) | Complete API and event schemas |
| [Contract Test Matrix](docs/foundation/) | Comprehensive test cases for validation |
| [Interface Validation Ruleset](docs/foundation/) | Structural validation rules and error codes |

---

## Project Status

This project is currently in the **design and specification phase**. The foundational contracts and validation rules have been defined.

### Completed
- [x] Component interface contracts
- [x] Contract test matrix
- [x] Interface validation ruleset

### Next Steps
- [ ] Technology stack selection
- [ ] Project scaffolding
- [ ] Reference implementation
- [ ] SDK development

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

---

**Maintained by the 8P3P Team**
