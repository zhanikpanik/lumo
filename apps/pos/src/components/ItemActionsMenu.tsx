import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { usePosUiStore } from '../store/posUiStore';
import type { ActiveAction, OrderItem } from '../types';

const COLS = 2;
const ROWS = 4;
const GAP = 2;

type ActionDef =
  | { action: ActiveAction | 'delete'; label: string; disabled?: boolean }
  | null;

const ACTIONS: ActionDef[] = [
  { action: 'modifiers', label: 'Модификатор' },
  { action: 'quantity',  label: 'Количество' },
  { action: 'comment',   label: 'Комментарий' },
  { action: 'delete',    label: 'Удалить' },
];

interface ItemActionsMenuProps {
  /** Order items from InstantDB */
  items: OrderItem[];
}

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({ items }) => {
  const selectedItemId = usePosUiStore(s => s.selectedItemId);
  const activeAction = usePosUiStore(s => s.activeAction);
  const setActiveAction = usePosUiStore(s => s.setActiveAction);

  const selectedItem = items.find(i => i.id === selectedItemId);
  if (!selectedItem) return null;

  // Disable modifier button when product has no modifiers
  const hasModifiers = selectedItem.product.hasModifiers;

  const cells: (ActionDef | null)[] = ACTIONS.map(a => {
    if (a && a.action === 'modifiers' && !hasModifiers) {
      return { ...a, disabled: true };
    }
    return a;
  });
  while (cells.length < COLS * ROWS) cells.push(null);

  const rows: (ActionDef | null)[][] = [];
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

              const isDisabled = cell.disabled ?? false;
              const isActive = !isDisabled && activeAction === cell.action;

              const handlePress = () => {
                if (isDisabled) return;
                setActiveAction(cell.action);
              };

              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[styles.actionBtn, isActive && styles.actionActive, isDisabled && styles.actionDisabled]}
                    onPress={handlePress}
                    activeOpacity={isDisabled ? 1 : 0.7}
                  >
                    <Text style={[styles.actionText, isActive && styles.actionTextActive, isDisabled && styles.actionTextDisabled]}>
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
  headerText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

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
  actionDisabled: {
    opacity: 0.3,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  actionTextActive: {
    fontFamily: theme.fonts.medium,
  },
  actionTextDisabled: {
    color: theme.colors.textDisabled,
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
