# MASTER PROJECT SPEC --- AI-Powered Refund Management Platform

> **Instruction to Antigravity:** Build the working application
> described below. This is a real, end-to-end functional software
> prototype, not a static UI mockup. Use synthetic/demo data only. Do
> not claim that real money has been refunded.

## 1. Product vision

Build a dynamic AI-assisted refund management platform for ecommerce
brands. A demo operator can create or select a fictional brand, add
fictional products, generate synthetic refund requests, inspect each
request and its history, and run an AI-powered decision workflow.

For the first demo dataset, each selected product must have: - 10
synthetic legitimate refund requests. - 10 synthetic
suspicious/non-legitimate refund requests. - A varied mix of reasons,
order histories, customer histories, evidence, timelines, and risk
signals.

When the operator clicks **Process refunds**, the backend processes the
selected batch request by request. The configured **Jev** decision API
is the primary AI decision provider. The system records each decision,
rationale, confidence (if supplied), evidence considered, processing
status, and audit events. At the end, show a batch report with approved,
rejected, and review-required counts.

The platform must be designed so a future version can focus on a
specific industry/category and connect to real ecommerce/payment
systems. For this version, all brands, products, orders, customers,
refund histories, and outcomes are synthetic.

## 2. Non-negotiable product rules

1.  **Build a working full-stack application.** Every visible action
    must work and persist data. Do not create dead buttons, fake charts,
    placeholder flows, or UI-only interactions.
2.  **Synthetic data only.** Clearly label the environment
    `DEMO / SIMULATED`. Never contact a real payment gateway or issue a
    real refund.
3.  **Jev first.** Integrate the Jev API as the primary decision
    provider using its official documentation, SDK, or API details
    available in the project/environment. Do not invent endpoints,
    request schemas, model names, or authentication formats.
4.  If Jev's API details are not available, create a clean provider
    adapter and a working deterministic local demo provider so the
    application remains testable. Show a clear provider status such as
    `Jev not configured — using Demo Decision Engine`. Do not silently
    pretend the local provider is Jev.
5.  Keep all API keys server-side. Never expose secrets in browser
    bundles, client components, logs, screenshots, or API responses.
6.  Never let an LLM directly execute arbitrary actions or modify
    financial records. The backend validates and applies the final
    allowed state transition.
7.  Use an explainable decision schema. Persist the input evidence
    snapshot, provider/model, raw response (with secrets removed),
    normalized decision, rationale, and timestamps.
8.  Support the three outcomes: `APPROVE`, `REJECT`, and
    `MANUAL_REVIEW`. A high-risk or ambiguous case should be routed to
    manual review rather than forced into approve/reject.
9.  Make processing idempotent. Repeated clicks or retries must not
    create duplicate refund transactions or duplicate decisions.
10. Include loading, empty, error, retry, and success states. Never
    leave the user guessing whether a batch is still processing.
11. Add tests for core rules, API validation, provider fallback, and
    batch processing.
12. Keep the code modular and production-minded: typed models,
    validation, clear service boundaries, migrations/seed scripts,
    environment configuration, and useful documentation.

## 3. User roles and core workflow

For the prototype, implement one authenticated demo/admin role (or a
clearly isolated demo login if authentication is part of the selected
stack).

Primary workflow:

1.  Open the dashboard.
2.  Create/select a fictional brand.
3.  Add/select fictional products.
4.  Generate synthetic refund requests for a product or brand.
5.  View the 20-request dataset, with 10 labelled as legitimate ground
    truth and 10 as non-legitimate ground truth.
6.  Inspect a request's customer/order/refund history and evidence.
7.  Select requests or process the full batch.
8.  Click **Process refunds**.
9.  Backend calls Jev through the provider adapter for each request (or
    a documented batch API if Jev officially supports it).
10. Backend validates and normalizes each response, applies simulated
    state transitions, and writes audit events.
