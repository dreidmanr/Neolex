# Аудит Release 1 — Access, customer magic link и promo

**Модуль:** Access, magic link and promo
**Репозиторий и ветка:** `/home/ubuntu/Neolex`, `feat/lexy-release-1-pilot`
**Проверенный HEAD:** `0c7f80f96cd2fe68450b59141df0c0988190570a` (`2026-09-12T20:39:39Z`)
**Режим:** статический read-only аудит. Исполняемый код, миграции, секреты и конфигурации не изменялись. Этот файл является запрошенным артефактом аудита.

## 1. Вывод

**Модуль не соответствует Release 1 §§30.3 и 31.3.** Текущий контур платной диагностики использует `sessionToken` как bearer-полномочие: почти все операции `paidRouter`, включая чтение, изменение, оплату, отчёт и выдачу URL документа, являются `publicProcedure`. Знание токена достаточно для чтения либо изменения чужого ресурса. Дополнительно `paid.adminGetSessions` публично выдаёт до 100 полных строк с raw `sessionToken`; это P0-обход существующего `adminProcedure`.[1] [7]

Текущий OAuth-контур является единым общим контуром пользователей Manus, а не требуемой клиентской email-аутентификацией. Он выдаёт годовой JWT в cookie `app_session_id`; контекст предоставляет лишь `user`, без отдельной customer session и без `customerAccountId`. Магической ссылки, hash-only одноразового токена, ограничений частоты, атомарного consume, customer session и owner predicate в runtime нет.[1] [8] [9] [10]

**Решение владельца, обязательное для данного плана.** Human legal approval отложен до завершения всех этапов. Все legal-конфигурации, phrase catalog, fixtures и golden reports остаются `draft_pending_legal_approval`. Их нельзя переводить в `approved`, нельзя использовать для клиентского runtime-результата и нельзя считать доказательством юридической готовности. Launch клиентского/runtime-контура запрещён. Разработка и тестирование допустимы только в изолированной non-production среде с тестовым transport и синтетическими fixtures; они не являются закрытым Pilot с реальными клиентами и не закрывают launch blockers.[2] [6]

**Отдельно зафиксировано решение по legacy.** В этом плане **не удаляются** current legacy routes и не предлагается потеря legacy-данных. Они остаются отдельным compatibility risk до отдельного решения о claim, quarantine, feature-flag rollout и decommission. Однако новый путь v2 обязан быть полностью owner-bound и защищён уже с первого маршрута. Пока deployed legacy routes продолжают принимать bearer `sessionToken`, выполнить буквальный глобальный критерий §31.3 «ни одна процедура … не доступна без клиентской сессии и owner check» невозможно; следовательно, §31.3 и launch нельзя объявлять принятыми.[1] [3] [4]

> **Решение по выпуску:** не публиковать новый customer/runtime path, не запускать реальных клиентов и не включать production email или платёжного провайдера. В R1 реализуется только изолированный v2 vertical slice: customer magic link, server-side promo, `payment_record=promo_granted`, owner-bound case и тестовый transport. Legacy остаётся явным P0 compatibility risk, а не исключением из требований безопасности нового v2 пути.

## 2. Нормативная и архитектурная база

§30.3 требует закрытый Pilot с запросом magic link, клиентской server session, серверной проверкой `123`, `payment_record` со статусом `promo_granted`, диагностикой v2 с `customerAccountId`, server-side resume, защитой от доступа к чужому кейсу, email adapter/test transport и полным набором тестов. Реальный PSP, webhook и production email прямо исключены из Release 1. §31.3 дополнительно требует, чтобы `sessionToken` не давал доступа, повтор submit не выпускал второй report/PDF, LLM была выключена, magic-link flow был проверен на test transport, а e2e проходили на desktop и mobile.[1]

Release 0 уже фиксирует целевую deny-by-default модель. Любая клиентская операция требует действительную client session (`P-01`), owner predicate (`P-02`) и допустимое состояние. Другой клиент получает нейтральный `404`, anonymous — `401`; locator, ID, URL, storage key и `sessionToken` не являются полномочием. Draft legal config не должен потребляться клиентским runtime (`P-10`).[2]

Целевая миграция требует add-only v2 модель, отдельные `customer_accounts`, `customer_sessions`, `magic_link_tokens`, `diagnostic_cases`, `payment_records` и audit records. Legacy owner нельзя выводить из email, имени, token, cookie или похожих атрибутов; без доказанного claim запись остаётся `unassigned`/`quarantined`. Совместимость v1 — только versioned read-only projection после owner/claim policy, а не автоматическое преобразование ответов в v2.[4]

## 3. Зафиксированное текущее состояние

