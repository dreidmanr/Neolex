# Аудит Release 1: модель данных и переходы состояний

| Поле | Значение |
|---|---|
| Модуль | **Data model and state transitions** |
| Репозиторий и ветка | `/home/ubuntu/Neolex`, `feat/lexy-release-1-pilot` |
| Режим работы | Read-only аудит исходного кода и документов; код, миграции и конфигурации не изменялись |
| Дата аудита | 2026-09-12 |
| Решение по legal | Human legal approval отложен до завершения всех этапов. Все legal-конфигурации остаются `draft_pending_legal_approval`. |
| Решение по запуску | **NO-GO:** client/runtime launch запрещён. Реализация допустима только в изолированной test/staging-среде на синтетических данных. |
| Решение по legacy | Текущие legacy routes не удалять в плане. Они остаются **compatibility risk**, не являются защищённым v2-путём и не могут засчитываться как соответствие Release 1. |
| Email и LLM | Только adapter + test transport; production provider не подключать. LLM выключена; v2 не вызывает LLM, а текущий legacy-вызов является блокирующим расхождением до его изоляции/замены детерминированным fallback. |

## 1. Вывод и граница соответствия

Текущий persistence-контур является v1/legacy и **не реализует** модель Release 1. В нём отсутствуют клиентский аккаунт, серверная клиентская сессия, обязательная связь ресурса с владельцем, транзакционный журнал переходов, идемпотентность команд, outbox, неизменяемые версии отчёта и model-level lifecycle для документов и email. `sessionToken` является одновременно locator и фактическим bearer-полномочием в tRPC и HTTP PDF, а платёжный и отчётный переходы выполняются публичными процедурами. Это прямо не проходит критерии §31.3: защищённая процедура должна требовать customer session и owner check, а знание `sessionToken` не должно давать доступ.[1] [7] [9] [10]

Целевая работа Release 1 должна быть **additive**: новые v2-таблицы и новый owner-bound путь создаются рядом с v1. Нельзя добавлять owner через email-эвристику, переписывать legacy-строки или конвертировать v1-ответы в v2. Legacy пути и данные сохраняются для совместимости, но помечаются как временный security/compatibility risk и исключаются из Release 1 acceptance до отдельного решения о remediation.[5] [7]

> **Release gate.** Даже после реализации схемы и тестов запуск клиентского runtime запрещён: legal core остаётся `draft_pending_legal_approval`, production email запрещён, а текущий legacy surface содержит P0 bearer-token доступ. Тестовый вертикальный путь допустим только с синтетическими fixtures, test transport и feature flags, которые fail-closed для внешнего клиента.

## 2. Трассировка к ТЗ и Release 0

§30.3 требует закрытый Pilot одного полностью защищённого сквозного пути; в его составе названы magic link, server-side promo access, анкета, rules engine, web report, PDF, кабинет, минимальная админ-таблица, email adapter с test transport и тесты. §31.3 дополнительно требует owner-bound access, cross-device resume, один отчёт/PDF при повторе, выключенную LLM и проверенный token flow на тестовом transport.[1] Release 0 уже фиксирует нужные инварианты: owner на корневом case, append-only audit, outbox в одной транзакции, conditional transition, immutable report snapshot, quarantine/claim вместо email-backfill и versioned legacy projection.[5] [6] [7] [8]

| Нормативный/архитектурный контракт | Наблюдение в модуле | Вывод для R1 |
|---|---|---|
| Customer session + owner check для диагностики, ответов, отчёта, PDF и admin list | Ни одна текущая таблица диагностики не содержит `customerAccountId`; `paidRouter` принимает `sessionToken` во всех защищённых действиях и `adminGetSessions` публичен. | Создать отдельный v2 root aggregate с обязательным owner; не переиспользовать legacy token как credential. |
| Переход = атомарная смена статуса + audit + outbox + идемпотентность | `updatePaidSessionStatus` обновляет статус по `id` без expected state, транзакции, audit или outbox. | Все v2 команды выполнить через один transition service и одну DB transaction. |
| State machine paid session | Фактические статусы `created/payment_pending/paid/in_progress/completed/report_ready` не содержат `draft/access_granted/submitted/scoring/manual_review_required/failed/archived`. | Ввести новый v2 enum; старый enum не расширять и не использовать как v2 source of truth. |
| Payment/access отделены | В `paid_sessions` смешаны `paymentStatus`, payment fields и progress status. | Ввести отдельные `payment_records` и `access_grants`; в R1 разрешён только server-side promo. |
| Immutable report versions + PDF from same snapshot | `paid_reports` имеет ровно одну строку на paid session, без version/status/provenance; PDF строится из текущих mutable rows. | Ввести versioned immutable snapshots и artifacts. |
| Email adapter/test transport, ограниченные retry | Email delivery/outbox таблиц нет; текущий код вызывает internal notification напрямую. | Ввести `email_deliveries` и `outbox_events`; в R1 transport строго `test`. |
| LLM off | `paidRouter.complete` импортирует `invokeLLM` и передаёт ответы в `claude-sonnet-4-5`. | Новый v2 путь не импортирует LLM. Legacy вызов необходимо отключить/заменить детерминированным fallback до любого тестового или клиентского запуска. |
| No-loss migration и no email inference | R0 план уже запрещает автоматическую привязку по contact email и требует claim/quarantine. | Backfill создаёт только links/ownership ledger; v1 значения не меняются. |

