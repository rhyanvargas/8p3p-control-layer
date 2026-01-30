

# **Contract Test Matrix (PRD-Aligned, Drift-Safe)**

Below is the **Contract Test Matrix** that enforces the **Interface Validation Ruleset** and maintains full PRD alignment.

It is structured so engineers can implement automated contract tests without introducing UI, workflow, or domain semantics.

---

## **0\) Global Test Rules (Apply to all suites)**

### **0.1 Determinism Assertions**

* Same valid input → same semantic output (timestamps may differ)

* Same invalid input → same error\_code and same field\_path

* Dedup behavior is deterministic for idempotency keys

### **0.2 Semantic Drift Block Assertions**

For payload, state, decision\_context:

* If any forbidden semantic key is present at any depth → reject with:

  * error\_code \= forbidden\_semantic\_key\_detected

  * field\_path points to the key location

### **0.3 Schema Version Assertions**

* schema\_version must match ^v\[0-9\]+$

* Any other format → invalid\_schema\_version

### **0.4 Org Scope Assertions**

* org\_id required for any operation

* If missing/blank → org\_scope\_required

---

# **1\) Signal Ingestion API Test Suite**

## **1.1 Accept Valid Signal**

**Test ID:** SIG-API-001

**Input:** SignalEnvelope with all required fields, schema\_version="v1", payload={}

**Expected:** status=accepted, signal\_id echoed, no rejection\_reason

**Assertions:** passes structural validation only

## **1.2 Missing Required Field**

**Test ID:** SIG-API-002

**Input:** omit learner\_reference

**Expected:** status=rejected, error\_code=missing\_required\_field, field\_path="learner\_reference"

## **1.3 Invalid Type**

**Test ID:** SIG-API-003

**Input:** payload=\[\] (array)

**Expected:** status=rejected, error\_code=payload\_not\_object, field\_path="payload"

## **1.4 Invalid Timestamp Format**

**Test ID:** SIG-API-004

**Input:** timestamp="2026-01-25 10:00:00"

**Expected:** rejected, invalid\_timestamp, field\_path="timestamp"

## **1.5 Missing Timezone**

**Test ID:** SIG-API-005

**Input:** timestamp="2026-01-25T10:00:00"

**Expected:** rejected, invalid\_timestamp, field\_path="timestamp"

## **1.6 Invalid schema\_version**

**Test ID:** SIG-API-006

**Input:** schema\_version="math-v2"

**Expected:** rejected, invalid\_schema\_version, field\_path="schema\_version"

## **1.7 Forbidden Semantic Key in payload (Top-level)**

**Test ID:** SIG-API-007

**Input:** payload={"ui": {"screen":"home"}}

**Expected:** rejected, forbidden\_semantic\_key\_detected, field\_path="payload.ui"

## **1.8 Forbidden Semantic Key in payload (Nested)**

**Test ID:** SIG-API-008

**Input:** payload={"x":{"y":{"workflow":{"step":"1"}}}}

**Expected:** rejected, forbidden\_semantic\_key\_detected, field\_path="payload.x.y.workflow"

## **1.9 Invalid signal\_id charset**

**Test ID:** SIG-API-009

**Input:** signal\_id="abc 123" (space)

**Expected:** rejected, invalid\_charset, field\_path="signal\_id"

## **1.10 Duplicate signal\_id idempotency**

**Test ID:** SIG-API-010

**Steps:**

1. Send valid SignalEnvelope (org\_id=A, signal\_id=S1)

2. Send same envelope again

    **Expected:**

3. accepted

4. duplicate

    **Determinism:** never accepted twice for same (org\_id, signal\_id)

## **1.11 Deterministic Rejection Consistency**

**Test ID:** SIG-API-011

**Input:** same invalid payload twice

**Expected:** same error\_code and field\_path both times

---

# **2\) Signal Ingestion Event Test Suite**

## **2.1 Valid Event Emission Shape**

