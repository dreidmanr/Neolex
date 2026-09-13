# Release 1 — аудит модуля Portal, admin, email и E2E

**Автор:** Manus AI
**Дата аудита:** 2026-09-12
**Репозиторий и ветка:** `/home/ubuntu/Neolex`, `feat/lexy-release-1-pilot`
**Проверенный commit:** `0c7f80f96cd2fe68450b59141df0c0988190570a`
**Режим:** read-only; runtime-код, миграции и конфигурации не изменялись.

## Итоговое заключение

Модуль **не готов к Release 1 acceptance и не может быть запущен для клиентов**. В текущем коде отсутствуют клиентская серверная сессия, `customerAccountId`, owner-bound v2 case, magic-link flow, минимальный кабинет, v2 email-delivery и E2E-инфраструктура. Критические операции доступны через `publicProcedure` по `sessionToken`; PDF и storage также используют bearer-локаторы. Это прямо противоречит критериям §31.3 ТЗ.[1]

Пользовательское решение является обязательным ограничением плана: **human legal approval отложен**, все legal-конфигурации остаются `draft_pending_legal_approval`, а клиентский/runtime launch запрещён. Поэтому допустим только технический контур разработки и тестирования на синтетических данных. Нельзя включать v2 rules/report runtime для клиентов, выдавать юридический результат, заявлять приёмку Release 1 или считать прохождение fixture-тестов юридическим одобрением.[1] [2]

Новый v2 Pilot следует построить как отдельный, защищённый vertical slice. Существующие legacy-маршруты **не удаляются этим планом** по явному решению владельца, но маркируются как `compatibility risk`: они не являются частью защищённого v2 пути, не расширяются и блокируют формальное заявление, что весь runtime соответствует §31.3, пока остаются доступными в текущем виде. В частности, сохранение bearer-доступа означает, что критерий «доступ по знанию `sessionToken` невозможен» пока не может быть закрыт для приложения в целом.[1] [5]

| Область | Вердикт | Release 1 решение |
|---|---|---|
| v2 клиентский путь | Отсутствует | Реализовать отдельный owner-bound Pilot в test/staging; по умолчанию выключен для клиентов. |
| Legacy free/paid пути | Небезопасны | Не удалять; оставить как явно изолированный compatibility risk, без новых функций и без заявления о R1 acceptance. |
| Админ | Частично защищён, но избыточен и неаудируем | Добавить минимальную v2 diagnostics table с `adminPurpose`, pagination, минимальным DTO и audit event; rich admin не развивать. |
| Email | Нет клиентской email-доставки | Добавить adapter + allowlisted test transport и полный magic-token flow; production provider не добавлять. |
| LLM | Включена в платном отчёте и глобальном виджете | Для R1 жёстко отключить: deterministic templates/rules only; тест должен падать при любом вызове `invokeLLM`. |
| Аналитика | Нет событий воронки/измерения completion | Добавить минимальные серверные события без PII и агрегированную protected query. |
| E2E | Отсутствует | Добавить browser suite для desktop и mobile, включая test mailbox, cross-device resume и negative authz. |

## Граница аудита и источники

Проверены клиентские маршруты и страницы, `adminRouter`, фактический платный/subscription-equivalent router, notification helper, HTTP PDF/storage boundaries, schema, auth context, текущие unit tests и test config. Названные во входе файлы `server/subscriptionRouter.ts` и `server/subscription.test.ts` **отсутствуют в этой ветке**; фактическим модулем платного/подписочного потока является [`server/paidRouter.ts`](../../../server/paidRouter.ts), а отдельных paid/subscription тестов нет.

Release 1 по ТЗ включает magic link, customer server session, v2 diagnostic, server-side promo, минимальный кабинет, минимальную admin table, email adapter/test transport и unit/integration/E2E coverage. Production email, PSP/webhook, документы и rich admin прямо исключены.[1] Архитектурные документы Release 0 дополнительно требуют deny-by-default, проверку владельца по `customerAccountId`, audit/outbox, draft-only legal core и compatibility без автоматического ownership по email.[2] [3] [4] [5]

## Текущее состояние

### Маршруты, аутентификация и доступ к данным

[`client/src/App.tsx`](../../../client/src/App.tsx) содержит только legacy маршруты `/diagnostic`, `/results/:token`, `/paid`, `/paid/results/:token` и `/admin`. Маршрута входа по magic link, кабинета, карточки v2 case, v2 report или отдельной Pilot-витрины нет. Глобально монтируется `LexyWidget`, поэтому будущий R1 hard-disable LLM должен охватить не только report generation, но и виджет.

Контекст tRPC в [`server/_core/context.ts`](../../../server/_core/context.ts) содержит только `user: User | null`, полученного через текущий OAuth SDK. В нём нет customer-session, `customerAccountId`, статуса сессии, tenant context или policy service. `protectedProcedure` проверяет только факт текущего OAuth user, а `adminProcedure` — `user.role === 'admin'`; это не заменяет отдельную customer session и owner check.[2]

