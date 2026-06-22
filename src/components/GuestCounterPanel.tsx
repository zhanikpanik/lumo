import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

export const GuestCounterPanel: React.FC = () => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const setGuestCount = useOrderStore((s) => s.setGuestCount);
  const guestCount = currentOrder?.guestCount ?? 1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="users" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.headerText}>Количество гостей</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={[styles.btn, guestCount <= 1 && styles.btnDisabled]}
            onPress={() => setGuestCount(-1)}
            disabled={guestCount <= 1}
            activeOpacity={0.7}
          >
            <Feather
              name="minus"
              size={24}
              color={guestCount <= 1 ? theme.colors.textDisabled : theme.colors.textPrimary}
            />
          </TouchableOpacity>

          <Text style={styles.count}>{guestCount}</Text>

          <TouchableOpacity
            style={styles.btn}
            onPress={() => setGuestCount(1)}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: 2,
  },
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  count: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontFamily: theme.fonts.medium,
    minWidth: 48,
    textAlign: 'center',
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.3,
  },
});