| Область | Наблюдение | Значение для Release 1 |
|---|---|---|
| Контекст | `createContext` вызывает `sdk.authenticateRequest()` и возвращает только `user: User | null`. Понятия customer session, account, session type и request ID отсутствуют. | Нельзя выразить `P-01` или `P-02`; OAuth user не доказывает ownership диагностик. |
| Cookie | `getSessionCookieOptions()` выдаёт `HttpOnly`, `path=/`, `SameSite=None`; `Secure` зависит от `req.protocol` или неконтролируемо прочитанного `x-forwarded-proto`. | Не выполняет baseline customer cookie `HttpOnly; Secure; SameSite=Lax`; административная и клиентская cookie не разделены. |
| OAuth | `/api/oauth/callback` upsert-ит `users`, создаёт годовой JWT и записывает общую `app_session_id` cookie. | Это сохраняемый admin OAuth, но не customer magic link. Годовой JWT нельзя переиспользовать как customer session. |
| tRPC middleware | `publicProcedure` не накладывает условий. `protectedProcedure` проверяет только общий `ctx.user`; `adminProcedure` проверяет `user.role === admin`. | Нет customer-only middleware и owner policy. Существующий admin middleware нельзя обходить через новый public route. |
| Платный router | Все методы, включая `getSession`, consents, answers, documents, `complete`, report и `adminGetSessions`, объявлены `publicProcedure`; входом обычно служит `sessionToken`. | P0 BOLA/IDOR, публичный admin list и изменение чужого case. |
| Оплата | Public `confirmPayment` сам ставит `paymentStatus=paid`, а `complete` не проверяет активный entitlement. Оплата хранится в `paid_sessions`, отдельного ledger нет. | Клиент способен создать доступ/оплату. Не выполняются server promo и `payment_record=promo_granted`. |
| Promo | `client/src/pages/Home.tsx` сравнивает ввод с literal `"123"` и делает `navigate("/paid")`; server call отсутствует. | Код раскрыт в JS bundle, нет tariff snapshot, payment record, idempotency и owner-bound grant. |
| LLM | `paidRouter.complete` вызывает `generateReportMarkdown`, который вызывает `invokeLLM` с `claude-sonnet-4-5`. | Запрещённая в R1 LLM-персонализация остаётся в legacy path. |
| Админка | `adminRouter` использует `adminProcedure`, но list DTO выдаёт contact data и raw `sessionToken`; reads не аудитируются. `paid.adminGetSessions` дополнительно публичен. | OAuth role boundary частично есть, но минимизация, цель и audit отсутствуют; public обход критичен. |
| Матрица доступа | `access-matrix-v1.md` задаёт правильный future contract и честно маркирует текущие public paid/PDF/storage routes как temporary P0 exception. | Документ не является runtime mitigation и не делает контур launch-ready. |
| Persistence | `paid_sessions` не содержит `customerAccountId`; дочерние answers/documents/reports наследуют отсутствие owner. `getPaidSessionByToken()` выполняет поиск только по token. | Невозможен корректный server-side owner predicate без аддитивного v2 aggregate. |

Текущая тестовая база подтверждает только узкий legacy scope. `vitest.config.ts` обнаруживает `server/**/*.test.ts`, а существующий `auth.logout.test.ts` ожидает `SameSite: "none"`; magic link, customer auth, promo payment ledger, owner-negative matrix, real test DB, HTTP/PDF auth и browser e2e не покрыты.[7] [11] [12]

## 4. Детальные разрывы и приоритеты

| ID | Приоритет | Файл и доказательство | Разрыв относительно §30.3/§31.3 и Release 0 | Необходимый результат |
|---|---|---|---|---|
| AAP-01 | P0 | `server/paidRouter.ts:32-303`, `server/paidDb.ts:42-50` | `publicProcedure` и `getPaidSessionByToken` делают bearer token достаточным для доступа к case, ответам, consents, document URL и report. | New v2 procedures получают resource только по public case ID, затем server-side `customerAccountId = ctx.customer.accountId`; bearer token не принимается. |
| AAP-02 | P0 | `server/paidRouter.ts:300-303`; `server/paidDb.ts:272-276` | `paid.adminGetSessions` публично раскрывает полный список paid sessions, в том числе tokens, email и статусы. | Не переносить в v2. Новый минимизированный admin list остаётся только в `adminRouter`, под отдельной admin OAuth session, purpose и audit. Legacy route не удаляется этим планом, но остаётся launch-blocking P0. |
| AAP-03 | P0 | `drizzle/schema.ts:108-148`; `server/_core/context.ts:5-28` | У case нет `customerAccountId`; у request нет client-account identity. Поэтому owner predicate нельзя написать корректно. | Add-only v2 account/case/payment model; case owner обязателен для новых v2 ресурсов. |
| AAP-04 | P0 | `client/src/pages/Home.tsx:22-34`; `server/paidRouter.ts:91-124` | Promo `123` раскрыт и проверяется в браузере; `confirmPayment` публично присваивает paid. | Только protected server promo verification создаёт один `payment_record(status=promo_granted, charged=0)` и grant; v2 не имеет trusted client confirm. |
| AAP-05 | P0 | `server/_core/oauth.ts:12-53`; `server/_core/sdk.ts:259-321` | OAuth/общий JWT не соответствуют magic link. Нет hash-only token, short TTL, one-time atomic consumption, rate limit, neutral response и customer session. | Самостоятельный customer magic-link circuit и таблицы; admin OAuth сохраняется отдельно. |
| AAP-06 | P1 | `server/_core/cookies.ts:24-48`; `shared/const.ts:1-2` | Одна cookie с `SameSite=None`, условным `Secure` и годовым TTL обслуживает текущий OAuth. | Отдельная customer cookie `__Host-…`, always `Secure`, `HttpOnly`, `SameSite=Lax`, короткий server-configured TTL, no `Domain`; admin cookie изолирована. |
| AAP-07 | P1 | `server/paidRouter.ts:170-211`; `server/_core/storageProxy.ts:4-48`; `server/pdfRoutes.ts:15-130` | Documents возвращают `storageUrl`; proxy и PDF принимают path token/key без customer policy. | Базовый v2 tariff не открывает upload. Будущий document/PDF доступ должен использовать единый policy layer, owner/state checks и audit; current legacy endpoints остаются risk. |
| AAP-08 | P1 | `server/paidRouter.ts:215-283, 382-391` | Completion использует неканонический client answers payload и запускает LLM. | v2 submit принимает только idempotency key, читает server canonical answers; R1 output — template/snapshot. В production draft legal config не исполняется. |
| AAP-09 | P1 | `server/adminRouter.ts:14-144` | Admin role check есть, но list выдаёт больше минимума, raw tokens и не создаёт purpose/audit event. | New admin list: pagination, opaque case IDs, statuses/operational metadata; detailed sensitive read только с reason + append-only audit. |
| AAP-10 | P0 / gate | `docs/security/access-matrix-v1.md:159-177`; `docs/migrations/v1-to-v2.md:177-192` | Владелец пока не разрешил закрыть current legacy client access. Это противоречит буквальному global acceptance §31.3, если public legacy deployed вместе с v2. | Сохранить routes в плане; регистрировать risk/usage; не заявлять R1 accepted или launch-ready. Последующий compatibility adapter требует claim/owner policy и отдельного approval. |
| AAP-11 | Gate | `docs/architecture/release-0-index.md:10-22`; `docs/security/access-matrix-v1.md:190` | Legal assets остаются draft, human legal approval отложен; target matrix запрещает customer runtime consumption draft config. | Feature gate блокирует production client runtime/report release при draft status. Test-only fixtures не маркируются как approved. |

