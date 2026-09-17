# Release 2 — четвёртый подэтап: очередь и text artifact

## Статус

Добавлена owner-bound очередь обработки документов и приватный manifest извлечённого текста.

## Реализовано

Добавлена таблица `r1_document_text_artifacts` через add-only migration `0013_r2_document_text_artifacts.sql`. Она хранит только lifecycle, owner/case, extractor version, lease, retry count, storage key и SHA-256/размер текста. Сам текст остаётся в приватном object storage.

После загрузки документа автоматически создаётся идемпотентная job с версией `r2-local-extractor-v1`. Worker может безопасно забрать job через lease на 60 секунд. Одновременно выполняется не более одного владельца lease для конкретной job; число попыток ограничено тремя.

Ошибки можно повторно поставить в очередь только до лимита попыток. `manual_review_required` не превращается автоматически в успешный результат.

Извлечённый текст загружается только под приватным ключом `r2/document-text/...`, его SHA-256 вычисляется до сохранения manifest. Содержимое text artifact не возвращается клиентскому API и не влияет на юридический результат.

## Проверки

| Проверка | Результат |
|---|---:|
| Queue/extractor tests | 5 успешно |
| Полный unit suite | 343 успешно |
| TypeScript check | успешно |
| Production build | успешно |
| Drizzle schema check | успешно |
| Чистая MariaDB migration 0013 | успешно |
| Schema acceptance | 27 таблиц, 36 FK — успешно |

## Ограничения

Пока не включены автоматическое влияние text artifact на evidence/risk/report, антивирусный provider, retention/deletion worker и production monitoring. Это намеренно оставлено отдельными этапами, чтобы извлечённый текст не мог незаметно изменить юридический результат.
