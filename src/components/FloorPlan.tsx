import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore, VenueTable } from '../store/venueStore';
import { Order } from '../types';
import { FloorPlanCanvas } from './FloorPlanCanvas';

const PADDING = 16;
const formatAmount = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface Props {
  onTablePress: (table: VenueTable, existingOrder?: Order) => void;
  zoneIdx?: number;
}

export const FloorPlan: React.FC<Props> = ({ onTablePress, zoneIdx = 0 }) => {
  const orders = useOrderStore((s) => s.orders);
  const zones = useVenueStore((s) => s.zones);
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

  const getOrderForTable = (tableId: string): Order | undefined => {
    return orders.find(o => o.tableId === tableId && (o.status === 'active' || o.status === 'alert'));
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
                  fontFamily: theme.fonts.regular,
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
