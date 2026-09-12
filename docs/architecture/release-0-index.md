# Lexy Release 0: индекс архитектурной фиксации

**Release ID:** `lexy-r0-2026-09-12`
**Версия:** `1.0.0-draft.1`
**Действует с:** не установлено (`effectiveFrom=null`)
**Действует до:** не установлено (`effectiveTo=null`)
**Автор обновления:** Manus AI
**Дата обновления:** `2026-09-12T18:40:24Z`
**Исходный commit:** `78e2f89e99340a403ce389eada223da6bf336676`
**Статус юридических конфигураций:** `draft_pending_legal_approval`

> **Критическое предупреждение.** Клиентский доступ не закрыт по решению владельца. Выявленные P0-риски доступа остаются. Release 0 означает только архитектурную фиксацию и **не означает launch readiness**, готовность Release 1 или разрешение использовать черновое юридическое ядро в клиентском результате.

## 1. Итог review

После технического review и первого экспертного ИИ-review трёх golden reports исправлены внутренние расхождения. Clean-case теперь трассируется обычным scoring `5+1+1=7`; `FALLBACK-REC-001` применяется только при отсутствии положительных кандидатов. Для manual-review рисков формализован evidence derivation, а несколько обязательных очередей сохраняются в `requiredQueueCodes` до фактического queue event. B2C и privacy legal bases актуализированы по официальным редакциям 2025–2026 годов. Runtime-маршруты, React, схема БД, PDF и действующая бизнес-логика не менялись.

**Нормативное требование.** §30.2 ТЗ требует до основной разработки зафиксировать state machines, матрицу доступа, миграцию, тарифы, шесть конфигураций юридического ядра, три эталонных отчёта, 12–15 fixtures, файловую политику, перечень клиентских формулировок и инвентарь сервисных аккаунтов, переменных окружения и секретов.[1]

**Проектное решение.** В Release 0 подготовлены только документы, JSON-конфигурации, JSON Schema, fixtures, draft golden reports и локальный валидатор. Секретные значения не записывались. Все правовые тексты, основания, правила, отчётные формулировки и golden reports остаются черновиками до отдельного решения уполномоченного юриста.

**Открытый вопрос.** Формальная приёмка Release 0 по §31.2 невозможна до юридического рассмотрения трёх golden reports и согласования state machines, матрицы доступа и миграционного плана. Техническое прохождение проверок не заменяет эти решения.

## 2. Статусы gate

| Gate | Предмет проверки | Результат review | Статус |
|---|---|---|---|
| `R0-G01` | Область изменений | В рабочем дереве нет изменений отслеживаемых runtime-файлов. Добавлены только разрешённые документы, конфигурации, схемы, fixtures, draft reports и валидатор. Git commit не создавался. | **PASS** |
| `R0-G02` | Полнота §30.2 | Все категории обязательных артефактов существуют; полный manifest приведён ниже. | **PASS — техническая комплектность** |
| `R0-G03` | Шесть конфигураций | Созданы `questionnaire_v2`, `risk_catalog_v1`, `rules_v1`, `legal_basis_catalog_v1`, `recommendation_mapping_v1`, `report_schema_v1`; схемы структуры валидны. | **PASS — структура; legal approval pending** |
| `R0-G04` | Метаданные релиза | Проверены `releaseId`, `version`, даты действия, автор, время, source commit и draft-статус. | **PASS** |
| `R0-G05` | Анкета и Pilot | Анкета содержит ровно 63 вопроса. Pilot содержит ровно 33 core и 6 branch-вопросов; идентификаторы и варианты исходной v1 сохранены. | **PASS** |
| `R0-G06` | Каталог рисков и правила | В каталоге ровно 25 рисков. Есть ровно 25 базовых risk rules; каждый риск покрыт одним базовым правилом. Critical override, branch, consistency, follow-up, escalation и document-request правила структурно проверены. | **PASS — техническая связность; legal approval pending** |
| `R0-G07` | Ссылочная целостность | Существуют все ссылки rules на question/option/risk IDs, ссылки рисков и fixtures на legal basis, phrases, products и report sections. | **PASS** |
| `R0-G08` | Fixtures | Существуют ровно 15 fixture-файлов и manifest; ссылки валидны, идентификаторы уникальны, SHA-256 manifest совпадают. | **PASS — техническая связность; oracle pending legal approval** |
| `R0-G09` | Golden reports | Существуют ровно три draft golden reports и README; первый экспертный ИИ-review выполнен, blocker/major-remediation внесена. | **PASS — наличие и remediation; BLOCKED — human legal approval** |
| `R0-G10` | JSON и JSON Schema | Все 30 проверяемых JSON-файлов синтаксически валидны и завершаются LF. Пять конфигураций валидированы своими схемами; `report_schema_v1` проходит проверку Draft 2020-12. | **PASS** |
| `R0-G11` | Новые клиентские и отчётные формулировки | Автоматическая проверка не выявила запрещённых обещаний юридической полноты, законности или состоявшегося юридического одобрения. | **PASS** |
| `R0-G12` | Юридический статус metadata | В юридических конфигурациях и отчётных артефактах отсутствуют metadata-статусы, объявляющие юридическое одобрение; установлен `draft_pending_legal_approval`. | **PASS** |
| `R0-G13` | State machines | Пять обязательных machines и экспертная эскалация описаны как target contract; runtime не изменён. | **PASS — документ создан; BLOCKED — согласование** |
| `R0-G14` | Матрица доступа | Целевая deny-by-default матрица и временное P0-исключение описаны. Текущий доступ намеренно не закрыт в этой задаче. | **PASS — документ создан; P0 OPEN** |
| `R0-G15` | Миграция v1 → v2 | Описаны expand/backfill/claim/quarantine/reconciliation/rollback и запрет угадывать owner по email. | **PASS — план создан; BLOCKED — согласование** |
| `R0-G16` | Формальная приёмка Release 0 | Критерии §31.2 требуют юридического утверждения golden reports и согласования state/access/migration. Эти решения не заявлены выполненными. | **BLOCKED** |
| `R0-G17` | Launch readiness | Доступ по legacy bearer-token модели и иные P0 остаются; защищённый путь Release 1 не реализован и не тестировался. | **NOT READY** |

