/**
 * posUiStore — draft lifecycle, selection, modifier logic.
 *
 * This is the core user interaction model: waiter picks a dish,
 * adds modifiers, adjusts quantity, commits to order.
 */
import { usePosUiStore } from '../store/posUiStore';
import type { OrderItem, Modifier } from '../types';

// ── Helpers ───────────────────────────────────────────────

function makeItem(overrides?: Partial<OrderItem>): OrderItem {
  return {
    id: 'item-1',
    product: { id: 'prod-1', categoryId: 'cat-1', name: 'Латте', price: 15000 },
    quantity: 1,
    modifiers: [],
    ...overrides,
  };
}

const milk: Modifier = { id: 'mod-milk', name: 'Молоко овсяное', price: 3000 };
const syrup: Modifier = { id: 'mod-syrup', name: 'Сироп ванильный', price: 2000 };

// Reset store between tests
beforeEach(() => {
  usePosUiStore.setState(usePosUiStore.getInitialState());
});

// ── Draft lifecycle ───────────────────────────────────────

describe('draft lifecycle', () => {
  it('startDraft creates a deep copy and sets activeAction', () => {
    const item = makeItem();
    usePosUiStore.getState().startDraft(item);

    const { draftItem, selectedItemId, activeAction } = usePosUiStore.getState();
    expect(draftItem).not.toBe(item); // deep copy, not reference
    expect(draftItem?.id).toBe('item-1');
    expect(selectedItemId).toBe('item-1');
    expect(activeAction).toBe('modifiers');
  });

  it('commitDraft returns item and clears state', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.toggleModifier(milk);

    const committed = usePosUiStore.getState().commitDraft();

    expect(committed?.modifiers).toHaveLength(1);
    expect(committed?.modifiers[0].id).toBe('mod-milk');

    const state = usePosUiStore.getState();
    expect(state.draftItem).toBeNull();
    expect(state.selectedItemId).toBeNull();
    expect(state.selectedModifierId).toBeNull();
    expect(state.activeAction).toBeNull();
  });

  it('commitDraft returns null when no draft', () => {
    expect(usePosUiStore.getState().commitDraft()).toBeNull();
  });

  it('cancelDraft discards all changes', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.toggleModifier(milk);
    store.toggleModifier(syrup);

    usePosUiStore.getState().cancelDraft();

    const state = usePosUiStore.getState();
    expect(state.draftItem).toBeNull();
    expect(state.selectedItemId).toBeNull();
    expect(state.selectedModifierId).toBeNull();
    expect(state.activeAction).toBeNull();
  });
});

// ── Quantity ──────────────────────────────────────────────

describe('updateDraftQuantity', () => {
  it('increases quantity', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ quantity: 2 }));
    store.updateDraftQuantity(3);

    expect(usePosUiStore.getState().draftItem?.quantity).toBe(5);
  });

  it('decreases quantity', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ quantity: 3 }));
    store.updateDraftQuantity(-1);

    expect(usePosUiStore.getState().draftItem?.quantity).toBe(2);
  });

  it('removes draft when quantity reaches zero', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ quantity: 1 }));
    store.updateDraftQuantity(-1);

    const state = usePosUiStore.getState();
    expect(state.draftItem).toBeNull();
    expect(state.selectedItemId).toBeNull();
    expect(state.activeAction).toBeNull();
  });

  it('clamps quantity — does not go below zero', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ quantity: 1 }));
    store.updateDraftQuantity(-5);

    // Should have removed draft (quantity hit 0)
    expect(usePosUiStore.getState().draftItem).toBeNull();
  });

  it('does nothing when no draft', () => {
    usePosUiStore.getState().updateDraftQuantity(1);
    expect(usePosUiStore.getState().draftItem).toBeNull();
  });
});

// ── Modifiers ─────────────────────────────────────────────

