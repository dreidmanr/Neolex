# Release 1 — implementation plan защищённого v2 Pilot

**Автор:** Manus AI
**Репозиторий:** `/home/ubuntu/Neolex`
**Ветка аудита:** `feat/lexy-release-1-pilot`
**Базовый commit аудитов:** `0c7f80f96cd2fe68450b59141df0c0988190570a`
**Статус документа:** план реализации; runtime-код, конфигурации, legal artifacts и миграции этим документом не изменяются

## 1. Решение и граница Release 1

Release 1 следует реализовать как **отдельный add-only v2 vertical slice**, а не как расширение `paidRouter`, `paidDb` или legacy token routes. Порядок реализации обязателен: **access control → magic link → promo access → questionnaire → rules engine → web report → PDF → E2E**. Следующий increment начинается только после выполнения acceptance предыдущего. Такой порядок не позволяет UI, бизнес-операции или выдачу отчёта появиться раньше owner-bound защиты ресурса.[1] [2] [3] [4] [5]

> **Текущий разрешённый результат — только `R1 technical build/test; client launch prohibited`.** Human legal approval отложен до финального этапа. Все questionnaire, rules, legal-basis, phrase, report, fixture, tariff и credit-policy artifacts остаются `draft_pending_legal_approval`. Production/client runtime обязан fail-closed отклонять draft bundle. Синтетический test runner может использовать pinned draft bundle только в изолированном non-production канале с явной маркировкой `technical_test_only`.

### 1.1 Зафиксированные решения

| Область | Обязательное решение | Практическое следствие |
|---|---|---|
| Legal approval | Human legal approval выполняется только после завершения всех технических increments и отдельного review. | Код не меняет status legal artifacts на `approved`. Прохождение fixtures, schema validation или E2E не является legal approval. |
| Client launch | Пока legal artifacts имеют draft status, client/runtime launch запрещён. | `LEXY_R1_CLIENT_RUNTIME_ENABLED=false` является safe default. Production startup или route gate не должен допускать questionnaire, scoring, report, PDF или customer legal content из draft bundle. |
| Test execution | Допустим изолированный синтетический test/staging канал. | `LEXY_R1_SYNTHETIC_TEST_MODE` может быть включён только в non-production с test identity, disposable DB, fixed clock, test mailbox и явным watermark. |
| Legacy access | Legacy `/diagnostic`, `/results/:token`, `/paid`, `/paid/results/:token`, current tRPC paid/free procedures и token PDF routes сохраняются по решению владельца. | Это **открытый P0 compatibility risk**, а не часть v2. Legacy token не принимается ни одним v2 API. Пока legacy bearer access доступен, нельзя заявлять глобальное соответствие §31.3 или launch readiness. |
| v2 access | Каждый v2 case создаётся с `customerAccountId NOT NULL`; любой read/write использует server customer session → owner predicate → access/state predicate. | Public ID, email, `sessionToken`, OAuth user, storage key и URL являются locator/attribute, но никогда credential. Anonymous получает `401`; authenticated non-owner — нейтральный `404`. |
| Admin identity | Текущий OAuth остаётся отдельным admin contour. | Admin OAuth не создаёт customer identity и не доказывает ownership. Admin v2 list требует role, purpose, minimal DTO и audit. |
| Email | В R1 реализуются только `EmailAdapter` и allowlisted `TestEmailTransport`. | Нельзя добавлять SMTP/API provider, production domain, provider secret, webhook, delivery claim или production send. Internal `notifyOwner` не считается customer email. |
| LLM | **LLM off.** | v2 не импортирует и не вызывает `invokeLLM`. `LEXY_LLM_MODE=disabled` обязателен для R1 test/deploy. Pilot route tree не монтирует LLM widget. Наличие legacy LLM call остаётся launch blocker, пока оно не изолировано или не заменено deterministic fallback отдельным изменением. |
| Payments | В R1 нет PSP, webhook, refund или reconciliation. | Только server-side promo создаёт `payment_record.status=promo_granted`, `chargedAmount=0` и owner-bound `access_grant`. Browser не может подтвердить оплату или статус. |
| Documents | Upload, document analysis и storage download не входят в v2 R1. | Legacy document flow сохраняется как risk; v2 base tariff не имеет document UI/API и не использует `storageUrl` как authority. |
| Migration | V1 не переписывается и owner не выводится из email, cookie, OAuth identity, IP или legacy token. | Только expand, source registration, verified claim или quarantine, immutable provenance и reconciliation. Rollback не удаляет v1/v2 evidence. |

### 1.2 Сквозные инженерные инварианты

Все v2 mutations являются typed commands. Команда канонизирует request, проверяет idempotency key и request hash, блокирует/читает aggregate, выполняет conditional transition по expected state и `stateVersion`, записывает domain fact, append-only audit и deduplicated outbox в **одной DB transaction**. Ошибка audit/outbox откатывает business mutation. Generic public `updateStatus` запрещён.[1]

Схема расширяется последовательными add-only migrations. Ни один increment не выполняет `DROP`, `DELETE`, backfill owner в v1, изменение legacy token или автоматическую конвертацию v1 answers/report. На production-like DB DDL разрешается только после inventory, backup/restore rehearsal, online-DDL assessment и dry-run reconciliation.[1] [6]

### 1.3 Дорожная карта и dependency gates

