# Release 1 — Increment 8: Сквозной E2E

## Статус

Добавлен единый synthetic integration journey `server/r1/integration/fullJourney.integration.test.ts`.

Тест связывает следующие этапы в один сценарий:

1. запрос magic link;
2. test email delivery;
3. одноразовое потребление magic link;
4. создание customer session;
5. серверное получение promo-доступа;
6. создание `payment_record` со статусом `promo_granted`;
7. owner-bound диагностика;
8. серверное сохранение ответов анкеты;
9. submit с idempotency;
10. deterministic rules worker;
11. immutable report snapshot;
12. report worker;
13. безопасная web view model;
14. PDF HTML renderer из того же view model;
15. проверка рисков, roadmap, recommendation и watermark;
16. replay submit без создания второго snapshot.

## Проверки

| Проверка | Результат |
|---|---|
| `pnpm check` | Пройдена |
| `pnpm test` | 331 тест прошёл, 43 файла |
| `pnpm build` | Production build прошёл |
| `git diff --check` | Пройдена |
| DB integration journey | Пройдена на локальной disposable MariaDB |

## Фактический DB-прогон

Создан отдельный локальный контур `lexy_r1_test_*`, применены миграции с нуля, после чего штатный `pnpm test:r1:db` выполнил полный suite.

Результат: **10 integration-файлов, 48 тестов успешно**. В состав вошёл новый полный journey от magic link до web/PDF snapshot parity.

Во время первого прогона были найдены и исправлены реальные разрывы acceptance-контура:

- clock dependency в новом magic-link E2E была приведена к штатному `{ now() }` контракту;
- schema acceptance обновлён с 24 до 25 R1-таблиц и с 32 до 33 foreign keys после add-only PDF migration;
- fixture стал branch-aware и заполняет видимые сервером ветки;
- MariaDB JSON payload декодируется перед проверкой schema/parity.

## Дополнительное изменение

В `r1DbHarness.cleanRunData()` добавлена очистка `report_pdf_artifacts`, чтобы persisted PDF artifacts не оставались после synthetic DB-прогона.

## Ограничения

Новый тест подтверждает сервисную сквозную связность на реальной MariaDB только после запуска с обязательными fail-closed параметрами:

- `NODE_ENV=test`;
- disposable database `lexy_r1_test_*` на localhost;
- `LEXY_R1_SYNTHETIC_TEST_MODE=true`;
- `LEXY_R1_TEST_IDENTITY=r1-harness`;
- `LEXY_R1_DATABASE_CLASS=disposable_test`;
- dedicated test secrets;
- `LEXY_R1_EMAIL_TRANSPORT=test`;
- `LEXY_R1_PAYMENT_PROVIDER=disabled`.

Этот профиль использовался только для synthetic-проверки и не содержит реальных клиентских данных или платежей. Production client launch по-прежнему запрещён до human legal approval, legacy policy, retention policy, operational escalation и security launch review.
