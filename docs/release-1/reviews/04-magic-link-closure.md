# Release 1 — Magic Link: closure review и техническая приёмка

**Vertical increment:** 2 — Magic Link
**Статус:** технически принят для **synthetic/test-only** контура; production/client launch запрещён.
**Дата closure:** 13 сентября 2026 г.
**Ветка:** `feat/lexy-release-1-magic-link`

## 1. Граница принятого результата

Инкремент реализует отдельный v2 lifecycle customer-аутентификации: запрос magic link, хешированное одноразовое подтверждение, создание server-side customer session, защищённый cookie, logout/revoke и controlled test delivery. Он не изменяет legacy `users`, OAuth rows, `paid_sessions.contactEmail`, legacy cookies или token routes и не выводит owner из legacy email.

> **Не является запуском для клиентов.** Доступ возможен только при exact synthetic gate: disposable loopback MySQL/MariaDB, `NODE_ENV=test`, `LEXY_R1_SYNTHETIC_TEST_MODE=true`, identity `r1-harness`, class `disposable_test`, пяти разных секретах/pepper длиной не менее 32 символов и `LEXY_R1_EMAIL_TRANSPORT=test`. Клиентский runtime остаётся fail-closed.

| Контур | Принятое решение | Ограничение |
|---|---|---|
| Token | 256-bit verifier существует только transiently; база хранит только domain-separated HMAC hash, opaque IDs и timestamps. | Raw token, URL и email не попадают в DB, audit, outbox, API DTO или обычные logs. |
| Delivery | Используется только in-memory `TestEmailTransport` и harness-bound `TestInbox`. | SMTP, HTTP API, provider secrets, webhooks и production domains отсутствуют. |
| Delivery race | Перед единственным test side effect worker делает fresh-clock fenced commit `sent/published`; stale worker не вызывает transport. | Для реального provider потребуется отдельный idempotency, acknowledgement и reconciliation protocol. |
| Session | Только `__Host-lexy-customer-session`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, без `Domain`. | OAuth, Bearer, email и legacy token не являются customer credentials. |
| UI | `/auth/request-link` и `/auth/consume` исключены из LexyWidget, legacy analytics, OAuth redirect и legacy Bearer fallback. | Fragment verifier сразу удаляется из history до POST; controlled UI не использует browser storage. |

## 2. Закрытые security findings

Первичный независимый review выявил три major-замечания. Все они закрыты и повторно проверены.

| Finding | Remediation | Evidence |
|---|---|---|
| Logout мог откатиться при ошибке audit | Ownership-scoped revocation коммитится отдельно; audit выполняется best-effort после commit. | Реальный DB test подтверждает `revoked` и последующий denial даже при injected audit failure. |
| Stale worker мог отправить test delivery после истечения lease | Уникальный worker owner, version/expiry fencing и fresh pre-send commit в одном transaction до in-memory side effect. | Paused-worker DB race: worker B reclaim-ит и записывает единственный inbox message; worker A возвращает `lease_lost` без transport call. |
| Existing customer session обходила closed gate | `customerProcedure` централизованно вызывает `assertTechnicalPilotAllowed()` после проверки customer principal. | `pilot.auth.me` для закрытого gate получает `PRECONDITION_FAILED`; OAuth/Bearer не становятся customer identity. |

Финальный focused review признал stale-worker closure **PASS** для явно ограниченного in-process test transport. Он также фиксирует, что commit-before-effect не может быть использован как production delivery protocol.

## 3. Проверки

| Проверка | Результат |
|---|---|
| TypeScript | `pnpm check` — PASS |
| Unit tests | `pnpm test` — PASS, 21 files / 176 tests |
| Production build | `pnpm build` — PASS |
| Diff hygiene | `git diff --check` — PASS |
| Disposable MariaDB | `pnpm test:r1:db` — PASS, migrations `0000`–`0006`, 5 integration files / 21 tests |
| UI review | `/auth/request-link` и `/auth/consume` проверены на 44px controls, fragment cleanup, neutral retry UI, отсутствие LexyWidget и horizontal overflow. |

## 4. Следующий допустимый этап

Следующий этап — **Vertical increment 3: Promo access**. Он может начаться только как synthetic/test-only implementation: server-controlled zero-charge promo ledger, explicit consents и owner-bound access grant. Questionnaire остаётся закрытой до создания active grant.

Реальный email provider, включение client runtime, legal approval и production launch не входят в этот инкремент и не могут быть выведены из его успешных тестов.
