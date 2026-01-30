# 8P3P Control Layer Architecture

## System Architecture Diagram

```mermaid
architecture-beta
    group api_in(cloud)[API_IN]
    group control_layer(server)[ControlLayer]
    group api_out(cloud)[API_OUT]

    service ext_systems(internet)[ExternalSystems] in api_in
    service ingestion(server)[Ingestion] in control_layer
    service signal_log(database)[SignalLog] in control_layer
    service state_engine(server)[STATEEngine] in control_layer
    service state_store(database)[STATEStore] in control_layer
    service decision_engine(server)[DecisionEngine] in control_layer
    service output(server)[Output] in control_layer
    service downstream(internet)[Downstream] in api_out

    ext_systems:R --> L:ingestion
    ingestion:R --> L:signal_log
    signal_log:R --> L:state_engine
    state_engine:B <--> T:state_store
    state_engine:R --> L:decision_engine
    decision_engine:R --> L:output
    output:R --> L:downstream
```

## Lifecycle Stages

| Stage | Component | Responsibility |
|-------|-----------|----------------|
| **1** | Signal Ingestion | Receive, validate, and accept signals from external systems |
| **2** | Signal Log | Store signals immutably with full provenance |
| **3** | STATE Engine | Apply signals to learner state; single source of truth |
| **4** | Decision Engine | Evaluate state and generate deterministic decisions |
| **5** | Output Interfaces | Expose decisions via API and/or events |

## Data Flow Summary

```
External System
       │
       ▼ (API IN: POST /signals)
┌──────────────────┐
│ Signal Ingestion │ ← Validates SignalEnvelope
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Signal Log     │ ← Append-only, immutable
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────┐
│  STATE Engine    │◄───►│ STATE Store │
└────────┬─────────┘     └─────────────┘
         │
         ▼
┌──────────────────┐
│ Decision Engine  │ ← Deterministic evaluation
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Output Interfaces│
└────────┬─────────┘
         │
         ▼ (API/Event OUT: GET /decisions)
Downstream System
```

## Storage Touchpoints

| Storage | Purpose | Access Pattern |
|---------|---------|----------------|
| **Signal Log** | Immutable record of all ingested signals | Append-only writes; Read by org_id + time range |
| **STATE Store** | Current learner state with version tracking | Read/Write by org_id + learner_reference |

## External Boundaries

| Boundary | Direction | Protocol | Endpoints |
|----------|-----------|----------|-----------|
| **API IN** | Inbound | REST/HTTP | `POST /signals` |
| **API OUT** | Outbound | REST/HTTP | `GET /decisions` |
| **Event OUT** | Outbound | EventBridge (Phase 3) | Decision events |

---

## Key Properties

- **Unidirectional Flow**: Data moves left-to-right through the lifecycle
- **No Shortcuts**: Every signal must traverse all five stages
- **Isolation**: Multi-tenant by `org_id` at every stage
- **Determinism**: Same input state always produces same decision
- **Immutability**: Signal Log is append-only; STATE updates are versioned