11. Show a final batch report and per-request decisions.
12. Allow the operator to export the report as CSV.

The ground-truth label is for demo evaluation only. **Do not send the
label to Jev as an input feature.** The AI must decide from the
evidence, not from the answer key.

## 4. Main application modules and screens

### A. Dashboard

Show live values derived from persisted database records: - Total brands
and products. - Total refund requests. - Pending / processing /
processed requests. - Approved, rejected, and manual-review counts. -
Approval and rejection rates. - Estimated simulated refund value
approved and rejected. - Recent processing batches. - Decision accuracy
against synthetic ground truth, clearly marked as a demo evaluation
metric.

Charts must use real database queries, not hardcoded numbers. Include
filters by brand, product, date range, and batch.

### B. Brands

-   Create, edit, view, and archive fictional brands.
-   Fields: brand name, description, industry/category, website
    (optional fictional URL), currency, created date.
-   Seed several examples such as a clothing brand, electronics brand,
    footwear brand, and home/lifestyle brand.
-   Prevent accidental duplicate brand names where appropriate.

### C. Products

-   CRUD products under a brand.
-   Fields: name, SKU, category, description, unit price, currency,
    active status, image URL (optional; use safe placeholders if no
    image service).
-   Product detail view shows product-level refund metrics and request
    history.
-   Do not require a real ecommerce integration.

### D. Synthetic data generator

Create a clear generator UI: - Choose brand and product. - Choose
request count (default 20). - Default balanced mode: 10 legitimate + 10
non-legitimate. - Optional custom split for later experiments. - Choose
a random seed so a generated dataset can be reproduced. - Generate
realistic, varied records with unique IDs and timestamps. - Show a
preview before saving. - Prevent duplicate generation on accidental
double-click; provide a generation/batch ID.

Each request should include realistic fields: - Request ID, order ID,
customer ID. - Brand, product, SKU, quantity, unit price, requested
refund amount and currency. - Purchase date, delivery date, refund
request date. - Refund reason and customer message. - Order status and
fulfilment/delivery status. - Customer account age and prior order
count. - Prior refund count, prior return count, prior chargeback count
(synthetic). - Previous refund outcomes and dates. - Evidence submitted:
images/document metadata or evidence descriptions; do not fabricate
actual uploaded proof files. - Tracking/delivery signals and event
timeline. - Ground-truth label (`LEGITIMATE` or `NON_LEGITIMATE`) stored
separately from the decision input. - Processing state (`PENDING`,
`PROCESSING`, `APPROVED`, `REJECTED`, `MANUAL_REVIEW`, `FAILED`).

Use diverse scenarios, not simplistic patterns. Examples: - Legitimate:
damaged item reported promptly with evidence; wrong item delivered;
package marked delivered but customer reports non-receipt with
consistent history; duplicate charge; item materially different from
description; missing item in a multi-item order. - Non-legitimate:
repeated refund claims for the same order; request outside policy
window; evidence metadata inconsistent with the order; item reported as
not received despite strong delivery evidence and repeated contradictory
claims; suspicious repeated account/refund patterns. - Ambiguous:
conflicting carrier data, insufficient evidence, unusual but explainable
customer history. These should often become `MANUAL_REVIEW`.

Do not make protected characteristics, names, addresses, gender, race,
religion, disability, or other sensitive traits a fraud signal. Use
fictional IDs and non-identifying synthetic names only if needed.

### E. Refund requests inbox

-   Search and filter by brand, product, status, reason, date, risk
    band, batch, and ground-truth label (ground-truth filter should be
    hidden from the AI decision workflow and used only for demo
    analysis).
-   Table columns: request ID, product, requested amount, reason,
    request date, status, AI decision, risk band, and actions.
-   Pagination and sorting.
-   Bulk select and process.
-   Detail drawer/page with order summary, customer history, timeline,
    evidence, decision rationale, and audit history.
-   Ground-truth label must be visually separated from the AI decision
    to avoid confusion.

