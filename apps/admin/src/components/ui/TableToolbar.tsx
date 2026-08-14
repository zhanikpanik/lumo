import type { ReactNode } from 'react';
import { SearchInput } from './SearchInput';

interface TableToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  resultCount?: number;
  onReset?: () => void;
}

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
  resultCount,
  onReset,
}: TableToolbarProps) {
  const hasSearch = search !== undefined && onSearchChange !== undefined;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {hasSearch && (
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            className="w-full sm:w-64"
          />
        )}
        {filters && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div>}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {(resultCount !== undefined || onReset) && (
        <div className="flex min-h-6 items-center gap-3 text-xs text-muted-foreground">
          {resultCount !== undefined && <span>Найдено: {resultCount}</span>}
          {onReset && (
            <button type="button" onClick={onReset} className="font-medium text-primary hover:underline">
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
    </div>
  );
}
