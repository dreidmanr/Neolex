# План миграции данных Lexy v1 → v2

## 1. Статус, назначение и границы Release 0

| Поле | Значение |
|---|---|
| Идентификатор релиза | `lexy-r0-2026-09-12` |
| Версия документа | `1.0.0-draft.1` |
| Статус | **Черновик для согласования** |
| `effectiveFrom` | `null` |
| `effectiveTo` | `null` |
| Автор обновления | Manus AI |
| Время обновления | `2026-09-12T18:40:24Z` |
| Исходный коммит | `78e2f89e99340a403ce389eada223da6bf336676` |
| Baseline | `feat/lexy-release-0-architecture` на указанном исходном коммите |
| Область | Архитектурный план, а не исполняемая миграция |

> **Нормативное требование.** ТЗ требует согласовать план миграции v1→v2 до начала Release 1, обеспечить привязку диагностик к клиентскому аккаунту, исключить доступ по одному `sessionToken` и сохранить старые платные сессии в режиме совместимости без автоматической конвертации ответов в v2.[1]

> **Проектное решение.** Release 0 фиксирует только контракт миграции, целевую модель, контрольные точки и проверки. Этот документ **не изменяет** runtime-маршруты, React, схему БД, PDF, бизнес-логику, данные либо доступ клиентов. Ни одна существующая клиентская точка доступа не закрывается данным документом.

> **Открытый вопрос.** Начало фактических DDL/DML-работ, смена авторизационных предикатов, включение claim-процедуры и изменение доступности legacy-маршрутов относятся к Release 1 и возможны только после отдельных согласований state machines, access matrix, retention policy и customer-account модели.

Цель миграции — аддитивно ввести owner-bound доменную модель v2, не уничтожая v1-данные, не делая предположений о владельце по адресу электронной почты и сохраняя воспроизводимое происхождение отчётов, ответов, документов и согласий. План опирается на фактическую Drizzle-схему baseline и на результаты аудита: в v1 диагностические сущности не имеют `customerAccountId`, а `sessionToken` используется как идентификатор и фактически как bearer-полномочие.[2] [3]

## 2. Термины и инварианты

| Термин | Определение в рамках плана |
|---|---|
| **Legacy v1** | Существующие записи таблиц baseline, созданные до cutover v2, включая free и paid потоки. |
| **v2 owner** | Единственный `customer_account`, которому ресурс назначен подтверждённой процедурой, а не эвристикой. |
| **Claim** | Однократное, проверяемое присвоение legacy-ресурса клиентскому аккаунту через разрешённый канал подтверждения. |
| **Quarantine** | Отдельное ограниченное состояние миграционного учёта для записи без подтверждённого владельца; это не удаление и не доказательство владения. |
| **Locator** | Непубличный технический идентификатор, используемый для корреляции; locator сам по себе не предоставляет право чтения, изменения или скачивания. |
| **Источник истины** | Persisted v2-данные и связанные immutable snapshots после cutover. До cutover исходные v1-строки не переписываются. |
| **Сверка** | Документированное сравнение счётчиков, связей, хешей и бизнес-инвариантов между source, staging и target. |

Во всех фазах действуют следующие инварианты: (1) запись v1 не удаляется и не перезаписывается миграцией; (2) отображение `v1 → v2` хранит ссылку на исходную запись; (3) создание v2-копии идемпотентно; (4) email, имя, домен, сходство реквизитов, IP-адрес, браузерный cookie и `sessionToken` не являются достаточным основанием для ownership backfill; (5) отсутствие доказанного владельца ведёт в quarantine, а не к автоматическому назначению; (6) юридические формулировки, уровни риска и рекомендации не пересчитываются миграцией; (7) rollback отключает использование v2, но не удаляет созданные данные и журналы сверки.

## 3. Инвентарь текущих таблиц baseline v1

Инвентарь составлен по `drizzle/schema.ts` и миграциям `drizzle/0000`–`0004` в исходном коммите. В DDL отсутствуют декларации внешних ключей. Указанные ниже связи подтверждаются именами полей и серверным persistence-слоем; это логические связи, а не утверждение о существующем FK-ограничении.[2] [4]