## 3. Фактическое состояние файлов

### 3.1 `drizzle/schema.ts`

Схема содержит 12 legacy-таблиц: `users`, free diagnostic tables, paid diagnostic tables и `feedbacks`. Связи выражены только полями `sessionId`, `paidSessionId` и `freeSessionId`: деклараций FK и индексов для обычных parent-child запросов нет. Уникальность есть у token, one-to-one `scoring_results.sessionId` и `paid_reports.paidSessionId`, но отсутствует у пары answer `(paidSessionId, questionId)`, consent и documents.[2]

`paid_sessions` не имеет owner, server session, case public ID, optimistic-lock revision или state transition evidence. В нём смешаны contact data, payment facts, progress, questionnaire version и risk fields. Его enum-статусы не соответствуют целевой state machine. `paid_documents` хранит постоянные `storageKey` и `storageUrl`; `paid_reports` является одной mutable-ориентированной записью без `reportVersion`, input/config hashes и state. Эти свойства делают v1 непригодной базой для owner-bound v2 без side-by-side модели.[2] [6]

### 3.2 `server/db.ts`

Базовый DB helper реализует несколько v1 upsert-операций, но не содержит transaction boundary для domain transition, audit или outbox. `updateSessionStatus` и `completeSession` не проверяют ожидаемый исходный статус. `upsertAnswer` сначала читает строку и затем обновляет/вставляет её; без unique constraint и транзакции параллельные запросы могут создать дубликаты. `saveConsent` не имеет естественной уникальности или идемпотентного ключа.[3]

Отдельный риск надёжности: отдельные операции при недоступной базе только логируют предупреждение или возвращают пустой результат. Для чувствительной команды R1 это недопустимо: отсутствие подтверждённого DB commit не должно возвращаться как успешная смена состояния.

### 3.3 `server/paidDb.ts`

`createPaidSession` создаёт случайный `sessionToken`, но не связывает его с authenticated owner. `getPaidSessionByToken` является удобным legacy lookup, но не должен вызываться v2 authorization path. `updatePaidSessionStatus` принимает любой перечисленный статус и обновляет по `id` без `WHERE status = expected`, lock revision, audit, outbox или идемпотентности. `markPaidSessionPaid` аналогично устанавливает факт оплаты без доверенного event или state guard.[4]

`upsertPaidAnswer` читает до 100 ответов сессии, ищет вопрос в памяти и затем пишет. В схеме нет unique constraint, поэтому параллельные запросы не защищены; ограничение в 100 скрывает риск некорректного поведения на длинном questionnaire. `savePaidReport` не реализует идемпотентный результат и не поддерживает повторную версию. `savePaidDocument` сохраняет URL, а router возвращает URL клиенту; это противоречит требованию, что object key/URL не является полномочием.[4] [7]

### 3.4 Фактические маршруты как зависимость модели

`server/paidRouter.ts` использует `publicProcedure` для чтения и изменения paid session, answers, documents и report по `sessionToken`; публичная `confirmPayment` симулирует оплату; `complete` выполняет scoring по payload клиента, генерирует report синхронно и вызывает LLM. `server/pdfRoutes.ts` выдаёт PDF по `/api/pdf/*/:sessionToken`, собирая его из текущих строк. Это **legacy compatibility risk**, а не новый путь, который нужно удалять в этой задаче. Он должен быть исключён из v2 launch/acceptance, документирован в risk register и сохранён до отдельной policy deprecation.[9] [10]

### 3.5 Миграционный и state-machine документы

`docs/migrations/v1-to-v2.md` задаёт корректные базовые принципы: expand-only, root-first registration, claim/quarantine, provenance, no data loss, dry run и rollback без destructive delete. Это проектный контракт, а не выполненная DDL/DML миграция.[5] `state-machines-v1.md` задаёт целевые enums, допустимые переходы и необходимость атомарности, audit/outbox, но фактическая схема и persistence helpers ещё не реализуют этот контракт.[6]

## 4. Целевая аддитивная v2-модель

### 4.1 Основные правила проектирования

1. **Единственный источник owner.** Только `diagnostic_cases.customerAccountId` является ownership root для v2 case. Дочерние сущности получают owner исключительно join-ом через case; не следует дублировать `customerAccountId` в answers, reports, artifacts или documents без composite FK и контролируемого consistency protocol.
2. **Новые v2 case всегда owned.** `diagnostic_cases.customerAccountId` — `NOT NULL`. Legacy resource без доказанного owner не создаёт пустой v2 case: он остаётся в `legacy_ownership_cases` (`unassigned`/`quarantined`).
3. **Legacy неизменяем.** Не добавлять owner к v1 rows, не изменять `sessionToken`, `paymentStatus`, answers, report markdown, document URL или consent. Ссылка на v1 — только append-only provenance record.
4. **Locator не credential.** v2 public case ID, report ID, document ID, legacy locator и v1 session token используются только для поиска уже авторизованного server-side ресурса. Raw customer-session и magic-link tokens в БД не хранятся.
5. **Legal fail-closed.** Модель может хранить `configReleaseId`, hash и status, но server runtime не создаёт client result, пока все legal inputs имеют `draft_pending_legal_approval`. Статус `approved` не устанавливается данной работой.
6. **R1 boundaries.** Document processing/lifecycle можно предусмотреть в модели для совместимости с state machine, но base tariff R1 не создаёт document jobs. Production payment provider и production email отсутствуют; `payment_records.paid` не создаётся R1 runtime.

