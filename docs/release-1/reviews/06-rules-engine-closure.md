# Release 1 — Rules Engine: closure review и техническая приёмка

**Vertical increment:** 5 — детерминированный Rules Engine
**Статус:** технически принят только для **synthetic/test-only** контура; production/client launch запрещён.
**Дата closure:** 14 сентября 2026 г.
**Ветка:** `feat/lexy-release-1-rules-engine`

## 1. Принятый результат

Инкремент добавляет внутренний детерминированный расчёт только для уже отправленной расширенной анкеты v2. Расчёт получает исключительно неизменяемый server-side snapshot, применяет декларативные правила и сохраняет технический результат с полной проверяемой привязкой к версии анкеты и набора правил. Результат **не передаётся клиенту**, не создаёт юридическое заключение, не формирует web/PDF-отчёт и не запускает LLM.

> **Не является запуском для клиентов.** Клиентский runtime остаётся hard-disabled. Вызов worker возможен только из доверенного технического процесса в synthetic/test-only окружении. Автоматический фоновый запуск, реальный email, платежи, публичный API результата и юридически значимый вывод не включены.

| Контур | Принятое решение | Ограничение |
|---|---|---|
| Вход расчёта | Только immutable `questionnaire_submission` с canonical snapshot и SHA-256. | Browser, legacy answers и mutable draft не могут передать score, риск или рекомендацию. |
| Версия правил | Submission и outbox-событие атомарно фиксируют legal-core release, version, ruleset ID и ruleset bundle hash. | Несовпадение с загруженным server bundle ведёт к terminal fail-closed, а не к расчёту по новой версии. |
| Детерминизм | Pure evaluator использует closed JSON AST, pinned artifacts и canonical serialization. | Нет LLM, сети, UI, случайности или чтения часов внутри evaluator. |
| Очередь | Leased outbox с owner/version/expiry fence и bounded retries. | Ошибочное или повреждённое scoring-событие quarantine-ится с безопасным кодом и не блокирует последующие анкеты. |
| Итог обработки | Внутренний result переводит case в `manual_review_required`. | Техническая рекомендация не является клиентским заключением и не отображается до следующего инкремента Web report. |
| Privacy | Audit/outbox содержат только opaque IDs, версии, hashes и allowlisted flags. | Ответы анкеты, snapshot, текст результата, рекомендация и юридические формулировки не попадают в audit/outbox/receipt. |

## 2. Закрытые security findings

| Finding | Исправление | Проверяемое доказательство |
|---|---|---|
| Повреждённое старое событие могло навсегда блокировать очередь | Worker lock-ит scoring outbox первым; malformed или unlinked event переводится в `failed` с `input_inconsistent`, lease очищается. | Real-DB сценарий сначала quarantine-ит повреждённое событие, затем успешно обрабатывает следующую валидную submission. |
| Submission могла быть рассчитана на новой версии ruleset после ожидания в очереди | В immutable submission и scoring event закреплены release/version/ruleset/hash; worker требует совпадение event, locked submission и loaded bundle. | Unit test подтверждает terminal `configuration_invalid` / `configuration_unavailable` до запуска evaluator. |
| Lease мог использовать устаревшее время | Worker получает injected clock и считывает время непосредственно перед fenced DB-операциями; недействительный clock или service actor отклоняется до claim. | Unit test моделирует пересечение срока lease и получает `lease_lost` без completion. |
| Дедупликация outbox могла ослабить обычные transition-события | Idempotent replay оставлен только для immutable `questionnaire.submitted_for_scoring`; все остальные события используют обычный unique failure. | Real-DB проверка подтверждает exact scoring replay и rejection divergent/ordinary collisions. |

## 3. Результаты проверок

| Проверка | Результат |
|---|---|
| TypeScript | `pnpm check` — PASS |
| Unit и контракты | `pnpm test` — PASS, **39 файлов / 314 тестов** |
| Production build | `pnpm build` — PASS; имеются только существующие предупреждения CSS import order и размера bundle, ошибок нет |
| Legal-core артефакты | `python3 tools/validate-release-0.py` — PASS |
| Diff hygiene | `git diff --check` — PASS |
| Миграции | Fresh disposable MariaDB применяет `0000`–`0009` — PASS |
| Real-DB acceptance | `pnpm test:r1:db` — PASS, **8 файлов / 44 теста** |
| Rules Engine DB evidence | Success/replay, immutable pins, corrupted snapshot fail-closed, poison queue quarantine, ordinary dedupe rejection — PASS |
| Independent closure review | PASS: blockers = 0, majors = 0 |

## 4. Оставшиеся границы и следующий шаг

**Всё ещё запрещено:** запускать worker постоянно в production, открывать клиенту риск/рекомендацию/заключение, считать технический результат юридическим советом, включать LLM или менять статус draft legal artifacts. Существующие legacy token routes остаются отдельным launch-risk и не участвуют в v2 Rules Engine.

Следующий безопасный vertical increment — **Web report**. Он должен построить единственный immutable versioned report snapshot только из validated Rules Engine result, вернуть клиенту owner-bound безопасную проекцию и сохранить явный draft/test-only watermark. Переход к клиентскому launch и человеческому юридическому одобрению по-прежнему не выполняется этим изменением.
