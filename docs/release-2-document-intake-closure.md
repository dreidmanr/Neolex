# Release 2 — первый подэтап: безопасный document intake

## Статус

Технически завершён и проверен первый подэтап документарного тарифа: **owner-bound manifest и fail-closed валидация входного файла**.

## Реализовано

Добавлены allowlist категорий из `rules_v1`, поддержка только PDF и DOCX, проверка имени файла, расширения, MIME, размера до 25 MiB, PDF/DOCX container signature и SHA-256. Manifest фиксирует состояние `uploaded`, но явно помечает содержимое как недоверенное: `trustedContent=false`, `promptInjectionRisk=untrusted_document_content`.

Добавлена таблица `r1_document_manifests` через add-only migration `0012_r1_document_manifest.sql`. В ней нет содержимого файла, prompt, свободного текста документа или публичной ссылки; хранится только owner-bound manifest и приватный storage key.

Сервис `createOwnedDocumentManifest` дополнительно проверяет активный access grant, тариф `lexy-diagnostic-with-documents` и лимит трёх загруженных документов на case.

## Проверки

| Проверка | Результат |
|---|---:|
| Document intake unit tests | 4 успешно |
| Полный unit suite | 335 успешно |
| TypeScript check | успешно |
| Production build | успешно |
| Чистая MariaDB migration rehearsal | успешно |
| Полный R1/R2 DB integration suite | 48 успешно |
| Schema acceptance | 26 таблиц, 35 FK — успешно |

## Что ещё не заявляется готовым

Этот подэтап не включает извлечение текста, анализ документов, подтверждение риска документом, повторную генерацию отчёта, retention/deletion workflow или production storage SLA. До их реализации документ не влияет на `evidenceStatus`, risk level или recommendation.

LLM не получает содержимое документа. Любое будущее извлечение будет рассматриваться как недоверенные данные и не как инструкция для модели.