### 4.2 Таблицы и обязательные поля

| Группа и таблица | Назначение и минимальные поля | Инварианты и связи |
|---|---|---|
| `customer_accounts` | `id` opaque public-safe ID; `status` (`active`, `suspended`, `deleted`); timestamps. | Не является копией legacy `users`; account не создаётся по совпадению email. |
| `customer_account_identities` | `id`, `customerAccountId`, `identityType` (`email_magic_link`), `addressCiphertext`/защищённый contact reference, `normalizedAddressHash`, `verifiedAt`, `revokedAt`. | Unique active identity hash по policy; email hash служит только login routing, не legacy owner join. FK к account. |
| `customer_sessions` | `id`, `customerAccountId`, `tokenHash`, `issuedAt`, `expiresAt`, `revokedAt`, minimal request metadata. | `tokenHash` unique; raw cookie/token не сохраняется. Query разрешает только non-expired, non-revoked session. |
| `magic_link_tokens` | `id`, identity/account/request context, `tokenHash`, `expiresAt`, `consumedAt`, `revokedAt`, `requestCorrelationId`. | Unique token hash; atomic `consumedAt IS NULL AND expiresAt > NOW()` consume. Нейтральный response и rate limit находятся вне token string. |
| `diagnostic_cases` | `id`, opaque `publicId`, **`customerAccountId NOT NULL`**, `serviceTier` (`base`, `with_documents`), target case `status`, `questionnaireVersion`, `configReleaseId`, `configManifestHash`, `stateVersion`, timestamps, `submittedAt`, `archivedAt`. | FK account; unique `publicId`; index `(customerAccountId, status, updatedAt)` для кабинета. Состояние только через transition service. |
| `questionnaire_submissions` | `id`, `caseId`, `submissionVersion`, `status` (`draft`, `submitted`, `superseded`), questionnaire/config hashes, activation snapshot JSON, input snapshot JSON/hash, `submittedAt`. | Unique `(caseId, submissionVersion)` and `(caseId, inputSnapshotHash)`; submitted snapshot immutable. |
| `questionnaire_answer_revisions` | `id`, `caseId`, `submissionId`, `questionId`, `revision`, typed `valueJson`, `answerState` (`active`, `inactive`), `source` (`customer`, `system_branch_recompute`), `answeredAt`, `deactivatedAt/reason`. | FK case/submission; unique `(submissionId, questionId, revision)`; index `(submissionId, questionId, answerState, revision)`. Current canonical set is derived deterministically from max valid revision, not client payload. |
| `case_consents` | `id`, `caseId`, `consentType`, `accepted`, `documentVersion`, `capturedAt`, `source`. | FK case; index `(caseId, consentType, capturedAt)`; append-only facts, never an identity proof. |
| `tariff_snapshots` | `id`, `tariffCode`, currency, price/credit fields, config/reference version, status, hash. | Price is a fact copied into payment record; not taken from browser. Draft legal/commercial policy cannot activate client flow. |
| `payment_records` | `id`, `caseId`, tariff snapshot, `status` (`pending`, `promo_granted`, `paid`, `refunded`, `expired`, `revoked`), charged amount, currency, safe provider/campaign ref, idempotency/correlation, timestamps. | FK case/tariff; unique safe provider event key where provider exists; R1 permits only `pending → promo_granted`, `chargedAmount=0`; provider stays disabled. |
| `access_grants` | `id`, `caseId`, `paymentRecordId`, `source` (`promo`, `payment`, `support`), `status` (`active`, `expired`, `revoked`), starts/expires/revoked facts. | FK case/payment; unique `(caseId, paymentRecordId)`; grant is server-calculated/issued, never client assertion. |
| `report_snapshots` | `id`, `caseId`, `reportVersion`, `status` (`pending`, `generating`, `ready`, `failed`, `superseded`), `inputSnapshotHash`, config/version hashes, structured DTO JSON, `contentHash`, `generationMode` (`template`), `supersedesReportId`, timestamps. | FK case and self-FK; unique `(caseId, reportVersion)` and `(caseId, inputSnapshotHash, generationReason)`; ready content is immutable. R1 only accepts `generationMode=template`; no LLM model/name field. |
| `report_artifacts` | `id`, `reportSnapshotId`, `format` (`pdf`), storage object reference, `contentHash`, renderer version, `status` (`pending`, `ready`, `failed`, `revoked`), timestamps. | FK report; unique `(reportSnapshotId, format)`; PDF is rendered from exact ready snapshot, not mutable case data. |
| `email_deliveries` | `id`, `caseId`, optional report/artifact FK, `purpose`, protected recipient ref/hash, template/version, `transport` (`test`), `status` (`queued`, `sending`, `sent`, `failed`, `suppressed`), attempts, provider receipt/classification, timestamps. | FK case/report/artifact; unique dedupe tuple `(reportSnapshotId, templateVersion, recipientHash)`; R1 DB/service check rejects a transport other than `test`. |
| `expert_escalations` | `id`, `caseId`, optional document/report FK, `status` (`new`, `triaged`, `assigned`, `in_review`, `awaiting_customer`, `resolved`, `cancelled`), reason/severity, trigger snapshot hash, assignment/SLA fields, disposition. | FK case; unique `(caseId, triggerSnapshotHash)`; `manual_review_required` is not valid without this row. It remains test-only while client runtime launch is forbidden. |
| `idempotency_records` | `id`, operation scope, actor/account scope, `keyHash`, `requestHash`, resource refs, `responseSnapshot`, `resultStatus`, expiry/timestamps. | Unique `(operationScope, actorScopeHash, keyHash)`. Same request hash returns stored result; different hash returns conflict; raw key never stored. |
| `audit_events` | `id`, occurred UTC, actor type/id, action, resource type/id, `fromStatus`, `toStatus`, request/correlation ID, idempotency hash, reason, result, redacted metadata. | Append-only. DB service account has no update/delete grant; sensitive transition must fail if event cannot commit. No raw token, email, document, answer value, storage key or URL. |
| `outbox_events` | `id`, aggregate type/id, event type/version, dedupe key hash, minimal payload of internal IDs, `status` (`pending`, `leased`, `delivered`, `failed`, `cancelled`), available/lease/attempt/error timestamps. | Unique `dedupeKeyHash`; commit in the same transaction as transition/audit. Worker lease uses conditional update; payload has no raw magic token, URL or report body. |
| `legacy_ownership_cases` | `id`, root `sourceTable` (`diagnostic_sessions`/`paid_sessions`), `sourcePrimaryKey`, status (`unassigned`, `claim_pending`, `claimed`, `quarantined`, `manual_review`, `excluded_by_retention`, `migration_error`), reason, evidence ref, target case/account refs, run ID. | Unique `(sourceTable, sourcePrimaryKey)`; only `claimed` has target v2 case; no email-derived decision. |
| `legacy_resource_links` | `id`, source table/PK, target type/ID, `mappingVersion`, `migrationRunId`, source hash, timestamps. | Unique `(sourceTable, sourcePrimaryKey, targetType)`; immutable provenance. |
| `migration_runs` / `migration_reconciliation_records` | Run identity, source snapshot, stage, dry-run/commit mode, watermarks, counts, hashes, exceptions and checkpoint result. | Every migration write is attributable; no rollback deletes this evidence. |

