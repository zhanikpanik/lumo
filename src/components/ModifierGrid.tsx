import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { Modifier } from '../types';
import { QuantityNumpad } from './QuantityNumpad';
import { DishCommentPanel } from './DishCommentPanel';
import { useMenuStore } from '../store/menuStore';

const COLS = 3;
// Сетка из 5 рядов: 4 ряда модификаторов + последний ряд занимает кнопка «Готово»
// (на всю ширину). Высота ряда совпадает с ItemActionsMenu, поэтому кнопки в обоих
// гридах оказываются на одной горизонтали.
const ROWS = 5;
const MODIFIER_ROWS = ROWS - 1;
const MODIFIER_CELLS = COLS * MODIFIER_ROWS;
const GAP = 2;

export const ModifierGrid: React.FC = () => {
  const { items, selectedItemId, activeAction, activeModifierGroupId, setActiveModifierGroup, toggleModifier, selectItem } = useOrderStore();
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const selectedItem = items.find(i => i.id === selectedItemId);

  // Quantity mode → numpad
  if (activeAction === 'quantity' && selectedItem) {
    return <QuantityNumpad />;
  }

  // Comment mode → dish comment panel
  if (activeAction === 'comment' && selectedItem) {
    return <DishCommentPanel />;
  }

  // Modifier mode
  const isModifiers = activeAction === 'modifiers' && !!selectedItem;
  const availableGroups = selectedItem
    ? modifierGroups.filter(g => g.productIds.includes(selectedItem.product.id))
    : [];
  const activeGroup = availableGroups.find(g => g.id === activeModifierGroupId) || availableGroups[0];
  const currentGroupIdx = activeGroup ? availableGroups.findIndex(g => g.id === activeGroup.id) : -1;
  const modifiers = isModifiers && activeGroup ? activeGroup.modifiers : [];
  const headerTitle = isModifiers && activeGroup ? activeGroup.name : '';
  const itemModifierIds = selectedItem?.modifiers.map(m => m.id) || [];

  const handlePrevGroup = () => {
    if (currentGroupIdx > 0) {
      setActiveModifierGroup(availableGroups[currentGroupIdx - 1].id);
    }
  };

  const handleNextGroup = () => {
    if (currentGroupIdx < availableGroups.length - 1) {
      setActiveModifierGroup(availableGroups[currentGroupIdx + 1].id);
    }
  };

  // Build cells (только для модификаторных рядов — последний ряд занимает кнопка «Готово»)
  type Cell = { kind: 'modifier'; mod: Modifier } | { kind: 'empty' };
  const cells: Cell[] = modifiers.map(m => ({ kind: 'modifier' as const, mod: m }));
  while (cells.length < MODIFIER_CELLS) cells.push({ kind: 'empty' });

  const rows: Cell[][] = [];
  for (let r = 0; r < MODIFIER_ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  const renderDoneRow = () => (
    <View style={styles.doneRow}>
      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => selectItem(null)}
        activeOpacity={0.7}
      >
        <Text style={styles.doneText}>Готово</Text>
      </TouchableOpacity>
    </View>
  );

  // Заглушки для рендера пустых рядов в empty-state (когда у блюда нет групп модификаторов),
  // чтобы общая высота правой колонки не менялась.
  const emptyRows: Cell[][] = [];
  for (let r = 0; r < MODIFIER_ROWS; r++) {
    emptyRows.push(Array.from({ length: COLS }, () => ({ kind: 'empty' as const })));
  }

  const renderModifierRows = (source: Cell[][]) =>
    source.map((row, ri) => (
      <View key={ri} style={[styles.row, { marginBottom: GAP }]}>
        {row.map((cell, ci) => (
          <View key={ci} style={[styles.cellWrap, ci < COLS - 1 && { marginRight: GAP }]}>
            {cell.kind === 'modifier' ? (
              <TouchableOpacity
                style={[styles.modBtn, itemModifierIds.includes(cell.mod.id) && styles.modActive]}
                onPress={() => toggleModifier(cell.mod)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.modText, itemModifierIds.includes(cell.mod.id) && styles.modTextActive]}
                  numberOfLines={2}
                >
                  {cell.mod.name}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyCell} />
            )}
          </View>
        ))}
      </View>
    ));

  // No modifier panel needed — show empty state
  if (!isModifiers) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBack} />
          <Text style={styles.headerText}>{selectedItem?.product.name || ''}</Text>
          <View style={styles.headerBack} />
        </View>
        <View style={styles.grid}>
          {renderModifierRows(emptyRows)}
          {renderDoneRow()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={handlePrevGroup}>
          <Feather name="chevron-left" size={22} color={currentGroupIdx > 0 ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerText}>{headerTitle}</Text>
        <TouchableOpacity style={styles.headerBack} onPress={handleNextGroup}>
          {currentGroupIdx < availableGroups.length - 1 && (
            <Feather name="chevron-right" size={22} color={theme.colors.textPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {renderModifierRows(rows)}
        {renderDoneRow()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerBack: { width: 44, justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1, color: theme.colors.textPrimary, fontSize: 18, fontWeight: '600', textAlign: 'center' },

  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  modBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 4,
  },
  modActive: {
    backgroundColor: '#fff',
  },
  modText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
  },
  modTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },

  // Ряд оставляем размером с обычный, чтобы общая высота сетки совпадала с ItemActionsMenu,
  // а саму кнопку прижимаем к низу — над ней получается «воздух».
  doneRow: { flex: 1, justifyContent: 'flex-end' },
  doneBtn: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00C853',
    borderRadius: theme.borderRadius,
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
