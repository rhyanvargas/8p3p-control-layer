# **Component Interface Contracts (Schemas Only)**

Below are **Component Interface Contracts (schemas only)** for the control-layer boundary: **Signal Ingestion**, **Signal Log access surface**, **STATE Engine surfaces (internal)**, **Decision Engine output**, and **Output Interfaces**. These contracts enforce:

* API-first access and event interfaces only

* Mandatory lifecycle (Ingest → STATE Update → Decision → Output)

* No UI, no workflows, no domain logic, no platform abstractions

All contracts are **vendor-agnostic** and **structural** only.

---

## **0\) Common Conventions (Binding)**

### **0.1 Envelope Rules**

* Every inbound Signal and outbound Decision MUST have:

  * Unique ID

  * Source identifier

  * Learner reference

  * Timestamp

  * Opaque payload/context (no required domain schema)

* Structural validation only at ingestion.

### **0.2 Idempotency Rules**

* Signal admission idempotency key: signal\_id

* Decision emission idempotency key: decision\_id

* If duplicate IDs are received/emitted, behavior must be deterministic.

### **0.3 Allowed Decision Types (Closed Set)**

reinforce | advance | intervene | pause | escalate | recommend | reroute

### **0.4 Org Isolation (Structural)**

All interfaces MUST scope operations by an org\_id (or equivalent tenant key) to preserve neutrality and separation (no cross-org leakage). This is consistent with neutrality, security, and persistent authority.

---

## **1\) Signal Ingestion Interface Contract**

### **1.1 Signal Ingestion API (Structural)**

**Purpose:** Accept externally emitted signals via API.

#### **Request Schema:** 

#### **SignalEnvelope**

```
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "string (RFC3339)",
  "schema_version": "string",
  "payload": {},
  "metadata": {
    "correlation_id": "string",
    "trace_id": "string"
  }
}
```

**Field Requirements**

* payload is opaque (any JSON object). No domain requirements.

* schema\_version is the envelope schema version, not a domain taxonomy.

#### **Response Schema:** 

#### **SignalIngestResult**

```
{
  "org_id": "string",
  "signal_id": "string",
  "status": "accepted | rejected | duplicate",
  "received_at": "string (RFC3339)",
  "rejection_reason": {
    "code": "missing_required_field | invalid_type | invalid_timestamp | invalid_format",
    "message": "string"
  }
}
```

**Validation Rules (Structural Only)**

* Required fields present and types valid

* Timestamp parses

* IDs are non-empty

* No semantic validation of payload

---

### **1.2 Signal Ingestion Event Interface (Structural)**

**Purpose:** Accept externally emitted signals via event ingestion.

#### **Event Schema:** 

#### **SignalIngestedEvent**

```
{
  "event_type": "signal.ingested",
  "org_id": "string",
  "signal": {
    "org_id": "string",
    "signal_id": "string",
    "source_system": "string",
    "learner_reference": "string",
    "timestamp": "string (RFC3339)",
    "schema_version": "string",
    "payload": {},
    "metadata": {
      "correlation_id": "string",
      "trace_id": "string"
    }
  },
  "ingested_at": "string (RFC3339)"
}
```

---

## **2\) Signal Log Access Contract (Internal Read Surface)**

**Purpose:** Provide immutable, append-only evidence stream for STATE update.

### **2.1 Signal Log Record Schema:** 

### **SignalRecord**

```
{
  "org_id": "string",
  "signal_id": "string",
  "source_system": "string",
  "learner_reference": "string",
  "timestamp": "string (RFC3339)",
  "schema_version": "string",
  "payload": {},
  "metadata": {
    "correlation_id": "string",
    "trace_id": "string"
  },
  "accepted_at": "string (RFC3339)"
}
```

### **2.2 Signal Log Query Schema:** 

### **SignalLogReadRequest**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "from_time": "string (RFC3339)",
  "to_time": "string (RFC3339)",
  "page_token": "string",
  "page_size": 100
}
```

### **2.3 Signal Log Query Response:** 

### **SignalLogReadResponse**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "signals": [ { "SignalRecord": {} } ],
  "next_page_token": "string"
}
```

