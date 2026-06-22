import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CrossIcon, ChevronDownIcon, ChevronUpIcon, SomIcon } from './Icons';
import { Feather } from '@expo/vector-icons'; // briefcase only - no Chikin yet
import { theme } from '../theme/colors';
import { useShiftStore } from '../store/shiftStore';
import { can, isAdmin, UserRole } from '../utils/permissions';

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

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
  const showExpected = isAdmin(role);
  const expectedCash = currentShift
    ? currentShift.expectedCash ?? currentShift.startingCash + currentShift.cashTotal
    : 0;

  const Amount: React.FC<{ value: number; bold?: boolean; accent?: boolean }> = ({ value, bold, accent }) => (
    <View style={styles.amountRow}>
      <Text style={[styles.value, bold && styles.valueBold, accent && styles.valueAccent]}>
        {formatAmount(value)}
      </Text>
      <SomIcon size={10} color={accent ? theme.colors.online : bold ? '#fff' : theme.colors.textSecondary} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Касса</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CrossIcon size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {!currentShift ? (
              <Text style={styles.empty}>Смена не открыта</Text>
            ) : (
              <>
                {showExpected && (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Ожидаемая сумма в кассе</Text>
                      <View style={styles.amountRow}>
                        <Text style={styles.totalValue}>{formatAmount(expectedCash)}</Text>
                        <SomIcon size={12} color="#fff" />
                      </View>
                    </View>
                    <View style={styles.divider} />
                  </>
                )}

                <InfoRow label="Наличные на начало" amount={currentShift.startingCash} />
                <InfoRow label="Поступления наличными" amount={currentShift.cashTotal} />

                <View style={styles.divider} />

                <InfoRow label="Внесения" amount={currentShift.cashFloatIn ?? 0} accent />
                <InfoRow label="Изъятия" amount={currentShift.cashFloatOut ?? 0} />
                <InfoRow label="Инкассация" amount={currentShift.cashCollectionsTotal ?? 0} />

                {refreshing ? (
                  <Text style={styles.refreshing}>Обновляем…</Text>
                ) : null}
              </>
            )}
          </View>

          {allowed && currentShift ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionIn]}
                onPress={onCashIn}
                activeOpacity={0.8}
              >
                <ChevronDownIcon size={20} color="#fff" />
                <Text style={styles.actionText}>Внесение</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionOut]}
                onPress={onCashOut}
                activeOpacity={0.8}
              >
                <ChevronUpIcon size={20} color="#fff" />
                <Text style={styles.actionText}>Изъятие</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionCollection]}
                onPress={onCashCollection}
                activeOpacity={0.8}
              >
                <Feather name="briefcase" size={20} color="#fff" />
                <Text style={styles.actionText}>Инкассация</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const InfoRow: React.FC<{ label: string; amount: number; accent?: boolean }> = ({ label, amount, accent }) => (
  <View style={styles.infoRow}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.amountRow}>
      <Text style={[styles.value, accent && styles.valueAccent]}>
        {formatAmount(amount)}
      </Text>
      <SomIcon size={9} color={accent ? theme.colors.online : theme.colors.textSecondary} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '40%',
    maxWidth: 520,
    minWidth: 380,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
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
    fontSize: 16,
    fontFamily: theme.fonts.medium,
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
    fontSize: 16,
    fontFamily: theme.fonts.regular,
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
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.subtleBorder,
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  value: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.medium,
  },
  valueBold: {
    color: '#fff',
  },
  valueAccent: {
    color: theme.colors.online,
  },
  refreshing: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
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
    borderTopColor: theme.colors.subtleBorder,
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
    backgroundColor: theme.colors.info,
  },
  actionOut: {
    backgroundColor: theme.colors.infoOrange,
  },
  actionCollection: {
    backgroundColor: theme.colors.destructive,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
});
