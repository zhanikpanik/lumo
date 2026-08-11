import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

// ─── Navigation structure (mirrors Layout.tsx) ───

interface Page {
  label: string;
  to: string;
  group: string;
}

const PAGES: Page[] = [
  { group: 'Обзор', label: 'Дашборд', to: '/' },
  { group: 'Обзор', label: 'Аналитика', to: '/analytics' },
  { group: 'Продажи', label: 'Кассовые смены', to: '/cash-shifts' },
  { group: 'Продажи', label: 'Журнал', to: '/transactions' },
  { group: 'Продажи', label: 'Чеки', to: '/checks' },
  { group: 'Меню', label: 'Блюда', to: '/menu' },
  { group: 'Меню', label: 'Категории', to: '/menu/categories' },
  { group: 'Меню', label: 'Ингредиенты', to: '/menu/ingredients' },
  { group: 'Склад', label: 'Все операции', to: '/warehouse/operations' },
  { group: 'Склад', label: 'Переучёт', to: '/warehouse/inventory' },
  { group: 'Управление', label: 'Сотрудники', to: '/staff' },
  { group: 'Управление', label: 'Схема зала', to: '/floor-plan' },
  { group: 'Управление', label: 'Импорт', to: '/import' },
  { group: 'Управление', label: 'Настройки', to: '/settings' },
];

const GROUP_ORDER = ['Обзор', 'Продажи', 'Меню', 'Склад', 'Управление'];

// ─── Command Palette ───

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const filtered = query.trim()
    ? PAGES.filter(
        (p) =>
          p.label.toLowerCase().includes(query.toLowerCase()) ||
          p.group.toLowerCase().includes(query.toLowerCase()),
      )
    : PAGES;

  // Group filtered results
  const grouped = GROUP_ORDER.map((group) => {
    const items = filtered.filter((p) => p.group === group);
    return { group, items };
  }).filter((g) => g.items.length > 0);

  const allItems = grouped.flatMap((g) => g.items);
  const selected = allItems[selectedIndex];

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard nav
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selected) {
        e.preventDefault();
        navigate(selected.to);
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [selected, allItems.length, navigate, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Palette */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[480px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-border overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Перейти к…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[11px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded font-sans">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-2">
          {grouped.map(({ group, items }) => {
            let globalIndex = 0;
            // Find first index of this group in allItems
            const groupStartIndex = allItems.findIndex(
              (p) => p.group === group,
            );

            return (
              <div key={group}>
                <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {group}
                </div>
                {items.map((page) => {
                  const idx = allItems.indexOf(page);
                  const isSelected = idx === selectedIndex;

                  return (
                    <button
                      key={page.to}
                      type="button"
                      onClick={() => {
                        navigate(page.to);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left px-3 py-1.5 rounded mx-1 text-sm transition-colors ${
                        isSelected
                          ? 'bg-[#efefee] text-foreground'
                          : 'text-foreground hover:bg-secondary/50'
                      }`}
                    >
                      {page.label}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {allItems.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              Ничего не найдено
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <kbd className="bg-secondary/60 px-1 py-0.5 rounded font-sans">↑↓</kbd> навигация
          </span>
          <span>
            <kbd className="bg-secondary/60 px-1 py-0.5 rounded font-sans">↵</kbd> выбрать
          </span>
          <span className="ml-auto">Cmd+K чтобы открыть</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───

export function CommandBarDemo() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global Cmd+K / Ctrl+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="shrink-0 h-12 border-b border-border flex items-center px-4 gap-4">
        {/* Brand */}
        <span className="text-sm font-semibold text-foreground select-none mr-2">
          r_keeper
        </span>

        {/* Top-level nav groups — quick jump */}
        <nav className="flex items-center gap-1">
          {GROUP_ORDER.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="px-2.5 py-1 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              {group}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Cmd+K trigger */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-secondary/30 transition-colors text-sm text-muted-foreground"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Поиск страниц</span>
          <kbd className="text-[11px] bg-secondary/60 px-1.5 py-0.5 rounded font-sans text-muted-foreground ml-2">
            ⌘K
          </kbd>
        </button>
      </header>

      {/* ── Content area ── */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg font-bold text-foreground mb-2">
            Командная строка — тестовая страница
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-prose">
            Сайдбар убран. Навигация через Cmd+K или клик по группе в верхней
            строке. Попробуй:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <kbd className="shrink-0 mt-0.5 text-xs bg-secondary/60 px-1.5 py-0.5 rounded font-sans text-muted-foreground">
                ⌘K
              </kbd>
              <span className="text-sm text-foreground">
                Открыть командную палитру — введи «чек» или «ингр» и нажми Enter
              </span>
            </div>
            <div className="flex items-start gap-3">
              <kbd className="shrink-0 mt-0.5 text-xs bg-secondary/60 px-1.5 py-0.5 rounded font-sans text-muted-foreground">
                ↑↓
              </kbd>
              <span className="text-sm text-foreground">
                Навигация по результатам стрелками
              </span>
            </div>
            <div className="flex items-start gap-3">
              <kbd className="shrink-0 mt-0.5 text-xs bg-secondary/60 px-1.5 py-0.5 rounded font-sans text-muted-foreground">
                Esc
              </kbd>
              <span className="text-sm text-foreground">
                Закрыть палитру или клик в пустоту за ней
              </span>
            </div>
          </div>

          {/* Fake content to show full-width */}
          <div className="mt-10 p-6 border border-border rounded-lg">
            <h3 className="text-sm font-medium text-foreground mb-3">
              Пример: широкая таблица
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Без сайдбара контент занимает всю ширину. Вот таблица на 12
              колонок которая не обрезается:
            </p>
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <th
                        key={i}
                        className="py-1.5 px-3 text-left text-sm font-medium text-foreground whitespace-nowrap"
                      >
                        Колонка {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, row) => (
                    <tr key={row} className="border-b border-border">
                      {Array.from({ length: 12 }).map((_, col) => (
                        <td
                          key={col}
                          className="py-1.5 px-3 text-sm text-foreground whitespace-nowrap"
                        >
                          Данные {row + 1}-{col + 1}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* What we lost */}
          <div className="mt-10 p-6 border border-border rounded-lg bg-secondary/10">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Что потеряли vs текущий сайдбар
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Индикатор активной смены (внизу сайдбара)</li>
              <li>• Список складов с переименованием/удалением</li>
              <li>• Мгновенный обзор всей структуры (все 15 страниц видны сразу)</li>
              <li>• Активный пункт подсвечен (видно где ты находишься)</li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Это решаемо: индикатор смены — в топбар справа. Склады — выпадашка
              или отдельный переключатель внутри страницы склада. Активный раздел
              — хлебные крошки или подсветка группы в топбаре.
            </p>
          </div>
        </div>
      </main>

      {/* ── Command palette overlay ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
