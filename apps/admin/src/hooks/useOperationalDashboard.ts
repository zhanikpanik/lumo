import { useMemo } from 'react';
import { getInstantClient } from '../data/instant';
import {
  activeOrdersQuery,
  openShiftQuery,
  pendingFiscalReceiptsQuery,
  problemKitchenTicketsQuery,
} from '@lumo/data';

/**
 * Reactive operational dashboard hook. Subscribes to InstantDB for
 * active orders, open shift, pending fiscal receipts, and stuck kitchen tickets
 * scoped to a single venue.
 */
export function useOperationalDashboard(venueId: string) {
  const db = getInstantClient();

  const activeOrders = db.useQuery(activeOrdersQuery(venueId));
  const openShift = db.useQuery(openShiftQuery(venueId));
  const pendingFiscal = db.useQuery(pendingFiscalReceiptsQuery(venueId));
  const problemTickets = db.useQuery(problemKitchenTicketsQuery(venueId));

  return useMemo(() => {
    const shift = openShift.data?.shifts?.[0];
    const payments = shift?.payments ?? [];
    const totalRevenueTiyin = payments.reduce((total, payment) => total + payment.amountTiyin, 0);
    const cashTotalTiyin = payments
      .filter((payment) => payment.method === 'cash')
      .reduce((total, payment) => total + payment.amountTiyin, 0);
    const cardTotalTiyin = payments
      .filter((payment) => payment.method === 'card')
      .reduce((total, payment) => total + payment.amountTiyin, 0);

    return {
      activeOrderCount: activeOrders.data?.orders?.length ?? 0,
      activeOrders: activeOrders.data?.orders ?? [],
      ordersLoading: activeOrders.isLoading,

      shift,
      shiftRevenue: shift ? {
        totalRevenueTiyin,
        cashTotalTiyin,
        cardTotalTiyin,
        totalOrders: payments.length,
      } : null,
      shiftLoading: openShift.isLoading,

      pendingFiscalCount: pendingFiscal.data?.fiscalReceipts?.length ?? 0,
      pendingFiscal: pendingFiscal.data?.fiscalReceipts ?? [],
      fiscalLoading: pendingFiscal.isLoading,

      problemTicketCount: problemTickets.data?.kitchenTickets?.length ?? 0,
      problemTickets: problemTickets.data?.kitchenTickets ?? [],
      ticketsLoading: problemTickets.isLoading,

      error: activeOrders.error ?? openShift.error ?? pendingFiscal.error ?? problemTickets.error,
    };
  }, [activeOrders, openShift, pendingFiscal, problemTickets]);
}
