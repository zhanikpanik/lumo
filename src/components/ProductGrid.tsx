import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDownIcon } from './Icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';
import { Product } from '../types';

const COLS = 3;
const SEARCH_COLS = 5;
const ROWS = 5;
const GAP = 2;
const TOTAL_CELLS = COLS * ROWS;
const SEARCH_TOTAL_CELLS = SEARCH_COLS * ROWS;

interface Props {
  searchQuery?: string;
}

export const ProductGrid: React.FC<Props> = ({ searchQuery }) => {
  const { activeCategoryId, addProduct, items } = useOrderStore();
  const menuProducts = useMenuStore((s) => s.products);
  const menuCategories = useMenuStore((s) => s.categories);

  // In search mode (even with empty query), filter all products.
  // Empty query = no results yet, shows hint.
  const isSearch = searchQuery !== undefined;
  const query = (searchQuery || '').trim().toLowerCase();

  const products: Product[] = isSearch
    ? (query.length > 0
        ? Object.values(menuProducts).flat().filter(p =>
            p.name.toLowerCase().includes(query))
        : [])
    : (menuProducts[activeCategoryId] || []);

  const cols = isSearch ? SEARCH_COLS : COLS;
  const totalCells = isSearch ? SEARCH_TOTAL_CELLS : TOTAL_CELLS;
  const categoryName = isSearch
    ? (query.length > 0 ? `Поиск: ${searchQuery}` : '')
    : (menuCategories.find(c => c.id === activeCategoryId)?.name || '');

  // Map productId → total quantity already in order (for green tint + count badge)
  const orderedQty = new Map<string, number>();
  items.forEach(i => {
    orderedQty.set(i.product.id, (orderedQty.get(i.product.id) || 0) + i.quantity);
  });

  // Build cells
  type Cell = { kind: 'product'; product: Product } | { kind: 'pageDown' } | { kind: 'empty' };
  const cells: Cell[] = products.map((p) => ({ kind: 'product' as const, product: p }));

  const needsPagination = products.length > totalCells;
  // Fill remaining with empties (or pagination arrow if overflow)
  if (needsPagination) {
    while (cells.length < totalCells - 1) cells.push({ kind: 'empty' });
    cells.push({ kind: 'pageDown' });
  } else {
    while (cells.length < totalCells) cells.push({ kind: 'empty' });
  }

  // Build rows
  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * cols, r * cols + cols));
  }

  return (
    <View style={styles.container}>
      {/* Header — hidden in search mode */}
      {!isSearch && (
        <View style={styles.header}>
          <Text style={styles.headerText}>{categoryName}</Text>
        </View>
      )}

      {/* Grid */}
      <View style={styles.grid}>
        {products.length === 0 ? (
          <View style={styles.emptyCat}>
            <Text style={styles.emptyCatText}>
              {isSearch ? (query.length > 0 ? 'Ничего не найдено' : 'Введите название блюда') : 'Нет блюд в категории'}
            </Text>
          </View>
        ) : rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < ROWS - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => (
              <View key={ci} style={[styles.cellWrap, ci < cols - 1 && { marginRight: GAP }]}>
                {cell.kind === 'product' && (() => {
                  const qty = orderedQty.get(cell.product.id) || 0;
                  const isOrdered = qty > 0;
                  return (
                    <TouchableOpacity
                      style={[styles.productBtn, isOrdered && styles.productBtnOrdered]}
                      onPress={() => addProduct(cell.product)}
                      activeOpacity={0.7}
                    >
                      {isOrdered && (
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyBadgeText}>×{qty}</Text>
                        </View>
                      )}
                      <Text style={[styles.productName, isOrdered && styles.productNameOrdered]} numberOfLines={2}>
                        {cell.product.name}
                      </Text>
                      <Text style={[styles.productPrice, isOrdered && styles.productPriceOrdered]}>
                        {cell.product.price} c
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
                {cell.kind === 'pageDown' && (
                  <TouchableOpacity style={styles.pageBtn} activeOpacity={0.7}>
                    <ChevronDownIcon size={24} color={theme.colors.textSecondary} />
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
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginBottom: GAP,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },

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
  productBtnOrdered: {
    backgroundColor: theme.colors.orderedBg,
  },
  productName: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
    marginBottom: 2,
  },
  productNameOrdered: {
    color: theme.colors.orderedName,
  },
  productPrice: {
    color: theme.colors.whiteAlpha85,
    fontSize: 14,
    fontFamily: theme.fonts.regular,
  },
  productPriceOrdered: {
    color: theme.colors.whiteAlpha65,
  },
  qtyBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: theme.colors.accentLight,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  qtyBadgeText: {
    color: '#000',
    fontSize: 12,
    fontFamily: theme.fonts.medium,
  },
  pageBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surface },
  emptyCat: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCatText: { color: theme.colors.textDisabled, fontSize: 15, fontFamily: theme.fonts.regular },
});