### 4.3 Enums, checks, FK и index policy

The schema should declare Drizzle enums for every finite lifecycle above rather than open `varchar` status. Use native MySQL enums only where values are stable in the state-machine specification; use `varchar` plus controlled catalog for extensible reason codes. All v2 table relations require explicit FK constraints with `RESTRICT` by default. A deleted account must not cascade-delete legal/audit/report evidence; account deletion is a state transition governed by retention policy.

| Constraint/index | Required rule |
|---|---|
| Root ownership | `diagnostic_cases.customerAccountId NOT NULL` + FK. New case creation is rejected if missing, suspended or deleted owner. |
| Opaque identifiers | `customer_accounts.id`, case `publicId`, report/document/escalation IDs must have unique indexes. No v1 `sessionToken` is copied into v2 credential columns. |
| Case read path | Index `diagnostic_cases(customerAccountId, status, updatedAt DESC)` and unique `publicId` make owner-scoped cabinet lookup explicit. Query predicate always includes account ID. |
| Submission/answer uniqueness | Unique `(caseId, submissionVersion)` and `(submissionId, questionId, revision)` prevent double submit/revision. Do not rely on read-before-write. |
| Payment/promo | Unique logical promo scope, e.g. `(campaignId, caseId)` or the approved policy scope, and unique non-null provider event ID only when R3 provider exists. |
| Report/artifact | Unique `(caseId, reportVersion)`, `(caseId, inputSnapshotHash, generationReason)`, `(reportSnapshotId, format)`. State service, not UI, serializes ready/supersede transition. |
| Idempotency/outbox | Unique operation key scope and unique outbox dedupe key; indexes on `(status, availableAt)` and `(status, leaseUntil)` support safe polling. |
| Audit | Index `(resourceType, resourceId, occurredAt)` and `(actorType, actorId, occurredAt)`; no index exposing free-text sensitive metadata. |
| Legacy/migration | Unique root ownership case and provenance link; indexes on `(status, sourceTable)`, `(migrationRunId, sourceTable)`. |
| Data checks | Non-negative money/attempt counts; `expiresAt > issuedAt`; `consumedAt` only once; case/report timing consistency; `chargedAmount=0` for `promo_granted`. Use MySQL `CHECK` only where supported, with identical service-layer validation because checks cannot express a full transition graph. |

Foreign keys cannot independently enforce every cross-row state invariant. The authoritative control is a transactional transition service with an expected source state and `stateVersion`. Its update has the form `WHERE id = ? AND status = ? AND stateVersion = ?`; zero affected rows causes an idempotency replay lookup or a safe conflict, never a blind overwrite.

## 5. Required transition, idempotency, audit and outbox protocol

Every v2 mutation is a command, not a generic “set status” helper. The v2 router must first establish customer/admin/worker identity, locate the resource by an internal ID, apply owner/role/state predicate, and only then call a transition service. An identifier supplied by a client is never authorization.