| Таблица | Назначение и ключи | Подтверждённые логические связи | Ownership в v1 | Миграционное обращение |
|---|---|---|---|---|
| `users` | Пользователь внешней OAuth-модели; PK `id`, уникальный `openId`, поля профиля и `role` (`user`/`admin`). | Самостоятельная таблица; v1-диагностики на неё не ссылаются. | Не связывает diagnostic/paid ресурсы с клиентом. | Сохраняется неизменной; не используется для автоматического назначения owner. |
| `diagnostic_sessions` | Бесплатная сессия; PK `id`, уникальный `sessionToken`, статус, итоговая категория/балл. | Родитель для `contacts`, `consent_records`, `questionnaire_answers`, `scoring_results` через `sessionId`; может быть указан как `paid_sessions.freeSessionId`. | Нет `customerAccountId`; token не является доказательством владельца. | Инвентаризируется как legacy source; ownership назначается только claim-процедурой или остаётся quarantine. |
| `contacts` | Контакт бесплатной диагностики; PK `id`, `sessionId`, имя, email, телефон, продукт, сайт. | Логическая дочерняя сущность `diagnostic_sessions`. | Email — контактный атрибут, не ключ ownership. | Копируется/связывается только вслед за миграцией родительской сессии; не создаёт account автоматически. |
| `consent_records` | Согласия бесплатного потока; PK `id`, `sessionId`, тип, факт принятия, версия документа, время. | Логическая дочерняя сущность `diagnostic_sessions`. | Не подтверждает текущую клиентскую идентичность. | Сохраняется с provenance и не трактуется как согласие на новую auth-модель. |
| `questionnaire_answers` | Ответы бесплатной анкеты; PK `id`, `sessionId`, вопрос, один/много вариантов, текст. | Логическая дочерняя сущность `diagnostic_sessions`. | Наследует отсутствие owner у сессии. | Не конвертируется в `questionnaire_v2`; legacy-read only либо отдельная explicit mapping после будущего решения. |
| `scoring_results` | Результат бесплатного скоринга; PK `id`, уникальный `sessionId`, category, score, JSON evidence/results, вывод. | Логическая дочерняя сущность `diagnostic_sessions`, 1:0..1 по уникальному `sessionId`. | Наследует отсутствие owner у сессии. | Сохраняется как legacy outcome; не регенерируется и не заменяется v2-рисками. |
| `paid_sessions` | Центральная сессия платной диагностики; PK `id`, уникальный `sessionToken`; контакт, оплата, прогресс, `anketaVersion`, риск и служебные поля. | Может ссылаться на free session через `freeSessionId`; родитель для paid answers/documents/reports/consents через `paidSessionId`. | Нет `customerAccountId`; `contactEmail` не является owner key. | Основная единица claim/quarantine; исходная строка не редактируется в backfill-фазе. |
| `paid_answers` | Ответ на вопрос платной анкеты; PK `id`, `paidSessionId`, блок/вопрос, тип, значения/текст. | Логическая дочерняя сущность `paid_sessions`. | Наследует ownership родительской paid session. | Не конвертируется автоматически из `anketaVersion=v1` в v2. |
| `paid_documents` | Метаданные загруженного документа; PK `id`, `paidSessionId`, блок/вопрос, имя, размер, MIME, storage key/URL, категория. | Логическая дочерняя сущность `paid_sessions`; объект в storage связан через metadata. | Наследует ownership paid session; storage key не является полномочием. | Сначала создаётся v2-учётная связь и инвентарный checksum/metadata сверка; перемещение/обработка объекта — отдельная фаза после file policy. |
| `paid_reports` | Один платный отчёт на сессию; PK `id`, уникальный `paidSessionId`, JSON sections, markdown, риск, модель и timestamps. | Логическая дочерняя сущность `paid_sessions`, 1:0..1 по уникальному `paidSessionId`. | Наследует ownership paid session. | Не пересчитывается; сохраняется как legacy immutable evidence, пока не создана отдельная v2 report version по согласованной процедуре. |
| `paid_consent_records` | Согласия платного потока; PK `id`, `paidSessionId`, тип, факт, версия, время. | Логическая дочерняя сущность `paid_sessions`. | Не является доказательством identity/ownership. | Сохраняется с provenance; scope и повторное согласие определяются отдельно. |
| `feedbacks` | Постдиагностическая обратная связь; PK `id`, необязательный `sessionToken`, оценки, комментарий, timestamps. | Связь с сессией непроверяемая: token необязателен и FK нет. | Нет доказанного owner. | Отдельный quarantine/retention поток; не присоединяется автоматически к сессии или account. |

### 3.1. Выявленные ограничения исходного контура

> **Нормативное требование.** Для Release 1 ТЗ требует, чтобы доступ к диагностике, ответам, отчёту, PDF и административным данным зависел от клиентской сессии и проверки владельца; знание `sessionToken` не должно давать доступ.[1]

> **Проектное решение.** В целевой v2-модели ownership закрепляется на корневом ресурсе — диагностическом case/session. Дочерние ответы, документы, consent, отчёты и delivery артефакты получают owner через корневой ресурс и дополнительно могут хранить денормализованный `customerAccountId` только при контролируемом ограничении согласованности.

> **Открытый вопрос.** Нужно отдельно утвердить, являются ли `users` внешнего OAuth источником административной идентичности в v2 и требуется ли штатная миграция административных профилей. Этот документ не смешивает admin OAuth и customer identity.

## 4. Целевые сущности v2

Ниже приведён **проектный** target inventory. Это контракт предметной области и миграционная спецификация, а не изменение текущей DB schema. Имена полей и таблиц могут быть уточнены в отдельном согласованном schema design; обязательны описанные связи и инварианты.