## 3. Manifest файлов

Статус **«draft»** означает, что файл создан и технически проверен, но не считается юридически утверждённым или введённым в действие. Статус **«schema»** означает техническую схему, которая не подтверждает корректность правового содержания.

### 3.1. Архитектура, безопасность, данные и эксплуатация

| Путь | Назначение | Статус |
|---|---|---|
| `docs/architecture/release-0-index.md` | Сводный manifest, gate-статусы и открытые решения | reviewed draft |
| `docs/architecture/state-machines-v1.md` | Статусы диагностики, доступа, документа, отчёта, email и эскалации | reviewed draft; согласование ожидается |
| `docs/security/access-matrix-v1.md` | Роли, ресурсы, owner/admin/service policy и P0-исключение | reviewed draft; P0 открыт |
| `docs/migrations/v1-to-v2.md` | План v1 → v2 без потери данных, claim/quarantine/reconciliation/rollback | reviewed draft; согласование ожидается |
| `docs/architecture/payment-model-v1.md` | Payment/access/credit target model и границы релизов | reviewed draft |
| `docs/data/file-retention-policy-v1.md` | MIME, лимиты, quarantine, retention, deletion и backup policy | reviewed draft; privacy/legal decisions открыты |
| `docs/operations/environment-and-service-accounts-v1.md` | Инвентарь env и service identities без значений секретов | reviewed draft |

### 3.2. Billing и юридическое ядро

| Путь | Назначение | Статус |
|---|---|---|
| `shared/billing/tariffs_v1.json` | Тарифы и price snapshots | valid draft |
| `shared/billing/credit_policy_v1.json` | Право на зачёт 6 900 RUB и срок 14 дней | valid draft |
| `shared/legal-core/questionnaire_v2.json` | Полные 63 вопроса и Pilot 33 core + 6 branch | valid; `draft_pending_legal_approval` |
| `shared/legal-core/risk_catalog_v1.json` | 25 определений рисков | valid; `draft_pending_legal_approval` |
| `shared/legal-core/rules_v1.json` | Детерминированные правила и overrides | valid; `draft_pending_legal_approval` |
| `shared/legal-core/legal_basis_catalog_v1.json` | 35 проектов правовых оснований | valid; `draft_pending_legal_approval` |
| `shared/legal-core/recommendation_mapping_v1.json` | Детерминированный выбор одного следующего продукта | valid; `draft_pending_legal_approval` |
| `shared/legal-core/approved_phrases_v1.json` | Проект перечня допустимых формулировок; имя файла не означает одобрение | valid; `draft_pending_legal_approval` |
| `shared/report/report_schema_v1.json` | JSON Schema immutable report snapshot | valid schema; `draft_pending_legal_approval` |

### 3.3. JSON Schema

| Путь | Назначение | Статус |
|---|---|---|
| `shared/legal-core/schemas/questionnaire.schema.json` | Схема `questionnaire_v2` | valid schema |
| `shared/legal-core/schemas/risk-catalog.schema.json` | Схема `risk_catalog_v1` | valid schema |
| `shared/legal-core/schemas/rules.schema.json` | Схема `rules_v1` | valid schema |
| `shared/legal-core/schemas/legal-basis.schema.json` | Схема `legal_basis_catalog_v1` | valid schema |
| `shared/legal-core/schemas/recommendation-mapping.schema.json` | Схема `recommendation_mapping_v1` | valid schema |

