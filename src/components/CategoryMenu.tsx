import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';

const COLS = 2;
const ROWS = 5;
const GAP = 2;
const CELLS_PER_PAGE = ROWS * COLS; // 10

export const CategoryMenu: React.FC = () => {
  const { activeCategoryId, setActiveCategory } = useOrderStore();
  const menuCategories = useMenuStore((s) => s.categories);
  const [page, setPage] = useState(0);

  // Reset page when categories shrink below current page
  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(menuCategories.length / (CELLS_PER_PAGE - 1)) - 1);
    if (page > maxPage) setPage(0);
  }, [menuCategories.length]);

  // Auto-select first category if current one doesn't exist
  React.useEffect(() => {
    if (menuCategories.length > 0 && !menuCategories.find(c => c.id === activeCategoryId)) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories]);

  const totalPages = Math.max(1, Math.ceil(menuCategories.length / (CELLS_PER_PAGE - 1)));
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  type Cell =
    | { kind: 'category'; id: string; name: string }
    | { kind: 'next' }
    | { kind: 'prev' }
    | { kind: 'empty' };

  const cells: Cell[] = [];

  if (hasPrev) {
    cells.push({ kind: 'prev' });
  }

  const start = page * (CELLS_PER_PAGE - (hasPrev ? 1 : 0));
  const catSlots = CELLS_PER_PAGE - (hasPrev ? 1 : 0) - (hasNext ? 1 : 0);
  const pageCats = menuCategories.slice(start, start + catSlots);

  for (const cat of pageCats) {
    cells.push({ kind: 'category', id: cat.id, name: cat.name });
  }

  if (hasNext) {
    cells.push({ kind: 'next' });
  }

  // Fill remaining
  while (cells.length < CELLS_PER_PAGE) cells.push({ kind: 'empty' });

  // Build rows
  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Меню</Text>
        {totalPages > 1 && (
          <Text style={styles.pageIndicator}>{page + 1}/{totalPages}</Text>
        )}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < rows.length - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => (
              <View key={ci} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                {cell.kind === 'category' && (
                  <TouchableOpacity
                    style={[
                      styles.categoryBtn,
                      activeCategoryId === cell.id && styles.categoryActive,
                    ]}
                    onPress={() => setActiveCategory(cell.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        activeCategoryId === cell.id && styles.categoryTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {cell.name}
                    </Text>
                  </TouchableOpacity>
                )}

                {cell.kind === 'next' && (
                  <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => setPage(p => p + 1)}
                    activeOpacity={0.7}
                  >
                    <Feather name="chevron-down" size={22} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {cell.kind === 'prev' && (
                  <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => setPage(p => p - 1)}
                    activeOpacity={0.7}
                  >
                    <Feather name="chevron-up" size={22} color={theme.colors.textSecondary} />
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
  container: { flex: 1 },
  header: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
    gap: 8,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  pageIndicator: { color: theme.colors.textSecondary, fontSize: 14, fontFamily: theme.fonts.regular },

  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  categoryBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 4,
  },
  categoryActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  categoryText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  categoryTextActive: {
    fontFamily: theme.fonts.medium,
  },

  navBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
  },

  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