| Порядок | Vertical increment | Выход increment | Gate к следующему increment |
|---:|---|---|---|
| 1 | Access control | Отдельный customer/admin context, owner-bound case root, shared policy, audit/idempotency/outbox foundation | Полная owner matrix проходит для tRPC и HTTP test endpoint; v1 token не авторизует v2 |
| 2 | Magic link | Hash-only one-time token, customer session cookie, logout/revoke, test delivery | Request/consume/replay/expiry/race/cookie tests проходят; raw token отсутствует в persistence/logs |
| 3 | Promo access | Server tariff DTO, explicit consents, zero-charge promo ledger и grant | Один payment/grant при retry/race; provider disabled; questionnaire без grant недоступен |
| 4 | Questionnaire | Server projection 33 core + до 6 branches, revisioned autosave, cross-device resume, immutable submit | Canonical visibility/validation и concurrency tests проходят; повтор submit не создаёт второй snapshot |
| 5 | Rules engine | Pinned config validator, closed AST, critical overrides, escalation и exactly-one recommendation | Все 15 fixtures детерминированы; draft runtime fail-closed; `invokeLLM` calls = 0 |
| 6 | Web report | Versioned immutable report snapshot и owner-bound report UI | Web model читается только из ready snapshot; replay даёт тот же report; provenance validation проходит |
| 7 | PDF | Один persisted PDF artifact из того же ReportViewModel | Web/PDF semantic parity и authz matrix проходят; download URL не содержит credential |
| 8 | E2E | Desktop/mobile journey, minimal cabinet/admin, test evidence bundle, migration rehearsal | Полный synthetic path проходит; launch остаётся NO-GO до устранения blockers |

## 2. Vertical increment 1 — Access control

**Цель.** Сначала создать непересекающиеся admin и customer security boundaries и доказать owner isolation на минимальном v2 resource. Business flow, magic-link issuance, promo, questionnaire и report в этом increment ещё отсутствуют.

| Обязательная часть | План |
|---|---|
| **Schema** | В `drizzle/schema.ts` add-only добавить `customer_accounts`, `customer_account_identities`, `customer_sessions`, `diagnostic_cases`, `idempotency_records`, `audit_events`, `outbox_events`, `legacy_ownership_cases`, `legacy_resource_links`, `migration_runs` и `migration_reconciliation_records`. `diagnostic_cases.customerAccountId` — `NOT NULL` FK `RESTRICT`; `publicId` — unique; read index — `(customerAccountId, status, updatedAt)`. Session хранит только unique keyed hash, expiry/revocation. Audit/outbox append-only и не содержат token, email, answer, URL или secret. Ожидаемая migration — `drizzle/0005_r1_access_control_expand.sql`; фактический номер перепроверяется перед merge. |
| **Files** | Изменить `server/_core/context.ts`, `server/_core/trpc.ts`, `server/routers.ts`, минимально `server/_core/cookies.ts` и `server/db.ts`. Добавить `server/r1/repositories/`, `server/r1/policy/accessPolicy.ts`, `server/r1/policy/errors.ts`, `server/r1/transitions/transitionService.ts`, `server/r1/audit/auditService.ts`, `server/r1/outbox/outboxRepository.ts`, `server/r1/cases/caseRepository.ts`, `server/r1/cases/router.ts`, `server/r1/admin/router.ts`, `server/r1/releaseGate.ts`. `server/paidRouter.ts`, `server/paidDb.ts`, existing PDF/storage routes остаются legacy и не импортируются новым кодом. |
| **APIs** | `pilot.me`, `pilot.cases.list`, `pilot.cases.get` и test-only owned-case seed/create command под `customerProcedure`; `pilotAdmin.diagnostics.list({purposeCode,cursor,filters})` под existing admin OAuth role. Customer input не содержит `customerAccountId`. Shared policy применяется после server resource lookup. Error contract: anonymous `401`, other owner/nonexistent opaque resource одинаковый neutral `404`, missing admin role/purpose `403`. |
| **UI** | Добавить route shells `/pilot` и `/cabinet`, но при текущем gate `/pilot` показывает controlled unavailable state, а `/cabinet` не раскрывает data без customer session. Добавить минимальный `/admin/pilot-diagnostics` только после server procedure; list DTO содержит opaque case ID, timestamps, tier, status, risk/escalation/report flags. Не переносить rich legacy admin, PII, answers, report body, token или export. `LexyWidget` не монтируется в Pilot route tree. |
| **Tests** | `schema.integration.test.ts`: v1 baseline → expand, FKs/indexes/uniques, no destructive SQL. `accessPolicy.test.ts` и `v2OwnerMatrix.integration.test.ts`: anonymous/customer A/customer B/admin/worker. `context.auth-separation.test.ts`: admin cookie, customer cookie и bearer header не смешиваются. `transitionService.test.ts`: allowed/forbidden state edges, stateVersion CAS, same/different idempotency request hash, audit/outbox atomic rollback. `legacyCompatibilityRisk.test.ts`: legacy route остаётся зарегистрирован, но token не принимается v2. `adminAudit.integration.test.ts`: purpose, pagination, minimal DTO, audit. |
| **Migration** | До DDL сформировать v1 manifest: counts, PK ranges, null/duplicate/orphan profile, report/document metadata hashes; выполнить encrypted backup/restore rehearsal. Применить только empty-target expand в disposable и staging MySQL. Не создавать customer owner для legacy rows. По желанию выполнить только idempotent registration legacy roots в `legacy_ownership_cases.status=unassigned`; claim не выполняется. |
| **Rollback** | Отключить mount `pilot`/`pilotAdmin` и v2 writer feature flag, вернуть read traffic на неизменённый legacy contour. Не дропать v2 tables и не удалять audit/idempotency/migration evidence. Зафиксировать rollback event и reconciliation checkpoint. |
| **Acceptance** | Технический increment принят, если каждая v2 case operation требует server customer session и owner join; other-owner получает neutral `404`; legacy token/email/ID/storage key не дают доступ; admin/customer identities не пересекаются; audit/outbox/state change атомарны; v1 smoke tests не регрессируют. Это **не** закрывает global §31.3 из-за сохранённого legacy access и не разрешает launch. |

