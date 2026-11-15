# REFUND OS
### AI-Powered Intelligent Refund Management & Decision Automation Platform

An enterprise-grade, end-to-end AI-assisted refund management platform engineered for ecommerce merchants. Designed to evaluate refund claims against versioned policy guardrails, photo and fulfillment evidence, customer order history, and delivery telemetry using **Laya API (System One)** structured decisions, backed by a deterministic local demo decision engine.

> **Environment Notice:** This platform operates strictly in `DEMO / SIMULATED` mode. Real money is never transferred and real payment processors are never contacted. All simulated transactions are internal demo records only.

---

## 1. Application Architecture

```
founderlabs/
├── prisma/
│   ├── schema.prisma            # Relational database schema (Brands, Products, Customers, Orders,
│   │                            #   RefundRequests, Decisions, RefundTransactions, Batches, Policies, AuditEvents)
│   └── seed.js                  # Seed script: 4 fictional brands, 12 products, v1.0 refund policy, Laya settings
├── src/
│   ├── app/                     # Next.js 14 App Router
│   │   ├── api/                 # REST API Surface (18 typed endpoints)
│   │   │   ├── brands/          # CRUD Brands
│   │   │   ├── products/        # CRUD Products
│   │   │   ├── demo/
│   │   │   │   ├── generate-refunds/  # Synthetic 10+10 dataset generator
│   │   │   │   └── reset/             # Demo environment reset
│   │   │   ├── refund-requests/       # Requests listing, inspector & batch processing
│   │   │   ├── batches/               # Processing batches, status & CSV reports
│   │   │   ├── dashboard/             # Live persisted metrics & confusion matrix
│   │   │   ├── settings/              # Provider config & policy versioning
│   │   │   └── audit-events/          # Immutable system audit trail
│   │   ├── brands/              # Brand management console
│   │   ├── products/            # Product catalog console
│   │   ├── generator/           # 10+10 balanced synthetic dataset generator UI
│   │   ├── requests/            # Refund requests inbox with detail drawer inspector
│   │   ├── batches/             # Background batch queue & telemetry
│   │   │   └── [id]/            # Comprehensive batch decision report & CSV export
│   │   ├── settings/            # Provider switcher, Laya connection test, policy editor
│   │   ├── audit/               # Chronological audit trail viewer
│   │   └── layout.tsx           # Operations console shell with sidebar & top bar
│   ├── components/
│   │   ├── navigation/          # Sidebar & TopBar components
│   │   └── providers/           # AppContext (global brand filter, toast notifications, provider status)
│   ├── services/
│   │   ├── decision-providers/  # Provider adapter layer
│   │   │   ├── laya-provider.ts       # Official Laya API System One adapter (Choice, Score, Noul)
│   │   │   ├── local-demo-provider.ts # Deterministic local decision engine
│   │   │   └── factory.ts             # Provider selector & graceful fallback
│   │   ├── decision-engine.ts         # Evidence packet builder & policy state transitions
│   │   ├── batch-processing-service.ts# Batch processor with idempotency & retry
│   │   ├── synthetic-data-service.ts  # Reproducible 10+10 scenario generator
│   │   ├── metrics-service.ts         # Live metrics & Ground Truth Confusion Matrix
│   │   └── csv-export-service.ts      # CSV batch report generator
│   └── types/                   # Strict TypeScript contracts & domain models
└── tests/
    ├── refund-platform.test.ts  # Unit tests for policy checks, rules, and ground-truth isolation
    └── e2e-workflow.test.ts     # Complete end-to-end integration test suite
```

---

## 2. Setup and Run Commands

### Prerequisites
- **Node.js**: v18.0.0 or higher (v24.x tested and verified)
- **npm**: v9.x or higher

### Step-by-Step Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Database & Apply Migrations**:
   ```bash
   npx prisma db push
   ```

3. **Seed Initial Demo Data**:
   ```bash
   node prisma/seed.js
   ```
   *Seeds 4 fictional brands (Aura Apparel, Volt Electronics, Stride Athletic, Haven Living), 12 products, standard policy v1.0, and Laya configuration.*

4. **Run Automated Test Suite**:
   ```bash
   npm run test
   ```
   *Runs all 9 Vitest unit and end-to-end tests.*

5. **Build Production Application**:
   ```bash
   npm run build
   ```

6. **Start the Platform**:
   - For local development with live reload:
     ```bash
     npm run dev
     ```
   - For production server:
     ```bash
     npm run start
     ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env`:

| Variable Name | Description | Default / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | SQLite database connection string | `file:./dev.db` |
| `LAYA_API_BASE_URL` | Official Laya API endpoint | `https://api.laya-ai.com` |
| `LAYA_API_KEY` | Your Laya API key (*kept server-side only; never committed to git*) | `sk_...` |
| `LAYA_MODEL` | Laya decision model identifier | `typed-decisions` |
| `DEFAULT_DECISION_PROVIDER` | Initial decision provider (`LAYA` or `LOCAL_DEMO`) | `LAYA` |

*Security Note: `LAYA_API_KEY` is strictly held server-side. It is never rendered to the browser, client components, logs, or API responses.*

---

## 4. Laya API Integration Status & Evaluation Model

