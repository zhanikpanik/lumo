import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore, VenueTable } from '../store/venueStore';
import { FloorPlanCanvas } from '../components/FloorPlanCanvas';

const PADDING = 8;

export const TablePickerScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const mode: 'new' | 'transfer' = route?.params?.mode || 'transfer';
  const createOrderForTable = useOrderStore((s) => s.createOrderForTable);
  const { tableId } = useOrderStore();
  const orders = useOrderStore((s) => s.orders);
  const venueZones = useVenueStore((s) => s.zones);
  const fetchVenue = useVenueStore((s) => s.fetchVenue);
  const [zoneIdx, setZoneIdx] = useState(0);

  useEffect(() => { fetchVenue(); }, []);
  const zone = venueZones[zoneIdx];

  const getOrderForTable = (id: string) => {
    return orders.find(o => o.tableId === id && (o.status === 'active' || o.status === 'alert'));
  };

  const handleSelect = (table: VenueTable) => {
    if (mode === 'new') {
      // Create new order for selected table, then go to Pos
      const orderId = createOrderForTable(table.id, table.number, table.zone);
      // Navigate to Pos with the new order
      navigation?.replace('Pos', { orderId });
      return;
    }

    // Transfer mode — update existing order
    const state = useOrderStore.getState();
    const total = state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
    useOrderStore.setState({
      tableNumber: table.number,
      tableId: table.id,
      isQuickCheck: false,
      orders: state.orders.map(o =>
        o.id === state.currentOrderId
          ? {
              ...o,
              tableNumber: table.number,
              tableId: table.id,
              zone: table.zone,
              isQuickCheck: false,
              totalAmount: total,
              items: state.items,
            }
          : o
      ),
    });
    navigation?.goBack();
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
              {venueZones.map((z, i) => (
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
              const isCurrent = table.id === tableId;
              const order = getOrderForTable(table.id);
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
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 80 },

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
    color: '#fff',
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
});
