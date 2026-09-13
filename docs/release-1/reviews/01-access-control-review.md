# READ-ONLY review: Release 1 / Vertical increment 1 — Access control

**Автор:** Manus AI
**Дата:** 2026-09-13
**Репозиторий:** `/home/ubuntu/Neolex`
**Ветка:** `feat/lexy-release-1-pilot`
**Режим:** review незакоммиченного working tree; миграция не применялась; кроме этого отчёта файлы не изменялись
**Вердикт:** **NEEDS_REMEDIATION**

> Этот review является технической проверкой безопасности и архитектуры. Он **не является юридическим заключением, human legal approval или разрешением на client/runtime launch**.

## 1. Итог

Increment создаёт полезную v2-основу: отдельный customer principal, owner-bound SQL-предикаты, нейтральный `404`, минимальные DTO, CAS по `stateVersion`, add-only migration, транзакционные записи case/audit/outbox и исключение `LexyWidget` из Pilot route tree. Прямого IDOR, query-by-id-then-check, raw customer token в текущих v2 DTO или разрушительного изменения legacy-схемы не обнаружено.

Принять increment нельзя. Release gate допускает synthetic writer вне строго идентифицированной disposable test-среды и допускает client mode по произвольной непустой строке hash. Transition foundation не реализует обязательную идемпотентность. Требуемые DB-backed owner/race/rollback/migration/admin-audit тесты отсутствуют. Security-аудит отказов и `requestId` не реализован. Privacy guard не гарантирует отсутствие raw credential/PII во всём audit/outbox envelope.

**Legacy bearer routes remain an accepted P0 compatibility risk outside v2 and prevent a global §31.3 claim.** Они не являются дефектом, внесённым v2 increment, но их сохранение блокирует application-wide утверждение о соответствии §31.3 и launch readiness.[1] [3]

| Severity | Количество | Решение |
|---|---:|---|
| blocker | 1 | Глобальная §31.3 acceptance заблокирована сохранённым legacy bearer surface. |
| major | 5 | Increment требует исправлений release gate, idempotent transition, DB integration evidence, audit coverage и privacy enforcement. |
| minor | 2 | Требуются domain separation секретов и завершённая TTL/CAS-семантика idempotency repository. |
| note | 4 | Зафиксированы положительные свойства и ограничения доказательной базы. |

## 2. Findings

### B-01 — blocker — Legacy bearer/LLM surface исключает глобальную §31.3 acceptance

