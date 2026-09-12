# Второй независимый юридико-технический review draft golden report `03-ai-cross-border-escalation`

> **Статус review:** `draft_pending_legal_approval`
> **Дата проверки и повторного доступа к официальным источникам:** 2026-09-12
> **Характер проверки:** независимый ИИ-review; не является формальным юридическим заключением, human legal approval или разрешением на клиентское/runtime-использование
> **Проверяемый report ID:** `LEXR0-GOLDEN-REPORT-006-V1`
> **Единственный фактический fixture:** `LEXR0-FIXTURE-006`

## 1. Verdict

**Verdict: `pass_with_notes`.**

Blocker- и major-дефекты первого раунда для этого отчёта **устранены**. Исправленная версия корректно позиционирует себя как человекочитаемая **narrative projection**, а не как schema-valid Report DTO; не материализует отсутствующие payment/access records, answer timestamps или queue event; сохраняет `draft_pending_legal_approval`; отделяет анкетный ответ `b5_q2=abroad` от юридически установленных локализации, трансграничной передачи и состава административного правонарушения.[1] [2] [10]

Повторная проверка официальных первичных источников подтверждает исправленные формулировки части 5 статьи 18, пункта 11 статьи 3, процедуры статьи 12 после Федерального закона от 26.07.2026 № 265-ФЗ и условной применимости частей 8 и 9 статьи 13.11 КоАП РФ.[12] [13] [14] [15] [16] [17] [18] [19] [20]

Остаются **два minor trace/presentation замечания**, не меняющие active risk, critical profile, required routes или единственную рекомендацию: в разделе 5 неполно перечислены нормализованные segment codes; в risk block использованы ссылки `b5_q2:1` и `b1_q4:1`, хотя fixture не содержит answer revisions и документ отдельно признаёт отсутствие индивидуальных answer metadata.[1] [2] [8] [10]

**Готовность:** материал готов к отдельному human legal review, но human approval **не выполнен**. Статус исходных артефактов повышать нельзя.[1] [2] [6] [7] [8] [9] [10]

## 2. Объём и метод повторной проверки

Сначала были изучены первый review и round-1 summary, затем актуальные report, fixture, questionnaire, rules, risk catalog, legal-basis catalog, recommendation mapping, report schema и credit policy.[1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11] Правовые тезисы повторно сверены не по поисковым snippets, а по открытым официальным страницам и полным текстам первичных актов: Федеральным законам № 152-ФЗ, № 266-ФЗ, № 23-ФЗ, № 265-ФЗ и № 405-ФЗ, официальному сообщению о № 420-ФЗ, сервисам Роскомнадзора и официальной публикации приказа Роскомнадзора № 128.[12] [13] [14] [15] [16] [17] [18] [19] [20]

Техническая часть включала самостоятельный проход по всем 25 risk predicates на 33 canonical answers, отдельную проверку critical override, evidence derivation, escalation rules, document request, recommendation stop-factor, fixture allowlist и SHA-256. Репозиторный валидатор `tools/validate-release-0.py` завершился `RELEASE 0 VALIDATION PASS`; этот результат подтверждает JSON Schema и межфайловые проверки конфигураций, но **не превращает Markdown в Report DTO и не является юридическим approval**.[21]

## 3. Пересчёт predicates, recommendation и trace по IDs

### 3.1. Canonical answers и risk activation

Fixture содержит **33** canonical answers. Все question IDs существуют в `questionnaire_v2`, а все выбранные option IDs допустимы для соответствующих вопросов. Повторная детерминированная оценка даёт ровно один активный риск — `LEXR0-RISK-010`; это совпадает с `expectedActiveRiskIds`. Риски `LEXR0-RISK-009`, `LEXR0-RISK-012` и `LEXR0-RISK-016`, указанные как forbidden, не срабатывают.[2] [5] [6]

