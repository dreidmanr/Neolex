# Второй независимый юридико-технический review draft golden report: B2C-подписка и рекуррентные списания

**Автор review:** Manus AI
**Дата проверки и доступа к внешним источникам:** 2026-09-12
**Проверяемый report:** `LEXR0-GOLDEN-REPORT-004-V1`
**Статус исходных артефактов:** `draft_pending_legal_approval`

> **Характер проверки.** Это независимый ИИ-review исправленного draft, а не формальное юридическое заключение, юридическая консультация или human legal approval. Review не переводит report, fixture, catalogs, rules или schema в `approved`. Проверяемые исходные файлы не изменялись; создан только настоящий round-2 review.

## 1. Verdict

**Verdict: `pass_with_notes`.** Все blocker и major из round 1, относящиеся к исправляемой narrative/config/schema модели, закрыты. Новых blocker или major не выявлено. Активные predicates, overrides, evidence derivation, две обязательные очереди, recommendation, allowlist правовых оснований, порядок документов и roadmap воспроизводятся по ID. Report прямо обозначен как **human-readable narrative projection**, не выдаётся за schema-valid Report DTO, не фабрикует server/payment/access/queue provenance и сохраняет `draft_pending_legal_approval`.[1] [3] [4] [5] [7] [8] [9]

Сохраняются только notes: **полный schema-valid JSON snapshot всё ещё не создан и не валидировался**, потому что fixture не содержит обязательных server identity, answer timestamps и payment/access provenance. Это больше не дефект представления текущего Markdown: report прямо и многократно фиксирует данное ограничение. Кроме того, ни один legal basis не получил human approval; каталог сохраняет `verificationStatus=draft_pending_legal_review`.[1] [5] [9]

| Область | Итог round 2 |
|---|---|
| Blocker / major из round 1 | **Resolved** для текущего draft narrative и обновлённых контрактов |
| Новые blocker / major | **Нет** |
| Fixture и factual wording | **Aligned** |
| Predicates / overrides / trace | **Aligned по ID** |
| Legal basis allowlist и актуальность | **Aligned; human legal approval не выполнен** |
| Две очереди | **Детерминированы как обязательный набор без ложного primary route** |
| Schema / provenance | **Narrative честно отделён от DTO; полный snapshot отсутствует** |
| Готовность | **Готов к human legal review, но не approved и не готов к client/runtime use** |

## 2. Scope и методика повторной проверки

Сначала повторно прочитаны round-1 review и round-1 summary. После этого сверены исправленный report, fixture `LEXR0-FIXTURE-004`, questionnaire, risk catalog, rules, legal-basis catalog, recommendation mapping, report schema и credit policy.[1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11]

Внешние правовые утверждения перепроверены по открытым полным страницам официальных первичных источников, а не по поисковым snippets. Федеральный закон № 376-ФЗ открыт в банке документов Президента России и на портале официального опубликования; Федеральный закон № 500-ФЗ открыт в банке документов Президента России. Тексты подтверждают соответственно специальное правило пункта 4.2 статьи 16.1 с 1 марта 2026 года и исключения пункта 7 статьи 13 с 1 февраля 2026 года.[12] [13] [14] Для статьи 32 повторно открыт официальный материал Роспотребнадзора; дополнительные limitations по публичной оферте и рекламе сверены по официальным материалам Роспотребнадзора и ФАС России.[15] [16] [17]

Механически подтверждены: 35 ответов fixture; успешный JSON parse восьми входных JSON-файлов; отсутствие дубликатов в 70 проверенных rule IDs и 35 legal-basis IDs; совпадение всех девяти полных SHA-256, приведённых в report; отсутствие неопределённых или неиспользованных ссылок с номерами 1–22; существование всех локальных reference targets.[1] [2] [3] [4] [5] [6] [7] [8] [9]

## 3. Независимый пересчёт predicates и risk profile

### 3.1. Branching и активные риски

Fixture содержит 35 канонических ответов. Для рассматриваемой цепочки существенны `b1_q3=[b2c]`, `b7_q4=yes`, `b8_q1=yes`, `b8_q2=partial` и `b8_q3=yes`.[1]

