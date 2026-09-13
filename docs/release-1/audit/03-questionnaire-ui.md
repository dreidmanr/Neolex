# Release 1 audit — Questionnaire, autosave and UI flow

**Module:** Questionnaire, autosave and paid client UI flow
**Audit mode:** Read-only; application source code and configuration were not changed.
**Repository / branch:** `/home/ubuntu/Neolex`, `feat/lexy-release-1-pilot`
**Audit date:** 2026-09-12
**Decision baseline:** Human legal approval is deferred until completion of all stages. Every legal configuration remains `draft_pending_legal_approval`. **Client/runtime launch is prohibited.** The existing token-based paid path stays available only as a legacy compatibility path; it must not be deleted in this plan and must be treated as a compatibility/security risk. Release 1 email is an adapter plus a test transport, with no production provider. LLM is disabled.

## 1. Executive conclusion

The repository has a technically consistent **Release 0 questionnaire artifact**, but it has no Release 1 runtime integration. `questionnaire_v2.json` structurally contains the required **33 core** and **6 branch** Pilot questions, and all 24 legacy critical-input questions are active in the Pilot selection. The repository validator confirms `questions=63`, `pilot_core=33`, `pilot_branch=6`, 25 risks, 25 basic rules and 15 fixtures. This is **configuration completeness**, not a customer-ready questionnaire. The file itself records `runtimeIntegration=false`, `enabledNow=false`, and `draft_pending_legal_approval`; the current runtime has no reference to it outside validation tooling.[1] [2]

The currently deployed implementation is an unrelated **legacy v1 bearer-token flow**. `PaidDiagnostic.tsx` imports `PAID_BLOCKS` and `PAID_PRICE_RUB` from `paidDiagnosticData.ts`; it displays all 14 legacy blocks, stores a `sessionToken` and answers in `localStorage`, performs client-side promo validation, uses the legacy 4,900 RUB price, simulates payment, uploads files, and sends answers to public token-based procedures. `paidRouter.ts` receives and trusts client-selected question metadata, accepts `confirmPayment` from the browser, scores a client-supplied completion payload, and calls an LLM to write a report. Those behaviors are incompatible with the protected closed Pilot required by §§30.3 and 31.3.[3] [4]

Release 1 implementation must therefore be **side-by-side**, not a rewrite of the legacy route. Preserve `/paid` and `/paid/results/:token` as legacy compatibility routes, explicitly label them as a P0 compatibility risk in the delivery and migration record, and introduce a separate owner-bound v2 route family. The new path must remain hard-disabled for real users while the legal gate is unresolved. It may be tested with isolated synthetic fixtures and a test email transport, but it must not render draft legal content, grant customer access, generate customer reports, or be advertised as launch-ready.

> **Go/no-go decision:** the only safe Release 1 runtime state under the stated user decision is `R1_CLIENT_RUNTIME_ENABLED=false`. No environment override or UI action may activate a draft legal configuration for customers. The plan below prepares the protected architecture and tests; it does not authorize a client launch.

## 2. Normative target and audit method

Section 30.3 requires a protected closed Pilot: magic-link customer authentication, server session, recorded mandatory terms and optional marketing consent, base tariff/promo access, `payment_record=promo_granted`, a `paid_session` bound to `customerAccountId`, adaptive 28–35 core plus 5–8 branch questions, server autosave and cross-device resume, deterministic results, and test-transport email. Section 31.3 requires that a token alone never authorizes access, state transitions cannot be set by the client, progress resumes on another device, and LLM neither produces nor rewrites output.[5]

Release 0 already defines the necessary architectural constraints. Access is deny-by-default, owner checks happen server-side, a locator is not a credential, answers and visibility are server source-of-truth, and draft legal configurations may not be consumed by client runtime.[6] The state-machine contract requires canonical server answers, visibility snapshots, submission from persisted answers rather than a browser payload, idempotency, audit events and outbox side effects.[7] The migration plan additionally prohibits inferring legacy ownership from email and retains old sessions in compatibility mode without automatic v1-to-v2 answer conversion.[8]

This audit reviewed the requested legacy data, v2 configuration, paid router, paid pages and application routes. It also inspected the persistence schema, paid database helpers, PDF routes, legal-document component, Release 0 state/access/migration/payment documents, the environment/service-account contract, and the existing test suite. `python3 tools/validate-release-0.py`, `pnpm test --run`, and `pnpm exec tsc --noEmit` completed successfully. The existing test suite has 21 passing tests, but none covers the paid router, cross-device resume, customer ownership, v2 question selection, email token flow, or mobile UI.

## 3. Current state by artifact