| Стадия | ID | Истинный вход / условие | Результат | Сверка с report |
|---|---|---|---|---|
| Risk activation | `RULE-RISK-010` | `b5_q2=abroad` | Активен только `LEXR0-RISK-010`; catalog severity уже `critical` | Совпадает |
| Critical override | `OVERRIDE-TZ-13-2-03` | `b5_q2=abroad` | Применён флаг `critical_override_applied`; floor `high` не понижает исходный `critical` | Совпадает |
| Evidence derivation | `DERIVATION-EVIDENCE-001` | Для риска 010 `manualReviewRequired=true` | Итоговый статус risk block — `manual_review_required`; questionnaire provenance сохраняется, document confirmation не создаётся | Совпадает по существу |
| Escalation | `ESCALATION-001` | Critical/manual-review scenario | Требуется `LEGAL-EXPERT-REVIEW` | Совпадает |
| Escalation | `ESCALATION-002` | Установлен `critical_override_applied` | `preliminary_summary_only`, без fixed package; требуется `LEGAL-EXPERT-REVIEW` | Совпадает |
| Escalation | `ESCALATION-004` | Истинны как минимум `b1_q4=russia_international` и `b5_q2=abroad` | Требуется `LEGAL-CROSS-BORDER-REVIEW` | Совпадает |
| Document request | `DOC-REQUEST-005` | Активен риск 010 | `DOC-PERSONAL-DATA` | Совпадает |
| Recommendation | `STOP-REC-002` | `manualReviewRequiredRiskIds=[LEXR0-RISK-010]` | Немедленно и ровно одна рекомендация `expert_review`; scoring не выполняется | Совпадает |

Итоговые required routes после дедупликации и лексикографической сортировки: `LEGAL-CROSS-BORDER-REVIEW`, `LEGAL-EXPERT-REVIEW`. Исправленные rules и schema отдельно различают **требуемые маршруты** и **фактическую одиночную очередь**: до queue event корректны `status=required_not_routed`, `queueCode=null`, `queueEvent=null`. Именно эти значения использованы в отчёте.[1] [6] [10]

### 3.2. Recommendation и нормализация

`STOP-REC-002` имеет более высокий приоритет, чем scoring. Поэтому `expert_review`, `cardinality=1`, отсутствие второй рекомендации `data_and_infrastructure`, `fixedPackage=false` и `creditEntitlement=null` рассчитаны верно.[1] [7] [8] [11]

Обнаружена одна не влияющая на результат неполнота trace. По буквальному сопоставлению `sourceOptionRefs` fixture активирует segment codes `early_saas_b2b` через `b1_q2:saas` **и** `general` через `b1_q6:goal_general`; goal code — `general`. В отчёте указано только `general / general`.[1] [2] [8] Поскольку `STOP-REC-002` завершает выбор до scoring, ошибка не изменяет `productCode`, но строку следует уточнить для полного воспроизводимого trace.

### 3.3. Fixture allowlist

Четыре использованных основания — `LB-RU-PD-152FZ-18-5`, `LB-RU-PD-152FZ-12`, `LB-RU-PD-152FZ-3-11`, `LB-RU-ADMIN-13-11` — полностью совпадают с `fixture.allowedLegalBasisIds` и `risk_catalog_v1.riskDefinitions[LEXR0-RISK-010].allowedLegalBasisIds`. Посторонних legal basis IDs в risk block нет.[1] [2] [7] [9]

## 4. Повторная проверка правовых оснований

### 4.1. Часть 5 статьи 18 Федерального закона № 152-ФЗ

Федеральный закон от 28.02.2025 № 23-ФЗ изложил часть 5 статьи 18 в запретительной редакции: при сборе персональных данных граждан Российской Федерации не допускаются перечисленные операции с использованием баз за пределами Российской Федерации, кроме случаев из пунктов 2, 3, 4 и 8 части 1 статьи 6. Закон вступил в силу 01.07.2025.[12] [13]

Исправленные catalog и report точно отражают: гражданство субъектов; факт и момент сбора; запись, систематизацию, накопление, хранение, уточнение и извлечение; местонахождение используемых баз; исключения. Отчёт также верно указывает, что часть 5 статьи 18 не является полным запретом любой зарубежной инфраструктуры и не тождественна статье 12.[1] [9] **Round-1 major `L-01` / summary `M-08`: resolved.**

### 4.2. Определение пункта 11 статьи 3

Пункт 11 статьи 3 определяет трансграничную передачу как передачу персональных данных на территорию иностранного государства иностранному органу власти, иностранному физическому либо юридическому лицу.[14]