| Целевая сущность | Роль и минимальные атрибуты | Связи и инварианты | Происхождение v1 / правило наполнения |
|---|---|---|---|
| `customer_accounts` | Клиентская идентичность: immutable opaque ID, нормализованный identity state, lifecycle, timestamps. | Один ресурс v2 имеет ровно одного owner либо `ownership_state=quarantined`; account не создаётся только по найденному email. | Создаётся при подтверждённом customer-auth/claim событии. Не является массовой копией `users`. |
| `customer_sessions` | Серверная сессия клиента: account reference, hash/session metadata, expiry, revoke/consume facts. | Не хранит bearer token в открытом виде; служит только auth-контекстом. | Новая сущность; v1 sessionToken не переносится как credential. |
| `magic_link_tokens` | Одноразовый запрос/потребление входа: token hash, account/request context, TTL, consumed/revoked timestamps, rate-limit correlation. | Hash-only, atomic consume, не заменяет ownership доказательством без подтверждённого flow. | Новая сущность; legacy email — только маршрут доставки, не join key. |
| `diagnostic_cases` | Корневой aggregate v2 для бесплатной/платной диагностики: opaque ID, `customerAccountId`, origin, service tier, state, created/updated timestamps. | Owner обязателен для активного v2 case; public locator не даёт доступа; case — родитель data/report/document/entitlement. | Создаётся из v1 session только после claim или для новых v2 сессий. Сохраняет `legacy_source` вместо изменения v1 ID. |
| `legacy_resource_links` | Неизменяемое отображение исходника в target: source table, source PK, target type/ID, phase, mapping version, correlation ID, timestamps. | Уникальность `(source_table, source_primary_key, target_type)` предотвращает дубли; не удаляется rollback. | Создаётся для каждой фактически перенесённой/зарегистрированной legacy сущности. |
| `legacy_ownership_cases` | Учёт ownership: source resource, status (`unassigned`, `claim_pending`, `claimed`, `quarantined`, `expired`), permitted claim channel, evidence reference, decision actor/time, reason code. | Запрещает inferred ownership; transitions аудируются; `claimed` только после утверждённого доказательства. | Создаётся для каждой legacy root session до cutover. |
| `questionnaire_submissions` и `questionnaire_answers_v2` | Canonical server-side анкета: config ID/version/hash, visible branch snapshot, answer state, submission/state timestamps. | Ответы валидируются по versioned questionnaire config; v1 answers не изменяются и не интерпретируются как v2 без explicit migration rule. | Новые v2 записи; legacy v1 answers доступны только через compatibility projection. |
| `document_records` | Частный учёт объекта: case, owner, category, lifecycle (`requested`, `uploaded`, `quarantined`, `accepted`, `rejected`, `revoked`, `deleted`), storage object reference, checksum, MIME/size facts, retention. | Download требует case owner/admin policy и допустимый lifecycle; storage URL/key не выдаётся как авторизация. | Metadata из `paid_documents` копируется с provenance; объект storage не перемещается до сверки. |
| `report_snapshots` | Immutable структурированный Report DTO: case, report version/status, config versions/hashes, facts, risks, escalation, recommendation, content hash, supersedes relation. | Один snapshot не меняется; replay возвращает существующий snapshot по idempotency contract; renderer-ы читают один DTO. | `paid_reports` остаётся legacy evidence; не переписывается и не заменяется автоматической генерацией. |
| `report_artifacts` | Неизменяемые производные артефакты: формат, snapshot ID, content hash, storage ref, generatedAt, lifecycle. | Один versioned artifact на согласованную пару report version/format; download проходит authz. | Новая сущность; существующие PDF не переиздаются миграцией. |
| `payment_records` | Платёжный журнал: tariff/price snapshot, currency, provider event IDs, amount, status, idempotency, refund provenance. | Не смешивается с progress case; provider readiness не означает включённый PSP. | Поля `paid_sessions.payment*` сохраняются как legacy facts; копирование — только append-only reconciliation import. |
| `access_grants` | Право запуска/использования услуги: case/account, grant source (`promo`, payment, support), state, timestamps, idempotency/correlation. | Проверяется сервером; UI не создаёт право доступа. | Новая сущность; legacy `paymentStatus` сам по себе не конвертируется в неопровержимое entitlement. |
| `credit_entitlements` | Отдельный зачет стоимости: account/case, currency/amount, basis, available/consumed/expired/revoked state, expiry. | Временная зона, тарифы и правила зачёта определяются утверждённой policy. | Новая сущность; существующий price 4 900 ₽ не используется для молчаливого расчёта credit. |
| `audit_events` | Append-only журнал чувствительных действий: actor, role, event, resource, reason, request/correlation ID, timestamp, result. | Клиент не может подделать actor/event; admin reads и migration transitions наблюдаемы. | Новая сущность; legacy analytics/feedback не заменяют audit trail. |
| `migration_runs` и `migration_reconciliation_records` | Технический контроль миграции: run ID, phase, source/target ranges, counts, hashes, dry-run/commit mode, failures, approval/checkpoints. | Позволяет повторить dry run, остановить cutover и доказать no-loss сверку. | Новые сущности или защищённое операционное хранилище; выбор места хранения требует согласования. |

### 4.1. Разделение нормативного и проектного контура

| Область | Нормативное требование | Проектное решение | Открытый вопрос |
|---|---|---|---|
| Ownership | Ресурс доступен только владельцу либо администратору по проверенной политике.[1] | Root `diagnostic_case` содержит owner, дочерние сущности наследуют ownership. | Граница между account/case для нескольких пользователей одной организации и будущая delegation model. |
| Legacy | Старые платные сессии доступны в compatibility-режиме; автоматическая конвертация ответов v1→v2 не выполняется.[1] | v1 сохраняется read-only, с immutable mapping/provenance; v2 создаётся side-by-side. | Срок compatibility и формат отдельного legacy viewer после утверждения retention policy. |
| Report | Один immutable structured snapshot с version/config provenance предшествует PDF.[1] | `report_snapshots` и `report_artifacts` разделены; migration не генерирует отчёты. | Требуется legal approval report schema, phrase catalog и golden reports до engine/rendering. |
| Документы | Нужны ownership, lifecycle, quarantine и retention до обработки/выдачи.[1] | `document_records` хранит lifecycle и checksum; storage move только после инвентаризации. | MIME allow-list, antivirus/quarantine provider, retention срок и порядок legal hold. |
| Оплата/credit | Tariff snapshot, payment record и credit должны быть раздельны.[1] | `payment_records`, `access_grants`, `credit_entitlements` — самостоятельные агрегаты. | Тариф Pilot, charged amount, credit 6 900 ₽, timezone и срок 14 дней не утверждены. |

## 5. Аддитивные фазы миграции

Все фазы выполняются как **additive/expand**: создание новых сущностей, индексов, учёта и проекций не должно удалять v1-таблицы, менять значения v1 либо требовать переключения всех клиентов одновременно. Конкретные DDL/DML, ORM-изменения и runtime rollout намеренно не приводятся в Release 0.

