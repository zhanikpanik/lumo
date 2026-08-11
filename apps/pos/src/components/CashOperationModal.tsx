import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/colors';
import { BaseModal } from './BaseModal';

type CashOpMode = 'collection' | 'in' | 'out';

interface Props {
  visible: boolean;
  mode: CashOpMode;
  onClose: () => void;
  onConfirm: (amount: number, note?: string) => Promise<void> | void;
}

const CONFIG: Record<CashOpMode, {
  title: string;
  cta: string;
  ctaColor: string;
  notePlaceholder: string;
  hint?: string;
}> = {
  collection: {
    title: 'Инкассация',
    cta: 'Списать из кассы',
    ctaColor: theme.colors.destructive,
    notePlaceholder: 'Причина инкассации',
  },
  in: {
    title: 'Внесение в кассу',
    cta: 'Внести',
    ctaColor: theme.colors.info,
    notePlaceholder: 'Например: размен в начале смены',
  },
  out: {
    title: 'Изъятие из кассы',
    cta: 'Изъять',
    ctaColor: theme.colors.infoOrange,
    notePlaceholder: 'Например: размен / возврат сдачи',
    hint: 'Сумма не может превысить наличку в кассе.',
  },
};

export const CashOperationModal: React.FC<Props> = ({
  visible,
  mode,
  onClose,
  onConfirm,
}) => {
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmountInput('');
    setNote('');
    setSubmitting(false);
  }, [visible]);

  const cfg = CONFIG[mode];

  const handleConfirm = async () => {
    if (submitting) return;
    const raw = amountInput.replace(/\s/g, '').replace(',', '.').trim();
    const amount = Number(raw);
    if (!raw || Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму.');
      return;
    }
    setSubmitting(true);
    await onConfirm(amount, note.trim() || undefined);
  };

  const footer = (
    <View style={styles.actions}>
      <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.cancelText}>Отмена</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.confirmBtn, { backgroundColor: cfg.ctaColor }]}
        onPress={handleConfirm}
        activeOpacity={0.8}
      >
        <Text style={styles.confirmText}>{cfg.cta}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <BaseModal visible={visible} onClose={onClose} title={cfg.title} footer={footer}>
      <Text style={styles.label}>Сумма</Text>
      <TextInput
        style={styles.input}
        value={amountInput}
        onChangeText={setAmountInput}
        placeholder="0"
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="decimal-pad"
        autoFocus
      />
      {cfg.hint ? <Text style={styles.hint}>{cfg.hint}</Text> : null}

      <Text style={styles.label}>Комментарий (опционально)</Text>
      <TextInput
        style={[styles.input, styles.inputNote]}
        value={note}
        onChangeText={setNote}
        placeholder={cfg.notePlaceholder}
        placeholderTextColor={theme.colors.textSecondary}
      />
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    height: 46,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceLight,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
  },
  inputNote: {
    fontSize: 16,
      fontFamily: theme.fonts.regular,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtn: {
    flex: 1.6,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  },
  confirmText: {
    color: '#fff',
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  },
});
