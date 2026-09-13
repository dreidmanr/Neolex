# Release 1 audit — Rules engine, report and PDF

**Module:** Rules engine, report and PDF
**Repository / revision reviewed:** `/home/ubuntu/Neolex`, `feat/lexy-release-1-pilot` at `0c7f80f`
**Audit mode:** read-only; no application code, JSON configuration, database schema, or runtime configuration was modified.
**Date:** 2026-09-12
**Author:** Manus AI

> **Decision constraint.** Human legal approval is deferred until all stages are complete. Every legal-core configuration, approved-phrase artifact, fixture, golden report, report schema, tariff, and credit-policy artifact remains `draft_pending_legal_approval`. Client-facing or runtime launch of the legal result is prohibited. This audit therefore distinguishes a technically buildable, disabled v2 path from a launchable product. It does **not** treat test execution, a passing JSON Schema, an AI review, or a draft wording as legal approval.

> **Legacy constraint.** Current legacy client routes are not to be removed in the implementation plan. They remain an accepted **compatibility risk**, not a security mitigation. The new v2 path must be owner-bound and protected. As long as token-bearer legacy routes remain reachable, the product cannot honestly claim complete Release 1 §31.3 acceptance or launch readiness.

## Conclusion

The Release 0 package provides a materially useful **draft specification** for a deterministic evaluator: 25 base risk rules, eight critical overrides, declarative JSON AST predicates, evidence derivation, escalation-queue aggregation, exactly-one recommendation logic, 15 hashed fixtures, and a detailed immutable-report JSON Schema. The Release 0 validator passes its structural checks. The specification is not connected to runtime and all legal material remains draft. [1] [2]

The current paid implementation is a legacy, token-bearer and LLM-driven flow. It is not a partial implementation of the required Release 1 protected vertical slice. `paidRouter` exposes reads, writes, completion, payment confirmation, documents, reports, and an administrative list through `publicProcedure` using `sessionToken`; its completion path scores a client payload and calls `invokeLLM`. The PDF HTTP route accepts the token in the URL, re-reads mutable storage, generates a fresh date, and does not use a saved Report DTO snapshot. These are direct blockers for the protected v2 path and for web/PDF parity. [3] [4] [5]

The correct next step is **not** to wire the draft legal bundle into the present paid route. Build the v2 evaluator, snapshot, authorization, outbox, test transport, and renderers behind a disabled release flag and exercise them only through automated tests and internal non-client test environments. The production/provider email integration, document-analysis path, payment provider/webhook, automated credit redemption, and LLM participation remain excluded.

## Scope, evidence, and validation baseline

The review covered the supplied rules, recommendation mapping, report schema, fixture manifest and fixtures, paid tRPC routes, persistence layer, PDF generator/routes, existing tests, Release 0 architecture, access matrix, migration plan, payment model, and the supplied TЗ v3 source. A comparison with `feat/lexy-release-0-architecture` found no committed changes in the scoped runtime/legal-core/PDF files on the reviewed branch; the branch currently points to the same reviewed Release 0 architecture commit. This report is the only requested audit artifact.

| Check | Result | Meaning and limit |
|---|---:|---|
| `python3 tools/validate-release-0.py` | PASS | 63 questions; 33 Pilot core + 6 branches; 25 risks/risk rules; 35 legal bases; 15 fixtures; six schemas; three golden reports. This is structural validation, not legal approval or runtime coverage. [1] |
| Fixture-manifest SHA-256 values | PASS | All 15 fixture files matched their recorded manifest hashes. The fixtures remain draft test oracles. [6] |
| `pnpm test` | PASS, 21 tests | Only three legacy test files run: logout, free diagnostic router, and eight-question free scoring. There is no paid-router, evaluator, report-snapshot, entitlement, email, PDF, authorization-negative, fixture-run, or e2e coverage. [7] |
| `pnpm check` | PASS | Type checking passes for current code. It is not behavioral, security, parity, or legal-core validation. |
| `server/pdfGenerator.test.ts` | **Absent** | The path supplied for review does not exist on this branch; no dedicated PDF test is present. |

## Compliance position against TЗ v3 §§30.3 and 31.3

Section 30.3 requires one protected vertical path: client server session, `customerAccountId`-bound v2 diagnostic, server promo grant, deterministic engine with critical overrides, escalation, snapshot web report, PDF from the same snapshot, exactly one recommendation, a 6,900 RUB credit calculation/display, and an email adapter with test transport. It explicitly excludes a production email provider, document automation, payment provider/webhooks, and LLM risk-block personalization. [8]

