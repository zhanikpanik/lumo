import { useState, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type OnChangeFn,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ═══ DataTable — Bureau-canon table wrapped around TanStack React Table ═══
 *
 * One component for ALL tables in the app. Fix the canon here → fix everywhere.
 *
 * Bureau table canon:
 *   thead: sticky, bg-background, z-10
 *   th:    py-1 px-3 text-sm font-medium text-foreground, scope="col"
 *   td:    py-1 px-3 text-sm
 *   tr:    h-9 (36px explicit row height — prevents height drift between rows with/without action buttons)
 *   table: table-fixed border-separate border-spacing-0 w-full
 *
 * dense mode: columns auto-size to content — first column takes remaining space,
 *   all others shrink-wrap (w-[1%] whitespace-nowrap). No manual meta.className widths needed.
 */

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];

  // State
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string;

  // Sorting — if provided, sorting is controlled externally; otherwise internal state
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;

  // Row expansion
  renderExpandedRow?: (row: Row<TData>) => React.ReactNode;
  /** Which rows are expanded. If provided, must pair with onExpandedChange. */
  expandedRows?: Record<string, boolean>;
  onExpandedChange?: (rowId: string) => void;

  // Row interaction
  onRowClick?: (row: Row<TData>) => void;
  getRowClassName?: (row: Row<TData>) => string;
  getRowId?: (originalRow: TData, index: number) => string;

  // Styling
  dense?: boolean;
  className?: string;
  tableClassName?: string;
}

/** dense mode: all columns shrink-wrap to content, table is as wide as its content */
function denseClass(dense: boolean | undefined): string {
  if (!dense) return '';
  return 'whitespace-nowrap';
}

export function DataTable<TData>({
  data,
  columns,
  isLoading,
  error,
  emptyMessage = 'Здесь пока нет данных',
  sorting: externalSorting,
  onSortingChange: externalOnSortingChange,
  renderExpandedRow,
  expandedRows,
  onExpandedChange,
  onRowClick,
  getRowClassName,
  getRowId,
  dense,
  className,
  tableClassName,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);

  const sorting = externalSorting ?? internalSorting;
  const onSortingChange = externalOnSortingChange ?? setInternalSorting;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });
  const tableLayout = dense ? 'table-auto' : 'table-fixed';

  // ═══ Loading ═══
  // ═══ Loading ═══
  if (isLoading) {
    return (
      <div className={cn('overflow-x-auto overscroll-x-contain', className)} role="region" aria-label="Таблица данных" tabIndex={0}>
        <table className={cn(tableLayout, 'border-separate border-spacing-0 max-md:min-w-[720px]', !dense && 'w-full', tableClassName)}>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={col.id ?? (typeof col.header === 'string' ? col.header : `col_${i}`)}
                  scope="col"
                  className={cn(
                    'py-1 px-3 text-sm font-medium text-foreground text-left',
                    denseClass(dense),
                  )}
                >
                  {typeof col.header === 'string' ? col.header : col.id ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                Загружаем данные…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ═══ Error ═══
  if (error) {
    return (
      <div className={cn('overflow-x-auto overscroll-x-contain', className)} role="region" aria-label="Таблица данных" tabIndex={0}>
        <table className={cn(tableLayout, 'border-separate border-spacing-0 max-md:min-w-[720px]', !dense && 'w-full', tableClassName)}>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={col.id ?? (typeof col.header === 'string' ? col.header : `col_${i}`)}
                  scope="col"
                  className={cn(
                    'py-1 px-3 text-sm font-medium text-foreground text-left',
                    denseClass(dense),
                  )}
                >
                  {typeof col.header === 'string' ? col.header : col.id ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="py-12 text-center" role="alert">
                <p className="text-sm font-medium text-destructive">Не удалось загрузить данные</p>
                <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ═══ Empty ═══
  if (data.length === 0) {
    return (
      <div className={cn('overflow-x-auto overscroll-x-contain', className)} role="region" aria-label="Таблица данных" tabIndex={0}>
        <table className={cn(tableLayout, 'border-separate border-spacing-0 max-md:min-w-[720px]', !dense && 'w-full', tableClassName)}>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={col.id ?? (typeof col.header === 'string' ? col.header : `col_${i}`)}
                  scope="col"
                  className={cn(
                    'py-1 px-3 text-sm font-medium text-foreground text-left',
                    denseClass(dense),
                  )}
                >
                  {typeof col.header === 'string' ? col.header : col.id ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ═══ Normal ═══
  return (
    <div className={cn('overflow-x-auto overscroll-x-contain', className)} role="region" aria-label="Таблица данных" tabIndex={0}>
      <table className={cn(tableLayout, 'border-separate border-spacing-0 max-md:min-w-[720px]', !dense && 'w-full', tableClassName)}>
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} className="border-b border-border">
              {headerGroup.headers.map(header => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const isFirst = header.index === 0;
                const align = isFirst ? 'text-left' : 'text-right';
                const headerMeta = (header.column.columnDef.meta ?? {}) as { align?: string; className?: string };
                const ariaSort = sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : canSort ? 'none' : undefined;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      'py-1 px-3 text-sm font-medium text-foreground',
                      align,
                      denseClass(dense),
                      headerMeta.className,
                      isFirst && 'max-md:sticky max-md:left-0 max-md:z-20 max-md:bg-background',
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 w-full items-center gap-1 text-inherit max-md:justify-start md:min-h-0"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Сортировать: ${String(header.column.columnDef.header ?? header.id)}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-20" />
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            const rowClass = getRowClassName?.(row);
            const isExpanded = expandedRows?.[row.id] ?? false;
            const hasExpansion = !!renderExpandedRow;

            // Flat mode (no expansion) — simple rows, no nesting
            if (!hasExpansion) {
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'h-11 md:h-9 border-b border-border',
                    onRowClick && 'cursor-pointer hover:bg-muted/30 transition-colors',
                    rowClass,
                  )}
                  {...(onRowClick ? { onClick: () => onRowClick(row) } : {})}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => {
                    const isFirst = cellIndex === 0;
                    const align = isFirst ? 'text-left' : 'text-right';
                    const meta = cell.column.columnDef.meta as { align?: string } | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'py-1 px-3 text-sm',
                          denseClass(dense),
                          meta?.align ?? align,
                          isFirst && 'max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-background',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            }

            // Expansion mode — colSpan siblings in same table, preserving column alignment
            return (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    'h-11 md:h-9 border-b border-border',
                    'cursor-pointer hover:bg-muted/30 transition-colors',
                    rowClass,
                  )}
                  onClick={() => onExpandedChange?.(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onExpandedChange?.(row.id);
                    }
                  }}
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-controls={`${row.id}-details`}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => {
                    const isFirst = cellIndex === 0;
                    const align = isFirst ? 'text-left' : 'text-right';
                    const meta = cell.column.columnDef.meta as { align?: string } | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'py-1 px-3 text-sm',
                          denseClass(dense),
                          meta?.align ?? align,
                          isFirst && 'max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-background',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
                {isExpanded && (
                  <tr id={`${row.id}-details`} key={`${row.id}-expand`} className="border-b border-border">
                    <td colSpan={columns.length} className="py-2 pl-8 pr-3 bg-muted/20">
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
