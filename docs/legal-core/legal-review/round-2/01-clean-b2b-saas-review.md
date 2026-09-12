# Второй независимый юридико-технический review draft golden report `01-clean-b2b-saas`

> **Report ID:** `LEXR0-GOLDEN-REPORT-001-V1`
> **Статус проверенного материала:** `draft_pending_legal_approval`
> **Дата review и повторного доступа к официальным источникам:** 12.09.2026
> **Характер review:** независимый ИИ-review; не является formal human legal approval, клиентским юридическим заключением или разрешением на runtime/client use.
> **Проверенная версия:** human-readable narrative projection одного fixture, а не JSON Report DTO Snapshot.[3] [4]

## 1. Verdict

**VERDICT: `pass_with_notes`.** В исправленных report, fixture и текущих конфигурациях не обнаружено остающихся `blocker` или `major`. Все три `major` из первого раунда — небезопасный отрицательный юридический вывод, ложный fallback и невалидная/неполная scoring trace — закрыты. Технический пересчёт даёт пустой набор активных risk IDs, профиль `low`, отсутствие escalation и единственный `start_product` со score `7`; применены `SCORE-SEGMENT-001`, `SCORE-SEGMENT-006`, `SCORE-GOAL-007`, а `FALLBACK-REC-001` не применён.[1] [5] [6]

Narrative теперь прямо отказывается от статуса полного или schema-valid DTO, не создаёт server identity, timestamps, payment/access provenance, checksums либо integrity event и сохраняет `creditEntitlement=null`.[3] [7] [8] Статус `draft_pending_legal_approval` сохранён. Поэтому **материал готов к следующему human legal review, но human approval не выполнен и не подразумевается настоящим verdict**.

| Gate | Результат round 2 |
|---|---|
| `blocker` | `0` |
| `major` | `0` |
| `minor` | `0` новых; только notes и governance limitations |
| Score / fallback | `start_product=7`; fallback не применяется |
| Fixture allowlist | `legalBasisSnapshots=[]` совпадает с `allowedLegalBasisIds=[]` |
| DTO / provenance | Честно обозначена narrative-проекция; provenance не фабрикуется |
| Credit | `creditEntitlement=null`; eligibility отделена от возникшего права |
| Human approval | **Не выполнен** |

## 2. Scope и метод

Сначала были прочитаны полный review первого раунда и его сводка, затем исправленный golden report, единственный fixture и текущие `questionnaire_v2`, `risk_catalog_v1`, `rules_v1`, `recommendation_mapping_v1`, `legal_basis_catalog_v1`, `report_schema_v1` и `credit_policy_v1`.[1]—[10] Исходные golden report, fixture, configs, schemas, README, index и round-1 files не изменялись.

Предикаты были пересчитаны независимо по ID декларативного AST. Отдельно проверены 33 canonical answers, состав active-core, 25 `RULE-RISK-*`, critical overrides, branch, consistency, follow-up, escalation и document-request rules. Нормализация сегментов/целей и recommendation score воспроизведены по mapping. Все три scoring ID проверены по regex `report_schema_v1`; контрольные суммы девяти перечисленных в narrative конфигураций пересчитаны и совпали.[1] [2] [5] [6] [7]

Для юридических утверждений повторно открыты официальные первичные источники, а не snippets: действующий официальный текст Федерального закона № 152-ФЗ у Президента России, официальная памятка Роскомнадзора для операторов, Постановление Пленума Верховного Суда № 10, официальный текст части четвёртой ГК РФ и страница ФНС о предоставлении сведений ЕГРЮЛ/ЕГРИП.[11]—[15]

## 3. Фактическое соответствие и безопасная отрицательная формула

Все 33 ключа `canonicalAnswers` fixture точно совпадают с 33 `activeCoreQuestionIds`; значения, используемые narrative, не выходят за содержание ответов. Маркировка `questionnaire_based` сохранена. Report отдельно оговаривает, что сведения об ООО, договорах, правах, документах, обработке данных и отсутствии заявленных споров не подтверждены документами, реестрами или инфраструктурой.[1] [2] [3]

