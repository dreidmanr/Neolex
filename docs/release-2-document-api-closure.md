# Release 2 — второй подэтап: owner-bound document API

## Статус

Технически завершён второй подэтап документарного тарифа: защищённые маршруты списка, загрузки, скачивания и удаления документа.

## Реализовано

Добавлены маршруты:

- `GET /api/r1/cases/:publicId/documents` — список только владельцу;
- `POST /api/r1/cases/:publicId/documents` — raw binary upload PDF/DOCX;
- `GET /api/r1/cases/:publicId/documents/:documentId/download` — короткоживущий signed redirect;
- `DELETE /api/r1/cases/:publicId/documents/:documentId` — owner-bound tombstone со статусом `deleted`.

Все операции требуют действующей customer session, принадлежащего клиенту case, активного grant и тарифа `lexy-diagnostic-with-documents`. В API-ответ не попадают `storageKey`, публичные URL, содержимое файла или внутренние идентификаторы доступа.

Upload использует route-local `express.raw` с лимитом 25 MiB и MIME allowlist PDF/DOCX. Основная проверка имени, сигнатуры, размера, категории и SHA-256 выполняется общим intake validator.

## Проверки

| Проверка | Результат |
|---|---:|
| Document intake и route security tests | 7 успешно |
| Полный unit suite | 338 успешно |
| TypeScript check | успешно |
| Production build | успешно |
| DB schema/migration acceptance | пройден в предыдущем подэтапе |

## Ограничения

Удаление сейчас является безопасным tombstone в базе и немедленно скрывает документ из API. Физическое удаление object-storage bytes, retention policy, антивирусная проверка, text extraction и document analysis являются следующими подэтапами. До их реализации документ не меняет risk level, evidence status или recommendation.