| Area / files | Observed state | Release 1 implication |
|---|---|---|
| `shared/paidDiagnosticData.ts` | Legacy v1 model: 14 blocks, 63 questions, `PAID_PRICE_RUB=4900`, v1 scoring and direct risk text. | Keep as legacy compatibility data only. Do not import it into the new v2 Pilot; it conflicts with the 6,900 RUB R1 base tariff and bypasses the config release model. |
| `shared/legal-core/questionnaire_v2.json` | 63 preserved questions; `release1Selection` has exactly 33 core and 6 branch IDs; 24/24 critical-input questions are active. The artifact says draft, architecture-only, runtime disabled and client access unchanged. | It is the intended source for a future server-side projection, not a React import. Its draft state is an active hard launch block. |
| `shared/legal-core/schemas/questionnaire.schema.json` and `tools/validate-release-0.py` | Validate JSON structure, cardinality and references. | Useful release-artifact validation exists; no runtime input-validation service, signed release loader, or permitted-status gate exists. |
| `server/paidRouter.ts` | All paid operations are `publicProcedure` and authorize by `sessionToken`. `confirmPayment` sets paid state from a browser call. `saveAnswer` accepts browser `blockId`, `questionId`, and `answerType`. `complete` accepts the entire answer map, calls legacy scoring, invokes `claude-sonnet-4-5`, saves a mutable-style report, and calls owner notification. | This is a legacy compatibility router, not a safe v2 base. It violates owner binding, server validation, payment, LLM-disabled, snapshot, and state-transition requirements. Do not extend it for v2. |
| `server/paidDb.ts`, `drizzle/schema.ts` | Paid session has no `customerAccountId`; `sessionToken` is persisted raw and effectively acts as bearer access. Answers lack config hash, revision, canonical visibility, idempotency and unique `(session, question)` constraint. Consent inserts append records without a transition/audit contract. Documents persist `storageUrl`. | Create additive v2 tables and leave these legacy tables unchanged. Never derive a v2 owner from `contactEmail` or the legacy token. |
| `client/src/App.tsx` | `/paid` and `/paid/results/:token` point to legacy pages; global `LexyWidget` mounts on every route. | Preserve these routes as legacy. Add a separate guarded v2 family. Do not mount LLM widget on the v2 Pilot/cabinet while LLM is disabled. |
| `client/src/pages/PaidDiagnostic.tsx` | Client owns step state, promo validity, question visibility, completion validation and price. It caches session token and answers in `localStorage`; never fetches server answers for resume; text only saves on blur if non-empty; autosave errors are discarded. All 14 blocks are visible. It uploads files. | Replace only for the v2 route with a generic server-driven renderer. Do not reuse these business rules. The existing page remains a legacy compatibility component. |
| `client/src/pages/PaidResults.tsx`, `server/pdfRoutes.ts` | Report and PDF are fetched/generated by `sessionToken` in URL. Paid PDF is rendered on every GET using current report fields and the request-time date. | Legacy compatibility risk. The new report/PDF must be authorized by customer session + owner check and render one stored immutable snapshot/artifact. |
| `client/src/pages/LegalDocs.tsx` and paid consent screen | Legal text is embedded in React. Paid screen links `/legal/terms` and `/legal/privacy`, but `LegalDocs` defines `user-agreement` and `privacy-policy`; links therefore do not resolve to these documents. UI shows version `2.0`, while the rendered user agreement is `2.2`. Server defaults `dataProcessingAccepted` to `true` and only enforces the user-agreement boolean. | Do not copy or repair legal text in React. Centralize versioned document metadata and acceptance on the server after legal approval. Until then, the R1 customer flow remains unavailable. |
| `client/src/pages/Home.tsx` and `PaidDiagnostic.tsx` landing | Both client bundles contain `promoCode.trim() === "123"`; the paid page previews 14 blocks, promises AI report and uploads, and displays 4,900 RUB. | Remove promo logic and commercial/legal assertions from the v2 client path. Pilot must show only the server-projected base tariff when its launch gate is valid; today it must show a controlled closed/unavailable state. |
| `server/_core/notification.ts`, `server/_core/env.ts` | Owner-notification service exists, but there is no customer email adapter, token delivery ledger, test transport, magic-link token store, or relevant environment gate. | Add a test-only email abstraction and an outbox/delivery state model. Do not configure a production provider in R1. |

## 4. Pilot questionnaire: the correct 33 + 6 implementation

### 4.1 Selection status