| Фаза | Цель и допустимые действия | Stop/go критерий | Запрещённые действия в фазе |
|---|---|---|---|
| M0. Governance freeze | Зафиксировать baseline commit, этот план, access matrix, state machines, retention/file policy, auth design, config ownership и RACI. Присвоить migration run/correlation convention. | Подписаны владельцами продукта, security и data; юридические артефакты остаются `draft_pending_legal_approval` до отдельного утверждения. | Начинать DDL/DML, считать legal config approved, закрывать клиентский доступ. |
| M1. Source inventory и backup proof | В изолированном окружении снять только для чтения инвентарь всех v1 таблиц, row counts, PK ranges, null/duplicate profiles, parent-child cardinalities, document metadata, report hashes и storage reachability. Создать encrypted backup и restore proof по утверждённой процедуре. | Полный inventory подписан операционно; restore проверен; отсутствуют неучтённые source таблицы/объекты. | Очистка, deduplication, редактирование v1, автоматическое объединение по email. |
| M2. Expand target | Создать согласованные v2 сущности, audit/migration учёт, индексы и read-only compatibility projections. Новые поля должны быть nullable или иметь безопасный default до owner backfill. | Schema validation и empty-target dry run проходят; существующие v1 reads продолжают работать в staging. | Делать v2 owner обязательным для legacy строк; удалять token/URL flows; включать новый authz в production. |
| M3. Register legacy roots | Для каждой `diagnostic_sessions` и `paid_sessions` создать запись `legacy_ownership_cases` и provenance link с состоянием `unassigned`. Привязать дочерние записи только через verified parent identifier. | Число root source = число ownership cases; все дочерние записи классифицированы как linked, missing-parent либо duplicate/anomaly. | Назначать owner по `contactEmail`, `contacts.email`, `users.email`, имени, домену, cookie или близости данных. |
| M4. Controlled claim | Реализовать и протестировать claim flow в staging/test transport. После отдельного approval запустить ограниченный production claim по подтверждённому каналу; success создаёт/связывает account и case, а evidence/audit фиксируются. | Каждый `claimed` имеет проверяемый evidence reference и аудит; replay claim идемпотентен; account isolation проверена. | Массовый auto-claim, раскрытие наличия ресурса в ответе, передача raw token/URL как доказательства, изменение v1 record. |
| M5. Quarantine и compatibility | Unclaimed/anomalous roots переводятся в `quarantined` в migration ledger. Сохраняется ограниченная compatibility projection по утверждённой transition-policy; документы получают отдельную отметку lifecycle без перемещения объектов. | Все source roots имеют ровно один итоговый migration state: claimed, quarantined, excluded-by-retention или explicit error. | Удалять quarantine records, выдавать документ по storage URL/key, утверждать окончательный retention без policy. |
| M6. Reconciliation и shadow verification | Сверить counts, FK-like links, content hashes, sample payloads, report/document metadata, ownership coverage, quarantine reason distribution и negative authz matrix. При включённом v2 read path сравнивать ответы v1/v2 без изменения authoritative v1. | Нет unexplained loss, duplicate mapping либо orphan beyond documented quarantine; executive reconciliation sign-off готов. | Destructive cutover, единовременная массовая перегенерация reports/PDF, отказ от v1 compatibility без согласования. |
| M7. Controlled cutover | После Release 1 security/auth gates новые записи создаются в v2. Legacy reads обслуживаются только согласованной compatibility policy и только после owner/claim policy. Feature flags и incident playbook определяют обратное переключение. | R1.1–R1.9 gates выполнены в согласованном объёме; error/denial metrics стабильны; rollback rehearsal завершён. | Удалять v1, объявлять миграцию завершённой без retention/archival решения, открывать продукт реальным клиентам по одному факту cutover. |
| M8. Retention, archive и decommission | После утверждённых сроков и legal hold провести archive/delete только по отдельной процедуре с reconciliation report и approvals. | Владелец данных утвердил retention; на каждом deletion есть legal/operational основание и audit. | Удалять v1 «для чистоты», если нет одобренной retention policy и доказательства отсутствия обязательств хранения. |

### 5.1. Порядок cutover и защита от split-brain

> **Проектное решение.** Cutover использует expand → backfill/register → validate → gated read/write switch → retention-decommission, а не «big bang». Для каждого resource type назначается один writer. До переключения writer для legacy остаётся v1; после переключения новые v2 события не реплицируются назад в v1 как источник юридической истины. Любая временная dual-read проекция явно маркирует `sourceModel` и `asOf`.

> **Открытый вопрос.** Требуется выбрать допустимое окно read-only или maintenance для конкретных миграционных операций. Для Release 0 окно не устанавливается, потому что пользователь отдельно распорядился не закрывать клиентский доступ.

## 6. Backfill ownership без угадывания по email

### 6.1. Разрешённые и запрещённые основания

| Класс | Основание | Результат |
|---|---|---|
| Разрешённое | Пользователь завершил будущий authenticated claim flow и подтвердил владение через одноразовый проверяемый канал, связанный с конкретным legacy resource locator. | Создать/найти customer account по auth flow, связать root case, записать immutable evidence reference, actor, time, correlation ID и audit event. |
| Разрешённое | Подтверждение уполномоченным администратором по формализованному support process с зафиксированным reason/evidence и принципом четырёх глаз, если такая процедура отдельно утверждена. | Manual claim с аудитом, без удаления source, с возможностью последующего review/revoke. |
| Разрешённое | Для нового v2 ресурса owner уже установлен серверной сессией в момент создания. | Обычный v2 create; это не legacy backfill. |
| Недостаточное и запрещённое | Совпадение `contactEmail`/`contacts.email`/`users.email`, включая нормализацию, plus-addressing, домен или совпадение нескольких записей. | Не назначать ownership; оставить `unassigned`/`quarantined` и предложить neutral claim flow. |
| Недостаточное и запрещённое | Имя, телефон, сайт, продукт, IP, user-agent, cookie, UTM, время заполнения, известность sessionToken или совпадение платежного поля. | Не использовать для ownership; допускается только как неавторизующий операционный контекст, если разрешено privacy policy. |
| Недостаточное и запрещённое | Наличие записи в `users` с ролью `user` или состоявшийся OAuth login. | Не присоединять legacy resource, пока account не выполнит проверяемый claim. |

> **Нормативное требование.** Аудит прямо предписывает не угадывать владельца legacy anonymous sessions и использовать одноразовый claim через проверяемый канал; остальные записи переводить в quarantine/expire согласно retention policy.[3]

> **Проектное решение.** Email сохраняется как персональные контактные данные, но не применяется как технический ключ join между legacy session и `customer_accounts`. Ответ на claim request является нейтральным: он не раскрывает, существует ли ресурс, account или конкретный email в системе.

> **Открытый вопрос.** Не утверждены доказательства, достаточные для manual/support claim, период подачи claim и policy для умерших/недоступных почтовых ящиков. До их утверждения автоматически разрешён только будущий authenticated self-service flow.

### 6.2. Состояния ownership backfill