Формула отрицательного результата исправлена безопасно: теперь report говорит, что **по имеющимся ответам детерминированные правила не активировали риск-индикаторы**, и прямо запрещает толкование этого результата как отсутствия юридических рисков, достаточности документов либо compliance. `completeness=complete` определена только как полнота ожидаемого active-core набора fixture, а `full` — только как автоматический формат, не сокращённый эскалацией.[3]

Это ограничение юридически обосновано. Федеральный закон № 152-ФЗ требует законной, целевой и соразмерной обработки персональных данных и определяет их через относимость к определённому или определяемому физическому лицу.[11] Роскомнадзор отдельно указывает обязанности уведомить до начала обработки с учётом закона, опубликовать политику, принять необходимые и достаточные меры, использовать российские базы при интернет-сборе и отвечать субъектам.[12] Поэтому ответы о политике, согласиях и хранении в России не подтверждают полный privacy-контур.

Пленум Верховного Суда разъясняет, что для служебного произведения требуется исследовать трудовые обязанности и обстоятельства создания; одно использование материалов работодателя недостаточно, а содержание обязанностей и создание в их пределах доказывает работодатель.[13] Часть четвёртая ГК РФ разграничивает авторство, исключительное право и договорные конструкции распоряжения правом.[14] Поэтому report правильно не превращает ответы о письменных договорах и передаче прав в подтверждённую цепочку исключительных прав. ФНС предоставляет официальные выписки ЕГРЮЛ/ЕГРИП, включая электронный документ с усиленной квалифицированной электронной подписью; анкета без такой проверки не подтверждает регистрацию конкретного ООО.[15]

| Проверка | Независимый результат | Alignment с report |
|---|---|---|
| Canonical answers | `33` | Совпадает |
| Active-core | `33`, exact set match | Совпадает; `complete` ограничен active-core |
| Active branch questions | `0` | Совпадает |
| `contractors` | Триггерный `b4_q1` отсутствует | Report не выводит отсутствие подрядчиков |
| Непроверенные самостоятельные входы | `b4_q4`, `b4_q5`, `b4_q8`, `b11_q3`, `b5_q5`, `b5_q7`, `b6_q3`, `b7_q3`, `b8_q3`, `b9_q3` и другие неактивные входы | Существенные области перечислены и ограничение сформулировано безопасно |
| Доказательность | Только `questionnaire_based` | `document_confirmed` не присвоен |

## 4. Пересчёт predicates и technical output по IDs

Пересчёт всех 25 базовых risk predicates дал `false`. Ни один critical override не применим к активному риску. Branch rules, consistency rules, follow-up rules, escalation rules и document-request rules не сработали. Итоговый набор `activeRiskIds=[]`, `leadRiskIds=[]`, flags `[]`; профиль `low` следует из `aggregationPolicy.emptyRiskSetResult`.[1] [6]

