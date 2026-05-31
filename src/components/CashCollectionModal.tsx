import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number, note?: string) => Promise<void> | void;
}

export const CashCollectionModal: React.FC<Props> = ({ visible, onClose, onConfirm }) => {
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAmountInput('');
    setNote('');
  }, [visible]);

  const handleConfirm = async () => {
    const raw = amountInput.replace(/\s/g, '').replace(',', '.').trim();
    const amount = Number(raw);
    if (!raw || Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму инкассации.');
      return;
    }
    await onConfirm(amount, note.trim() || undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Инкассация</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.label}>Сумма</Text>
            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="0"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Комментарий (опционально)</Text>
            <TextInput
              style={[styles.input, styles.inputNote]}
              value={note}
              onChangeText={setNote}
              placeholder="Причина инкассации"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmText}>Списать из кассы</Text>
            </TouchableOpacity>
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
    width: '34%',
    minWidth: 360,
    maxWidth: 460,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 46,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceLight,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    fontSize: 17,
  },
  inputNote: {
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
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
    backgroundColor: '#D32F2F',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