| Состояние | Значение | Допустимый следующий шаг | Обязательная фиксация |
|---|---|---|---|
| `unassigned` | Source root зарегистрирован, owner не доказан. | `claim_pending`, `quarantined`, `excluded_by_retention`. | Source reference, inventory run, timestamps. |
| `claim_pending` | Инициирован проверяемый claim, но решение отсутствует. | `claimed`, `quarantined`, `unassigned` после истечения TTL. | Non-secret request correlation, expiry, rate-limit/audit facts. |
| `claimed` | Owner установлен по достаточному подтверждению. | `revoked_for_review` только по утверждённой dispute process; иначе terminal для migration. | Account/case link, evidence reference, actor, decision time, audit event. |
| `quarantined` | Владелец не доказан либо обнаружена anomaly. | `claim_pending`, `excluded_by_retention`, `manual_review`. | Reason code, source state, retention clock, доступный только ограниченному персоналу журнал. |
| `manual_review` | Запись ожидает формальное решение уполномоченного сотрудника. | `claimed`, `quarantined`. | Case ticket/reference, required approvers, deadline, audit. |
| `excluded_by_retention` | Обращение с данными прекращено по утверждённой policy; source/archive disposition документирован. | Terminal, subject to legal hold. | Retention policy version, approval, evidence of disposition. |
| `migration_error` | Техническая ошибка или неоднозначная связь source/target. | После исправления повторить идемпотентно в предыдущее допустимое состояние. | Error class, run ID, retry count, operator/audit. |

## 7. Quarantine и claim flow

### 7.1. Quarantine flow

Quarantine — режим сохранения и минимизации, а не удаление и не доступ клиента. Для каждой root session без доказанного owner создаётся `legacy_ownership_case` с reason code: `no_claim`, `multiple_candidate_accounts`, `missing_parent`, `inconsistent_child_link`, `document_metadata_anomaly`, `report_integrity_anomaly` либо иной утверждённый код. Все дочерние данные, включая documents и reports, остаются связаны с source root и не получают самостоятельного account owner.

> **Проектное решение.** В quarantine разрешены только операционные действия, необходимые для инвентаризации, claim, compliance и incident response, с отдельной ролью и audit event. Quarantine не является новым клиентским кабинетом и не раскрывает данные по знанию legacy token.

> **Открытый вопрос.** Политика хранения quarantine, legal hold, экспорт субъекту данных и допустимость ручного восстановления после expiry должны быть согласованы с владельцем данных и юристом. В документе не утверждается, что какой-либо юрист проверил этот flow.

### 7.2. Claim flow

| Шаг | Действие | Безопасностный контроль | Результат |
|---:|---|---|---|
| 1 | Клиент начинает вход/claim в будущей customer-auth модели. | Neutral response, rate limit, журнал request ID; система не подтверждает наличие legacy case. | Создана request context без раскрытия ресурса. |
| 2 | Клиент проходит одноразовое подтверждение разрешённым каналом. | В БД хранится только hash токена; TTL, atomic consume и защита replay. | Появляется authenticated customer session/account context. |
| 3 | Клиент предъявляет opaque legacy locator в авторизованном flow либо система использует scope-bound claim invitation. | Locator не является credential; проверяются TTL, scope, account context, одноразовость и policy. | Найден ровно один `legacy_ownership_case` или нейтральный отказ. |
| 4 | Система проверяет достаточность claim evidence и отсутствие конфликтующего active owner. | Transactional/idempotent decision; concurrency lock; conflict → manual review/quarantine. | `claimed` или безопасный non-disclosing failure. |
| 5 | Создаются `diagnostic_case` v2 и immutable `legacy_resource_links`; дочерние данные доступны через controlled compatibility projection. | Parent-first mapping; per-resource audit; source остаётся неизменным. | Клиент получает только свой ресурс по owner policy. |
| 6 | Система фиксирует result и посылает нейтральное уведомление через будущий approved transport при необходимости. | No raw bearer tokens в URL/localStorage/logs; delivery state отделён от ownership. | Завершённый или повторяемый idempotent claim. |

### 7.3. Конфликты и ошибки claim

Если один resource уже `claimed` другим account, процесс не сообщает инициатору сведения о существующем владельце, личности либо содержимом diagnostics. Он создаёт `manual_review` только при одобренной dispute policy или возвращает одинаковый neutral result. Если у одного account обнаруживается несколько legacy resources, каждый resource проходит самостоятельную проверку, а не присоединяется по email-шаблону.

## 8. Совместимость legacy v1

> **Нормативное требование.** ТЗ фиксирует, что старые платные сессии доступны в режиме совместимости, при этом автоматическая конвертация v1-ответов в v2 не выполняется.[1]

> **Проектное решение.** Compatibility — это versioned read-only projection с явными метками `sourceModel=v1`, `anketaVersion=v1`, `migrationState`, `asOf` и ограничениями на интерпретацию. Она показывает исходные данные/отчёт ровно как legacy evidence, не выдавая их за v2 questionnaire, v2 risk evaluation, новый report snapshot или юридически подтверждённый результат.

| Legacy объект | Режим совместимости | Что нельзя делать автоматически |
|---|---|---|
| `paid_sessions` | Показ статуса/контактных/прогресс-фактов как legacy record после owner claim или ограниченному оператору. | Признавать legacy payment/status достаточным v2 entitlement; менять state v1 из v2 UI. |
| `paid_answers` | Read-only отображение исходных question/option IDs и текстов с `anketaVersion=v1`. | Маппить на `questionnaire_v2`, считать required completeness v2 или запускать v2 rules engine. |
| `paid_reports` | Сохранить как historical legacy report с source hash. | Переписывать markdown, обновлять нормы/санкции, объявлять report v2 или пересоздавать PDF «на лету». |
| `paid_documents` | Показать только metadata/lifecycle после owner policy; выдача объекта — через защищённую v2 download policy. | Доверять `storageUrl` как доступу, перемещать/обрабатывать файл без checksum/quarantine/retention решения. |
| Free tables | Допускать read-only compatibility после отдельной policy, если связаны с claimed case. | Молчаливо объединять с paid session/account по email или делать v2 score/полный отчёт. |
| `feedbacks` | Отдельное ограниченное операционное хранение; связь с case только по доказуемому source correlation. | Приписывать feedback account/case по необязательному token или контактным данным. |

