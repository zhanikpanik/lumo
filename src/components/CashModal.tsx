import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useShiftStore } from '../store/shiftStore';
import { can, UserRole } from '../utils/permissions';

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

interface Props {
  visible: boolean;
  onClose: () => void;
  role: UserRole;
  onCashIn: () => void;
  onCashOut: () => void;
  onCashCollection: () => void;
}

export const CashModal: React.FC<Props> = ({
  visible,
  onClose,
  role,
  onCashIn,
  onCashOut,
  onCashCollection,
}) => {
  const currentShift = useShiftStore((s) => s.currentShift);
  const refreshShiftCashSummary = useShiftStore((s) => s.refreshShiftCashSummary);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setRefreshing(true);
    refreshShiftCashSummary().finally(() => {
      if (!cancelled) setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, refreshShiftCashSummary]);

  if (!visible) return null;

  const allowed = can(role, 'cashTransaction');
  const expectedCash = currentShift
    ? currentShift.expectedCash ?? currentShift.startingCash + currentShift.cashTotal
    : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Касса</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {!currentShift ? (
              <Text style={styles.empty}>Смена не открыта</Text>
            ) : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Ожидаемая сумма в кассе</Text>
                  <Text style={styles.totalValue}>{formatAmount(expectedCash)}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoRow}>
                  <Text style={styles.label}>Наличные на начало</Text>
                  <Text style={styles.value}>{formatAmount(currentShift.startingCash)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Поступления наличными</Text>
                  <Text style={styles.value}>{formatAmount(currentShift.cashTotal)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Внесения</Text>
                  <Text style={styles.value}>{formatAmount(currentShift.cashFloatIn ?? 0)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Изъятия</Text>
                  <Text style={styles.value}>{formatAmount(currentShift.cashFloatOut ?? 0)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Инкассация</Text>
                  <Text style={styles.value}>{formatAmount(currentShift.cashCollectionsTotal ?? 0)}</Text>
                </View>

                {refreshing ? (
                  <Text style={styles.refreshing}>Обновляем…</Text>
                ) : null}
              </>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionIn, !allowed && styles.actionDisabled]}
              onPress={onCashIn}
              disabled={!allowed}
              activeOpacity={0.8}
            >
              <Feather name="arrow-down-circle" size={20} color="#fff" />
              <Text style={styles.actionText}>Внесение</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionOut, !allowed && styles.actionDisabled]}
              onPress={onCashOut}
              disabled={!allowed}
              activeOpacity={0.8}
            >
              <Feather name="arrow-up-circle" size={20} color="#fff" />
              <Text style={styles.actionText}>Изъятие</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionCollection, !allowed && styles.actionDisabled]}
              onPress={onCashCollection}
              disabled={!allowed}
              activeOpacity={0.8}
            >
              <Feather name="briefcase" size={20} color="#fff" />
              <Text style={styles.actionText}>Инкассация</Text>
            </TouchableOpacity>
          </View>
          {!allowed && (
            <Text style={styles.warningText}>Кассовые операции недоступны для вашей роли</Text>
          )}
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
    width: '40%',
    maxWidth: 520,
    minWidth: 380,
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  empty: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
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
    fontWeight: '500',
  },
  refreshing: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  actionIn: {
    backgroundColor: '#1976D2',
  },
  actionOut: {
    backgroundColor: '#F57C00',
  },
  actionCollection: {
    backgroundColor: '#D32F2F',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  warningText: {
    color: '#FF8A80',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
});