| Текущая поверхность | Фактическое поведение | Риск / несоответствие |
|---|---|---|
| [`paid.createSession`](../../../server/paidRouter.ts) | `publicProcedure`; создаёт session и возвращает raw `sessionToken`. | Новый ресурс не привязан к customer account; token становится credential. |
| `paid.getSession`, `getAnswers`, `getDocuments`, `getReport` | `publicProcedure` + входной `sessionToken`. | Любой знающий token читает сессию, ответы, документы или отчёт. |
| `paid.saveConsents`, `saveAnswer`, `uploadDocument`, `complete` | `publicProcedure` + входной `sessionToken`. | Любой знающий token может менять чужие данные, загрузить файл или завершить case. |
| `paid.confirmPayment` | Public вызов переводит запись в `paid` по token. | Клиент сам устанавливает paid status; нет promo/payment record или trusted event. |
| `paid.adminGetSessions` | Public query возвращает список paid sessions. | P0: публичный admin list. |
| `diagnostic.*` | Legacy free flow использует `publicProcedure` и token для чтения/записи/результата. | Сохраняемый compatibility risk; не может быть v2 шаблоном. |
| [`GET /api/pdf/free/:sessionToken`, `GET /api/pdf/paid/:sessionToken`](../../../server/pdfRoutes.ts) | HTTP endpoint получает report по path token и рендерит его на запросе. | Token в URL — bearer; PDF не связан с immutable v2 report version и не проходит owner check/audit. |
| [`GET /manus-storage/*`](../../../server/_core/storageProxy.ts) | Любой path key переводится в signed URL без caller authz. | Storage key/path фактически является полномочием. |

Текущее хранение усиливает проблему. [`drizzle/schema.ts`](../../../drizzle/schema.ts) содержит `users`, legacy `diagnostic_sessions` и `paid_sessions`, но не содержит `customer_accounts`, customer server sessions, token hashes, v2 cases, access grants, payment records, report versions, audit events, outbox, delivery records или product analytics events. Контактный email присутствует в `paid_sessions`, однако миграционный контракт прямо запрещает использовать email как доказательство owner binding.[4]

### Клиентские страницы

[`client/src/pages/PaidDiagnostic.tsx`](../../../client/src/pages/PaidDiagnostic.tsx) хранит `sessionToken`, ответы, контактные данные и текущий шаг в `localStorage`; проверяет promo code `123` на клиенте; вызывает `confirmPayment` по token; предлагает загрузку документов; и формирует PDF URL с token. Это legacy v1 UI, а не допустимый v2 Pilot. Документный сценарий также относится к Release 2 и не должен входить в R1.[1] [6]

[`client/src/pages/PaidResults.tsx`](../../../client/src/pages/PaidResults.tsx) читает report по token из URL и передаёт token в PDF URL. [`client/src/pages/Results.tsx`](../../../client/src/pages/Results.tsx) делает то же для free result, включая token-bound feedback. Эти пути не следует удалять в рамках решения о legacy compatibility, но нельзя перенимать для нового кабинета или выдачи v2 report/PDF.

На [`client/src/pages/Home.tsx`](../../../client/src/pages/Home.tsx) код `123` также проверяется в браузере. [`client/src/pages/Admin.tsx`](../../../client/src/pages/Admin.tsx) показывает расширенные KPI, revenue и две таблицы legacy sessions с PII. Это выходит за R1 scope «минимальная таблица» и не выполняет целевое правило минимизации для admin list. Клиентская проверка роли полезна для UX, но не считается серверной авторизацией.

Минимальный customer cabinet сейчас отсутствует. Для R1 он должен быть только owner-bound представлением: профиль, собственные active/completed cases, статус, собственные report/PDF и безопасный status escalation. В нём не должно быть legacy raw token, storage key/URL, внутренней очереди, staff notes, чужих записей или вывода из draft legal configurations.[2] [5]

### Admin diagnostics и минимизация

[`server/adminRouter.ts`](../../../server/adminRouter.ts) использует `adminProcedure`, что лучше, чем public access, однако возвращает до 500 legacy строк с именем, email, product и другими деталями. Нет cursor pagination, purpose/reason, audit write, scope policy, redaction или отдельного DTO для list и detail. [`client/src/pages/Admin.tsx`](../../../client/src/pages/Admin.tsx) строит rich dashboard, client-side поиск/сортировку и legacy paid/free таблицы. Это не является нужной R1 защищённой диагностической таблицей.

Целевой R1 admin list должен возвращать минимум: opaque case ID, `createdAt`, service tier/tariff snapshot, lifecycle status, risk category, escalation flag/status, report availability и `updatedAt`. Email, имя, full answers, report content, document metadata, raw tokens, storage URL и export отсутствуют в list DTO. Нужный support detail — отдельная, purpose-bound операция с server audit; он не обязателен этому модулю R1.[2]