### F. AI decision center

For each request, send a structured evidence packet to Jev containing
only the information required to assess the refund. The
prompt/instructions must request a constrained JSON response with: -
`decision`: `APPROVE | REJECT | MANUAL_REVIEW` - `risk_score`: number
from 0 to 100, if supported - `confidence`: number from 0 to 1, if
supported - `reason_codes`: array of stable machine-readable codes -
`rationale`: concise human-readable explanation - `evidence_for`: array
of evidence items supporting the decision - `evidence_against`: array of
conflicting or weakening evidence - `missing_information`: array -
`policy_checks`: array of `{ rule, result, explanation }` -
`recommended_next_action`: string

Treat this schema as the application's normalized internal contract. Map
the actual Jev response into it. If Jev cannot provide one of the
optional fields, derive only safe defaults or leave it null; do not
fabricate model confidence.

Decision guidance: - Approve when the evidence and configured demo
policy support a legitimate refund. - Reject only when there is a clear
policy violation or strong contradictory evidence. - Use manual review
when evidence is incomplete, conflicting, or risk is uncertain. - Do not
use the ground-truth label in the model prompt. - Avoid presenting the
model as infallible. Show rationale and evidence, not just a score.

Implement a versioned demo refund policy that is visible in the UI and
passed to the decision provider. Example configurable rules: - Refund
request within the policy window. - Order/payment exists and matches the
product and amount. - Delivery/fulfilment status considered. - Duplicate
refund check. - Prior refund/return pattern is a contextual signal, not
automatic proof of fraud. - Evidence consistency. - High-value or
ambiguous requests route to manual review. Make policy thresholds
configurable in Settings and record the policy version used for every
decision.

### G. Processing orchestration

The **Process refunds** action must call a real backend endpoint and
start a tracked batch job.

Backend responsibilities: 1. Validate selected request IDs and current
states. 2. Create a processing batch with a unique ID. 3. Lock or
atomically claim eligible requests to prevent concurrent processing. 4.
Build a sanitized evidence packet for each request. 5. Call the
configured decision provider with timeout and bounded retries. 6.
Validate the response against the normalized schema. 7. Apply policy
guardrails and map to a permitted state transition. 8. Persist decision,
rationale, risk details, provider metadata, and evidence snapshot. 9.
For `APPROVE`, create a **simulated refund transaction** and mark it
`SIMULATED_COMPLETED`. 10. For `REJECT`, record the rejection and
reason; do not create a refund transaction. 11. For `MANUAL_REVIEW`,
leave the refund unexecuted and create a review task. 12. For provider
or validation failure, mark the request `FAILED` or leave it retryable
with a clear error; never auto-approve on failure. 13. Update batch
progress and completion summary. 14. Emit audit events for every
meaningful state transition.

Use a queue/background worker if the chosen stack supports it. For a
small local prototype, a robust server-side async job with persisted
progress is acceptable. The frontend should poll or subscribe to batch
status and show progress (`processed / total`) with per-request
outcomes. Support safe retry of failed items only.

**Important:** There is no real payment processor in this version. The
simulated transaction is an internal demo record only.

### H. Batch report

At completion show: - Total requests processed. - Approved count and
percentage. - Rejected count and percentage. - Manual-review count. -
Failed count. - Total simulated amount approved. - Total amount rejected
(informational only). - Processing duration. - Provider used (Jev or
local demo fallback). - Policy version. - Confusion matrix against
synthetic ground truth: true positives/negatives, false
positives/negatives, and manual-review count. Define the positive class
clearly (for example, "legitimate request approved"). - Precision,
recall, F1, and accuracy where mathematically meaningful; explain that
these are results on synthetic data and not real-world performance. -
Per-request decision table with rationale and ground-truth label. -
Download CSV report.

Do not hide false approvals or false rejections. Make mistakes visible
so the demo demonstrates evaluation, not just a perfect-looking AI.

### I. Settings / integrations

