/**
 * Сетка позиций чека: 4 колонки — позиция (кол-во×название), цена, сумма, маржа.
 * Первая колонка max 12rem (без min(1fr,…) — в grid это часто ломает колонки и даёт один столбец).
 */
export const CHECK_ITEMS_TABLE_GRID =
  'grid grid-cols-[minmax(0,12rem)_3.25rem_4rem_4rem] gap-x-1.5 sm:gap-x-2 items-center';

export function checkItemPositionTitle(qty: number, name: string): string {
  return `${qty}× ${name}`;
}
