/** Whole som for list display (avoids fractional som noise in tables). */
export function somRounded(n: number | null | undefined): number {
  return Math.round(Number(n) || 0);
}

export interface FormatSomOptions {
  sign?: boolean;
  suffix?: boolean;
  maximumFractionDigits?: number;
}

export function formatSom(
  value: number | null | undefined,
  { sign = false, suffix = true, maximumFractionDigits = 0 }: FormatSomOptions = {},
): string {
  const amount = Number(value) || 0;
  const formatted = Math.abs(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
  const prefix = amount < 0 ? '−' : sign && amount > 0 ? '+' : '';
  return `${prefix}${formatted}${suffix ? ' сом' : ''}`;
}

export function formatTiyin(
  value: number | null | undefined,
  options?: FormatSomOptions,
): string {
  return formatSom((Number(value) || 0) / 100, options);
}