Catalog теперь выделяет самостоятельный ID `LB-RU-PD-152FZ-3-11`, а report не выводит передачу из одного лишь зарубежного хранения или местонахождения сервера.[1] [9] **Часть round-1 major `L-02` / summary `M-09`, связанная со смешением definition и procedure: resolved.**

### 4.3. Процедура статьи 12 после Федерального закона № 265-ФЗ

Действующая процедура требует отдельного уведомления Роскомнадзора **до начала деятельности** по трансграничной передаче. Уведомление не заменяется уведомлением по статье 22 и включает оператора, ответственное лицо, цель и основание, категории и перечень данных, категории субъектов, страны и дату оценки получателей. До подачи уведомления оператор получает сведения о получателях, их мерах защиты, условиях прекращения обработки, контактах, а для получателя под юрисдикцией государства вне перечня — сведения о правовом регулировании этого государства.[15] [16]

Для государств из перечня после уведомления действует возможность начать передачу до решения об ограничении или запрете. Для государств вне перечня действует общее ожидание предусмотренного законом срока рассмотрения, кроме случая защиты жизненно важных интересов. Роскомнадзор отдельно разъясняет обязанность уведомить до начала деятельности и десятидневный режим для государств без адекватной защиты.[16] [17]

Федеральный закон от 26.07.2026 № 265-ФЗ, вступивший в силу в относящейся к статье 12 части со дня официального опубликования, изменил критерий включения государств в перечень и удалил отдельные ссылки на государства — стороны Конвенции из частей 5, 10 и 11. Исправленные catalog и report прямо фиксируют эту актуализацию.[18] [19]

Document request и roadmap теперь отдельно охватывают data-flow, country/recipient register, копию отдельного уведомления и его статус, сведения от recipients, меры защиты, условия прекращения обработки, актуальный статус страны, режим начала передачи и решения Роскомнадзора. Remediation поставлен после factual/legal qualification.[1] [9] **Round-1 major `L-02`, `L-03` / summary `M-09`, `M-10`: resolved.**

Приказ Роскомнадзора от 05.08.2022 № 128 официально опубликовал перечень государств; отчёт не фиксирует конкретную страну как включённую и требует проверять статус на дату квалификации, что безопасно при неизвестных странах fixture.[1] [2] [23]

### 4.4. Части 8 и 9 статьи 13.11 КоАП РФ

Федеральный закон от 02.12.2019 № 405-ФЗ ввёл часть 8 статьи 13.11 о невыполнении локализационной обязанности при сборе персональных данных граждан Российской Федерации и часть 9 о повторном правонарушении.[20] Федеральный закон от 30.11.2024 № 420-ФЗ добавил и изменил иные части статьи 13.11, но не превращает нарушение процедуры статьи 12 автоматически в состав частей 8 или 9.[22]

Report и catalog теперь используют части 8/9 только условно, не называют размер санкции, не устанавливают событие, субъект, вину или повторность и не смешивают локализацию с процедурой трансграничной передачи.[1] [9] **Round-1 minor `L-04` / summary `m-05`: resolved.**

## 5. Abroad limitations, notification/recipient roadmap и wording

Report последовательно ограничивает значение `b5_q2=abroad`: оно не доказывает гражданство субъектов, первичный сбор, использование иностранной базы на конкретной операции, иностранного recipient, предоставление доступа, трансграничную передачу, нарушение или состав КоАП.[1] [2] Это соответствует границам части 5 статьи 18 и пункта 11 статьи 3.[12] [13] [14] **Round-1 `F-02` и summary `M-11`: resolved.**

Операционные последствия сформулированы как условные planning scenarios, а не прогноз блокировки, решения Роскомнадзора или суда. Конкретное изменение архитектуры допускается лишь после подтверждения фактов и утверждения remediation plan.[1] **Round-1 `L-05` и summary `M-13`: resolved.**

AI wording исправлен корректно. Отчёт утверждает только, что AI-функциональность продукта не установлена fixture и языковая модель не является входом детерминированной активации риска или выбора рекомендации. Он не утверждает, что LLM вообще не использовалась при создании narrative, и переносит AI-вопрос в limitations/follow-up.[1] [6] [8] **Round-1 `F-05`, `S-02` и summary `m-07`: resolved.**