| ID | Повторный расчёт | Результат report | Оценка |
|---|---|---|---|
| `BRANCH-001` | `b1_q3` содержит `b2c`; ветка `consumer` активна | Указан `b1_q3:b2c` | Совпадает |
| `BRANCH-007` | `b8_q1=yes`; активируется `b8_q3` | Указан `b8_q1:yes` | Совпадает |
| `RULE-RISK-017` | Истинна первая OR-ветвь: `b7_q4=yes`. Вторая ветвь ложна, поскольку `b7_q2` отсутствует и missing atom даёт `false` | `b7_q4:yes` указан как единственный фактический activation atom; `b8_q2` исключён из этой ветви | Совпадает |
| `RULE-RISK-018` | Истинны B2C-контекст (`b8_q1=yes` и также `b1_q3=b2c`) и `b8_q2=partial` | Указаны `b1_q3`, `b8_q1`, `b8_q2` | Совпадает |
| `RULE-RISK-019` | `b8_q3=yes` | Указан `b8_q3:yes` | Совпадает |

Результат: активны только ожидаемые `LEXR0-RISK-017`, `LEXR0-RISK-018`, `LEXR0-RISK-019`; 017 и 018 имеют `critical/high/blocking/immediate`, 019 — `medium/medium/significant/60_days`. Агрегация максимумом даёт `overallSeverity=critical`, распределение `critical=2`, `medium=1`.[1] [3] [4]

### 3.2. Overrides и evidence derivation

`OVERRIDE-TZ-13-2-04` истинно: B2C-контекст установлен, `b8_q2=partial`, а цели 017/018 активны. `OVERRIDE-TZ-13-2-06` независимо истинно по `b7_q4=yes` и применяется к активному риску 017. Оба override задают floor `high`, поэтому не повышают уже `critical` уровни, но должны сохраняться в trace; report делает это.[4]

`DERIVATION-EVIDENCE-001` теперь формально содержится в `rules_v1.engineContract`: для активного риска с catalog field `manualReviewRequired=true` он меняет только итоговый risk-block status с `questionnaire_based` на `manual_review_required`, сохраняя questionnaire refs, source question IDs, trace atoms и пустое document evidence. Поэтому statuses 017/018 `manual_review_required` и status 019 `questionnaire_based` детерминированы и корректно объяснены.[3] [4]

**Trace nuance, проверенная повторно.** `RULE-RISK-017.result.evidence.sourceQuestionIds` содержит оба возможных входа правила — `b7_q2` и `b7_q4`; это допустимый статический source set. Фактический trace для fixture при этом содержит только истинный атом `b7_q4:yes`. Для 018 конфигурация исправлена: source IDs теперь `b8_q1`, `b1_q3`, `b8_q2`, без прежнего ошибочного `b7_q2`.[4]

### 3.3. Recommendation и credit

После derivation список manual-review risks непуст (`017`, `018`). Поэтому первый применимый stop factor по priority — `STOP-REC-002`; расчёт стандартных package scores прекращается, результат имеет кардинальность 1 и `productCode=expert_review`. Report указывает именно этот selection rule и не создаёт вторую продуктовую рекомендацию.[7] [9]

Для `expert_review` mapping устанавливает `eligible=false`; `creditEntitlement=null` корректен. Fixture не содержит qualifying payment/access records, и report не создаёт entitlement, IDs, hashes или timestamps.[1] [7] [10]

## 4. Factual wording и отсутствие fabricated provenance

Точный текст `b7_q4` — «Есть ли споры, оспаривание платежей, массовые возвраты или претензии по оплате?». Положительный ответ не определяет, какой вариант реализовался, сколько было случаев, их суммы, текущий статус или наличие суда.[2]

Исправленный report последовательно использует ограниченную формулу: дан положительный ответ на объединённый вопрос; вид, количество, сумма, статус и суд не установлены. Он не называет событие активным или единичным платёжным спором. Открытые факты вынесены в document request и `TASK-B2C-0006`.[1] [2]

Report также не выдаёт roadmap за установленную обязанность немедленной переработки: действия по условиям, платёжной логике и UX поставлены после проверки документов, экранов и событий. Для риска 019 сначала требуется просмотр экранов, затем исправляются только подтверждённые проблемные элементы.[1]

Наконец, report не фабрикует provenance. Он прямо фиксирует отсутствие `answeredAt`, server identity, payment/access records и queue event. Полные config hashes относятся к воспроизводимости narrative и прямо не объявляются Report DTO integrity validation.[1] [9]

## 5. Повторная проверка правовых оснований и fixture allowlist

Fixture allowlist содержит ровно семь IDs: `LB-RU-ADS-38FZ`, `LB-RU-GK-309`, `LB-RU-GK-437`, `LB-RU-ZPP-10`, `LB-RU-ZPP-13-6`, `LB-RU-ZPP-16-1-4-2`, `LB-RU-ZPP-32`. Report использует только эти семь IDs; каждый разрешён соответствующим активным risk definition. Для 017 разрешены 10, 13(6), 309, 16.1(4.2), 32; для 018 — 10, 13(6), 437, 16.1(4.2), 32; для 019 — 10 и Advertising Law article 5.[1] [3] [5]

