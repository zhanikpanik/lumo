import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { SomIcon, ChevronDownIcon, ChevronUpIcon } from '../components/Icons';
import { Numpad } from '../components/Numpad';
import { Feather } from '@expo/vector-icons'; // briefcase only
import { useShiftStore } from '../store/shiftStore';
import { can, isAdmin, UserRole } from '../utils/permissions';

const GAP = 10;
const PAD = 10;

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type OpMode = 'in' | 'out' | 'collection' | null;

const OP_CONFIG: Record<'in' | 'out' | 'collection', { label: string; ctLabel: string; color: string; presets: string[] }> = {
  in: {
    label: 'Внесение',
    ctLabel: 'Внести',
    color: theme.colors.info,
    presets: ['Размен', 'Сдача', ''],
  },
  out: {
    label: 'Изъятие',
    ctLabel: 'Изъять',
    color: theme.colors.infoOrange,
    presets: ['Размен', 'Возврат сдачи', ''],
  },
  collection: {
    label: 'Инкассация',
    ctLabel: 'Списать',
    color: theme.colors.destructive,
    presets: ['В банк', 'Инкассация', ''],
  },
};

export const CashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const currentShift = useShiftStore((s) => s.currentShift);
  const currentUser = useShiftStore((s) => s.currentUser);
  const refreshShiftCashSummary = useShiftStore((s) => s.refreshShiftCashSummary);
  const addCashCollection = useShiftStore((s) => s.addCashCollection);
  const addCashTransaction = useShiftStore((s) => s.addCashTransaction);
  const role: UserRole = currentUser?.role ?? null;

  const [opMode, setOpMode] = useState<OpMode>(null);
  const [amountInput, setAmountInput] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [showCustomNote, setShowCustomNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { refreshShiftCashSummary(); }, []);

  const allowed = can(role, 'cashTransaction');
  const showExpected = isAdmin(role);
  const expectedCash = currentShift
    ? currentShift.expectedCash ?? currentShift.startingCash + currentShift.cashTotal
    : 0;

  const selectOp = (mode: OpMode) => {
    setOpMode(mode);
    setAmountInput('');
    setCustomNote('');
    setShowCustomNote(false);
  };
  const cancelOp = () => setOpMode(null);

  const handleConfirm = async () => {
    if (submitting || !opMode) return;
    const raw = amountInput.replace(/\s/g, '').replace(',', '.').trim();
    const amount = Number(raw);
    if (!raw || Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму.');
      return;
    }
    setSubmitting(true);

    const note = customNote.trim() || undefined;

    if (opMode === 'collection') {
      const res = await addCashCollection(amount, note);
      if (!res.ok) Alert.alert('Ошибка', res.error ?? 'Не удалось');
    } else {
      const res = await addCashTransaction(opMode, amount, note, currentUser?.id ?? null);
      if (!res.ok) {
        const msg = res.error === 'insufficient_cash'
          ? 'Недостаточно наличных в кассе.'
          : (res.error ?? 'Не удалось');
        Alert.alert('Ошибка', msg);
      }
    }

    setSubmitting(false);
    cancelOp();
    refreshShiftCashSummary();
  };

  const Amount: React.FC<{ value: number; bold?: boolean; accent?: boolean; size?: number }> =
    ({ value, bold, accent, size = 16 }) => (
      <View style={styles.amountRow}>
        <Text style={[styles.valueText, bold && styles.bold, accent && styles.accent, { fontSize: size }]}>
          {formatAmount(value)}
        </Text>
        <SomIcon size={size > 18 ? 11 : 9} color={accent ? theme.colors.online : bold ? '#fff' : theme.colors.textSecondary} />
      </View>
    );

  const renderLeftStats = () => (
    <View style={styles.statsPanel}>
      {showExpected && (
        <>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Ожидаемая сумма</Text>
            <Amount value={expectedCash} bold size={18} />
          </View>
          <View style={styles.divider} />
        </>
      )}
      <StatRow label="В кассе на начало" amount={currentShift?.startingCash ?? 0} />
      <StatRow label="Оплаты наличными" amount={currentShift?.cashTotal ?? 0} />
      <StatRow label="Заказов всего" value={String(currentShift?.totalOrders ?? 0)} />
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>По оплатам</Text>
      <StatRow label="Наличные" amount={currentShift?.cashTotal ?? 0} />
      <StatRow label="Карта" amount={currentShift?.cardTotal ?? 0} />
      <StatRow label="Без оплаты" amount={currentShift?.otherTotal ?? 0} />
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Движения</Text>
      <StatRow label="Внесения" amount={currentShift?.cashFloatIn ?? 0} accent />
      <StatRow label="Изъятия" amount={currentShift?.cashFloatOut ?? 0} />
      <StatRow label="Инкассация" amount={currentShift?.cashCollectionsTotal ?? 0} />
    </View>
  );

  const cfg = opMode ? OP_CONFIG[opMode] : null;

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
            <Text style={styles.headerTitle}>Касса</Text>
          </View>
          <View style={{ width: 100 }} />
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Left: stats */}
          <View style={styles.leftCol}>
            {renderLeftStats()}
          </View>

          <View style={{ width: GAP }} />

          {/* Right: operations + numpad */}
          <KeyboardAvoidingView
            style={styles.rightCol}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={20}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            {/* Mode selector */}
            {allowed && currentShift ? (
              <View style={styles.modeRow}>
                {(['in', 'out', 'collection'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.modeBtn,
                      opMode === mode && { backgroundColor: OP_CONFIG[mode].color },
                    ]}
                    onPress={() => selectOp(opMode === mode ? null : mode)}
                    activeOpacity={0.7}
                  >
                    {mode === 'in' ? <ChevronDownIcon size={14} color={theme.colors.white} /> : null}
                    {mode === 'out' ? <ChevronUpIcon size={14} color={theme.colors.white} /> : null}
                    {mode === 'collection' ? <Feather name="briefcase" size={14} color={theme.colors.white} /> : null}
                    <Text style={styles.modeBtnText}>{OP_CONFIG[mode].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.noAccess}>
                <Text style={styles.noAccessText}>Кассовые операции недоступны</Text>
              </View>
            )}

            {opMode && cfg ? (
              <>
                <Numpad
                  mode="amount"
                  value={amountInput}
                  onChange={setAmountInput}
                  currency="c"
                  maxDigits={7}
                >
                  {/* Quick note presets — inside numpad footer */}
                  <View style={styles.noteRow}>
                    {cfg.presets.map((preset, i) => {
                      if (!preset) {
                        return (
                          <TouchableOpacity
                            key="custom"
                            style={[styles.noteChip, showCustomNote && styles.noteChipActive]}
                            onPress={() => setShowCustomNote(!showCustomNote)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.noteChipText}>▸ своё</Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.noteChip, customNote === preset && styles.noteChipActive]}
                          onPress={() => { setCustomNote(preset); setShowCustomNote(false); }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.noteChipText}>{preset}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {showCustomNote && (
                    <TextInput
                      style={styles.noteInput}
                      value={customNote}
                      onChangeText={setCustomNote}
                      placeholder="Свой комментарий"
                      placeholderTextColor={theme.colors.textSecondary}
                      autoFocus
                    />
                  )}
                </Numpad>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.confirmOpBtn, { backgroundColor: cfg.color }, submitting && styles.btnDisabled]}
                    onPress={handleConfirm}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmOpText}>
                      {submitting ? '...' : cfg.ctLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.idleRight}>
                <Text style={styles.idleText}>Выберите операцию</Text>
              </View>
            )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ── Small helpers ──

const StatRow: React.FC<{ label: string; amount?: number; value?: string; sub?: string; accent?: boolean }> =
  ({ label, amount, value, sub, accent }) => (
    <View style={styles.statRow}>
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        {sub && <Text style={styles.statSub}>{sub}</Text>}
      </View>
      {amount != null ? (
        <View style={styles.amountRow}>
          <Text style={[styles.statValue, accent && styles.accent]}>
            {formatAmount(amount)}
          </Text>
          <SomIcon size={9} color={accent ? theme.colors.online : theme.colors.textSecondary} />
        </View>
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
    </View>
  );

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, backgroundColor: theme.colors.background },

  // Header
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
  closeShiftBtn: {
    height: 44,
    minWidth: 120,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.destructive,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeShiftText: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium },

  // Body
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: PAD, paddingBottom: PAD },
  leftCol: { flex: 0.45, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius, padding: 14 },
  rightCol: { flex: 0.55 },

  // Stats (left)
  statsPanel: { flex: 1 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  statLabel: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  statSub: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular, opacity: 0.6, marginTop: 1 },
  statValue: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  valueText: { color: theme.colors.textPrimary, fontFamily: theme.fonts.medium },
  bold: { color: '#fff' },
  accent: { color: theme.colors.online },
  sectionTitle: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.medium, marginTop: 8, marginBottom: 4 },
  divider: { height: 1, backgroundColor: theme.colors.subtleBorder, marginVertical: 8 },

  // Mode selector
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: GAP },
  modeBtn: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  modeBtnText: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium },
  noAccess: {
    height: 44,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: GAP,
  },
  noAccessText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },

  // Numpad
  numpadWrap: { flex: 1, marginBottom: GAP },
  displayWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: 16,
    marginBottom: 8,
    gap: 4,
  },
  displayText: { color: theme.colors.textPrimary, fontSize: 36, fontFamily: theme.fonts.medium },
  numpadGrid: { flex: 1 },
  numRow: { flex: 1, flexDirection: 'row', gap: 2, marginBottom: 2 },
  numKey: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numKeyText: { color: theme.colors.textPrimary, fontSize: 24, fontFamily: theme.fonts.medium },

  // Notes
  noteRow: { flexDirection: 'row', gap: 6, marginBottom: GAP, flexWrap: 'wrap' },
  noteChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteChipActive: { backgroundColor: theme.colors.tabActive },
  noteChipText: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.regular },
  noteInput: {
    height: 44,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    marginBottom: GAP,
    outlineStyle: 'none',
  } as any,

  // Action buttons
  actionRow: { flexDirection: 'row', height: 52, marginTop: GAP },
  confirmOpBtn: {
    flex: 1,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmOpText: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium },
  btnDisabled: { opacity: 0.5 },

  // Idle right
  idleRight: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius },
  idleText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
});