## 5. Целевая модель v2

### 5.1. Жёсткое разделение административной и клиентской идентичностей

Новый контур **не должен менять смысл OAuth на customer login**. Существующий `/api/oauth/callback`, `users` и admin role остаются административным контуром до отдельной миграции административной идентичности. Customer auth хранится в отдельных сущностях и устанавливает отдельную cookie. Customer session никогда не даёт `admin` права, а admin OAuth session никогда не является implicit customer session или доказательством владения case.

`TrpcContext` после реализации должен иметь отдельные, непересекающиеся поля: `adminUser: User | null`, `customer: { accountId, sessionId } | null`, `requestId` и минимальный auth metadata. Удаление поля `user` допускается только в согласованном compatibility refactor; до этого запрещается использовать его как неявный customer identity. `adminProcedure` проверяет только `adminUser`; `customerProcedure` — только customer session; owner check выполняется на server-loaded resource, а не над идентификатором, присланным клиентом.

| Субъект | Транспорт и cookie | Допустимое полномочие | Явно запрещено |
|---|---|---|---|
| Customer | `__Host-lexy-customer-session`, server-side hash/expiry/revocation | Read/mutate только case, где server join подтверждает `case.customerAccountId === ctx.customer.accountId`. | Подмена account ID; access по `sessionToken`, email, raw URL или OAuth user. |
| Admin | Существующая OAuth callback/session, выделенная admin cookie namespace | Минимальная операция `adminProcedure` при `role=admin`, purpose и audit. | Получить customer grant по факту admin login; обход audit; выдавать raw credential. |
| Anonymous | Нет session | Public landing и neutral magic-link request. | Case/payment/report/PDF/admin access. |
| Legacy v1 user | Existing legacy route только как временная compatibility поверхность | Ничего в v2 по одному token; будущий доступ — после approved claim. | Автоматическое `email → account` назначение либо автоматическая конвертация answers v1→v2. |

### 5.2. Минимальная аддитивная модель данных

Вместо изменения owner у v1 строк создаётся v2 aggregate side-by-side. Это сохраняет legacy routes и source records, но не переносит их небезопасный trust model в новый путь.

| Новая сущность | Минимальные поля и ограничения | Инвариант |
|---|---|---|
| `customer_accounts` | Opaque ID, normalized/auth identity state, created/verified timestamps. Email является contact/auth attribute, но не legacy join key. | Вновь созданный v2 case имеет ровно одного owner. |
| `magic_link_tokens` | `id`, `tokenHash`, account/request context, `expiresAt`, `consumedAt`, `revokedAt`, `requestId`, rate-limit correlation; unique indexed `tokenHash`. | Raw token не хранится; successful consume возможен один раз. |
| `customer_sessions` | `id`, `customerAccountId`, `sessionTokenHash`, `issuedAt`, `expiresAt`, `revokedAt`, optional rotation/revocation reason. | Browser получает raw session только в HttpOnly cookie; DB хранит hash. |
| `diagnostic_cases_v2` | Opaque public case ID, required `customerAccountId`, tariff/status/config provenance/idempotency data. | New v2 resource всегда owner-bound; public ID — locator, не credential. |
| `payment_records` | Account/case, tariff ID/version/name/price/currency snapshots, `chargedAmountRub`, `sourceType`, `campaignId`, `status`, idempotency/fingerprint, timestamps. | `promo_granted` создаётся только server promo service; immutable snapshot; `chargedAmountRub=0`. |
| `access_grants` | Account/case/payment record links, granted/expires/revoked state and provenance. | Grant не заменяет owner/state check; v2 write/read проверяет owner **и** active grant. |
| `audit_events` и `outbox_events` | Actor/type, action, resource, result, reason, request/correlation ID; outbox event has idempotency/attempt state. | No raw token, promo code, signed URL, answer text or secret in audit/log/outbox. |
| `legacy_ownership_cases` и `legacy_resource_links` | Source reference, claim/quarantine state, evidence reference, immutable mapping. | Legacy remains preserved. `contactEmail`, existing OAuth account and token are insufficient claim evidence. |

Для `magic_link_tokens` и `customer_sessions` применяется keyed HMAC/SHA-256 (или другой approved keyed one-way verifier) с отдельными environment peppers. Случайные raw values генерируются криптографически стойким API, передаются только в необходимом границе и немедленно редактируются из logs/traces. Нельзя использовать `JWT_SECRET` административного OAuth для customer token или promo verifier.[6]

### 5.3. Customer magic-link lifecycle