Существующие runtime-mаршруты v1 не меняются в Release 0. В Release 1 их закрытие/замена должно идти по утверждённой access matrix, с owner-or-admin checks и feature-flagged rollout. До выполнения этого work legacy compatibility не считается security remediation и не является основанием открыть продукт клиентам.

## 9. No data loss, rollback и reconciliation

### 9.1. Стратегия отсутствия потери данных

No data loss означает, что миграционный процесс не удаляет v1 source rows, не заменяет их значения v2-данными, не перегенерирует legacy reports/PDF и не теряет связь child→parent. Это не означает, что каждая legacy запись автоматически станет доступна аккаунту: записи без доказанного owner сохраняются в quarantine до утверждённого retention решения.

| Контроль | Механизм | Доказательство завершения |
|---|---|---|
| Preservation | Backup source до M2 и append-only source inventory; source table не является migration write target. | Restore rehearsal, backup manifest, hashes/counts. |
| Provenance | Для каждой target/registered записи хранится `legacy_resource_links` с source table/PK и migration run. | Уникальный mapping coverage report. |
| Parent-child integrity | Root-first registration; child records допускаются только с существующим source parent или помечаются `migration_error`. | Cardinality report по каждой logical relation. |
| Content integrity | Normalized content hashes для JSON/text report sections, metadata hashes для documents; без чтения или изменения секретов/storage content без policy. | Sample and aggregate hash reconciliation. |
| Idempotency | Run ID, source watermark, deterministic mapping key и retry-safe insert/update semantics. | Повтор dry run не создаёт новых target mappings. |
| Decision integrity | Ownership decision и quarantine reason не меняются без нового audit event. | Audit trail и state-transition review. |

### 9.2. Rollback уровни

| Уровень | Условие | Действие rollback | Что сохраняется |
|---|---|---|---|
| R0 — документ/план | Обнаружено несогласованное требование до реализации. | Исправить черновик, получить повторное согласование; никакого технического rollback не требуется. | Baseline и клиентский доступ не затрагиваются. |
| R1 — expand | Ошибка при создании v2 структуры или пустом dry run. | Отключить feature flag/новый writer; оставить v1 как единственный runtime path; исправить в новой версии плана/миграции. | v1, backup, migration logs; созданные v2 записи не удаляются до forensic decision. |
| R2 — backfill/claim | Ошибка mapping, ownership conflict, рост quarantine/anomaly. | Остановить новые runs по watermark; отключить claim/cutover; пометить run failed; восстановить v1-only reads. | Source, target mappings, evidence, audit и reconciliation records. |
| R3 — read cutover | Ошибка v2 read projection или owner enforcement. | Вернуть read traffic на согласованный compatibility path только через feature flag; запретить v2 writes, которые нельзя безопасно компенсировать. | Immutable v2 cases/snapshots/events остаются для сверки. |
| R4 — write cutover | Ошибка нового writer после переключения. | Заблокировать новые transition side effects, восстановить предыдущий writer только при отсутствии conflict; иначе применить compensating event, а не overwrite. | Все write events, idempotency keys, payment/access facts, audit. |

> **Проектное решение.** Rollback не выполняет destructive delete v2-таблиц и не «откатывает» audit/ownership evidence. Он переводит runtime policy обратно на безопасно известный путь, фиксирует incident и запускает reconciliation. Это защищает доказательность и no-data-loss инвариант.

> **Открытый вопрос.** Нужны RTO/RPO, backup encryption/key-management, scope restore (полная БД или per-tenant) и критерии, когда legacy v1 path нельзя безопасно возвращать из-за исправленных P0-уязвимостей. Эти параметры не определены этим Release 0 документом.

### 9.3. Reconciliation gates

| Gate | Обязательные сверки | Допустимый результат |
|---|---|---|
| До M2 | Таблицы/колонки baseline, counts, PK min/max, null distribution, storage inventory, report/document sample hashes. | Исчерпывающий signed source manifest. |
| После M3 | `diagnostic_sessions` + `paid_sessions` = ownership cases; каждый child либо привязан к зарегистрированному parent, либо имеет documented anomaly. | Ноль необъяснённых пропусков. |
| После M4/M5 | `claimed + quarantined + excluded_by_retention + migration_error` = source roots; claimed links unique; no inferred-email decisions. | Ноль owner conflicts и ноль claim без evidence. |
| Перед M7 | Для каждого migrated case есть provenance; v1/v2 compatibility samples совпадают по legacy facts; report/document metadata/hashes сверены; negative authz тесты проходят. | Только documented/approved exceptions. |
| После M7 | New v2 write counts, event idempotency, access denial/allow distribution, error budget, legacy reader usage, queue/retry health. | Стабильность в согласованном observation window. |

## 10. Dry run checks

Dry run запускается на sanitized, access-controlled staging copy или на approved read-only snapshot. Он никогда не отправляет email, не создаёт реальную сессию, не изменяет production v1 records, не перемещает storage objects, не запускает LLM/PDF generation и не раскрывает секреты.

