/**
 * Chart theme — shared across all analytics charts.
 *
 * Semantic colors:
 *   Green  = revenue / profit / positive
 *   Red    = expenses / loss / negative
 *   Neutral = text, grid, background
 */

// ── Palette ──

/** Revenue bars fill */
export const CHART_GREEN = 'rgba(22, 163, 74, 0.45)';
/** Revenue bars hover */
export const CHART_GREEN_HOVER = 'rgba(22, 163, 74, 0.85)';
/** Revenue solid (tooltips, text) */
export const CHART_GREEN_SOLID = '#16A34A';

/** Expense bars fill */
export const CHART_RED = 'rgba(220, 38, 38, 0.35)';
/** Expense bars hover */
export const CHART_RED_HOVER = 'rgba(220, 38, 38, 0.75)';
/** Expense solid (tooltips, text) */
export const CHART_RED_SOLID = '#DC2626';

/** Net profit line / text */
export const CHART_DARK = '#1E293B';

/** Axis labels, muted text */
export const CHART_MUTED = '#64748B';

/** Grid lines */
export const CHART_GRID = '#E2E8F0';

/** Background accent (weekend shading) */
export const CHART_WEEKEND = 'rgba(0, 0, 0, 0.03)';

// ── Heatmap scale ──
/** Empty → busy: cool gray → warm orange → hot red */
export const HEATMAP_COLORS = ['#F1F5F9', '#FEF9C3', '#FDBA74', '#F97316', '#EF4444'];

// ── Weekly comparison ──
/** Past weeks fade from light to medium slate; current week = green */
export const WEEK_COLORS = ['#CBD5E1', '#94A3B8', '#64748B', CHART_GREEN_SOLID];
export const WEEK_WIDTHS = [1.2, 1.2, 1.8, 3];
export const WEEK_OPACITIES = [0.55, 0.65, 0.85, 1];

// ── Typography ──
export const CHART_FONT = "'Onest', system-ui, -apple-system, sans-serif";
export const CHART_FONT_SIZE = 12;   // axis labels (was 10-11)
export const CHART_FONT_SIZE_SM = 11; // small labels

// ── Tooltip ──
export const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  borderColor: '#E2E8F0',
  borderWidth: 1,
  textStyle: {
    color: CHART_DARK,
    fontSize: 13,
    fontFamily: CHART_FONT,
  },
} as const;

// ── Grid defaults ──
export const GRID_DEFAULTS = {
  top: 8,
  right: 16,
  bottom: 36,
  left: 56,
} as const;

// ── Shared axis style ──
export function axisLabelStyle(size = CHART_FONT_SIZE) {
  return {
    color: CHART_MUTED,
    fontSize: size,
    fontFamily: CHART_FONT,
  };
}

export function axisLineStyle() {
  return { lineStyle: { color: CHART_GRID } };
}

export function splitLineStyle() {
  return { lineStyle: { color: CHART_GRID, type: 'dashed' as const } };
}
