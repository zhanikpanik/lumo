import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, Alert } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useShiftStore } from '../store/shiftStore';
import { useSyncOutboxStore, formatRpcError } from '../store/syncOutboxStore';
import { can } from '../utils/permissions';
import { finalizeOrderConsumption } from '../api/inventory';
import { insertPayment } from '../api/payments';
import { VENUE_ID } from '../config';
import { saleConsumptionIdempotencyKey } from '../types/inventory';
import { logger } from '../utils/logger';
import type { Order } from '../types';

const formatAmount = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type PaymentMethod = 'cash' | 'card' | 'none';

const generatePaymentAttemptId = () => {
  // UUID v4-подобный — для идемпотентности достаточно энтропии Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const CLOSE_REASONS = [
  'За счёт заведения',
  'Ошибка официанта',
  'Ошибка кухни',
  'Гость ушёл',
  'Другое',
];

export const PaymentScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { currentOrderId, items, getTotal } = useOrderStore();
  const currentUser = useShiftStore((s) => s.currentUser);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState('');
  const [printReceipt, setPrintReceipt] = useState(true);
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Стабильный per-сессия id попытки оплаты: повторный тап «Оплатить» / сетевой
  // retry попадают в тот же idempotency_key и не дублируют запись в payments.
  // Новый заход на PaymentScreen (например, после refund) даст новый attempt_id.
  const paymentAttemptId = useRef<string>(generatePaymentAttemptId());

  // Если компонент остался примонтированным (react-navigation stack), но
  // currentOrderId сменился (открыли другой заказ) — нужен свежий attemptId,
  // иначе idempotency_key первого заказа не пересечётся (orderId другой),
  // но лучше быть чистым и не полагаться на это.
  useEffect(() => {
    paymentAttemptId.current = generatePaymentAttemptId();
  }, [currentOrderId]);

  const total = getTotal();
  const canCloseWithoutPayment = can(currentUser?.role, 'closeWithoutPayment');
  const cashAmount = cashInput ? parseInt(cashInput, 10) : 0;
  const change = cashAmount > total ? cashAmount - total : 0;
  const canPay = method === 'card'
    || (method === 'none' && canCloseWithoutPayment && closeReason !== null)
    || (method === 'cash' && cashAmount >= total);

  const handleNumPress = (num: string) => {
    if (cashInput.length > 7) return;
    setCashInput(prev => prev + num);
  };

  const handleBackspace = () => {
    setCashInput(prev => prev.slice(0, -1));
  };

  const handleExact = () => {
    setCashInput(String(total));
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
      // Стабильный ключ повторного нажатия / сетевого retry в рамках сессии экрана.
      const idempotencyKey = `${currentOrderId}:${method}:${paymentAttemptId.current}`;

      const payResult = await insertPayment({
        orderId: currentOrderId,
        shiftId,
        method,
        amount: total,
        cashAmount,
        closeReason,
        idempotencyKey,
      });

      if (!payResult.ok && !payResult.isIdempotencyConflict) {
        Alert.alert('Ошибка оплаты', payResult.error ?? 'Неизвестная ошибка');
        return;
      }

      const isIdempotencyConflict = payResult.isIdempotencyConflict ?? false;

      if (method !== 'none' && !isIdempotencyConflict) {
        useShiftStore.getState().recordPayment(method, total);
        void useShiftStore.getState().refreshShiftCashSummary();
      }

      // Update local state immediately — UI responds right away
      const closedAt = new Date().toISOString();
      const newStatus = method === 'none' ? ('cancelled' as const) : ('paid' as const);
      useOrderStore.setState((state) => ({
        orders: state.orders.map((o) =>
          o.id === currentOrderId
            ? {
                ...o,
                status: newStatus,
                closedAt,
                closeReason: method === 'none' ? (closeReason ?? '') : undefined,
              }
            : o
        ),
      }));

      // Fire-and-forget: sync to Supabase in background, don't block navigation
      if (method !== 'none') {
        const os = useOrderStore.getState();
        const base = os.orders.find((o) => o.id === currentOrderId);
        if (base) {
          const paidOrder: Order = {
            ...base,
            items: os.items,
            totalAmount: os.getTotal(),
            status: 'paid',
            closedAt,
          };

          // Background sync: items + order + consumption + outbox — all in parallel, none block UI
          void (async () => {
            try {
              await os.flushPendingItemsToServer();
            } catch (e) {
              logger.error('payment.flushPendingItemsToServer', e, { orderId: currentOrderId });
            }
            try {
              await os.syncRemoteOrder(paidOrder);
            } catch (e) {
              logger.error('payment.syncRemoteOrder', e, { orderId: currentOrderId });
            }

            const consumptionIdemKey = saleConsumptionIdempotencyKey(currentOrderId);
            const payload = {
              venueId: VENUE_ID,
              orderId: currentOrderId,
              occurredAt: closedAt,
              idempotencyKey: consumptionIdemKey,
              shiftId: shiftId,
              lines: os.items.map((i) => ({
                order_item_id: i.id,
                product_id: i.product.id,
                quantity: i.quantity,
                modifier_ids: i.modifiers.map((m) => m.id),
              })),
            };

            try {
              const res = await finalizeOrderConsumption(payload);
              if (!res.ok) {
                logger.warn(
                  'payment.finalizeOrderConsumption.enqueue',
                  formatRpcError(res.error, res.detail),
                  { orderId: currentOrderId, detail: res.detail },
                );
                useSyncOutboxStore.getState().enqueueConsumption(payload);
              }
            } catch (e) {
              logger.error('payment.finalizeOrderConsumption', e, { orderId: currentOrderId });
              useSyncOutboxStore.getState().enqueueConsumption(payload);
            }

            void useSyncOutboxStore.getState().flush();
          })();
        }
      }

      useOrderStore.getState().closeOrder();
      navigation?.navigate('Orders');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    navigation?.goBack();
  };

  const renderKey = (label: string, onPress: () => void, flex = 1) => (
    <View style={[styles.keyWrap, { flex }]}>
      <TouchableOpacity style={styles.key} onPress={onPress} activeOpacity={0.6}>
        <Text style={styles.keyText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        {/* ── Left Panel ── */}
        <View style={styles.leftPanel}>
          {/* Total */}
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Итого</Text>
            <Text style={styles.totalAmount}>{formatAmount(total)} ₽</Text>
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
              <Text style={styles.changeAmount}>{formatAmount(change)} ₽</Text>
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
            <>
              {/* Display */}
              <View style={styles.numpadDisplay}>
                <Text style={styles.displayValue}>
                  {cashInput ? formatAmount(parseInt(cashInput, 10)) : '0'}
                </Text>
                <Text style={styles.displayCurrency}>₽</Text>
              </View>

              {/* Quick exact button */}
              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.exactBtn} onPress={handleExact} activeOpacity={0.6}>
                  <Text style={styles.exactText}>Без сдачи — {formatAmount(total)} ₽</Text>
                </TouchableOpacity>
              </View>

              {/* Numpad */}
              <View style={styles.numpad}>
                <View style={styles.numRow}>
                  {renderKey('7', () => handleNumPress('7'))}
                  {renderKey('8', () => handleNumPress('8'))}
                  {renderKey('9', () => handleNumPress('9'))}
                </View>
                <View style={styles.numRow}>
                  {renderKey('4', () => handleNumPress('4'))}
                  {renderKey('5', () => handleNumPress('5'))}
                  {renderKey('6', () => handleNumPress('6'))}
                </View>
                <View style={styles.numRow}>
                  {renderKey('1', () => handleNumPress('1'))}
                  {renderKey('2', () => handleNumPress('2'))}
                  {renderKey('3', () => handleNumPress('3'))}
                </View>
                <View style={styles.numRow}>
                  {renderKey('0', () => handleNumPress('0'))}
                  {renderKey('00', () => handleNumPress('00'))}
                  <View style={styles.keyWrap}>
                    <TouchableOpacity style={styles.key} onPress={handleBackspace} activeOpacity={0.6}>
                      <Text style={styles.keyText}>←</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          ) : method === 'card' ? (
            <View style={styles.cardMode}>
              <Text style={styles.cardIcon}>💳</Text>
              <Text style={styles.cardTitle}>Оплата картой</Text>
              <Text style={styles.cardAmount}>{formatAmount(total)} ₽</Text>
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
    marginBottom: 8,
  },
  totalAmount: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontWeight: 'bold',
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
    backgroundColor: '#D32F2F',
  },
  methodText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  methodTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  methodBtnDisabled: {
    opacity: 0.45,
  },
  permissionHint: {
    color: '#FF8A80',
    fontSize: 13,
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
  },
  changeAmount: {
    color: '#00C853',
    fontSize: 28,
    fontWeight: 'bold',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  receiptText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
  },

  actionRow: {
    flexDirection: 'row',
    height: 56,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#D32F2F',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  payBtn: {
    flex: 1.5,
    backgroundColor: '#00C853',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtnRed: {
    flex: 1.5,
    backgroundColor: '#D32F2F',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtnDisabled: {
    opacity: 0.4,
  },
  payText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Right panel
  rightPanel: {
    flex: 0.6,
  },

  numpadDisplay: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    backgroundColor: '#191919',
    borderRadius: theme.borderRadius,
    padding: 24,
    marginBottom: 8,
  },
  displayValue: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontWeight: '300',
  },
  displayCurrency: {
    color: theme.colors.textSecondary,
    fontSize: 24,
    fontWeight: '300',
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
    fontSize: 15,
    fontWeight: '500',
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
    backgroundColor: '#191919',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '300',
  },

  // Card mode
  cardMode: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#191919',
    borderRadius: theme.borderRadius,
  },
  cardIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardAmount: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  cardHint: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  confirmWarning: {
    color: '#FF5252',
    fontSize: 18,
    fontWeight: '600',
  },
  reasonPanel: {
    flex: 1,
    padding: 16,
  },
  reasonTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
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
    backgroundColor: '#D32F2F',
  },
  reasonText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  reasonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