| Категория | Проверка | Pass criterion |
|---|---|---|
| Baseline identity | Branch и `HEAD` соответствуют `feat/lexy-release-0-architecture` и `78e2f89e99340a403ce389eada223da6bf336676`; schema manifest совпадает с inventory. | Нет drift исходника. |
| Source completeness | Counts по 12 текущим таблицам, PK ranges, nullable fields, enum values, JSON parseability и duplicate profile зафиксированы. | Каждый source record учтён либо документирован как malformed. |
| Relation integrity | `sessionId`, `paidSessionId`, `freeSessionId` и optional `feedbacks.sessionToken` анализируются на orphan/multiplicity/anomaly без исправления данных. | Все anomalies имеют reason code и не скрыты агрегацией. |
| Ownership safety | Simulation создаёт только `unassigned`/`quarantined`; fixture с совпадающими email доказывает отсутствие auto-link. | Ровно ноль inferred owner assignments. |
| Mapping idempotency | Один и тот же source snapshot прогоняется дважды с тем же mapping version/run semantics. | Ноль дополнительных target duplicates; totals одинаковы. |
| Report integrity | Hash/sample compare полей `paid_reports`, JSON parse, unique paidSession mapping. | Ноль изменений source report; расхождения объяснены. |
| Document integrity | Сверка metadata (`fileName`, size, MIME, storage reference, category) и доступности inventory без публичного download. | Ноль silent drops; anomaly не открывает доступ к объекту. |
| Performance/capacity | Измеряются runtime, lock duration, batch memory, retry rate, projected storage/audit volume. | Не превышены согласованные threshold; без длительной блокировки v1 path. |
| Security/privacy | Test account не читает non-owned case; raw legacy token, email и storage key не являются sufficient authority в target test harness. | Negative cases получают согласованный denial без раскрытия. |
| Restore | Backup до M2 восстанавливается в isolated environment; inventory/reconciliation повторяется. | Counts/hashes соответствуют backup manifest. |

## 11. Наблюдаемость и операционное управление

Каждый migration run получает `runId`, environment, baseline/version, mapping version, start/end, actor/service identity и correlation ID. Метрики не должны содержать email, raw `sessionToken`, magic-link token, storage URL/key, document content либо иной секрет/персональные данные. Детальные сведения доступны только в защищённом audit/reconciliation store в объёме, необходимом для расследования.

| Сигнал | Тип | Назначение / тревога |
|---|---|---|
| `migration_run_started_total`, `migration_run_completed_total`, `migration_run_failed_total` | Counter | Запуск/успех/ошибка по phase и mapping version; тревога на любой unexpected failure. |
| `migration_source_records_total`, `migration_target_records_total` | Gauge/Counter | Counts по source type, target type и migration state; тревога на mismatch вне allow-list. |
| `migration_quarantine_total` | Gauge | Количество quarantine по reason code; тревога на резкий рост или неизвестный reason. |
| `migration_claim_total` | Counter | Attempt/success/failure/replay/conflict без PII labels; тревога на spike failures/replay. |
| `migration_orphan_total`, `migration_duplicate_link_total` | Counter | Parent-child anomaly и duplicate mapping; любой non-zero требует triage. |
| `migration_reconciliation_mismatch_total` | Counter | Mismatch counts/hashes/metadata; hard stop до разрешения. |
| `migration_batch_duration_seconds`, `migration_retry_total` | Histogram/Counter | Производительность, timeout и retry health; threshold до cutover. |
| `authz_decision_total` | Counter | allow/deny по resource/action/reason class; отклонение baseline расследуется. |
| `legacy_compatibility_reads_total` | Counter | Использование v1 projection; применимо к decommission planning, не содержит token/email. |
| `document_lifecycle_total` | Counter | Изменение document states и quarantine/revoke/delete; тревога на unauthorized transition. |
| `audit_event_write_failure_total` | Counter | Потеря audit trail должна блокировать чувствительный transition по согласованной policy. |

Операционный dashboard должен показывать run progress, watermark, source-target deltas, quarantine distribution, reconciliation status, dry-run mode, feature-flag state и active incident banner. Доступ к dashboard — только по служебной роли; customer-facing UI не должен отображать внутренние migration details.

## 12. Матрица миграционных тестов

| ID | Уровень | Сценарий | Ожидаемый результат |
|---|---|---|---|
| MIG-01 | Unit | Deterministic source-to-link key для каждой root/child сущности. | Повторный расчёт даёт тот же key; дубликат не создаётся. |
| MIG-02 | Unit | Legacy paid session с `contactEmail`, совпадающим с одним `customer_account`. | Owner не назначается; состояние `unassigned`/`quarantined`. |
| MIG-03 | Unit | Legacy session с несколькими совпадающими email/account кандидатами. | Нет auto-merge; `multiple_candidate_accounts`/quarantine. |
| MIG-04 | Unit | Claim token истёк, повторно использован либо scope mismatch. | Neutral failure; ownership не меняется; audit/rate-limit fact записан. |
| MIG-05 | Unit | Два параллельных claim на один source resource. | Не более одного `claimed`; второй поток conflict/manual review без disclosure. |
| MIG-06 | Integration | Full v1 source inventory проходит M3 registration. | Сумма root states совпадает с root source; дочерние связи учтены. |
| MIG-07 | Integration | `paid_answers` с `anketaVersion=v1` в compatibility projection. | Данные read-only с v1 label; v2 validation/rules не запускаются. |
| MIG-08 | Integration | `paid_reports` с JSON/text sections. | Source hash неизменен; target provenance уникален; report не регенерируется. |
| MIG-09 | Integration | `paid_documents` с отсутствующим объектом или inconsistent metadata. | Запись попадает в anomaly/quarantine; download не выдаётся. |
| MIG-10 | Integration | Orphan child (`sessionId`/`paidSessionId` без parent). | `migration_error`/quarantine с reason; source не удаляется. |
| MIG-11 | Integration | Dry run повторяется на одном snapshot. | Identical counts/hashes; ноль новых mappings после второго run. |
| MIG-12 | Integration | Backup restore до target expand/backfill. | Restore manifest и reconciliation совпадают с expected baseline. |
| MIG-13 | Authz-negative | Anonymous, leaked legacy token и authenticated non-owner пытаются прочитать case/answers/report/document/PDF v2. | Deny согласно access policy; нет PII/resource existence leakage. |
| MIG-14 | Authz-positive | Claimed owner и authorised admin читают один и тот же legacy compatibility case в разрешённом scope. | Доступ только в пределах роли; audit event для sensitive/admin action. |
| MIG-15 | E2E | Клиент начинает claim с одного устройства, подтверждает и продолжает с другого. | Только после valid claim отображается собственный case; no local token dependency. |
| MIG-16 | Regression | Действующие v1 runtime paths во время Release 0. | Не меняются этим документом; smoke baseline проходит без schema/runtime modifications. |
| MIG-17 | Reconciliation | Counts, mapping coverage, report/document metadata hashes после backfill. | Нет необъяснённых mismatch; approved exception register пуст или подписан. |
| MIG-18 | Rollback rehearsal | Ошибка M6 и feature-flag rollback. | v1 compatibility возвращена по playbook; v2 evidence/logs сохранены; no source loss. |
| MIG-19 | Load | Объёмный batched dry run с retry и ограничением memory/lock. | Проходит agreed SLO; нет starvation действующего пути. |
| MIG-20 | Security logging | Анализ logs/metrics/audit outputs during failure. | Нет raw secrets, bearer tokens, storage URLs/keys или необязательной PII. |