1. Public `requestMagicLink(email)` нормализует и валидирует форму email, применяет rate limit по privacy-preserving email/IP keys и отвечает одинаковым `202 { accepted: true }` для existing, new, suppressed и rate-limited valid-email request. Реальный reason остаётся только в minimized audit/metric. Response не подтверждает account, email или case.
2. В одной транзакции сервис находит или создаёт pending/verified customer account согласно auth policy, отзывает предыдущие незавершённые token той же request scope при необходимости, сохраняет **только** token hash, expiry и request metadata и создаёт outbox email event. TTL и limit берутся из reviewed server config, не из request.
3. Mail worker использует только `TestEmailTransport` в R1. Он доставляет raw link в контролируемый test inbox; не записывает raw token в DB, outbox, logs или delivery status. Production adapter, provider API key, verified domain и delivery webhook не конфигурируются и не регистрируются.
4. Предпочтительный email link кладёт raw token во fragment URL страницы consume. Минимальная client consume page читает fragment, передаёт token один раз через HTTPS POST, немедленно очищает browser history, а затем переходит на clean cabinet URL. Это предотвращает попадание token в access logs и `Referer`; если выбран query-param вариант, endpoint обязан 303 redirect immediately, `Referrer-Policy: no-referrer`, redaction в proxy logs и не должен передавать query дальше.
5. Server transaction сравнивает verifier, `expiresAt`, `consumedAt` и `revokedAt`; условно помечает token consumed и создаёт `customer_session` в **одной** транзакции. Ровно один конкурентный запрос получает новую cookie. Просроченный, отозванный, ошибочный или replay token получает одинаковый neutral outcome без создания session.
6. Response устанавливает `__Host-lexy-customer-session` с `Secure; HttpOnly; SameSite=Lax; Path=/`, без `Domain`, с server-configured Max-Age. Context принимает эту cookie только для customer auth; customer auth **не имеет** Authorization-header fallback. Logout/revoke hash-отзывает server session и очищает именно customer cookie.

> Email scanner, browser history, referrer, client localStorage и sessionStorage не являются хранилищами credential. Email delivery — транспортное событие, а не доказательство access, legal approval или ownership legacy case.

### 5.4. Server-side promo и access

В v2 клиент выбирает только allowed `tariffId` и отправляет введённый promo value через authenticated protected procedure с idempotency key. Нельзя принимать amount, price, `campaignId`, `customerAccountId`, status или `paymentId` из браузера. Promo service читает campaign ID и verifier только из server environment, сравнивает verifier constant-time способом, проверяет tariff allow-list и выполняет транзакцию:

1. Загружает tariff snapshot на сервере.
2. Создаёт или возвращает по idempotency key одну `payment_record` с `sourceType=promo`, safe `campaignId`, `status=promo_granted`, `chargedAmountRub=0`, tariff/price/currency snapshots и request fingerprint.
3. Создаёт один связанный `access_grant` для **того же** `customerAccountId` и v2 case.
4. Переводит case `draft → access_granted` только через transition service, audit и outbox.
5. Возвращает минимальный DTO: public case ID, tariff display/status and access status. Raw promo value, hash, pepper, legacy token and internal payment ID не возвращаются.

Ограничение redemption должно быть транзакционным: уникальный fingerprint `(customerAccountId, campaignId, allowed scope)` и unique owner-scoped idempotency key. Повтор той же команды возвращает исходный record/grant; новый key с уже погашенной кампанией не создаёт второй grant. Модель поддерживает оба диагностических тарифа, требуемых ТЗ, но в закрытом v2 R1 vertical slice наружу включается только базовый tariff. Document upload, automatic document analysis и document tariff runtime остаются выключенными до Release 2.[1] [5]

`LEXY_PAYMENT_PROVIDER=disabled` является обязательным runtime invariant R1. Можно добавить typed `PaymentProviderAdapter` interface и webhook schema без активного adapter, endpoint, provider secret или client `confirmPayment`. Реальный provider, webhook, refund и reconciliation не являются частью R1.[1] [6]

## 6. File-level план реализации

В таблице «изменить» означает будущую реализацию после отдельного engineering approval; данный аудит ничего из перечисленного не меняет.

