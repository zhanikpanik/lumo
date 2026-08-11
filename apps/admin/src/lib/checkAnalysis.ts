import type { Check } from '@/hooks/useInstantChecks';

// ─── Types ──────────────────────────────────────────────

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  /** seriousness of this finding */
  severity: Severity;
  /** short label (e.g. «Оплачено 0 при закрытом чеке») */
  reason: string;
  /** human-readable explanation with numbers */
  detail: string;
}

export interface CheckAnalysis {
  checkId: string;
  /** highest severity across all findings, null = clean */
  maxSeverity: Severity | null;
  findings: Finding[];
}

/** Stats computed per waiter for peer-comparison rules */
interface WaiterStats {
  waiter: string;
  checkCount: number;
  zeroPaidCount: number;
  zeroPaidRate: number;
  avgCheck: number;
  openCount: number;
}

/** Aggregate context needed for peer-comparison */
interface CheckContext {
  checks: Check[];
  waiterStats: Map<string, WaiterStats>;
  avgZeroPaidRate: number;
  avgCheckAmount: number;
}

// ─── Helpers ────────────────────────────────────────────

function subtotal(c: Check): number {
  return c.total;
}

function durationMinutes(c: Check): number | null {
  if (!c.closedAt) return null;
  const open = new Date(c.openedAt).getTime();
  const close = new Date(c.closedAt).getTime();
  if (isNaN(open) || isNaN(close)) return null;
  return (close - open) / 60_000;
}

