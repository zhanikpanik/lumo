import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { OrderActionType } from '../types';

const COLS = 2;
const ROWS = 5;
const GAP = 2;

interface Props {
  selectedAction: OrderActionType | null;
  onSelect: (action: OrderActionType | null) => void;
}

type ActionDef = { action: OrderActionType; label: string; danger?: boolean } | null;

const ACTIONS: ActionDef[] = [
  { action: 'transfer', label: 'Перенести' },
  { action: 'waiter', label: 'Официант' },
  { action: 'guests', label: 'Гости' },
  { action: 'delete', label: 'Удалить', danger: true },
];

export const OrderActionsMenu: React.FC<Props> = ({ selectedAction, onSelect }) => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));

  const cells: ActionDef[] = [...ACTIONS];
  while (cells.length < COLS * ROWS) cells.push(null);

  const rows: ActionDef[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          Заказ {currentOrder?.number || ''}
        </Text>
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

              const isActive = selectedAction === cell.action;

              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isActive && styles.actionBtnActive,
                      cell.danger && styles.actionBtnDanger,
                    ]}
                    onPress={() => onSelect(isActive ? null : cell.action)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        isActive && styles.actionTextActive,
                        cell.danger && styles.actionTextDanger,
                      ]}
                    >
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
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },

  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  actionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 10,
  },
  actionBtnActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  actionBtnDanger: { backgroundColor: theme.colors.dangerTint },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  actionTextActive: {
    fontFamily: theme.fonts.medium,
  },
  actionTextDanger: {
    color: theme.colors.destructiveLight,
  },
  emptyCell: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
  },
});