| Файл | Действие | Конкретное изменение и контроль |
|---|---|---|
| `server/_core/context.ts` | Изменить | Разделить `adminUser` и `customer`; резолвить customer session по отдельной HttpOnly cookie и server hash/revocation lookup. Добавить `requestId`. Не привязывать customer account к current OAuth `User.email`. |
| `server/_core/cookies.ts` | Изменить | Ввести раздельные builders `getAdminSessionCookieOptions` и `getCustomerSessionCookieOptions`. Customer builder: `__Host-` cookie, `HttpOnly=true`, `Secure=true`, `SameSite="lax"`, `Path=/`, no `Domain`; не вычислять secure по заголовку клиента. Сохранить admin OAuth compatibility явно, не использовать его cookie для customer. |
| `server/_core/oauth.ts` | Изменить минимально | Сохранить `/api/oauth/callback` как admin OAuth route; задавать только admin cookie namespace и не создавать/не искать customer session/account. Не добавлять сюда magic-link logic. |
| `server/_core/trpc.ts` | Изменить | Ввести `customerProcedure`, `adminProcedure` от `ctx.adminUser`, а также shared owner-policy helper/error mapper. Anonymous protected action → `401`; authenticated other customer → neutral `404`; admin missing role → `403`. `publicProcedure` разрешён только public content и neutral magic-link request. |
| `server/paidRouter.ts` | Не превращать legacy в v2; добавить новый router | Оставить current legacy routes в плане как compatibility risk, без удаления. Вынести новый `paidV2Router`/`caseRouter` в отдельный файл: no `sessionToken` input, customer-only, `loadOwnedCase()` before payload/data read, active grant/state checks, server canonical answers only. Не переносить `adminGetSessions` в v2. Удалить LLM только из **нового v2 path**; legacy LLM остаётся launch blocker до отдельного решения. |
| `server/adminRouter.ts` | Изменить | Сохранить admin OAuth boundary. Заменить list на paginated/minimized v2 DTO без raw session credentials and bulk contact details. Требовать `purposeCode` для detail/export and append audit event on list/detail/export/status action. Не делать customer OAuth/session substitute. |
| `docs/security/access-matrix-v1.md` | Изменить документацию | Добавить explicit v2 procedure/resource matrix, customer/admin cookie separation, error contract and audit vocabulary. Сохранить section Current P0 exception и legacy compatibility risk; не переписывать его как mitigation or acceptance. |
| `drizzle/schema.ts` | Изменить | Add-only target entities из §5.2 и indexes/unique constraints. Не заполнять owner у legacy `paid_sessions` по email. Не удалять `sessionToken` column/current legacy tables в этой фазе. |
| `drizzle/00xx_r1_customer_auth_promo.sql` | Добавить | Expand migration only: new tables/indices/constraints, no destructive DDL. Include rollback/feature-flag plan, not data deletion. |
| `server/auth/customerAccountRepository.ts` | Добавить | Создание/find customer account only through authenticated magic-link flow; no legacy email join. |
| `server/auth/magicLinkService.ts` | Добавить | CSPRNG issue, keyed hash, neutral response, atomic consume/revoke, expiry, audit-safe reason codes and transaction boundary. |
| `server/auth/customerSessionService.ts` | Добавить | Hash-only customer session creation, lookup, revoke/logout, expiry and cookie issuance. Reject header fallback for customer auth. |
| `server/auth/magicLinkRoutes.ts` | Добавить | Public request endpoint and consume POST endpoint, strict body schema, no token echo, response headers preventing referrer/cache leakage. |
| `server/auth/rateLimitStore.ts` | Добавить | Durable testable rate-limit interface keyed by privacy-preserving email/IP identifiers. R1 configuration exposes policy limits, never client-selected values. |
| `server/email/adapter.ts` | Добавить | Narrow `EmailAdapter` interface that carries approved purpose, recipient and content only. No legal configuration publisher and no payment authority. |
| `server/email/testTransport.ts` | Добавить | Test-only controlled inbox. Make non-test/production adapter startup fail in R1; redact token from log/delivery persistence. |
| `server/billing/promoService.ts` | Добавить | Constant-time verifier check, tariff allow-list, `payment_record` + `access_grant` + transition/audit in one transaction, idempotency/redeem uniqueness and safe DTO. |
| `server/billing/paymentRepository.ts` / `accessPolicy.ts` | Добавить | Separate ledger persistence from case; `hasActiveGrant(ctx.customer.accountId, case)` check before v2 questionnaire/report/PDF actions. Provider adapter is disabled/stub-only. |
| `server/authz/ownership.ts` / `errors.ts` | Добавить | One server policy used by tRPC, HTTP/PDF/download routes. Load minimal resource relation first, then owner/admin/state decision; neutral non-owner behavior. |
| `server/audit/auditService.ts` | Добавить | Append-only events for magic-link abuse/consume, promo grant/deny, customer sensitive transition, and admin reads. Redact raw magic token, promo code, hash, storage URL/key and answer text. |
| `server/outbox/*` | Добавить | Commit email delivery/outbox together with token issue; lease/retry/dedup only in test transport R1. No production email delivery activation. |
| `client/src/pages/Home.tsx` | Изменить позднее вместе с v2 UI | Remove literal `123`, client validity decision and direct `/paid` navigation. The UI submits entered code to protected v2 endpoint and renders only returned safe status. Static/browser build must contain no raw promo verifier. |
| `client/src/pages/MagicLinkConsume.tsx` | Добавить | Minimal fragment consumer POSTing token once, removes fragment before navigation, shows neutral expired/retry UX and never writes credentials to localStorage. |
| `server/pdfRoutes.ts`, `server/_core/storageProxy.ts` | Планировать как adjacent protected boundary | Do not treat legacy routes as fixed. New v2 PDF/download routes must resolve customer/admin context and shared policy; case token/key cannot appear in path. Basic tariff exposes no document upload. |
| `docs/auth/magic-link-v1.md` | Добавить | Versioned non-secret design: TTL/rate-limit policy references, cookie flags, normalization, logout/revoke, error contract, test transport and admin separation. Mark implementation/test-only while legal configs remain draft. |
| `docs/release-1/audit/02-access-auth-promo.md` | Создано этим аудитом | Records baseline, mandatory gates, file-level plan, test matrix and no-launch/legacy caveats. |

## 7. Последовательность, gates и legacy compatibility

### 7.1. Вертикальная последовательность

1. **Governance gate.** Keep legal data `draft_pending_legal_approval`; set explicit `runtimeClientLaunch=false`, config loader/client release blocked, `paymentProvider=disabled`, `emailAdapter=test`. No legal approval assertion is introduced.
2. **Data/auth foundation.** Apply only expand migration in test/staging, build customer account/session/token, rate-limit and audit primitives. Verify no v1 write or automatic owner assignment.
3. **Access control.** Implement `customerProcedure`, owner policy and one protected v2 case route. Establish anonymous/non-owner/admin-negative matrix before creating business functionality.
4. **Magic link.** Implement request → test outbox → test inbox → consume → customer cookie → logout/revoke. Keep admin OAuth independent.
5. **Promo access.** Build server-only tariff/promo verification, `payment_record=promo_granted`, `access_grant` and v2 case transition; provider path remains disabled.
6. **Questionnaire/rules/report/PDF.** Only after protected foundations, and only in non-production test mode while legal assets are draft. Use deterministic templates, canonical server answers and no LLM. Do not expose a runtime result to real customers.
7. **Compatibility rollout decision.** Later, separately decide claim/quarantine, read-only compatibility projection, feature flags, observation window and legacy decommission. No deletion of legacy routes or v1 data is in this plan.

### 7.2. Mandatory no-launch gates