## 3. Vertical increment 2 — Magic link

**Цель.** Добавить отдельную customer authentication lifecycle поверх готового access policy. Email используется только как проверяемый login identity; он не является доказательством ownership legacy data.

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `magic_link_tokens`, `email_deliveries` и durable privacy-preserving rate-limit records. Token fields: `tokenHash`, account/identity/request scope, `expiresAt`, `consumedAt`, `revokedAt`, safe correlation; raw token не сохраняется. Delivery lifecycle: `queued → sending → sent|failed|suppressed`, unique dedupe tuple и bounded attempts. Ожидаемая migration — `0006_r1_magic_link_expand.sql`. |
| **Files** | Добавить `server/r1/auth/magicLinkService.ts`, `customerSessionService.ts`, `customerAccountRepository.ts`, `rateLimitStore.ts`, `router.ts`; `server/r1/email/EmailAdapter.ts`, `TestEmailTransport.ts`, `emailDeliveryService.ts`, `mailWorker.ts`; cookie builder в `server/_core/cookies.ts`; страницы `client/src/pages/RequestMagicLink.tsx`, `MagicLinkConsume.tsx`. Test inbox доступен только harness, не customer/admin API. |
| **APIs** | Public `pilot.auth.requestMagicLink({email})` всегда возвращает neutral `202 {accepted:true}` для valid request, включая unknown/suppressed/rate-limited cases. `POST /api/r1/auth/magic-link/consume` принимает raw token один раз, выполняет atomic conditional consume + customer session create и устанавливает `__Host-lexy-customer-session`. `pilot.auth.me`, `pilot.auth.logout`; Authorization-header fallback запрещён. Email link использует fragment на consume page либо immediate clean redirect, чтобы token не попадал в access log/Referer. |
| **UI** | `/auth/request-link` показывает одинаковое подтверждение без account enumeration. `/auth/consume` читает fragment, делает один POST, сразу очищает URL/history и переходит на `/cabinet`; token не пишется в localStorage/sessionStorage. Invalid/expired/replayed cases имеют neutral retry UX. Customer cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, без `Domain`. |
| **Tests** | Unit: entropy/verifier, hash-only storage, expiry, revoke, replay, malformed token, two-consumer race, logout/session expiry, cookie flags, neutral rate limit, forbidden log fields. Integration: known/unknown request parity, request → outbox → allowlisted test inbox → consume → clean redirect, session lookup, second-device login, admin/customer cookie boundary. Email tests: dedupe, transient retry, cap, suppression, startup rejection любого transport кроме `test`. |
| **Migration** | Add-only migration без изменения `users`, OAuth rows, `paid_sessions.contactEmail` или legacy cookies. Existing emails не связываются с customer account автоматически. Нормализованный identity hash служит только login routing в v2. Legacy claim остаётся `unassigned/quarantined`. |
| **Rollback** | Отключить request/consume routes и mail worker; отозвать незавершённые magic tokens и активные test customer sessions условными state changes; сохранить delivery/audit rows. Не откатывать удалением таблиц и не возвращать customer auth к admin OAuth или bearer token. |
| **Acceptance** | Один valid token создаёт ровно одну server customer session; replay/expiry/revoke/race не создают session; public response не раскрывает наличие account; cookie contract проходит; raw token отсутствует в DB, outbox, audit, metrics и обычных logs; письмо существует только в controlled test inbox. Client launch по-прежнему закрыт. |

## 4. Vertical increment 3 — Promo access

**Цель.** Создать access entitlement только из server-controlled promo command. Browser не определяет promo validity, price, payment state, campaign или owner.

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `tariff_snapshots`, `case_consents`, `payment_records` и `access_grants`. Для R1 допустим `payment_records.status=promo_granted`, `chargedAmount=0`; unique redemption scope `(customerAccountId,campaignId,tariffCode)` и unique `(caseId,paymentRecordId)` grant. Consent append-only хранит document ID/version/hash, explicit boolean, actor session и server UTC timestamp. Ожидаемая migration — `0007_r1_promo_access_expand.sql`. |
| **Files** | Добавить `server/r1/billing/tariffService.ts`, `promoService.ts`, `paymentRepository.ts`, `accessPolicy.ts`, `router.ts`; `server/r1/consents/consentService.ts`, `server/r1/legal/documentRegistry.ts`; UI `client/src/pages/PilotAccess.tsx`, `ConsentChecklist.tsx`, `PromoForm.tsx`. В `client/src/pages/Home.tsx` новый v2 entry не содержит literal verifier; legacy page не переписывается в этом increment. |
| **APIs** | `pilot.access.getOffer()` возвращает только server DTO base tariff; `pilot.consents.getRequiredMetadata()` и `record()` доступны только synthetic test mode, пока registry draft; `pilot.access.redeemPromo({tariffCode,promoValue,idempotencyKey})` server-side проверяет protected verifier constant-time и в одной transaction создаёт owner-bound case, tariff snapshot, payment record, access grant, `draft → access_granted`, audit и outbox. Amount, owner, campaign и status из browser отклоняются/игнорируются. V2 не имеет `confirmPayment`. |
| **UI** | В закрытом production gate показывается только Pilot unavailable. В synthetic mode UI показывает server offer, отдельные explicit mandatory consents и отдельный marketing opt-in, затем promo form. React не содержит price source of truth, promo literal, legal wording/version, accepted timestamp или transition logic. Document tariff/upload отсутствуют. |
| **Tests** | `promoService.test.ts`: valid/invalid code, unsupported tariff, client authority fields, same-key replay, changed request conflict, different-key duplicate, concurrent redemption. DB integration проверяет один zero-charge payment, один grant и один transition. Static build/source scan проверяет отсутствие verifier/hash/pepper в `client/` и assets. Consent tests запрещают default `true`, stale version и combined marketing consent. Provider-disabled test отклоняет любой non-disabled PSP mode. Authz test запрещает questionnaire/report до grant и после revoke/expiry. |
| **Migration** | Не переносить legacy `paymentStatus`, 4,900 RUB или public `confirmPayment` в v2 ledger. Не создавать payment/access из legacy token или email. Тестовые tariff snapshots помечаются draft/test-only и не доказывают коммерческое/legal approval. |
| **Rollback** | Отключить redemption route и access writer. Новые grants переводить в `revoked` только через audited command, не удалять payment/consent facts. Case остаётся owner-bound; v1 не меняется. PSP не включается как fallback. |
| **Acceptance** | Успешная server promo command даёт ровно один `promo_granted` payment и один owner-matching active grant; retry/race не дублируют; charged amount равен нулю; raw promo отсутствует в persistence/log/DTO/client build; browser не может назначить paid/access/status. Draft legal gate не позволяет реальному customer flow. |