| Step | Transactional behavior |
|---:|---|
| 1 | Canonicalize command payload and calculate `requestHash`; calculate hash of supplied idempotency key. Raw key is discarded. |
| 2 | Insert-or-lock `idempotency_records` for `(operation, actor scope, key hash)`. Existing equal request hash returns stored response; an unequal hash produces a conflict without a second side effect. |
| 3 | Read minimal case/payment/report row with lock and re-check owner, access grant, legal runtime gate, expected state and `stateVersion`. |
| 4 | Execute conditional transition, increment `stateVersion`, and create immutable subordinate facts such as submission snapshot/report version where applicable. |
| 5 | Insert an append-only `audit_events` row, including from/to status and a redacted reason/result. |
| 6 | Insert a deduplicated `outbox_events` row for external work such as template-email or PDF rendering. Its payload contains only IDs, version and correlation values. |
| 7 | Persist redacted command result in idempotency record and commit all writes together. A DB failure returns failure; it must not pretend the command succeeded. |
| 8 | A separate worker leases the outbox record, re-checks resource state/access immediately before action, and writes its result in a new transaction. Failure follows bounded retry and terminal state. |

The following v2 transitions must be encoded directly from the R0 machine: case `draft → access_granted → in_progress → submitted → scoring → report_ready`, with branches to `manual_review_required`, `failed` and `archived`; payment `pending → promo_granted` in R1 only; report `pending → generating → ready/failed`, with `ready → superseded` only alongside a new ready version; email `queued → sending → sent/failed/suppressed`. A generic public `updateStatus` API is prohibited.[6]

Because all legal configs remain draft and client runtime is prohibited, any transition that would calculate/publish a client-facing legal result must fail closed before `submitted → scoring` in a non-test environment. The schema records the intended config hash/status for reproducibility, but does not make draft content executable. Synthetic test fixtures may exercise the transition only under an explicit test-only release gate and deterministic template renderer. LLM must have no callable dependency in that renderer.[1] [8]

## 6. File-level implementation plan (future work; not executed by this audit)

| Priority | File | Planned additive change | Explicit non-change / acceptance condition |
|---:|---|---|---|
| 1 | `drizzle/schema.ts` | Add the v2 enums/tables, FK/index/unique declarations from §4. Do not alter/remove v1 table definitions. Export v2 select/insert types separately. | No `customerAccountId` backfill column is added to `paid_sessions` or `diagnostic_sessions`; no legacy token becomes a v2 credential. |
| 2 | `drizzle/0005_release1_v2_expand.sql` (new, generated/reviewed) | Expand-only DDL for v2 structures, indexes and constraints. Include no `DROP`, no `DELETE`, no `UPDATE` of v1 rows and no destructive enum modification. | Migration runner is separate, audited and only runs after backup/restore and dry-run gates. |
| 3 | `server/db.ts` | Retain connection initialization and legacy free DB API as explicitly legacy. Add a transaction wrapper that throws on unavailable DB; do not let a sensitive v2 command silently succeed when DB is unavailable. | Existing token helpers are not called from v2. Their continued existence is recorded as compatibility risk. |
| 4 | `server/paidDb.ts` | Freeze as `legacyPaidDb` for compatibility reads/controlled maintenance. Stop treating `updatePaidSessionStatus`, `markPaidSessionPaid` and read-before-write answer logic as a v2 implementation. | Do **not** delete legacy helper functions/routes in this plan. Do not wire v2 code to them. |
| 5 | `server/v2/repositories.ts` and `server/v2/transitionService.ts` (new) | Implement only typed v2 repository operations and transactional state transitions; own conditional update, snapshots, idempotency, audit and outbox writes. | No generic arbitrary status setter. No direct provider, storage URL, LLM or browser-side update. |
| 6 | `server/v2/ownerPolicy.ts`, `server/v2/customerSession.ts` and `server/_core/context.ts` | Add distinct customer session context and reusable `ownsCase`/admin/worker predicates. Preserve current OAuth `user` only for its existing admin boundary. | An authenticated administrative OAuth user is not automatically a customer owner. |
| 7 | `server/v2/router.ts` and `server/routers.ts` | Register a new v2 router with owner-bound procedures. Reads and writes use server session → owner predicate → state predicate; non-owner response is neutral 404. | Keep `paidRouter` registered as legacy compatibility risk; no launch claim, no automatic redirect or token bridging. |
| 8 | `server/v2/reportTemplateRenderer.ts` and `server/paidRouter.ts` | Build v2 reports strictly from deterministic structured snapshot/template. In the legacy code path, remove/isolate `invokeLLM` in favor of deterministic fallback before any environment can invoke the route. | Do not introduce any LLM model, API call, prompt, personalization or model-derived text. |
| 9 | `server/v2/email/adapter.ts`, `server/v2/email/testTransport.ts`, `server/v2/outboxWorker.ts` (new) | Define adapter interface; implement only test transport, outbox lease, bounded retry and suppression. Delivery records bind to template/report version and test recipient allowlist. | No provider SDK/key/webhook, no production domain or production send in R1. |
| 10 | `docs/migrations/v1-to-v2.md` | Amend implementation appendix with exact DDL migration IDs, source manifest format, watermark, reconciliation SQL, rollback evidence and legacy-risk statement. Keep its current no-email-inference policy. | Do not declare migration, legal approval or client launch complete. |
| 11 | `docs/architecture/state-machines-v1.md` | Add an implementation crosswalk from transition IDs to v2 tables/services/tests. Mark legal config and launch gates as unresolved/draft. | Do not reinterpret this architectural draft as legal approval. |
| 12 | `docs/release-1/audit/01-data-model.md` | Keep this audit as decision record and traceability baseline. | This document is not DDL approval or a launch authorization. |