| Basis | Повторная правовая проверка | Итог |
|---|---|---|
| `LB-RU-ZPP-16-1-4-2` | Официальный текст № 376-ФЗ запрещает использовать для периодических платежей ранее предоставленные банковские реквизиты/данные электронного средства платежа, в отношении которых потребитель выразил исполнителю отказ, и требует обеспечить приём отказа, в том числе электронно. Закон действует с 01.03.2026.[12] [13] | **Корректно добавлен и ограничен.** Report не превращает норму в общий запрет автопродления и требует установить абонентский договор, интернет-канал, реквизиты, отказ и последующее использование именно этих реквизитов. |
| `LB-RU-ZPP-32` | Статья 32 закрепляет право отказаться от договора работ/услуг в любое время при оплате связанных с конкретным договором фактически понесённых расходов; официальный материал Роспотребнадзора подчёркивает их документальное подтверждение.[15] | **Корректно добавлен и отделён** от отказа от использования реквизитов, прекращения платежей и расчёта возврата. |
| `LB-RU-ZPP-13-6` | № 500-ФЗ добавил пункт 7: исключения связаны с виной потребителя; нарушением контрагента, кроме недобросовестного/неразумного выбора; досудебным медиативным соглашением, кроме неисполнения по вине обязанного лица. Изменение действует с 01.02.2026.[14] | **Корректно обновлён.** Report описывает пункт 6 только как условное судебное последствие и не прогнозирует взыскание или сумму. |
| `LB-RU-ZPP-10` | Уместная информационная рамка для потребительской услуги; сама по себе не доказывает дефект UX | Ограничение сохранено |
| `LB-RU-GK-309` | Общая рамка надлежащего исполнения, не специальный режим подписки | Ограничение сохранено |
| `LB-RU-GK-437` | Требует квалификации содержания предложения и существенных условий; официальный материал Роспотребнадзора также связывает оферту с содержанием предложения и акцептом.[16] | Ограничение сохранено |
| `LB-RU-ADS-38FZ` | Часть 7 статьи 5 относится к рекламе с отсутствующей существенной информацией, искажающей смысл и вводящей в заблуждение; ordinary transactional UX не является рекламой автоматически.[17] | Условная применимость сохранена |

**Юридический caveat.** Техническая и повторная содержательная сверка выполнена, но catalog entries остаются `draft_pending_legal_review`, а `reviewedByLawyer=false`. Настоящий ИИ-review не изменяет этот статус.[5]

## 6. Две обязательные очереди, document order и roadmap

По `ESCALATION-001` активные manual-review risks требуют `LEGAL-EXPERT-REVIEW`; по `ESCALATION-002` применённый override подтверждает тот же экспертный маршрут; по `ESCALATION-003` ответ `b7_q4=yes` добавляет `LEGAL-DISPUTE-REVIEW`. Новый aggregation contract дедуплицирует и лексикографически сортирует коды в `requiredQueueCodes`, не назначая primary queue. До фактического event схема и rules требуют `queueCode=null`, `queueEvent=null`, `status=required_not_routed`. Report воспроизводит эту модель и не заявляет фактическую маршрутизацию или SLA.[4] [9]

**Новая малозначительная note:** в таблице `reasonRuleIds` report не перечисляет `DERIVATION-EVIDENCE-001`. Это не ошибка: поле содержит причины escalation, а derivation меняет evidence status и отдельно присутствует в activated trace. `ESCALATION-001` срабатывает по активным catalog manual-review risks независимо от derivation.[1] [4]

Три document requests активны: `DOC-REQUEST-007`, `008`, `012`. У всех категорий максимальный supporting severity — critical, а минимальный supporting risk — 017; дальнейший tie-break по `baseTieBreakPriority` даёт `DOC-PAYMENTS-CONSUMER` (7) → `DOC-PAYMENT-INFRASTRUCTURE` (8) → `DOC-DISPUTES` (12). Report использует именно этот порядок.[4]

Roadmap теперь раздельно покрывает: disclosure; электронный отказ от использования реквизитов и его журналирование; прекращение использования отказных реквизитов для будущих периодических платежей; отказ от договора услуги; refund и подтверждённые расходы; уточнение фактов `b7_q4`; условные изменения day30; проверку UX day60; метрики day90. У каждого task есть owner, completion evidence и признак экспертной проверки. Remediation поставлена после factual verification.[1] [12] [15]

