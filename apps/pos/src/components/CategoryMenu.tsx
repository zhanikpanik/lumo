import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { usePosUiStore } from '../store/posUiStore';
import type { InstantCategory } from '../store/useInstantMenu';

interface CategoryMenuProps {
  categories?: InstantCategory[];
  activeCategory?: string;
  onCategorySelect?: (category: { id: string; name: string; color: string }) => void;
}

const COLS = 2;
const ROWS = 5;
const GAP = 2;
const CELLS_PER_PAGE = ROWS * COLS; // 10

export const CategoryMenu: React.FC<CategoryMenuProps> = ({ categories: categoriesProp, activeCategory: activeCategoryProp, onCategorySelect }) => {
  // Supabase stores — only used when InstantDB props aren't passed
  // posUiStore for active category (fallback when props not provided)
  const storeActiveId = usePosUiStore((s) => s.activeCategoryId);
  const storeSetActive = usePosUiStore((s) => s.setActiveCategory);
  const categories = categoriesProp ?? [];
  const activeCategoryId = activeCategoryProp ?? storeActiveId;
  const selectCategory = onCategorySelect
    ? (id: string) => {
        const cat = categories.find(c => c.id === id);
        if (cat) onCategorySelect({ id: cat.id, name: cat.name, color: (cat as any).color ?? (cat as any).colorHex ?? '' });
      }
    : (id: string) => storeSetActive(id);

  const [page, setPage] = useState(0);

  // Reset page when categories shrink below current page
  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(categories.length / (CELLS_PER_PAGE - 1)) - 1);
    if (page > maxPage) setPage(0);
  }, [categories.length]);

  // Auto-select first category if current one doesn't exist
  React.useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.id === activeCategoryId)) {
      selectCategory(categories[0].id);
    }
  }, [categories, activeCategoryId, selectCategory]);

  const totalPages = Math.max(1, Math.ceil(categories.length / (CELLS_PER_PAGE - 1)));
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
  const pageCats = categories.slice(start, start + catSlots);

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
                    onPress={() => selectCategory(cell.id)}
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