| Requirement | Current evidence | Audit status | Required Release 1 build state under the decision constraint |
|---|---|---|---|
| Owner-bound client session and v2 case | `paid_sessions` has no `customerAccountId`; token lookup is the access mechanism. | **P0 gap** | New `customer_accounts` / authenticated server session / `diagnostic_cases` path; feature-disabled and test-only until legal/go-live gates permit use. [3] [9] |
| No access by knowing `sessionToken` | Paid tRPC and both PDF endpoints use a supplied token as effective credential. | **P0 gap** | v2 must use cookie/session context plus owner join before any resource read. Retain legacy endpoints, but label and meter them as compatibility risk. [3] [4] |
| Server promo → `payment_record=promo_granted` | `confirmPayment` is public and directly marks payment as paid; payment fields live in the session. | **P0 gap** | Separate immutable payment record, tariff/price snapshot, promo campaign ID, `chargedAmountRub=0`, and idempotent access grant. No PSP/provider in R1. [3] [10] |
| Deterministic 20–30 risk engine and overrides | The JSON contract exists; runtime calls legacy `scorePaidDiagnostic`, not `rules_v1`. | **Gap** | Implement the AST evaluator and bundle validator; LLM cannot be an input, fallback, or formatter of legal content. [2] [3] |
| Critical/manual escalation | Rules/schema define it, but no queue/escalation transaction is implemented. | **Gap** | Create immutable escalation request/outbox event; use `required_not_routed` until a real queue event. No fictional assignee, SLA, or queue event. [2] [11] |
| Immutable report snapshot | Draft schema is comprehensive; `paid_reports` is one mutable row per session with markdown and no version, checksum, source bundle, or snapshot state. | **P0 gap** | Persist versioned `report_snapshots`; validate before a single committed write; never modify `ready` content. [5] [12] |
| Web/PDF same snapshot | Web renders legacy fields plus LLM markdown. PDF independently maps legacy fields and does not render the markdown; both set generation/display time independently. | **P0 gap** | A shared report projection created from one persisted snapshot; semantic parity tests for risks, text, bases, dates, roadmap, credit, limitations, and recommendation. [4] [5] |
| Exactly one recommended product | Mapping config mandates one product; current legacy `nextStep` is unrelated to the mapping. | **Gap** | Evaluate mapping stop factors first, then deterministic scoring/tie-break/fallback; snapshot one `recommendation` object only. [2] |
| Credit 6,900 RUB calculation/display | Draft policy and schema exist; no entitlement record or display path exists. | **Gap** | Create an idempotent, non-redeeming entitlement after qualifying ready report; calculate expiry in `Europe/Moscow`; show only draft-safe wording while launch is prohibited. [10] [13] |
| Email adapter + test transport | `notifyOwner` is a Manus owner-notification call, not customer email, and there is no delivery state/outbox/test transport. | **Gap** | Define adapter and deterministic in-memory/test DB transport; production provider deliberately absent. [14] |
| LLM off / template content | Paid completion imports and calls `invokeLLM` using `claude-sonnet-4-5`, saves `generationModel`, and falls back to generated legacy markdown. | **P0 gap** | Remove LLM from the v2 result path; hard-disable with a tested flag and templates sourced only from validated/pinned artifacts. [3] [15] |
| Submission idempotency | No input snapshot hash, request fingerprint, state compare-and-set, report uniqueness by version, or artifact dedupe exists. | **P0 gap** | Atomic submit / scoring / snapshot / outbox flow keyed by account, case, canonical-answer hash, config bundle, and idempotency key. [3] [11] |

**Strict acceptance conclusion.** The new v2 protected vertical path can be specified and tested to the §31.3 contract. Full product-level §31.3 acceptance must remain **blocked** while the user-directed legacy bearer path is retained and while legal content is draft. The team must not report a “pass” by testing only the new paths and ignoring existing exposed legacy routes.

## Current-state findings by file

| File | Observed state | Finding and severity |
|---|---|---|
| `shared/legal-core/rules_v1.json` | Draft v1.0.0; 25 risk rules, 8 critical overrides, 8 branches, 6 consistency rules, 3 follow-up rules, 8 escalation rules, and 12 document rules. It declares a closed JSON AST, fixed phases, fail-closed unknown references, evidence derivation, and lexicographically sorted/deduplicated queue requirements. | **Foundation available, runtime absent.** The declared contract is suitable for a deterministic evaluator but must remain test-only while status is draft. [2] |
| `shared/legal-core/schemas/rules.schema.json` | Restricts AST operations to boolean composition, answer option predicates, active risk, branch, flags, and branch count. It fixes legal status and Release 0 flags. | **Useful structural guard.** JSON Schema cannot prove runtime semantics, stable traces, config cross-reference resolution, or that the evaluator never accesses free text. Add executable semantic validation. [16] |
| `shared/legal-core/recommendation_mapping_v1.json` | Requires `cardinality=1`; stop factors precede scoring; `expert_review` is fail-safe; fixed tie-break and fallback are defined; credit uses stable `productCode`, never display text. | **Foundation available, runtime absent.** `FALLBACK-REC-001` must run only after no positive standard candidate. Critical/manual/escalation stop factors must prevent a package offer. [17] |
| `shared/report/report_schema_v1.json` | Requires canonical answers, config checksums, risk trace, evidence, legal bases, escalation, payment/access provenance, credit entitlement, renderer metadata, parity status, and immutable write status. | **Strong target DTO.** The schema permits document-confirmed evidence for later releases, so an R1 profile validator must reject it. The current schema remains draft and cannot be presented as approved provenance. [12] |
| `fixtures/legal-core/manifest.json` and `v1/*.json` | Exactly 15 versioned, hash-verified draft fixtures. They include clean, critical B2C, cross-border, incomplete, contradictory, and branch-deactivation scenarios. | **Good regression seed.** They must be executed by the new evaluator; their stated legal expectations are not yet an approved legal oracle. [6] |
| `server/paidRouter.ts` | All sensitive methods are public and token-addressed. `confirmPayment` trusts a client mutation. `complete` accepts client answers, executes legacy scoring, asks an LLM to write a legal report, and marks report ready in a non-transactional sequence. `adminGetSessions` is public. | **P0.** Do not extend this router to implement v2. Preserve it as explicit legacy compatibility surface. Implement new protected v2 procedures separately. [3] |
| `server/paidDb.ts` and `drizzle/schema.ts` | Session owns payment fields; no customer owner, idempotency records, canonical submission, payment/access grants, report versions, outbox, audit, escalation, email delivery, or entitlement. `paid_reports.paidSessionId` is unique and has mutable `updatedAt`. | **P0.** The data model cannot represent the target state machines or immutable report history. [18] [19] |
| `server/pdfRoutes.ts` | `GET /api/pdf/paid/:sessionToken` authorizes via path token, rebuilds input from mutable session/report fields, and timestamps output on request. | **P0.** It violates owner checks, artifact immutability, and same-snapshot parity. Retain as named legacy route only; it cannot serve v2 reports. [4] |
| `server/pdfGenerator.ts` | `PaidPdfData` is a separate legacy presentation DTO. The renderer has no report ID/version/checksum, no source-version display, no escalation/credit/recommendation/snapshot integrity rendering, and no persisted artifact idempotency. | **P0.** Replace only for v2 with a renderer receiving one validated snapshot-derived view model. Do not have the renderer infer evidence or legal provenance. [5] |
| `server/pdfGenerator.test.ts` | Missing. | **High.** No unit/parity/regression test protects PDF content or rendering failures. |
| `client/src/pages/PaidResults.tsx` and `ReportSharePanel.tsx` | Web report reads the token route and legacy report fields; the download URL embeds the bearer token. Markdown is altered client-side. | **P0.** A v2 report page must use authenticated owner context and a versioned report DTO. It must not transform legal prose, derive facts, or place a credential in a URL. [20] [21] |
| `server/_core/notification.ts` | Sends a project-owner notification to a Manus service. | **Gap, not an email adapter.** It has no recipient-purpose model, delivery state, provider/test transport interface, email idempotency, token flow, or suppression policy. [14] |