## 7. Additive migration and legacy-compatibility plan

### 7.1 Phases

| Phase | Permitted action | Required proof / stop condition |
|---|---|---|
| M0 — freeze | Record branch/commit, schema manifest, policy decisions and this NO-GO. Keep all legal configs draft. | No DDL/DML before named technical/data/security approval, backup plan and synthetic fixture strategy. Human legal approval remains intentionally absent. |
| M1 — inventory and restore proof | Read-only inventory of all 12 v1 tables, counts, PK ranges, null/duplicate profiles, logical orphans, JSON parseability, report hashes and document metadata; encrypted backup/restore rehearsal. | A signed source manifest and restore reconciliation exist. No source cleanup, dedupe or email matching. |
| M2 — expand | Apply only new v2 tables/indexes/constraints in isolated staging first. Run empty-target schema test. | Existing legacy reads still operate; DDL rollback means disable flag, not drop v2 evidence. |
| M3 — register roots | For every `diagnostic_sessions` and `paid_sessions` root create one `legacy_ownership_cases` record plus provenance registration with `unassigned`; classify children against proven parent. | `free roots + paid roots = registered root cases`; every child is linked or a documented anomaly. |
| M4 — controlled claim (test-only until launch decision) | Test an authenticated, one-time, scope-bound claim flow. A successful claim creates v2 account/case/link transactionally; conflict goes neutral/manual review/quarantine. | No raw token, email match, contact name, domain, cookie, IP or legacy `sessionToken` proves ownership. No client-facing production claim while runtime launch is forbidden. |
| M5 — quarantine and compatibility | Retain unclaimed/anomalous sources as `quarantined`; expose a read-only v1-labelled projection only after owner claim or controlled staff policy. | No v1 answer conversion, no report regeneration, no storage URL authority, no mutation of v1 status from v2. |
| M6 — reconciliation | Compare source/target root counts, links, parent-child cardinalities, report/document metadata hashes, claim evidence coverage, duplicate mapping and negative authz results. | Any unexplained loss, owner conflict, duplicate mapping or missing audit is a hard stop. |
| M7 — future gated cutover | Only after all technical, legal and launch gates are separately satisfied, make new records v2-owned; leave legacy reader behind an explicit compatibility policy. | This audit does not authorize M7. Current instruction prohibits client/runtime launch. |

### 7.2 Legacy route policy

The plan deliberately **does not delete** `paidRouter`, free diagnostic routes or `/api/pdf/*/:sessionToken`. They are retained as legacy code paths to avoid an unplanned breaking change and data loss. They must be labelled in release notes and risk register as `legacy_compatibility_risk: bearer_locator_access`; no v2 handler may call them, accept their token as proof, or return a v2 resource through them.

A later separately approved remediation may restrict, proxy, replace or decommission the routes. Until then, they cannot contribute to `R1.1`/§31.3 compliance, cannot be used in a client launch, and require an explicit regression test to prevent accidental v2-to-v1 authorization bridging.[5] [7]

### 7.3 No-loss and rollback guarantees

No-loss means preservation and evidence, not automatic account visibility. v1 source rows, reports and document metadata remain unchanged. `legacy_resource_links` and migration-ledger records are append-only. The rollback action disables the v2 feature flag/new writer and records an incident; it never deletes v2 audit, idempotency, claim or reconciliation evidence. A quarantine record remains preserved until a separately approved retention/legal-hold policy exists.[5]

## 8. Concrete test plan

The current suite tests free diagnostic scoring and a handful of legacy route behaviors. It has no paid v2 router tests, no DB integration tests, no migration dry-run, no owner-isolation test, no state-transition concurrency test and no email/outbox test.[3] [4] The following tests are required before a test-only v2 path can be accepted.

