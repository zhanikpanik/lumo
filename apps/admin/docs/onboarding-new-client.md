# Подключение нового ресторана

Пошаговая инструкция. Занимает ~15 минут на одного клиента.

## Что нужно заранее

- [ ] Установлен Supabase CLI: `brew install supabase/tap/supabase`
- [ ] Установлен Vercel CLI: `npm i -g vercel`
- [ ] Залогинен в Supabase: `supabase login`
- [ ] Залогинен в Vercel: `vercel login`
- [ ] Код в этом репозитории актуален (`git pull`)

## Быстрый путь (одна команда)

```bash
./scripts/new-client.sh <имя-клиента> <supabase-project-ref> <venue-uuid>
```

Скрипт спросит anon key из Supabase и сделает всё остальное.

## Пошаговый путь

### 1. Создать Supabase проект (2 мин)

1. Зайди на https://supabase.com/dashboard
2. New project → назови `r-keeper-<имя-клиента>`
3. Задай пароль БД (сохрани в менеджер паролей)
4. Выбери регион (ближайший к ресторану)
5. Жди ~2 мин пока создастся

### 2. Применить миграции (1 мин)

```bash
cd r_keeper-admin
./scripts/deploy-supabase.sh <project-ref>
```

Project ref — это строка в URL дашборда: `https://supabase.com/dashboard/project/<project-ref>`

### 3. Получить ключи (1 мин)

1. Открой https://supabase.com/dashboard/project/<project-ref>/settings/api
2. Скопируй `anon public` ключ (начинается с `sb_publishable_`)
3. URL проекта: `https://<project-ref>.supabase.co`

### 4. Задеплоить админку (2 мин)

```bash
./scripts/deploy-vercel.sh <имя-клиента> \
  https://<project-ref>.supabase.co \
  <anon-key> \
  <venue-uuid>
```

Админка будет доступна по адресу `https://<имя-клиента>.vercel.app`

### 5. Настроить POS (5 мин)

В `.env` POS-приложения:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_VENUE_ID=<venue-uuid>
```

Собрать APK:
```bash
cd r_keeper
npx expo build:android  # или eas build
```

### 6. Проверить (2 мин)

См. [pre-handoff-checklist.md](pre-handoff-checklist.md)

## Где взять VENUE_ID

Если venue ещё не создан — вставь строку в таблицу `venues` через Supabase SQL Editor:

```sql
INSERT INTO venues (id, name) VALUES (gen_random_uuid(), 'Название ресторана');
```

Триггер `after_venue_insert_seed_default_ops` автоматически создаст склады «Кухня» и «Бар», цеха и привязки.

После вставки сделай `SELECT id FROM venues WHERE name = 'Название ресторана'` — получишь VENUE_ID.

## Добавление своего домена

```bash
vercel domains add admin.твой-ресторан.kg
```

В DNS провайдере добавь CNAME запись: `admin → cname.vercel-dns.com`