-   Provider selection: Jev (primary) / Local Demo Engine (fallback).
-   Jev connection status and a safe server-side connection test.
-   Model/deployment identifier only if required by official Jev docs.
-   Decision timeout, retry count, and concurrency settings.
-   Refund policy editor and versioning.
-   Demo data reset action with explicit confirmation.
-   Environment/status indicator.
-   Never render the API key back to the browser after saving.

## 5. Suggested architecture

Use the existing repository's framework and conventions if a project
already exists. First inspect the entire repository, identify the
current stack, scripts, and existing components, and preserve useful
work. Do not overwrite working code blindly.

If starting from an empty repository, use a maintainable
TypeScript-first full-stack architecture: - Frontend: Next.js App
Router, TypeScript, Tailwind CSS, shadcn/ui (or equivalent accessible
component system). - Backend: Next.js route handlers/server actions or a
separate API service, depending on project structure. - Database:
PostgreSQL with Prisma ORM; SQLite is acceptable for a local-only first
run if it materially simplifies setup, but keep the schema portable. -
Validation: Zod or equivalent. - Charts: Recharts or equivalent. -
Tests: Vitest/Jest plus API/integration tests. - Background processing:
persisted batch jobs; use a queue only if justified by the
repository/runtime.

Suggested separation: - `brands` and `products` domain services. -
`refund-requests` domain service. - `synthetic-data` generator. -
`decision-providers/jev` adapter. - `decision-providers/local-demo`
adapter. - `decision-engine` orchestration service. - `refund-policy`
rules/guardrails. - `batch-processing` service/worker. - `reporting` and
metrics service. - `audit-log` service.

Suggested provider interface:

``` ts
type DecisionInput = {
  request: RefundEvidencePacket;
  policy: RefundPolicySnapshot;
};

type NormalizedDecision = {
  decision: "APPROVE" | "REJECT" | "MANUAL_REVIEW";
  riskScore?: number | null;
  confidence?: number | null;
  reasonCodes: string[];
  rationale: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingInformation: string[];
  policyChecks: Array<{
    rule: string;
    result: "PASS" | "FAIL" | "UNKNOWN";
    explanation: string;
  }>;
  recommendedNextAction?: string;
};

interface RefundDecisionProvider {
  getProviderName(): string;
  checkConnection(): Promise<{ connected: boolean; message: string }>;
  decide(input: DecisionInput): Promise<NormalizedDecision>;
}
```

Implement `JevDecisionProvider` only using verified official Jev API
documentation or SDK details available to the project. Isolate all
Jev-specific request/response mapping inside this adapter. Implement
`LocalDemoDecisionProvider` as a clearly labelled fallback for
development/testing. The fallback should use deterministic, documented
rules and synthetic evidence, not random outcomes.

## 6. Data model

Create a relational schema with at least:

-   `Brand`: id, name, description, category, currency, status,
    createdAt, updatedAt.
-   `Product`: id, brandId, name, sku, category, description, unitPrice,
    currency, status, createdAt, updatedAt.
-   `Customer`: id, syntheticCustomerRef, accountCreatedAt, totalOrders,
    priorRefundCount, priorReturnCount, priorChargebackCount, createdAt.
-   `Order`: id, orderRef, customerId, brandId, productId, quantity,
    amount, currency, purchasedAt, deliveredAt, fulfilmentStatus,
    deliveryEvidence, createdAt.
-   `RefundRequest`: id, requestRef, orderId, customerId, productId,
    reason, customerMessage, requestedAmount, currency, requestedAt,
    evidence, groundTruthLabel, status, batchId, createdAt, updatedAt.
-   `Decision`: id, refundRequestId, provider, modelOrDeployment,
    policyVersion, decision, riskScore, confidence, reasonCodes,
    rationale, evidenceFor, evidenceAgainst, missingInformation,
    policyChecks, inputSnapshot, providerResponseSanitized, createdAt.