| Risk/rule IDs | Входы predicate | Результат |
|---|---|---|
| `RULE-RISK-001` → `LEXR0-RISK-001` | `b2_q1=ooo`, не `none` | `false` |
| `RULE-RISK-002` → `002` | `b2_q2=same` | `false` |
| `RULE-RISK-003` → `003` | `b2_q3=no`, `b2_q5=no`, `b11_q1=[employees]`, `b11_q4=no`, `b12_q1=no`; веточный `b12_q2` не нужен при ложном первом атоме | `false` |
| `RULE-RISK-004` → `004` | `b4_q2=all`, `b11_q2=yes` | `false` |
| `RULE-RISK-005` → `005` | `b4_q3=all`, `b2_q2=same` | `false` |
| `RULE-RISK-006` → `006` | `b4_q7=no`, `b12_q1=no`, `b12_q3=no` | `false` |
| `RULE-RISK-007` → `007` | `b4_q4`, `b4_q5`, `b4_q8` отсутствуют; missing atom → `false` | `false`, не отрицательное доказательство |
| `RULE-RISK-008` → `008` | `b11_q3` отсутствует | `false`, не отрицательное доказательство |
| `RULE-RISK-009` → `009` | `b5_q1=[name,email]`, `b10_q1=[none]` | `false` |
| `RULE-RISK-010` → `010` | `b5_q2=russia` | `false` |
| `RULE-RISK-011` → `011` | `b5_q3=yes`, `b5_q4=yes`; `b5_q5`, `b5_q7` отсутствуют | `false`, privacy-контур не подтверждён |
| `RULE-RISK-012` → `012` | `b5_q6=no`, `b12_q1=no`; `b12_q4` отсутствует | `false` |
| `RULE-RISK-013` → `013` | `b6_q1=[privacy,b2b_contract]`, не `none` | `false` |
| `RULE-RISK-014` → `014` | `b6_q2=current`; `b13_q1` отсутствует | `false` |
| `RULE-RISK-015` → `015` | `b6_q3` отсутствует | `false`, не отрицательное доказательство |
| `RULE-RISK-016` → `016` | `b7_q1=direct`; `b7_q3` отсутствует | `false` |
| `RULE-RISK-017` → `017` | `b7_q4=no`; `b7_q2` отсутствует; `b8_q2=yes` | `false` |
| `RULE-RISK-018` → `018` | `b1_q3=[b2b_small]`; `b8_q1` отсутствует; `b8_q2=yes` | `false` |
| `RULE-RISK-019` → `019` | `b8_q3` отсутствует | `false`, не отрицательное доказательство |
| `RULE-RISK-020` → `020` | `b3_q3=no`, `b3_q1=[b2b_contract]` | `false` |
| `RULE-RISK-021` → `021` | `b3_q2=[direct]`; `b9_q1`, `b9_q2` отсутствуют | `false` |
| `RULE-RISK-022` → `022` | `b9_q3` отсутствует | `false`, не отрицательное доказательство |
| `RULE-RISK-023` → `023` | `b1_q2=saas`, `b10_q1=[none]` | `false` |
| `RULE-RISK-024` → `024` | `b10_q1=[none]`, `b10_q2=yes` | `false` |
| `RULE-RISK-025` → `025` | `b12_q1=no`, `b12_q3=no`; `b10_q3`, `b12_q4` отсутствуют | `false` |

Fixture allowlist для risk output также согласован: `expectedForbiddenRiskIds` является точным множеством всех `LEXR0-RISK-001`—`025`, а `expectedActiveRiskIds=[]`. Report не превращает эту тестовую allow/forbid модель в юридический safe harbor.[1] [3] [4]

## 5. Recommendation: score `7`, SCORE IDs и fallback

Нормализация и scoring воспроизводятся без неоднозначности:

| Источник | Нормализованный код | Rule ID | `start_product` |
|---|---|---|---:|
| `b1_q2=saas` | segment `early_saas_b2b` | `SCORE-SEGMENT-001` | `+5` |
| `b1_q6=[goal_general]` | segment `general` | `SCORE-SEGMENT-006` | `+1` |
| `b1_q6=[goal_general]` | goal `general` | `SCORE-GOAL-007` | `+1` |
| **Итог** |  |  | **`7`** |

Другие standard candidates получают `0`. Stop factors не срабатывают, поскольку integrity error в narrative не заявлен как server input, active/manual-review/critical/override/escalation sets пусты, goal `expert_review` отсутствует и неизвестных risk IDs нет. После scoring существует положительный кандидат, поэтому условие fallback `no_positive_candidates` ложно; `FALLBACK-REC-001` не входит в trace.[1] [5] [6]

Три `SCORE-*` ID теперь реально существуют в `segmentBoosts`/`goalBoosts`, допускаются regex `$defs.ruleId`, допускаются `recommendation.selectionRuleIds` и представлены одинаково в narrative `activatedRules` и recommendation trace.[3] [5] [7] В полном DTO каждое значение `activatedRules` всё равно потребовало бы объект с version, source artifact, rule kind, stage, trace atoms и checksum; report не притворяется таким DTO и потому не фабрикует эти поля.[3] [7]

Exactly-one соблюдено: один объект `recommendation`, `cardinality=1`, `productCode=start_product`, schema enum `productKind=document_and_remediation_package`, mapping ID/version и три selection IDs. Возможность отдельно обратиться за консультацией не оформлена второй рекомендацией.[3] [5] [7]

## 6. Fixture allowlist и legal bases

Fixture задаёт `allowedLegalBasisIds=[]`; report содержит `legalBasisSnapshots=[]`. Ни одного basis ID, текста статьи, квалификации нарушения или суммы санкции в risk block не добавлено. Это **точное совпадение allowlist**.[1] [3]