function hoursSinceOpen(c: Check): number | null {
  const open = new Date(c.openedAt).getTime();
  if (isNaN(open)) return null;
  return (Date.now() - open) / 3_600_000;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Rule 1: Unpaid closed check ────────────────────────

function checkUnpaidClosed(c: Check): Finding | null {
  if (c.status !== 'closed') return null;
  if (c.paid > 0) return null;
  return {
    severity: 'critical',
    reason: 'Чек закрыт без оплаты',
    detail: 'Статус «Закрыт», но сумма оплаты — 0 сом. Возможно, чек закрыли в обход оплаты.',
  };
}

// ─── Rule 2: Table check closed too fast ────────────────

function checkTableCheckTooFast(c: Check): Finding | null {
  if (c.isQuickCheck) return null; // на вынос — нормально
  if (c.status !== 'closed') return null;
  const mins = durationMinutes(c);
  if (mins === null) return null;
  if (mins >= 2) return null;
  return {
    severity: 'warning',
    reason: 'Чек за столом закрыт менее чем за 2 минуты',
    detail: `Обслуживание за столом заняло ${Math.round(mins)} мин. Для зала это необычно быстро — проверьте, не фиктивный ли чек.`,
  };
}

// ─── Rule 3: Check open too long ────────────────────────

function checkOpenTooLong(c: Check): Finding | null {
  if (c.status !== 'open') return null;
  const hrs = hoursSinceOpen(c);
  if (hrs === null || hrs < 3) return null;
  return {
    severity: 'warning',
    reason: `Чек открыт более ${Math.round(hrs)} часов`,
    detail: c.isQuickCheck
      ? 'Быстрый чек висит открытым — возможно, забыли закрыть.'
      : `Стол ${c.tableNumber} открыт с ${new Date(c.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — затянувшееся обслуживание или забыли закрыть.`,
  };
}

// ─── Rule 4: Waiter has high zero-paid rate ─────────────

function checkWaiterZeroPaidRate(c: Check, ctx: CheckContext): Finding | null {
  if (c.status !== 'closed' || c.paid > 0) return null;
  const stats = ctx.waiterStats.get(c.waiter);
  if (!stats || stats.checkCount < 3) return null; // too few checks to judge
  // Only flag if this waiter has ≥2 zero-paid AND above-average rate
  if (stats.zeroPaidCount < 2) return null;
  if (stats.zeroPaidRate <= ctx.avgZeroPaidRate * 1.5) return null;
  return {
    severity: 'warning',
    reason: `${c.waiter}: много чеков без оплаты`,
    detail: `У официанта ${stats.zeroPaidCount} из ${stats.checkCount} чеков без оплаты (${Math.round(stats.zeroPaidRate * 100)}%). Среднее по всем — ${Math.round(ctx.avgZeroPaidRate * 100)}%. Проверьте причины.`,
  };
}

// ─── Rule 5: Waiter has unusually low average check ─────

function checkWaiterLowAvg(c: Check, ctx: CheckContext): Finding | null {
  if (c.status !== 'closed') return null;
  const stats = ctx.waiterStats.get(c.waiter);
  if (!stats || stats.checkCount < 3) return null;
  if (stats.avgCheck >= ctx.avgCheckAmount * 0.6) return null;
  const checkSubtotal = subtotal(c);
  // Only flag on checks that are themselves below average
  if (checkSubtotal >= ctx.avgCheckAmount * 0.6) return null;
  return {
    severity: 'info',
    reason: `${c.waiter}: чеки ниже среднего`,
    detail: `Средний чек официанта — ${Math.round(stats.avgCheck).toLocaleString('ru-RU')} сом (среднее по всем: ${Math.round(ctx.avgCheckAmount).toLocaleString('ru-RU')} сом). Возможно, недозаказ или фиктивные чеки.`,
  };
}

// ─── Rule 6: Waiter has too many open checks ────────────

function checkWaiterManyOpen(c: Check, ctx: CheckContext): Finding | null {
  if (c.status !== 'open') return null;
  const stats = ctx.waiterStats.get(c.waiter);
  if (!stats || stats.openCount < 4) return null;
  return {
    severity: 'info',
    reason: `${c.waiter}: много открытых чеков`,
    detail: `У официанта одновременно открыто ${stats.openCount} чеков. Возможно, не успевает закрывать или забывает.`,
  };
}

// ─── Rule set ───────────────────────────────────────────

type Rule = (c: Check, ctx: CheckContext) => Finding | null;

/** Rules that don't need cross-waiter context run first */
const ABSOLUTE_RULES: Rule[] = [
  checkUnpaidClosed,
  checkTableCheckTooFast,
  checkOpenTooLong,
];

/** Rules that compare against peer waiters */
const PEER_RULES: Rule[] = [
  checkWaiterZeroPaidRate,
  checkWaiterLowAvg,
  checkWaiterManyOpen,
];

// ─── Context builder ────────────────────────────────────

function buildContext(checks: Check[]): CheckContext {
  const waiterStats = new Map<string, WaiterStats>();
  const closedChecks = checks.filter((c) => c.status === 'closed');

  // Per-waiter stats
  for (const c of checks) {
    const w = c.waiter;
    if (!waiterStats.has(w)) {
      waiterStats.set(w, { waiter: w, checkCount: 0, zeroPaidCount: 0, zeroPaidRate: 0, avgCheck: 0, openCount: 0 });
    }
    const s = waiterStats.get(w)!;
    s.checkCount++;
    if (c.status === 'open') s.openCount++;
    if (c.status === 'closed' && c.paid === 0) s.zeroPaidCount++;
  }

  // Per-waiter avg check (from closed checks only)
  for (const c of closedChecks) {
    const s = waiterStats.get(c.waiter);
    if (!s) continue;
    const st = subtotal(c);
    // running average: accumulate
    const closedByThisWaiter = closedChecks.filter((x) => x.waiter === c.waiter).length;
    s.avgCheck = closedChecks
      .filter((x) => x.waiter === c.waiter)
      .reduce((sum, x) => sum + subtotal(x), 0) / Math.max(1, closedByThisWaiter);
  }

  // Zero-paid rates
  for (const s of waiterStats.values()) {
    s.zeroPaidRate = s.checkCount > 0 ? s.zeroPaidCount / s.checkCount : 0;
  }

  const allZeroPaidRates = [...waiterStats.values()].map((s) => s.zeroPaidRate);
  const allCheckAmounts = closedChecks.map((c) => subtotal(c));

  return {
    checks,
    waiterStats,
    avgZeroPaidRate: mean(allZeroPaidRates),
    avgCheckAmount: mean(allCheckAmounts),
  };
}

// ─── Public API ─────────────────────────────────────────

/**
 * Analyse every check and return findings.
 * Call once per render, pass the full checks array.
 */
export function analyzeChecks(checks: Check[]): Map<string, CheckAnalysis> {
  const ctx = buildContext(checks);
  const results = new Map<string, CheckAnalysis>();

  for (const c of checks) {
    const findings: Finding[] = [];

    for (const rule of ABSOLUTE_RULES) {
      const f = rule(c, ctx);
      if (f) findings.push(f);
    }

    // Peer rules only for waiters with ≥3 checks
    const stats = ctx.waiterStats.get(c.waiter);
    if (stats && stats.checkCount >= 3) {
      for (const rule of PEER_RULES) {
        const f = rule(c, ctx);
        if (f) findings.push(f);
      }
    }

    // Dedupe: keep only the highest-severity finding per reason prefix
    const deduped: Finding[] = [];
    for (const f of findings) {
      if (!deduped.some((d) => d.reason === f.reason)) {
        deduped.push(f);
      }
    }

    const maxSeverity = deduped.length === 0 ? null
      : deduped.some((f) => f.severity === 'critical') ? 'critical'
      : deduped.some((f) => f.severity === 'warning') ? 'warning'
      : 'info';

    results.set(c.id, { checkId: c.id, maxSeverity, findings: deduped });
  }

  return results;
}

/** Count checks by severity (for filter badges) */
export function countBySeverity(
  analyses: Map<string, CheckAnalysis>,
): { critical: number; warning: number; info: number; clean: number } {
  let critical = 0, warning = 0, info = 0, clean = 0;
  for (const a of analyses.values()) {
    if (!a.maxSeverity) clean++;
    else if (a.maxSeverity === 'critical') critical++;
    else if (a.maxSeverity === 'warning') warning++;
    else info++;
  }
  return { critical, warning, info, clean };
}

/** Human-readable severity label */
export function severityLabel(s: Severity): string {
  switch (s) {
    case 'critical': return 'Критичное';
    case 'warning': return 'Странное';
    case 'info': return 'Для информации';
  }
}

/** Tailwind classes for severity-colored left border */
export function severityBorderClass(s: Severity | null): string {
  if (!s) return 'border-l-transparent';
  switch (s) {
    case 'critical': return 'border-l-red-500';
    case 'warning': return 'border-l-amber-500';
    case 'info': return 'border-l-blue-400';
  }
}

/** Tailwind classes for severity-colored row background */
export function severityBgClass(s: Severity | null): string {
  if (!s) return '';
  switch (s) {
    case 'critical': return 'bg-red-50/30';
    case 'warning': return 'bg-amber-50/20';
    case 'info': return '';
  }
}
