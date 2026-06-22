import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PersonIcon } from './Icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';

const COLS = 3;
const ROWS = 5;
const GAP = 2;
const TOTAL_CELLS = COLS * ROWS;

export const WaiterPickerPanel: React.FC = () => {
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const waiters = useVenueStore((s) => s.waiters);
  const updateOrderMeta = useOrderStore((s) => s.updateOrderMeta);
  const currentWaiter = currentOrder?.waiter || '';

  type Cell = 
    | { kind: 'waiter'; name: string; id: string }
    | { kind: 'empty' };

  const cells: Cell[] = waiters.map(w => ({ kind: 'waiter' as const, name: w.name, id: w.id }));
  while (cells.length < TOTAL_CELLS) cells.push({ kind: 'empty' });

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <PersonIcon size={16} color={theme.colors.textSecondary} />
        <Text style={styles.headerText}>Выберите официанта</Text>
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

              const isActive = currentWaiter === cell.name;

              return (
                <View key={key} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[styles.waiterBtn, isActive && styles.waiterBtnActive]}
                    onPress={() => updateOrderMeta({ waiter: cell.name })}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.waiterText, isActive && styles.waiterTextActive]}
                      numberOfLines={2}
                    >
                      {cell.name}
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
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

  waiterBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 6,
  },
  waiterBtnActive: {
    backgroundColor: theme.colors.tabActive,
  },
  waiterText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  waiterTextActive: {
    color: theme.colors.white,
  },
  emptyCell: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
  },
});
