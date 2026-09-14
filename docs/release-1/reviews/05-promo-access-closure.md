# Release 1 — Promo access: closure review и техническая приёмка

**Vertical increment:** 3 — Promo access
**Статус:** технически принят для **synthetic/test-only** контура; production/client launch запрещён.
**Дата closure:** 13 сентября 2026 г.
**Ветка:** `feat/lexy-release-1-promo-access`

## 1. Граница принятого результата

Инкремент добавляет отдельный v2 server-authoritative контур zero-charge Promo access. Контур принимает только код тарифа, transient promo value, idempotency key и строгие assertions трёх метаданных документа. Он создаёт case, immutable tariff snapshot, факт каждого consent, zero-charge payment record и owner-bound access grant в одной DB-транзакции. В данный инкремент не входят PSP, webhooks, реальный email, production delivery, клиентский запуск, юридическое утверждение текстов или доступ к legacy payment/session данным.

> **Не является запуском для клиентов.** Promo endpoint доступен только при exact synthetic gate: loopback disposable MySQL/MariaDB, `NODE_ENV=test`, `LEXY_R1_SYNTHETIC_TEST_MODE=true`, identity `r1-harness`, class `disposable_test`, тестовый email transport, `LEXY_R1_PAYMENT_PROVIDER=disabled`, валидный server-only campaign ID и семь pairwise-distinct secret/pepper значений длиной не менее 32 символов. Client runtime остаётся hard-disabled.

| Контур | Принятое решение | Ограничение |
|---|---|---|
| Promo verifier | Сравнение выполняется на сервере через domain-separated HMAC-SHA-256 и `timingSafeEqual`. | Raw promo, verifier и pepper не попадают в DB, audit, outbox, DTO, URL, storage или logs. |
| Offer и payment | Единственный server allowlist offer — `base_diagnostic`; payment status `promo_granted`, charge `0`, currency `RUB`. | Нет цены в client DTO/snapshot, PSP, provider SDK, `confirmPayment` или webhook. |
| Consents | Регистр содержит только metadata-only draft/test records; terms и data processing обязательны, marketing — явное независимое boolean-решение. | Правовой текст и human legal approval не имитируются. |
| Access | `access_grants` проверяются по owner/case/payment/status/revocation/expiry; revoke является conditional, audited и не меняет payment/consent facts. | Questionnaire и report по-прежнему закрыты до будущего increment с active-grant policy. |
| Client security | Raw promo живёт только во время отправки; settled mutation сбрасывается и удаляется из cache. Retry-key хранится только в ref до definitive success или смены canonical command. | Persistent browser storage, query tokens и analytics на controlled routes запрещены. |
| Legal metadata route | `/r1/legal/:documentId` открывает только server-returned metadata текущей customer session. | Экран не содержит юридического текста и явно помечен как draft/test-only. |

## 2. Закрытые security findings

| Finding | Remediation | Evidence |
|---|---|---|
| Raw promo мог остаться в mutation cache | Promo mutation использует `gcTime: 0`, после settlement вызывает observer reset и удаляет только matching mutation с raw variables. | Реальный `QueryClient` test подтверждает отсутствие raw test value в оставшемся MutationCache. |
| Retry мог менять idempotency key после неопределённого ответа | Ref-backed logical retry state переиспользует ключ при неизменном tariff/consent canonical signature; key очищается только при success или semantic change. | Focused client contract test проверяет reuse, rotation after canonical change и rotation after success. |
| Metadata href вёл в NotFound и пересекал legacy boundary | `documentRegistry` выдаёт `/r1/legal/:documentId`; controlled route mounted before legacy `/legal/:doc`, gated через customer procedure и promo gate. | Route/registry contract test проверяет соответствие всех document IDs. |
| Analytics оставалась после SPA-navigation в controlled route | `LegacyAnalytics` синхронизируется с текущим Wouter location и удаляет every owned script tag на controlled route/unmount. | Shared controlled classifier используется App и transport; template fragment с global analytics также удалён. |
| Campaign change мог replay прежней команды | Server campaign ID включён в keyed canonical request fingerprint. | Real-DB scenario меняет campaign env, загружает fresh service snapshot и получает `CONFLICT`, не replay. |
| Consent actor session не был DB-bound к owner | Добавлены unique `(customer_sessions.id, customerAccountId)` и composite consent FK `(actorCustomerSessionId, customerAccountId)`. | Disposable MariaDB test отклоняет cross-account actor session и принимает owned actor. |
| Ошибка audit/outbox нуждалась в прямом rollback evidence | Internal-only dependency seam даёт injected throwing audit/outbox writers в real transaction. | Два real-DB теста видят staged facts до injected failure и затем подтверждают отсутствие case/snapshot/consents/payment/grant/idempotency/audit/outbox. |

## 3. Проверки

| Проверка | Результат |
|---|---|
| TypeScript | `pnpm check` — PASS |
| Unit and client security contracts | `pnpm test` — PASS, 29 files / 243 tests |
| Production build | `pnpm build` — PASS |
| Diff hygiene | `git diff --check` — PASS |
| Disposable MariaDB | `pnpm test:r1:db` — PASS, fresh migrations `0000`–`0007`, 6 integration files / 33 tests |
| Promo DB acceptance | PASS: atomic graph, same-key replay, changed canonical conflict, campaign-change conflict, distinct-key race, invalid promo/consent rejection, owner/revoke/expiry policy, late unique rollback, injected audit rollback, injected outbox rollback. |
| Independent closure review | PASS: client raw-promo lifecycle; PASS: controlled legal/analytics boundary. Server source review confirmed the design; its environment did not receive DB credentials, therefore the command result above is retained as the authoritative execution evidence. |

## 4. Remaining launch blocks and next safe step

**Client launch remains prohibited.** Existing legacy promo literal and public legacy `confirmPayment` remain an application-wide launch blocker; they are not imported or called by the new v2 contour and were intentionally not altered in this increment. Legal text remains draft metadata only and has not received human-lawyer approval.

The next safe implementation increment is **Questionnaire v2 runtime behind `requireActiveOwnedAccessGrant`**: owner-bound autosave, schema validation, no LLM widget in the controlled path, and fixtures/golden report comparison. It must retain the current client-runtime prohibition and defer human legal approval until the full implementation package is ready.