**Immutability Rule**

* No update or delete operations exist on this interface.

---

## **3\) STATE Engine Interface Contracts (Internal Only)**

The PRD requires STATE authority and forbids external overrides. Therefore, STATE interfaces are **internal** surfaces used by control-layer components, not downstream systems.

### **3.1 STATE Snapshot Schema:** 

### **LearnerState**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "state_id": "string",
  "state_version": "integer",
  "updated_at": "string (RFC3339)",
  "state": {},
  "provenance": {
    "last_signal_id": "string",
    "last_signal_timestamp": "string (RFC3339)"
  }
}
```

*   
  state is opaque and abstract, representing canonical STATE without domain semantics.

### **3.2 STATE Update Invocation (From Signals):** 

### **ApplySignalsRequest**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "signal_ids": ["string"],
  "requested_at": "string (RFC3339)"
}
```

### **3.3 STATE Update Result:** 

### **ApplySignalsResult**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "prior_state_version": "integer",
  "new_state_version": "integer",
  "state_id": "string",
  "applied_signal_ids": ["string"],
  "updated_at": "string (RFC3339)"
}
```

**Rules**

* STATE updates are incremental

* STATE cannot be set directly by any external request (no “setState” contract exists)

---

## **4\) Decision Engine Interface Contracts**

### **4.1 Decision Evaluation Request (Internal):** 

### **EvaluateStateForDecisionRequest**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "state_id": "string",
  "state_version": "integer",
  "requested_at": "string (RFC3339)"
}
```

### **4.2 Decision Object Schema:** 

### **Decision**

```
{
  "org_id": "string",
  "decision_id": "string",
  "learner_reference": "string",
  "decision_type": "reinforce | advance | intervene | pause | escalate | recommend | reroute",
  "decided_at": "string (RFC3339)",
  "decision_context": {},
  "trace": {
    "state_id": "string",
    "state_version": "integer"
  }
}
```

**Rules**

* Deterministic: same STATE (id+version) yields same decision outcome

* decision\_context is opaque and downstream-neutral

* Must always include trace back to STATE id/version

---

## **5\) Output Interfaces Contract (External)**

The PRD mandates decisions are exposed via APIs and/or event streams and remain neutral to execution/rendering.

### **5.1 Decision Output API:** 

### **GetDecisionsRequest**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "from_time": "string (RFC3339)",
  "to_time": "string (RFC3339)",
  "page_token": "string",
  "page_size": 100
}
```

### **5.2 Decision Output API Response:** 

### **GetDecisionsResponse**

```
{
  "org_id": "string",
  "learner_reference": "string",
  "decisions": [ { "Decision": {} } ],
  "next_page_token": "string"
}
```

### **5.3 Decision Output Event:** 

### **DecisionEmittedEvent**

```
{
  "event_type": "decision.emitted",
  "org_id": "string",
  "decision": {
    "org_id": "string",
    "decision_id": "string",
    "learner_reference": "string",
    "decision_type": "reinforce | advance | intervene | pause | escalate | recommend | reroute",
    "decided_at": "string (RFC3339)",
    "decision_context": {},
    "trace": {
      "state_id": "string",
      "state_version": "integer"
    }
  },
  "emitted_at": "string (RFC3339)"
}
```

**Rules**

* Outputs do not include UI/workflow directives

* Output does not include enforcement/execution status

* Downstream is responsible for execution

---

# **6\) Lifecycle Compliance Proof (Contracts Map)**

| Lifecycle Stage | Contract(s) |
| ----- | ----- |
| 1\. Signal Ingestion | SignalEnvelope, SignalIngestResult, SignalIngestedEvent |
| 2\. STATE Update | SignalRecord, SignalLogRead\*, ApplySignals\*, LearnerState |
| 3\. Decision | EvaluateStateForDecisionRequest, Decision |
| 4\. Output | GetDecisions\*, DecisionEmittedEvent |

This satisfies the mandatory lifecycle and keeps intelligence exposed via APIs/events only.

---

## **Sources of Truth**

* Company Foundation Memo 

* Constitution 

* PRD   
