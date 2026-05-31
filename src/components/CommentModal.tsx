import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const CommentModal: React.FC<Props> = ({ visible, onClose }) => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (visible) {
      setComment(currentOrder?.comment || '');
    }
  }, [visible]);

  const handleSave = () => {
    useOrderStore.setState((state) => ({
      orders: state.orders.map(o =>
        o.id === state.currentOrderId ? { ...o, comment } : o
      ),
    }));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Комментарий</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder="Введите комментарий..."
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              autoFocus
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveText}>Сохранить</Text>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: '10%',
  },
  modal: {
    width: '40%',
    maxWidth: 440,
    minWidth: 320,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
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
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  body: {
    padding: 20,
    paddingTop: 0,
  },
  input: {
    height: 100,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    padding: 16,
    color: theme.colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 16,
    outlineStyle: 'none',
  } as any,
  saveBtn: {
    height: 48,
    backgroundColor: '#00C853',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
