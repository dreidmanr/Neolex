# Golden reports Lexy Release 0

# **DRAFT — ТРЕБУЕТ ПРОВЕРКИ И УТВЕРЖДЕНИЯ ЮРИСТОМ**

> Каталог содержит архитектурные эталоны отчётов. Они имеют статус `draft_pending_legal_approval`, не являются юридически утверждёнными клиентскими документами, не подключены к runtime и не меняют клиентский доступ, маршруты, React, DB schema, PDF или бизнес-логику.

## Состав

| Файл | Единственный source fixture | Ожидаемый профиль | Эскалация | Ровно одна рекомендация | Зачёт |
|---|---|---|---|---|---|
| [`01-clean-b2b-saas.md`](./01-clean-b2b-saas.md) | `LEXR0-FIXTURE-001` / `01-clean-b2b-saas.json` | low, активных рисков нет | Нет | `start_product` | 6 900 RUB, 14 дней; draft |
| [`02-b2c-subscription-critical.md`](./02-b2c-subscription-critical.md) | `LEXR0-FIXTURE-004` / `04-b2c-subscription-recurring.json` | critical, риски 017–019 | Обязательна | `expert_review` | Не применяется |
| [`03-ai-cross-border-escalation.md`](./03-ai-cross-border-escalation.md) | `LEXR0-FIXTURE-006` / `06-cross-border-infrastructure.json` | critical, риск 010 | Обязательна | `expert_review` | Не применяется |

Имя третьего файла содержит `ai`, однако выбранный fixture подтверждает только трансграничный SaaS-сценарий. AI-контекст в самом отчёте не выдаётся за факт и отмечен как открытый вопрос. Это сохраняет правило «один отчёт — один fixture».

## Правила использования

**Нормативное требование.** До начала production-разработки юридическое ядро, три эталонных отчёта и fixtures должны пройти формальное юридическое согласование. Critical/manual-review сценарий не должен выдавать фиксированный пакет как достаточное решение, а рекомендация должна оставаться единственной.[1] [2]

**Проектное решение.** Markdown-файлы повторяют разделы `report_schema_v1` в человекочитаемом виде. Поля runtime identity, server timestamps, hashes и payment/access provenance описаны как требования к будущему snapshot, но не подделываются в архитектурном документе.

**Проектное решение.** Для clean fixture установлен устойчивый `FALLBACK-REC-001`: он обеспечивает непустую трассировку `activatedRules` и `recommendation.selectionRuleIds`, не создавая фиктивного риска, ветки, эскалации или stop-factor.

## Checklist юридического approval

### A. Governance и версия

- [ ] Назначен юридический владелец и зафиксированы ФИО/роль approver-а.
- [ ] Подтверждено, что проверяется release `lexy-r0-2026-09-12`, version `1.0.0-draft.1`.
- [ ] Подтверждён source commit `78e2f89e99340a403ce389eada223da6bf336676`.
- [ ] Утверждены дата вступления в силу и правила supersede; до этого `effectiveFrom=null`, `effectiveTo=null`.
- [ ] Для каждого артефакта статус переводится из `draft_pending_legal_approval` только отдельным формальным решением.

### B. Fixture-to-report соответствие

- [ ] Каждый отчёт сопоставлен ровно с одним fixture, без объединения ответов разных профилей.
- [ ] Активные и запрещённые risk IDs совпадают с fixture.
- [ ] Итоговый risk profile совпадает с fixture и не сглаживает critical override.
- [ ] Состояния ветвей и активные вопросы соответствуют `questionnaire_v2` и `rules_v1`.
- [ ] В отчёте нет фактов, которых нет в canonical answers; AI в третьем отчёте остаётся открытым вопросом.

### C. Риски и доказательность

- [ ] Для каждого активного риска проверены title, domain, level, probability, impact и urgency.
- [ ] Проверены связи `riskId → ruleId → phraseId → legalBasisIds`.
- [ ] Статус `questionnaire_based` не создаёт впечатление документарного подтверждения.
- [ ] Статус `manual_review_required` используется для critical/спорных/трансграничных сценариев.
- [ ] Ни один риск Release 0 не получает `document_confirmed` автоматически.
- [ ] Формулировки не содержат категоричного вывода о нарушении, гарантии результата или прогноза исхода спора.

### D. Правовые основания