- **Provider**: Laya API (System One).
- **Official Endpoint**: `POST https://api.laya-ai.com/v1/systemone`
- **Documentation**: [https://laya-ai.com/laya-api](https://laya-ai.com/laya-api)
- **Authentication**: `Authorization: Bearer <LAYA_API_KEY>`
- **Structured Evaluation**: Evaluates 6 key operational dimensions for every refund claim:
  1. **Refund legitimacy**: Evaluated via `legitimacy_probability` (`noul` primitive, 0.0 to 1.0).
  2. **Fraud risk**: Rated via `risk_score` (`score` primitive, 0 to 100).
  3. **Refund policy compliance**: Evaluated via `policy_compliance` (`noul` primitive).
  4. **Customer purchase history**: Account age, total orders, prior returns.
  5. **Previous refund history**: Prior chargebacks, refund frequencies, previous outcomes.
  6. **Delivery and order evidence**: Carrier tracking status, GPS doorstep verification, courier notes, photo metadata authenticity.
- **Categorical Decision**: Routed via `choice` primitive to `APPROVE`, `REJECT`, or `MANUAL_REVIEW`.
- **Graceful Fallback**: If `LAYA_API_KEY` is not configured or if Laya is unreachable, the system cleanly falls back to `LOCAL_DEMO` and displays `Laya not configured — using Demo Decision Engine` prominently in the UI. Local decisions are never falsely labeled as Laya decisions.

---

## 5. How to Switch Between Laya and Local Demo Provider

1. Open the **Settings & Policy** screen (`/settings`).
2. Under **AI Decision Provider Selection**, toggle between:
   - **Laya API Decision Engine (System One) [Primary]**: Live API calls to Laya.
   - **Local Demo Decision Engine (Deterministic Fallback)**: Fast, offline, deterministic rule-based evaluation.
3. When using Laya, enter your replacement `LAYA_API_KEY` and click **Test Laya Connection** to verify live connectivity and latency.
4. Click **Save Provider Settings**.

---

## 6. How to Generate the 10+10 Demo Dataset

1. Navigate to **Synthetic Generator** (`/generator`) in the sidebar.
2. Select a fictional brand (e.g., *Aura Apparel*) and product (e.g., *Merino Wool Crewneck*).
3. Ensure **Split Mode** is set to **10+10 Balanced** (10 Legitimate + 10 Non-Legitimate).
4. Specify an optional random seed for reproducibility (e.g. `refund-os-laya-seed`).
5. Click **Preview Records** to review the 10 legitimate and 10 non-legitimate scenarios.
6. Click **Generate & Persist Batch** to save the batch and automatically open the requests inbox.

---

## 7. How to Process Refunds and Export the Report

1. Go to **Refund Requests** (`/requests`).
2. Select individual requests or click the top-level checkbox to select the entire batch.
3. Click **Process Selected** (or use the Dashboard's **Process All Pending** button).
4. Monitor live processing in real time on the **Processing Batches** page (`/batches`).
5. Safety Guarantees Enforced:
   - For `APPROVE`, exactly one `SIMULATED_COMPLETED` refund transaction is created.
   - For `REJECT` and `MANUAL_REVIEW`, zero transactions are created.
   - Repeated clicks or retries are **strictly idempotent** and will not generate duplicate transactions.
6. Click **View Report** on the completed batch to open the **Batch Decision Report** (`/batches/[id]`).
7. Inspect the **Confusion Matrix** (True Positives, False Positives, True Negatives, False Negatives, Accuracy, Precision, Recall, F1 Score).
8. Click **Download CSV Report** to export the complete report with all rationales and ground-truth comparisons.

---

## 8. Verification & Test Results

All unit and end-to-end integration tests pass with 100% success rate:

```
 RUN  v2.1.9 C:/Users/mcsr8/Desktop/founderlabs

 ✓ tests/refund-platform.test.ts (8 tests)
   ✓ RULE: Ground-truth label must be strictly isolated from evidence packet
   ✓ RULE: Laya Provider response normalizer handles Choice, Score, and Noul primitives
   ✓ RULE: Local Demo Provider approves timely legitimate request with verified evidence
   ✓ RULE: Local Demo Provider rejects request exceeding policy window
   ✓ RULE: Local Demo Provider routes high-value request to MANUAL_REVIEW
   ✓ RULE: Provider Factory cleanly identifies active provider and preserves attribution
   ✓ RULE: Synthetic Data Generator generates balanced 10/10 split and respects seed
   ✓ RULE: Confusion Matrix correctly computes TP, FP, TN, FN and accuracy metrics
 ✓ tests/e2e-workflow.test.ts (1 test)
   ✓ Complete End-to-End Workflow & Safety Guarantees > Full E2E Flow: Seed -> 10+10 Generation -> Batch Processing -> Safety Rules -> Confusion Matrix -> CSV Export

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Duration  1.61s
```

---

## 9. Known Limitations & Production Roadmap

- **Simulated Payment Gateway**: In this prototype, approved refunds generate internal `SIMULATED_COMPLETED` records with unique references. A production deployment would replace this with webhooks connecting to Stripe, Adyen, or Shopify Payments.
- **Background Worker Queue**: Batch processing currently executes as a persisted server-side asynchronous task loop. For enterprise-scale production (10,000+ requests/min), handoff to BullMQ/Redis or Cloud Tasks is recommended.
- **Real File Uploads**: Evidence in this version uses synthetic document and image metadata (timestamps, EXIF flags, courier photos). Production would integrate an S3/GCS presigned upload bucket with automated computer vision verification.
