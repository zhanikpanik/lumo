import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, Alert } from 'react-native';
import { theme } from '../theme/colors';
import { SomIcon } from '../components/Icons';
import { useUserStore } from '../store/userStore';
import { useInstantShift } from '../store/useInstantShift';
import { closePosShift } from '../data/posCommands';
import { somToTiyin } from '../utils/money';

const GAP = 10;
const PAD = 10;

const formatAmount = (n: number): string =>
  (n / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const formatSomInput = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const formatTime = (date: Date): string =>
  `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

export const CloseShiftScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const currentUser = useUserStore((s) => s.currentUser);
  const { openShift, totalOrders, totalRevenueTiyin, cashTotalTiyin, cardTotalTiyin, otherTotalTiyin, cashFloatInTiyin, cashFloatOutTiyin, cashCollectionsTiyin, expectedCashTiyin, payments } = useInstantShift(currentUser?.id);
  const currentShift = openShift;
  const startingCashTiyin = currentShift?.startingCashTiyin ?? 0;
  // Compute payment counts from ledger
  const cashPayments = payments.filter((p) => p.method === 'cash').length;
  const cardPayments = payments.filter((p) => p.method === 'card').length;
  const otherPayments = payments.filter((p) => p.method !== 'cash' && p.method !== 'card').length;
  const [countedInput, setCountedInput] = useState('');
  const [closing, setClosing] = useState(false);

  // Guard early — shift may be null if already closed
  if (!currentShift) {
    // Navigate away: nothing to close
    navigation.replace('OpenShift');
    return null;
  }

  const now = new Date();
  const diff = now.getTime() - currentShift.openedAt.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const duration = hours === 0 ? `${minutes} мин` : `${hours} ч ${minutes} мин`;
  const handleNumPress = (digit: string) => {
    setCountedInput((current) => {
      const next = current + digit;
      return next.length <= 8 ? next : current;
    });
  };
  const handleBackspace = () => setCountedInput((current) => current.slice(0, -1));


  const handleConfirmClose = async () => {
    if (closing) return;
    const raw = countedInput.replace(/\s/g, '').replace(',', '.').trim();
    if (!raw) {
      Alert.alert('Введите сумму', 'Пересчитайте наличные и введите сумму.');
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) {
      Alert.alert('Ошибка', 'Некорректная сумма.');
      return;
    }
    setClosing(true);
    try {
      const operationId = `close-shift-${Date.now()}`;
      await closePosShift({
        operationId,
        shiftId: currentShift.id,
        countedCashTiyin: somToTiyin(n),
      });
      // useInstantShift will detect the closed shift reactively — no manual state update needed
      navigation.replace('OpenShift');
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось закрыть смену.');
      setClosing(false);
    }
  };

  const expectedCash = expectedCashTiyin ?? startingCashTiyin + (cashTotalTiyin ?? 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Закрытие смены</Text>
          </View>
          <View style={{ width: 100 }} />
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Left: Z-report */}
          <View style={styles.leftCol}>
            <Text style={styles.reportTitle}>Z-отчет</Text>

            <View style={styles.divider} />

            <StatRow label="Кассир" value={currentUser?.name ?? 'Кассир'} />
            <StatRow label="Открыта" value={formatTime(currentShift.openedAt)} />
            <StatRow label="Длительность" value={duration} />

            <View style={styles.divider} />

            <StatRow label="Заказов" value={String(totalOrders ?? 0)} bold />
            <AmountRow label="Выручка" amount={totalRevenueTiyin ?? 0} bold />

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>По оплатам</Text>

            <AmountRow label="Наличные" amount={cashTotalTiyin ?? 0} sub={`${cashPayments} зак.`} />
            <AmountRow label="Карта" amount={cardTotalTiyin ?? 0} sub={`${cardPayments} зак.`} />
            <AmountRow label="Без оплаты" amount={otherTotalTiyin ?? 0} sub={`${otherPayments} зак.`} />

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Движения</Text>

            <AmountRow label="Внесения" amount={cashFloatInTiyin ?? 0} accent />
            <AmountRow label="Изъятия" amount={cashFloatOutTiyin ?? 0} />
            <AmountRow label="Инкассация" amount={cashCollectionsTiyin ?? 0} />

            <View style={styles.divider} />
          </View>

          <View style={{ width: GAP }} />

          {/* Right: Counted cash + numpad */}
          <View style={styles.rightCol}>
            <View style={styles.rightContent}>
              <Text style={styles.countHint}>Пересчитайте кассу и введите</Text>

              <View style={styles.displayWrap}>
                <Text style={styles.displayText}>
                  {countedInput ? formatSomInput(Number(countedInput)) : '0'}
                </Text>
                <SomIcon size={20} color={theme.colors.textSecondary} />
              </View>

              <View style={styles.numpadGrid}>
                {[['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '00', '←']].map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.numRow}>
                    {row.map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={styles.numKey}
                        onPress={() => key === '←' ? handleBackspace() : handleNumPress(key)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.numKeyText}>{key}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>


              <View style={styles.expectedNote}>
                <Text style={styles.expectedNoteText}>Ожидаемая касса: {formatAmount(expectedCash)}</Text>
                <SomIcon size={11} color={theme.colors.textSecondary} />
              </View>

              <TouchableOpacity
                style={[styles.closeBtn, closing && styles.closeBtnDisabled]}
                onPress={handleConfirmClose}
                disabled={closing}
                activeOpacity={0.8}
              >
                <Text style={styles.closeBtnText}>
                  {closing ? 'Закрываем...' : 'Закрыть смену'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ── Row helpers ──

const StatRow: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <View style={styles.statRow}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, bold && styles.bold]}>{value}</Text>
  </View>
);

const AmountRow: React.FC<{ label: string; amount: number; sub?: string; bold?: boolean; accent?: boolean }> =
  ({ label, amount, sub, bold, accent }) => (
    <View style={styles.statRow}>
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        {sub && <Text style={styles.statSub}>{sub}</Text>}
      </View>
      <View style={styles.amountRow}>
        <Text style={[styles.statValue, bold && styles.bold, accent && styles.accent]}>
          {formatAmount(amount)}
        </Text>
        <SomIcon size={9} color={accent ? theme.colors.online : bold ? theme.colors.white : theme.colors.textSecondary} />
      </View>
    </View>
  );

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
    marginTop: PAD,
    marginBottom: PAD,
  },
  backBtn: {
    height: 56,
    minWidth: 100,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

  body: { flex: 1, flexDirection: 'row', paddingHorizontal: PAD, paddingBottom: PAD },
  leftCol: { flex: 0.45, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius, padding: 14 },
  rightCol: { flex: 0.55 },
  rightContent: { flex: 1 },

  reportTitle: { color: theme.colors.white, fontSize: 20, fontFamily: theme.fonts.medium, marginBottom: 4 },

  divider: { height: 1, backgroundColor: theme.colors.subtleBorder, marginVertical: 8 },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statLabel: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  statSub: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, opacity: 0.6, marginTop: 1 },
  statValue: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  valueText: { color: theme.colors.textPrimary, fontFamily: theme.fonts.medium },
  bold: { color: theme.colors.white, fontFamily: theme.fonts.medium },
  accent: { color: theme.colors.online },
  sectionTitle: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.medium, marginTop: 8, marginBottom: 4 },

  // Right: counted cash
  countHint: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, marginBottom: GAP, textAlign: 'center' },

  displayWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: 20,
    marginBottom: 8,
    gap: 4,
  },
  displayText: {
    color: theme.colors.textPrimary,
    fontSize: 40,
    fontFamily: theme.fonts.medium,
  },
  numpadGrid: { flex: 1 },
  numRow: { flex: 1, flexDirection: 'row', gap: 2, marginBottom: 2 },
  numKey: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numKeyText: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontFamily: theme.fonts.medium,
  },

  expectedNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: GAP,
    marginBottom: GAP,
  },
  expectedNoteText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },

  closeBtn: {
    height: 52,
    backgroundColor: theme.colors.destructive,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnDisabled: { opacity: 0.5 },
  closeBtnText: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium },
});