-   `RefundTransaction`: id, refundRequestId, amount, currency, status
    (`SIMULATED_COMPLETED` only in this prototype), reference,
    createdAt.
-   `ProcessingBatch`: id, brandId, productId (nullable), status,
    totalCount, processedCount, approvedCount, rejectedCount,
    manualReviewCount, failedCount, provider, startedAt, completedAt,
    createdAt.
-   `AuditEvent`: id, entityType, entityId, eventType, actor, details,
    createdAt.
-   `RefundPolicy`: id, version, configuration, active, createdAt.

Use appropriate foreign keys, indexes, uniqueness constraints, decimal
money types, and timestamps. Store money as decimal/integer minor units
consistently; never use floating-point arithmetic for monetary
calculations.

Ground-truth labels must be stored separately from the evidence packet
and excluded from all Jev/local decision inputs.

## 7. API surface

Design REST endpoints or equivalent server actions with validation and
consistent error responses. Minimum capabilities:

-   `GET/POST /api/brands`
-   `GET/PATCH/DELETE /api/brands/:id`
-   `GET/POST /api/products`
-   `GET/PATCH/DELETE /api/products/:id`
-   `POST /api/demo/generate-refunds`
-   `GET /api/refund-requests`
-   `GET /api/refund-requests/:id`
-   `POST /api/refund-requests/process`
-   `GET /api/batches/:id`
-   `POST /api/batches/:id/retry-failed`
-   `GET /api/batches/:id/report`
-   `GET /api/dashboard/metrics`
-   `GET/PATCH /api/settings/provider`
-   `POST /api/settings/provider/test`
-   `GET/PATCH /api/settings/refund-policy`
-   `GET /api/audit-events`
-   `POST /api/demo/reset`

Validate all input on the server. Enforce allowed state transitions.
Return meaningful HTTP status codes. Add pagination to list endpoints.

## 8. UI/UX direction

Create a polished SaaS operations console, not a generic landing-page
template: - Professional, clean, high-information-density layout. - Left
sidebar navigation: Overview, Brands, Products, Refund Requests,
Processing Batches, Reports, Settings. - Top bar: current
workspace/brand selector, provider status, `DEMO MODE` badge, user
menu. - Clear hierarchy, readable tables, accessible contrast,
responsive desktop/tablet/mobile behavior. - Use status badges
consistently: Pending, Processing, Approved, Rejected, Manual Review,
Failed. - Use skeleton loaders, toasts, confirmation dialogs, empty
states, and error boundaries. - On request detail, make the evidence
timeline and decision explanation easy to understand. - Do not overuse
gradients, oversized hero sections, or decorative animations. Prioritize
operational clarity.

## 9. Security and reliability

-   Keep Jev API credentials in server-only environment variables or a
    server-side encrypted settings store.
-   Provide `.env.example` with names/placeholders only; never commit
    actual keys.
-   Redact authorization headers and secrets from logs and persisted
    provider responses.
-   Apply request validation, rate limits where appropriate, and safe
    error messages.
-   Prevent duplicate processing with database transactions/unique
    constraints/idempotency keys.
-   Add provider timeouts, bounded retries with backoff, and clear
    failure states.
-   Do not retry a completed decision or simulated refund unless
    explicitly requested through a safe retry path.
-   Add audit records for creation, generation, processing, decisions,
    simulated transactions, retries, policy changes, and resets.
-   Do not use sensitive personal characteristics as decision features.
-   Make the synthetic nature of all data obvious in the UI and exported
    reports.

## 10. Demo seed data

On first setup, seed: - 4 fictional brands across different
categories. - At least 3 fictional products per brand. - A demo refund
policy with a visible version. - Optionally one sample 20-request batch
for a selected product, or provide a one-click generator to create it.

Use fictional brand/product names. Do not copy real customer data. The
generator must be able to create exactly 10 legitimate and 10
non-legitimate requests for a selected product on demand.

