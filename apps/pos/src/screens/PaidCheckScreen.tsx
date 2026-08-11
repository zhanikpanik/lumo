import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Alert, Platform } from 'react-native';
import { PrinterIcon, RefreshIcon } from '../components/Icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme/colors';
import { usePosUiStore } from '../store/posUiStore';
import { useUserStore } from '../store/userStore';
import { useInstantShift } from '../store/useInstantShift';
import { Order, OrderItem } from '../types';
import { can } from '../utils/permissions';
import { refundedOrdersForShiftQuery } from '@lumo/data';
import { logger } from '../utils/logger';
import { getPrintAdapter } from '../print/printService';
import { getInstantClient, getVenueId } from '../data/instant';
import { cancelPosRefund, refundPosOrder } from '../data/posCommands';
import { useInstantOrder, useInstantOrders } from '../store/useInstantOrders';

const GAP = 8;
const COL_GAP = 8;
const PADDING = 8;

const formatAmount = (n: number) => (n / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const METHOD_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  qr: 'QR',
  other: 'Другое',
  none: 'Без оплаты',
};

interface Payment {
  method: string;
  amount: number;
  change_amount: number;
  close_reason: string | null;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
};

const lineUnitPrice = (item: OrderItem) =>
  item.product.price + item.modifiers.reduce((s, m) => s + m.price, 0);

const lineTotal = (item: OrderItem) => lineUnitPrice(item) * item.quantity;

const orderListPreview = (o: Order) =>
  o.items
    .map((i) => {
      const modPart = i.modifiers.map((m) => m.name).join(', ');
      return modPart ? `${i.product.name}: ${modPart}` : i.product.name;
    })
    .join(', ');