| Gate | Required result | Current status |
|---|---|---|
| Human legal approval | All legal configurations/phrases/golden reports formally reviewed and approved under a separate decision. | **Deferred by owner; blocked.** |
| Legal runtime gate | Draft config cannot produce a client-facing runtime report/launch result. | **Must be implemented; blocked.** |
| Legacy security gate | Public legacy token routes are either no longer deployed, or wrapped with owner/claim policy under separately approved compatibility plan. | **Owner elected to retain current access; P0 open.** |
| Customer auth gate | Hash-only one-time magic link, session, rate limit, neutral response and cookie tests pass. | **Not implemented.** |
| Promo gate | Server-only redemption creates idempotent zero-charge `promo_granted` record and owner-bound grant; provider disabled. | **Not implemented.** |
| Evidence gate | Unit, real-DB integration and desktop/mobile e2e evidence exists; no LLM in v2 report path. | **Not implemented.** |
| Launch decision | Production email domain/provider, retention policy, escalation SLA and human legal approval are separately satisfied. | **Prohibited.** |

### 7.3. Legacy migration risks

| Risk | Why it matters | Required handling; no deletion in this plan |
|---|---|---|
| Global §31.3 conflict | Existing `paid.*`, PDF and storage paths still accept bearer locators. Their continued deployment means the literal no-unauthenticated-procedure criterion fails. | Record as launch-blocking P0. Do not claim R1 acceptance. Later use approved feature-flagged compatibility adapter or retire only under a separate decision. |
| Email auto-linking | Legacy `contactEmail` and OAuth `users.email` can collide or change and are not ownership proof. | Never backfill `customerAccountId` from email. Create `legacy_ownership_case`; require one-time scoped claim or approved manual evidence; otherwise quarantine. |
| Token contamination | Legacy `sessionToken` exists in DB, URLs, localStorage and existing admin responses. | Never copy it into v2 session/claim credentials. Ensure v2 DTO/audit/logs forbid it. Track legacy exposure as incident/compatibility risk. |
| Split brain | v1 and v2 might both write or present conflicting status/payment/report. | One writer per model; v1 remains legacy source, v2 new writes only. Compatibility is read-only and labelled `sourceModel=v1`. |
| Promo duplication | Retry/race can create multiple zero-charge records or access grants. | DB uniqueness + transaction + owner-scoped idempotency and request fingerprint; test concurrent redemptions. |
| OAuth conflation | Reusing current `users` or cookie makes admin/customers cross-authorize. | Separate cookie names, session tables, context fields and procedures; test each direction of denial. |
| Legal draft leakage | Test output might be accidentally exposed through a public v2 route or marked approved. | Production bootstrap rejects launch/config channel; CI checks status stays draft and no client release flag is enabled. |
| Provider creep | A mock client confirm or configured provider can silently become a payment authority. | No R1 PSP credentials/webhook route; startup invariant `disabled`; keep interface/types only. |

## 8. Конкретные тесты и evidence

Ниже тесты названы как целевые files/specs. Existing Vitest include pattern already accepts `server/**/*.test.ts`; integration tests должны стартовать ephemeral MySQL/test DB, применять новую migration и поднимать Express/tRPC boundary, а не only `createCaller` mocks. Browser tests требуют добавить Playwright/test inbox tooling и запускаться в isolated HTTPS test environment.[12]

### 8.1. Unit и contract tests

| ID | Целевой файл | Проверка | Ожидаемый результат |
|---|---|---|---|
| AUTH-U01 | `server/auth/magicLinkService.test.ts` | Issue token. | Generated raw token has cryptographic entropy; DB row/audit/outbox do not contain raw token; only verifier/hash exists. |
| AUTH-U02 | `server/auth/magicLinkService.test.ts` | Correct token, expired token, revoked token and malformed token. | Only valid unexpired/unrevoked token may consume; all invalid paths have indistinguishable public outcome and create no customer session. |
| AUTH-U03 | `server/auth/magicLinkService.test.ts` | Two concurrent consumes of one token. | Exactly one conditional update/session succeeds; one cookie can be issued; replay cannot authenticate. |
| AUTH-U04 | `server/auth/customerSessionService.test.ts` | Session validation/logout/revoke/expiry. | Hash lookup succeeds only before expiry and revoke; logout clears only customer cookie and revokes current server session. |
| AUTH-U05 | `server/_core/cookies.customer.test.ts` | Serialize customer cookie. | `__Host-` name; `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`; test rejects a conditional/non-secure/sameSite-none customer setting. |
| AUTH-U06 | `server/_core/context.auth-separation.test.ts` | Parse admin cookie, customer cookie and Authorization bearer header in all combinations. | Admin session populates only `adminUser`; customer session only `customer`; customer authentication never falls back to Authorization header. |
| AUTH-U07 | `server/auth/rateLimit.test.ts` | Email and IP windows, reset, simultaneous attempts. | Policy is server-derived; over-limit response remains neutral, no new token email is queued, audit reason is safe/redacted. |
| AUTH-U08 | `server/email/testTransport.test.ts` | Test delivery payload and log capture. | Test inbox receives one link for allowed recipient; token is absent from application logs, audit events and persisted delivery metadata. |
| PROMO-U01 | `server/billing/promoService.test.ts` | Valid server verifier for allowed base tariff. | Creates immutable tariff snapshot, `status=promo_granted`, `chargedAmountRub=0`, campaign ID and one owner/case-matching grant. |
| PROMO-U02 | `server/billing/promoService.test.ts` | Invalid code, unsupported tariff, client-supplied price/account/campaign. | No record/grant/state transition; server ignores or rejects client authority fields; public error does not echo code/verifier. |
| PROMO-U03 | `server/billing/promoService.test.ts` | Same idempotency key/same request; same key/different request; different key after redemption. | First returns original record/grant on safe replay; changed request rejects; redemption uniqueness prevents second grant. |
| PROMO-U04 | `server/billing/promoService.test.ts` | Concurrent valid redeems. | One payment record/grant only; no duplicate access. |
| PROMO-U05 | `server/billing/providerDisabled.test.ts` | R1 config with payment provider non-disabled or client confirm transition. | Startup/config validation fails for provider mode; no v2 procedure can move payment to `paid` from browser input. |
| AUTHZ-U01 | `server/authz/ownership.test.ts` | Same owner, other owner, anonymous and nonexistent opaque case ID. | Owner allowed; anonymous `401`; non-owner and nonexistent each neutral `404`; no resource field leaks. |
| AUTHZ-U02 | `server/authz/ownership.test.ts` | Resource case/payment/grant account mismatch. | Policy denies even if caller owns one referenced ID; both case and payment/grant owner are checked server-side. |
| ADMIN-U01 | `server/adminRouter.test.ts` | Admin vs customer vs anonymous v2 list/detail. | Only admin OAuth role is admitted; raw token, full answers and storage URLs are absent; required staff purpose/audit behaviour is asserted. |
| LLM-U01 | `server/reports/v2NoLlm.test.ts` | Complete a v2 report with mock `invokeLLM`. | Mock has zero calls; `generatorType=canonical_template`; output only comes from deterministic template/snapshot. |
| DRAFT-U01 | `server/features/legalRuntimeGate.test.ts` | Production/client runtime with `draft_pending_legal_approval`. | Boot/report publication is blocked and audit-safe reason is created; no config gets marked approved by code. |