### Email, LLM и notification

[`server/_core/notification.ts`](../../../server/_core/notification.ts) отправляет project-owner notification через Forge. Это не customer email adapter: нет recipient contract, message template, email-delivery state, token TTL/consume, outbox, retry accounting или test mailbox. Тестов helper-а не обнаружено.

В [`server/paidRouter.ts`](../../../server/paidRouter.ts) `complete` вызывает `generateReportMarkdown`, который вызывает `invokeLLM` с `claude-sonnet-4-5`. В [`server/routers.ts`](../../../server/routers.ts) public `diagnostic.askLexy` также вызывает LLM, а [`client/src/components/LexyWidget.tsx`](../../../client/src/components/LexyWidget.tsx) монтируется на всех страницах. Следовательно, требование §31.3 «LLM выключена, тексты формируются шаблонами» сейчас не выполнено.[1]

### Tests и E2E

`pnpm test -- --reporter=dot` в проверенном состоянии прошёл: **3 test files, 21 tests passed**. Это не доказательство Release 1 readiness. Текущие файлы — `server/auth.logout.test.ts`, `server/diagnostic.router.test.ts` и `server/diagnostic.test.ts`. Они покрывают legacy logout, 8-question free scoring и mocked legacy router, но не owner isolation, magic link, promo grant, v2 reports/PDF, email delivery, admin audit, analytics, fixture contract или E2E.

[`vitest.config.ts`](../../../vitest.config.ts) включает только `server/**/*.test.ts` и `server/**/*.spec.ts` в node environment. В `package.json` нет `@playwright/test`, `playwright` или Cypress; конфигурации и папки E2E не обнаружены. Desktop/mobile E2E критерий §31.3 поэтому не покрыт.[1]

## Обязательные gate-условия и границы исполнения

### Непереопределяемые ограничения

| Ограничение | Обязательное техническое правило | Следствие для плана |
|---|---|---|
| Legal approval отложен | Все config/report/template metadata остаются `draft_pending_legal_approval`; loader не допускает draft к customer runtime. | Fixture/rules testing только offline/test; нельзя включать клиентское решение или заявлять юридическое качество. |
| Client/runtime launch запрещён | New v2 routes находятся за server-side allowlisted non-production Pilot flag, default disabled; production deploy не включает их. | Не выполнять public rollout и не считать «closed Pilot» запущенным. |
| Legacy доступ пока сохраняется | Не удалять `/diagnostic`, `/results/:token`, `/paid`, `/paid/results/:token`, legacy PDFs и legacy procedures этим планом. | Пометить `compatibility risk`, не расширять, считать blocker для глобального §31.3 acceptance до отдельного решения/cutover. |
| Новый v2 путь защищён | Только customer HTTP-only session + server-side `case.customerAccountId === ctx.customerAccountId`; locator не является authority. | Весь v2 tRPC/HTTP/PDF/claim path использует единый policy layer. |
| R1 email | Только adapter и test transport. | Нет provider API key, domain verification, webhook/bounce integration или production send. |
| LLM выключена | R1 code path не может обращаться к `invokeLLM`; report renderer использует deterministic template из immutable test snapshot. | Виджет отключён/заменён static FAQ, paid report LLM path не используется; тест ловит вызов. |
| Documents/R2 | Не открывать upload/download/document processing в v2 base tariff. | Не переносить `uploadDocument`, `storageUrl` или storage proxy в v2 cabinet. |
| Rich admin | Только paginated diagnostics table и aggregate status/events. | Нет CRM queue, bulk export, mass PII search, revenue dashboard или arbitrary case editor. |

### Реалистичный статус Release 1

Пока draft legal core не может быть использован в client runtime и legacy bearer surfaces остаются открыты по пользовательскому решению, допустимый статус — **`R1 technical build/test only; launch prohibited; formal acceptance blocked`**. Это не противоречит созданию защищённого v2 vertical slice и его тестов, но запрещает называть их выпуском клиентского юридического сервиса. Legal approval, утверждённый config-release process и отдельное решение о legacy cutover остаются внешними gates.[2] [3] [5]

## Целевая архитектура v2 Pilot

### Идентичность, ownership и запросы

Новый путь начинается с нейтрального `requestMagicLink(email)` и не раскрывает наличие account/case. Сервис создаёт short-lived token, сохраняет только `HMAC/pepper` hash, TTL, consumed/revoked facts и rate-limit correlation; raw token существует только в памяти при рендере test email. `consumeMagicLink(token)` атомарно проверяет hash, TTL и single-use, создаёт отдельную customer session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) и удаляет token из browser URL через redirect/`history.replaceState`. Admin OAuth и customer session не смешиваются.[3] [4]

