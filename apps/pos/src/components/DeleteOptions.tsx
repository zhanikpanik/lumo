import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { usePosUiStore } from '../store/posUiStore';
import type { OrderItem } from '../types';

const COLS = 3;
const ROWS = 5;
const GAP = 2;

interface Props {
  /** Order items (from InstantDB or parent) */
  items: OrderItem[];
  /** Called after delete completes */
  onDone: () => void;
  /** 'item' (default) for dish/modifier deletion, 'order' for whole-order deletion */
  mode?: 'item' | 'order';
  /** Order number shown in header when mode='order' */
  orderNumber?: string | number;
  /** Called instead of removeProduct when deleting an item */
  onRemoveItem?: (itemId: string, priceTiyin: number, quantity: number) => void;
  /** Called instead of deleteOrder when deleting an order */
  onDeleteOrder?: () => void;
}

export const DeleteOptions: React.FC<Props> = ({ items, onDone, mode = 'item', orderNumber, onRemoveItem, onDeleteOrder }) => {
  const { selectedItemId, selectedModifierId, draftItem, removeModifierFromDraft, selectItem } = usePosUiStore();

  const isOrderMode = mode === 'order';

  const isModifierContext = !isOrderMode && !!selectedModifierId;
  const selectedItem = !isOrderMode ? items.find(i => i.id === selectedItemId) : undefined;
  const modifier = isModifierContext ? draftItem?.modifiers.find(m => m.id === selectedModifierId) : null;

  type Cell = 
    | { kind: 'action'; label: string; action: 'with_writeoff' | 'without_writeoff' }
    | { kind: 'empty' };

  const cells: Cell[] = [
    { kind: 'action', label: 'Удалить со списанием', action: 'with_writeoff' },
    { kind: 'action', label: 'Удалить без списания', action: 'without_writeoff' },
  ];
  while (cells.length < COLS * ROWS) cells.push({ kind: 'empty' });

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  const handleDelete = (withWriteoff: boolean) => {
    if (isOrderMode) {
      if (onDeleteOrder) {
        onDeleteOrder();
      }
    } else if (isModifierContext && modifier) {
      removeModifierFromDraft(modifier.id);
    } else if (selectedItem) {
      if (onRemoveItem) {
        onRemoveItem(selectedItem.id, selectedItem.product.price, selectedItem.quantity);
      }
      // Clear selection after item removal
      selectItem(null);
    }
    onDone();
  };

  const headerTitle = isOrderMode
    ? `Заказ №${orderNumber || ''}`
    : isModifierContext
      ? (modifier?.name || 'Удаление')
      : (selectedItem?.product.name || 'Удаление');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          {headerTitle}
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

              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(cell.action === 'with_writeoff')}
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
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
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
  actionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
