import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const COLS = 2;
const ROWS = 3;
const GAP = 2;

export const ModifierActionsMenu: React.FC = () => {
  const { draftItem, selectedModifierId, modifierAction, setModifierAction, removeModifierFromDraft } = useOrderStore();

  const modifier = draftItem?.modifiers.find(m => m.id === selectedModifierId);
  if (!modifier) return null;

  type Cell = { kind: 'action'; label: string; action: 'quantity' | 'delete' } | { kind: 'empty' };
  const cells: Cell[] = [
    { kind: 'action', label: 'Кол-во', action: 'quantity' },
    { kind: 'action', label: 'Удалить', action: 'delete' },
  ];
  while (cells.length < COLS * ROWS) cells.push({ kind: 'empty' });

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>{modifier.name}</Text>
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

              const isActive = modifierAction === cell.action;
              const isDelete = cell.action === 'delete';
              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isDelete && styles.actionBtnDanger,
                      !isDelete && isActive && styles.actionBtnActive,
                    ]}
                    onPress={() => {
                      if (isDelete && modifierAction === 'delete') {
                        // Already in delete mode — execute delete
                        removeModifierFromDraft(modifier.id);
                      } else if (isDelete) {
                        // Enter delete mode
                        setModifierAction('delete');
                      } else {
                        setModifierAction(cell.action);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionText, isDelete && styles.actionTextDanger]}>
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
  actionBtnActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  actionBtnDanger: {
    backgroundColor: theme.colors.destructive,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  actionTextDanger: {
    color: '#fff',
    fontFamily: theme.fonts.medium,
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
