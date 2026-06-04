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
        <Text style={styles.count}>{guestCount}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.btn, guestCount <= 1 && styles.btnDisabled]}
            onPress={() => setGuestCount(-1)}
            disabled={guestCount <= 1}
            activeOpacity={0.7}
          >
            <Feather
              name="minus"
              size={28}
              color={guestCount <= 1 ? theme.colors.textDisabled : theme.colors.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => setGuestCount(1)}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={28} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
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
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  count: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontFamily: theme.fonts.medium,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.3,
  },
});