### 3.4. Fixtures

| Путь | Назначение | Статус |
|---|---|---|
| `fixtures/legal-core/manifest.json` | Manifest 15 fixtures, report sections и SHA-256 | valid draft |
| `fixtures/legal-core/v1/01-clean-b2b-saas.json` | Чистый B2B SaaS | valid draft oracle |
| `fixtures/legal-core/v1/02-b2b-saas-external-developers.json` | Внешние разработчики B2B SaaS | valid draft oracle |
| `fixtures/legal-core/v1/03-b2c-one-time-payment.json` | B2C с разовой оплатой | valid draft oracle |
| `fixtures/legal-core/v1/04-b2c-subscription-recurring.json` | B2C-подписка | valid draft oracle |
| `fixtures/legal-core/v1/05-ai-service-user-content.json` | AI-сервис и пользовательский контент | valid draft oracle |
| `fixtures/legal-core/v1/06-cross-border-infrastructure.json` | Трансграничная инфраструктура | valid draft oracle |
| `fixtures/legal-core/v1/07-marketplace.json` | Marketplace | valid draft oracle |
| `fixtures/legal-core/v1/08-white-label-reseller.json` | White-label/reseller | valid draft oracle |
| `fixtures/legal-core/v1/09-investment-round.json` | Инвестиционный раунд | valid draft oracle |
| `fixtures/legal-core/v1/10-dispute-or-claim.json` | Спор или претензия | valid draft oracle |
| `fixtures/legal-core/v1/11-regulated-domain.json` | Регулируемая отрасль | valid draft oracle |
| `fixtures/legal-core/v1/12-incomplete-questionnaire.json` | Неполная анкета | valid draft oracle |
| `fixtures/legal-core/v1/13-unreadable-scanned-document.json` | Нечитаемый скан документа | valid draft oracle |
| `fixtures/legal-core/v1/14-contradictory-answers.json` | Противоречивые ответы | valid draft oracle |
| `fixtures/legal-core/v1/15-branch-answer-changed.json` | Изменение веточного ответа | valid draft oracle |

### 3.5. Draft golden reports

| Путь | Назначение | Статус |
|---|---|---|
| `docs/legal-core/golden-reports/README.md` | Правила использования и review checklist | reviewed draft |
| `docs/legal-core/golden-reports/01-clean-b2b-saas.md` | Эталон чистого B2B SaaS | `draft_pending_legal_approval` |
| `docs/legal-core/golden-reports/02-b2c-subscription-critical.md` | Эталон критической B2C-подписки | `draft_pending_legal_approval` |
| `docs/legal-core/golden-reports/03-ai-cross-border-escalation.md` | Эталон трансграничного сценария с эскалацией | `draft_pending_legal_approval` |

### 3.6. Проверка

| Путь | Назначение | Статус |
|---|---|---|
| `tools/validate-release-0.py` | Локальная read-only проверка schemas, counts, references, fixture hashes и обязательных файлов | PASS |
| `tools/requirements-release-0.txt` | Зафиксированная Python-зависимость валидатора | `jsonschema==4.26.0` |

### 3.7. Первый раунд юридического review

| Путь | Назначение | Статус |
|---|---|---|
| `docs/legal-core/legal-review/round-1-summary.md` | Сводка первого экспертного ИИ-review и remediation plan | completed; не является legal approval |
| `docs/legal-core/legal-review/01-clean-b2b-saas-review.md` | Review clean B2B report | round 1 completed |
| `docs/legal-core/legal-review/02-b2c-subscription-critical-review.md` | Review B2C subscription report | round 1 completed |
| `docs/legal-core/legal-review/03-ai-cross-border-escalation-review.md` | Review cross-border report | round 1 completed |
| `docs/legal-core/legal-review/round-2/summary.md` | Сводка второго независимого ИИ-review | `pass_with_notes`; 0 blocker, 0 major |
| `docs/legal-core/legal-review/round-2/01-clean-b2b-saas-review.md` | Round 2 review clean B2B report | ready for human review |
| `docs/legal-core/legal-review/round-2/02-b2c-subscription-critical-review.md` | Round 2 review B2C report | ready for human review |
| `docs/legal-core/legal-review/round-2/03-ai-cross-border-escalation-review.md` | Round 2 review cross-border report | ready for human review |
| `docs/legal-core/legal-review/round-2/post-review-closure.md` | Проверка закрытия minor-замечаний и B2C wording | PASS; 0 unresolved minor |
| `docs/legal-core/legal-review/human-approval-record-template.md` | Шаблон решения уполномоченного человека-юриста с hash-manifest | awaiting human decision |

## 4. Open decisions

Открытые решения сгруппированы, чтобы формальная приёмка не смешивалась с технической готовностью файлов.

