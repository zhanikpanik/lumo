# Design Tokens — r_keeper Admin

## CSS Variables (из `index.css`)

Проект использует shadcn-совместимые CSS-переменные в HSL. Все цвета заданы в `src/index.css`.

### Семантические токены

| Токен | HSL | Tailwind класс | ~Hex | Где используется |
|-------|-----|---------------|------|-----------------|
| `--background` | `60 20% 98%` | `bg-background` | `#F9F8F7` | Фон страниц, сайдбар |
| `--foreground` | `45 8% 20%` | `text-foreground` | `#37352F` | Основной текст |
| `--primary` | `247 82% 61%` | `bg-primary text-primary-foreground` | `#5D4FF1` | Кнопка "+", акценты |
| `--secondary` | `60 3% 94%` | `bg-secondary` | `#EFEFEE` | Фон инпутов, hover |
| `--muted` | `60 3% 94%` | `bg-muted` | `#EFEFEE` | Неактивные зоны |
| `--muted-foreground` | `45 2% 60%` | `text-muted-foreground` | `#9B9A97` | Подписи, placeholder |
| `--accent` | `60 3% 94%` | `bg-accent` | `#EFF0F4` | Hover, выделение |
| `--border` | `40 9% 94%` | `border-input` | `#E6E5E3` | Рамки инпутов |
| `--input` | `40 9% 94%` | `bg-input border-input` | `#E6E5E3` | Рамки |
| `--ring` | `247 82% 61%` | `ring-primary` | `#5D4FF1` | Фокус-кольцо |
| `--destructive` | `0 84% 60%` | `text-destructive` | `#EF4444` | Ошибки, удаление |
| `--success` | `145 63% 42%` | — | `#22C55E` | Успех (кастомный) |

### Радиусы и размеры

| Токен | Значение | Tailwind |
|-------|---------|----------|
| `--radius` | `0.5rem` (8px) | `rounded-lg` |

### Spacing

Система из 4px (Tailwind default):
- `1` = 4px (gap)
- `2` = 8px (py-2 — стандартная высота инпута)
- `3` = 12px (px-3 — горизонтальный паддинг инпута)
- `4` = 16px (gap-4 — между полями)
- `8` = 32px (p-8 — отступ страницы)

---

## Паттерны компонентов

### Input (текстовый)

```tsx
<input className="w-40 px-3 py-2 border border-input rounded-lg text-sm bg-[#F6F5F4]" />
```

> Примечание: `bg-[#F6F5F4]` пока хардкодный. При полной миграции на токены станет `bg-secondary`.

### Input с суффиксом (числовой)

```tsx
// DecimalSuffixInput — через компонент
<DecimalSuffixInput suffix="сом" value={...} onChange={...} />
// CSS внутри: pl-3 py-2 border border-input rounded-lg bg-[#F6F5F4]
```

### IngredientPicker

```tsx
<IngredientPicker ingredients={...} valueId={...} onSelect={...} />
// CSS: px-3 py-2 border border-input rounded-lg bg-[#F6F5F4]
```

### Segmented button group

```tsx
<ToggleGroup type="single" value={selectedId} onValueChange={...}>
  {options.map(opt => (
    <ToggleGroupItem key={opt} value={opt}>{opt}</ToggleGroupItem>
  ))}
</ToggleGroup>
// До миграции: ручной inline-flex + style={{ backgroundColor: '#FAFAFA' }}
```

### Поле формы

```tsx
<Field label="Название">
  <input className="..." />
</Field>
// Label: w-36 text-sm text-muted-foreground
```

### Кнопка сохранения

```tsx
<button className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
  Сохранить
</button>
// При миграции: <Button>Сохранить</Button>
```

### Кнопка "+ Добавить"

```tsx
<button style={{ color: '#5D4FF1' }} className="px-3 py-1.5 text-sm font-medium hover:opacity-80 cursor-pointer">
  + Добавить
</button>
// При миграции: <Button variant="ghost" style={{ color: 'hsl(var(--primary))' }}>
```

---

## Цвета без токенов (требуют миграции)

| Hex | Текущее использование | Должен стать |
|-----|---------------------|-------------|
| `#F6F5F4` | Фон инпутов | `bg-secondary` (после коррекции `--secondary`) |
| `#FAFAFA` | Фон segmented buttons | `bg-muted/50` или `ToggleGroup` |
| `#5D4FF1` | Кнопка "+", акценты | `text-primary` (уже есть `--primary`) |
| `#EFF0F4` | Hover строк таблиц | `bg-accent` |
| `#F0EFED` | Рамка dropdown | `border-input` |
| `#e8e7e4` | Hover иконок | `hover:text-muted-foreground` |
| `#d4d2ce` | Неактивная точка | `bg-muted-foreground/30` |

---

## Типографика

| Размер | Tailwind | Где |
|--------|---------|-----|
| Заголовок страницы | `text-2xl font-bold` | EditPage title |
| Заголовок секции | `text-lg font-semibold` | "Состав", "Модификаторы" |
| Подпись поля | `text-sm text-muted-foreground` | Field label |
| Текст инпута | `text-sm` | Все инпуты |
| Заголовок колонки | `text-xs font-semibold text-muted-foreground` | Таблицы и гриды |
| Мелкий текст | `text-xs text-muted-foreground` | Подсказки |
