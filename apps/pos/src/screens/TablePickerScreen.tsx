import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, Alert } from 'react-native';
import { theme } from '../theme/colors';
import type { VenueTable } from '../types';
import { FloorPlanCanvas } from '../components/FloorPlanCanvas';
import { createPosOrder, updatePosOrder } from '../data/posCommands';
import { useInstantOrders } from '../store/useInstantOrders';
import { useInstantVenue } from '../store/useInstantVenue';
import { useInstantShift } from '../store/useInstantShift';
import { usePosUiStore } from '../store/posUiStore';
import { useUserStore } from '../store/userStore';

const PADDING = 8;

export const TablePickerScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const mode: 'new' | 'transfer' = route?.params?.mode || 'transfer';

  // ── UI state ─────────────────────────────────────────
  const { currentOrderId, setCurrentOrderId, setCreatingOrder } = usePosUiStore();

  // ── InstantDB data ───────────────────────────────────
  const { zones } = useInstantVenue();
  const currentUser = useUserStore((state) => state.currentUser);
  const { openShift: currentShift } = useInstantShift(currentUser?.id);
  const shiftId = currentShift?.id;
  const { orders } = useInstantOrders(shiftId);

  const [zoneIdx, setZoneIdx] = useState(0);
  const zone = zones[zoneIdx];

  const currentTableId = orders.find(o => o.id === currentOrderId)?.tableId ?? '';

  const handleSelect = async (table: VenueTable) => {
    if (mode === 'new') {
      if (!currentUser) { Alert.alert('Ошибка', 'Пользователь не выбран'); return; }
      if (!shiftId) { Alert.alert('Ошибка', 'Смена не открыта'); return; }

      const operationId = `create-order-${Date.now()}`;
      setCurrentOrderId(null);
      setCreatingOrder(true);
      navigation?.replace('Pos');
      try {
        const result = await createPosOrder({
          operationId,
          actorEmployeeId: currentUser.id,
          shiftId,
          tableId: table.id,
          guestCount: 1,
          orderType: 'dine-in',
          isQuickCheck: false,
          orderNumber: table.number,
        });
        setCurrentOrderId(result.orderId);
      } catch (e: unknown) {
        setCreatingOrder(false);
        navigation?.replace('Orders');
        const msg = e instanceof Error ? e.message : 'Не удалось создать заказ';
        Alert.alert('Ошибка', msg);
      }
      return;
    }

    // Transfer mode — reassign current order to the selected table
    if (!currentOrderId) {
      Alert.alert('Ошибка', 'Нет текущего заказа');
      return;
    }
    try {
      if (!currentUser) throw new Error('Пользователь не выбран');
      await updatePosOrder({
        operationId: `move-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orderId: currentOrderId,
        actorEmployeeId: currentUser.id,
        updates: { tableId: table.id },
      });
      navigation?.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось перенести заказ';
      Alert.alert('Ошибка', msg);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {/* Zone tabs */}
            <View style={styles.zoneTabs}>
              {zones.map((z, i) => (
                <TouchableOpacity
                  key={z.id}
                  style={[styles.zoneTab, i === zoneIdx && styles.zoneTabActive]}
                  onPress={() => setZoneIdx(i)}
                >
                  <Text style={[styles.zoneTabText, i === zoneIdx && styles.zoneTabTextActive]}>
                    {z.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.headerRight} />
        </View>

        {/* Floor plan canvas */}
        {zone ? (
          <FloorPlanCanvas
            zone={zone}
            getTableStyle={(table) => {
              const order = orders.find(o => o.tableId === table.id && (o.status === 'active' || o.status === 'alert'));
              const isCurrent = table.id === currentTableId;
              let bgColor = theme.colors.surfaceLight;
              if (isCurrent) bgColor = theme.colors.tabActive;
              else if (order?.status === 'alert') bgColor = theme.colors.orderAlert;
              else if (order) bgColor = theme.colors.orderActive;

              return {
                bgColor,
                label: isCurrent ? 'Текущий' : order ? 'Занят' : undefined,
                borderWidth: isCurrent ? 2 : 0,
                borderColor: theme.colors.white,
              };
            }}
            onTablePress={handleSelect}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нет залов</Text>
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.surfaceLight }]} />
            <Text style={styles.legendText}>Свободный</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.orderActive }]} />
            <Text style={styles.legendText}>Занят</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.tabActive }]} />
            <Text style={styles.legendText}>Текущий</Text>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    marginTop: 8,
    marginBottom: 8,
  },
  backBtn: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borderRadius,
    minWidth: 120,
  },
  backText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 80,
  },
  zoneTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  zoneTab: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneTabActive: {
    backgroundColor: theme.colors.tabActive,
  },
  zoneTabText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  zoneTabTextActive: {
    color: theme.colors.white,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
});