## 5. Vertical increment 4 — Questionnaire

**Цель.** Реализовать server-authoritative questionnaire, autosave и immutable submit. React получает projection, но не legal/business decision rules. Release 0 bundle используется только test loader, пока остаётся draft.[3]

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `questionnaire_drafts`, `questionnaire_answer_revisions`, `questionnaire_submissions`. Draft хранит case, pinned questionnaire release/hash, `draftRevision`, cursor и visibility hash. Revision unique `(draftId,questionId,revision)` и client-mutation dedupe. Submission unique `(caseId,submissionVersion)` и `(caseId,inputSnapshotHash)`; submitted bytes/activation snapshot immutable. Ожидаемая migration — `0008_r1_questionnaire_expand.sql`. |
| **Files** | Добавить `server/r1/legal/configBundle.ts`, `server/r1/questionnaire/questionnaireService.ts`, `visibility.ts`, `validation.ts`, `repository.ts`, router procedures в `server/r1/cases/router.ts`; shared presentation-only DTO `shared/r1/questionnaire.ts`; UI `client/src/pages/CaseQuestionnaire.tsx`, `client/src/components/r1/questionnaire/QuestionRenderer.tsx`, `QuestionNavigator.tsx`, `AutosaveStatus.tsx`, `useQuestionnaireDraft.ts`. Не импортировать `shared/legal-core/questionnaire_v2.json` в client bundle. |
| **APIs** | `pilot.cases.getDraft({caseId})`; `saveAnswer({caseId,questionId,value,clientMutationId,expectedDraftRevision})`; `submit({caseId,idempotencyKey})`. Server определяет block/type/options/requiredness/visibility, возвращает canonical value, revision, visible IDs, deactivated IDs, progress и safe follow-up flag. Submit перечитывает persisted canonical answers, recomputes visibility, validates required active values, freezes snapshot и создаёт scoring outbox. Client answer map не принимается. |
| **UI** | Mobile-first generic renderer: текущий вопрос/активный total, accessible radio/checkbox/text, `aria-live` save status, visible Saving/Saved/Offline/Conflict, no horizontal overflow, controls ≥44×44. Single/multi answers сохраняются сразу, text — debounced; explicit clear сохраняется. No localStorage credential/authoritative answers, no file upload, no LLM widget. Cross-device resume идёт через fresh magic link и server draft. |
| **Tests** | Contract: 63 total, exactly 33 Pilot core + 6 branch, 24 critical inputs, unique IDs/references; сохранить `tools/validate-release-0.py`. Visibility: B2C, partners, dispute optional `b12_q2`, disabled investment/contractor policy, branch deactivation. Validation: unknown/inactive question, invalid option/shape, duplicate multi, stale revision, text clear, post-submit mutation. Concurrency/idempotency: same mutation replay, second-device conflict, double submit, failed save status. Authz: A/B/anonymous, leaked legacy token. |
| **Migration** | V1 answers не конвертируются. Legacy report/answers остаются read-only evidence и не feed-ят v2 evaluator. New draft создаётся только для owner-bound case с active grant. Config release ID/hash фиксируется при создании; смена draft bundle не переписывает существующий draft/submission. |
| **Rollback** | Отключить questionnaire router/UI и scoring outbox consumption. Сохранить draft/revision/submission history. Не удалять ответы и не переносить их обратно в v1. Незавершённый v2 case остаётся недоступен до повторного enable или audited archive. |
| **Acceptance** | Server projection корректно даёт 33 core и только активные branches; inactive/injected answers не влияют на submit; cross-device same-owner resume восстанавливает canonical state; conflict не скрывается; repeated submit создаёт один immutable submission/outbox; non-owner не видит и не меняет draft. Acceptance остаётся synthetic test-only. |

## 6. Vertical increment 5 — Rules engine

