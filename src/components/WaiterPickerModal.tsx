import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const WaiterPickerModal: React.FC<Props> = ({ visible, onClose }) => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const waiters = useVenueStore((s) => s.waiters);
  const currentWaiter = currentOrder?.waiter || '';

  const handleSelect = (waiter: string) => {
    useOrderStore.setState((state) => ({
      orders: state.orders.map(o =>
        o.id === state.currentOrderId ? { ...o, waiter } : o
      ),
    }));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Официант</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {waiters.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.waiterBtn, currentWaiter === w.name && styles.waiterBtnActive]}
                onPress={() => handleSelect(w.name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.waiterText, currentWaiter === w.name && styles.waiterTextActive]}>
                  {w.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '30%',
    maxWidth: 360,
    minWidth: 280,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  body: {
    padding: 20,
    paddingTop: 0,
    gap: 6,
  },
  waiterBtn: {
    height: 52,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
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
    fontFamily: theme.fonts.medium,
  },
});