Каждый новый v2 `diagnostic_case` создаётся только после customer authentication и несёт обязательный `customerAccountId`. Любая read/write/report/PDF операция получает resource ID как locator, затем сервер читает минимальную связь, проверяет session, owner, lifecycle и access grant до раскрытия payload. Anonymous получает `401`; authenticated non-owner — neutral `404`; admin получает доступ только через explicit staff policy/purpose. Политика общая для tRPC, Express PDF и будущего storage grant.[2]

Legacy resource может быть показан только через отдельный read-only compatibility projection после approved claim flow. Нельзя назначать его владельца по совпадению email, OAuth user, cookie или legacy `sessionToken`; unclaimed records остаются `unassigned/quarantined`. Эта работа не удаляет legacy routes и не должна притворяться их security remediation.[4]

### Минимальный customer cabinet

| Экран / route (предлагается) | Доступные данные и действия | Запрещено |
|---|---|---|
| `/pilot` | Test/staging landing, без legal decision и без raw promo validation в браузере. | Public launch и client-side проверка `123`. |
| `/auth/request-link` | Email input, neutral acknowledgement и cooldown. | Сообщать, существует ли account/case/email. |
| `/auth/consume` | Получает одноразовый token, устанавливает server session, редиректит в `/cabinet`; token исчезает из URL. | Хранить token в DB plaintext, local/session storage, log или analytics. |
| `/cabinet` | Минимальный profile DTO и список только собственных active/completed v2 cases: status, updated time, risk/escalation state, report/PDF availability. | Общий список клиентов, raw answer/document data, legal approval claims. |
| `/cabinet/cases/:caseId` | Server-restored v2 progress, autosave, submit status; immutable submitted snapshot thereafter. | Client-provided owner ID; editing after submit; document upload in base R1. |
| `/cabinet/cases/:caseId/report` | Один v2 report snapshot, allowed status and template-only content in test. | Read by URL token; report from mutable answers; LLM-generated content. |
| `/cabinet/cases/:caseId/pdf` | Authenticated download/stream of artifact for server-selected report version; audit event. | `/api/pdf/:sessionToken`, fresh render from mutable state, unaudited public link. |

Pilot questionnaire uses the already prepared 33 core + 6 branch configuration only as a **test artifact** while it remains draft. The runtime loader must reject draft in client-facing deployment. A test fixture runner may create deterministic snapshot output in an isolated test channel and assert the expected risks/escalation/one next product, but its output cannot be shown as a client legal result before human approval.[1] [2]

### Payment/promo, reports and status events

The new server promo service, after owner session and tariff check, verifies the code exclusively in protected server configuration, creates immutable `payment_record(status=promo_granted, chargedAmount=0, tariff/price snapshot)` and associated `access_grant` atomically. It returns only safe identifiers/statuses, not the raw code, hash or verifier. No PSP adapter, payment request, webhook, refund or reconciliation is part of R1.[1] [3]

A v2 report is an immutable snapshot with config/provenance status, content hash, report version and deterministic template output. PDF is rendered once from that same snapshot/artifact. Submit and render operations carry idempotency keys; a replay returns the same case/report/PDF artifact rather than generating another one. Any critical/manual flag produces an `expert_escalation` and safe hold/CTA state, not an automatic legal conclusion. Since the governing legal policy is draft, this behavior remains test-only until approval.[2] [3]

Add an append-only, minimal `product_events` store for funnel measurement: `magic_link_requested`, `magic_link_consumed`, `pilot_started`, `tariff_selected`, `promo_granted`, `case_started`, `autosave_succeeded`, `case_submitted`, `report_ready`, `pdf_accessed`, `email_queued`, `email_sent|failed|suppressed`, `escalation_created`, and denied access classes. Each event carries UTC time, opaque case/account pseudonym where applicable, channel/device class, request/correlation ID and safe reason class. It must not carry email, answers, raw tokens, document URLs, legal content or secrets. Aggregates supply median questionnaire completion time and completion rate required by §31.3; raw events are not a rich CRM.[1] [2]

### Protected admin diagnostics table

The target table is an admin-only v2 route, for example `/admin/pilot-diagnostics`, backed by a server procedure requiring `admin` role, operation purpose (`support`/`security_investigation`/`release_monitoring`), bounded filters and cursor pagination. It writes `admin.diagnostics_listed` audit events with actor, purpose, request ID, filter class and result count. The DTO is minimized as described above. A default list cannot return raw tokens, PII, answers, document links, report body or export data. Existing rich `/admin` screen and `adminGetSessions` are legacy surfaces that must not be extended; a later owner decision is required before their retirement or isolation.[2]

### Email adapter and test transport

Introduce a narrow interface such as `EmailAdapter.send({ deliveryId, idempotencyKey, recipient, templateId, templateVersion, variables })`. The domain service, not the browser, queues `email_delivery` for a particular purpose/version and records an outbox event in the transaction that creates the magic-token or report-ready transition. The mail worker rechecks purpose, owner/session policy, report readiness and access before send. Delivery follows `queued → sending → sent|failed|suppressed`, with a bounded retry count and no plaintext email body/token in operational logs.[3]