## Required target architecture

### 1. Pinned deterministic evaluator

The evaluator receives only a server-created **canonical submission snapshot**: active answer IDs and revisions, visible/deactivated branch state, questionnaire version/checksum, and a fully resolved/pinned legal-core config bundle. It must not receive browser form payloads, current mutable rows, user free text for interpretation, document text, display labels, an LLM response, or a client-computed risk result.

The config loader must first validate JSON Schema, verify the pinned artifact hashes and inter-artifact IDs, reject unknown question/option/risk/category references, and pin the full bundle to the submitted case. In a non-test runtime it must also reject `draft_pending_legal_approval`; this preserves the user’s no-launch decision. A test-only loader may evaluate the draft bundle solely to test technical consistency, and must mark any output as non-client/non-production.

The AST interpreter must implement only the declared nodes: `all_of`, `any_of`, `not`, `answer_contains_any`, `answer_contains_all`, `risk_is_active_any`, `branch_is_active`, `flag_is_set`, and `active_branch_question_count_greater_than`. It must use active canonical answer option IDs, sort arrays deterministically, collect matched atomic predicates, and produce an auditable trace. Free-text matching, regexes, translated labels, substring matching, network calls, current time as legal input, and LLM access are forbidden. A malformed AST or unknown reference produces a classified `configuration_invalid` failure and safe expert-review disposition; it must never silently return a low-risk result. [2] [16]

Execute the fixed phases in order: consistency; branching; risk activation; critical override; follow-up; escalation; document request; aggregation. First activate each base risk. Then apply every matching override to **active target risks only**, raising the level to at least the configured floor and OR-ing the legal-review flag. Overall severity is the maximum effective severity, never a sum or average, so a critical result cannot be smoothed. Stable sorting must follow the configured tie-breaks. [2]

### 2. Evidence, provenance, documents, and escalation

Risk blocks start as `questionnaire_based` with exact canonical answer references and trace atoms. For an active catalog risk with `manualReviewRequired=true`, apply `DERIVATION-EVIDENCE-001`: change only the output evidence status to `manual_review_required` while preserving questionnaire references, document-evidence array, source question IDs, and trace. This is derivation, not document confirmation. A Release 1 profile must reject `document_confirmed`, automatic extraction, or any asserted document fragment because document processing is outside its scope. [2] [12]

No provenance may be invented. Legal-basis snapshots must be copied only from the pinned `legal_basis_catalog_v1` record with its recorded source/check metadata; rule/config identities and checksums must be computed from the actual pinned artifacts; payment provenance must originate from a persisted payment/access record; a queue event must originate from an actual persisted routing event. Missing provenance is a validation failure or a null/explicitly unavailable state where the schema permits it, not a synthetic ID, date, approval, source URL, confidence, assignee, or provider receipt.

Aggregate all matched escalation `queueCode` values by deduplicating and lexicographically sorting them into `requiredQueueCodes`. Before actual routing, set `queueCode=null`, `queueEvent=null`, and `status=required_not_routed`. The first actual routing event selects one queue and permits `queued`/later states with a real `queueEventId` and timestamp. The set of required queues must not be misrepresented as one actual destination. The escalation creation and report/session transition must commit atomically with an outbox record. [2] [12]

