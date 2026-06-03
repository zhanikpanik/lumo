import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';

const COLS = 2;
const GAP = 2;

export const CategoryMenu: React.FC = () => {
  const { activeCategoryId, setActiveCategory } = useOrderStore();

  // Build cells: categories + fill to complete grid
  const ROWS = 5;
  const totalCells = ROWS * COLS;

  type Cell = { kind: 'category'; id: string; name: string } | { kind: 'empty' };
  const menuCategories = useMenuStore((s) => s.categories);

  // Auto-select first category if current one doesn't exist
  React.useEffect(() => {
    if (menuCategories.length > 0 && !menuCategories.find(c => c.id === activeCategoryId)) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories]);

  const cells: Cell[] = menuCategories.map(c => ({ kind: 'category' as const, id: c.id, name: c.name }));
  
  // Fill remaining with empties
  while (cells.length < totalCells) cells.push({ kind: 'empty' });

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '600' },

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
    fontWeight: '500',
    textAlign: 'center',
  },
  categoryTextActive: {
    fontWeight: 'bold',
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