The only R1 implementation is `TestEmailAdapter`. It accepts test-only allowlisted recipients, stores a controlled test-inbox artifact accessible solely to the test harness, and exposes the delivery's raw magic URL only within that harness. It must never appear in the customer API response, database token column, production log, analytics event or admin list. Production adapters, provider credentials, webhooks, domain verification and actual delivery are deliberately absent.[1] [3]

## File-level implementation plan

The table is prescriptive for a later implementation; no file in this list was modified during this audit.

| Priority | File / path | Planned change | Acceptance-oriented control |
|---:|---|---|---|
| P0 | `drizzle/schema.ts` | Add separate v2 tables: `customer_accounts`, `customer_sessions`, `magic_link_tokens`, `diagnostic_cases`, `case_answers`, `case_consents`, `payment_records`, `access_grants`, `report_snapshots`, `report_artifacts`, `email_deliveries`, `outbox_events`, `audit_events`, `product_events`, `expert_escalations`, `legacy_ownership_cases`, `legacy_resource_links`. | Hash-only auth tokens; mandatory v2 owner; immutable snapshots; unique idempotency constraints; no replacement of v1 tables. |
| P0 | `drizzle/<next>_r1_pilot_v2.sql` | Additive expand migration and indexes/unique constraints, including owner/case/status and token-hash/expiry indexes. | No destructive DDL; no email-based backfill; migration is test/staging gated with reconciliation evidence. |
| P0 | `server/_core/context.ts` | Extend context with separately verified `customerSession`/`customerAccountId`, distinct from OAuth `user`. | No client input is accepted as owner proof. |
| P0 | `server/_core/trpc.ts` | Add `customerProcedure`, `ownerCaseProcedure`/policy middleware and a consistent neutral-not-found helper. Keep `adminProcedure` separate. | `401` for no customer session; neutral `404` for non-owner; role checks never replace owner checks. |
| P0 | `server/r1/policy/accessPolicy.ts` | Single policy service used by v2 tRPC and HTTP/PDF. | Checks identity → resource relation → state/access → minimal DTO → audit. |
| P0 | `server/r1/auth/magicLink.service.ts` | Issue/hash/consume/revoke tokens, rate limits and cookie session lifecycle. | Hash only, short TTL, atomic consume, no raw token persistence/logging. |
| P0 | `server/r1/auth/router.ts` | Neutral request-link, consume, logout/me procedures. | Request response does not disclose account/case; consume strips URL token. |
| P0 | `server/r1/cases/case.service.ts` and `server/r1/cases/router.ts` | Create owner-bound v2 case; server-side progress/autosave; immutable submit snapshot; cabinet/list/detail DTOs. | `customerAccountId` at creation; canonical server answers; idempotent submit. |
| P0 | `server/r1/billing/promo.service.ts` and `server/r1/billing/router.ts` | Server-only code verifier and atomic `promo_granted`/grant creation. | Raw code/hash never reaches client/log; no provider/webhook code. |
| P0 | `server/r1/reports/report.service.ts`, `templateRenderer.ts`, `pdf.service.ts` and `pdfRoutes.ts` | Deterministic report from immutable snapshot and owner-protected PDF artifact endpoint by case/report ID. Keep existing token PDFs as legacy routes; do not reuse them for v2. | One source snapshot for web/PDF, idempotent artifact, current access recheck and audit on download. |
| P0 | `server/r1/llm/disabled.ts` or `server/_core/llm.ts` plus `server/paidRouter.ts`, `server/routers.ts` | Establish explicit `disabled` R1 mode that blocks `invokeLLM`; make R1 renderer template-only; hide/replace global assistant during R1 mode. | A test spies on `invokeLLM` and fails if a R1 path invokes it. Legacy path remains a recorded risk, not a compliant R1 path. |
| P1 | `server/r1/email/types.ts`, `email.service.ts`, `testEmailAdapter.ts`, `mailWorker.ts` | Define adapter, outbox consumer, controlled test inbox, delivery states/retry/suppression. | Test-only allowlist; provider implementation and credentials absent. |
| P1 | `server/r1/admin/router.ts` and `server/r1/admin/diagnostics.service.ts` | Add paginated minimal v2 diagnostics list and aggregate status/events query. | Server role + purpose + audit; no PII/token/export in list. |
| P1 | `server/r1/analytics/events.ts` and `analytics.service.ts` | Append minimal funnel/status events and protected aggregate metrics. | No PII, answer text, token, URL or secret in event labels. |
| P1 | `server/routers.ts` | Mount only R1 routers under an explicit test/staging Pilot namespace/feature gate; retain legacy namespaces unchanged. | Default disabled in production; legal draft prevents customer runtime enablement. |
| P1 | `client/src/App.tsx` | Add `/pilot`, `/auth/request-link`, `/auth/consume`, `/cabinet`, `/cabinet/cases/:caseId`, `/cabinet/cases/:caseId/report`, `/admin/pilot-diagnostics`; retain legacy route declarations. | No v2 route parameter is treated as authority; existing routes visually labelled/isolated as compatibility risk where appropriate. |
| P1 | `client/src/pages/PilotLanding.tsx`, `RequestMagicLink.tsx`, `MagicLinkConsume.tsx`, `Cabinet.tsx`, `CaseQuestionnaire.tsx`, `CaseReport.tsx` | Create minimal responsive v2 flow using cookie-authenticated queries and server-returned status. | No `sessionToken`, promo code verifier, answers, contact PII or raw token in `localStorage`. |
| P1 | `client/src/pages/AdminPilotDiagnostics.tsx` | Build only filterable/cursor-paginated minimal diagnostics table and status-event aggregates. | No rich CRM, mass export, report editor or full legacy KPIs. |
| P1 | `client/src/components/LexyWidget.tsx` | Suppress widget or replace with static non-LLM help for Pilot/test mode. | No public `askLexy` LLM call from R1 route tree. |
| P2 | `package.json`, `playwright.config.ts`, `e2e/**` | Add Playwright and deterministic test server/database/mailbox setup. | Desktop and mobile projects execute in CI; test credentials/secrets stay outside repository. |
| P2 | `docs/release-1/decision-log.md` | Record feature gate defaults, legal/runtime prohibition, compatibility-risk owner and cutover decision prerequisites. | Prevents accidental launch or a false claim of legal approval. |