**Цель.** Реализовать pure deterministic evaluator над immutable canonical submission. Engine не выполняет I/O, не читает mutable UI state и не использует LLM.

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `expert_escalations` и при необходимости versioned evaluation run/result records, связанные с submission hash и pinned config bundle. Unique escalation `(caseId,triggerSnapshotHash)`. Actual queue/event nullable до реального audited routing; required queue codes хранятся sorted/deduplicated. Ожидаемая migration — `0009_r1_engine_expand.sql`. |
| **Files** | Добавить `shared/legal-core/runtime/types.ts`, `configBundle.ts`, `astEvaluator.ts`, `evaluator.ts`, `recommendationEvaluator.ts`, `r1ProfileValidator.ts`; `server/r1/scoring/scoringWorker.ts`, `evaluationService.ts`, `escalationService.ts`. `server/paidRouter.ts` и legacy `scorePaidDiagnostic` не используются. Добавить explicit `server/r1/llm/disabled.ts`/release invariant; R1 modules не импортируют `invokeLLM`. |
| **APIs** | Внешний mutation отсутствует: scoring запускается только outbox event после submit. `pilot.cases.getStatus({caseId})` возвращает safe lifecycle (`submitted/scoring/manual_review_required/report_ready/failed`) без draft legal result. Worker получает internal IDs, повторно проверяет state/access/config hash и выполняет closed AST phases. Browser не передаёт score, risk, recommendation или status. |
| **UI** | Только status/progress/controlled hold. При critical/manual result показывается neutral test-only escalation state/CTA без invented assignee, SLA, queue event или legal conclusion. В production при draft config scoring не стартует и client UI остаётся unavailable. |
| **Tests** | Config schema/hash/cross-reference tests; runtime draft rejection; все AST operations, trace, missing/unknown reference fail-closed; 15 fixture regression tests; eight critical overrides; max-severity semantics; evidence derivation; lexicographically sorted queues; stop factors, tie-break, fallback and exactly-one recommendation. R1 profile rejects document-confirmed evidence, provider data, fabricated provenance и LLM metadata. `LLM-01` mocks `invokeLLM` and requires zero calls for every fixture/path. Worker lease/retry/dedupe and transition atomicity tests обязательны. |
| **Migration** | Existing v1 score/report не импортируется и не переоценивается. Evaluation records создаются только из v2 submission hash. Draft fixtures являются technical oracle, не legal truth. Unknown/missing provenance ведёт к classified failure/manual disposition, а не к synthetic default. |
| **Rollback** | Остановить scoring worker, оставить outbox pending/failed и case в safe non-published state. Не публиковать partial result и не подменять engine legacy scoring/LLM. Сохранить trace, failure class и audit для повторного запуска той же versioned implementation. |
| **Acceptance** | Одинаковый pinned input даёт byte-stable canonical result/trace; fixtures, overrides, escalation и exactly-one recommendation проходят; malformed/unknown config fail-closed; no report публикуется при error; `invokeLLM` call count = 0 и R1 startup отклоняет LLM-enabled mode. Legal approval всё ещё не дан. |

## 7. Vertical increment 6 — Web report

**Цель.** Построить один immutable versioned report snapshot из validated engine output и отображать web report только из него.

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `report_snapshots` и `credit_entitlements`. Snapshot unique `(caseId,reportVersion)` и `(caseId,inputSnapshotHash,generationReason)`; статусы `pending/generating/ready/failed/superseded`; ready JSON/content hash immutable; `generationMode=template`. Entitlement unique по source payment/report/policy, 6,900 RUB, expiry policy, `automaticRedemptionEnabled=false`. Ожидаемая migration — `0010_r1_web_report_expand.sql`. |
| **Files** | Добавить `server/r1/reports/reportSnapshotBuilder.ts`, `reportGenerationService.ts`, `reportViewModel.ts`, `templateRenderer.ts`, `provenanceValidator.ts`, `router.ts`; `server/r1/credits/creditEntitlementService.ts`; UI `client/src/pages/CaseReport.tsx`, `client/src/components/r1/report/*`. Использовать `shared/report/report_schema_v1.json` только через pinned test validator; status остаётся draft. |
| **APIs** | Internal worker: evaluate result → build complete snapshot → validate schema, cross-references, provenance, R1 profile and exactly-one recommendation → conditional ready commit. External `pilot.reports.getByCase({caseId})` owner-loads case/report and возвращает `ReportViewModel`; request не выбирает owner или arbitrary storage object. Repeated get/submit не создаёт новую version. Supersession возможен только отдельной approved recalculation command и после ready successor. |
| **UI** | Authenticated `/cabinet/cases/:caseId/report` отображает server-projected sections без rewriting legal text: risks/order/levels, evidence, bases, roadmap, limitations, escalation, one recommendation, test-only credit. Draft/test output имеет явный watermark и недоступен в production client gate. Share/public token URL отсутствует. |
| **Tests** | Snapshot schema/cross-reference/provenance validation; reject invented legal URL/date, approval, queue event, provider receipt, document locator. RFC 8785 canonical hash, ready immutability, replay, concurrency, failure rollback and supersession. Report view model tests for clean/critical/escalation fixtures and exactly one recommendation. Credit tests: qualifying promo source, duplicate prevention, expert-review ineligibility, legacy 4,900 rejection, revoke/expiry, Europe/Moscow inclusive 14-day boundary. Authz owner matrix. |
| **Migration** | Legacy `paid_reports` не преобразуются в report snapshots и не рендерятся заново. V2 snapshots создаются только из v2 submission/evaluation/payment provenance. Любая legacy projection маркируется `sourceModel=v1` и не выдаёт entitlement. |
| **Rollback** | Остановить report worker и скрыть v2 report route feature flag. Ready snapshots/entitlements не удалять и не mutate; pending jobs переводить в audited failed/cancelled по policy. Не возвращаться к mutable legacy report или LLM fallback. |
| **Acceptance** | Для одной submission существует один ready report version; retries возвращают ту же identity; ready bytes/hash неизменяемы; renderer не вычисляет legal facts; owner A видит свой report, B получает neutral `404`; draft production runtime не публикует report; LLM remains zero-call. |

