# Lexy v3 — техническое закрытие текущего Pilot и финальные decision gates

## Выполненные технические этапы

В текущем цикле завершены document intake, owner-bound document API, локальное fail-closed извлечение PDF/DOCX, queue/text-artifact processing, deterministic evidence-gate, owner-bound статус документов в CaseReport и retention sweep contract.

Документ остаётся недоверенными данными. Даже успешно извлечённый текст не может сам изменить риск, evidence status, recommendation или уже выданный immutable report. Подтверждение документом возможно только через отдельный gate: статус `analyzed`, совпадение запрошенной категории, отсутствие manual-review/instruction-like flags и последующая валидированная генерация новой версии отчёта.

Удаление документа прекращает его использование в будущей обработке и сохраняет ранее выданный snapshot неизменным. Физическое удаление object-storage выполняется только через явно переданный provider adapter и cutoff; код не придумывает срок хранения и не вызывает несуществующий storage delete endpoint.

## Проверки

| Проверка | Результат |
|---|---:|
| Полный unit suite | 347 успешно |
| TypeScript check | успешно |
| Production build | успешно |
| Drizzle schema check | успешно |
| MariaDB migration/schema rehearsal до migration 0013 | успешно |
| Owner-bound client/report security tests | успешно |
| Evidence-gate tests | успешно |
| Retention contract tests | успешно |

## Что намеренно не включено автоматически

Текущий runtime остаётся synthetic Pilot и техническим тестовым черновиком. Реальные платежи, production email, клиентский runtime, юридически утверждённые формулировки и автоматическое влияние документов на юридический результат не включались.

## Решения, которые нужно принять перед полным запуском

1. Утвердить три эталонных отчёта и legal basis/catalog юристом.
2. Утвердить retention schedule для исходных документов, text artifacts, PDF, черновиков, magic tokens, email logs и backup.
3. Выбрать storage deletion provider/операционный процесс и подтвердить DPA, регион обработки и запрет обучения на клиентских данных.
4. Решить судьбу legacy routes: закрытие, изоляция или контролируемая миграция.
5. Назначить ответственного за expert queue и SLA.
6. Утвердить production email provider/domain.
7. Утвердить payment provider, возвраты, reconciliation и credit policy.
8. Разрешить ли scanned PNG/JPEG и при каких правилах OCR/evidence.
9. После решений выполнить security/load/backup-restore rehearsal и перевести release gate из synthetic Pilot.

До выполнения этих пунктов правильный статус: **R2 technical build/test; client launch prohibited**.