Отсутствие snapshots не означает неприменимость закона; report прямо это оговаривает. Каталог `legal_basis_catalog_v1` остаётся `draft_pending_legal_approval`, а элементы — `draft_pending_legal_review`; его `checkedAt` не считается approval.[9] Внешние официальные источники используются только в настоящем review, чтобы проверить юридическую осторожность narrative, а не как fabricated basis snapshots внутри report.

| Legal-basis check | Результат |
|---|---|
| Fixture allowlist | `[]` |
| Report risk basis snapshots | `[]` |
| Несанкционированные basis IDs | Нет |
| Утверждение о нарушении | Нет |
| Санкции / прогноз исхода | Нет |
| Статус каталога повышен review-ом | Нет; остаётся draft |

## 7. Narrative, DTO schema, provenance и credit

Report исправил системную major-проблему round 1. Уже в заголовке он назван `human-readable narrative projection`, а не полным JSON Report DTO или schema-valid snapshot. Раздел 18 перечисляет отсутствующие server identity, answer timestamps, payment/access provenance, operational checksums и immutable write event и не заявляет schema/reference/integrity PASS.[3]

Это соответствует schema. Полный DTO требует обязательные `identity`, `checksums`, `sourceVersions`, timestamps canonical answers, non-null `paymentAccessProvenance`, renderer metadata и integrity со значениями `passed`/`committed_once`; этих доказуемых server records fixture не содержит.[1] [7] Report не вставляет фиктивные значения. Таблица hashes прямо названа справочной и признаёт отсутствие обязательных refs `reportTemplate` и `generator`; все девять показанных SHA-256 совпали с текущими файлами.[3]

`paymentAccessProvenance` честно обозначена как отсутствующая, без payment/access IDs, статуса, provider references, tariff snapshot или timestamps.[3] Формальное schema-поле при этом non-null; именно поэтому narrative не может быть schema instance.[7]

`creditEntitlement=null` является безопасным и schema-допустимым значением.[3] [7] Eligibility `start_product` описана отдельно и условно. Policy требует qualifying payment status `paid` или `promo_granted`, server payment/report provenance и отдельное immutable entitlement с ID, суммой, source IDs, `issuedAt`, `expiresAt` и status; таких данных нет.[8] Report не создаёт право, срок или provenance и правильно указывает `automaticRedemption=false` только как условное правило draft policy.

## 8. Round-1 issue → status → evidence

Таблица ниже охватывает **каждый** blocker/major первого review и clean-case major из round-1 summary.

| Round-1 issue | Severity R1 | Статус R2 | Evidence |
|---|---|---|---|
| `R-01` / summary `M-01`: фразы об отсутствии активных рисков были шире отрицательного rule output | `major` | **resolved** | §§1–2, 5–7, 9–10 и 17 report последовательно говорят о неактивации индикаторов **по имеющимся ответам**, отдельно запрещают вывод об отсутствии юридического риска и перечисляют непроверенные области.[3] Официальные источники подтверждают, что одних ответов о privacy/IP/регистрации недостаточно.[11]—[15] |
| `M-02`: `start_product` ошибочно назван fallback и score считался неположительным | `major` | **resolved** | Mapping даёт `5+1+1=7`; report показывает score `7` и прямо исключает fallback.[3] [5] |
| `M-03` / `S-01`: ложный `FALLBACK-REC-001`, не было schema-valid IDs обычного scoring | `major` | **resolved** | Mapping теперь содержит `SCORE-SEGMENT-001`, `SCORE-SEGMENT-006`, `SCORE-GOAL-007`; schema regex разрешает SCORE IDs; report использует одинаковый набор в `activatedRules` и `selectionRuleIds`.[3] [5] [7] |
| Summary `M-12` применительно к 001: Markdown представлялся schema-valid/ready/immutable без полного DTO | `major` | **resolved** | Report прямо отрицает статус DTO/snapshot, schema/integrity validation и immutable event, не фабрикует обязательные server fields.[3] [7] |
| Round-1 blockers для report 001 | `blocker` | **not applicable / none recorded** | Индивидуальный round-1 review зафиксировал `0` blockers. Системный summary `B-02` закрыт для narrative-представления честным отказом от DTO claim; полный DTO по-прежнему нельзя создать только из fixture, но report этого не заявляет.[3] [4] |

