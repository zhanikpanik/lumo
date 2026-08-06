import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { CrossIcon } from './Icons';
import { theme } from '../theme/colors';
import { useInstantVenue } from '../store/useInstantVenue';
import type { Order } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Current order — passed by caller instead of reading from useOrderStore */
  currentOrder?: Order;
  /** Called when a waiter is selected */
  onSelectWaiter: (employeeId: string) => void;
}

export const WaiterPickerModal: React.FC<Props> = ({ visible, onClose, currentOrder, onSelectWaiter }) => {
  const { employees } = useInstantVenue();
  const currentWaiter = currentOrder?.waiter || '';

  const handleSelect = (employeeId: string, employeeName: string) => {
    onSelectWaiter(employeeId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Официант</Text>
            <TouchableOpacity onPress={onClose}>
              <CrossIcon size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {employees.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={[styles.waiterBtn, currentWaiter === e.name && styles.waiterBtnActive]}
                onPress={() => handleSelect(e.id, e.name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.waiterText, currentWaiter === e.name && styles.waiterTextActive]}>
                  {e.name}
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
    backgroundColor: theme.colors.overlay,
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