**Evidence.** В изменённом root router сохранены public legacy операции по `sessionToken`: чтение сессии в [`server/routers.ts:70-83`](../../../server/routers.ts#L70-L83), изменение ответов в [`server/routers.ts:143-175`](../../../server/routers.ts#L143-L175), завершение по присланному token/payload в [`server/routers.ts:177-210`](../../../server/routers.ts#L177-L210) и чтение результата в [`server/routers.ts:243-255`](../../../server/routers.ts#L243-L255). Public LLM endpoint остаётся смонтированным в [`server/routers.ts:213-240`](../../../server/routers.ts#L213-L240). Legacy URL routes с bearer token остаются в [`client/src/App.tsx:23-32`](../../../client/src/App.tsx#L23-L32). Сам implementation plan прямо называет это P0 compatibility risk и запрещает глобальный §31.3 claim в [`docs/release-1/implementation-plan.md:22-29`](../implementation-plan.md#L22-L29) и [`docs/release-1/implementation-plan.md:232-240`](../implementation-plan.md#L232-L240).

**Impact.** ТЗ §23 требует server customer session + owner check вместо знания `sessionToken`; §31.3 требует невозможность доступа по `sessionToken` и выключенную LLM.[3] Изолированный v2 path может оцениваться отдельно, но приложение в целом этим требованиям не соответствует.

**Remediation.** Не ослаблять v2 и не считать legacy тесты частью v2 pass rate. До любого глобального §31.3/launch утверждения требуется отдельное согласованное решение: deployment isolation, owner-bound compatibility adapter с verified claim либо decommission legacy bearer routes. Legacy LLM endpoint и legacy report LLM должны быть отключены или изолированы от клиентского Release 1 runtime.

### M-01 — major — Release gate допускает неавторизованное расширение test/client boundary

**Evidence.** Client mode открывается при трёх строковых env-условиях, причём `approvedBundleHash()` проверяется только на непустоту, а не на соответствие реально загруженному и утверждённому manifest: [`server/r1/releaseGate.ts:16-33`](../../../server/r1/releaseGate.ts#L16-L33). Тест прямо принимает фиктивное значение `sha256:approved`: [`server/r1/releaseGate.test.ts:14-33`](../../../server/r1/releaseGate.test.ts#L14-L33). Synthetic mode разрешён при любом `NODE_ENV !== "production"`, включая отсутствующий или ошибочно названный environment: [`server/r1/releaseGate.ts:34-46`](../../../server/r1/releaseGate.ts#L34-L46). Persisting test command постоянно смонтирован в app router через [`server/r1/cases/router.ts:48-61`](../../../server/r1/cases/router.ts#L48-L61) и проверяет только этот gate в [`server/r1/cases/caseService.ts:77-89`](../../../server/r1/cases/caseService.ts#L77-L89). Проверки test identity, disposable database fingerprint, fixed clock или harness scope нет.

**Impact.** Ошибка конфигурации non-production среды с реальными/сохраняемыми данными превращает test API в доступный authenticated writer. Произвольная непустая строка может представить несуществующее legal approval как client-enabled state. Это слабее обязательного режима `technical_test_only` с test identity и disposable DB и противоречит текущему запрету client launch в [`docs/release-1/implementation-plan.md:13-26`](../implementation-plan.md#L13-L26).

**Remediation.** До отдельного approval жёстко запретить client mode для этого increment. В дальнейшем сверять digest загруженного bundle с versioned allowlist/approval record, а не только с непустой env-строкой. Synthetic mode должен требовать точный allowlist environment, например `NODE_ENV === "test"`, отдельную harness/service identity и проверяемый disposable DB marker. Test writer следует не монтировать вне test-only router/startup profile. Добавить отрицательные тесты для `NODE_ENV` unset/`development`/`staging`, ошибочного hash, отсутствующей test identity и non-disposable DB.

### M-02 — major — Transition service не выполняет обязательный idempotency contract

**Evidence.** `transitionCase` принимает case, owner, actor, expected version и edge, но не принимает idempotency key/request hash: [`server/r1/transitions/transitionService.ts:41-50`](../../../server/r1/transitions/transitionService.ts#L41-L50). CAS, audit и outbox действительно находятся в одной transaction в [`server/r1/transitions/transitionService.ts:56-112`](../../../server/r1/transitions/transitionService.ts#L56-L112), однако idempotency record в неё не входит. Тест transition service проверяет только таблицу разрешённых/запрещённых edges: [`server/r1/transitions/transitionService.test.ts:7-40`](../../../server/r1/transitions/transitionService.test.ts#L7-L40). Он не вызывает `transitionCase`, не моделирует retry/race и не проверяет rollback audit/outbox.

**Impact.** Повтор команды после неизвестного клиенту commit не возвращает прежний результат, а становится state conflict. Нельзя доказать требуемые same-key replay, different-hash conflict, exactly-once side effects и rollback semantics. Это не выполняет сквозной invariant и test gate из [`docs/release-1/implementation-plan.md:31-35`](../implementation-plan.md#L31-L35) и [`docs/release-1/implementation-plan.md:60-63`](../implementation-plan.md#L60-L63).

**Remediation.** Сделать transition typed command с canonical request hash и HMAC-hashed idempotency key. Claim, owner/state CAS, domain fact, append-only audit, deduplicated outbox и completed response должны выполняться одной DB transaction. Реальными конкурентными тестами доказать: same key/same hash replay, same key/different hash conflict, two-writer race, stale `stateVersion`, audit failure rollback и outbox failure rollback.

### M-03 — major — Нет требуемого DB-backed security и migration evidence

**Evidence.** Vitest запускает только `server/**/*.test.ts`/`*.spec.ts` в node environment: [`vitest.config.ts:15-18`](../../../vitest.config.ts#L15-L18). Router tests заменяют БД и repositories mock-объектами: [`server/r1/pilot.router.test.ts:4-18`](../../../server/r1/pilot.router.test.ts#L4-L18), [`server/r1/admin/router.test.ts:4-11`](../../../server/r1/admin/router.test.ts#L4-L11). Case atomicity test также mock-ит transaction и все writes: [`server/r1/cases/caseService.test.ts:3-32`](../../../server/r1/cases/caseService.test.ts#L3-L32). В working tree отсутствуют предусмотренные планом `schema.integration.test.ts`, `v2OwnerMatrix.integration.test.ts`, `legacyCompatibilityRisk.test.ts` и `adminAudit.integration.test.ts`; имеющийся transition test не обращается к БД.

`pnpm test` прошёл (`11` test files, `68` tests), но в process environment, `/home/ubuntu/.env` и `/home/ubuntu/.user_env` не было `DATABASE_URL`. Поэтому suite прошёл без DB и не является evidence применения migration, FK/index/unique constraints, owner isolation, transaction rollback или race semantics.

**Impact.** Ключевые acceptance свойства подтверждены только source inspection и mocks. Ошибки MySQL isolation, Drizzle affected-row behavior, unique-key concurrency, rollback и migration compatibility останутся незамеченными.

**Remediation.** Добавить disposable MySQL integration profile с обязательным `DATABASE_URL`; fail/skip должен быть явным и не считаться pass. Выполнить baseline `0001..0004` → `0005` на disposable DB, проверить FK/index/unique и отсутствие изменения legacy schema. Добавить полную anonymous/A/B/admin/worker matrix на real queries, neutral `404`, legacy token rejection, concurrent idempotency/CAS, принудительные audit/outbox failures и admin purpose/audit pagination. Production/staging migration в рамках review не применять.

### M-04 — major — Denied access и административные отказы не имеют обязательного audit/request correlation

**Evidence.** `TrpcContext` не содержит `requestId`/correlation identity: [`server/_core/context.ts:10-20`](../../../server/_core/context.ts#L10-L20). Other-owner/missing case завершается neutral `404` без audit в [`server/r1/cases/router.ts:33-47`](../../../server/r1/cases/router.ts#L33-L47). Invalid admin purpose отклоняется до записи audit в [`server/r1/admin/router.ts:31-39`](../../../server/r1/admin/router.ts#L31-L39); role denial происходит в middleware [`server/_core/trpc.ts:50-65`](../../../server/_core/trpc.ts#L50-L65) и также не журналируется. Даже successful admin list audit не записывает `requestId`: [`server/r1/admin/router.ts:50-63`](../../../server/r1/admin/router.ts#L50-L63). Access matrix требует audit аномальных/запрещённых попыток и минимальный `requestId` в [`docs/security/access-matrix-v1.md:108-122`](../../security/access-matrix-v1.md#L108-L122).

**Impact.** IDOR probing, purpose abuse и role-denied attempts нельзя связать с запросом и расследовать. Выполнение требования «административные методы проверяются по роли и логируются» доказано только для успешного list response, но не для отказов.[2] [3]

**Remediation.** Генерировать/валидировать server `requestId` в context. Централизовать audited denial в policy/middleware без записи raw locator/cookie/token. Для admin role/purpose denial и owner-neutral denial писать минимальное `denied` событие с pseudonymous actor/resource class, reason code и request ID. Добавить integration tests, включая отказ audit write и проверку отсутствия sensitive payload.

### M-05 — major — Privacy guard не гарантирует отсутствие raw credential/PII в audit/outbox

**Evidence.** `privacySafeMetadata` запрещает чувствительные **имена ключей**, но для строк распознаёт только `Bearer …`, URL и email: [`server/r1/audit/privacySafeMetadata.ts:11-39`](../../../server/r1/audit/privacySafeMetadata.ts#L11-L39). Случайный raw session/magic token, API key, телефон, имя или свободный текст под нейтральным ключом (`value`, `note`, `reference`) проходит проверку. Audit repository валидирует только `privacySafeMetadata`, после чего без проверки распространяет остальные поля event: [`server/r1/audit/auditRepository.ts:18-30`](../../../server/r1/audit/auditRepository.ts#L18-L30). Outbox repository аналогично проверяет только `privacySafePayload`, но не `dedupeKey`, `aggregateId`, `eventType` и остальные поля: [`server/r1/outbox/outboxRepository.ts:22-36`](../../../server/r1/outbox/outboxRepository.ts#L22-L36). Тесты покрывают запрещённые key names и три узнаваемых string pattern, но не opaque raw token/secret или весь envelope: [`server/r1/audit/privacySafeMetadata.test.ts:19-43`](../../../server/r1/audit/privacySafeMetadata.test.ts#L19-L43).

**Impact.** Текущие call sites передают безопасные значения, и фактической утечки в рассмотренном increment не найдено. Однако foundation API не обеспечивает заявленный invariant «audit/outbox не содержат token, email, answer, URL или secret» и позволяет будущему caller сохранить credential/PII в БД.

**Remediation.** Перейти от generic `Record<string, unknown>` к allowlisted discriminated schemas по `eventType`. Валидировать весь audit/outbox envelope. Для идентификаторов использовать отдельные opaque branded types или keyed pseudonyms; запретить arbitrary free text. Добавить negative tests для random high-entropy token, API key, phone/name, nested arrays, envelope fields и serialization edge cases.

### m-01 — minor — Customer и OAuth контуры используют общий fallback secret

**Evidence.** `customerSessionSecret` берётся из `LEXY_CUSTOMER_SESSION_SECRET`, но при отсутствии значения переиспользует admin/OAuth `JWT_SECRET`: [`server/_core/env.ts:1-8`](../../../server/_core/env.ts#L1-L8).

**Impact.** Прямая конверсия OAuth/Bearer в customer principal отсутствует, поскольку customer lookup дополнительно требует hash существующей DB session. Тем не менее общий secret связывает failure domains двух контуров и ослабляет требование логического разделения.

**Remediation.** Требовать отдельный `LEXY_CUSTOMER_SESSION_SECRET` без fallback. При включённом v2 gate запуск должен fail closed, если secret отсутствует, имеет недостаточную энтропию или совпадает с `JWT_SECRET`. Добавить startup/config test.

### m-02 — minor — Idempotency TTL и completion CAS записаны, но не реализованы полностью

**Evidence.** Claim всегда конфликтует по `(customerAccountId, scope, idempotencyKey)` и не учитывает `expiresAt` или `failed` status: [`server/r1/idempotency/idempotencyRepository.ts:15-50`](../../../server/r1/idempotency/idempotencyRepository.ts#L15-L50). Completion выполняет conditional update, но не проверяет `affectedRows`: [`server/r1/idempotency/idempotencyRepository.ts:53-62`](../../../server/r1/idempotency/idempotencyRepository.ts#L53-L62).

**Impact.** Истёкший либо terminal-failed key может навсегда блокировать новую допустимую команду, а неожиданная потеря pending state не обнаруживается как transaction failure.

**Remediation.** Зафиксировать policy повторного использования после expiry/failed и реализовать atomic reclaim либо бессрочную семантику без вводящего в заблуждение TTL. Проверять affected row при completion и откатывать transaction при несоответствии. Покрыть real-DB тестами boundary времени и конкурентный reclaim.

## 3. Проверенные положительные свойства

| Область | Результат и evidence |
|---|---|
| Auth contour | Customer identity читается только из dedicated `__Host-lexy-customer-session`, HMAC вычисляется до DB lookup; Authorization/OAuth сам по себе customer principal не создаёт: [`server/_core/context.ts:39-46`](../../../server/_core/context.ts#L39-L46), [`server/r1/context.auth-separation.test.ts:39-60`](../../../server/r1/context.auth-separation.test.ts#L39-L60). |
| Owner predicate / IDOR | Customer list/get и transition lookup включают `customerAccountId` непосредственно в SQL predicate; query-by-id-then-check anti-pattern не найден: [`server/r1/cases/caseRepository.ts:50-95`](../../../server/r1/cases/caseRepository.ts#L50-L95). CAS update также содержит owner, status и version: [`server/r1/cases/caseRepository.ts:98-125`](../../../server/r1/cases/caseRepository.ts#L98-L125). |
| Error oracle | Missing и other-owner проходят один owner-scoped lookup и один neutral `NOT_FOUND` contract: [`server/r1/policy/errors.ts:3-9`](../../../server/r1/policy/errors.ts#L3-L9), [`server/r1/policy/accessPolicy.test.ts:23-31`](../../../server/r1/policy/accessPolicy.test.ts#L23-L31). |
| DTO minimization | Customer/admin DTO не содержат internal `id`, `customerAccountId`, email, token, answers или storage URL: [`server/r1/cases/caseRepository.ts:12-40`](../../../server/r1/cases/caseRepository.ts#L12-L40), [`server/r1/cases/caseRepository.ts:143-160`](../../../server/r1/cases/caseRepository.ts#L143-L160). |
| Admin boundary | Server требует OAuth role `admin`, allowlisted purpose, bounded cursor page и пишет successful-read audit: [`server/_core/trpc.ts:50-65`](../../../server/_core/trpc.ts#L50-L65), [`server/r1/admin/router.ts:9-71`](../../../server/r1/admin/router.ts#L9-L71). Остаточный audit gap описан в M-04. |
| Current raw-data exposure | В рассмотренных v2 call sites не найдено сохранение/DTO/logging raw cookie, raw session token, email, secret, answer или storage URL. Session table хранит unique `tokenHash`: [`drizzle/schema.ts:282-296`](../../../drizzle/schema.ts#L282-L296). |
| Frontend boundary | `LexyWidget` не монтируется на `/pilot`, `/cabinet` и `/admin/pilot-diagnostics`: [`client/src/App.tsx:39-56`](../../../client/src/App.tsx#L39-L56). Pilot UI не использует local/session storage, bearer token или synthetic create command. Customer `UNAUTHORIZED` message отличается от legacy OAuth redirect trigger, поэтому просмотренный Pilot UI не отправляет customer auth flow в OAuth: [`client/src/main.tsx:13-22`](../../../client/src/main.tsx#L13-L22), [`server/_core/trpc.ts:30-48`](../../../server/_core/trpc.ts#L30-L48). |
| Migration safety | `0005` содержит только `CREATE TABLE`, `ALTER TABLE … ADD CONSTRAINT` и `CREATE INDEX`: [`drizzle/0005_r1_access_control_expand.sql:1-170`](../../../drizzle/0005_r1_access_control_expand.sql#L1-L170). Static scan не нашёл `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, `MODIFY` или `CHANGE`. Snapshot comparison: 11 v2 tables added, 0 removed, 0 existing table definitions changed. Migration не применялась. |
| Default gate | При полностью пустом env gate закрыт, а exact `NODE_ENV=production` блокирует synthetic mode: [`server/r1/releaseGate.test.ts:4-12`](../../../server/r1/releaseGate.test.ts#L4-L12), [`server/r1/releaseGate.test.ts:36-49`](../../../server/r1/releaseGate.test.ts#L36-L49). Более широкие bypass/misconfiguration cases описаны в M-01. |

## 4. Команды и ограничения проверки

| Проверка | Результат | Ограничение |
|---|---|---|
| `pnpm check` | **PASS** | `tsc --noEmit` завершился с кодом 0. |
| `pnpm test` | **PASS** | 11 файлов, 68 тестов. Suite не использует реальную БД и в основном mock-based. |
| `DATABASE_URL` | **UNAVAILABLE** | Переменная отсутствовала в process environment, `/home/ubuntu/.env` и `/home/ubuntu/.user_env`. Поэтому выполнить требуемый DB-backed прогон против «configured DATABASE_URL» было невозможно; URL не подменялся и migration не применялась. |
| `git diff --check` | **PASS** | Whitespace errors в tracked diff не найдены. |
| Static `rg` scans | **COMPLETED** | Проверены auth/cookie/bearer/sessionToken/email/secret/PII, gate/env/synthetic, SQL/query shape, transaction/idempotency/audit/outbox, logs, LLM/widget/OAuth redirect и test-backdoor patterns во всех изменённых runtime/test/doc файлах. |
| Migration inspection | **COMPLETED, not applied** | SQL, Drizzle schema, journal и JSON snapshot проверены read-only; destructive/legacy mutation не найдено. |
| Scope | **44 файла** | Проверены все tracked modified и untracked файлы: Drizzle `0005`/schema/meta, `_core` context/trpc/env, root routers, весь `server/r1/**`, Pilot shell/routes, tests и `docs/release-1/audit/**`. |

## 5. Test gaps, блокирующие acceptance increment 1

| Требуемое доказательство | Текущее состояние | Минимальное исправление |
|---|---|---|
| Baseline → `0005`, constraints/indexes, no destructive SQL | Только static SQL/snapshot inspection | Disposable-MySQL migration integration test и schema assertions. |
| Полная owner matrix для tRPC и HTTP/test endpoint | Policy unit + mocked tRPC repository call | Real DB anonymous/A/B/admin/worker matrix; identical non-owner/missing response. |
| Legacy bearer не авторизует v2 | Один unit test проверяет Authorization header без customer | Отдельный compatibility-risk integration test для legacy token/cookie/URL против каждого v2 boundary. |
| Idempotency/race/rollback | Mocked call ordering для create; transition edges only | Concurrent DB tests и fault injection для case/audit/outbox/idempotency rollback. |
| Admin role/purpose/pagination/minimal DTO/audit | Mocked role/purpose/success audit | Real DB integration, pagination continuity, denial audit, audit-failure behavior, no PII/internal ID. |
| Gate isolation | Default/prod happy-path unit tests | Unset/malformed env, staging, fake approved hash, missing test identity, wrong DB marker, mount absence. |
| Frontend boundary | Static inspection only | Route/build test: no Pilot widget, no credential storage, no synthetic command/control, no OAuth redirect on customer `401`. |

## 6. Decision

**NEEDS_REMEDIATION.** До повторного review необходимо закрыть M-01–M-05 и подтвердить их disposable-DB integration tests. Minor findings следует исправить до формирования общей auth/idempotency platform, чтобы они не стали совместимостью для следующих increments.

Даже после исправления v2 increment остаётся отдельной технической областью. **Сохранённые legacy bearer routes — принятый P0 compatibility risk вне v2; они предотвращают глобальное заявление о соответствии §31.3.** Client/runtime launch остаётся запрещён. Этот review не предоставляет legal approval.

## References

[1]: file:///home/ubuntu/Neolex/docs/release-1/implementation-plan.md "Release 1 — implementation plan защищённого v2 Pilot"
[2]: file:///home/ubuntu/Neolex/docs/security/access-matrix-v1.md "Матрица прав доступа Lexy v1"
[3]: file:///tmp/text_editor_extracts/%D0%A2%D0%973.0.%D0%92%D0%B5%D0%B1-%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D0%BF%D0%BB%D0%B0%D1%82%D0%BD%D0%BE%D0%B9%D1%8E%D1%80%D0%B8%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%D0%B4%D0%B8%D0%B0%D0%B3%D0%BD%D0%BE%D1%81%D1%82%D0%B8%D0%BA%D0%B8Lexy-849c367a6037-p1-49.txt "Техническое задание Lexy v3.0, §§ 23 и 31.3"
[4]: file:///home/ubuntu/Neolex/drizzle/0005_r1_access_control_expand.sql "Release 1 access-control expand migration"