The configured selection is technically within the target band: 33 core questions and six branch questions. It is not a 39-question mandatory flow. A user sees the 33 core questions plus only the branches activated by their persisted answers. The visibility denominator must be the current server-calculated active set, so it can range from 33 to 39 selected questions. Requiredness is a separate property: an active branch is mandatory only where its `required` field is `true`. In particular, `b12_q2` is an active branch question but is configured `required=false`; the client must not make classification itself mandatory.[2]

| Group | IDs / activation | Server behavior |
|---|---|---|
| 33 core | `b1_q1…b1_q6`; `b2_q1,b2_q2,b2_q3,b2_q5`; `b3_q1…b3_q3`; `b4_q2,b4_q3,b4_q7`; `b5_q1…b5_q4,b5_q6`; `b6_q1,b6_q2`; `b7_q1,b7_q4`; `b8_q2`; `b10_q1,b10_q2`; `b11_q1,b11_q2,b11_q4`; `b12_q1,b12_q3`. | Return as base active questions in display order. Validate only their configured types/options/requiredness. All configured critical-option inputs are included, which is a positive structural finding. |
| Consumer branch | `b8_q1,b8_q3`; activated from `b1_q3` containing `b2c`. `b8_q3` also has an `any` condition over `b1_q3=b2c` or `b8_q1 in {yes,mixed}`. | Return both when B2C is selected. If B2C is removed, deactivate the effective answers and recompute visible questions/progress. Preserve a revision history for audit/replay, but exclude inactive answers from submission/scoring. |
| Partner branch | `b9_q1,b9_q2,b9_q3`; activated when multi-answer `b3_q2` contains `partners`. | Return the three questions only under this condition; hide and deactivate them if the option is unselected. |
| Dispute-detail branch | `b12_q2`; activated when `b12_q1=yes`. | Return when activated but respect its configured `required=false`; do not introduce a client-side mandatory rule. |
| Disabled investment branch | `b14_q1…b14_q3`; triggered by `b1_q5=pre_investment` or `pre_sale`, but `activeInPilot=false`. | Do not ask disabled questions. Persist deterministic `manual_follow_up_required` reason from `disabledBranchTriggerPolicy`; expose only a neutral status/CTA after an approved operational flow exists. |
| Disabled contractor branch | `b11_q3`; legacy trigger comes from `b4_q1`, which is itself not active in the Pilot. | It is not reachable through the selected R1 input set. Server validation must reject an attempt to submit `b4_q1` or `b11_q3` as inactive, rather than accepting an injected answer. |

### 4.2 Server-visible-question contract

Create a server `QuestionnaireService` that owns selection, visibility, normalization and progress. React receives a **projection**, not the raw v2 config and not permission to evaluate branch rules.

1. On `GET draft`, authenticate the customer from an HttpOnly customer-session cookie; resolve the v2 case, current access grant, configured release ID/hash, and persisted canonical answers. The server validates that the release is permitted. With every legal config still draft, it returns an unavailable/closed-Pilot DTO and does not return legal questions.
2. When a future legal gate is satisfied in an approved controlled environment, the service loads a pinned, integrity-checked questionnaire release, filters to `activeInPilot=true`, evaluates `branchConditions` over canonical answers, and returns `visibleQuestionIds`, ordered generic question DTOs, answers, `draftRevision`, current cursor and save status.
3. On `PUT answer`, the client sends only `{questionId, value, clientMutationId, expectedDraftRevision}`. The server derives block, type, allowed option IDs, active visibility and requiredness; it ignores any browser-supplied block, answer type, score, price, status or owner fields.
4. The response includes the new revision, canonical normalized value, recomputed visibility, deactivated question IDs, progress and any server-safe manual-follow-up flag. This makes the browser’s next view a projection of the same decision used at submission.
5. On `POST submit`, the client sends an idempotency key only. The service re-reads the canonical persisted answers in a transaction, recomputes visibility, validates required visible questions, freezes an input snapshot with questionnaire version/hash and visible-set hash, then queues deterministic scoring. It never scores the client’s answer map.

The server must reject unknown question IDs, IDs outside the selected Pilot, inactive branch answers, unknown options, a scalar where a multi-value is required, duplicate multi-values, non-string text, malformed clear operations, and state/owner/revision violations. Text must be normalized server-side (trim before requiredness) and bounded by technical abuse limits defined outside legal wording. The v2 JSON does not establish option mutual-exclusivity rules, so the implementation must not invent rules such as treating `none` as exclusive without an approved configuration change.

## 5. Autosave and resume on another device

### 5.1 Required persistence model

The current local-storage approach does not meet §31.3. It works only in the same browser, leaks a bearer token into browser storage, and treats a silently failed save as successful. Text clearing is not saved because the current blur handler sends only truthy text. A v2 draft must be server authoritative.