## 8. Vertical increment 7 — PDF

**Цель.** Создать один persisted PDF artifact из того же snapshot-derived `ReportViewModel`, который использует web report, и выдавать его только после owner/access/state check.

| Обязательная часть | План |
|---|---|
| **Schema** | Добавить `report_artifacts`: `reportSnapshotId`, format, renderer version, protected object reference, content hash, state, timestamps; unique `(reportSnapshotId,format,rendererVersion)`. Никакой public storage URL или token credential. Ожидаемая migration — `0011_r1_pdf_expand.sql`. |
| **Files** | Добавить `server/r1/reports/pdfService.ts`, `pdfArtifactWorker.ts`; расширить `server/pdfGenerator.ts` отдельным v2 renderer, не меняя legacy interface; в `server/pdfRoutes.ts` добавить отдельный protected route через shared access policy. UI — `client/src/components/r1/report/PdfDownload.tsx`. Legacy `/api/pdf/*/:sessionToken` сохраняется как documented risk и не вызывается v2 UI. |
| **APIs** | Internal PDF outbox job создаёт at most one artifact from exact ready snapshot/view-model. `GET /api/r1/reports/:reportId/artifacts/pdf` получает customer session из cookie, owner-loads report → case, проверяет active grant/report state/revocation, пишет access audit и stream-ит persisted artifact. Report ID — locator, не credential; storage key не возвращается. |
| **UI** | Web report показывает version-aware Download PDF только при `artifactReady=true`. URL не содержит magic/session/legacy token и не сохраняется как permanent public link. Revoked/expired access даёт controlled denial. UI не инициирует regeneration. |
| **Tests** | `pdfGenerator.v2.test.ts`: render и extracted-text assertions. `reportParity.test.ts`: одинаковые risk IDs/order/levels/text, evidence, bases, roadmap/deadlines, limitations, escalation, recommendation и credit между web model и PDF. `pdfRoutes.v2.integration.test.ts`: anonymous/owner/non-owner/admin/revoked/old version. Concurrent render/download/retry создаёт один artifact. Scanner запрещает credential/storage URL в route/DTO/log. |
| **Migration** | Не копировать legacy PDF bytes/URLs в v2 artifact и не regenerate legacy PDF из current mutable data. Existing token PDF endpoints остаются отдельно, не засчитываются в acceptance. V2 object references создаются только новым artifact worker. |
| **Rollback** | Остановить PDF worker и route flag; сохранить artifact row/object/hash и audit. Не дропать artifact и не переключать v2 download на legacy token PDF. Pending job остаётся retriable после восстановления renderer version. |
| **Acceptance** | PDF создан один раз из exact ready snapshot/version; semantic parity с web подтверждена; owner-only access и revocation работают; URL не является bearer credential; retries не создают второй artifact; legacy route остаётся явно вне v2 pass. |

## 9. Vertical increment 8 — E2E

**Цель.** Собрать весь путь без ручной DB правки, доказать desktop/mobile поведение и отрицательную security matrix, а также сформировать evidence bundle. Этот increment не меняет legal status и не превращает технический Pilot в client launch.

| Обязательная часть | План |
|---|---|
| **Schema** | При необходимости добавить `product_events` с allowlisted event type и безопасными dimensions, без email/token/answers/URL/legal text; indexes для aggregate completion metrics. Новая migration — `0012_r1_e2e_ops_expand.sql`. Никаких production analytics pipelines. |
| **Files** | Добавить `playwright.config.ts`, `e2e/fixtures/`, `e2e/r1-protected-pilot.spec.ts`, `e2e/r1-negative-access.spec.ts`, `e2e/r1-admin.spec.ts`, deterministic DB/test-mailbox bootstrap, fixed-clock helpers. Добавить `client/src/pages/Cabinet.tsx` и `AdminPilotDiagnostics.tsx` либо завершить их минимальные projections. Обновить CI scripts в `package.json` только на этапе реализации. Evidence — `docs/release-1/evidence/technical-r1-manifest.md`; decision log фиксирует NO-GO. |
| **APIs** | Проверяется весь набор предыдущих increments. Дополнительно `pilotAdmin.diagnostics.list` и protected aggregate metrics требуют admin role + purpose + audit. Test mailbox endpoint доступен только harness identity и не монтируется в production. Нет public test backdoor, seed endpoint или raw-token API. |
| **UI** | Desktop 1440×900 и mobile 375×812: unavailable production landing; synthetic test landing → request link → consume → cabinet → consent/promo → questionnaire/autosave → status → web report → PDF. Cabinet показывает только own active/completed cases, safe status/progress/report/PDF availability. Admin screen минимален и cursor-paginated. No LLM widget, file upload, rich CRM, raw credentials или public share. |
| **Tests** | E2E: test-mailbox magic login; token removal/cookie; promo and consents; clean B2B; critical B2C; branch deactivation; desktop→mobile resume; duplicate promo/submit; one report/PDF; parity; cross-owner copied URL denial; replayed/expired link; transport failure/suppression; admin purpose/audit; no overflow/accessibility save-state checks. CI также запускает typecheck, unit/integration, all 15 fixtures, disposable-MySQL migrations, forbidden-field scans, build scan for promo verifier, route inventory, provider-disabled and LLM-zero-call checks. Legacy smoke имеет label `expected compatibility risk` и не входит в v2 security pass rate. |
| **Migration** | Выполнить полный dry-run: inventory/restore proof → expand migrations → idempotent legacy root registration → no-email-inference tests → claim-race/quarantine simulation → count/hash/document-metadata reconciliation. Реальные legacy claims не включать без утверждённой evidence policy. Все E2E data synthetic; cleanup удаляет только disposable environment, не production evidence. |
| **Rollback** | Один operational action отключает v2 routers/workers/UI flag и synthetic mode. Сохраняются v2 data, audit, outbox, idempotency, report/artifact hashes, migration ledger и reconciliation. Legacy продолжает работать в текущем состоянии. Rollback не включает `DROP`, source mutation, owner re-inference или report regeneration. |
| **Acceptance** | Technical E2E accepted, если desktop/mobile full path проходит без manual DB work; second device restores server draft; cross-owner access neutral-denied; duplicate commands дают один payment/grant/submission/report/PDF; all fixtures deterministic; LLM/provider external calls отсутствуют; email только test transport; draft-production launch test fail-closed. Итоговый статус остаётся **NO-GO for client launch / formal global §31.3 acceptance blocked**. |