### Explicit non-changes / out of scope

Do not add a production email provider, provider API credentials, email webhooks, actual payment provider, payment webhook/refund/reconciliation, document upload/processing, storage migration, rich admin/CRM, broad analytics warehouse, LLM personalization, or dark-theme readiness. Do not delete legacy client routes under the current product decision. Do not mark legal JSON, phrases, fixtures or golden reports approved, and do not connect draft legal configs to customer runtime.[1] [2] [3]

## Concrete verification plan

### Unit and component tests

| ID | Proposed file | Scenario | Expected assertion |
|---|---|---|---|
| AUTH-01 | `server/r1/auth/magicLink.service.test.ts` | Request link for known and unknown email. | Same neutral result/status; no account/case disclosure. |
| AUTH-02 | same | Token persistence inspection. | Only peppered hash exists; raw token absent from database DTO, audit and event payload. |
| AUTH-03 | same | Expired, consumed, revoked and malformed token. | Uniform safe failure; no customer session is created. |
| AUTH-04 | same | Two parallel consumes of one valid token. | Exactly one customer session; second request is replay-safe denial. |
| AUTH-05 | same | Rate limits by normalized recipient and source class. | Limit is applied without recording raw recipient in metrics. |
| CAB-01 | `server/r1/cases/case.service.test.ts` | Create v2 case after authenticated customer session. | `customerAccountId` is server-bound and non-null. |
| CAB-02 | same | Autosave own valid active answer vs inactive/invalid question. | Only server-visible valid question persists; revision/event is created. |
| CAB-03 | same | Submit twice using same/different idempotency input. | Same key returns same snapshot; different post-submit payload cannot mutate snapshot or create second report. |
| PROMO-01 | `server/r1/billing/promo.service.test.ts` | Correct/incorrect promo and replay. | Server verifier creates one `payment_record=promo_granted`, one grant, `chargedAmount=0`; no raw code leaks. |
| REPORT-01 | `server/r1/reports/report.service.test.ts` | Render deterministic fixture snapshot. | One risk set, escalation, dates/terms and exactly one next product; immutable content hash. |
| REPORT-02 | `server/r1/reports/pdf.service.test.ts` | Web DTO and PDF renderer read one snapshot. | Normalized risks/texts/bases/terms/recommendation are identical. |
| REPORT-03 | same | Critical trigger with low aggregate score. | Critical/manual escalation state persists; score cannot smooth it away. |
| LLM-01 | `server/r1/llm.disabled.test.ts` | Execute every R1 report/assistant request with mocked `invokeLLM`. | It is never called; template renderer remains deterministic. |
| EMAIL-01 | `server/r1/email/testEmailAdapter.test.ts` | Queue and send magic email. | Test mailbox gets one allowed-recipient message; token is not stored in delivery record/log. |
| EMAIL-02 | same | Duplicate outbox claim, transient failure, retry cap, revoked access. | Provider idempotency prevents double send; bounded retry; revocation yields `suppressed`. |
| ADMIN-01 | `server/r1/admin/diagnostics.service.test.ts` | List DTO serialization. | Only allowed minimal fields; no email/name/answers/token/storage URL/report body. |
| EVENT-01 | `server/r1/analytics/events.test.ts` | Emit each funnel event. | Required safe dimensions present; forbidden PII/secret field scanner passes. |

