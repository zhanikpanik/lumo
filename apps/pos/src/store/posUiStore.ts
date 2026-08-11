import { create } from 'zustand';
import type { OrderItem, Modifier, ActiveAction } from '../types';

/**
 * Minimal UI state for the POS screen.
 *
 * This store holds ONLY ephemeral UI state shared between PosScreen
 * and its children (ModifierGrid, OrderPanel, etc.). All order data
 * comes from InstantDB hooks; all mutations go through useInstantOrderEditor.
 *
 * Replaces the 899-line orderStore.ts which mixed UI state, data, and
 * Supabase sync logic.
 */
interface PosUiState {
  // ── Navigation ────────────────────────────────────────
  currentOrderId: string | null;
  setCurrentOrderId: (id: string | null) => void;

  // ── Selection ──────────────────────────────────────────
  selectedItemId: string | null;
  selectedModifierId: string | null;
  modifierAction: 'quantity' | 'delete' | null;
  activeAction: ActiveAction;
  activeCategoryId: string;
  activeModifierGroupId: string;

  // ── Draft (modifier composition buffer) ───────────────
  draftItem: OrderItem | null;

  // ── Actions ───────────────────────────────────────────
  selectItem: (itemId: string | null) => void;
  selectModifier: (modifierId: string | null) => void;
  setModifierAction: (action: 'quantity' | 'delete' | null) => void;
  setActiveAction: (action: ActiveAction) => void;
  setActiveCategory: (categoryId: string) => void;
  setActiveModifierGroup: (groupId: string) => void;

  // ── Draft mutations ───────────────────────────────────
  startDraft: (item: OrderItem) => void;
  updateDraftQuantity: (delta: number) => void;
  toggleModifier: (modifier: Modifier) => void;
  setModifierQuantity: (modifierId: string, qty: number) => void;
  removeModifierFromDraft: (modifierId: string) => void;
  setDraftComment: (comment: string) => void;
  commitDraft: () => OrderItem | null;
  cancelDraft: () => void;
}

export const usePosUiStore = create<PosUiState>((set, get) => ({
  // ── Initial state ─────────────────────────────────────
  currentOrderId: null,
  setCurrentOrderId: (id) => set({ currentOrderId: id }),
  selectedItemId: null,
  selectedModifierId: null,
  modifierAction: null,
  activeAction: null,
  activeCategoryId: '',
  activeModifierGroupId: '',
  draftItem: null,

  // ── Selection ─────────────────────────────────────────
  selectItem: (itemId) => {
    if (!itemId) {
      set({
        selectedItemId: null,
        activeAction: null,
        draftItem: null,
        selectedModifierId: null,
        modifierAction: null,
      });
      return;
    }
    set({ selectedItemId: itemId });
  },

  selectModifier: (modifierId) => {
    set({
      selectedModifierId: modifierId,
      modifierAction: modifierId ? 'quantity' : null,
    });
  },

  setModifierAction: (action) => set({ modifierAction: action }),
  setActiveAction: (action) => set({ activeAction: action }),
  setActiveCategory: (categoryId) => set({ activeCategoryId: categoryId }),
  setActiveModifierGroup: (groupId) => set({ activeModifierGroupId: groupId }),

  // ── Draft mutations ───────────────────────────────────

  startDraft: (item) => {
    set({
      draftItem: JSON.parse(JSON.stringify(item)),
      selectedItemId: item.id,
      activeAction: 'modifiers',
    });
  },

  updateDraftQuantity: (delta) => {
    const { draftItem } = get();
    if (!draftItem) return;
    const newQty = Math.max(0, draftItem.quantity + delta);
    if (newQty === 0) {
      set({ draftItem: null, selectedItemId: null, activeAction: null });
      return;
    }
    set({ draftItem: { ...draftItem, quantity: newQty } });
  },

  toggleModifier: (modifier) => {
    set((state) => {
      if (!state.draftItem) return state;
      const draft = state.draftItem;
      const has = draft.modifiers.some((m) => m.id === modifier.id);
      const newMods = has
        ? draft.modifiers.filter((m) => m.id !== modifier.id)
        : [...draft.modifiers, modifier];
      return { draftItem: { ...draft, modifiers: newMods } };
    });
  },

  setModifierQuantity: (modifierId, qty) => {
    const { draftItem } = get();
    if (!draftItem) return;
    if (qty <= 0) {
      set({
        draftItem: {
          ...draftItem,
          modifiers: draftItem.modifiers.filter((m) => m.id !== modifierId),
        },
        selectedModifierId: null,
      });
      return;
    }
    const existing = draftItem.modifiers.filter((m) => m.id === modifierId);
    const allRelated = draftItem.modifiers.filter(
      (m) => m.id === modifierId || m.id.startsWith(modifierId + '_'),
    );
    const totalCount = allRelated.length;
    if (qty === totalCount) return;
    if (qty > totalCount) {
      const toAdd = qty - totalCount;
      const newModifiers = [...draftItem.modifiers];
      const template = existing[0] ?? allRelated[0];
      for (let i = 0; i < toAdd; i++) {
        newModifiers.push({
          ...template,
          id: modifierId + '_' + (totalCount + i + 1),
        });
      }
      set({ draftItem: { ...draftItem, modifiers: newModifiers } });
    } else {
      const toRemove = totalCount - qty;
      let removed = 0;
      set({
        draftItem: {
          ...draftItem,
          modifiers: draftItem.modifiers.filter((m) => {
            if (removed >= toRemove) return true;
            // Remove copies first (mod-milk_2, mod-milk_3), then base
            if (m.id !== modifierId && m.id.startsWith(modifierId + '_')) {
              removed++;
              return false;
            }
            if (m.id === modifierId) {
              removed++;
              return false;
            }
            return true;
          }),
        },
      });
    }
  },

  removeModifierFromDraft: (modifierId) => {
    const { draftItem } = get();
    if (!draftItem) return;
    set({
      draftItem: {
        ...draftItem,
        modifiers: draftItem.modifiers.filter((m) => m.id !== modifierId),
      },
      selectedModifierId: null,
      modifierAction: null,
    });
  },

  setDraftComment: (comment) => {
    const { draftItem } = get();
    if (!draftItem) return;
    set({ draftItem: { ...draftItem, comment: comment || undefined } });
  },

  commitDraft: () => {
    const { draftItem } = get();
    if (!draftItem) return null;
    const committed = draftItem;
    set({
      draftItem: null,
      selectedItemId: null,
      selectedModifierId: null,
      activeAction: null,
    });
    return committed;
  },

  cancelDraft: () => {
    set({
      draftItem: null,
      selectedItemId: null,
      selectedModifierId: null,
      activeAction: null,
    });
  },
}));