## 10. Сквозная migration и rollback стратегия

### 10.1 Последовательность migration

| Фаза | Действие | Hard stop |
|---|---|---|
| M0 — freeze | Зафиксировать commit, v1 schema/source manifest, feature defaults и risk register. | Нет согласованного manifest или legal/client gate может включиться. |
| M1 — backup/restore | Inventory всех v1 roots/children, anomalies, JSON, reports/doc metadata; restore rehearsal и hash/count check. | Restore/count/hash не совпадает. |
| M2 — expand | Применять `0005…0012` последовательно сначала к disposable DB, затем staging/production-like DB. | Destructive SQL, unknown MySQL capability, table lock beyond approved window или v1 regression. |
| M3 — register | Создать по одной `legacy_ownership_cases` record на v1 root, initial status `unassigned`; children только link/anomaly. | Duplicate mapping, lost root/child или source mutation. |
| M4 — claim simulation | Проверить one-time scoped claim, races, expiry, collision и neutral failure только на synthetic data. | Любая email/token/cookie/IP-based owner inference. |
| M5 — quarantine | Неизвестный/conflicting owner остаётся `quarantined`/`manual_review`; v1 projection read-only. | Попытка auto-convert answers/report или выдать storage/PDF access по legacy locator. |
| M6 — reconciliation | Сверить root/link counts, source hashes, report/document metadata, ownership decisions, audit/outbox and authz-negative results. | Любая необъяснённая потеря, duplicate owner/link, missing audit или changed v1 hash. |
| M7 — future cutover | Отдельное owner/legal/security решение о real claim, legacy gate/decommission и client launch. | Не входит в этот план; при текущих решениях остаётся заблокировано. |

### 10.2 Общий rollback contract

Rollback является **feature rollback**, а не data rollback. Он отключает v2 routes, new writers и workers, сохраняет все committed facts и фиксирует checkpoint. V1 source rows остаются неизменными. Нельзя удалять account/case/submission/report/artifact/audit/idempotency/claim/reconciliation evidence, повторно назначать owner, изменять ready snapshot или пересобирать historical PDF из mutable state.

## 11. Open questions, разрешаемые безопасным default

Эти вопросы **не требуют пользовательского решения для начала реализации**. Команда принимает deny-by-default значение, документирует его и меняет только через review.

| Вопрос | Safe default Release 1 | Почему это безопасно |
|---|---|---|
| Имена namespace и файлов | `server/r1/*`, tRPC namespace `pilot`, client routes `/pilot` и `/cabinet`; migration numbers от текущего `0005`. | Изолирует v2 от legacy; номер миграции перепроверяется перед merge. |
| Feature gates | `R1_CLIENT_RUNTIME_ENABLED=false`; `R1_SYNTHETIC_TEST_MODE=false`; synthetic mode запрещён при `NODE_ENV=production`. | Ошибка конфигурации закрывает, а не открывает customer runtime. |
| LLM и providers | `LEXY_LLM_MODE=disabled`, `LEXY_PAYMENT_PROVIDER=disabled`, `LEXY_EMAIL_ADAPTER=test`; startup rejects другие R1 значения. | Не создаёт запрещённых external side effects. |
| Magic-link TTL | 15 минут; один active unconsumed token на identity/request scope; previous token revoked. | Ограничивает replay window; policy можно ужесточить без изменения ownership. |
| Customer session TTL | 8 часов absolute, server-side revoke/logout; fresh magic link для нового устройства. | Достаточно для test journey и не создаёт long-lived bearer JWT. |
| Rate limit | Neutral response; 3 requests/15 min на normalized recipient hash и 20/15 min на privacy-preserving source key; no raw email metric. | Снижает enumeration/abuse без раскрытия account existence. |
| Error mapping | `401` anonymous, neutral `404` authenticated non-owner/nonexistent, `403` role/purpose failure. | Соответствует deny-by-default и уменьшает existence leakage. |
| Promo uniqueness | Один grant на `(customerAccountId,campaignId,baseTariff)`; raw verifier только protected server config. | Предотвращает duplicate access и не требует PSP policy. |
| Outbox retry | Не более 3 attempts с bounded exponential backoff; revoked access/token → `suppressed`. | Ограничивает duplicate side effects; terminal state наблюдаем. |
| Escalation без operations owner | `required_not_routed`, `queueCode=null`, `queueEvent=null`; хранить sorted `requiredQueueCodes`. | Не выдумывает обработку, SLA или assignee. |
| Report versions | User retry возвращает existing version; новая version только explicit recalculation command. | Защищает immutable evidence. |
| PDF | Один artifact на `(reportSnapshotId,format,rendererVersion)`; regeneration создаёт новую renderer identity, а не overwrite. | Обеспечивает reproducibility и parity. |
| Test environments | Disposable MySQL, fixed UTC clock; credit boundary отдельно проверяется в `Europe/Moscow`; allowlisted synthetic recipients. | Делает evidence repeatable и исключает production PII/provider. |
| Admin purpose codes | Начальный allowlist: `support`, `security_investigation`, `release_monitoring`; list всегда minimal. | Не открывает arbitrary purpose и rich data access. |
| Analytics | Только allowlisted funnel/status events и aggregate metrics; forbidden-field scanner обязателен. | Не создаёт PII/answers/token warehouse. |

