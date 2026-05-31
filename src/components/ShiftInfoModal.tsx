import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useShiftStore } from '../store/shiftStore';

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

const formatTime = (date: Date): string =>
  `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

const formatDuration = (start: Date, end: Date): string => {
  const diff = end.getTime() - start.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const ShiftInfoModal: React.FC<Props> = ({ visible, onClose }) => {
  const currentShift = useShiftStore((s) => s.currentShift);

  if (!currentShift) return null;

  const now = new Date();
  const expectedCash = currentShift.expectedCash ?? (currentShift.startingCash + currentShift.cashTotal);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Текущая смена</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {/* Status badge */}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Смена открыта</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.label}>Кассир</Text>
              <Text style={styles.value}>{currentShift.cashier}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Открыта в</Text>
              <Text style={styles.value}>{formatTime(currentShift.openedAt)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Длительность</Text>
              <Text style={styles.value}>{formatDuration(currentShift.openedAt, now)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.label}>Заказов</Text>
              <Text style={styles.valueBold}>{currentShift.totalOrders}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Выручка</Text>
              <Text style={styles.valueBold}>{formatAmount(currentShift.totalRevenue)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.label}>Наличные в кассе</Text>
              <Text style={styles.valueBold}>{formatAmount(expectedCash)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Внесения</Text>
              <Text style={styles.valueBold}>{formatAmount(currentShift.cashFloatIn ?? 0)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Изъятия</Text>
              <Text style={styles.valueBold}>{formatAmount(currentShift.cashFloatOut ?? 0)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Инкассация</Text>
              <Text style={styles.valueBold}>{formatAmount(currentShift.cashCollectionsTotal ?? 0)}</Text>
            </View>
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
    width: '35%',
    maxWidth: 420,
    minWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 20,
    paddingTop: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,200,83,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00C853',
  },
  statusText: {
    color: '#00C853',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  value: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  valueBold: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});