## 7. Narrative против schema-valid DTO

Round-1 blocker состоял не только в нехватке полей, но и в риске представить Markdown как полностью валидный immutable Report DTO. Исправленная версия решает presentation issue правильно: уже в первой оговорке файл назван `human-readable narrative projection` и прямо исключены статусы полного DTO, schema-valid snapshot, runtime artifact и подтверждённого queue event.[1]

Сам schema-level provenance gap остаётся фактом: `report_schema_v1` требует non-null `paymentAccessProvenance`, полную `identity`, server-persisted canonical answers с `answeredAt`, revisions и timestamps, renderer metadata и `integrity.passed`. Fixture этих данных не содержит.[1] [9] Поэтому этот Markdown **нельзя** и **не следует** валидировать как JSON instance. Report корректно не пытается этого делать и не заполняет пробелы вымышленными значениями.

Schema и rules при этом исправили прежний отдельный queue-model defect: появились `requiredQueueCodes`, `required_not_routed`, nullable `queueCode` и обязательный `queueEvent` для `queued` и последующих состояний. Это делает будущий DTO-контракт способным честно выразить две требуемые очереди и отсутствие фактической постановки.[4] [9]

Отдельная schema note: narrative limitations используют свободные категории `artifact scope`, `provenance`, `legal applicability`, тогда как DTO enum иной. Это не нарушение, поскольку файл прямо не является schema instance и не заявляет прямое поле-в-поле представление всех DTO objects.[1] [9]

## 8. Round-1 issue → status → evidence

| Round-1 ID | Severity round 1 | Status | Evidence round 2 |
|---|---|---|---|
| `LR-B2C-001` | blocker | **resolved** | Добавлен `LB-RU-ZPP-16-1-4-2` в fixture, risk catalog, legal-basis catalog и report; scope повторно подтверждён официальным текстом № 376-ФЗ.[1] [3] [5] [12] [13] |
| `LR-B2C-002` | blocker | **resolved for narrative; DTO prerequisite remains explicit** | Report больше не выдаётся за DTO и не фабрикует обязательные identity/timestamps/payment provenance. Schema теперь выражает две required queues. Полный DTO по-прежнему отсутствует и не заявлен.[1] [4] [9] |
| `LR-B2C-003` | major | **resolved** | `b7_q4=yes` описан как ответ на объединённый вопрос; вид, число, сумма, статус и суд не установлены.[1] [2] |
| `LR-B2C-004` | major | **resolved** | `OVERRIDE-TZ-13-2-06` включён в active trace, risk 017 и escalation reasons.[1] [4] |
| `LR-B2C-005` | major | **resolved** | `LB-RU-ZPP-13-6` и report учитывают все три группы исключений пункта 7; wording условный.[1] [5] [14] |
| `LR-B2C-006` | major | **resolved** | Для риска 017 activation ref только `b7_q4:1`; `b8_q2` обозначен только как контекст override 04. Source IDs 018 исправлены на `b8_q1`, `b1_q3`, `b8_q2`.[1] [4] |
| `LR-B2C-007` | major | **resolved** | Primary queue не назначается. `requiredQueueCodes` содержит обе очереди; до event — `required_not_routed`, `queueCode=null`.[1] [4] [9] |
| `LR-B2C-008` | major | **resolved** | Удалены «активный/действующий платёжный спор» и безусловная переработка; remediation условна.[1] |
| `LR-B2C-009` | major | **resolved** | `DERIVATION-EVIDENCE-001` формализует `questionnaire_based` → `manual_review_required` с сохранением provenance.[4] |
| `LR-B2C-010` | minor | **resolved** | Порядок: payments-consumer → payment-infrastructure → disputes.[1] [4] |
| `LR-B2C-011` | minor | **resolved** | Advertising Law применяется только при рекламном характере материала.[1] [5] [17] |
| `LR-B2C-012` | minor | **resolved** | Статьи 309/437 прямо названы общими рамками, не специальным режимом списания/отмены/возврата.[1] [5] [16] |
| `LR-B2C-013` | note | **preserved** | Exactly-one `expert_review`; `creditEntitlement=null`.[1] [7] [10] |
| `LR-B2C-014` | note | **preserved** | Нет гарантии результата, установленного нарушения, суммы санкции или прогноза спора.[1] |

## 9. Только реально остающиеся проблемы