### 3. Exactly-one recommendation and credit entitlement

Feed the recommendation evaluator solely with the canonical evaluator output and normalized segment/goal codes. Evaluate stop factors in ascending priority before ordinary scoring. Integrity failure, manual review, critical effective severity, critical override, mandatory escalation, explicit expert-review goal, or unmapped/disallowed risk returns exactly one `expert_review`; no package is presented as sufficient. For normal output, add risk severity weight plus unique segment and goal boosts, retain positive candidates only, resolve ties via the fixed order, and invoke `FALLBACK-REC-001` only when no positive candidate remains. Persist selection rule IDs, scores, and tie/fallback trace. [17]

On the transactional transition that publishes a qualifying **base-tariff** ready snapshot, issue one `credit_entitlement` for the same owner and source payment/report snapshot if payment status is `paid` or `promo_granted`. Store the policy/tariff version, 6,900 RUB amount, eligible **single selected product code**, issue time, and the calculated UTC expiry. Compute the 14-calendar-day boundary in `Europe/Moscow`, ending at 23:59:59.999 of the 14th day including the issue date. The R1 state can calculate and display it, with `automaticRedemptionEnabled=false`; it cannot redeem, reserve, refund, or claim the draft commercial policy as activated. The legacy 4,900 RUB field is never an entitlement input. [13] [22]

### 4. Immutable snapshot, report/PDF parity, and idempotent submission

The `submit` transition validates required active answers server-side, deactivates stale branch answers in the canonical snapshot, computes a canonical RFC 8785 JSON hash, and atomically creates a submission, audit event, and scoring outbox row. Its idempotency key is scoped to case/owner and request fingerprint. The same key and hash returns the original submission; the same key with a different hash is rejected; a new key after submission does not alter the frozen input. The worker locks one job, rechecks access/state, evaluates the pinned bundle, and creates a `pending` report version. A `ready` snapshot is inserted once only after Report Schema, cross-reference, provenance, checksum, R1-profile, and exactly-one recommendation validation pass. [11] [12]

The persisted report snapshot is the sole legal-content source. It has a report ID/version, immutable JSON bytes, input/config/result hashes, generator/template version, state, and `supersedes` relationship. A later approved recalculation creates a new pending/ready version; only upon successor publication may the old version become `superseded`. Neither user retry nor PDF request creates a report or changes a ready snapshot. [11]

Create one shared `ReportViewModel` from the validated snapshot. The authenticated web report renderer and PDF renderer consume that same view model. The PDF worker creates at most one artifact per `(reportId, reportVersion, rendererVersion, format)` and stores its checksum; a request thereafter returns the stored artifact after an owner/access/state check. Parity is semantic, not a requirement that HTML and PDF binary bytes match: both must contain the same risk identifiers/order/levels/text, evidence statuses, legal-basis wording/IDs, roadmap actions/deadlines, limitations, escalation disposition/CTA, recommendation, and credit amount/expiry. The report schema already records this intended relation in `rendererMetadata.parity`. [12]

### 5. Owner-bound v2 access and retained legacy compatibility

All v2 tRPC and HTTP handlers must derive identity from the client server session, then resolve the resource by server ID and check the resource root’s `customerAccountId` before reading content. Anonymous requests receive `401`; authenticated non-owners receive neutral `404`; allowed staff use an explicit role, reason, scope, and audit. PDF download uses a report ID/version selected server-side, not a token or storage URL. Workers use a narrowly scoped job identity and repeat policy/state checks immediately before side effects. [9] [23]

Do **not** delete `paidRouter`, `/api/pdf/paid/:sessionToken`, or other legacy routes in this plan. Put them in an explicit `legacyCompatibility` boundary, record their usage and token-bearer exposure as a compatibility risk, and never call them from new v2 UI/API/worker code. The legacy projection is read-only and labelled `sourceModel=v1` / `anketaVersion=v1`; it must not feed the v2 evaluator, entitlement, report snapshot, or new PDF artifact. This preserves the user’s current access decision but prevents conflating compatibility with v2 security. [24]

### 6. Email adapter and test transport only

Use an `EmailTransport` interface whose input is a minimal, template-versioned delivery envelope: delivery ID, purpose, normalized recipient hash/reference, report ID/version (if applicable), template ID/version, and provider idempotency key. Add `email_deliveries` and outbox records with `queued → sending → sent|failed|suppressed` transitions, attempt count, error class, and no plaintext PDF/token in an audit event. Before queueing and immediately before sending, recheck report readiness, current access, owner/purpose/consent, and suppression status. [11]

The sole R1 implementation is a deterministic test transport that stores redacted envelopes/events for assertions and exposes a controlled test inbox. It supports magic-link one-time-token lifecycle tests without a real mailbox or provider. No production SMTP/API provider, sending-domain configuration, provider secret, webhook, delivery claim, or external side effect belongs in this release. `notifyOwner` may remain a separate internal notification implementation; it is not evidence that customer email requirements are met.

## File-level implementation plan

The table describes a future implementation. It does not authorize changes to legal content or change the current release status.

