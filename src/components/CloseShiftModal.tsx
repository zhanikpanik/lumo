import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useShiftStore } from '../store/shiftStore';

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

const formatTime = (date: Date): string =>
  `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

const formatDate = (date: Date): string => {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

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
  onConfirmClose: (countedCash: number) => void;
  canConfirmClose?: boolean;
}

export const CloseShiftModal: React.FC<Props> = ({
  visible,
  onClose,
  onConfirmClose,
  canConfirmClose = true,
}) => {
  const currentShift = useShiftStore((s) => s.currentShift);
  const [countedInput, setCountedInput] = useState('');

  useEffect(() => {
    if (visible) setCountedInput('');
  }, [visible]);

  if (!currentShift) return null;

  const now = new Date();

  const handleConfirmClose = () => {
    const raw = countedInput.replace(/\s/g, '').replace(',', '.').trim();
    if (raw === '') {
      Alert.alert('Введите сумму', 'Укажите фактически пересчитанную сумму в кассе.');
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) {
      Alert.alert('Ошибка', 'Некорректная сумма.');
      return;
    }
    onConfirmClose(n);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Закрытие смены</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Report header */}
            <Text style={styles.reportTitle}>Z-отчет</Text>
            <Text style={styles.reportDate}>{formatDate(now)}</Text>

            <View style={styles.divider} />

            {/* Shift meta */}
            <Row label="Кассир" value={currentShift.cashier} />
            <Row label="Смена открыта" value={formatTime(currentShift.openedAt)} />
            <Row label="Длительность" value={formatDuration(currentShift.openedAt, now)} />

            <View style={styles.divider} />

            {/* Totals */}
            <Row label="Заказов" value={String(currentShift.totalOrders)} bold />
            <Row label="Выручка" value={formatAmount(currentShift.totalRevenue)} bold />

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>По способам оплаты</Text>

            <Row label="Наличные" value={`${currentShift.cashPayments} зак. · ${formatAmount(currentShift.cashTotal)}`} />
            <Row label="Карта" value={`${currentShift.cardPayments} зак. · ${formatAmount(currentShift.cardTotal)}`} />
            <Row label="Без оплаты" value={`${currentShift.otherPayments} зак. · ${formatAmount(currentShift.otherTotal)}`} />

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Движения наличных</Text>

            <Row label="Внесения" value={`+${formatAmount(currentShift.cashFloatIn ?? 0)}`} accent />
            <Row label="Изъятия" value={`-${formatAmount(currentShift.cashFloatOut ?? 0)}`} />
            <Row label="Инкассация" value={`-${formatAmount(currentShift.cashCollectionsTotal ?? 0)}`} />

            {/* Cash count */}
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>На конец смены</Text>
            <Text style={styles.inputHint}>Пересчитайте наличные и введите сумму</Text>
            <TextInput
              style={styles.cashInput}
              value={countedInput}
              onChangeText={setCountedInput}
              placeholder="0"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </ScrollView>

          {/* Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirmClose && styles.confirmBtnDisabled]}
              onPress={handleConfirmClose}
              disabled={!canConfirmClose}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>Закрыть смену</Text>
            </TouchableOpacity>
          </View>
          {!canConfirmClose && (
            <Text style={styles.warningText}>Только кассир может закрывать смену</Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ── Tiny row helper ──
const Row: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}> = ({ label, value, bold, accent }) => (
  <View style={styles.infoRow}>
    <Text style={[styles.infoLabel, bold && styles.bold]}>{label}</Text>
    <Text style={[styles.infoValue, bold && styles.bold, accent && styles.accent]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '40%',
    maxWidth: 440,
    minWidth: 340,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingBottom: 8,
  },

  reportTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  reportDate: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  bold: {
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  accent: {
    color: '#4CAF50',
  },

  inputHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  cashInput: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '500',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },

  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    height: 46,
    backgroundColor: '#D32F2F',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  warningText: {
    color: '#FF8A80',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 12,
  },
});
