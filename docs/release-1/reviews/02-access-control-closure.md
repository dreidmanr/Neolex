# READ-ONLY closure review: Release 1 / Vertical increment 1 — Access control

**Автор:** Manus AI
**Дата:** 2026-09-13
**Репозиторий:** `/home/ubuntu/Neolex`
**Ветка:** `feat/lexy-release-1-pilot`
**Режим:** повторный review незакоммиченного working tree; runtime/test/schema/client не изменялись; на существующей локальной disposable MariaDB применён migration profile и выполнены integration tests
**Вердикт:** **NEEDS_REMEDIATION**

> Это технический security/architecture review. Он **не является юридическим заключением, human legal approval или разрешением на client/runtime launch**.

## 1. Итог

Большая часть замечаний round 1 закрыта. **M-02–M-05 и m-01/m-02 закрыты**, а дефекты длинных foreign-key identifiers, MariaDB JSON replay и первого символа `nanoid` исправлены и подтверждены. Реальная DB-suite прошла на локальной disposable MariaDB 10.11.14: миграции `0000..0005`, owner/admin matrix, same-key replay, different-command conflict, CAS race и rollback audit/outbox проверены без mock DB.

Техническая acceptance increment пока невозможна из-за одного остаточного major в **M-01**. Client gate жёстко закрыт, identity и secret checks присутствуют, public synthetic writer отсутствует, а test wrapper требует loopback. Однако runtime release gate признаёт disposable любую URL, если имя базы начинается с `lexy_r1_test_`; он не проверяет MySQL/MariaDB protocol и loopback host. Прямой probe подтвердил `synthetic=true` для удалённой MySQL URL и для HTTPS URL с подходящим path. Это нарушает обязательный инвариант «synthetic только на disposable loopback DB».

**B-01 остаётся согласованным legacy P0 вне v2 и не учитывается как дефект increment.** Сохранённые legacy bearer routes и LLM surface блокируют любое global §31.3 compliance или launch-ready утверждение.[1] [3]

| Класс | Количество | Решение |
|---|---:|---|
| blocker, относимый к v2 increment | 0 | Нет. |
| major, относимый к v2 increment | 1 | M-01 частично закрыт: runtime gate не требует loopback/protocol. |
| minor, относимый к v2 increment | 0 | m-01 и m-02 закрыты. |
| accepted legacy P0 / global blocker | 1 | B-01 остаётся вне v2, но блокирует global §31.3/launch claim. |

## 2. Closure matrix