| Priority | File / path | Planned change | Acceptance boundary |
|---:|---|---|---|
| P0 | `shared/legal-core/runtime/configBundle.ts` **new** | Load the six legal-core artifacts, validate schema plus cross-references/checksums, pin IDs/versions/hashes, and expose a test-only draft loader versus a runtime loader that rejects draft status. | No mutation of JSON artifacts; unknown reference or draft runtime activation fails closed. |
| P0 | `shared/legal-core/runtime/astEvaluator.ts` **new** | Closed AST interpreter and trace collector over canonical active answer IDs only. | No free-text parsing, regex, display-label decision, LLM call, I/O, or non-deterministic ordering. |
| P0 | `shared/legal-core/runtime/evaluator.ts` **new** | Ordered phases, base activation, override application, evidence derivation, document ranking, queue aggregation, normalized profile, and stable result DTO. | Same pinned input yields byte-stable canonical evaluator JSON and trace. |
| P0 | `shared/legal-core/runtime/recommendationEvaluator.ts` **new** | Stop-factor-first exactly-one product selection, ordinary score/tie/fallback trace, and product-code credit eligibility lookup. | Fixed package suppressed for every manual/critical/escalation stop; fallback only after no positive candidate. |
| P0 | `shared/legal-core/runtime/types.ts` and `shared/legal-core/runtime/r1ProfileValidator.ts` **new** | Explicit input/output types and R1 restrictions: no document confirmation/analysis and no client-visible evaluation from draft config. | Reject forbidden evidence/provider/LLM source modes before snapshot creation. |
| P0 | `server/domain/authorization.ts` **new** | Shared `requireCustomerSession`, `requireOwnedCase`, `requireAdminPurpose`, `requireWorkerScope`, state, and audit helpers for tRPC/HTTP/PDF. | v2 no handler accepts owner ID, token, URL, or storage key as authority. |
| P0 | `drizzle/schema.ts` plus an additive migration **new** | Add v2 aggregates: accounts/sessions/magic-link hashes, cases/submissions/answers, payment records/access grants, report snapshots/artifacts, idempotency records, audit/outbox, escalations, email deliveries, and credit entitlements. | No destructive edit to legacy tables; immutable/unique indexes enforce owner, version, request-fingerprint, artifact, and entitlement invariants. |
| P0 | `server/reports/submissionService.ts` **new** | Canonicalize/freeze submission; transactional expected-state transition, audit, idempotency record, and scoring outbox. | Duplicate submit returns the same resource; altered replay fails; no client payload directly reaches evaluator. |
| P0 | `server/reports/reportGenerationService.ts` **new** | Worker-side evaluate → construct snapshot → validate JSON Schema/cross-references/provenance → commit version/state/outbox. | `ready` is insert-only; bad provenance/schema gives `failed` without publication. |
| P0 | `server/reports/reportSnapshotBuilder.ts` **new** | Build the complete Report DTO solely from persisted canonical inputs and pinned config objects. | Never invent legal basis, source check, queue event, provider, approval, document evidence, or credit source. |
| P0 | `server/reports/reportViewModel.ts` **new** | One pure snapshot-to-view projection for web and PDF, including all required parity sections. | Renderer cannot calculate legal result or mutate snapshot. |
| P0 | `server/pdfGenerator.ts` | Add v2 snapshot/view-model renderer isolated from existing legacy data interfaces; preserve old export only for legacy compatibility. | v2 input contains `reportId`, version, snapshot checksum, and canonical view model; output is not generated from mutable DB fields. |
| P0 | `server/pdfRoutes.ts` | Add a protected v2 report-artifact endpoint using server session + owner/state policy + audit; keep `/api/pdf/*/:sessionToken` visible as legacy risk without routing v2 UI to it. | Non-owner sees neutral failure; revoked/expired access denies artifact; no bearer token in v2 URL. |
| P0 | `server/paidRouter.ts` | Do not add v2 behavior to existing public procedures. Remove it from the v2 path by routing new functionality to a separate protected router; eliminate LLM usage from the future v2 completion path. | Legacy remains named compatibility surface; it cannot be counted as R1 acceptance. |
| P0 | `server/v2/diagnosticRouter.ts` **new** | Protected create/start/autosave/submit/status/report procedures; only server-derived customer context. | Full v2 flow works in tests with no manual DB mutation and no legacy token. |
| P0 | `server/v2/promoAccessService.ts` **new** | Server-only promo verification and transactionally coupled `payment_record=promo_granted`/access grant/tariff snapshot. | One grant per account/campaign scope; raw code never stored or returned. |
| P1 | `server/credits/creditEntitlementService.ts` **new** | Issue/display expiry and status based on ready base-tariff report and payment record; implement no R1 redemption. | Exactly one entitlement per source payment/report/policy; 6,900 RUB and 14-day Moscow boundary verified. |
| P1 | `server/email/EmailTransport.ts`, `server/email/TestEmailTransport.ts`, `server/email/emailDeliveryService.ts` **new** | Adapter, durable delivery state/outbox, and deterministic test inbox/transport. | No production provider implementation or credentials; test transport verifies complete magic-link token lifecycle. |
| P1 | `client/src/pages/V2Report.tsx` **new** and `client/src/components/V2ReportDownload.tsx` **new** | Authenticated view of the v2 `ReportViewModel`; version-aware artifact request without token URL. | UI does not rewrite legal content, calculate result, or read a legacy report. |
| P1 | `client/src/pages/PaidResults.tsx`, `client/src/components/ReportSharePanel.tsx` | Keep existing route only as explicitly legacy; do not route new pilot UI to it. | New v2 download has no `sessionToken` bearer URL. |
| P1 | `server/legacyCompatibilityRouter.ts` **new** | Centralize read-only legacy projection labels, telemetry, and risk boundary without deleting old identifiers/routes. | No v1-to-v2 answer conversion, entitlement creation, evaluator invocation, or PDF regeneration. |
| P1 | `server/_core/notification.ts` | Leave owner notification independent; do not present it as email delivery. | No customer legal/report email is dispatched through this service. |
| P1 | `docs/release-1/` architecture/runbook documents **new** | Record disabled feature flags, report-state/outbox recovery, legacy-risk register, no-launch condition, and email test-transport behavior. | No document changes legal config state or claims approval. |