## 12. Настоящие blockers

Следующие неизвестные нельзя закрыть техническим default, потому что они меняют legal authority, ownership, production risk или explicit owner decision.

| Blocker | Что именно блокирует | Условие снятия |
|---|---|---|
| **Human legal approval и approved release manifest** | Любой client-facing questionnaire, rule result, legal basis, report wording, consent document, tariff/credit term и launch. | Named human review, approved versions/hashes, signed config-release process и отдельное решение включить client runtime. |
| **Legacy access policy/cutover** | Глобальное утверждение §31.3 и application-wide security acceptance. | Владелец отдельно утверждает owner-bound compatibility adapter, claim gate, deployment isolation или decommission. Текущий план legacy routes не удаляет. |
| **Legacy claim evidence policy** | Показ legacy records в v2 cabinet и реальный v1→v2 ownership link. | Утверждены достаточное evidence, conflict/manual-review process, neutral recovery и accountability. Email/token сами по себе недостаточны. |
| **Retention, legal hold и deletion policy** | Production cleanup, account deletion, quarantine expiry и destructive rollback. | Legal/privacy/operations утверждают retention matrix и hold procedure. До этого evidence сохраняется. |
| **Production MySQL topology/version/online-DDL capacity и restore proof** | Применение v2 DDL к production data. | Production-like rehearsal, lock/space estimates, backup restore and reconciliation, approved maintenance/rollback plan. Это не блокирует disposable-DB development. |
| **Operational escalation owner, queue policy и SLA** | Реальный client flow для critical/manual cases. | Назначены accountable owner/queue, audited routing and customer-safe SLA/wording. До этого status только `required_not_routed`. |
| **Production customer email channel** | Реальный magic-link login и report delivery клиентам. | Отдельный будущий approval provider/domain/secrets/privacy/webhooks. Он намеренно вне R1 technical scope; TestTransport не заменяет production delivery. |
| **Security/privacy launch review** | Production exposure customer sessions, admin purpose access, logs/events and incident response. | Threat-model review, secrets/service-account setup, monitoring, incident/runbook approval and negative-test evidence review. |

PSP, documents, rich CRM, automated credit redemption и LLM **не являются вопросами Release 1**. Их безопасное решение — не реализовывать и оставить disabled. Они не должны задерживать technical v2 slice, но их нельзя добавить как способ обойти перечисленные blockers.

## 13. Final definition of done и non-claims

Technical Release 1 build считается завершённым только при наличии: последовательных add-only migrations; owner-bound v2 access; test magic-link lifecycle; server promo ledger/grant; canonical questionnaire/resume/submit; deterministic 15-fixture engine; immutable web report; same-snapshot protected PDF; test-only email; minimal cabinet/admin; desktop/mobile E2E; no-LLM/provider assertions; migration dry-run/restore/reconciliation evidence.

При текущих решениях финальный delivery обязан явно содержать следующие non-claims:

1. Human legal approval **не получен**; legal artifacts остаются `draft_pending_legal_approval`.
2. Client/runtime launch **не разрешён**; production draft activation fail-closed.
3. Legacy bearer-token access сохранён по решению владельца и остаётся P0 compatibility risk.
4. Поэтому application-wide §31.3 acceptance **не заявляется**, даже если защищённый v2 test path проходит.
5. Email evidence относится только к adapter + test transport; production delivery отсутствует.
6. LLM выключена в R1; никакой model-generated или model-rewritten legal output не допускается.
7. V1 data не потеряна, не переписана и не получила owner через email inference.

## References

[1]: file:///home/ubuntu/Neolex/docs/release-1/audit/01-data-model.md "Release 1 audit: data model and state transitions"
[2]: file:///home/ubuntu/Neolex/docs/release-1/audit/02-access-auth-promo.md "Release 1 audit: access, customer magic link and promo"
[3]: file:///home/ubuntu/Neolex/docs/release-1/audit/03-questionnaire-ui.md "Release 1 audit: questionnaire, autosave and paid UI flow"
[4]: file:///home/ubuntu/Neolex/docs/release-1/audit/04-engine-report-pdf.md "Release 1 audit: rules engine, report and PDF"
[5]: file:///home/ubuntu/Neolex/docs/release-1/audit/05-portal-admin-email-e2e.md "Release 1 audit: portal, admin, email and E2E"
[6]: file:///home/ubuntu/Neolex/docs/migrations/v1-to-v2.md "Lexy v1 to v2 migration plan"
[7]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Lexy Release 0 access-control matrix"
[8]: file:///home/ubuntu/Neolex/docs/architecture/state-machines-v1.md "Lexy Release 0 state machines"
[9]: file:///home/ubuntu/Neolex/shared/legal-core/questionnaire_v2.json "Draft questionnaire v2 and Pilot selection"
[10]: file:///home/ubuntu/Neolex/shared/report/report_schema_v1.json "Draft immutable report snapshot schema v1"