**Test ID:** SIG-EVT-001

**Input:** SignalIngestedEvent with event\_type="signal.ingested" and valid embedded signal

**Expected:** accepted by consumer validator

## **2.2 Invalid event\_type**

**Test ID:** SIG-EVT-002

**Input:** event\_type="signal.created"

**Expected:** rejected, invalid\_event\_type, field\_path="event\_type"

## **2.3 Event embeds SignalEnvelope rules**

**Test ID:** SIG-EVT-003

**Input:** embedded signal.payload=\[\]

**Expected:** rejected, payload\_not\_object, field\_path="signal.payload"

---

# **3\) Signal Log Read Surface Test Suite (Internal)**

## **3.1 Query Valid Window**

**Test ID:** SIGLOG-001

**Input:** valid SignalLogReadRequest with from\_time\<=to\_time

**Expected:** response returns signals\[\] and optional next\_page\_token

## **3.2 Invalid Time Range**

**Test ID:** SIGLOG-002

**Input:** from\_time \> to\_time

**Expected:** rejected, invalid\_time\_range, field\_path="from\_time,to\_time"

## **3.3 Page Size Out of Range**

**Test ID:** SIGLOG-003

**Input:** page\_size=0

**Expected:** rejected, page\_size\_out\_of\_range, field\_path="page\_size"

## **3.4 Paging Determinism**

**Test ID:** SIGLOG-004

**Steps:**

1. Run same query twice

2. Compare first page outputs

    **Expected:** same sequence of signal\_ids and same next\_page\_token

## **3.5 Immutability Guarantee**

**Test ID:** SIGLOG-005

**Steps:**

1. Read a known signal record

2. Read again later

    **Expected:** record unchanged (no mutation)

---

# **4\) STATE Engine Test Suite (Internal Only)**

## **4.1 ApplySignals Happy Path**

**Test ID:** STATE-001

**Input:** ApplySignalsRequest with known signal\_ids

**Expected:** ApplySignalsResult with:

* new\_state\_version \>= prior\_state\_version

* applied\_signal\_ids equals input set (order preserved if required)

## **4.2 Unknown Signal ID**

**Test ID:** STATE-002

**Input:** includes signal\_ids=\["does\_not\_exist"\]

**Expected:** rejected, unknown\_signal\_id, field\_path="signal\_ids\[0\]"

## **4.3 Cross-Org Signal Leakage Block**

**Test ID:** STATE-003

**Input:** org\_id=A but signal\_id belongs to org B

**Expected:** rejected, signals\_not\_in\_org\_scope

## **4.4 State Object Must Be Object**

**Test ID:** STATE-004

**Input:** (simulate internal serialization) state=\[\]

**Expected:** rejected, state\_payload\_not\_object, field\_path="state"

## **4.5 Forbidden Semantic Keys in state (Nested)**

**Test ID:** STATE-005

**Input:** state contains { "x": { "course": "abc" } }

**Expected:** rejected, forbidden\_semantic\_key\_detected, field\_path="state.x.course"

## **4.6 Monotonic state\_version**

**Test ID:** STATE-006

**Steps:**

1. Apply signals, record new\_state\_version \= N

2. Apply additional new signals, record new\_state\_version \= M

    **Expected:** M \> N

## **4.7 ApplySignals Idempotency**

**Test ID:** STATE-007

**Steps:**

1. Apply same signal\_ids to same prior state\_version twice

    **Expected:** same resulting state\_id and new\_state\_version, or second returns stable duplicate behavior

## **4.8 Deterministic Conflict Resolution**

**Test ID:** STATE-008

**Steps:**

1. Two concurrent apply requests for same learner with overlapping signals

2. Execute in different order

    **Expected:** final state\_version and derived STATE are identical

---

# **5\) Decision Engine Test Suite (Internal)**

## **5.1 Evaluate Decision Happy Path**

**Test ID:** DEC-001