## Concrete test plan

All new tests should use synthetic IDs/answers only. Test fixtures may use the draft legal bundle for technical regression, but must label their results as non-client and must not be used to assert legal approval. Add the test paths below to Vitest’s include pattern (currently only `server/**/*.test.ts` is collected) or locate shared tests under a collected server test harness. [7]

| ID | Test file | Scenario | Required assertion |
|---|---|---|---|
| ENG-01 | `server/legalCore/configBundle.test.ts` | Load all draft artifacts in test mode; validate schema, manifest checksums, cross-file IDs, versions, and bundle hash. | 25 base rules and 15 fixtures are available; unknown/missing/changed reference fails closed. |
| ENG-02 | `server/legalCore/configBundle.test.ts` | Attempt non-test runtime activation of every draft legal config. | Rejected with `legal_config_not_approved`; no client report job is created. |
| ENG-03 | `server/legalCore/astEvaluator.test.ts` | Exercise every AST operation, nested boolean composition, missing answer, inactive answer, unknown option, and deterministic map ordering. | Only canonical active option IDs drive truth; unknown reference is a classified error; trace contains exact atoms. |
| ENG-04 | `server/legalCore/evaluator.fixtures.test.ts` | Run all Release 1 fixture cases from manifest. | Active and forbidden risk IDs, profile, escalation, allowed legal-basis IDs, report-section profile, and exactly-one recommendation equal fixture expectation. |
| ENG-05 | `server/legalCore/evaluator.fixtures.test.ts` | Clean B2B fixture 001. | No active risks; low profile; no queue; `start_product`; `FALLBACK-REC-001` occurs only because there is no positive candidate. [25] |
| ENG-06 | `server/legalCore/evaluator.fixtures.test.ts` | Critical B2C subscription fixture 004. | Risks 017/018/019; critical profile; manual evidence; sorted required queues `LEGAL-DISPUTE-REVIEW`, `LEGAL-EXPERT-REVIEW`; one `expert_review`; no fixed package. [26] |
| ENG-07 | `server/legalCore/evaluator.fixtures.test.ts` | Cross-border fixture 006 and contradictory fixture 014. | Cross-border and inconsistency queues aggregate without creating a synthetic actual queue event; both output preliminary-only/expert-review. [27] [28] |
| ENG-08 | `server/legalCore/evaluator.fixtures.test.ts` | Incomplete fixture 012. | Server validation blocks evaluation/report/outbox with `required_active_answers_missing`; no low-risk default. [29] |
| ENG-09 | `server/legalCore/evaluator.fixtures.test.ts` | Branch-change fixture 015. | Consumer branch answers are inactive/deactivated and excluded; consumer risks never fire; final canonical snapshot records deactivation facts. [30] |
| ENG-10 | `server/legalCore/criticalOverride.test.ts` | Each of the eight overrides and overlapping target-risk overrides. | Active target severity is never lowered; effective profile uses maximum; flags OR together; no score smooths critical/manual outcome. |
| ENG-11 | `server/legalCore/evidenceQueue.test.ts` | Manual risk evidence and multi-rule queue aggregation. | Derivation changes only evidence status; original refs/trace remain; required queues are unique/sorted; `required_not_routed` has null queue/event. |
| ENG-12 | `server/legalCore/recommendation.test.ts` | Each stop factor, normal weights, tie-break, unmapped risk, explicit expert goal, and zero-score fallback. | Exactly one code and trace; all stop factors beat scoring; fallback never appears with a positive candidate. |
| ENG-13 | `server/legalCore/r1Profile.test.ts` | Attempt document-confirmed evidence, document text result, LLM metadata, or a fabricated legal source in an R1 output. | R1 profile validation rejects all; no report becomes ready. |
| REP-01 | `server/reports/reportSnapshotBuilder.test.ts` | Build snapshots from safe, critical, and escalation evaluator outputs. | Draft Report Schema validates; fields cross-reference the actual pinned bundle; no raw promo/token/storage URL/secret; exactly one recommendation. |
| REP-02 | `server/reports/reportSnapshotBuilder.test.ts` | Substitute an invented legal-basis date/URL, provider receipt, queue event, document locator, or approval flag. | Provenance validation rejects the snapshot rather than filling a placeholder. |
| REP-03 | `server/reports/reportSnapshot.test.ts` | RFC 8785 hash/replay, immutability, and supersession. | Same frozen input has same hashes; `ready` JSON cannot be updated; recalculation creates v2 and supersedes v1 atomically only after v2 is ready. |
| REP-04 | `server/reports/submission.integration.test.ts` | Double-click/retry, same idempotency key altered payload, concurrent submit, worker retry, and report failure. | One submission/scoring job/snapshot/PDF artifact for valid replay; conflict is safe; failed generation never leaks a partial report. |
| REP-05 | `server/reports/escalation.integration.test.ts` | Mandatory manual/critical output. | Session becomes `manual_review_required`; one escalation ID/outbox event exists; no full automated report, fixed package, or invented routing is published. |
| CRD-01 | `server/credits/creditEntitlement.test.ts` | Promo and paid qualifying base tariff, duplicate issue event, disallowed expert recommendation, expired/revoked access, and legacy 4,900 field. | One owner-bound 6,900 RUB entitlement per valid source; `automaticRedemptionEnabled=false`; invalid/legacy inputs never issue it. |
| CRD-02 | `server/credits/creditEntitlement.test.ts` | Boundary dates across month/year/DST using `Europe/Moscow`. | End is 23:59:59.999 on inclusive 14th calendar day; stored `expiresAt` UTC and displayed local date agree. |
| PDF-01 | `server/pdfGenerator.test.ts` **new** | Render a v2 `ReportViewModel` and inspect HTML/PDF extracted text. | Includes report version/checksum and exactly the snapshot’s risks, legal bases, evidence, roadmap, limitation, escalation, recommendation, and credit. |
| PDF-02 | `server/reportParity.test.ts` **new** | Compare web model/HTML and PDF extracted text for safe, critical, and superseded report versions. | Required parity sections and semantic values are identical; only format/layout may differ. |
| PDF-03 | `server/pdfRoutes.v2.integration.test.ts` **new** | Anonymous, owner, other owner, staff, revoked access, and old report version. | 401/neutral 404/allow as policy dictates; access audit written; no token-bearing URL; current policy applied before artifact download. |
| AUTH-01 | `server/v2/diagnosticRouter.authz.test.ts` **new** | Read/write/autosave/submit/report/admin-list attempts by anonymous and different customer. | No existence/content leakage or mutation; owner can resume from a new authenticated device. |
| AUTH-02 | `server/legacyCompatibility.test.ts` **new** | Legacy paid session with matched email, leaked session token, and claimed owner. | No inferred owner from email; legacy is read-only compatibility only after approved claim policy; it never invokes v2 engine/report/credit. |
| PAY-01 | `server/v2/promoAccess.integration.test.ts` **new** | Promo use/replay/concurrent use/changed tariff and direct `confirmPayment` attempt against v2. | One `promo_granted` payment record with zero charged amount and immutable tariff snapshot; no client-set paid state. |
| MAIL-01 | `server/email/testTransport.test.ts` **new** | Magic-link request, expiry, consume once, replay, purpose/access suppression, and report-ready email queue/retry. | Test inbox records deterministic delivery; only token hash is persisted; no external provider call; delivery state is independent from report readiness. |
| E2E-01 | `e2e/r1-protected-pilot.spec.ts` **new** | Desktop and mobile emulation: magic link through test inbox → owner session → promo → autosave/resume another browser context → submit → web report → PDF. | One protected v2 path completes without manual DB work; no LLM/network payment provider; all snapshot/PDF parity assertions pass. |
| E2E-02 | `e2e/r1-negative-access.spec.ts` **new** | Copy report ID, artifact URL, old session token, and legacy URL into a different customer context. | The protected v2 path stays isolated. The legacy route result is recorded as an expected compatibility-risk test and is never used as evidence of §31.3 compliance. |