Each v2 diagnostic case needs an owner, an allowed questionnaire release, state, draft revision, last-visible cursor, and server-side canonical answers. Each answer needs `caseId`, `questionId`, normalized typed value, active/inactive state, `revision`, `updatedAt`, and a client-mutation/idempotency reference. A revision/audit ledger records semantic changes and branch deactivation without placing full free text or raw credentials in audit metadata. Store the questionnaire release ID, version, SHA-256 and visible set in the draft and immutable submission snapshot.

The autosave protocol should use a trailing debounce for text changes and immediate semantic saves for single/multi selection. Each request carries a stable `clientMutationId`; retrying a request with the same ID and payload returns the original save result. The server compares `expectedDraftRevision` and responds with a structured conflict/snapshot when the value was changed on another device. The client displays **Saving**, **Saved**, **Offline/unsaved**, or **Conflict—refresh required**. It must not advance to submit while a required answer is unsaved or a conflict remains. Clearing text must be a real `null`/empty canonical update, not omitted.

A second device obtains a new magic-link-backed customer session for the same `customerAccountId`, opens the minimal cabinet, chooses the active case, and reads the server draft projection. It sees the same canonical answers, current cursor/progress and current active branches. It must not require or receive the first device’s local storage, session token, report URL, email match or legacy case token. A different customer receives neutral `404` after authentication; anonymous callers receive `401`.

### 5.2 State handling

Use the Release 0 states as the transition authority: create `draft` only under an authenticated owner and selected tariff; grant access only from a server-verified promo record; first valid autosave moves `access_granted → in_progress`; submission moves `in_progress → submitted` only after server validation and snapshot. Scoring, report readiness, manual review and failure are service transitions. A browser cannot call a `confirmPayment` equivalent, set `paid`, set `report_ready`, supply a report, or submit a payload that bypasses the canonical draft.[7]

## 6. Consent, landing, tariff and email path

### 6.1 Consent design without React legal logic

The correct split is **content/acceptance policy on the server; presentation-only components in React**. React receives a document identifier, immutable version/hash, title, canonical URL and whether a checkbox is mandatory. It renders accessible controls and posts a choice. It does not embed agreement text, document version constants, acceptance timestamps, legal requirement conditions, or default values.

A v2 `ConsentService` must record, transactionally and server-side, at least the case/account relationship, document ID, version, content hash, acceptance/rejection, acceptance time in UTC, actor/session, and legal/config release provenance. Mandatory service terms and the required data-processing basis must be explicitly accepted before access is requested; marketing remains a separate opt-in whose false value is recorded and whose withdrawal is independently managed. The server must never default a mandatory data-processing consent to `true`. It must reject a stale document version and write an audit event without full legal text or raw session token.

The current paid screen is internally inconsistent: its combined checkbox links paths not defined by `LegalDocs`, claims version `2.0` while that component has a `2.2` user agreement, computes the displayed date in the browser, and duplicates legal wording in client source. These are blockers to a customer flow even apart from the deferred legal approval. Under the stated decision, the new v2 UI must not display draft legal texts as terms for real customers. It should show a controlled "Pilot unavailable pending required approvals" state until a future approved document release is explicitly activated.

### 6.2 Landing and tariff path

The future v2 public entry is a landing route, not an access credential. The R1 closed Pilot should expose only `lexy-advanced-diagnostic` (6,900 RUB) to the customer path. `lexy-diagnostic-with-documents` remains model/catalog data for R2 and must not enable upload, document access or an R1 entitlement. The expert review product remains request-only. This follows the Release 1 base-tariff boundary and avoids the present 4,900 RUB legacy discrepancy.[9]

After a future approved gate is active, the safe sequence is:

1. Public `/pilot` renders a non-sensitive landing. Today it is closed by server state.
2. User requests a magic link through a neutral, rate-limited endpoint. Requesting a link never reveals whether an account, email, legacy session or diagnostic exists.
3. Test email transport delivers the single-use link. Token storage is hash-only, short-lived and atomically consumed; consumption creates an HttpOnly, Secure, SameSite=Lax customer session.
4. Authenticated customer selects the R1 base tariff from a server DTO, accepts current mandatory documents, and optionally grants marketing consent.
5. Authenticated customer submits the promo value to a server-only verifier. The raw value is not in JavaScript constants, analytics, API responses, DB records or audit logs. A successful controlled test grant creates a tariff/price snapshot, `payment_record=promo_granted`, and an access grant in one server transaction.
6. The server creates or activates an owner-bound case. The cabinet route then opens `/cabinet/diagnostics/:publicCaseId/questionnaire`; the public case locator is not sufficient authorization.

