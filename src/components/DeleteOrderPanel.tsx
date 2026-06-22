import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons'; // minus-circle only - no Chikin yet
import { ExclamationIcon, TrashIcon, CrossIcon } from './Icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

interface Props {
  onDeleted: () => void;
}

export const DeleteOrderPanel: React.FC<Props> = ({ onDeleted }) => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const deleteOrder = useOrderStore((s) => s.deleteOrder);
  const [confirmed, setConfirmed] = useState(false);

  if (!currentOrder) return null;

  const handleDelete = (withWriteOff: boolean) => {
    deleteOrder(currentOrder.id);
    // TODO: handle write-off logic
    onDeleted();
  };

  if (!confirmed) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <ExclamationIcon size={16} color="#FF5252" />
          <Text style={styles.headerDangerText}>Удаление заказа</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.warningText}>
            Заказ №{currentOrder.number} будет удалён безвозвратно.
          </Text>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => setConfirmed(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmText}>Подтвердить удаление</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TrashIcon size={16} color="#FF5252" />
        <Text style={styles.headerDangerText}>Способ удаления</Text>
      </View>
      <View style={styles.body}>
        <TouchableOpacity
          style={styles.optionBtn}
          onPress={() => handleDelete(false)}
          activeOpacity={0.7}
        >
          <CrossIcon size={20} color={theme.colors.textPrimary} />
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Без списания</Text>
            <Text style={styles.optionDesc}>Блюда вернутся на склад</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionBtn, styles.optionBtnDanger]}
          onPress={() => handleDelete(true)}
          activeOpacity={0.7}
        >
          <Feather name="minus-circle" size={20} color="#FF5252" />
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, styles.optionTitleDanger]}>Со списанием</Text>
            <Text style={styles.optionDesc}>Блюда спишутся с учёта</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setConfirmed(false)}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, overflow: 'hidden' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerDangerText: {
    color: theme.colors.destructiveLight,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  body: {
    flex: 1,
    padding: 10,
    gap: 10,
    justifyContent: 'center',
  },
  warningText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmBtn: {
    height: 52,
    backgroundColor: theme.colors.destructive,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },

  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    gap: 10,
  },
  optionBtnDanger: {
    borderWidth: 1,
    borderColor: theme.colors.destructive,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  optionTitleDanger: {
    color: theme.colors.destructiveLight,
  },
  optionDesc: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    marginTop: 2,
  },

  backBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
  },
});