**Input:** EvaluateStateForDecisionRequest for existing (state\_id, state\_version)

**Expected:** valid Decision

## **5.2 Closed Decision Type Enforcement**

**Test ID:** DEC-002

**Input:** decision object with decision\_type="promote"

**Expected:** rejected, invalid\_decision\_type, field\_path="decision\_type"

## **5.3 decision\_context Must Be Object**

**Test ID:** DEC-003

**Input:** decision\_context=\[\]

**Expected:** rejected, decision\_context\_not\_object, field\_path="decision\_context"

## **5.4 Forbidden Semantic Keys in decision\_context**

**Test ID:** DEC-004

**Input:** decision\_context={"task":{"assignee":"bob"}}

**Expected:** rejected, forbidden\_semantic\_key\_detected, field\_path="decision\_context.task"

## **5.5 Trace Required**

**Test ID:** DEC-005

**Input:** omit trace

**Expected:** rejected, missing\_trace, field\_path="trace"

## **5.6 Deterministic Decision Output**

**Test ID:** DEC-006

**Steps:**

1. Evaluate same (state\_id, state\_version) twice

    **Expected:** identical decision\_type and semantically equivalent decision\_context

## **5.7 Trace-State Mismatch**

**Test ID:** DEC-007

**Input:** decision trace references different state\_version than request

**Expected:** rejected, trace\_state\_mismatch

---

# **6\) Output Interfaces Test Suite (External)**

## **6.1 GetDecisions Happy Path**

**Test ID:** OUT-API-001

**Input:** valid GetDecisionsRequest

**Expected:** returns GetDecisionsResponse with decisions\[\] of valid Decision

## **6.2 Invalid Time Range**

**Test ID:** OUT-API-002

**Input:** from\_time \> to\_time

**Expected:** rejected, invalid\_time\_range

## **6.3 Paging Determinism**

**Test ID:** OUT-API-003

**Steps:** same query \+ page\_token twice

**Expected:** identical decision\_id sequence

## **6.4 DecisionEmittedEvent Shape**

**Test ID:** OUT-EVT-001

**Input:** event with event\_type="decision.emitted" and valid decision

**Expected:** accepted

## **6.5 Invalid event\_type**

**Test ID:** OUT-EVT-002

**Input:** event\_type="decision.sent"

**Expected:** rejected, invalid\_event\_type

## **6.6 Decision Emission Idempotency**

**Test ID:** OUT-EVT-003

**Steps:**

1. Emit event with decision\_id=D1

2. Emit again with same decision\_id but different payload

    **Expected:** rejected or hard-failed as non-deterministic emission

---

# **7\) PRD Alignment Guardrail Tests (Meta)**

## **7.1 No UI Leakage Test**

**Test ID:** META-001

**Input:** any interface payload contains screen, route, ui anywhere

**Expected:** rejected, forbidden\_semantic\_key\_detected

## **7.2 No Workflow Ownership Test**

**Test ID:** META-002

**Input:** any payload/context contains workflow, task, assignee anywhere

**Expected:** rejected, forbidden\_semantic\_key\_detected

## **7.3 No Domain Semantics Test**

**Test ID:** META-003

**Input:** any payload/context contains course, lesson, module, quiz, grade anywhere

**Expected:** rejected, forbidden\_semantic\_key\_detected

## **7.4 State Authority Test**

**Test ID:** META-004

**Assertion:** There is no external contract to set or override STATE

**Expected:** build-time failure if such an endpoint exists

---

## **Deliverable Notes**

* This matrix is intended to be implemented as automated tests at:

  * API boundary tests (Signal Ingestion \+ Output API)

  * Event consumer contract tests (Signal/Decision events)

  * Internal contract tests (Signal Log read, ApplySignals, EvaluateDecision)

This preserves doctrine: 8P3P remains API-first, STATE-authoritative, deterministic, and free of UI/workflow/domain drift.

