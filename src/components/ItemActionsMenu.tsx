import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { ActiveAction } from '../types';

const COLS = 5;
const ROWS = 5;
const GAP = 2;

type ActionDef =
  | { action: ActiveAction; label: string }
  | { action: 'delete'; label: string }
  | { action: 'duplicate'; label: string }
  | null;

const ACTIONS: ActionDef[] = [
  { action: 'modifiers', label: 'Модификатор' },
  { action: 'quantity',  label: 'Количество' },
  { action: 'combo',     label: 'Комбо' },
  { action: 'comment',   label: 'Комментарий' },
  { action: 'delete',    label: 'Удалить' },
  { action: 'duplicate', label: 'Повторить' },
];

export const ItemActionsMenu: React.FC = () => {
  const { items, selectedItemId, activeAction, setActiveAction, duplicateItem } = useOrderStore();
  const selectedItem = items.find(i => i.id === selectedItemId);
  if (!selectedItem) return null;

  const cells = [...ACTIONS];
  while (cells.length < COLS * ROWS) cells.push(null);

  const rows: (ActionDef)[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>{selectedItem.product.name}</Text>
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < ROWS - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => {
              const key = `${ri}-${ci}`;
              if (!cell) {
                return (
                  <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                    <View style={styles.emptyCell} />
                  </View>
                );
              }

              const isDelete = cell.action === 'delete';
              const isDuplicate = cell.action === 'duplicate';
              const isActive = activeAction === cell.action;

              const handlePress = () => {
                if (isDuplicate) {
                  duplicateItem(selectedItem.id);
                } else {
                  setActiveAction(cell.action as ActiveAction);
                }
              };

              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[styles.actionBtn, isActive && styles.actionActive]}
                    onPress={handlePress}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionText, isActive && styles.actionTextActive]}>
                      {cell.label}
                    </Text>
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
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 4,
  },
  actionActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  actionTextActive: {
    fontWeight: 'bold',
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