## 6. Schema, provenance, queues и статус draft

Вводная прямо и недвусмысленно говорит, что Markdown — narrative projection одного fixture, а не Report DTO, JSON Schema validation result, immutable snapshot, runtime artifact или queue proof.[1] Это снимает прежнее ложное представление о `ready`/immutable DTO.

Report не материализует обязательный для полного DTO `paymentAccessProvenance`, не создаёт отсутствующие payment/access IDs, timestamps, tariff snapshot, provider references или canonical-answer timestamps. Такое решение корректно именно для narrative projection; полный DTO по текущей schema без фактических server records по-прежнему создать нельзя.[1] [2] [10]

Open AI question удалён из factual inputs. Все строки factual-input таблицы имеют answer refs на реально существующие ответы fixture. Legal-basis presentation явно остаётся narrative; она не выдаётся за массив полных `legalBasisSnapshots`.[1] [2] [10]

Queue semantics исправлены в rules и schema: `requiredQueueCodes` содержит обе требуемые очереди, `queueCode` обозначает только фактическую одиночную очередь, а `queued` и последующие статусы требуют `queueEvent`. Report использует `required_not_routed`, `null`, `null`.[1] [6] [10]

Полные SHA-256 в разделе 15 совпадают с текущими девятью файлами. Сам отчёт правильно ограничивает их значением source provenance и не называет checksum полного DTO или доказательством `integrity.passed`.[1]

Все проверенные артефакты сохраняют `draft_pending_legal_approval`; `legal_basis_catalog_v1` дополнительно сохраняет `verificationStatus=draft_pending_legal_review`. Human approval не заявлен.[1] [2] [5] [6] [7] [8] [9] [10] [11]

## 7. Round 1 issue → status → evidence

В round 1 для этого отчёта blockers не было. Каждый blocker/major и остальные зарегистрированные пункты проверены повторно.[3] [4]

| Round-1 ID | Статус round 2 | Evidence |
|---|---|---|
| `L-01` **major** | **resolved** | `LB-RU-PD-152FZ-18-5` и §7 report воспроизводят запретительную редакцию с 01.07.2025, операции и исключения.[1] [9] [12] [13] |
| `L-02` **major** | **resolved** | Definition вынесено в `LB-RU-PD-152FZ-3-11`; `LB-RU-PD-152FZ-12` описывает procedure и № 265-ФЗ.[1] [9] [14] [18] |
| `L-03` **major** | **resolved** | §8 и roadmap содержат отдельное уведомление, countries, recipients, часть 5 статьи 12, статус страны, режим начала и решения Роскомнадзора.[1] [15] [16] [17] [18] [19] |
| `L-04` minor | **resolved** | Указаны части 8 и 9; состав и повторность не приписаны fixture.[1] [20] [22] |
| `L-05` minor | **resolved** | §9 прямо исключает прогноз органа/суда и ставит последствия под factual/remediation gates.[1] |
| `L-06` note | **confirmed** | Категоричного нарушения, гарантии результата и неподтверждённых санкций нет.[1] |
| `F-01` note | **confirmed** | Повторный расчёт: только риск 010, `critical`, две required queues.[2] [6] [7] |
| `F-02` minor | **resolved** | `abroad` последовательно ограничен до анкетного ответа; гражданство, сбор, recipient и transfer остаются открытыми.[1] |
| `F-03` minor | **resolved** | ТЗ названо внутренним продуктовым правилом, а не нормой права.[1] |
| `F-04` minor | **resolved** | Для `contractors` указано `disabled_in_release`, без отрицательного вывода о подрядчиках.[1] [5] |
| `F-05` minor | **resolved** | AI/LLM wording ограничен детерминированным calculation и открытым фактом продукта.[1] [6] [8] |
| `S-01` **major** | **resolved** | Report больше не заявляет `ready`, immutable или schema-valid DTO; маркировка narrative находится в первой вводной.[1] |
| `S-02` **major** | **resolved** | AI open question исключён из factual inputs и находится в limitations.[1] [10] |
| `S-03` **major** | **resolved at presentation layer** | `paymentAccessProvenance` не материализован и не сфабрикован; документ не назван полным DTO.[1] [2] [10] |
| `S-04` **major** | **resolved** | `requiredQueueCodes` отделены от factual `queueCode`; до event используется `required_not_routed`.[1] [6] [10] |
| `S-05` **major** | **resolved at presentation layer** | Narrative не выдаёт таблицу за schema `legalBasisSnapshots`; catalog version/status и источники показаны с citations.[1] [9] [10] |
| `S-06` minor | **resolved** | Приведены полные совпадающие SHA-256; scope ограничен provenance исходников, без `integrity.passed`.[1] |
| `R-01` note | **confirmed** | Evidence, roadmap, exactly-one `expert_review` и `creditEntitlement=null` соответствуют текущим конфигам.[1] [6] [7] [8] [9] [10] [11] |