| Finding / defect | Статус | Точное evidence |
|---|---|---|
| **M-01 release gate** | **PARTIAL — major remains** | Client mode константно закрыт в [`server/r1/releaseGate.ts:35-37`](../../../server/r1/releaseGate.ts#L35-L37). Synthetic требует exact `NODE_ENV=test`, flag, identity `r1-harness`, DB class и отдельный secret в [`server/r1/releaseGate.ts:38-44`](../../../server/r1/releaseGate.ts#L38-L44). Но `disposableTestDatabase()` проверяет только prefix pathname в [`server/r1/releaseGate.ts:16-24`](../../../server/r1/releaseGate.ts#L16-L24), без protocol/host. Review probe получил `synthetic=true, mode=synthetic` и для remote MySQL, и для non-DB HTTPS URL. Wrapper отдельно и правильно требует MySQL/MariaDB + loopback в [`tools/run-r1-db-tests.ts:23-42`](../../../tools/run-r1-db-tests.ts#L23-L42), но это не закрывает runtime gate. В routers нет synthetic mutation; единственный non-test caller `createSyntheticCase` — несмонтированный service в [`server/r1/cases/caseService.ts:83-90`](../../../server/r1/cases/caseService.ts#L83-L90), а v2 app mounts только read/admin routers в [`server/routers.ts:42-43`](../../../server/routers.ts#L42-L43). |
| **M-02 transition idempotency** | **CLOSED** | Command включает idempotency key и canonical keyed hash; claim, owner lookup, CAS, audit, outbox и completion выполняются в одной transaction в [`server/r1/transitions/transitionService.ts:127-219`](../../../server/r1/transitions/transitionService.ts#L127-L219). Real DB tests подтверждают same-key replay без дублей, different-command conflict, one-winner race, stale rollback, audit failure rollback, outbox collision rollback и transition owner isolation в [`server/r1/integration/transitions.integration.test.ts:69-195`](../../../server/r1/integration/transitions.integration.test.ts#L69-L195). |
| **M-03 DB-backed evidence** | **CLOSED** | Выделенный профиль включает только integration suite и использует single real-DB process в [`vitest.r1-db.config.ts:41-59`](../../../vitest.r1-db.config.ts#L41-L59). Wrapper fail-closed проверяет exact environment, loopback DB, database marker и разные длинные secrets в [`tools/run-r1-db-tests.ts:17-55`](../../../tools/run-r1-db-tests.ts#L17-L55). Реальный прогон: **3 files, 15 tests passed**; Drizzle сообщил успешное применение migrations. |
| **M-04 denial audit/requestId** | **CLOSED** | Context всегда генерирует новый server-side request ID и игнорирует client correlation header в [`server/_core/context.ts:70-77`](../../../server/_core/context.ts#L70-L77). Owner denial использует `aggregateId=unresolved_case`, reason code и request ID, не записывая locator, в [`server/r1/cases/router.ts:43-59`](../../../server/r1/cases/router.ts#L43-L59). Role denial и purpose denial аудитируются в [`server/_core/trpc.ts:69-94`](../../../server/_core/trpc.ts#L69-L94) и [`server/r1/admin/router.ts:25-49`](../../../server/r1/admin/router.ts#L25-L49). Real DB tests подтвердили одинаковый `NOT_FOUND`, два audit events без cross-owner/missing public IDs и admin denials без raw purpose в [`server/r1/integration/access.integration.test.ts:64-135`](../../../server/r1/integration/access.integration.test.ts#L64-L135). |
| **M-05 strict event/privacy contracts** | **CLOSED** | Audit/outbox используют strict discriminated schemas по event type; разрешённые metadata/payload fields и весь generated envelope валидируются в [`server/r1/events/contracts.ts:19-130`](../../../server/r1/events/contracts.ts#L19-L130). Repositories валидируют готовый envelope до insert в [`server/r1/audit/auditRepository.ts:12-22`](../../../server/r1/audit/auditRepository.ts#L12-L22) и [`server/r1/outbox/outboxRepository.ts:13-29`](../../../server/r1/outbox/outboxRepository.ts#L13-L29). Unit tests отвергают произвольные/nested fields, token-like values, unsafe IDs/event types/dedupe keys: [`server/r1/events/contracts.test.ts:46-96`](../../../server/r1/events/contracts.test.ts#L46-L96). |
| **m-01 secret domain separation** | **CLOSED** | `LEXY_CUSTOMER_SESSION_SECRET` больше не имеет fallback к JWT в [`server/_core/env.ts:1-8`](../../../server/_core/env.ts#L1-L8). Gate требует минимум 32 символа и неравенство JWT в [`server/r1/releaseGate.ts:27-30`](../../../server/r1/releaseGate.ts#L27-L30); wrapper требует оба отдельных секрета в [`tools/run-r1-db-tests.ts:44-54`](../../../tools/run-r1-db-tests.ts#L44-L54). |
| **m-02 TTL/completion semantics** | **CLOSED** | Policy теперь явно делает key невосстанавливаемой semantic identity, а `expiresAt` — только cleanup metadata; completion проверяет `affectedRows === 1` в [`server/r1/idempotency/idempotencyRepository.ts:24-81`](../../../server/r1/idempotency/idempotencyRepository.ts#L24-L81). Unit tests покрывают expired/failed non-reuse и completion CAS; transition suite подтверждает transactional behavior. |
| **Long FK identifiers** | **CLOSED** | Семь явных FK имён имеют длину **22–28**, максимум constraint name в `0005` — 48, максимум explicit index name — 51; все ниже лимита 64. Имена видны в [`drizzle/0005_r1_access_control_expand.sql:174-180`](../../../drizzle/0005_r1_access_control_expand.sql#L174-L180). Миграция реально применена на MariaDB 10.11.14. |
| **MariaDB JSON replay** | **CLOSED** | Repository нормализует string JSON через `JSON.parse` и сохраняет already-decoded values в [`server/r1/idempotency/idempotencyRepository.ts:15-21`](../../../server/r1/idempotency/idempotencyRepository.ts#L15-L21), затем возвращает нормализованный `responseJson` в [`server/r1/idempotency/idempotencyRepository.ts:59-67`](../../../server/r1/idempotency/idempotencyRepository.ts#L59-L67). Real MariaDB same-key replay дважды вернул тот же response и сохранил ровно один idempotency/audit/outbox набор: [`server/r1/integration/transitions.integration.test.ts:69-88`](../../../server/r1/integration/transitions.integration.test.ts#L69-L88). |
| **nanoid leading character** | **CLOSED** | Все новые opaque IDs получают стабильный alphabetic prefix `${kind}_`, поэтому leading `-`/`_` nanoid не становится первым символом полного ID: [`server/r1/ids.ts:3-13`](../../../server/r1/ids.ts#L3-L13). Это согласовано с envelope regex, требующим первый alphanumeric символ, в [`server/r1/events/contracts.ts:3-4`](../../../server/r1/events/contracts.ts#L3-L4). |

## 3. Обязательные security/architecture invariants

### 3.1 Authentication, ownership и DTO

Customer principal формируется только из dedicated cookie `__Host-lexy-customer-session`; raw cookie HMAC-хэшируется отдельным secret до owner-session lookup в [`server/_core/context.ts:9-47`](../../../server/_core/context.ts#L9-L47). OAuth user и `Authorization` header обрабатываются другим контуром и не создают customer principal. Real DB access matrix явно отвергла anonymous, OAuth admin, Bearer header и legacy cookie как customer auth и подтвердила owner A/B isolation в [`server/r1/integration/access.integration.test.ts:30-62`](../../../server/r1/integration/access.integration.test.ts#L30-L62).

Owner ограничения находятся в SQL: list — `customerAccountId`; get — `(publicId, customerAccountId)`; internal transition lookup — `(id, customerAccountId)`; CAS — `(id, customerAccountId, fromStatus, stateVersion)` в [`server/r1/cases/caseRepository.ts:50-124`](../../../server/r1/cases/caseRepository.ts#L50-L124). Customer DTO содержит только public ID, status/tier/version/timestamps. Admin DTO содержит public ID, статусы и timestamps без internal account ID, email, token, answers или URL в [`server/r1/cases/caseRepository.ts:12-40`](../../../server/r1/cases/caseRepository.ts#L12-L40) и [`server/r1/cases/caseRepository.ts:127-160`](../../../server/r1/cases/caseRepository.ts#L127-L160).

### 3.2 Admin boundary

Admin list использует отдельный audited role middleware, allowlisted purpose, limit `1..100`, stable cursor и минимальный DTO в [`server/r1/admin/router.ts:10-83`](../../../server/r1/admin/router.ts#L10-L83). Real DB pagination test получил две страницы без account IDs/email/token и ровно один successful audit на страницу с request ID и purpose в [`server/r1/integration/access.integration.test.ts:137-185`](../../../server/r1/integration/access.integration.test.ts#L137-L185).

### 3.3 Migration and database

`0005` состоит из `CREATE TABLE`, add-only `ALTER TABLE … ADD CONSTRAINT` и `CREATE INDEX`; destructive operation не обнаружена.[4] Snapshot comparison `0004 → 0005`: **11 tables added, 0 removed, 0 existing table definitions changed**, а `0005.prevId` указывает на snapshot `0004`. Journal содержит последовательную запись `idx: 5` в [`drizzle/meta/_journal.json:40-45`](../../../drizzle/meta/_journal.json#L40-L45).

DB suite подтвердила 11 v2 tables, 7 FK, required indexes, сохранность 12 legacy tables и их row counts, FK enforcement и unique constraints в [`server/r1/integration/schema.integration.test.ts:100-212`](../../../server/r1/integration/schema.integration.test.ts#L100-L212). Review не применял migration к staging/production.

### 3.4 Client Pilot shell

Pilot, Cabinet и Admin Pilot routes исключают `LexyWidget` в [`client/src/App.tsx:39-56`](../../../client/src/App.tsx#L39-L56). Targeted scan новых Pilot pages/components не обнаружил Bearer/session token, cookie manipulation, local/session storage, OAuth redirect или synthetic writer control. Pilot UI в synthetic mode показывает только технический статус и переход к read-only cabinet, прямо указывая отсутствие клиентского использования и create actions в [`client/src/pages/Pilot.tsx:54-119`](../../../client/src/pages/Pilot.tsx#L54-L119).

## 4. Выполненные проверки

| Команда / проверка | Результат | Доказательство и ограничения |
|---|---|---|
| `pnpm check` | **PASS** | `tsc --noEmit`, exit 0. |
| `pnpm test` | **PASS** | **13 files, 99 tests passed**. Default profile намеренно исключает DB integration в [`vitest.config.ts:15-19`](../../../vitest.config.ts#L15-L19). |
| `pnpm build` | **PASS** | Vite: 1,782 modules; server esbuild завершён. Были только существующие warnings по analytics placeholders, CSS `@import` и large chunk; build exit 0. |
| `git diff --check` | **PASS** | Whitespace errors отсутствуют. |
| `pnpm test:r1:db` с заданным exact test profile | **PASS** | MariaDB **10.11.14**, Drizzle migrations applied, **3 files, 15 tests passed**. URL и secrets в отчёт не включены. |
| DB wrapper без обязательного env | **EXPECTED FAIL-CLOSED** | Exit 1: `NODE_ENV must be exactly test`; URL/username/password не напечатаны. |
| Runtime gate adversarial probe | **FAIL** | Remote MySQL и HTTPS URL с `lexy_r1_test_` pathname обе дали `synthetic=true`; это остаток M-01. |
| Snapshot/static migration review | **PASS** | 11 added / 0 removed / 0 existing changed; 7 FK names length 22–28; destructive DDL/DML не найден. |

Совокупно выполнено **114 passing tests**: 99 default + 15 real-DB integration. DB wrapper также отдельно доказал fail-closed отказ при отсутствующем exact test environment.

## 5. Решение

**NEEDS_REMEDIATION.** По правилу acceptance `PASS` допустим только при нуле blocker/major, относимых к v2 increment. Сейчас остаётся **1 major**: runtime `disposableTestDatabase()` должен валидировать разрешённый DB protocol и loopback hostname так же строго, как wrapper/config/harness, и это должно быть закреплено отрицательными unit tests для remote MySQL и non-DB URL.

После этой точечной remediation M-01 может быть закрыт без пересмотра уже подтверждённых M-02–M-05, m-01/m-02 и трёх post-round-1 defects. Однако даже будущий technical increment PASS **не будет global launch approval**: B-01 legacy bearer/LLM остаётся принятым P0 вне v2 и продолжает блокировать global §31.3/launch claim.[1] [3]

## References

[1]: file:///home/ubuntu/Neolex/docs/release-1/reviews/01-access-control-review.md "Round 1 access-control review"
[2]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Матрица прав доступа Lexy v1"
[3]: file:///home/ubuntu/Neolex/docs/release-1/implementation-plan.md "Release 1 — implementation plan защищённого v2 Pilot"
[4]: file:///home/ubuntu/Neolex/drizzle/0005_r1_access_control_expand.sql "Release 1 access-control expand migration"