| ID | Открытое решение | Владелец решения / блокируемый gate |
|---|---|---|
| `OD-01` | Назначить named legal approver и technical release custodian; определить workflow перевода конфигурации из draft. | Legal/Product; блокирует юридическое утверждение ядра и golden reports. |
| `OD-02` | После завершённого первого ИИ-review провести review человеком-юристом 25 рисков, 25 базовых правил, 35 правовых оснований, клиентских формулировок, fixtures и трёх golden reports. | Legal; блокирует §31.2 и клиентское использование. |
| `OD-03` | Формально согласовать пять state machines, идемпотентность, audit/outbox и режим отчёта для каждого critical/manual trigger. | Product/Security/Legal/Operations; блокирует реализацию R1. |
| `OD-04` | Согласовать снятие временного P0-исключения, owner-bound доступ, lifecycle magic link и neutral error contract. | Owner/Product/Security; блокирует защищённый путь R1. |
| `OD-05` | Утвердить модель customer account, достаточные доказательства legacy claim, quarantine/dispute policy и срок совместимости v1. | Product/Security/Data owner; блокирует миграцию. |
| `OD-06` | Утвердить tariff/product names, цены внутри диапазонов, promo campaign policy и правила refund/revoke. | Product/Finance/Legal; блокирует payment/access implementation. |
| `OD-07` | Утвердить момент выдачи и истечения права на зачёт, частичное применение, сочетание со скидками и отменёнными операциями. | Product/Finance/Legal; блокирует `credit_entitlement`. |
| `OD-08` | Утвердить SLA, календарь, очередь, ответственных и клиентскую видимость экспертной эскалации. | Legal Operations/Product; блокирует operational escalation. |
| `OD-09` | Утвердить MIME/size/count limits, scanning, quarantine, geography, providers, DPA и document retention. | Security/Privacy/Data owner; блокирует R2. |
| `OD-10` | Утвердить retention для drafts, reports, documents, tokens, email/audit logs, backups, legal hold и удаления аккаунта. | Privacy/Legal/Data owner/Operations; блокирует автоматическое удаление. |
| `OD-11` | Выбрать secret manager, workload identity, providers, durable outbox, RTO/RPO, monitoring, dead-letter и incident runbook. | Security/Operations; блокирует production adapters. |
| `OD-12` | Утвердить customer/admin auth boundary, recovery, rollback authority и дату decommission legacy v1. | Product/Security/Operations; блокирует cutover. |
| `OD-13` | Юридически и технически подтвердить clean scoring trace `SCORE-SEGMENT-001`, `SCORE-SEGMENT-006`, `SCORE-GOAL-007` и условие применения `FALLBACK-REC-001` только при отсутствии положительного кандидата. | Architecture/Legal core custodian; блокирует формальное утверждение recommendation trace. |

## 5. Команды воспроизводимой проверки

```bash
cd /home/ubuntu/Neolex
python3 -m pip install -r tools/requirements-release-0.txt
python3 tools/validate-release-0.py
python3 -m json.tool shared/legal-core/questionnaire_v2.json >/dev/null
find shared/billing shared/legal-core shared/report fixtures/legal-core -type f -name '*.json' -print0 \
  | while IFS= read -r -d '' f; do python3 -m json.tool "$f" >/dev/null || exit 1; done
```

Ожидаемая сводка основного валидатора: `questions=63`, `pilot_core=33`, `pilot_branch=6`, `risks=25`, `risk_rules=25`, `fixtures=15`, `json_schemas=6`, `golden_reports=3`.

## 6. Заключение

**Нормативное требование:** формальная приёмка Release 0 определяется §31.2, а защищённость клиентского пути — отдельными критериями Release 1.[1]

**Проектное решение:** техническая комплектность и внутренняя ссылочная целостность пакета Release 0 подтверждены локальными read-only проверками. Ни один новый файл не подключён к runtime.

**Открытый вопрос:** пакет нельзя переводить в утверждённый статус, считать принятым по §31.2 или использовать как основание запуска, пока не закрыты `OD-01`–`OD-13` в применимой части и не выполнены требуемые согласования.

## References

[1]: file:///tmp/text_editor_extracts/ТЗ3.0.Веб-сервисплатнойюридическойдиагностикиLexy-849c367a6037-p1-49.txt "Техническое задание Lexy v3.0"
[2]: file:///home/ubuntu/lexy-audit-work/Аудит-и-бэклог-Lexy-ТЗ-v3.md "Аудит и согласуемый бэклог Lexy по ТЗ v3"
[3]: file:///home/ubuntu/lexy-r0-work/current-questionnaire-v1.json "Снимок текущей анкеты Lexy v1"
[4]: file:///home/ubuntu/Neolex/shared/paidDiagnosticData.ts "Исходная конфигурация платной диагностики Lexy"