### 7.1. Связанные consolidated issues из round-1 summary

| Summary ID | Статус | Evidence |
|---|---|---|
| `M-06` — multiple queues / `queued` | **resolved** | Rules и schema ввели `requiredQueueCodes`, `required_not_routed` и обязательный queue event для `queued+`; report следует модели.[1] [6] [10] |
| `M-08` — часть 5 статьи 18 | **resolved** | Актуальная редакция и ограничения отражены.[1] [9] [12] [13] |
| `M-09` — definition/procedure и № 265-ФЗ | **resolved** | Отдельные IDs и актуальная процедура.[1] [9] [14] [18] [19] |
| `M-10` — notification/recipient roadmap | **resolved** | §8 и tasks `TASK-XB-0002`, `0003`, `0030-B` закрывают обязательные предметы проверки.[1] |
| `M-11` — чрезмерный вывод из `abroad` | **resolved** | Все юридически значимые обстоятельства сохранены как open facts.[1] |
| `M-12` — DTO/schema presentation | **resolved for this narrative report** | Документ явно не DTO и не validation artifact; provenance не выдуман.[1] [10] |
| `M-13` — преждевременная remediation / прогноз | **resolved** | Сначала qualification, затем утверждённый change plan; последствия условны.[1] |

## 8. Только реально остающиеся проблемы

| ID | Severity | Тип | Проблема | Требуемая точечная правка |
|---|---|---|---|---|
| `R2-T-01` | **minor** | recommendation trace | Строка `Normalized segment / goal` указывает `general / general`, но fixture и mapping дают segment codes `early_saas_b2b` и `general`, goal code `general`. Stop-factor `STOP-REC-002` делает расхождение не влияющим на рекомендацию.[1] [2] [8] | Заменить строку на `segments=[early_saas_b2b, general]; goals=[general]` либо явно сказать, что нормализация не используется после stop-factor. |
| `R2-P-01` | **minor** | provenance presentation | В §6 указаны questionnaire refs `b5_q2:1`, `b1_q4:1`, хотя fixture не содержит answer revision, а §3 отдельно признаёт отсутствие индивидуальных answer metadata. Для narrative фактические question/option refs подтверждены, но суффикс `:1` создаёт двусмысленность о несуществующей revision.[1] [2] [10] | Использовать подтверждённые refs `b5_q2:abroad`, `b1_q4:russia_international` или голые question IDs; revision добавлять только из server-persisted answer object. |

**Других остающихся blocker, major или новых юридических дефектов в проверенном scope не выявлено.** Два minor не препятствуют передаче на human review, но должны быть устранены до утверждения финальной эталонной формулировки.

## 9. Итоговый вывод

**`pass_with_notes`** допустим, поскольку не осталось blocker или major. Исправленная narrative воспроизводит fixture и rules, использует только разрешённые legal bases, корректно разводит часть 5 статьи 18 и статью 12, учитывает № 265-ФЗ, осторожно описывает части 8/9 статьи 13.11 КоАП, не фабрикует операционную очередь или payment/access provenance и сохраняет draft-статус.[1] [2] [6] [7] [8] [9] [10] [12] [13] [14] [15] [16] [17] [18] [19] [20]

**Ready for human review: yes. Human legal approval completed: no.** До отдельного решения уполномоченного человека-юриста report и все связанные конфигурации остаются `draft_pending_legal_approval`.

## References

[1]: file:///home/ubuntu/Neolex/docs/legal-core/golden-reports/03-ai-cross-border-escalation.md "Исправленный draft golden report LEXR0-GOLDEN-REPORT-006-V1; доступ 2026-09-12"