Release 1 email work is limited to `EmailAdapter` plus `TestTransport`, delivery state, outbox and token-flow tests. The test transport must capture messages only in a controlled test inbox/allowlist. There is no production email API key, provider adapter, webhook or delivery claim. The existing owner notification is neither customer email delivery nor a substitute for this flow.[10]

### 6.3 LLM and documents

No v2 paid questionnaire, scoring, report rendering, PDF rendering or client widget route may invoke an LLM. A server environment gate must default to `LEXY_LLM_MODE=disabled`, and the Pilot/cabinet must not mount the global `LexyWidget`. The legacy `generateReportMarkdown()` call is a documented incompatibility; it remains solely inside the retained legacy path and must not be copied into v2. An automated test must prove zero LLM calls for every R1 fixture.

File upload is Release 2. The v2 R1 screen must have no upload component, upload endpoint, file base64 conversion or public `storageUrl` output. The legacy `uploadDocument` endpoint currently accepts a bearer token, trusts supplied MIME/size and returns a storage URL; it is a separate compatibility risk, not a foundation for v2.[11]

## 7. Mobile and accessibility UX

The present paid UI uses responsive widths and some large controls, but its product structure is a 14-block desktop-style flow. It uses clickable `<div>` elements inside labels for consent, client-only progress and fixed block numbering; it does not report save state or server conflicts. It should not be incrementally adapted into the R1 questionnaire.

The v2 generic renderer should use one task-focused question panel or a small server-defined section at a time. It should show **question N of current active total**, rather than "block 14 of 14". When an answer activates/deactivates a branch, the next server projection recalculates the denominator and announces the change accessibly. On mobile, retain a compact sticky header, put the primary next/save action in a safe-area-aware sticky footer, make controls full-width with at least 44×44 CSS-pixel targets, use `text-base` inputs to prevent iOS zoom, avoid side-by-side cards below the small breakpoint, and never require horizontal scrolling. Use native radio/checkbox semantics or equivalent ARIA roles, visible focus indicators, labelled error messages and an `aria-live` save-status region. The server remains authoritative if an offline cache, retry or second-device conflict occurs.

The mobile E2E suite must cover 375×812 and at least one desktop viewport. It should explicitly assert: no horizontal overflow; mandatory errors remain visible above the sticky CTA; selected state is perceivable without color alone; consent links/labels have correct targets; server-generated branch questions appear/disappear; and a save failure is not hidden by navigation.

## 8. File-level implementation plan

This is a plan only. Do not change any file until the appropriate technical and legal gates are separately approved. The first implementation increment is infrastructure and tests under a permanently false customer-runtime gate; it does not make the draft legal core customer-visible.