### Integration and authorization matrix

Create router/HTTP integration tests with a disposable database and at least two customer accounts, one admin and one legacy fixture. The exact protected endpoint set must include v2 case read/write, answer autosave, submit, promo, cabinet list, report, PDF, admin list, magic link request/consume and compatibility claim.

| ID | Actor/request | Expected result |
|---|---|---|
| AUTHZ-01 | Anonymous calls any v2 protected case/report/PDF/admin procedure. | `401`; no resource payload. |
| AUTHZ-02 | Customer B sends Customer A’s `caseId` to every v2 read/write/PDF endpoint. | Neutral `404`; no state change; denied-access audit event. |
| AUTHZ-03 | Customer A repeats with own `caseId`. | Minimal allowed DTO/action succeeds only in valid lifecycle/access state. |
| AUTHZ-04 | Customer B knows A’s legacy `sessionToken` but calls v2 endpoint. | Token is ignored/not accepted as authority; `404`/`401` as applicable. |
| AUTHZ-05 | Admin calls v2 diagnostics list without purpose, then with valid purpose. | First denied; second cursor-paginated and audit logged. |
| AUTHZ-06 | PDF call with no session, wrong owner, revoked grant and valid owner. | Respectively `401`, neutral `404`, denied/suppressed, successful artifact delivery + audit. |
| AUTHZ-07 | v2 client supplies `customerAccountId`, owner ID, storage URL/key or report version crafted from another account. | Server ignores client ownership assertion and denies cross-owner request. |
| COMPAT-01 | Legacy email matches a customer account during registration/claim simulation. | No auto-link; remains unassigned/quarantined until valid claim evidence. |
| COMPAT-02 | Existing legacy routes smoke test. | Routes remain present per decision, are labelled in release evidence as compatibility risk, and do not serve as v2 acceptance proof. |
| LEGAL-01 | Attempt to activate draft config in customer runtime. | Loader/flag blocks start before a client result is generated; offline fixture runner may still execute. |

Run the 15 Release 0 fixtures through the deterministic R1 test evaluator only after a test manifest pins their versions/hashes. Assert risk set, severity, critical/escalation flags and exactly one recommendation for each fixture. The test report must state **technical oracle regression, not human legal approval**. No fixture output is exposed through customer runtime while all legal artifacts remain draft.[1] [2]

### E2E plan — Playwright desktop and mobile

Use a deterministic ephemeral database, a fixed clock, a controlled `TestEmailAdapter` mailbox, and a test-only account/email allowlist. The suite must not scrape production email and must remove raw token artifacts after each test. Configure two projects: `chromium-desktop` (for example 1440×900) and `chromium-mobile` (Pixel/iPhone-sized viewport with touch).

| ID | Project(s) | User journey | Required assertion |
|---|---|---|---|
| E2E-01 | Desktop + mobile | Open Pilot landing, request magic link, obtain it only from test mailbox, consume link. | Neutral request screen; `HttpOnly` customer cookie exists; token is removed from URL and absent from localStorage. |
| E2E-02 | Desktop | Login, accept versioned mandatory terms, leave marketing unchecked, select base tariff, submit valid server promo. | Consent versions persisted; `promo_granted` and access grant exist; no PSP UI/call. |
| E2E-03 | Desktop | Answer Pilot core/branch questions, reload, resume. | Server-side autosave restores exactly the active answers and status. |
| E2E-04 | Desktop → mobile | Start case in desktop context, consume a fresh magic link for same account on mobile, open cabinet. | The same unfinished v2 case and progress restore without copying a bearer token/browser storage. |
| E2E-05 | Desktop + mobile | Submit deterministic fixture case. | Single report snapshot is shown; critical case shows safe escalation/CTA; one next product only; no LLM network call. |
| E2E-06 | Desktop + mobile | Open report and download/view PDF. | PDF derives from same report version and expected normalized content parity; download is owner-authenticated. |
| E2E-07 | Desktop | Double-click submit/retry request then reopen report/PDF. | Exactly one submission, report version and PDF artifact; idempotency event is visible only in test DB/audit. |
| E2E-08 | Desktop + mobile | Customer B attempts A’s case/report/PDF URLs. | Neutral not-found UX/HTTP status; no title, content, timing distinction or state mutation. |
| E2E-09 | Desktop | Admin enters protected Pilot diagnostics table, supplies purpose and filters/paginates. | Only minimal DTO is rendered; audit event recorded; non-admin is denied. |
| E2E-10 | Desktop | Replay/expire magic link; use recipient outside test allowlist; force transient test transport error. | No session on replay/expiry; transport refuses unallowed recipient; delivery follows bounded `failed/retry/suppressed` policy. |
| E2E-11 | Desktop + mobile | Navigate legacy `/paid`, `/results/:token` smoke fixture only. | Existing route retained under compatibility-risk evidence; it is not counted in v2 security/launch pass rate. |

