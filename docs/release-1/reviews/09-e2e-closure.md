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
| DB integration journey | Не запускался: отсутствует безопасный disposable MariaDB `DATABASE_URL` |

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

Отсутствие этого профиля не обходит проверку и не является основанием заявлять, что DB E2E уже пройден. Production client launch по-прежнему запрещён до human legal approval, legacy policy, retention policy, operational escalation и security launch review.