| Priority | File(s) | Planned change | Gate / invariant |
|---|---|---|---|
| P0 — preserve | `shared/paidDiagnosticData.ts`; `server/paidRouter.ts`; `server/paidDb.ts`; `client/src/pages/PaidDiagnostic.tsx`; `client/src/pages/PaidResults.tsx`; `server/pdfRoutes.ts` | Freeze as **legacy v1 compatibility**. Do not delete legacy routes or infer owner from their email/token. Add no v2 behavior to these modules. Record bearer-token/data-URL/LLM/payment simulation as compatibility risk in release notes and migration ledger. | Legacy remains intentionally available per user decision, but is not a qualified R1 protected path. |
| P0 — route separation | `client/src/App.tsx`; `server/routers.ts` | Retain `/paid` and `/paid/results/:token`. Add distinct v2 namespaces such as public `/pilot`, magic-link consume route, and protected `/cabinet`, `/cabinet/diagnostics/:publicCaseId/questionnaire`, `/cabinet/diagnostics/:publicCaseId/report`. Register a separate `pilot` router, not an extension of `paid`. Disable `LexyWidget` in v2 routes. | All new non-public routes require customer session plus resource ownership; route name/ID never grants access. |
| P0 — hard release gate | `server/_core/env.ts`; new `server/releaseGate.ts`; deployment environment documentation | Add typed safe defaults: `LEXY_R1_CLIENT_RUNTIME_ENABLED=false`, `LEXY_LLM_MODE=disabled`, `LEXY_PAYMENT_PROVIDER=disabled`, `LEXY_EMAIL_ADAPTER=test`, config channel/manifest ID/hash. A gate checks these plus permitted config status before returning legal content or activating a customer case. | With every legal config draft, gate must refuse customer runtime regardless of UI parameter or environment accident. |
| P0 — owner-bound auth | New `server/customerAuthRouter.ts`, `server/customerAuth.ts`, `server/_core/customerProcedure.ts`, `server/services/customerAccessPolicy.ts` | Implement neutral magic-link request, hash-only one-time token, TTL/rate-limit/atomic consume, server cookie and `customerProcedure`. Centralize `ownsCase`/state checks and neutral 404 behavior. | Existing admin OAuth remains admin-only. Customer session, not email, legacy token or public case ID, proves owner. |
| P0 — additive persistence | `drizzle/schema.ts`; new numbered Drizzle migration; new `server/pilotDb.ts` | Add `customer_accounts`, `customer_sessions`, `magic_link_tokens`, v2 `diagnostic_cases`, `payment_records`, `access_grants`, `questionnaire_drafts`, `questionnaire_answers_v2`, answer revision/idempotency records, consent acceptances, immutable submission/report snapshots, audit events, outbox and email-delivery records. Use foreign keys/unique indexes including owner and idempotency constraints. | Expand only. No edit/backfill of legacy records in this increment; no owner guessed from `contactEmail`. |
| P0 — config loader / server projection | New `server/legalCore/configLoader.ts`, `server/services/questionnaireService.ts`, `server/services/questionnaireValidation.ts`; optional technical DTO types in `shared/questionnaire-runtime.ts` | Validate/pin manifest hash, status and questionnaire version; map `questionnaire_v2` to generic question DTOs; calculate `visibleQuestionIds`, disabled-branch manual flags, requiredness and progress; perform server submit validation and freeze snapshot. | React receives presentation DTOs only. Config is never imported into client bundle. Draft configs must not be served to customer runtime. |
| P0 — Pilot router | New `server/pilotRouter.ts`, `server/services/pilotLifecycleService.ts`, `server/services/promoAccessService.ts`, `server/services/tariffService.ts` | Implement owner-bound read draft/save answer/submit actions, optimistic revision/idempotency, base-tariff selection, server promo verifier and transactional `promo_granted` access. Derive status transitions from state machine. | No `confirmPayment` browser transition; no client answer-map scoring; no document tier or real provider in R1. |
| P0 — consent policy | New `server/services/consentService.ts`, `server/legalDocuments/documentRegistry.ts`, protected legal-document metadata/read endpoint; later approved content package | Move document ID/version/hash/URL/requiredness and acceptance recording to server. Return safe DTOs. Replace hardcoded paid consent versions/text in the v2 path. | User agreement/data processing explicit; marketing separate opt-in. Draft content is not customer terms. |
| P1 — email test delivery | New `server/email/EmailAdapter.ts`, `server/email/TestTransport.ts`, `server/workers/emailWorker.ts`, `server/services/emailDeliveryService.ts` | Outbox-driven magic-link delivery with delivery state and bounded retries. Test transport only; capture safe test messages and assert full token flow. | No production provider client, API key, domain verification or webhook in R1. Raw token never enters DB/log/audit/outbox payload. |
| P1 — new UI | New `client/src/pages/PilotLanding.tsx`, `client/src/pages/Cabinet.tsx`, `client/src/pages/PilotQuestionnaire.tsx`, `client/src/components/questionnaire/QuestionRenderer.tsx`, `QuestionNavigator.tsx`, `AutosaveStatus.tsx`, `ConsentChecklist.tsx`, `useQuestionnaireDraft.ts` | Build a generic, accessible mobile-first renderer from server DTOs. Remove legal branching, question lists, price, promo rule, consent text/version, report logic and access decisions from React. `PilotLanding` shows closed state until server permits runtime. | No `localStorage` bearer credential; server is source of truth; no R1 file upload; no LLM widget. |
| P1 — report boundary | New v2 snapshot/report service and protected report/PDF routes; leave legacy `server/pdfRoutes.ts` unchanged for compatibility | Create web report then PDF from the exact immutable report snapshot/version, with owner check and audit. | Legal approval is still a launch blocker; no customer report generation while the legal core is draft. |
| P2 — legacy migration | New migration/claim services following `docs/migrations/v1-to-v2.md` | Register legacy sessions, offer neutral verified claim later, quarantine otherwise, retain compatibility projection. | Never auto-claim by email; no destructive route removal in this plan. |

## 9. Concrete test plan and acceptance evidence

### 9.1 Unit and contract tests