export const PaidCheckScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const db = getInstantClient();
  const venueId = getVenueId();
  const currentOrderId = usePosUiStore((s) => s.currentOrderId);
  const setCurrentOrderId = usePosUiStore((s) => s.setCurrentOrderId);
  const currentUser = useUserStore((s) => s.currentUser);
  const { openShift } = useInstantShift(currentUser?.id);

  const shiftId = openShift?.id;
  const { orders } = useInstantOrders(shiftId);
  const instantSelected = useInstantOrder(currentOrderId ?? undefined);

  const canRefund = can(currentUser?.role, 'refund');

  // Active refunds for the current shift — reactive InstantDB query.
  const refundQuery = openShift ? refundedOrdersForShiftQuery(venueId, openShift.id) : null;
  const { data: refundData } = db.useQuery(refundQuery);
  const refundedOrderIds = React.useMemo(() => {
    if (!refundData) return new Set<string>();
    const payments = refundData.payments as Array<Record<string, unknown>> ?? [];
    const fromPayments = payments
      .map((p) => ((p.order as Record<string, unknown>)?.id as string) ?? '')
      .filter((id) => id.length > 0);
    return new Set(fromPayments);
  }, [refundData]);

  // Closed orders for the current shift, including those that are currently
  // "active" only because the user refunded them (so cancel is reachable).
  const closedOrders = orders
    .filter((o) => {
      if (o.status === 'paid' || o.status === 'cancelled') return true;
      return o.status === 'active' && refundedOrderIds.has(o.id);
    })
    .sort((a, b) => ((b.closedAt ?? b.openedAt) > (a.closedAt ?? a.openedAt) ? 1 : -1));

  const initialOrder = instantSelected ?? closedOrders[0];
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialOrder ?? null);

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(true);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Re-sync the selected order with the store when it gets refreshed
  // (status flips paid <-> active after refund/cancel).
  useEffect(() => {
    if (!selectedOrder) return;
    const updated = orders.find((o) => o.id === selectedOrder.id);
    if (updated && updated !== selectedOrder) {
      setSelectedOrder(updated);
    }
  }, [orders, selectedOrder?.id]);

  useEffect(() => {
    if (!selectedOrder) return;
    setLoadingPayment(true);
    setPayment(null);

    db.queryOnce({
      payments: {
        $: { where: { order: selectedOrder.id } },
      },
    }).then(({ data }) => {
      const p = data?.payments?.[0] as Record<string, unknown> | undefined;
      if (p) {
        setPayment({
          method: p.method as string,
          amount: p.amountTiyin as number,
          change_amount: (p.changeTiyin as number) ?? 0,
          close_reason: (p.closeReason as string) ?? null,
        });
      }
      setLoadingPayment(false);
    }).catch(() => {
      setLoadingPayment(false);
    });
  }, [selectedOrder?.id]);

  const isRefundedSelected = !!selectedOrder && refundedOrderIds.has(selectedOrder.id);

  const handleBack = () => {
    setCurrentOrderId(null);
    navigation?.navigate('Orders');
  };

  const refundErrorMessage = (err: string): string => {
    switch (err) {
      case 'refund_rpc_disabled':
        return 'Возврат временно недоступен. Попробуйте позже.';
      case 'shift_not_open':
      case 'shift_required':
        return 'Смена не открыта. Откройте смену и повторите.';
      case 'shift_mismatch':
        return 'Заказ относится к другой смене — возврат запрещён.';
      case 'order_not_paid':
        return 'Заказ уже не оплачен — возврат недоступен.';
      case 'order_not_found':
        return 'Заказ не найден.';
      case 'no_qualifying_payment':
        return 'Нет подходящего платежа для возврата.';
      case 'actor_forbidden_role':
      case 'actor_not_allowed':
      case 'forbidden':
        return 'Недостаточно прав для возврата.';
      default:
        return `Не удалось выполнить возврат: ${err}`;
    }
  };

  const cancelErrorMessage = (err: string): string => {
    switch (err) {
      case 'refund_rpc_disabled':
        return 'Отмена возврата временно недоступна.';
      case 'shift_not_open':
        return 'Смена возврата уже закрыта — отменить нельзя.';
      case 'order_not_active':
        return 'Заказ уже не в состоянии возврата.';
      case 'refund_not_found':
        return 'Запись о возврате не найдена.';
      case 'no_refunded_payment':
        return 'Не найден возвращённый платёж.';
      case 'order_items_changed_after_refund':
        return 'Позиции чека изменились после возврата — отменить нельзя. Создайте новый заказ.';
      case 'order_total_changed_after_refund':
        return 'Сумма чека изменилась после возврата — отменить нельзя.';
      case 'actor_forbidden_role':
      case 'actor_not_allowed':
      case 'forbidden':
        return 'Недостаточно прав для отмены возврата.';
      default:
        return `Не удалось отменить возврат: ${err}`;
    }
  };

  const runRefund = async () => {
    if (!selectedOrder) return;
    if (isRefunding) return;
    if (!canRefund) return;
    if (!openShift) {
      Alert.alert('Смена не открыта', 'Сначала откройте смену.');
      navigation?.replace('OpenShift');
      return;
    }

    try {
      setIsRefunding(true);
      const operationId = `refund-${selectedOrder.id}-${Date.now()}`;
      await refundPosOrder({
        operationId,
        shiftId: openShift.id,
        orderId: selectedOrder.id,
        actorEmployeeId: currentUser?.id ?? '',
        reason: 'Возврат через экран закрытых заказов',
      });

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      logger.error('paidCheck.refund', e instanceof Error ? e : String(e));
      Alert.alert('Ошибка возврата', `Не удалось выполнить возврат: ${msg}`);
    } finally {
      setIsRefunding(false);
    }
  };

  const runCancelRefund = async () => {
    if (!selectedOrder) return;
    if (isCancelling) return;
    if (!canRefund) return;
    if (!openShift) {
      Alert.alert('Смена не открыта', 'Сначала откройте смену.');
      navigation?.replace('OpenShift');
      return;
    }

    try {
      setIsCancelling(true);
      const operationId = `cancel-refund-${selectedOrder.id}-${Date.now()}`;
      await cancelPosRefund({
        operationId,
        shiftId: openShift.id,
        orderId: selectedOrder.id,
        actorEmployeeId: currentUser?.id ?? '',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      logger.error('paidCheck.cancelRefund', e instanceof Error ? e : String(e));
      Alert.alert('Не удалось отменить возврат', `Не удалось отменить возврат: ${msg}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmAction = (
    title: string,
    message: string,
    confirmLabel: string,
    onAccept: () => void,
  ) => {
    if (Platform.OS === 'web') {
      const accepted = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
      if (accepted) onAccept();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onAccept },
    ]);
  };

  const handleRefund = () => {
    if (!selectedOrder || !payment) return;
    if (isRefunding) return;

    const methodLabel = METHOD_LABEL[payment.method] ?? payment.method;
    const isCardLike = payment.method === 'card' || payment.method === 'qr';
    const extraHint = isCardLike
      ? '\n\nВнимание: возврат на карту/QR клиенту пока выполняется вручную (терминал и фискализация будут подключены позже).'
      : '';
    const message =
      `Заказ #${selectedOrder.number} будет переоткрыт, а сумма ${formatAmount(selectedOrder.totalAmount)} c ` +
      `(${methodLabel}) будет компенсирована в учете.${extraHint}`;

    confirmAction('Подтвердите возврат', message, 'Выполнить возврат', () => {
      void runRefund();
    });
  };

  const handleCancelRefund = () => {
    if (!selectedOrder) return;
    if (isCancelling) return;
    const message =
      `Возврат заказа #${selectedOrder.number} будет отменён. ` +
      `Сумма ${formatAmount(selectedOrder.totalAmount)}c вернётся в выручку смены, ` +
      `а списания склада восстановятся. ` +
      `Если позиции чека менялись после возврата — отмена будет отклонена.`;
    confirmAction('Отменить возврат?', message, 'Отменить возврат', () => {
      void runCancelRefund();
    });
  };

  const handlePrintReceipt = async () => {
    if (!selectedOrder || isPrinting) return;

    try {
      setIsPrinting(true);
      const adapter = getPrintAdapter();
      const lines = selectedOrder.items.map((item) => {
        const unitPrice = item.product.price + item.modifiers.reduce((s, m) => s + m.price, 0);
        return {
          name: item.product.name,
          quantity: item.quantity,
          modifiers: item.modifiers.map((m) => m.name),
          comment: item.comment,
        };
      });

      const outcome = await adapter.print({
        ticketId: `receipt-${selectedOrder.id}-${Date.now()}`,
        orderNumber: selectedOrder.number,
        table: selectedOrder.tableNumber || '',
        snapshot: { kind: 'initial', lines },
        attempt: 1,
        createdAt: new Date().toISOString(),
      });

      if (outcome === 'printed') {
        Alert.alert('Чек напечатан', `Заказ #${selectedOrder.number}`);
      } else if (outcome === 'failed') {
        Alert.alert('Ошибка печати', 'Не удалось отправить чек на принтер. Проверьте подключение.');
      } else {
        Alert.alert('Печать', 'Чек отправлен, но статус неизвестен.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      logger.error('paidCheck.print', err);
      Alert.alert('Ошибка печати', msg);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>

        {/* ═══ HEADER ═══ */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Закрытые заказы</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* ═══ MAIN ═══ */}
        <View style={styles.mainRow}>

          {/* ── Left: Closed orders list ── */}
          <View style={styles.leftCol}>
            <View style={styles.listPanel}>
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {closedOrders.length === 0 && (
                  <Text style={styles.emptyText}>Нет закрытых заказов</Text>
                )}
                {closedOrders.map((o) => {
                  const isRefunded = refundedOrderIds.has(o.id);
                  return (
                  <TouchableOpacity
                    key={o.id}
                    style={[
                      styles.listRow,
                      selectedOrder?.id === o.id && styles.listRowSelected,
                      o.status === 'cancelled' && styles.listRowCancelled,
                    ]}
                    onPress={() => setSelectedOrder(o)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.listRowTop}>
                      <Text style={styles.listRowNum}>#{o.number}</Text>
                      <Text style={styles.listRowAmount}>{formatAmount(o.totalAmount)} c</Text>
                    </View>
                    <View style={styles.listRowSubRow}>
                      <Text style={styles.listRowSub}>
                        {o.tableNumber ? `Стол ${o.tableNumber}` : 'Быстрый чек'}{' · '}{formatTime(o.closedAt ?? o.openedAt)}
                      </Text>
                      {isRefunded && (
                        <View style={styles.refundChip}>
                          <Text style={styles.refundChipText}>Возврат</Text>
                        </View>
                      )}
                    </View>
                    {o.items.length > 0 ? (
                      <View style={styles.listRowPreviewWrap}>
                        <Text style={styles.listRowPreview} numberOfLines={2}>
                          {orderListPreview(o)}
                        </Text>
                        <LinearGradient
                          colors={[selectedOrder?.id === o.id ? 'transparent' : 'transparent', selectedOrder?.id === o.id ? theme.colors.surfaceLight : theme.colors.surface]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.listRowFade}
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <View style={{ width: COL_GAP }} />

          {/* ── Right: Selected order detail ── */}
          <View style={styles.rightCol}>
            {!selectedOrder ? (
              <View style={styles.emptyDetail}>
                <Text style={styles.emptyText}>Выберите заказ</Text>
              </View>
            ) : (
              <View style={styles.detailPanel}>
                {/* Meta */}
                <View style={styles.metaBlock}>
                  <View style={[
                    styles.badge,
                    selectedOrder.status === 'cancelled'
                      ? styles.badgeCancelled
                      : isRefundedSelected
                        ? styles.badgeRefunded
                        : styles.badgePaid,
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      selectedOrder.status === 'cancelled'
                        ? styles.badgeCancelledText
                        : isRefundedSelected
                          ? styles.badgeRefundedText
                          : styles.badgePaidText,
                    ]}>
                      {selectedOrder.status === 'cancelled'
                        ? 'Без оплаты'
                        : isRefundedSelected
                          ? 'Возврат'
                          : 'Оплачен'}
                    </Text>
                  </View>
                  <Text style={styles.metaLabel}>Заказ #{selectedOrder.number}</Text>
                  <View style={styles.metaRow}>
                    {selectedOrder.openedAt ? <Text style={styles.metaValue}>{formatDateTime(selectedOrder.openedAt)}</Text> : null}
                    {selectedOrder.closedAt ? <Text style={styles.metaDot}>→</Text> : null}
                    {selectedOrder.closedAt ? <Text style={styles.metaValue}>{formatDateTime(selectedOrder.closedAt)}</Text> : null}
                  </View>
                  <View style={styles.metaRow}>
                    {selectedOrder.waiter ? <Text style={styles.metaValue}>{selectedOrder.waiter}</Text> : null}
                    {selectedOrder.zone ? <Text style={styles.metaDot}>·</Text> : null}
                    {selectedOrder.zone ? <Text style={styles.metaValue}>{selectedOrder.zone}</Text> : null}
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Items */}
                <View style={styles.itemsListWrap}>
                  <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={true}>
                    {selectedOrder.items.length === 0 && (
                      <Text style={styles.emptyText}>Нет позиций</Text>
                    )}
                    {selectedOrder.items.map((item) => (
                      <View key={item.id} style={styles.itemBlock}>
                        <View style={styles.itemRow}>
                          <Text style={styles.itemQty}>{item.quantity}×</Text>
                          <View style={styles.itemNameCol}>
                            <Text style={styles.itemName}>{item.product.name}</Text>
                            {item.modifiers.map((m) => (
                              <Text key={m.id} style={styles.modLine}>+ {m.name}</Text>
                            ))}
                          </View>
                          <Text style={styles.itemPrice}>{formatAmount(lineTotal(item))} c</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.divider} />

                {/* Total */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Итого</Text>
                  <Text style={styles.totalAmount}>{formatAmount(selectedOrder.totalAmount)} c</Text>
                </View>

                {/* Payment */}
                {loadingPayment ? (
                  <ActivityIndicator color="#00C853" style={{ marginTop: 8 }} />
                ) : payment ? (
                  <View style={styles.paymentBlock}>
                    <View style={styles.paymentRow}>
                      <Text style={styles.paymentLabel}>Оплата</Text>
                      <Text style={styles.paymentValue}>{METHOD_LABEL[payment.method] ?? payment.method}</Text>
                    </View>
                    {payment.method === 'cash' && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Сдача</Text>
                        <Text style={styles.paymentValue}>{formatAmount(payment.change_amount)} c</Text>
                      </View>
                    )}
                    {payment.method === 'none' && payment.close_reason && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Причина</Text>
                        <Text style={styles.paymentValue}>{payment.close_reason}</Text>
                      </View>
                    )}
                  </View>
                ) : null}

                <View style={styles.divider} />

                {/* Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1 }, isPrinting && styles.refundBtnDisabled]}
                    onPress={() => void handlePrintReceipt()}
                    disabled={isPrinting}
                  >
                    {isPrinting ? (
                      <ActivityIndicator color={theme.colors.textPrimary} size="small" />
                    ) : (
                      <PrinterIcon size={18} color={theme.colors.textPrimary} />
                    )}
                    <Text style={styles.actionText}>{isPrinting ? 'Печать...' : 'Напечатать чек'}</Text>
                  </TouchableOpacity>

                  {isRefundedSelected && canRefund && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.cancelRefundBtn,
                        isCancelling && styles.refundBtnDisabled,
                        { flex: 1 },
                      ]}
                      onPress={handleCancelRefund}
                      disabled={isCancelling}
                    >
                      {isCancelling ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <RefreshIcon size={18} color="#fff" />
                          <Text style={styles.refundText}>Отменить возврат</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {!isRefundedSelected && selectedOrder.status !== 'cancelled' && canRefund && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.refundBtn,
                        isRefunding && styles.refundBtnDisabled,
                        { flex: 1 },
                      ]}
                      onPress={handleRefund}
                      disabled={isRefunding || loadingPayment}
                    >
                      {isRefunding ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <RefreshIcon size={18} color="#fff" />
                          <Text style={styles.refundText}>Возврат</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
  root: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    paddingHorizontal: PADDING,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 80 },
  backBtn: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borderRadius,
    minWidth: 120,
  },
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

  // Main layout
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: PADDING,
    paddingBottom: PADDING,
    minHeight: 0,
  },
  leftCol: { flex: 0.28, minHeight: 0 },
  rightCol: { flex: 0.72, minHeight: 0 },

  // Left: order list
  listPanel: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: 4,
  },
  listScroll: { ...StyleSheet.absoluteFillObject },
  listScrollContent: { padding: 4 },
  listRow: {
    flexDirection: 'column',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius,
    marginBottom: 2,
    gap: 2,
  },
  listRowSelected: { backgroundColor: theme.colors.surfaceLight },
  listRowCancelled: { opacity: 0.6 },
  listRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listRowNum: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  listRowAmount: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  listRowSub: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, flex: 1 },
  listRowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refundChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: theme.colors.badgeRefunded,
  },
  refundChipText: { color: theme.colors.warning, fontSize: 16, fontFamily: theme.fonts.medium },
  listRowPreviewWrap: { overflow: 'hidden', position: 'relative' },
  listRowPreview: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, opacity: 0.8 },
  listRowFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40 },

  // Right: detail panel
  detailPanel: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: PADDING,
  },
  emptyDetail: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius,
    marginBottom: 6,
  },
  badgePaid: { backgroundColor: theme.colors.badgePaid },
  badgePaidText: { color: theme.colors.accent },
  badgeCancelled: { backgroundColor: theme.colors.badgeCancelled },
  badgeCancelledText: { color: theme.colors.warningSubtle },
  badgeRefunded: { backgroundColor: theme.colors.badgeRefunded },
  badgeRefundedText: { color: theme.colors.warning },
  badgeText: { fontSize: 16, fontFamily: theme.fonts.medium },

  metaBlock: { gap: 3, marginBottom: 10 },
  metaLabel: { color: theme.colors.textPrimary, fontSize: 19, fontFamily: theme.fonts.medium },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaValue: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  metaDot: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  divider: { height: 1, backgroundColor: theme.colors.subtleBorder, marginVertical: 10 },

  itemsListWrap: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  itemsList: { ...StyleSheet.absoluteFillObject },
  emptyText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, padding: 8 },
  itemBlock: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.hairlineBorder },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, gap: 8 },
  itemQty: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, width: 30, paddingTop: 2 },
  itemNameCol: { flex: 1, minWidth: 0 },
  itemName: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular },
  modLine: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, marginTop: 2 },
  itemPrice: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium, paddingTop: 2 },

  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalLabel: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  totalAmount: { color: theme.colors.textPrimary, fontSize: 19, fontFamily: theme.fonts.medium },

  paymentBlock: { gap: 5 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentLabel: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  paymentValue: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

  actionsRow: {
    flexDirection: 'row',
    gap: GAP,
    marginTop: GAP,
  },
  actionBtn: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 14,
  },
  actionText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  refundBtn: { backgroundColor: theme.colors.destructive },
  cancelRefundBtn: { backgroundColor: theme.colors.infoOrange },
  refundBtnDisabled: { opacity: 0.55 },
  refundText: { color: '#fff', fontSize: 16, fontFamily: theme.fonts.medium },

});
