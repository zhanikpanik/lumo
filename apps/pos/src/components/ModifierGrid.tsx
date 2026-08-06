import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { theme } from '../theme/colors';
import { usePosUiStore } from '../store/posUiStore';
import type { OrderItem, Modifier } from '../types';
import { Numpad } from './Numpad';
import { DishCommentPanel } from './DishCommentPanel';
import { DeleteOptions } from './DeleteOptions';
import type { InstantModifierGroup } from '../store/useInstantMenu';

const COLS = 3;
const ROWS = 5;
const MODIFIER_ROWS = ROWS;
const MODIFIER_CELLS = COLS * MODIFIER_ROWS;
const GAP = 2;

interface ModifierGridProps {
  /** Order items from InstantDB */
  items: OrderItem[];
  /** InstantDB modifier groups for the selected product */
  modifierGroups?: InstantModifierGroup[];
  /** Called on Done instead of committing through store */
  onCommit?: (item: OrderItem) => void;
  /** Called instead of removeProduct when deleting an item */
  onRemoveItem?: (itemId: string, priceTiyin: number, quantity: number) => void;
}

export const ModifierGrid: React.FC<ModifierGridProps> = ({ items, modifierGroups: modifierGroupsProp, onCommit, onRemoveItem }) => {
  const {
    selectedItemId, draftItem, selectedModifierId, activeAction,
    activeModifierGroupId, setActiveModifierGroup,
    toggleModifier, selectItem, setModifierQuantity,
    updateDraftQuantity,
  } = usePosUiStore();

  const selectedItem = draftItem || items.find(i => i.id === selectedItemId);

  // Quantity mode → numpad
  if (activeAction === 'quantity' && selectedItem) {
    const isMod = !!selectedModifierId;
    let currentQty = selectedItem.quantity;
    let displayTitle = 'Кол-во порций';

    if (isMod && draftItem && selectedModifierId) {
      const mod = draftItem.modifiers.find(m => m.id === selectedModifierId);
      currentQty = draftItem.modifiers.filter(m => m.id === selectedModifierId).length;
      displayTitle = mod?.name ?? 'Кол-во порций';
    }

    return (
      <Numpad
        mode="quantity"
        value={String(currentQty)}
        onChange={(v) => {
          const newQty = parseInt(v) || 0;
          if (isMod && selectedModifierId) {
            setModifierQuantity(selectedModifierId, newQty);
          } else {
            const delta = newQty - currentQty;
            updateDraftQuantity(delta);
          }
        }}
        title={displayTitle}
        accumulate={false}
      />
    );
  }

  // Comment mode → dish comment panel
  if (activeAction === 'comment' && selectedItem) {
    return <DishCommentPanel items={items} />;
  }

  // Delete mode → delete options
  if (activeAction === 'delete' && selectedItem) {
    return <DeleteOptions items={items} onDone={() => selectItem(null)} onRemoveItem={onRemoveItem} />;
  }


  // Modifier mode
  const isModifiers = activeAction === 'modifiers' && !!selectedItem;

  // When InstantDB modifierGroups are provided (from InstantProduct.modifierGroups),
  // they are already scoped to the selected product — no productIds filter needed.
  const availableGroups = modifierGroupsProp ?? [];
  const activeGroup = availableGroups.length > 0
    ? (availableGroups.find(g => g.id === activeModifierGroupId) || availableGroups[0])
    : null;
  const currentGroupIdx = activeGroup ? availableGroups.findIndex(g => g.id === activeGroup.id) : -1;

  // Adapt InstantDB modifiers to the Modifier shape expected by the grid
  const modifiers: { id: string; name: string; price: number }[] = isModifiers && activeGroup
    ? activeGroup.modifiers.map(m => ({
        id: m.id,
        name: m.name,
        price: m.priceTiyin,
      }))
    : [];
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

  // Build cells
  type Cell = { kind: 'modifier'; mod: { id: string; name: string; price: number } } | { kind: 'empty' };
  const cells: Cell[] = modifiers.map(m => ({ kind: 'modifier' as const, mod: m }));
  while (cells.length < MODIFIER_CELLS) cells.push({ kind: 'empty' });

  const rows: Cell[][] = [];
  for (let r = 0; r < MODIFIER_ROWS; r++) {
    rows.push(cells.slice(r * COLS, r * COLS + COLS));
  }

  // Empty rows for empty-state (when no modifier groups)
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
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={handlePrevGroup}>
          <ChevronLeftIcon size={22} color={currentGroupIdx > 0 ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerText}>{headerTitle}</Text>
        <TouchableOpacity style={styles.headerBack} onPress={handleNextGroup}>
          {currentGroupIdx < availableGroups.length - 1 && (
            <ChevronRightIcon size={22} color={theme.colors.textPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {renderModifierRows(rows)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  headerBack: { width: 44, justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1, color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium, textAlign: 'center' },

  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  modBtn: {
    flex: 1, borderRadius: 10, backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center', alignItems: 'center', padding: 4,
  },
  modActive: {
    backgroundColor: theme.colors.white,
  },
  modText: { color: theme.colors.textPrimary, fontSize: 12, fontFamily: theme.fonts.medium, textAlign: 'center' },
  modTextActive: { color: theme.colors.background },
  emptyCell: { flex: 1, backgroundColor: theme.colors.surfaceLight },
});