- [ ] Юрист проверил редакцию и применимость каждого legal basis ID к соответствующему риску.
- [ ] Проверены официальные источники, article references и дата актуальности.
- [ ] Утверждены клиентские display wording и ограничения применимости.
- [ ] В clean report подтверждена корректность пустого списка legal basis.
- [ ] В B2C report утверждены `LB-RU-ZPP-10`, `LB-RU-ZPP-13-6`, `LB-RU-GK-309`, `LB-RU-GK-437`, `LB-RU-ADS-38FZ`.
- [ ] В cross-border report утверждены `LB-RU-PD-152FZ-18-5`, `LB-RU-PD-152FZ-12`, `LB-RU-ADMIN-13-11`.

### E. Бизнес-последствия и roadmap

- [ ] Последствия сформулированы как риски/ориентиры, а не как установленный ущерб.
- [ ] Финансовые суммы не приведены без утверждённого источника и фактических входных данных.
- [ ] Для каждого active risk есть действие, срок, owner role и completion evidence.
- [ ] Roadmap содержит явные этапы 0/30/60/90, включая пустые интервалы clean-case.
- [ ] Действия critical-сценариев требуют экспертной проверки там, где это предусмотрено.

### F. Эскалация и единственная рекомендация

- [ ] Для B2C утверждены причина и маршруты `LEGAL-DISPUTE-REVIEW` / `LEGAL-EXPERT-REVIEW`.
- [ ] Для cross-border утверждены причина и маршруты `LEGAL-CROSS-BORDER-REVIEW` / `LEGAL-EXPERT-REVIEW`.
- [ ] Утверждён порядок выбора одного `queueCode`, если сработали несколько escalation rules.
- [ ] Назначены владелец очереди, резервный исполнитель, рабочий календарь и SLA.
- [ ] В каждом отчёте присутствует ровно один объект recommendation.
- [ ] Critical/manual-review отчёты рекомендуют только `expert_review` и не предлагают пакет вторым CTA.
- [ ] Clean report детерминированно рекомендует только `start_product`.

### G. Зачёт 6 900 RUB / 14 дней

- [ ] Юридически и коммерчески утверждены клиентская формулировка, eligible product codes и момент выдачи отчёта.
- [ ] Для clean report подтверждено право 6 900 RUB на 14 календарных дней для `start_product`.
- [ ] Подтверждена timezone `Europe/Moscow` и правило окончания четырнадцатого дня.
- [ ] Подтверждено, что автоматическое погашение выключено до Release 3.
- [ ] Для `expert_review` подтверждено `creditEntitlement=null`.

### H. Privacy, access и секреты

- [ ] Report DTO не содержит raw session tokens, промокоды, magic-link tokens, provider secrets или unhashed provider references.
- [ ] Payment/access provenance заполняется только сервером из доверенных записей.
- [ ] Отсутствие operational IDs в Markdown не трактуется как разрешение генерировать их на клиенте.
- [ ] Архитектурные отчёты не публикуются как client-ready до approval.
- [ ] Текущий клиентский доступ не закрывается и не изменяется этим набором документов.

### I. Schema, immutable snapshot и parity

- [ ] Юрист и технический custodian подтвердили применение `FALLBACK-REC-001` для clean-case и отсутствие фиктивных риск-срабатываний.
- [ ] Утверждён метод RFC 8785 canonicalization и checksum scope.
- [ ] JSON snapshot проходит `report_schema_v1` с `additionalProperties=false`.
- [ ] Повторная генерация создаёт новую immutable version и `supersedesReportId`, а не перезаписывает отчёт.
- [ ] Web и PDF используют один snapshot; parity покрывает risk blocks, legal bases, roadmap, recommendation, credit и limitations.
- [ ] Golden snapshot tests проверяют expected и forbidden risk IDs, exactly-one recommendation и отсутствие запрещённых формулировок.

## Решение по approval

| Поле | Заполняет ответственный |
|---|---|
| Решение | ☐ approve без изменений ☐ approve с условиями ☐ отклонить |
| Юридический approver |  |
| Дата и время |  |
| Проверенная версия |  |
| Проверенные SHA-256 |  |
| Условия / замечания |  |
| Ссылка на решение |  |
| Следующая версия при изменениях |  |

Пока checklist не завершён и решение не зафиксировано, все три отчёта остаются **DRAFT**.

## Ссылки

[1]: ../../../shared/report/report_schema_v1.json "Draft JSON Schema отчёта Lexy Release 0"
[2]: ../../../fixtures/legal-core/manifest.json "Manifest fixtures юридического ядра Release 0"
[3]: ../../../shared/legal-core/rules_v1.json "Draft rules_v1"
[4]: ../../../shared/legal-core/recommendation_mapping_v1.json "Draft recommendation_mapping_v1"
[5]: ../../../shared/billing/credit_policy_v1.json "Draft credit_policy_v1"
