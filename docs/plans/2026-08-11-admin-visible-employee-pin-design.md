# Admin-visible employee PIN design

**Дата:** 2026-08-11
**Статус:** validated

## Цель

Вернуть владельцу и менеджеру просмотр PIN сотрудника по hover/focus, не раскрывая PIN POS-устройствам.

## Решение

Plaintext PIN хранится в отдельной one-to-one сущности `employeePinSecrets`, связанной с `employees`. `employees.pin` не возвращается: POS читает `employees`, поэтому такое поле раскрыло бы PIN терминалам.

`employeePinSecrets` содержит `pin` и `updatedAt`. Owner/manager active membership своего venue может читать secret. Anonymous, POS device, cross-venue admin и остальные роли не могут читать его. Клиентские create/update/delete запрещены; trusted worker записывает secret.

Staff commands создают или обновляют PBKDF2 credential и plaintext secret в одной InstantDB transaction. Deactivate удаляет secret в той же transaction. Для legacy credentials plaintext восстановить невозможно; до следующего reset UI показывает недоступное значение.

Admin Staff query загружает `pinSecret`. В обычном состоянии таблица показывает `••••••`; hover или keyboard focus раскрывает PIN без изменения ширины ячейки. Поле редактирования остаётся password input.

## Проверка

- create/reset/update атомарно сохраняют verifier и secret;
- deactivate удаляет secret;
- owner/manager своего venue видит secret;
- device, anonymous и cross-venue admin не видят secret;
- direct client mutation отклоняется;
- admin reset отображается по hover/focus;
- новый PIN открывает POS после reactive sync;
- существующие PIN без secret остаются недоступны до reset.
