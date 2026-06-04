import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';

export const WaiterPickerPanel: React.FC = () => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const waiters = useVenueStore((s) => s.waiters);
  const updateOrderMeta = useOrderStore((s) => s.updateOrderMeta);
  const currentWaiter = currentOrder?.waiter || '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="user" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.headerText}>Выберите официанта</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {waiters.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.waiterBtn, currentWaiter === w.name && styles.waiterBtnActive]}
            onPress={() => updateOrderMeta({ waiter: w.name })}
            activeOpacity={0.7}
          >
            <Text style={[styles.waiterText, currentWaiter === w.name && styles.waiterTextActive]}>
              {w.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, overflow: 'hidden' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  list: { flex: 1 },
  listContent: { padding: 10, gap: 10 },
  waiterBtn: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
  },
  waiterBtnActive: {
    backgroundColor: theme.colors.tabActive,
  },
  waiterText: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  waiterTextActive: {
    color: '#fff',
  },
});