[2]: file:///home/ubuntu/Neolex/fixtures/legal-core/v1/06-cross-border-infrastructure.json "Fixture LEXR0-FIXTURE-006; доступ 2026-09-12"

[3]: file:///home/ubuntu/Neolex/docs/legal-core/legal-review/03-ai-cross-border-escalation-review.md "Первый раунд review отчёта 006; доступ 2026-09-12"

[4]: file:///home/ubuntu/Neolex/docs/legal-core/legal-review/round-1-summary.md "Сводка первого раунда юридической проверки Lexy; доступ 2026-09-12"

[5]: file:///home/ubuntu/Neolex/shared/legal-core/questionnaire_v2.json "Lexy questionnaire_v2; доступ 2026-09-12"

[6]: file:///home/ubuntu/Neolex/shared/legal-core/rules_v1.json "Lexy rules_v1 после remediation; доступ 2026-09-12"

[7]: file:///home/ubuntu/Neolex/shared/legal-core/risk_catalog_v1.json "Lexy risk_catalog_v1 после remediation; доступ 2026-09-12"

[8]: file:///home/ubuntu/Neolex/shared/legal-core/recommendation_mapping_v1.json "Lexy recommendation_mapping_v1 после remediation; доступ 2026-09-12"

[9]: file:///home/ubuntu/Neolex/shared/legal-core/legal_basis_catalog_v1.json "Lexy legal_basis_catalog_v1 после remediation; доступ 2026-09-12"

[10]: file:///home/ubuntu/Neolex/shared/report/report_schema_v1.json "Lexy report_schema_v1 после remediation; доступ 2026-09-12"

[11]: file:///home/ubuntu/Neolex/shared/billing/credit_policy_v1.json "Lexy credit_policy_v1; доступ 2026-09-12"

[12]: http://publication.pravo.gov.ru/document/0001202502280034 "Официальное опубликование Федерального закона от 28.02.2025 № 23-ФЗ; доступ 2026-09-12"

[13]: http://www.kremlin.ru/acts/bank/51683/page/1 "Президент России: Федеральный закон от 28.02.2025 № 23-ФЗ, новая редакция части 5 статьи 18; доступ 2026-09-12"

[14]: http://www.kremlin.ru/acts/bank/24154 "Президент России: Федеральный закон от 27.07.2006 № 152-ФЗ, пункт 11 статьи 3; доступ 2026-09-12"

[15]: http://publication.pravo.gov.ru/Document/View/0001202207140080 "Официальное опубликование Федерального закона от 14.07.2022 № 266-ФЗ, процедура статьи 12; доступ 2026-09-12"

[16]: https://pd.rkn.gov.ru/cross-border-transmission/form2/ "Роскомнадзор: уведомление о намерении осуществлять трансграничную передачу персональных данных; доступ 2026-09-12"

[17]: https://pd.rkn.gov.ru/cross-border-transmission/ "Роскомнадзор: порядок трансграничной передачи и десятидневный режим; доступ 2026-09-12"

[18]: http://publication.pravo.gov.ru/document/0001202607260024 "Официальное опубликование Федерального закона от 26.07.2026 № 265-ФЗ; доступ 2026-09-12"

[19]: http://kremlin.ru/acts/news/80355 "Президент России: уточнение законодательства о трансграничной передаче Федеральным законом № 265-ФЗ; доступ 2026-09-12"

[20]: http://kremlin.ru/acts/bank/44887 "Президент России: Федеральный закон от 02.12.2019 № 405-ФЗ, части 8 и 9 статьи 13.11 КоАП РФ; доступ 2026-09-12"

[21]: file:///home/ubuntu/Neolex/tools/validate-release-0.py "Репозиторный валидатор Release 0; запуск 2026-09-12: PASS"

[22]: http://www.kremlin.ru/acts/bank/51388/ "Президент России: Федеральный закон от 30.11.2024 № 420-ФЗ, изменения статьи 13.11 КоАП РФ; доступ 2026-09-12"

[23]: http://publication.pravo.gov.ru/Document/View/0001202209200008 "Официальное опубликование приказа Роскомнадзора от 05.08.2022 № 128 о перечне иностранных государств; доступ 2026-09-12"