describe('toggleModifier', () => {
  it('adds modifier when not present', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.toggleModifier(milk);

    expect(usePosUiStore.getState().draftItem?.modifiers).toEqual([milk]);
  });

  it('removes modifier when already present', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ modifiers: [milk] }));
    store.toggleModifier(milk);

    expect(usePosUiStore.getState().draftItem?.modifiers).toEqual([]);
  });

  it('toggles independently — adding one does not affect the other', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.toggleModifier(milk);
    store.toggleModifier(syrup);

    const mods = usePosUiStore.getState().draftItem?.modifiers;
    expect(mods).toHaveLength(2);
    expect(mods?.map((m) => m.id)).toEqual(['mod-milk', 'mod-syrup']);

    store.toggleModifier(milk);
    expect(usePosUiStore.getState().draftItem?.modifiers).toEqual([syrup]);
  });

  it('does nothing when no draft', () => {
    usePosUiStore.getState().toggleModifier(milk);
    expect(usePosUiStore.getState().draftItem).toBeNull();
  });
});

describe('setModifierQuantity', () => {
  it('increases modifier count by duplicating', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ modifiers: [milk] }));
    store.setModifierQuantity('mod-milk', 3);

    const mods = usePosUiStore.getState().draftItem?.modifiers;
    expect(mods).toHaveLength(3);
    // Original + 2 copies with suffixed ids
    expect(mods?.[0].id).toBe('mod-milk');
    expect(mods?.[1].id).toBe('mod-milk_2');
    expect(mods?.[2].id).toBe('mod-milk_3');
  });

  it('decreases modifier count', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({
      modifiers: [
        milk,
        { ...milk, id: 'mod-milk_2' },
        { ...milk, id: 'mod-milk_3' },
      ],
    }));
    store.setModifierQuantity('mod-milk', 1);

    expect(usePosUiStore.getState().draftItem?.modifiers).toHaveLength(1);
  });

  it('removes modifier when qty set to zero', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ modifiers: [milk] }));
    store.setModifierQuantity('mod-milk', 0);

    const state = usePosUiStore.getState();
    expect(state.draftItem?.modifiers).toEqual([]);
    expect(state.selectedModifierId).toBeNull();
  });

  it('does nothing when qty matches current count', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ modifiers: [milk] }));
    store.setModifierQuantity('mod-milk', 1);

    // No change
    expect(usePosUiStore.getState().draftItem?.modifiers).toHaveLength(1);
  });
});

describe('removeModifierFromDraft', () => {
  it('removes modifier and clears selection', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ modifiers: [milk, syrup] }));
    store.selectModifier('mod-milk');
    store.removeModifierFromDraft('mod-milk');

    const state = usePosUiStore.getState();
    expect(state.draftItem?.modifiers).toEqual([syrup]);
    expect(state.selectedModifierId).toBeNull();
    expect(state.modifierAction).toBeNull();
  });
});

// ── Selection ─────────────────────────────────────────────

describe('selectItem', () => {
  it('selects item by id', () => {
    usePosUiStore.getState().selectItem('item-42');
    expect(usePosUiStore.getState().selectedItemId).toBe('item-42');
  });

  it('clears everything when selecting null', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.selectModifier('mod-milk');

    store.selectItem(null);

    const state = usePosUiStore.getState();
    expect(state.selectedItemId).toBeNull();
    expect(state.activeAction).toBeNull();
    expect(state.draftItem).toBeNull();
    expect(state.selectedModifierId).toBeNull();
    expect(state.modifierAction).toBeNull();
  });
});

describe('selectModifier', () => {
  it('sets modifier and action to quantity', () => {
    const store = usePosUiStore.getState();
    store.selectModifier('mod-milk');

    const state = usePosUiStore.getState();
    expect(state.selectedModifierId).toBe('mod-milk');
    expect(state.modifierAction).toBe('quantity');
  });

  it('clears modifier and action when null', () => {
    const store = usePosUiStore.getState();
    store.selectModifier('mod-milk');
    store.selectModifier(null);

    const state = usePosUiStore.getState();
    expect(state.selectedModifierId).toBeNull();
    expect(state.modifierAction).toBeNull();
  });
});

// ── Comment ───────────────────────────────────────────────

describe('setDraftComment', () => {
  it('sets comment on draft', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem());
    store.setDraftComment('Без лактоза');

    expect(usePosUiStore.getState().draftItem?.comment).toBe('Без лактоза');
  });

  it('clears comment when empty string', () => {
    const store = usePosUiStore.getState();
    store.startDraft(makeItem({ comment: 'test' }));
    store.setDraftComment('');

    expect(usePosUiStore.getState().draftItem?.comment).toBeUndefined();
  });
});