| ID | Level and proposed test file | Setup and action | Expected assertion |
|---|---|---|---|
| DM-01 | DB integration — `server/v2/schema.integration.test.ts` | Apply v1 baseline then v2 expand migration to disposable MySQL schema. | All v1 table definitions/counts remain unchanged; all v2 FKs/indexes/uniques exist; no destructive SQL. |
| DM-02 | DB integration — `schema.integration.test.ts` | Insert v2 child with nonexistent case/account/report. | FK rejects it; account deletion cannot cascade-delete case/report/audit evidence. |
| DM-03 | Unit/DB — `caseRepository.test.ts` | Attempt v2 case create without owner, with suspended owner and with valid owner. | First two fail; valid case has exactly one owner and opaque public ID. |
| DM-04 | DB integration — `answerRevision.integration.test.ts` | Two concurrent revisions of one question and branch deactivation. | Unique revision invariant holds; canonical set is deterministic; inactive value is excluded from scoring but retained as evidence. |
| SM-01 | Unit — `transitionService.test.ts` | Exercise every allowed case/payment/report/email transition plus each forbidden edge. | Valid transition writes state/audit/outbox atomically; invalid edge writes nothing. |
| SM-02 | Concurrency — `transitionService.integration.test.ts` | Race two `submitted → scoring`, two promo grants and two report ready commands. | Exactly one winner; loser is replay/conflict; one audit success and one outbox dedupe record. |
| SM-03 | Unit — `idempotency.test.ts` | Reuse same idempotency key with same then different canonical payload. | Same payload returns byte-equivalent stored result and no new rows; changed payload is conflict. Raw key is absent from DB/log fixture. |
| SM-04 | DB integration — `atomicity.integration.test.ts` | Force audit insert/outbox insert failure inside transition transaction. | Case state/snapshot/idempotency result are rolled back; no external job is visible. |
| SM-05 | Unit/DB — `outboxWorker.test.ts` | Lease same event concurrently, crash before delivery, exhaust retry and suppress after access revoke. | One worker lease; bounded backoff; no double send; terminal `failed`/`suppressed` state. |
| SM-06 | Integration — `reportVersion.integration.test.ts` | Submit same snapshot twice and request an approved future recalculation. | Replay creates no second report/PDF; recalculation creates a new version and supersedes old ready only transactionally. PDF input equals stored snapshot hash. |
| SM-07 | Unit — `legalRuntimeGate.test.ts` | Mark referenced legal config `draft_pending_legal_approval`; attempt scoring/report publication. | Fail closed; no client result/artifact/email. Test records show no config marked approved by code. |
| AUTH-01 | tRPC/HTTP integration — `server/v2/router.authz.test.ts` | Anonymous, owner A, owner B and admin call v2 case/answers/report/PDF endpoints with known public IDs and leaked v1 token. | Anonymous 401; owner B neutral 404; owner A succeeds only in permitted state; admin requires reason/audit; v1 token cannot authorize v2. |
| AUTH-02 | Integration — `customerSession.integration.test.ts` | Consume valid magic token; retry consume; expired/revoked/scope-mismatched token; second-device session. | Hash-only token, single consume, neutral failure, new server session and owner-scoped resume across devices. |
| AUTH-03 | Regression — `legacyCompatibilityRisk.test.ts` | Keep legacy router/PDF registration and attempt to pass legacy token into v2 API. | Legacy code remains separately registered and labelled risk; no v2 lookup or authorization path accepts it. Test does not falsely certify legacy bearer access as secure. |
| MIG-01 | Integration — `migration/registerRoots.integration.test.ts` | Fixture includes every root plus valid, orphan and duplicate children. Run M3 twice. | One ownership case per root; anomalies classified; second run creates no additional mappings. |
| MIG-02 | Integration — `migration/noEmailInference.test.ts` | Legacy contact email equals one/many customer identities. | No owner/case link is made; state remains `unassigned` or `quarantined`. |
| MIG-03 | Integration — `migration/claim.test.ts` | Two simultaneous valid claims; expired/replayed/scope-mismatched claim; collision with already claimed resource. | At most one claim succeeds; conflict is neutral and audited; no disclosure of other owner. |
| MIG-04 | Reconciliation — `migration/reconciliation.test.ts` | Snapshot source paid reports/doc metadata, execute dry run and restore rehearsal. | Counts and hashes match; source rows are untouched; missing storage object becomes anomaly and never yields download grant. |
| MAIL-01 | Integration — `email/testTransport.integration.test.ts` | Queue magic/report delivery with `transport=test`; then attempt configured production adapter/provider. | Test message is captured only in test sink; dedupe/retry works; non-test transport/provider configuration is rejected. |
| LLM-01 | Unit/static integration — `reportTemplateRenderer.test.ts` | Mock `invokeLLM`, run all v2 report paths and legacy fallback under disabled mode. | Mock has zero calls; deterministic template/snapshot output is used; no model name appears in v2 persistence. |
| E2E-01 | Browser E2E, desktop and mobile — `e2e/r1-v2-synthetic.spec.ts` | Synthetic customer goes landing → test magic link → promo → questionnaire → web report → PDF. Repeat submit and resume from second device. | One owner-bound case, one report/PDF, expected fixture outcome, no LLM, test email only. This is test/staging evidence, not launch authorization. |

The suite should also add property-style negative cases for arbitrary state jumps, unknown question IDs/options, stale branch answers, revoked grant during render/send, and database outage. Production data, live mailboxes, real payment providers, actual document contents and real customer PII are excluded from fixtures and test transport.

## 9. Risks, blockers and ordered remediation

