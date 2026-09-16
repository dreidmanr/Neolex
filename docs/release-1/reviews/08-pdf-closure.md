# Release 1 — Increment 7: PDF

## Статус

Технический increment реализован в test-only Pilot контуре. Клиентский запуск и юридическое утверждение по-прежнему запрещены release gate.

## Что реализовано

PDF строится из того же безопасного `ReportViewModel`, что и web-отчёт. В renderer v2 включены заголовок и резюме, общий профиль риска, риски и основания, правовые основания, дорожная карта, рекомендация, ограничения и обязательный технический watermark. Renderer не обращается к сети, LLM или клиентскому коду.

После первого owner-bound запроса статуса PDF создаётся один раз, загружается в object storage и фиксируется в таблице `report_pdf_artifacts`. В БД хранятся только owner/case/report связи, версия renderer, storage key, SHA-256, размер и технический статус. Повторная генерация того же snapshot и renderer не создаёт второй artifact.

Добавлен защищённый HTTP endpoint `GET /api/r1/reports/:publicId/artifacts/pdf`. Он требует customer session, принадлежность case текущему владельцу, активный access grant и готовый immutable report snapshot. Не-owner, неизвестный locator, отсутствующий grant и неготовый snapshot получают нейтральный `404`. Ответ отдаётся сервером как PDF; credential не помещается в URL или `Content-Disposition`.

В `CaseReport` добавлена кнопка «Скачать PDF». Она отображается только после получения статуса `ready` для persisted artifact.

## Проверки

| Проверка | Результат |
|---|---:|
| TypeScript `pnpm check` | Пройдено |
| Unit tests | 331 пройден |
| Production build | Пройдено |
| `drizzle-kit check` | Пройдено |
| PDF semantic parity test | Пройдено |
| `git diff --check` | Пройдено |
| MariaDB R1 harness | Не запущен в текущей shell-сессии: отсутствуют обязательные disposable-test environment gates |

MariaDB harness ранее проходил для предыдущего web-report increment, но новая migration `0011_r1_pdf_artifact_expand.sql` требует отдельного прогона в disposable database перед merge.

## Ограничения

PDF является техническим тестовым артефактом и не является юридическим заключением. В текущем Release 1 отсутствуют реальные клиенты, платежи, production email, публичные share links и LLM-генерация юридического результата.