### 8.2. Real-DB / HTTP integration tests

| ID | Целевой файл | Сценарий | Ожидаемый результат |
|---|---|---|---|
| AUTH-I01 | `server/auth/magicLink.integration.test.ts` | Existing and new email submit valid request. | Same HTTP status/body/timing class; one controlled email delivery is inspectable only in test transport; no account enumeration. |
| AUTH-I02 | `server/auth/magicLink.integration.test.ts` | Request → test inbox → fragment consume POST → clean redirect. | Token is consumed atomically, customer session row/hash exists, clean URL has no token, cookie flags match contract. |
| AUTH-I03 | `server/auth/magicLink.integration.test.ts` | Replay/expiry/revocation/rate limit over actual HTTP and DB transactions. | No session after denial; only one successful concurrent consumer; neutral response and redacted audit facts. |
| AUTH-I04 | `server/auth/adminCustomerBoundary.integration.test.ts` | Use admin OAuth cookie on customer endpoint and customer cookie on admin endpoint. | Both cross-boundary attempts fail; neither creates implicit alternate session/account. |
| AUTHZ-I01 | `server/access/v2OwnerMatrix.integration.test.ts` | Customer A/B, anonymous and admin call every v2 case operation: create/list/read/answer/consent/promo/submit/report/PDF. | A only sees/mutates A; B gets neutral `404`; anonymous gets `401`; admin only permitted staff operations and audit. |
| AUTHZ-I02 | `server/access/locatorNotAuthority.integration.test.ts` | Supply legacy `sessionToken`, guessed integer, other opaque ID, storage key and known payment record ID to v2 endpoints. | None grant v2 data/access/mutation; no raw locator in response/log/audit. |
| PROMO-I01 | `server/billing/promo.integration.test.ts` | Authenticated customer chooses base tariff and submits `123` twice/retries concurrently. | One server payment record `promo_granted`, zero charge snapshot, one active grant, one case transition and correct audit/outbox facts. |
| PROMO-I02 | `server/billing/promo.integration.test.ts` | Direct request to questionnaire/report before promo and after revoked/expired grant fixture. | Denied before grant and after revoke/expiry; no automatic paid status from client. |
| PROMO-I03 | `server/billing/promoNoFrontendLeak.integration.test.ts` | Build/static source scan and API captures. | Literal promo verifier/hash/pepper absent from `client/` source and built asset; response/body/log redaction prevents leakage. The test fixture may hold `123` only outside shipped client source. |
| ADMIN-I01 | `server/admin/adminAudit.integration.test.ts` | Admin opens paginated list, specific details and export attempt with/without purpose. | Minimal list; detail/export requires allowed purpose; each sensitive action writes append-only audit; no `sessionToken` exposed. |
| LEGACY-I01 | `server/legacy/compatibilityRisk.integration.test.ts` | Exercise only the explicitly retained legacy path in an isolated test. | Test is marked `expected-risk`/quarantined in evidence, not passing evidence for §31.3. It proves legacy route inventory has not silently become the v2 contract and documents public-token exposure until separate decision. |
| MIG-I01 | `server/migrations/noEmailOwnerBackfill.integration.test.ts` | Legacy session contact email equals one/new customer account email. | No `customerAccountId` assignment; a `legacy_ownership_case` is `unassigned`/`quarantined`. |
| MIG-I02 | `server/migrations/claimRace.integration.test.ts` | Two accounts attempt scoped claim of one legacy resource. | At most one claim; other result does not disclose existence/owner, and conflict follows approved manual/quarantine policy. |
| AUDIT-I01 | `server/audit/redaction.integration.test.ts` | Token, promo and denial paths generate expected events/log sink. | No raw magic token, session token, promo code/hash/pepper, signed URL, document key or answer text in audit/metric/log outputs. |

### 8.3. Browser end-to-end and release evidence