## 11. Testing and acceptance criteria

The build is not complete until all the following work:

### Setup

-   A new developer can install dependencies, configure environment
    variables, run migrations, seed data, and start the app using
    documented commands.
-   `.env.example` exists.
-   Jev integration instructions identify the exact required environment
    variables and official API configuration.

### Functional flow

-   Create a brand and product.
-   Generate exactly 20 synthetic requests with a 10/10 ground-truth
    split.
-   Confirm ground truth is not present in the decision input sent to
    the provider.
-   Open a request and inspect its evidence/history.
-   Process the batch from the UI.
-   See live/persisted progress and final outcomes.
-   Verify each approved request has exactly one simulated refund
    transaction.
-   Verify rejected and manual-review requests have no simulated refund
    transaction.
-   Verify failed requests are not silently approved.
-   Refresh the browser and confirm all data and batch status persist.
-   Retry only failed items safely.
-   Export a CSV report.
-   Verify dashboard metrics update from persisted data.

### Decision quality and safety

-   Jev provider is used when configured and successfully connected.
-   If Jev is not configured or unavailable, the UI explicitly shows the
    local demo fallback.
-   Provider output is schema-validated.
-   Malformed or uncertain outputs do not become automatic approvals.
-   Manual-review routing works.
-   Ground-truth metrics are calculated separately after decisions and
    never influence them.
-   The system exposes false positives and false negatives in the
    report.

### Engineering

-   No dead buttons or hardcoded dashboard metrics.
-   No API key in client-side code or logs.
-   No real payment/refund API calls.
-   Unit and integration tests pass.
-   No TypeScript/lint/build errors.
-   Include a concise README with architecture, setup, environment
    variables, data flow, Jev adapter details, fallback behavior, and
    known limitations.

## 12. Implementation plan for Antigravity

Work in phases and keep the app runnable after each phase:

**Phase 0 --- Repository audit** - Inspect repository, framework,
package manager, current routes, database, components, and environment
setup. - Report existing structure and implementation plan briefly. -
Preserve existing working code.

**Phase 1 --- Foundation** - Set up app shell, database
schema/migrations, seed script, validation, and environment
configuration. - Implement brands and products CRUD.

**Phase 2 --- Synthetic data** - Implement generator, balanced 10/10
dataset, request inbox, detail view, and ground-truth separation. - Add
tests proving labels are excluded from provider input.

**Phase 3 --- Decision providers** - Inspect the available Jev
documentation/configuration and implement the Jev adapter accurately. -
If details are missing, do not guess: implement the adapter interface
and local demo provider, document the exact missing Jev details, and
continue building. - Add provider connection test and response
validation.

**Phase 4 --- Processing workflow** - Implement persisted batches,
idempotent processing, simulated transactions, retries, audit events,
and progress polling. - Connect the UI's Process refunds button to the
real backend workflow.

**Phase 5 --- Reports and dashboard** - Implement live database metrics,
batch reports, confusion matrix, metrics, and CSV export.

**Phase 6 --- Quality pass** - Run migrations, seed, tests, lint,
typecheck, and production build. - Fix all errors. - Test the complete
user journey from brand creation to exported batch report. - Update
README and provide exact run instructions.

At the end of each phase, summarize what is implemented, what is tested,
and any blockers. Do not stop after generating a UI. Continue until the
end-to-end workflow works.

## 13. Final delivery checklist

When finished, provide: 1. Application architecture and key folders. 2.
Exact setup/run commands. 3. Required environment variables (names only;
never reveal values). 4. Jev integration status and the verified API/SDK
method used. 5. How to switch between Jev and the local demo provider.
6. How to create a brand/product and generate the 10+10 demo dataset. 7.
How to process refunds and view/export the report. 8. Tests run and
their results. 9. Known limitations and what would be required for a
real production integration.

**Start by auditing the repository, then implement the application. Do
not merely return another plan or a static mockup.**
