import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '../components/Feather';
import { theme } from '../theme/colors';
import { VenueTable, VenueZone, Order } from '../types';
import { FloorPlanCanvas } from './FloorPlanCanvas';

const PADDING = 16;
const formatAmount = (n: number) => (n / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface Props {
  onTablePress: (table: VenueTable, existingOrder?: Order) => void;
  zoneIdx?: number;
  zones: VenueZone[];
  orders: Order[];
}
export const FloorPlan: React.FC<Props> = (props) => {
  const { onTablePress, zoneIdx = 0, zones, orders } = props;
  const zone = zones[zoneIdx];
  if (!zone) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Feather name="map" size={48} color={theme.colors.textDisabled} />
          <Text style={styles.emptyText}>Схема зала не настроена</Text>
        </View>
      </View>
    );
  }


  const ordersByTable = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      if (o.tableId && (o.status === 'active' || o.status === 'alert')) {
        map.set(o.tableId, o);
      }
    }
    return map;
  }, [orders]);

  const getOrderForTable = (tableId: string): Order | undefined => {
    return ordersByTable.get(tableId);
  };

  const getTableColor = (order?: Order): string => {
    if (!order) return theme.colors.orderDefault;
    if (order.status === 'alert') return theme.colors.orderAlert;
    return theme.colors.orderActive;
  };

  return (
    <View style={styles.container}>
      <FloorPlanCanvas
        zone={zone}
        padding={PADDING}
        getTableStyle={(table) => {
          const order = getOrderForTable(table.id);
          return { bgColor: getTableColor(order) };
        }}
        onTablePress={(table) => onTablePress(table, getOrderForTable(table.id))}
        renderTableContent={(table, fontSize) => {
          const order = getOrderForTable(table.id);
          return (
            <>
              <Text style={[styles.tableNumber, { fontSize }]}>{table.number}</Text>
              {order && (
                <Text style={[styles.tableAmount, { fontSize: 16 }]}>
                  {formatAmount(order.totalAmount)} c
                </Text>
              )}
            </>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textDisabled,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  tableNumber: {
    color: '#fff',
    fontFamily: theme.fonts.medium,
  },
  tableAmount: {
    color: '#fff',
    opacity: 0.6,
    fontFamily: theme.fonts.medium,
    marginTop: 2,
  },
});