The CI gate for an eventual technical Pilot should run typecheck, all unit/integration tests, fixture regression, both Playwright projects, forbidden-field scanners for logs/events/DTOs, and a repository search proving no R1 path calls `invokeLLM`. A separate release gate must fail if the environment attempts to enable customer runtime with `draft_pending_legal_approval` configurations or without explicit human legal approval.

## Migration and release risks

| Risk | Current evidence / consequence | Required mitigation and owner decision |
|---|---|---|
| Legacy bearer access remains open | Legacy tRPC, PDFs and storage use token/key authority. | Keep route, label `compatibility risk`, do not expand; formal R1 acceptance/launch remains blocked until separate cutover decision. |
| False ownership migration | Existing sessions have contact email but no owner. | No email/OAuth/cookie/token inference; claim + evidence + quarantine only. |
| Premature legal runtime use | Legal core and phrases are draft; human approval deferred. | Config loader blocks customer runtime; offline fixture testing is not legal approval. |
| Token leakage | Current client stores token in localStorage and URL. | New v2 uses hash-only magic token and cookie session; add log/analytics/URL scanners. |
| Split brain with v1 | Updating legacy records or auto-mapping answers can corrupt provenance. | Additive v2 model, immutable `legacy_resource_links`, v1 read-only compatibility projection, reconciliation/rollback gates. |
| Misleading email result | Current owner notification is not a delivery system. | Test adapter only; delivery state never proves entitlement, legal approval or report access. |
| LLM nondeterminism | Paid report and global widget currently invoke LLM. | Hard-disable R1, template-only renderer, explicit test preventing invocation. |
| Overbroad admin access | Existing tables expose PII and broad histories without purpose/audit. | Separate minimal v2 table, cursor limits, purpose + audit, no rich-admin expansion. |
| Document scope creep | Current legacy paid page uploads files and returns storage URL. | Do not expose documents in v2 R1; R2 only after file/privacy/security gates. |
| Incorrect metrics or PII logging | No current events contract; ad hoc telemetry may leak tokens/email. | Fixed allowlist event schema and automated forbidden-field tests; aggregate metrics only. |
| Incomplete test realism | Current 21 tests are legacy-only and no browser suite exists. | Disposable test DB/mailbox, two accounts, fake clock, desktop/mobile Playwright in CI. |

## Sequencing and definition of done

Implement only in this order: **v2 policy/ownership → magic link/customer session → server promo/access grant → v2 questionnaire/autosave → deterministic report snapshot → protected PDF → test email flow → minimal cabinet/admin/events → fixture/integration/E2E**. This follows the TЗ vertical-increment order and prevents a UI from preceding the access control it must rely on.[1]

Technical completion of this module means the new v2 test path passes the listed unit/integration/fixture/E2E checks and remains disabled for client runtime. It does **not** mean launch readiness, legal approval, production email readiness, retirement of legacy routes, or formal §31.3 acceptance. Those require an explicit subsequent legal decision, a signed config-release process, a legacy cutover/compatibility decision and enabled production controls.

## References

[1]: file:///tmp/text_editor_extracts/%D0%A2%D0%973.0.%D0%92%D0%B5%D0%B1-%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D0%BF%D0%BB%D0%B0%D1%82%D0%BD%D0%BE%D0%B9%D1%8E%D1%80%D0%B8%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%D0%B4%D0%B8%D0%B0%D0%B3%D0%BD%D0%BE%D1%81%D1%82%D0%B8%D0%BA%D0%B8Lexy-849c367a6037-p1-49.txt "Техническое задание Lexy v3.0, §§ 30.3 и 31.3"
[2]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Матрица прав доступа Lexy v1: целевой owner-bound доступ и временное P0-исключение"
[3]: file:///home/ubuntu/Neolex/docs/architecture/state-machines-v1.md "Машины состояний Lexy Release 0: report, email delivery и escalation"
[4]: file:///home/ubuntu/Neolex/docs/migrations/v1-to-v2.md "План миграции Lexy v1 в v2: claim, quarantine и legacy compatibility"
[5]: file:///home/ubuntu/Neolex/docs/architecture/release-0-index.md "Lexy Release 0: индекс архитектурной фиксации и открытые gate-решения"
[6]: file:///home/ubuntu/Neolex/docs/operations/environment-and-service-accounts-v1.md "Окружение и сервисные аккаунты Lexy v1: magic link, test email transport и release boundaries"
[7]: file:///home/ubuntu/Neolex/docs/data/file-retention-policy-v1.md "Политика хранения файлов Lexy v1: документарный сценарий Release 2"
[8]: file:///home/ubuntu/jobs/job_gFnfBRFY_a4/audit-evidence.txt "Read-only evidence snapshot: commit and hashes of reviewed implementation/test files"