## Migration and operational risks

| Risk | Effect | Required control / residual caveat |
|---|---|---|
| Retained token-bearer legacy routes | Exposes old diagnostics/reports/PDF by locator and prevents full global §31.3 attestation. | Do not delete per user decision; isolate from v2, label in UI/docs/metrics, prohibit new v2 dependencies, and retain a release-blocker record. [23] |
| Ownership inference from email | Would reveal or misassign legacy private data. | No automatic email/domain/cookie/token matching. Use an approved one-time claim or quarantine; current sufficient evidence is still an open decision. [24] |
| Draft legal bundle used as production legal output | Would imply approval that has not happened. | Runtime loader rejects draft bundle; test-only execution is non-client. Keep all status fields unchanged. |
| Legacy report conversion | Could alter historical evidence or misrepresent v1 answers as v2 analysis. | Legacy reports remain read-only historical evidence; no automatic v1→v2 answer mapping, rerun, or on-the-fly PDF regeneration. [24] |
| Document upload/analysis in base tariff | Conflicts with R1 scope and can fabricate evidence/provenance. | Disable v2 document upload/analysis for the base tariff. Defer document pipeline to R2 with policy, quarantine, and evidence controls. [8] |
| LLM text or legal citation drift | Can generate unsupported legal statements and violates §31.3. | No LLM import/call in the v2 report path; templates render validated snapshot fields only; regression test detects LLM metadata/calls. |
| Outbox or worker retries | Can create duplicate reports, PDFs, email, grants, or credits. | Transactional state/audit/outbox plus unique idempotency keys, job locks, and artifact/delivery/entitlement uniqueness constraints. |
| PDF re-render from live data | Breaks reproducibility/parity after answer/config change. | PDF artifact always references exact snapshot/version/checksum; a new report version creates a new artifact only. |
| Queue metadata invented before route | Falsely represents operational handling. | Preserve `requiredQueueCodes`; use null actual queue/event until an audited routing event. Human legal approval is not inferred from assignment or status. |
| Production email provider | Launches an excluded external integration and needs provider/domain/secrets. | Interface plus test transport only. Production transport stays absent and feature-disabled. |
| Credit policy ambiguity | Incorrect customer-facing commercial entitlement or automatic redemption. | Issue/display only per pinned draft policy in non-launch test path; no automatic redemption; final customer terms require legal/commercial approval. |