| ID | Целевой файл | Flow | Ожидаемый результат |
|---|---|---|---|
| E2E-01 | `e2e/r1-v2-basic-pilot.desktop.spec.ts` | Landing → neutral magic-link request → controlled test inbox → consume → terms version + independent marketing checkbox → base tariff → server promo → v2 questionnaire autosave → deterministic test-only report → protected PDF. | Complete protected vertical slice works without manual database changes; no token in URL/localStorage; no production provider/email; run is restricted to isolated test environment. |
| E2E-02 | `e2e/r1-cross-device-resume.spec.ts` | Start on browser/device A, magic-login on B, resume same v2 case. | B receives only owner’s server-confirmed progress/active questions; clearing browser storage changes nothing; no local bearer token dependency. |
| E2E-03 | `e2e/r1-owner-denial.spec.ts` | Customer B opens copied v2 case/report/PDF URL from A. | Neutral `404`, no title/status/content disclosure; A remains unaffected. |
| E2E-04 | `e2e/r1-promo-replay.spec.ts` | Double-click/retry promo and submit. | One grant/payment record and, once report subsystem is enabled in test-only mode, one report/PDF identity; audit proves idempotency. |
| E2E-05 | `e2e/r1-mobile.spec.ts` | Same base flow at mobile viewport. | Magic link, consent, promo, resume, report and PDF authorization pass; responsive UI does not reveal credentials. |
| E2E-06 | `e2e/r1-draft-launch-block.spec.ts` | Production-mode configuration with draft legal core. | Test demonstrates client/runtime launch/report publishing is blocked, even if protected auth/promo mechanics pass. |
| EVID-01 | `docs/releases/r1-access-auth-evidence.md` | CI evidence manifest. | Captures migration version, config status/hash, provider-disabled and test-transport assertions, negative matrix, test results and explicit statement: no human legal approval, no launch, legacy P0 remains open. |

The existing `pnpm test`, `pnpm check` and `pnpm build` remain useful regression commands, but they are insufficient evidence on their own. CI must additionally provision the ephemeral DB, execute the integration matrix and run the two browser viewport suites. A test failure in any authz-negative, no-LLM, draft-launch-block, promo-idempotency or token-lifecycle test blocks promotion of the v2 test build.

## 9. Acceptance mapping

| §31.3 criterion | Access/auth/promo contribution | Status now | Evidence required before technical v2 readiness |
|---|---|---|---|
| No protected procedure without customer session and owner check | `customerProcedure` + owner policy across v2 tRPC/HTTP/PDF/admin; neutral error contract. | Fail. | AUTHZ-I01/I02, E2E-03, staff audit test. Legacy retention keeps global acceptance blocked. |
| `sessionToken` knowledge cannot grant access | No token input/lookup in v2; separate hash-only session; no raw tokens in DTO/log. | Fail. | AUTHZ-I02, AUDIT-I01, source/build scan. |
| Landing-to-PDF without manual intervention | Test-only v2 vertical slice: auth, promo grant, owner-bound case and protected PDF. | Fail / prohibited for real clients. | E2E-01 under controlled test transport and draft launch block. |
| Cross-device resume | Server-owned case/progress returned to authenticated owner. | Fail. | E2E-02. |
| Fixtures/risks/one product | Outside this module, but access cannot allow fixture output to real clients while legal core is draft. | No launch claim. | Deterministic fixture suite plus legal gate; not replaceable by auth tests. |
| Repeat submit no duplicate output | Promo/case/report transitions require owner-scoped idempotency. | Fail. | PROMO-U03/U04, E2E-04 and report-state tests. |
| LLM off/templates | New v2 path must not import/call `invokeLLM`; legacy call remains risk. | Fail. | LLM-U01 and static dependency test. |
| Credit 6,900 RUB | `payment_record` provenance provides input but credit model/report is another module. | Not implemented. | Credit lifecycle/report parity tests, not inferred from promo. |
| Magic-link flow on test transport | Dedicated adapter and controlled inbox; no provider. | Not implemented. | AUTH-I01–I03 and E2E-01. |
| Desktop/mobile e2e | Browser test framework and isolated environment. | Not implemented. | E2E-01 and E2E-05. |

## 10. Scope boundaries and final disposition

This audit intentionally does **not** authorize a change to legal content, report text, user terms, data-retention rules, provider selection, real payment acceptance, document processing, production email or legacy decommission. Those items require their own approved decisions. The `123` secret is treated only as an input contract from the ТЗ: it must be held/verified server-side and must not be copied to source, client assets, API responses or logs.

The v2 design can be implemented and thoroughly tested without a launch, but customer-facing runtime use must remain disabled while legal configuration status is draft and human legal approval is postponed. The presence of the existing public legacy client routes is a separate accepted compatibility risk, not a reason to weaken new v2 owner predicates. It makes any assertion that all §31.3 conditions have been fulfilled false until the owner separately approves a compatible claim/gating or retirement plan.

## References

[1]: file:///home/ubuntu/jobs/job_gFnfBRFY_a1/spec/%D0%A2%D0%973.0.%D0%92%D0%B5%D0%B1-%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D0%BF%D0%BB%D0%B0%D1%82%D0%BD%D0%BE%D0%B9%D1%8E%D1%80%D0%B8%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%D0%B4%D0%B8%D0%B0%D0%B3%D0%BD%D0%BE%D1%81%D1%82%D0%B8%D0%BA%D0%B8Lexy.txt "Техническое задание Lexy v3.0, §§ 30.3 и 31.3"
[2]: ../../security/access-matrix-v1.md "Матрица прав доступа Lexy v1"
[3]: ../../architecture/release-0-index.md "Lexy Release 0: индекс архитектурной фиксации"
[4]: ../../migrations/v1-to-v2.md "План миграции данных Lexy v1 → v2"
[5]: ../../architecture/payment-model-v1.md "Модель оплаты, промодоступа и зачёта стоимости — Lexy Release 0"
[6]: ../../operations/environment-and-service-accounts-v1.md "Окружение и сервисные аккаунты Lexy v1"
[7]: ../../../server/paidRouter.ts "Текущий tRPC router платной диагностики"
[8]: ../../../server/_core/context.ts "Текущий tRPC request context"
[9]: ../../../server/_core/oauth.ts "Текущий административный OAuth callback"
[10]: ../../../server/_core/trpc.ts "Текущие tRPC процедуры и middleware"
[11]: ../../../server/auth.logout.test.ts "Текущий тест logout и session cookie"
[12]: ../../../vitest.config.ts "Конфигурация обнаружения Vitest тестов"