## 9. Notes, не являющиеся остающимися дефектами

1. **Human legal approval не выполнен.** `pass_with_notes` означает отсутствие выявленных blocker/major в проверенном draft narrative, но не изменяет статус report или конфигураций, не подтверждает клиентскую юридическую достаточность и не разрешает runtime use.
2. **Полный schema-valid DTO не существует в scope review.** Для него всё ещё требуются реальные server identity, answer timestamps, non-null payment/access provenance, complete source refs, renderer metadata, hashes и immutable validation event. Это корректно раскрыто как граница narrative, а не дефект narrative.[3] [7]
3. **Правовые основания каталога не утверждены.** Fixture не разрешает basis snapshots, поэтому эта проблема не образует дефект данного clean report; перед client/runtime use каталог и методология всё равно требуют human approval.[1] [9]
4. **`complete` и `full` остаются техническими терминами.** Их безопасные определения должны сохраняться во всех будущих рендерах и не сокращаться до клиентских формул «полная проверка» или «рисков нет».[3]

## 10. Только реально остающиеся проблемы

**Blockers: нет.**

**Major issues: нет.**

**Minor issues: нет новых.**

Остаются только вышеуказанные governance notes: необходимость human legal approval, отсутствие полного server DTO/validation artifact за пределами narrative и draft-статус конфигураций. Они уже честно раскрыты в report и не требуют исправления данного narrative для передачи человеку-юристу.

## 11. Финальное решение

Исправленный `LEXR0-GOLDEN-REPORT-001-V1` **готов к human legal review** как ограниченная narrative-проекция fixture. Он не готов и не утверждён для клиентского или runtime use. Verdict настоящего независимого ИИ-review — **`pass_with_notes`**, поскольку blocker и major отсутствуют, а все релевантные blocker/major первого раунда явно закрыты или не применялись.

> Настоящий review не является formal human legal approval. Report, fixture, configs и schemas сохраняют `draft_pending_legal_approval`; human approval считается невыполненным до отдельного документированного решения уполномоченного юриста.

## References

[1]: ../../../../fixtures/legal-core/v1/01-clean-b2b-saas.json "Fixture LEXR0-FIXTURE-001 — чистый B2B SaaS"

[2]: ../../../../shared/legal-core/questionnaire_v2.json "Draft questionnaire_v2 Lexy Release 0"

[3]: ../../golden-reports/01-clean-b2b-saas.md "Исправленный draft golden report 01-clean-b2b-saas"

[4]: ../01-clean-b2b-saas-review.md "Первый раунд юридической проверки draft golden report 01-clean-b2b-saas"

[5]: ../../../../shared/legal-core/recommendation_mapping_v1.json "Draft recommendation_mapping_v1 Lexy Release 0"

[6]: ../../../../shared/legal-core/rules_v1.json "Draft rules_v1 Lexy Release 0"

[7]: ../../../../shared/report/report_schema_v1.json "Draft report_schema_v1 Lexy Release 0"

[8]: ../../../../shared/billing/credit_policy_v1.json "Draft credit_policy_v1 Lexy Release 0"

[9]: ../../../../shared/legal-core/legal_basis_catalog_v1.json "Draft legal_basis_catalog_v1 Lexy Release 0"

[10]: ../round-1-summary.md "Сводка первого раунда юридической проверки draft golden reports Lexy"

[11]: http://www.kremlin.ru/acts/bank/24154 "Президент России — Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»"

[12]: https://rkn.gov.ru/activity/personal-data/for-operators/ "Роскомнадзор — обязанности операторов персональных данных"

[13]: https://www.vsrf.ru/files/27771/ "Верховный Суд Российской Федерации — Постановление Пленума от 23.04.2019 № 10 о применении части четвёртой ГК РФ"

[14]: http://pravo.gov.ru/proxy/ips/?docbody=&nd=102110716 "Официальный интернет-портал правовой информации — Гражданский кодекс Российской Федерации, часть четвёртая"

[15]: https://www.nalog.gov.ru/rn77/related_activities/registration_ip_yl/ "ФНС России — регистрация юридических лиц и предоставление сведений из ЕГРЮЛ/ЕГРИП"
