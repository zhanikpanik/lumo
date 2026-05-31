import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';
import { Product } from '../types';

const COLS = 3;
const ROWS = 6;
const GAP = 2;
const TOTAL_CELLS = COLS * ROWS; // 18

export const ProductGrid: React.FC = () => {
  const { activeCategoryId, addProduct } = useOrderStore();
  const menuProducts = useMenuStore((s) => s.products);
  const menuCategories = useMenuStore((s) => s.categories);
  const products = menuProducts[activeCategoryId] || [];
  const category = menuCategories.find(c => c.id === activeCategoryId);
  const categoryName = category?.name || '';

  // Build cells
  type Cell = { kind: 'product'; product: Product } | { kind: 'pageDown' } | { kind: 'empty' };
  const cells: Cell[] = products.map((p) => ({ kind: 'product' as const, product: p }));

  const needsPagination = products.length > TOTAL_CELLS;
  // Fill remaining with empties (or pagination arrow if overflow)
  if (needsPagination) {
    while (cells.length < TOTAL_CELLS - 1) cells.push({ kind: 'empty' });
    cells.push({ kind: 'pageDown' });
  } else {
    while (cells.length < TOTAL_CELLS) cells.push({ kind: 'empty' });
  }

  // Build rows
  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>{categoryName}</Text>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < ROWS - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => (
              <View key={ci} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                {cell.kind === 'product' && (
                  <TouchableOpacity
                    style={styles.productBtn}
                    onPress={() => addProduct(cell.product)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.productName} numberOfLines={2}>{cell.product.name}</Text>
                    <Text style={styles.productPrice}>{cell.product.price} ₽</Text>
                  </TouchableOpacity>
                )}
                {cell.kind === 'pageDown' && (
                  <TouchableOpacity style={styles.pageBtn} activeOpacity={0.7}>
                    <Feather name="chevron-down" size={24} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
                {cell.kind === 'empty' && <View style={styles.emptyCell} />}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginBottom: GAP,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '600' },

  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  productBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  productName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  productPrice: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
  pageBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surface },
});
