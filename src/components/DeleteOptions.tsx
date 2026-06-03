import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const COLS = 3;
const ROWS = 6;
const GAP = 2;

interface Props {
  /** Called after delete completes — resets to category view. If false, item was deleted. */
  onDone: () => void;
}

export const DeleteOptions: React.FC<Props> = ({ onDone }) => {
  const { removeProduct, items, selectedItemId } = useOrderStore();
  const selectedItem = items.find(i => i.id === selectedItemId);

  type Cell = 
    | { kind: 'action'; label: string; action: 'with_writeoff' | 'without_writeoff' }
    | { kind: 'cancel'; label: string }
    | { kind: 'empty' };

  const cells: Cell[] = [
    { kind: 'action', label: 'Удалить со списанием', action: 'with_writeoff' },
    { kind: 'action', label: 'Удалить без списания', action: 'without_writeoff' },
  ];
  while (cells.length < COLS * ROWS - 1) cells.push({ kind: 'empty' });
  cells.push({ kind: 'cancel', label: 'Отмена' });

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  const handleDelete = (withWriteoff: boolean) => {
    if (selectedItem) {
      removeProduct(selectedItem.id);
    }
    onDone();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          {selectedItem?.product.name || 'Удаление'}
        </Text>
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < ROWS - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => {
              const key = `${ri}-${ci}`;
              if (cell.kind === 'empty') {
                return (
                  <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                    <View style={styles.emptyCell} />
                  </View>
                );
              }

              if (cell.kind === 'cancel') {
                return (
                  <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={onDone}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelText}>{cell.label}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              const isWithWriteoff = cell.action === 'with_writeoff';
              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isWithWriteoff ? styles.actionBtnDanger : styles.actionBtnSecondary,
                    ]}
                    onPress={() => handleDelete(isWithWriteoff)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionLabel}>{cell.label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '600' },
  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },
  actionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    backgroundColor: theme.colors.surfaceLight,
  },
  actionBtnDanger: {
    backgroundColor: '#D32F2F',
  },
  actionBtnSecondary: {
    backgroundColor: '#E65100',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
  },
  cancelText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