## Release gates and non-claims

The following gates must all remain open at this audit date:

1. **Legal gate:** Named human approval is deferred. Legal-core contents, legal-basis snapshots, report wording, fixtures, and golden reports are draft. No client/runtime launch is allowed.
2. **Security gate:** The owner-bound v2 path, server sessions, magic-link token lifecycle, shared authorization policy, protected report/PDF access, and negative authorization suite do not exist.
3. **Engine/report gate:** The declared evaluator, snapshot builder, report versioning, entitlement service, queue transaction, and parity renderer are not implemented.
4. **Operational gate:** A real escalation owner/SLA, approved queue policy, retention policy, and production email provider are not in place. A test transport is sufficient only for R1 test coverage, not launch.
5. **Compatibility gate:** Legacy access must stay available by user decision. It remains a documented security/acceptance risk and prevents a complete §31.3 claim until a later approved remediation/cutover.

Accordingly, this audit recommends building and testing the **disabled v2 technical vertical slice** in the file/test sequence above, while preserving draft metadata and no-launch enforcement. It explicitly does **not** recommend activating draft legal results, deleting legacy routes, enabling LLM, adding a payment provider, adding a production email provider, or fabricating any evidence/provenance.

## References

[1]: file:///home/ubuntu/Neolex/docs/architecture/release-0-index.md "Lexy Release 0: index of architectural fixation"
[2]: file:///home/ubuntu/Neolex/shared/legal-core/rules_v1.json "Rules v1 draft deterministic legal-core configuration"
[3]: file:///home/ubuntu/Neolex/server/paidRouter.ts "Current paid diagnostic tRPC router"
[4]: file:///home/ubuntu/Neolex/server/pdfRoutes.ts "Current PDF HTTP routes"
[5]: file:///home/ubuntu/Neolex/server/pdfGenerator.ts "Current PDF report generator"
[6]: file:///home/ubuntu/Neolex/fixtures/legal-core/manifest.json "Legal-core fixture manifest v1"
[7]: file:///home/ubuntu/Neolex/vitest.config.ts "Vitest configuration and current test discovery"
[8]: file:///home/ubuntu/jobs/job_gFnfBRFY_a3/tz_v3_full.txt "Technical specification Lexy v3: Release 1 scope"
[9]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Lexy v1 access-control matrix"
[10]: file:///home/ubuntu/Neolex/docs/architecture/payment-model-v1.md "Payment, promo-access, and credit model"
[11]: file:///home/ubuntu/Neolex/docs/architecture/state-machines-v1.md "Lexy Release 0 state machines"
[12]: file:///home/ubuntu/Neolex/shared/report/report_schema_v1.json "Immutable report snapshot JSON Schema v1"
[13]: file:///home/ubuntu/Neolex/shared/billing/credit_policy_v1.json "Base diagnostic credit policy draft"
[14]: file:///home/ubuntu/Neolex/server/_core/notification.ts "Current project-owner notification service"
[15]: file:///home/ubuntu/jobs/job_gFnfBRFY_a3/tz_v3_full.txt "Technical specification Lexy v3: language-model restrictions"
[16]: file:///home/ubuntu/Neolex/shared/legal-core/schemas/rules.schema.json "Rules v1 JSON Schema"
[17]: file:///home/ubuntu/Neolex/shared/legal-core/recommendation_mapping_v1.json "Deterministic recommendation mapping v1"
[18]: file:///home/ubuntu/Neolex/server/paidDb.ts "Current paid diagnostic persistence helpers"
[19]: file:///home/ubuntu/Neolex/drizzle/schema.ts "Current Drizzle database schema"
[20]: file:///home/ubuntu/Neolex/client/src/pages/PaidResults.tsx "Current paid report page"
[21]: file:///home/ubuntu/Neolex/client/src/components/ReportSharePanel.tsx "Current report download and sharing component"
[22]: file:///home/ubuntu/Neolex/shared/billing/tariffs_v1.json "Tariff catalog draft and legacy price discrepancy"
[23]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Current P0 exception and v2 channel boundary"
[24]: file:///home/ubuntu/Neolex/docs/migrations/v1-to-v2.md "v1 to v2 migration and legacy compatibility plan"
[25]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/01-clean-b2b-saas.json "Clean B2B SaaS fixture"
[26]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/04-b2c-subscription-recurring.json "Critical B2C subscription fixture"
[27]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/06-cross-border-infrastructure.json "Cross-border infrastructure fixture"
[28]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/14-contradictory-answers.json "Contradictory answers fixture"
[29]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/12-incomplete-questionnaire.json "Incomplete questionnaire fixture"
[30]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/15-branch-answer-changed.json "Branch-answer change fixture"