| Severity | Risk/blocker | Evidence | Required mitigation and gate |
|---|---|---|---|
| P0 | Token-as-authorization in public paid tRPC, PDF and storage-related document flow | `paidRouter` and PDF routes resolve resource by token; access matrix records these as current P0 exceptions. | Preserve as legacy compatibility risk, but build a separate owner-bound v2 path; do not launch clients or certify R1 while bearer paths remain unresolved. |
| P0 | Public payment simulation changes paid status | `confirmPayment` is public and writes paid/in-progress by token. | New v2 permits server promo only; provider disabled. Legacy method not used by v2. |
| P0 | LLM is active in current paid completion | `paidRouter` imports/calls `invokeLLM`. | Disable/isolate it and use deterministic template renderer; prove zero calls. This is required for §31.3. |
| P0 | Legal configs are draft and human approval is intentionally deferred | User decision; R0 documents expressly state draft does not authorize client use. | Fail closed; no legal result/client runtime launch until a separate future decision and all gates. |
| High | No owner linkage or customer session in DB | No v1 diagnostic table has account FK. | Introduce v2 account/session/case root; no email-based backfill. |
| High | Lost/doubled state effects under concurrency | Current read-then-write helpers, no unique answer pair, no conditional transitions. | DB unique constraints, state version, idempotency record, audit/outbox transaction and concurrency tests. |
| High | v1 report/PDF is not immutable or versioned | One paid report per session and PDF from mutable current fields. | Snapshot/version/artifact model and parity tests. |
| High | URL/key exposure for document data | `paid_documents.storageUrl` persisted and returned by route. | v2 stores protected object reference; only owner/status check creates short test grant/stream; R1 base does not run document workflow. |
| Medium | Legacy source contains possible orphan/duplicate/logical-inconsistent data because no FK | Schema and R0 migration inventory identify logical rather than physical relationships. | Source inventory, parent-first registration, anomaly ledger, batch reconciliation; never “repair” source during migration. |
| Medium | Added indexes/constraints may lock or fail on deployed MySQL/version/data | Current migration history has no v2 target and deployment characteristics are unspecified. | Test on production-like MySQL, inspect online-DDL capability, batch/back up, maintenance/rollback approval; do not alter v1 data. |
| Medium | No current durable worker/identity separation | R0 defines it architecturally only. | Test-only DB outbox and distinct test identity; production worker/provider remains blocked until later release decisions. |
| Medium | Retention, legal hold, manual-claim evidence and organization ownership remain unresolved | Explicit R0 open questions. | Retain quarantine/evidence, avoid destructive cleanup and owner assumptions; do not set retention deletion jobs. |

## 10. Go/no-go checklist for this module

| Gate | Current result | Required before test-only v2 acceptance | Required before any client launch |
|---|---|---|---|
| Additive v2 schema/FK/indexes | Not implemented | Expand migration passes disposable-DB tests | Revalidate on production-like DB |
| Owner-bound v2 router and customer sessions | Not implemented | Negative/positive authz matrix passes | All external routes and PDF/storage paths governed by owner policy |
| Idempotency/audit/outbox | Not implemented | Atomicity/concurrency/worker tests pass | Operational monitoring, least-privilege identities and incident playbook |
| Legacy migration safety | Plan only | Dry run, restore and reconciliation pass | Approved claim/quarantine/retention procedures |
| Legal configs | All remain draft by decision | Test gate must fail closed outside synthetic mode | Separate human approval and approved release process; not satisfied by this audit |
| LLM | Active in legacy code | Zero-call test passes in all v2/disabled paths | Remains disabled unless a future approved R3 decision changes it |
| Email | No R1 adapter/outbox | Test transport token flow passes | Production provider/domain explicitly remains a later R3 decision |
| Client/runtime launch | Forbidden by current decision | **Still forbidden** | Requires all stated technical/legal/operational launch blockers; currently NO-GO |

## 11. Audit conclusion

The correct Release 1 implementation is not an incremental extension of `paid_sessions` and `paidDb.ts`. It is an additive v2 aggregate around `customer_accounts → customer_sessions → diagnostic_cases`, with a new transactionally enforced transition service and immutable evidence/outbox model. This preserves v1 data and legacy routes without pretending that they meet current access requirements.

The recommended order is: **inventory/restore proof → v2 schema expand → owner/session and v2 policy → transition/idempotency/audit/outbox → deterministic snapshot/PDF and test email → migration dry run/reconciliation → synthetic E2E**. The system must remain non-launchable throughout the present decision state. No legal config is approved, no production provider is introduced, and no LLM execution is permitted.

## References

[1]: file:///tmp/text_editor_extracts/ТЗ3.0.Веб-сервисплатнойюридическойдиагностикиLexy-849c367a6037-p1-49.txt "Техническое задание Lexy v3.0: Release 1 и критерии приёмки"
[2]: file:///home/ubuntu/Neolex/drizzle/schema.ts "Текущая Drizzle-схема Lexy"
[3]: file:///home/ubuntu/Neolex/server/db.ts "Текущий базовый слой доступа к базе данных"
[4]: file:///home/ubuntu/Neolex/server/paidDb.ts "Текущий persistence-слой paid diagnostic"
[5]: file:///home/ubuntu/Neolex/docs/migrations/v1-to-v2.md "План миграции данных Lexy v1 в v2"
[6]: file:///home/ubuntu/Neolex/docs/architecture/state-machines-v1.md "Машины состояний Lexy Release 0"
[7]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Матрица прав доступа Lexy Release 0"
[8]: file:///home/ubuntu/Neolex/docs/operations/environment-and-service-accounts-v1.md "Окружение и сервисные аккаунты Lexy Release 0"
[9]: file:///home/ubuntu/Neolex/server/paidRouter.ts "Текущий tRPC router платной диагностики"
[10]: file:///home/ubuntu/Neolex/server/pdfRoutes.ts "Текущие HTTP-маршруты PDF"
