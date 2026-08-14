import type { InstaQLParams } from '@instantdb/core';
import type { AppSchema } from './instant.schema.js';

/**
 * Operational query factories. Every query requires a venueId; the caller
 * (POS or admin) provides it from the active device session or selected venue.
 */

export function activeOrdersQuery(venueId: string) {
  return {
    orders: {
      $: { where: { status: 'active' as const, 'venue.id': venueId }, limit: 200 },
      ownerEmployee: {},
      table: {},
      shift: {},
      items: {},
      kitchenTickets: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function paidOrdersQuery(venueId: string) {
  return {
    orders: {
      $: {
        where: { status: 'paid' as const, 'venue.id': venueId },
        order: { openedAt: 'desc' as const },
        limit: 200,
      },
      ownerEmployee: {},
      payments: {},
      items: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function openShiftQuery(venueId: string) {
  return {
    shifts: {
      $: { where: { status: 'open' as const, 'venue.id': venueId }, limit: 2 },
      openedBy: {},
      payments: {},
      orders: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Returns the full ledger for the venue's inventory. Use with cursor pagination. */
export function inventoryMovementsQuery(venueId: string, limit = 200) {
  return {
    inventoryMovements: {
      $: {
        where: { 'venue.id': venueId },
        limit,
        order: { serverCreatedAt: 'desc' as const },
      },
      product: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function pendingFiscalReceiptsQuery(venueId: string) {
  return {
    fiscalReceipts: {
      $: { where: { status: 'pending' as const, 'venue.id': venueId }, limit: 200 },
      payment: { order: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function problemKitchenTicketsQuery(venueId: string) {
  return {
    kitchenTickets: {
      $: {
        where: { status: { $in: ['failed' as const, 'uncertain' as const] }, 'venue.id': venueId },
        order: { createdAt: 'desc' as const },
        limit: 200,
      },
      order: { ownerEmployee: {}, table: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function deviceAuditQuery(venueId: string) {
  return {
    devices: { $: { where: { 'venue.id': venueId } } },
    auditEvents: {
      $: { limit: 100, order: { serverCreatedAt: 'desc' as const }, where: { 'venue.id': venueId } },
      device: {},
      employee: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ═══ Admin queries ═══════════════════════════════════════════

/** All categories for a venue. */
export function adminCategoriesQuery(venueId: string) {
  return {
    categories: {
      $: { where: { 'venue.id': venueId }, order: { sortOrder: 'asc' as const } },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** All products (dishes + ingredients) for a venue, with their category. */
export function adminProductsQuery(venueId: string) {
  return {
    products: {
      $: { where: { 'venue.id': venueId }, order: { sortOrder: 'asc' as const } },
      category: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Dishes for a venue with recipe items (ingredient details) and modifier groups. */
export function adminDishesWithRecipesQuery(venueId: string) {
  return {
    products: {
      $: { where: { kind: 'dish' as const, 'venue.id': venueId }, order: { sortOrder: 'asc' as const } },
      category: {},
      modifierGroups: {},
      recipeItems: {
        ingredient: {},
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** All employees for a venue. */
export function adminEmployeesQuery(venueId: string) {
  return {
    employees: {
      $: { where: { 'venue.id': venueId } },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Zones with tables for a venue. */
export function adminZonesQuery(venueId: string) {
  return {
    zones: {
      $: { where: { 'venue.id': venueId }, order: { sortOrder: 'asc' as const } },
      tables: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

export interface HistoryPageOptions {
  from?: Date;
  limit?: number;
  offset?: number;
}

/** One bounded page of orders. Detail relations are loaded separately by order ID. */
export function adminAllOrdersQuery(
  venueId: string,
  { from, limit = 100, offset = 0 }: HistoryPageOptions = {},
) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { openedAt: { $gte: from } } : {}),
        },
        order: { openedAt: 'desc' as const },
        limit,
        offset,
      },
      ownerEmployee: {},
      table: {},
    },
    payments: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { createdAt: { $gte: from } } : {}),
        },
        order: { createdAt: 'desc' as const },
        limit: limit * 3,
      },
      order: {},
    },
    orderEvents: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { occurredAt: { $gte: from } } : {}),
        },
        order: { occurredAt: 'desc' as const },
        limit: limit * 20,
      },
      order: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Detail children for one expanded historical order. */
export function adminOrderDetailQuery(venueId: string, orderId: string) {
  return {
    orders: {
      $: { where: { id: orderId, 'venue.id': venueId }, limit: 1 },
      items: { product: {} },
      orderEvents: { $: { order: { occurredAt: 'asc' as const } } },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** One bounded page of shifts. */
export function adminAllShiftsQuery(
  venueId: string,
  { from, limit = 50, offset = 0 }: HistoryPageOptions = {},
) {
  return {
    shifts: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { openedAt: { $gte: from } } : {}),
        },
        order: { openedAt: 'desc' as const },
        limit,
        offset,
      },
      openedBy: {},
    },
    cashMovements: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { occurredAt: { $gte: from } } : {}),
        },
        order: { occurredAt: 'desc' as const },
        limit: limit * 20,
      },
      shift: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** One bounded page of cash movements. */
export function adminCashMovementsQuery(
  venueId: string,
  { from, limit = 100, offset = 0 }: HistoryPageOptions = {},
) {
  return {
    cashMovements: {
      $: {
        where: {
          'venue.id': venueId,
          ...(from ? { occurredAt: { $gte: from } } : {}),
        },
        order: { occurredAt: 'desc' as const },
        limit,
        offset,
      },
      shift: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ═══ Dashboard operational queries ════════════════════════════════
// Each query is bounded by venue + date range. No all-time queries.

/**
 * Orders paid today in the venue's local day.
 * Used for: today revenue, check count, average check.
 *
 * @param start ISO string — inclusive (venue local midnight UTC).
 * @param end   ISO string — exclusive (venue local midnight + 24h UTC).
 */
export function adminDashboardTodayPaidOrdersQuery(
  venueId: string,
  start: string,
  end: string,
) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          status: 'paid' as const,
          openedAt: { $gte: start, $lt: end } as any,
        },
      },
      payments: {},
      items: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Active + alert orders for live status.
 */
export function adminDashboardActiveOrdersQuery(venueId: string) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          status: { $in: ['active' as const, 'alert' as const] },
        },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Today's cash movements (inflow + outflow).
 */
export function adminDashboardCashMovementsQuery(
  venueId: string,
  start: string,
  end: string,
) {
  return {
    cashMovements: {
      $: {
        where: {
          'venue.id': venueId,
          occurredAt: { $gte: start, $lt: end } as any,
        },
        order: { occurredAt: 'desc' as const },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Active shift (open, no closed_at).
 */
export function adminDashboardActiveShiftQuery(venueId: string) {
  return {
    shifts: {
      $: {
        where: { 'venue.id': venueId, status: 'open' as const },
        order: { openedAt: 'desc' as const },
        limit: 1,
      },
      openedBy: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Yesterday's shifts for the venue.
 */
export function adminDashboardYesterdayShiftQuery(
  venueId: string,
  yesterdayStart: string,
  yesterdayEnd: string,
) {
  return {
    shifts: {
      $: {
        where: {
          'venue.id': venueId,
          openedAt: { $gte: yesterdayStart, $lt: yesterdayEnd } as any,
        },
        order: { openedAt: 'desc' as const },
        limit: 1,
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Yesterday's stuck orders (active/alert from yesterday).
 */
export function adminDashboardYesterdayStuckOrdersQuery(
  venueId: string,
  yesterdayStart: string,
  yesterdayEnd: string,
) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          status: { $in: ['active' as const, 'alert' as const] },
          openedAt: { $gte: yesterdayStart, $lt: yesterdayEnd } as any,
        },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Same weekday last week paid orders — for trend comparison.
 */
export function adminDashboardLastWeekSameDayOrdersQuery(
  venueId: string,
  lastWeekStart: string,
  lastWeekEnd: string,
) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          status: 'paid' as const,
          openedAt: { $gte: lastWeekStart, $lt: lastWeekEnd } as any,
        },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Today's order events for chronology feed.
 * Limited to the top N most recent.
 */
export function adminDashboardOrderEventsQuery(
  venueId: string,
  start: string,
  end: string,
  limit: number,
) {
  return {
    orderEvents: {
      $: {
        where: {
          'venue.id': venueId,
          occurredAt: { $gte: start, $lt: end } as any,
        },
        order: { occurredAt: 'desc' as const },
        limit,
      },
      order: {},
      actorEmployee: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Full inventory ledger for the venue — first page.
 * Subsequent pages use the cursor from the previous response.
 *
 * IMPORTANT: caller must paginate through all pages to get complete
 * inventory balance. Partial ledger = wrong stock numbers.
 */
export function adminDashboardInventoryPageQuery(
  venueId: string,
  limit: number,
  cursor?: any,
) {
  const base: any = {
    where: { 'venue.id': venueId },
    order: { serverCreatedAt: 'desc' as const },
    limit,
  };
  if (cursor) base.after = cursor;
  return {
    inventoryMovements: {
      $: base,
      product: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Ingredients with threshold set — for stock alerts.
 */
export function adminDashboardThresholdIngredientsQuery(venueId: string) {
  return {
    products: {
      $: {
        where: {
          'venue.id': venueId,
          kind: 'ingredient' as const,
          status: 'active' as const,
        },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Paid orders in an arbitrary date range — for week/month views.
 * Includes linked items (for top dishes) and payments (for food cost).
 */
export function adminDashboardPeriodPaidOrdersQuery(
  venueId: string,
  start: string,
  end: string,
) {
  return {
    orders: {
      $: {
        where: {
          'venue.id': venueId,
          status: 'paid' as const,
          openedAt: { $gte: start, $lt: end } as any,
        },
      },
      items: { product: {} },
      payments: {},
      shift: { openedBy: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Cash movements in a date range — for period expense sparkline.
 */
export function adminDashboardPeriodCashMovementsQuery(
  venueId: string,
  start: string,
  end: string,
) {
  return {
    cashMovements: {
      $: {
        where: {
          'venue.id': venueId,
          occurredAt: { $gte: start, $lt: end } as any,
        },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Dishes with recipe items — for food cost calculation of top dishes.
 * Client filters to the needed dish IDs from the result set.
 */
export function adminDashboardDishesWithRecipesQuery(venueId: string) {
  return {
    products: {
      $: {
        where: {
          'venue.id': venueId,
          kind: 'dish' as const,
        },
      },
      recipeItems: {
        ingredient: {},
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Shift at a specific date boundary — for yesterday comparison.
 */
export function adminDashboardShiftOnDateQuery(
  venueId: string,
  dayStart: string,
  dayEnd: string,
) {
  return {
    shifts: {
      $: {
        where: {
          'venue.id': venueId,
          openedAt: { $gte: dayStart, $lt: dayEnd } as any,
        },
        order: { openedAt: 'desc' as const },
        limit: 1,
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/**
 * Pre-aggregated daily stats for a venue — one row per day.
 * Used by the dashboard instead of client-side aggregation over raw orders.
 */
export function adminDashboardDailyStatsQuery(
  venueId: string,
  fromDay: string,
  toDay: string,
) {
  return {
    venueDailyStats: {
      $: {
        where: {
          'venue.id': venueId,
          day: { $gte: fromDay, $lte: toDay } as any,
        },
        order: { day: 'asc' as const },
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}