## 13. Критерии готовности к началу фактической миграции

Фактическая миграция не начинается, пока не выполнены все перечисленные условия. Это **проектный gate Release 0**, согласованный с очередностью ТЗ; он не является доказательством юридического или security approval.

| Область | Минимальный критерий |
|---|---|
| Governance | Зафиксированы baseline, owner/custodian, change-control, RACI, rollback authority и incident contacts. |
| Архитектура | Утверждены access matrix, пять state machines, target schema design, auth/magic-link design, compatibility contract и data retention/file policy. |
| Legal core | Конфигурации и golden reports имеют статус `draft_pending_legal_approval` до фактического отдельного юридического утверждения; не допускается маркировать их как approved этим планом. |
| Ownership | Утверждены sufficient evidence, neutral response, claim TTL/rate limit, manual review/dispute policy и quarantine/expiry policy. |
| Data safety | Есть validated backup/restore, source manifest, dry run harness, reconciliation thresholds, idempotency design и no-loss sign-off. |
| Security | Security review подтверждает, что v2 path не использует legacy token/email/storage URL как полномочие; есть negative authz matrix. |
| Release control | Feature flags, progressive rollout, monitoring, alerts и rollback rehearsal определены; клиентский доступ не закрывается заранее. |

## 14. Реестр открытых вопросов и допущений

| ID | Открытый вопрос / допущение | Почему блокирует или ограничивает работу | Требуемое решение |
|---|---|---|---|
| MIG-OQ-01 | Какой exact evidence достаточен для self-service и manual claim? | Нельзя безопасно назначать legacy ownership. | Product, security и data owner утверждают claim policy. |
| MIG-OQ-02 | Какой срок retention у draft, quarantine, documents, legacy reports и audit events; есть ли legal hold? | Нельзя определить expiry, archive и deletion. | Владелец данных/юрист утверждают retention schedule. |
| MIG-OQ-03 | Нужна ли одна account identity на человека или organization/team ownership/delegation? | Влияет на cardinality `customer_accounts`↔cases и кабинет. | Product утверждает customer-account model. |
| MIG-OQ-04 | Как coexist admin OAuth с customer magic link? | Влияет на session types, role separation и audit. | Security/product утверждают auth boundary. |
| MIG-OQ-05 | Pilot tariff, currency, price snapshot и credit 6 900 ₽/14 дней/timezone. | Нельзя автоматически создать корректные payment/entitlement/credit facts. | Product/legal утверждают policies. |
| MIG-OQ-06 | MIME allow-list, scanning, object quarantine, storage topology, legal access и document retention. | Нельзя переносить/обрабатывать document objects безопасно. | Security/data owner утверждают file policy. |
| MIG-OQ-07 | Нужно ли показывать legacy free diagnostics в v2 кабинете и как связать их с paid cases? | Нельзя выбрать compatibility scope без запрета email join. | Product утверждает migration UX and scope. |
| MIG-OQ-08 | Какой официальный owner правовых конфигураций и golden reports? | Нельзя переводить status в approved. | Назначить named legal approver и technical release custodian. |
| MIG-OQ-09 | RTO/RPO, recovery scope и encryption/key-management backup. | Нельзя завершить operational rollback gate. | Operations/security утверждают DR runbook. |
| MIG-OQ-10 | Когда и на каком основании legacy v1 может быть decommissioned? | Compatibility нельзя прекращать «по умолчанию». | Утвердить retention, communication и archival/destruction plan. |

## 15. Ссылки

[1] ТЗ v3.0 задаёт архитектурные принципы, Release 0/1 gates, доступ, state machines, версии отчётов, документы, fixtures и launch blockers.[1]

[2] Drizzle schema baseline содержит фактический инвентарь таблиц и показывает отсутствие `customerAccountId` у диагностических сессий.[2]

[3] Аудит фиксирует ownership/access gaps, запрет угадывания legacy ownership по email, необходимость quarantine/claim и согласованный R0 migration plan.[3]

[4] SQL-миграции baseline подтверждают состав созданных таблиц и отсутствие в них деклараций внешних ключей.[4]

[1]: file:///tmp/text_editor_extracts/%D0%A2%D0%973.0.%D0%92%D0%B5%D0%B1-%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D0%BF%D0%BB%D0%B0%D1%82%D0%BD%D0%BE%D0%B9%D1%8E%D1%80%D0%B8%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%D0%B4%D0%B8%D0%B0%D0%B3%D0%BD%D0%BE%D1%81%D1%82%D0%B8%D0%BA%D0%B8Lexy-849c367a6037-p1-49.txt "ТЗ v3.0 веб-сервиса платной юридической диагностики Lexy"
[2]: file:///home/ubuntu/Neolex/drizzle/schema.ts "Drizzle-схема исходного контура Lexy"
[3]: file:///home/ubuntu/lexy-audit-work/%D0%90%D1%83%D0%B4%D0%B8%D1%82-%D0%B8-%D0%B1%D1%8D%D0%BA%D0%BB%D0%BE%D0%B3-Lexy-%D0%A2%D0%97-v3.md "Аудит и согласуемый бэклог Lexy по ТЗ v3"
[4]: file:///home/ubuntu/Neolex/drizzle/0003_lonely_unicorn.sql "Baseline миграция платной диагностики Lexy"
