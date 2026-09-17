# Lexy v3 — полный план доведения до запуска

## 1. Итоговая позиция

Сейчас Lexy находится в состоянии **технического synthetic Pilot**. Готовы основные механизмы Release 1 и значительная часть document-контура: owner-bound доступ, тестовый magic link, promo-доступ без оплаты, серверная анкета, детерминированный rules engine, immutable web report, PDF artifact, E2E journey, document intake, PDF/DOCX extraction, text-artifact queue, evidence-gate и retention contract.

Это ещё не полноценный клиентский сервис. До запуска для реальных клиентов нужно последовательно закрыть governance, operational, security, data-policy, commercial и legal gates.

Порядок ниже является обязательным: следующий уровень не должен включаться до прохождения предыдущего gate.

## 2. Что уже сделано

| Область | Статус |
|---|---|
| Owner-bound customer access | Реализован в R1 Pilot |
| Test-only magic link | Реализован |
| Promo access без реальной оплаты | Реализован для synthetic Pilot |
| Server-authoritative questionnaire | Реализован для Pilot |
| Deterministic AST rules engine | Реализован без LLM в core logic |
| Immutable web report | Реализован |
| Persisted PDF artifact | Реализован |
| Synthetic full journey | Реализован и проверен на disposable MariaDB |
| Document intake и owner-bound API | Реализованы технически |
| PDF/DOCX extraction | Реализован fail-closed контур |
| Document processing queue | Реализована техническая основа |
| Evidence-gate | Реализован |
| Retention contract | Реализован без выбора сроков хранения |
| LLM editor-only режим | Реализован как отдельный редакторский контур |
| Production-like build | Собирается успешно |
| Реальные платежи | Не подключены намеренно |
| Production email | Не подключён намеренно |
| Юридическое утверждение контента | Не проведено |
| Клиентский runtime | Заблокирован release gate |

## 3. Обязательная последовательность

### Этап 0. Зафиксировать режим тестового Pilot

Этот этап нужен перед дальнейшей разработкой, чтобы тестирование не смешалось с настоящим запуском.

Нужно закрепить следующие ограничения:

- только synthetic или специально созданные тестовые данные;
- никакой реальной оплаты;
- никакой обработки реальных клиентских документов;
- заметный watermark на тестовых отчётах и PDF;
- LLM не меняет риск, evidence status, recommendation или critical override;
- client runtime остаётся выключенным;
- тестовая база создаётся отдельно и удаляется после rehearsal;
- публичная ссылка считается временным staging-доступом, а не production-сервисом.

**Gate:** тестовый контур доступен, но production/client launch остаётся запрещённым.

### Этап 1. Закрыть Release 1 технически

Нужно окончательно подтвердить один полный synthetic journey:

1. открытие landing page;
2. запрос magic link;
3. получение письма через test transport;
4. одноразовое потребление ссылки;
5. создание customer session;
6. принятие обязательных условий;
7. выбор тарифа;
8. проверка промокода;
9. создание нулевого promo payment record;
10. создание owner-bound case;
11. прохождение анкеты на desktop и mobile;
12. восстановление анкеты на другом устройстве;
13. отправка ответов;
14. детерминированный scoring;
15. создание web snapshot;
16. создание PDF;
17. owner-bound скачивание PDF;
18. повторная отправка без создания второго snapshot или второго PDF.

Затем нужно пройти negative matrix:

- anonymous user;
- владелец кейса;
- другой customer;
- admin без нужной роли;
- worker без customer identity;
- старый session token;
- изменённый public ID;
- отозванный access grant;
- неготовый report;
- повторное использование magic link;
- параллельное потребление magic link;
- повторная отправка одной и той же команды.

**Gate:** unit, DB integration, migration rehearsal и synthetic E2E проходят на чистой disposable MariaDB.

### Этап 2. Закрыть Release 0 governance

До юридической проверки нужно привести все артефакты к единому управляемому состоянию:

- `questionnaire_v2`;
- `risk_catalog_v1`;
- `rules_v1`;
- `legal_basis_catalog_v1`;
- `recommendation_mapping_v1`;
- `report_schema_v1`;
- state machines для case, payment/access, document, report и email delivery;
- access matrix;
- tariff and credit policy;
- migration plan;
- 12–15 fixtures с ожидаемыми и запрещёнными результатами;
- версия, effective date, статус, checksum и история изменения каждого legal artifact.

Все draft-артефакты должны оставаться в статусе `draft_pending_legal_approval`. Нельзя переводить их в `approved` автоматически после прохождения тестов.

**Gate:** есть один согласованный набор версий legal artifacts, который используется rules engine, web report и PDF.

### Этап 3. Провести юридическую проверку содержания

Проверяется не только код, но и содержание результата:

- вопросы и варианты ответов;
- критические триггеры;
- уровни риска;
- override-правила;
- legal basis;
- допустимые формулировки;
- финансовые ориентиры;
- roadmap 0/30/60/90;
- единственная рекомендация следующего продукта;
- disclaimer и escalation text;
- три эталонных отчёта.

Юрист должен отдельно подтвердить, что сервис:

- не утверждает нарушение без достаточных данных;
- не обещает результат;
- не подменяет индивидуальную юридическую консультацию;
- корректно обрабатывает недостаток доказательств;
- не сглаживает critical risk;
- отправляет критические случаи на экспертную проверку.

**Gate:** три эталонных отчёта и legal artifacts письменно утверждены ответственным юристом.

### Этап 4. Довести expert escalation до реального процесса

Сейчас система может обнаружить необходимость экспертной проверки. Для полноценного сервиса нужно реализовать операционный процесс:

- очередь expert review;
- назначенный ответственный;
- SLA;
- клиентский статус заявки;
- минимальный набор данных для эксперта;
- комментарии и результат проверки;
- журнал действий;
- уведомление клиента;
- контроль просроченных заявок;
- безопасное поведение при отсутствии свободного эксперта.

Нужно решить, что получает клиент после escalation:

- безопасное краткое резюме;
- экспертный разбор;
- индивидуальное предложение;
- запрос дополнительных документов.

**Gate:** CTA «Запросить экспертный разбор» связан с настоящей очередью, ответственным и SLA.

### Этап 5. Завершить Release 2 — документарный тариф

Техническая основа уже есть, но нужно довести её до продуктового состояния:

- отдельный тариф `with_documents`;
- лимиты количества, размера и форматов;
- приватное object storage;
- короткоживущие owner-bound download links;
- четыре категории документов;
- подсказки по приоритетным документам;
- статусы `uploaded`, `extracting`, `analyzed`, `manual_review_required`, `failed`, `deleted`;
- PDF/DOCX extraction;
- поддержка или официальный запрет сканов PNG/JPEG;
- связь документа с risk block и evidence fragment;
- повторная генерация новой версии отчёта без изменения старой;
- ручная проверка нечитаемых, противоречивых и защищённых файлов;
- защита от prompt injection;
- запрет документу менять риск напрямую;
- физическое удаление object-storage через утверждённый provider adapter.

Отдельно нужно утвердить:

- storage provider;
- регион хранения;
- DPA;
- запрет обучения на клиентских данных;
- правила доступа сотрудников провайдера;
- срок хранения;
- правила удаления резервных копий.

**Gate:** документарный тариф можно включить без нарушения owner-bound доступа и без влияния недоверенного текста на canonical result.

### Этап 6. Реализовать data retention и эксплуатационные процессы

Нужно превратить текущий retention contract в работающую политику:

- срок хранения черновика;
- срок хранения завершённой анкеты;
- срок хранения исходного документа;
- срок хранения text artifact;
- срок хранения PDF;
- срок хранения magic token;
- срок хранения email delivery log;
- срок хранения audit log;
- удаление аккаунта;
- удаление документа до отчёта;
- удаление документа после отчёта;
- последствия удаления для финансовых записей;
- backup retention;
- запрос на удаление;
- журнал фактического удаления;
- процедура восстановления;
- ротация секретов;
- отзыв сессий;
- alerting по очередям, PDF, email и storage;
- rollback plan.

**Gate:** политика опубликована, технически исполняется и проверена на rehearsal.

### Этап 7. Закрыть legacy compatibility risk

Нужно выбрать один из трёх вариантов:

1. полностью закрыть legacy routes;
2. изолировать legacy contour как неподдерживаемый и явно маркированный;
3. выполнить контролируемую миграцию с подтверждённым ownership.

Нельзя считать сервис глобально owner-bound, пока старые token routes, старые PDF routes или старые public procedures могут раскрывать данные в обход R1/R2 policy.

**Gate:** legacy routes либо закрыты, либо изолированы и не участвуют в новом клиентском пути.

### Этап 8. Выполнить security review

Проверить нужно:

- BOLA/IDOR по всем locator-ам;
- session fixation;
- replay и race magic link;
- cookie policy;
- CSRF;
- rate limits;
- SSRF;
- path traversal;
- private object-storage permissions;
- prompt injection;
- утечки через access logs;
- Referer и analytics;
- error tracking;
- admin roles;
- audit log;
- dependency vulnerabilities;
- secret scanning;
- backup access;
- abuse и bot scenarios.

**Gate:** найденные P0/P1 проблемы закрыты, а остаточные риски зафиксированы и приняты владельцем.

### Этап 9. Реализовать production email

Только после прохождения предыдущих gates:

- выбрать email provider;
- подтвердить домен;
- настроить SPF, DKIM и DMARC;
- подключить production delivery adapter;
- реализовать retry и suppression;
- настроить шаблоны magic link и report-ready email;
- исключить raw tokens из логов и Referer;
- проверить доставку и bounce handling;
- добавить мониторинг.

**Gate:** production magic link и уведомления проходят отдельный rehearsal на подтверждённом домене.

### Этап 10. Реализовать коммерческий контур Release 3

Нужно подключить:

- платёжный provider;
- server-side payment initiation;
- webhook signature verification;
- idempotency;
- provider payment ID;
- reconciliation;
- refund flow;
- payment failure flow;
- credit entitlement;
- правило зачёта 6 900 ₽ в течение 14 дней;
- безопасное связывание бесплатной диагностики с customer account;
- историю операций;
- бухгалтерские и операционные статусы;
- запрет browser-side подтверждения оплаты.