| Proposed test file | Required tests |
|---|---|
| `shared/legal-core/questionnaire-v2.contract.test.ts` | Parse the JSON/schema; assert 63 total questions, exactly 33 active core and six active branch IDs, 24 active critical-input questions, unique question/option IDs, valid branch references, and preserved disabled-branch policy. Retain `tools/validate-release-0.py` as a CI check. |
| `server/services/questionnaireVisibility.test.ts` | No branch for clean B2B; B2C activates `b8_q1,b8_q3`; removing B2C deactivates their effective answers; `b3_q2=partners` activates all `b9_*`; removing it deactivates all three; `b12_q1=yes` shows optional `b12_q2`; investment/pre-sale emits `manual_follow_up_required`; injected inactive `b4_q1/b11_q3` is rejected. |
| `server/services/questionnaireValidation.test.ts` | Reject unknown/inactive question, invalid option, invalid answer shape, duplicated multi option, stale revision and post-submit mutation. Accept explicit text clearing. Submit succeeds only with required visible values; it must not require optional `b12_q2`. Verify server derives block/type and does not accept client-supplied block ID, score, price, status or visibility. |
| `server/services/pilotLifecycle.test.ts` | Enforce `draft → access_granted → in_progress → submitted`; browser cannot set `paid`, `report_ready`, manual review or score; repeated submit with same idempotency key yields one snapshot/outbox item; different payload after submit is rejected. |
| `server/services/consentService.test.ts` | Required agreement and required data-processing choice are explicit; marketing false/true each produces an independent record; version/hash comes from registry, not browser; stale version/default-true/direct bypass is rejected; acceptance event is server timestamped. |
| `server/services/promoAccess.test.ts` | R1 offers base tariff only; raw promo is absent from client catalog/log/audit DTO; valid server verification creates one zero-charge `promo_granted` price snapshot/access grant; same account/campaign retry is idempotent; second redemption is refused; document tariff and expert request do not create R1 questionnaire access. |
| `server/customerAuthRouter.test.ts` | Neutral request response, rate limit, hash-only token storage, expiry, single consume, replay refusal, secure customer session and logout/revoke behavior. Test transport is the only adapter selected. |
| `server/pilotRouter.authz.test.ts` | Anonymous caller gets 401; owner A reads/saves/submits only case A; authenticated customer B gets neutral 404 for A; supplying A’s public case ID, legacy `sessionToken`, storage URL, email or fabricated owner ID does not help. Cover draft, revoked and archived states. |
| `server/services/draftResume.test.ts` | Device A autosaves a value/cursor; a new magic link/session for same account on device B returns the same persisted projection; concurrent update returns structured revision conflict; retry with same mutation key does not duplicate history; a failed save never reports `Saved`. |
| `server/email/EmailAdapter.test.ts` | `TestTransport` receives the controlled magic link and full request→delivery→consume flow passes; raw token is absent from persisted delivery/audit values; bounded retry is deduplicated. Assert no production provider is constructed. |
| `server/pilot.noLlm.test.ts` | Spy on `invokeLLM` while exercising every R1 fixture/score/report path; expected call count is zero. Verify v2 report rendering consumes only immutable deterministic snapshot data. |
| `server/reportSnapshotParity.test.ts` | Web-report DTO and PDF renderer receive the same snapshot version/content hash and contain identical risk IDs, bases, deadlines and recommendation. Repeated download does not create a second snapshot/PDF artifact. |

### 9.2 Browser E2E tests

Add Playwright (or an equivalent browser harness) and run each critical scenario on **desktop 1440×900** and **mobile 375×812**. Use only seeded synthetic data and the test email transport.

1. **Clean B2B fixture:** login through test magic link, select the R1 base tariff through a server promo grant, accept required consents while declining marketing, complete the 33-core projection with no branches, reload and resume, submit once, and assert no second submission/report artifact can be created.
2. **B2C critical fixture:** select B2C and a critical answer; assert consumer questions appear from the server response, critical input is not flattened into a general score, and the server-created escalation/CTA state is shown rather than an invented LLM explanation.
3. **Branch-change fixture:** activate partner and/or dispute branch, autosave branch answers, change the parent answer to deactivate the branch, reload from another device, and assert deactivated values are excluded from effective submission while history/revision is retained.
4. **Authorization negative journey:** user B opens user A’s public case URL, legacy token, report URL and PDF URL; every v2 resource must remain inaccessible with no existence disclosure. The legacy route is tested separately as acknowledged compatibility risk, not accepted as R1 evidence.
5. **Mobile behavior:** assert no horizontal scroll, operable sticky CTA, 44-pixel targets, visible keyboard focus, accessible save status, error summary/focus behavior, no iOS zoom-prone small inputs, and no file-upload UI or LLM widget on v2 routes.
6. **Gate negative journey:** with `R1_CLIENT_RUNTIME_ENABLED=false` or legal status draft, public Pilot landing exposes only a controlled unavailable response; it cannot request an active questionnaire, grant promo access, send a customer report or display draft legal terms as binding customer content.

### 9.3 Required CI / release evidence