| ID | Severity | Остающаяся проблема | Последствие / следующий шаг |
|---|---|---|---|
| `R2-B2C-N01` | note | Human legal approval не выполнен: report и все релевантные catalogs/configs сохраняют draft-статус, legal bases — `draft_pending_legal_review`.[1] [3] [4] [5] [7] [9] | Назначенный юрист должен отдельно подтвердить применимость, wording, version/checksums и зафиксировать approval record. |
| `R2-B2C-N02` | note | Не существует полного schema-valid JSON Report DTO/validation artifact для этого fixture: отсутствуют server identity, answer timestamps, payment/access provenance и renderer/integrity records.[1] [9] | Если нужен immutable DTO, сформировать его только из доказуемых серверных записей и провести Draft 2020-12/reference/checksum validation; не восстанавливать значения предположительно. |
| `R2-B2C-N03` | note | Заголовок/сценарий fixture и отдельные catalog titles/required actions всё ещё используют сокращение «платёжный спор» или «действующие платёжные споры», хотя corrected report осторожно не переносит эту формулу в factual conclusion.[1] [3] | Не является defect текущего report. При следующей версии конфигов желательно унифицировать metadata wording с дизъюнктивным `b7_q4`, чтобы downstream renderers не вернули старую категоричность. |

## 10. Заключение

Исправленный `LEXR0-GOLDEN-REPORT-004-V1` проходит второй независимый ИИ-review с verdict **`pass_with_notes`**. Round-1 blocker/major по отсутствующим специальным bases, статье 13(6)/(7), wording `b7_q4`, override 06, evidence derivation, двум очередям и schema presentation закрыты. Fixture allowlist, predicates, recommendation, document order и roadmap согласованы по ID; официальные правовые источники повторно открыты и подтверждают осторожные формулировки.[1] [3] [4] [5] [7] [9] [12] [13] [14] [15]

**Report готов к отдельному human legal review. Он не считается юридически утверждённым, schema-valid DTO, runtime record или разрешённым клиентским материалом.**

## References

[1]: ../../golden-reports/02-b2c-subscription-critical.md "Исправленный draft golden report LEXR0-GOLDEN-REPORT-004-V1"
[2]: ../../../../shared/legal-core/questionnaire_v2.json "Lexy questionnaire_v2, draft 1.0.0"
[3]: ../../../../shared/legal-core/risk_catalog_v1.json "Lexy risk_catalog_v1, draft 1.0.0"
[4]: ../../../../shared/legal-core/rules_v1.json "Lexy rules_v1, draft 1.0.0"
[5]: ../../../../shared/legal-core/legal_basis_catalog_v1.json "Lexy legal_basis_catalog_v1, draft 1.0.0"
[6]: ../02-b2c-subscription-critical-review.md "Первый раунд юридической проверки B2C golden report"
[7]: ../../../../shared/legal-core/recommendation_mapping_v1.json "Lexy recommendation_mapping_v1, draft 1.0.0"
[8]: ../round-1-summary.md "Сводка первого раунда юридической проверки draft golden reports Lexy"
[9]: ../../../../shared/report/report_schema_v1.json "Lexy report_schema_v1, Draft 2020-12"
[10]: ../../../../shared/billing/credit_policy_v1.json "Lexy credit_policy_v1, draft 1.0.0"
[11]: ../../../../fixtures/legal-core/v1/04-b2c-subscription-recurring.json "Fixture LEXR0-FIXTURE-004 — B2C-подписка и рекуррентные списания"
[12]: http://www.kremlin.ru/acts/bank/52488 "Федеральный закон от 15.10.2025 № 376-ФЗ, банк документов Президента России; доступ 2026-09-12"
[13]: http://publication.pravo.gov.ru/document/0001202510150009 "Федеральный закон от 15.10.2025 № 376-ФЗ, официальное опубликование; доступ 2026-09-12"
[14]: http://kremlin.ru/acts/bank/52788/print "Федеральный закон от 28.12.2025 № 500-ФЗ, банк документов Президента России; доступ 2026-09-12"
[15]: http://76.rospotrebnadzor.ru/directions_of_activi/protect/6480/ "Роспотребнадзор: право потребителя на отказ от договора работ или услуг по статье 32; доступ 2026-09-12"
[16]: https://zpp.rospotrebnadzor.ru/news/regional/573575 "Роспотребнадзор: публичная оферта, существенные условия и заключение договора; доступ 2026-09-12"
[17]: https://fas.gov.ru/publications/20367 "ФАС России: часть 7 статьи 5 Закона о рекламе и отсутствие существенной информации; доступ 2026-09-12"