До этого этапа payment provider остаётся отключённым.

**Gate:** payment rehearsal проходит без реального списания или на специально утверждённом sandbox provider; webhook, retry, duplicate и refund cases проверены.

### Этап 11. Довести продуктовую полноту

После юридического и технического approval:

- подтвердить целевое количество вопросов: 45 core и до 15 веточных, если именно это требуется финальным ТЗ;
- расширить risk catalog на согласованные отрасли и сценарии;
- завершить клиентский cabinet;
- добавить историю отчётов без нарушения owner policy;
- подключить CRM-очередь экспертных обращений;
- добавить безопасную аналитику funnel;
- настроить админский минимальный кабинет;
- проверить desktop, tablet и mobile;
- добавить понятные loading, error и empty states;
- провести accessibility review;
- выполнить performance optimization и code splitting.

**Gate:** все заявленные пользовательские сценарии имеют рабочие success и failure paths.

### Этап 12. Ограниченно включить LLM editor-only

LLM можно оставить включённой для тестирования и после запуска только в строго ограниченной роли:

- LLM получает только валидированный structured report;
- LLM не получает право менять risk level;
- LLM не меняет critical override;
- LLM не меняет evidence status;
- LLM не выбирает product recommendation;
- LLM не создаёт legal basis из собственного знания;
- каждый источник берётся только из approved catalog;
- structured output проверяется схемой;
- обязательны citations или явный статус «источник не найден»;
- разные проверки должны отбрасывать неподтверждённые утверждения;
- результат маркируется как AI-generated editorial draft;
- человек может отключить или отклонить draft;
- все LLM calls журналируются без клиентских секретов;
- документы передаются как untrusted data.

**Gate:** LLM является только редактором разрешённых блоков и никогда не становится источником canonical legal result.

### Этап 13. Нагрузочные, backup и release rehearsal

Перед запуском нужно выполнить:

- load test полного пути;
- concurrent magic-link consume;
- concurrent questionnaire autosave;
- repeated submit;
- PDF generation under load;
- queue backlog test;
- storage failure test;
- email provider failure test;
- database failure test;
- backup creation;
- restore into clean database;
- replay of migration and seed bundle;
- rollback rehearsal;
- monitoring and alert test.

**Gate:** восстановление и откат проверены не только документально, но и практически.

### Этап 14. Финальный launch review

Перед открытием реальным клиентам должны одновременно выполняться все условия:

- legal artifacts approved;
- три эталонных отчёта утверждены;
- Release 1 E2E пройден;
- document tariff approved или официально выключен;
- expert queue имеет владельца и SLA;
- retention policy опубликована и исполняется;
- production email работает;
- payment provider и refunds проверены;
- legacy access закрыт или изолирован;
- security review пройден;
- load test пройден;
- backup/restore проверены;
- нет обходов через старые routes;
- runtime bundle имеет approved status;
- client runtime flag включён только после финального review;
- support и incident process готовы.

Только после этого статус можно изменить с **technical Pilot** на ограниченный клиентский запуск.

## 4. Решения владельца, которые блокируют финальные этапы

Некоторые вопросы невозможно корректно решить кодом:

1. кто утверждает юридический контент;
2. какие сроки хранения применяются;
3. какой storage provider используется;
4. разрешены ли сканы и OCR;
5. кто отвечает за expert queue;
6. какой SLA обещается клиенту;
7. какой email provider используется;
8. какой payment provider используется;
9. как устроены refunds и credit policy;
10. закрывать ли legacy routes или изолировать их;
11. разрешается ли полноценный LLM editor-only режим в клиентском интерфейсе;
12. какие отрасли и сценарии входят в первый коммерческий запуск.

До принятия этих решений следует продолжать разработку только в synthetic Pilot и не включать production/client runtime.

## 5. Практический порядок ближайших работ

Если двигаться экономно, ближайший порядок такой:

1. закрыть и документально повторить Release 1 E2E;
2. завершить migration/backup/restore rehearsal;
3. подготовить юридический пакет из трёх эталонных отчётов;
4. реализовать expert queue и SLA;
5. завершить document tariff contract и retention policy;
6. закрыть или изолировать legacy routes;
7. провести security review;
8. после решений владельца подключить production email;
9. после отдельного решения подключить payment provider;
10. провести product, load и recovery rehearsal;
11. выполнить юридическую финальную приёмку;
12. включить ограниченный клиентский запуск;
13. наблюдать первые кейсы и расширять доступ постепенно.

## References

[1]: /home/ubuntu/Neolex/docs/release-1/implementation-plan.md "Release 1 implementation plan"
[2]: /home/ubuntu/Neolex/docs/release-1/roadmap-to-full-launch.md "Lexy v3 roadmap to full launch"
[3]: /home/ubuntu/Neolex/docs/final-technical-closure-and-decision-gates.md "Lexy technical closure and decision gates"
[4]: /home/ubuntu/lexy-audit-work/Аудит-и-бэклог-Lexy-ТЗ-v3.md "Lexy v3 audit and backlog"
