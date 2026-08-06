import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, Alert } from 'react-native';
import { theme } from '../theme/colors';
import { Numpad } from '../components/Numpad';
import { usePosUiStore } from '../store/posUiStore';
import { useShiftStore } from '../store/shiftStore';
import { can } from '../utils/permissions';
import { formatTiyin as formatAmount } from '../utils/money';
import { getInstantClient, getDeviceId, getVenueId } from '../data/instant';
import { payOrder as payOrderCommand, cancelOrder, DomainError, type PayableOrder } from '@lumo/data';
import { useInstantOrder } from '../store/useInstantOrders';

type PaymentMethod = 'cash' | 'card' | 'none';

const CLOSE_REASONS = [
  'За счёт заведения',
  'Ошибка официанта',
  'Ошибка кухни',
  'Гость ушёл',
  'Другое',
];

export const PaymentScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const currentOrderId = usePosUiStore((s) => s.currentOrderId);
  const setCurrentOrderId = usePosUiStore((s) => s.setCurrentOrderId);
  const currentUser = useShiftStore((s) => s.currentUser);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState('');
  const [printReceipt, setPrintReceipt] = useState(true);
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Live order data from InstantDB
  const order = useInstantOrder(currentOrderId ?? undefined);
  const total = order?.totalAmount ?? 0;
  // totalSom is for user-facing comparisons (cash input is in som)
  const totalSom = Math.round(total / 100);
  const canCloseWithoutPayment = can(currentUser?.role, 'closeWithoutPayment');
  const cashAmount = cashInput ? parseInt(cashInput, 10) : 0;
  const change = cashAmount > totalSom ? cashAmount - totalSom : 0;
  const canPay = method === 'card'
    || (method === 'none' && canCloseWithoutPayment && closeReason !== null)
    || (method === 'cash' && cashAmount >= totalSom);

  const handleExact = () => {
    setCashInput(String(totalSom));
  };

  // ── InstantDB payment path: atomic payOrder command ──
  const handlePayInstant = async (
    orderId: string,
    shiftId: string,
    payMethod: PaymentMethod,
    payTotal: number,
    payCashAmount: number,
    payCloseReason: string | null,
  ) => {
    const db = getInstantClient();
    const currentUser = useShiftStore.getState().currentUser;

    // Query order from InstantDB to get consumptionSnapshotJson
    const { data: orderData } = await db.queryOnce({ orders: { $: { where: { id: orderId } }, items: {} } });
    const instantOrder = orderData?.orders?.[0];
    if (!instantOrder) throw new Error('Order not found in InstantDB');

    const payableOrder: PayableOrder = {
      id: instantOrder.id,
      status: instantOrder.status ?? 'active',
      totalAmountTiyin: instantOrder.totalAmountTiyin ?? payTotal,
      items: (instantOrder.items ?? []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        consumptionSnapshotJson: (item.consumptionSnapshotJson as string) ?? '{"consumption":[]}',
      })),
    };
    const deviceId = getDeviceId();
    const venueId = getVenueId();
    const operationId = `payment-${orderId}-${Date.now()}`;
    const now = new Date().toISOString();

    if (payMethod === 'none') {
      await cancelOrder(db, {
        operationId,
        venueId,
        deviceId,
        actorEmployeeId: currentUser?.id ?? 'unknown',
        orderId,
        closeReason: payCloseReason ?? 'Без оплаты',
        clientTimestamp: now,
      }, { id: orderId, status: instantOrder.status ?? 'active' }).execute();
    } else {
      await payOrderCommand(db, {
        operationId,
        venueId,
        shiftId,
        orderId,
        deviceId,
        actorEmployeeId: currentUser?.id ?? 'unknown',
        method: payMethod,
        tenderedCashTiyin: payMethod === 'cash' ? payCashAmount : undefined,
        clientTimestamp: now,
      }, payableOrder).execute();
    }

    // Fire-and-forget: update daily stats
    if (payMethod !== 'none') {
      const venueDay = now.slice(0, 10);
      const statsId = `venue-daily-stats-${venueId}-${venueDay}`;
      let currentRevenue = 0;
      let currentOrderCount = 0;
      let currentFoodCost = 0;
      try {
        const { data: existingStats } = await db.queryOnce({
          venueDailyStats: { $: { where: { id: statsId } } },
        });
        const stats = existingStats?.venueDailyStats?.[0];
        if (stats) {
          currentRevenue = stats.revenueTiyin ?? 0;
          currentOrderCount = stats.orderCount ?? 0;
          currentFoodCost = stats.foodCostTiyin ?? 0;
        }
      } catch { /* best-effort */ }
      db.transact(
        db.tx.venueDailyStats[statsId]
          .update({
            day: venueDay,
            revenueTiyin: currentRevenue + payTotal,
            orderCount: currentOrderCount + 1,
            foodCostTiyin: currentFoodCost,
            updatedAt: now,
          })
          .link({ venue: venueId }),
      ).catch(() => undefined);
    }
  };

  const handlePay = async () => {
    if (isProcessing) return;
    if (!canPay || !currentOrderId) return;
    if (method === 'none' && !canCloseWithoutPayment) return;

    const shiftId = useShiftStore.getState().currentShift?.id ?? null;
    if (!shiftId) {
      Alert.alert('Смена не открыта', 'Сначала откройте смену.');
      navigation?.replace('OpenShift');
      return;
    }
    setIsProcessing(true);
    try {
      await handlePayInstant(currentOrderId, shiftId, method, total, cashAmount * 100, closeReason);
      setCurrentOrderId(null);
      if (method !== 'none') {
        navigation?.replace('Orders');
      } else {
        navigation?.navigate('Orders');
      }
    } catch (e: unknown) {
      // DomainError from @lumo/data — machine-readable error codes
      if (e instanceof DomainError) {
        const messages: Record<string, string> = {
          order_already_paid: 'Заказ уже оплачен другим терминалом.',
          order_already_cancelled: 'Заказ уже отменён.',
          order_not_found: 'Заказ не найден. Возможно, он был удалён.',
          shift_not_found: 'Смена не найдена. Откройте смену.',
          invalid_payment_amount: 'Неверная сумма оплаты.',
          network_unavailable: 'Нет соединения с сервером. Проверьте интернет.',
          duplicate_operation: 'Операция уже выполнена.',
          permission_denied: 'Недостаточно прав для оплаты.',
        };
        Alert.alert('Ошибка', messages[e.code] ?? e.message);
        if (e.code === 'order_already_paid' || e.code === 'order_not_found' || e.code === 'order_already_cancelled') {
          navigation?.replace('Orders');
        }
        return;
      }
      // Network errors — no connection
      const msg = e instanceof Error ? e.message : 'Не удалось провести оплату';
      if (
        e instanceof TypeError ||
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('Network') ||
        msg.includes('abort')
      ) {
        Alert.alert('Нет соединения', 'Проверьте подключение к интернету и повторите попытку.');
        return;
      }
      // Legacy string-matching fallback
      if (msg.includes('already paid') || msg.includes('unique-idempotency')) {
        Alert.alert('Заказ уже оплачен', 'Другой терминал уже провёл оплату этого заказа.');
        navigation?.replace('Orders');
      } else if (msg.includes('not found') || msg.includes('order_not_found')) {
        Alert.alert('Заказ не найден', 'Возможно, заказ был удалён.');
        navigation?.replace('Orders');
      } else {
        Alert.alert('Ошибка оплаты', msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    navigation?.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        {/* ── Left Panel ── */}
        <View style={styles.leftPanel}>
          {/* Total */}
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Итого</Text>
            <Text style={styles.totalAmount}>{formatAmount(total)} c</Text>
          </View>

          {/* Payment method */}
          <View style={styles.methodSection}>
            <TouchableOpacity
              style={[styles.methodBtn, method === 'cash' && styles.methodActive]}
              onPress={() => { setMethod('cash'); setCashInput(''); setCloseReason(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.methodText, method === 'cash' && styles.methodTextActive]}>
                Наличные
              </Text>
            </TouchableOpacity>
            <View style={{ width: 8 }} />
            <TouchableOpacity
              style={[styles.methodBtn, method === 'card' && styles.methodActive]}
              onPress={() => { setMethod('card'); setCloseReason(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.methodText, method === 'card' && styles.methodTextActive]}>
                Карта
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.methodSection}>
            <TouchableOpacity
              style={[
                styles.methodBtn,
                method === 'none' && styles.methodActiveRed,
                !canCloseWithoutPayment && styles.methodBtnDisabled,
              ]}
              onPress={() => {
                if (!canCloseWithoutPayment) return;
                setMethod('none');
                setCashInput('');
                setCloseReason(null);
              }}
              disabled={!canCloseWithoutPayment}
              activeOpacity={0.7}
            >
              <Text style={[styles.methodText, method === 'none' && styles.methodTextActive]}>
                Без оплаты
              </Text>
            </TouchableOpacity>
          </View>
          {!canCloseWithoutPayment && (
            <Text style={styles.permissionHint}>Без оплаты доступно только кассиру</Text>
          )}

          {/* Cash change info */}
          {method === 'cash' && cashAmount > 0 && cashAmount >= total && (
            <View style={styles.changeSection}>
              <Text style={styles.changeLabel}>Сдача</Text>
              <Text style={styles.changeAmount}>{formatAmount(change)} c</Text>
            </View>
          )}

          {/* Print receipt toggle */}
          <TouchableOpacity
            style={styles.receiptToggle}
            onPress={() => setPrintReceipt(!printReceipt)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, printReceipt && styles.checkboxChecked]}>
              {printReceipt && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.receiptText}>Напечатать чек</Text>
          </TouchableOpacity>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, isProcessing && styles.payBtnDisabled]}
              onPress={handleCancel}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
            <View style={{ width: 8 }} />
            {method === 'none' ? (
              <TouchableOpacity
                style={[styles.payBtnRed, (!canPay || isProcessing) && styles.payBtnDisabled]}
                onPress={handlePay}
                disabled={!canPay || isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.payText}>
                  {isProcessing ? 'Закрываем...' : 'Закрыть без оплаты'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.payBtn, (!canPay || isProcessing) && styles.payBtnDisabled]}
                onPress={handlePay}
                disabled={!canPay || isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.payText}>
                  {isProcessing ? 'Обработка...' : 'Оплатить'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Right Panel: Numpad ── */}
        <View style={styles.rightPanel}>
          {method === 'cash' ? (
            <Numpad
              mode="amount"
              value={cashInput}
              onChange={setCashInput}
              currency="c"
              maxDigits={7}
            >
              {/* Exact amount — between value and keys */}
              <TouchableOpacity
                style={[styles.exactBtn, { borderRadius: 0 }]}
                onPress={handleExact}
                activeOpacity={0.6}
              >
                <Text style={styles.exactText}>Без сдачи — {formatAmount(total)} c</Text>
              </TouchableOpacity>
            </Numpad>
          ) : method === 'card' ? (
            <View style={styles.cardMode}>
              <Text style={styles.cardIcon}>💳</Text>
              <Text style={styles.cardTitle}>Оплата картой</Text>
              <Text style={styles.cardAmount}>{formatAmount(total)} c</Text>
              <Text style={styles.cardHint}>Приложите карту к терминалу</Text>
            </View>
          ) : (
            <View style={styles.reasonPanel}>
              <Text style={styles.reasonTitle}>Укажите причину</Text>
              {CLOSE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonBtn, closeReason === reason && styles.reasonBtnActive]}
                  onPress={() => setCloseReason(reason)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.reasonText, closeReason === reason && styles.reasonTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const GAP = 2;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, flexDirection: 'row', padding: 16 },

  // Left panel
  leftPanel: {
    flex: 0.4,
    marginRight: 16,
  },
  totalSection: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    padding: 24,
    marginBottom: 16,
  },
  totalLabel: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    marginBottom: 8,
  },
  totalAmount: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontFamily: theme.fonts.medium,
  },

  methodSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    height: 56,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  methodActiveRed: {
    backgroundColor: theme.colors.destructive,
  },
  methodText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  methodTextActive: {
    color: theme.colors.white,
    fontFamily: theme.fonts.medium,
  },
  methodBtnDisabled: {
    opacity: 0.45,
  },
  permissionHint: {
    color: theme.colors.warningSubtle,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    marginBottom: 12,
  },

  changeSection: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeLabel: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  changeAmount: {
    color: theme.colors.accent,
    fontSize: 28,
    fontFamily: theme.fonts.medium,
  },

  receiptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    padding: 16,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.actionMenuPurple,
    borderColor: theme.colors.actionMenuPurple,
  },
  checkmark: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  receiptText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },

  actionRow: {
    flexDirection: 'row',
    height: 56,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: theme.colors.destructive,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  payBtn: {
    flex: 1.5,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtnRed: {
    flex: 1.5,
    backgroundColor: theme.colors.destructive,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtnDisabled: {
    opacity: 0.4,
  },
  payText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },

  // Right panel
  rightPanel: {
    flex: 0.6,
  },

  numpadDisplay: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    backgroundColor: theme.colors.numpadBg,
    borderRadius: theme.borderRadius,
    padding: 24,
    marginBottom: 8,
  },
  displayValue: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontFamily: theme.fonts.regular,
  },
  displayCurrency: {
    color: theme.colors.textSecondary,
    fontSize: 24,
    fontFamily: theme.fonts.regular,
    marginLeft: 8,
  },

  quickRow: {
    marginBottom: 8,
  },
  exactBtn: {
    height: 48,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exactText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },

  numpad: {
    flex: 1,
  },
  numRow: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: GAP,
  },
  keyWrap: {
    flex: 1,
    marginHorizontal: GAP / 2,
  },
  key: {
    flex: 1,
    backgroundColor: theme.colors.numpadBg,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontFamily: theme.fonts.regular,
  },

  // Card mode
  cardMode: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.numpadBg,
    borderRadius: theme.borderRadius,
  },
  cardIcon: {
    fontSize: 64,
      fontFamily: theme.fonts.regular,
    marginBottom: 16,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontFamily: theme.fonts.medium,
    marginBottom: 8,
  },
  cardAmount: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontFamily: theme.fonts.medium,
    marginBottom: 16,
  },
  cardHint: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  confirmWarning: {
    color: theme.colors.destructiveLight,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  reasonPanel: {
    flex: 1,
    padding: 16,
  },
  reasonTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    marginBottom: 16,
  },
  reasonBtn: {
    height: 56,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  reasonBtnActive: {
    backgroundColor: theme.colors.destructive,
  },
  reasonText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  reasonTextActive: {
    color: theme.colors.white,
    fontFamily: theme.fonts.medium,
  },
});