CI should execute JSON/schema and fixture integrity validation, typecheck, unit suites, server authorization/integration tests, desktop/mobile E2E tests, and a route inventory asserting new protected endpoints do not use `publicProcedure`. The Release 1 evidence bundle should include the exact config manifest/hash used in tests, fixture IDs, a report/PDF snapshot parity record, authz negative matrix, test-transport capture metadata with secrets redacted, and a declaration that R1 customer runtime stayed disabled because legal approval is pending.

## 10. Risks and non-negotiable migration constraints

| Risk | Current evidence | Required treatment |
|---|---|---|
| Legacy bearer access | `getSession`, answers, documents, report and PDF read by raw `sessionToken`; paid router is public. | Retain only as explicitly documented compatibility risk. Do not invoke it from v2 or use its token in migration/auth; prioritize owner-bound v2 isolation. |
| Ownership inference | Legacy paid session holds contact email but no `customerAccountId`. | Claim/quarantine only; never join legacy owner by email, cookie, domain, name, IP or knowledge of token. |
| Legal launch | Legal configs and questionnaire schema are draft; legal documents in React are not the approved config workflow. | No customer runtime launch, activation, client report or assertion of approval. A technical test gate is not legal approval. |
| Client-side business/legal logic | Current UI owns promo, price, visibility, completion and consent presentation. | New React code must render server DTOs and interaction state only. Server owns config selection, visibility, validation, terms versions, entitlement and state. |
| Payment / price | Current browser validates `123`, calls `confirmPayment`, and shows 4,900 RUB; target base tariff is 6,900 RUB. | No real payment in R1; server-only promo record/access grant; base tariff DTO snapshot; legacy price remains only legacy. |
| LLM | Paid completion calls `invokeLLM`; global widget mounts from `App`. | No LLM in v2 R1, including report wording/rephrasing. Enforce disabled flag and test zero calls. |
| Documents | Legacy v1 accepts base64 upload, trusts metadata, returns storage URL; documents belong to R2. | Exclude upload from R1 v2 entirely. Do not treat legacy endpoint as R2 implementation. |
| Resume integrity | Browser local storage saves token/answers and ignores failed autosaves. | Server canonical draft, revision/idempotency, same-owner cross-device resume and visible failure/conflict state. |

## 11. Final status

**Static configuration readiness:** The questionnaire selection itself is technically sound: 33 core, six branch questions, all 24 critical inputs active, correct draft metadata, and Release 0 validator pass.
**Runtime readiness:** **Not ready.** The requested module is still legacy v1 runtime; it neither consumes v2 nor meets owner-bound access, server visibility/validation, cross-device resume, consent provenance, tariff, no-document, no-LLM, email-test-transport or snapshot requirements.
**Launch status:** **Prohibited by explicit user decision and the unresolved legal gate.** The recommended next action is to approve the side-by-side protected technical foundation and tests with the v2 customer-runtime gate permanently false. Do not remove legacy routes in that work; document them as compatibility risk. Do not activate v2 legal content, customer flow or client/runtime launch until the stated future approval decision is formally made.

## References

[1]: file:///home/ubuntu/Neolex/shared/legal-core/questionnaire_v2.json "Release 0 draft questionnaire v2 with Pilot selection and release flags"
[2]: file:///home/ubuntu/Neolex/tools/validate-release-0.py "Release 0 questionnaire, fixture and configuration validator"
[3]: file:///home/ubuntu/Neolex/server/paidRouter.ts "Current legacy paid tRPC router"
[4]: file:///home/ubuntu/Neolex/client/src/pages/PaidDiagnostic.tsx "Current legacy paid diagnostic client flow"
[5]: file:///home/ubuntu/upload/ТЗ3.0.Веб-сервисплатнойюридическойдиагностикиLexy.docx "Lexy technical specification v3, §§30.3 and 31.3"
[6]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Release 0 owner-bound access matrix"
[7]: file:///home/ubuntu/Neolex/docs/architecture/state-machines-v1.md "Release 0 lifecycle state-machine contract"
[8]: file:///home/ubuntu/Neolex/docs/migrations/v1-to-v2.md "Release 0 v1-to-v2 migration and ownership plan"
[9]: file:///home/ubuntu/Neolex/docs/architecture/payment-model-v1.md "Release 0 payment, promo access and credit model"
[10]: file:///home/ubuntu/Neolex/docs/operations/environment-and-service-accounts-v1.md "Release 0 environment, email test transport and service-account contract"
[11]: file:///home/ubuntu/Neolex/docs/data/file-retention-policy-v1.md "Release 0 document handling and Release 2 boundary"
