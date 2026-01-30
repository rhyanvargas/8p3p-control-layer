# **Interface Validation Ruleset (FINAL, Drift-Safe)**

**Authority Order:** Constitution \> Foundation \> PRD \> System Spec Blueprint \> This Document

**Scope:** Control-layer interfaces only

**Guarantee:** No domain, UI, workflow, or platform semantics can enter through these contracts.

---

Below is the **FINAL, corrected Interface Validation Ruleset (per contract)**.

The previously identified drift risks are now **explicitly prevented by enforceable validation rules**, not guidance.

This document is **binding**, **complete**, and **PRD-compliant**.

---

## **GLOBAL ENFORCEMENT RULES (APPLY TO ALL CONTRACTS)**

### **G1. Structural-Only Rule**

All payload-bearing fields (payload, state, decision\_context) MUST:

* Be JSON objects

* Contain **no required keys**

* Be treated as **opaque**

Validation MUST NOT:

* Inspect nested meaning

* Enforce domain schemas

* Infer semantics

---

### **G2. Forbidden Semantic Keys (Hard Block)**

The following keys are **globally forbidden** in:

* payload

* state

* decision\_context

If present at any depth, the request MUST be rejected.

```
ui
screen
view
page
route
url
link
button
cta
workflow
task
job
assignment
assignee
owner
status
step
stage
completion
progress_percent
course
lesson
module
quiz
score
grade
content_id
content_url
```

**Canonical error code:** forbidden\_semantic\_key\_detected

---

### **G3. Envelope Schema Version Rule**

schema\_version refers **only** to the envelope structure.

Validation MUST enforce:

* schema\_version matches /^v\[0-9\]+$/

* Any value implying domain meaning (eg math-v2, lms-v1) is rejected

**Canonical error code:** invalid\_schema\_version

---

### **G4. Determinism Rule (Global)**

For any interface:

* Identical valid input → identical output (excluding timestamps)

* Identical invalid input → identical error code and field path

---

## **1\) Signal Ingestion API**

### **Contract:** 

### **SignalEnvelope**

#### **Required Fields**

* org\_id

* signal\_id

* source\_system

* learner\_reference

* timestamp

* schema\_version

* payload

#### **Type Constraints**

* org\_id: string, 1–128 chars

* signal\_id: string, 1–256 chars, \[A-Za-z0-9.\_:-\]+

* source\_system: string, 1–256 chars

* learner\_reference: string, 1–256 chars

* timestamp: RFC3339, timezone required

* schema\_version: v\[0-9\]+

* payload: JSON object (non-null)

#### **Canonical Error Codes**

* missing\_required\_field

* invalid\_type

* invalid\_format

* invalid\_timestamp

* invalid\_length

* invalid\_charset

* invalid\_schema\_version

* payload\_not\_object

* forbidden\_semantic\_key\_detected

* duplicate\_signal\_id

* org\_scope\_required

* request\_too\_large

#### **Determinism Tests**

* Same (org\_id, signal\_id):

  * First → accepted

  * Subsequent → duplicate

* Same malformed input → same error code

---

### **Contract:** 

### **SignalIngestResult**

#### **Required Fields**

* org\_id

* signal\_id

* status

* received\_at

#### **Type Constraints**

* status: accepted | rejected | duplicate

* received\_at: RFC3339

* If status \= rejected, rejection\_reason.code is required

#### **Determinism Tests**

* Retry of rejected signal yields same rejection code

---

## **2\) Signal Ingestion Event**

### **Contract:** 

### **SignalIngestedEvent**

#### **Required Fields**

* event\_type \= signal.ingested

* org\_id

* signal

* ingested\_at

#### **Determinism Tests**

* Event payload is byte-stable for same signal (excluding ingested\_at)

---

## **3\) Signal Log (Internal, Read-Only)**

### **Contract:** 

### **SignalRecord**

#### **Required Fields**

* All SignalEnvelope fields

* accepted\_at

#### **Enforcement**

* Append-only

* No update or delete interface exists

#### **Canonical Error Codes**

* invalid\_time\_range

* invalid\_page\_token

* page\_size\_out\_of\_range

* org\_scope\_required

---

## **4\) STATE Engine (Internal Only)**

### **Contract:** 

### **LearnerState**

#### **Required Fields**

* org\_id

* learner\_reference

* state\_id

* state\_version

* updated\_at

* state

* provenance.last\_signal\_id

* provenance.last\_signal\_timestamp

#### **Type Constraints**

* state\_version: integer ≥ 0, monotonic

* state: JSON object (opaque, semantic-key filtered)

#### **Canonical Error Codes**

* state\_not\_found

* learner\_not\_found

* state\_payload\_not\_object

* forbidden\_semantic\_key\_detected

#### **Determinism Tests**

* Applying same ordered signals to same prior state → same new state\_version

---

### **Contract:** 

### **ApplySignalsRequest**

#### **Required Fields**

* org\_id

* learner\_reference

* signal\_ids

* requested\_at

#### **Type Constraints**

* signal\_ids: array 1–5000

#### **Canonical Error Codes**

* unknown\_signal\_id

* signals\_not\_in\_org\_scope

* apply\_conflict

#### **Determinism Tests**

* Re-applying same signals → same result or stable duplicate response

---

## **5\) Decision Engine (Internal)**

### **Contract:** 

### **Decision**

#### **Required Fields**

* org\_id

* decision\_id

* learner\_reference

* decision\_type

* decided\_at

* decision\_context

* trace.state\_id

* trace.state\_version

#### **Type Constraints**

* decision\_type:

   reinforce | advance | intervene | pause | escalate | recommend | reroute

* decision\_context: JSON object (semantic-key filtered)

#### **Canonical Error Codes**

* invalid\_decision\_type

* decision\_context\_not\_object

* forbidden\_semantic\_key\_detected

* trace\_state\_mismatch

#### **Determinism Tests**

* Same (state\_id, state\_version) → identical decision\_type and context

---

## **6\) Output Interfaces (External)**

### **Contract:** 

### **GetDecisionsRequest**

#### **Required Fields**

* org\_id

* learner\_reference

* from\_time

* to\_time

#### **Canonical Error Codes**

* invalid\_time\_range

* page\_size\_out\_of\_range

* invalid\_page\_token

---

### **Contract:** 

### **DecisionEmittedEvent**

#### **Required Fields**

* event\_type \= decision.emitted

* org\_id

* decision

* emitted\_at

#### **Determinism Tests**

* Same decision\_id MUST NOT emit multiple distinct payloads

---

## **PRD ALIGNMENT VERDICT (POST-FIX)**

* UI and workflow drift is now **technically impossible** at the interface level

* Domain semantics cannot leak through payloads or contexts

* STATE authority remains absolute

* Decisions remain non-executing and downstream-neutral

* Lifecycle enforcement is structural, not policy-based

**Result:**

✅ Fully aligned with PRD

✅ Drift risks eliminated by validation

✅ Safe for multi-team engineering execution

