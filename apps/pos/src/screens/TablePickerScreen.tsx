import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, Alert } from 'react-native';
import { theme } from '../theme/colors';
import type { VenueTable } from '../store/venueStore';
import { FloorPlanCanvas } from '../components/FloorPlanCanvas';
import { getInstantClient, getDeviceId, getVenueId } from '../data/instant';
import { createOrder as createOrderCommand } from '@lumo/data';
import { useInstantOrders } from '../store/useInstantOrders';
import { useInstantVenue } from '../store/useInstantVenue';
import { useInstantShift } from '../store/useInstantShift';
import { usePosUiStore } from '../store/posUiStore';

const PADDING = 8;

export const TablePickerScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const mode: 'new' | 'transfer' = route?.params?.mode || 'transfer';

  // ── UI state ─────────────────────────────────────────
  const { currentOrderId, setCurrentOrderId } = usePosUiStore();

  // ── InstantDB data ───────────────────────────────────
  const { zones, employees } = useInstantVenue();
  const currentUser = employees[0]; // TODO: proper current user from auth
  const { openShift: currentShift } = useInstantShift(currentUser?.id);
  const shiftId = currentShift?.id;
  const { orders } = useInstantOrders(shiftId);

  const [zoneIdx, setZoneIdx] = useState(0);
  const zone = zones[zoneIdx];

  const currentTableId = orders.find(o => o.id === currentOrderId)?.tableId ?? '';

  const handleSelect = async (table: VenueTable) => {
    if (mode === 'new') {
      try {
        if (!currentUser) { Alert.alert('Ошибка', 'Пользователь не выбран'); return; }
        if (!shiftId) { Alert.alert('Ошибка', 'Смена не открыта'); return; }
        const db = getInstantClient();
        const operationId = `create-order-${Date.now()}`;
        const result = await createOrderCommand(db, {
          operationId,
          venueId: getVenueId(),
          deviceId: getDeviceId(),
          actorEmployeeId: currentUser.id,
          shiftId,
          tableId: table.id,
          tableNumber: table.number,
          zoneName: table.zone,
          guestCount: 1,
          clientTimestamp: new Date().toISOString(),
          orderType: 'dine-in',
          isQuickCheck: false,
          orderNumber: table.number,
        }).execute();
        setCurrentOrderId(result.orderId);
        navigation?.replace('Pos', { orderId: result.orderId });
      } catch (e: unknown) {
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
      const db = getInstantClient();
      await db.transact([
        db.tx.orders[currentOrderId].update({
          tableNumber: table.number,
          zoneName: table.zone,
          isQuickCheck: false,
        }).link({ table: table.id }),
      ]);
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
                borderColor: '#fff',
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
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingVertical: 10,
  },
  backBtn: {
    width: 80,
    paddingVertical: 8,
  },
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 80 },

  zoneTabs: { flexDirection: 'row', gap: 6 },
  zoneTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  zoneTabActive: {
    backgroundColor: theme.colors.tabActive,
  },
  zoneTabText: { color: theme.colors.textSecondary, fontSize: 14, fontFamily: theme.fonts.medium },
  zoneTabTextActive: {
    color: '#fff',
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
});
