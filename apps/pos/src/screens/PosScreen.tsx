import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { theme } from '../theme/colors';
import { PosHeader } from '../components/PosHeader';
import { OrderPanel } from '../components/OrderPanel';
import { OrderActionsMenu } from '../components/OrderActionsMenu';
import { WaiterPickerPanel } from '../components/WaiterPickerPanel';
import { GuestCounterPanel } from '../components/GuestCounterPanel';
import { CategoryMenu } from '../components/CategoryMenu';
import { ProductGrid } from '../components/ProductGrid';
import { ItemActionsMenu } from '../components/ItemActionsMenu';
import { ModifierGrid } from '../components/ModifierGrid';
import { ModifierActionsMenu } from '../components/ModifierActionsMenu';
import { Numpad } from '../components/Numpad';
import { DeleteOptions } from '../components/DeleteOptions';
import { TakeoverLock } from '../components/TakeoverLock';
import { usePosUiStore } from '../store/posUiStore';
import { useInstantOrders } from '../store/useInstantOrders';
import { useInstantMenu } from '../store/useInstantMenu';
import { useInstantOrderEditor } from '../store/useInstantOrderEditor';
import { useInstantVenue } from '../store/useInstantVenue';
import { useInstantShift } from '../store/useInstantShift';
import { useUserStore } from '../store/userStore';
import { requiresOrderTakeover } from '../utils/permissions';
import { CommentModal } from '../components/CommentModal';
import { NotificationModal } from '../components/NotificationModal';
import type { OrderActionType, OrderItem, Product } from '../types';
import type { InstantModifierGroup } from '../store/useInstantMenu';
import { getPrintAdapter } from '../print/printService';

const GAP = 10;
const COL_GAP = 10;
const PADDING = 10;
const EMPTY_ITEMS: OrderItem[] = [];

/**
 * Compute total from order items (replaces orderStore.getTotal).
 */
const calcTotal = (items: OrderItem[]): number =>
  items.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.product.price + modTotal) * item.quantity;
  }, 0);

const modifierConfigurationKey = (item: OrderItem): string =>
  item.modifiers
    .map((modifier) => `${modifier.sourceModifierId ?? modifier.id.replace(/_\d+$/, '')}:${modifier.price}`)
    .sort()
    .join('|');

export const orderItemConfigurationKey = (item: OrderItem): string =>
  `${item.product.id}\u0000${item.comment?.trim() ?? ''}\u0000${modifierConfigurationKey(item)}`;

interface PosNavigation {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  replace: (screen: string) => void;
}

export const PosScreen: React.FC<{ navigation?: PosNavigation }> = ({ navigation }) => {
  // ── UI state (from posUiStore) ────────────────────────
  const {
    currentOrderId,
    isCreatingOrder,
    setCreatingOrder,
    pendingTableTransfer,
    setPendingTableTransfer,
    selectedItemId, selectedModifierId, modifierAction,
    activeAction, draftItem,
    selectItem, selectModifier, cancelDraft,
    setModifierQuantity, startDraft,
  } = usePosUiStore();

  // ── InstantDB data ────────────────────────────────────
  const { venueType, employees } = useInstantVenue();
  const currentUser = useUserStore((state) => state.currentUser);
  const { openShift: currentShift } = useInstantShift(currentUser?.id);
  const shiftId = currentShift?.id;

  const { orders: instantOrders } = useInstantOrders(shiftId);
  const { products, categories } = useInstantMenu();

  const currentOrder = useMemo(() => {
    if (!currentOrderId) return null;
    return instantOrders.find((o) => o.id === currentOrderId) ?? null;
  }, [instantOrders, currentOrderId]);

  const items = currentOrder?.items ?? EMPTY_ITEMS;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [pendingItems, setPendingItems] = useState<Array<OrderItem & { committedItemId?: string }>>([]);
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, number>>({});
  const pendingQuantitiesRef = useRef(pendingQuantities);
  pendingQuantitiesRef.current = pendingQuantities;
  const recentItemTargetsRef = useRef(new Map<string, { id: string; quantity: number }>());
  const itemMutationQueuesRef = useRef(new Map<string, Promise<void>>());
  const pendingItemIds = useMemo(
    () => new Set([...pendingItems.map((item) => item.id), ...Object.keys(pendingQuantities)]),
    [pendingItems, pendingQuantities],
  );
  const displayItems = useMemo(
    () => [
      ...items.map((item) => pendingQuantities[item.id] === undefined
        ? item
        : { ...item, quantity: pendingQuantities[item.id] }),
      ...pendingItems,
    ],
    [items, pendingItems, pendingQuantities],
  );
  const hasPendingItems = pendingItems.length > 0 || Object.keys(pendingQuantities).length > 0;

  // ── InstantDB write commands ──────────────────────────
  const { addItem, updateItemQuantity, removeItem, deleteCurrentOrder, updateMeta } =
    useInstantOrderEditor({
      orderId: currentOrderId ?? null,
      actorEmployeeId: currentUser?.id ?? 'unknown',
      currentOrder: currentOrder
        ? { id: currentOrder.id, status: currentOrder.status, totalAmountTiyin: currentOrder.totalAmount }
        : null,
      products,
    });

  // ── Derived state ─────────────────────────────────────
  const isModifierSelected = !!selectedModifierId;
  const selectedItem = draftItem ?? displayItems.find((item) => item.id === selectedItemId);
  const isItemSelected = !!selectedItem;
  const editorItems = draftItem ? [draftItem, ...displayItems] : displayItems;
  const isEmpty = displayItems.length === 0;
  const total = calcTotal(displayItems);

  const modifierGroups: InstantModifierGroup[] | undefined =
    selectedItem && products[selectedItem.product.id]?.modifierGroups;

  const isTakeaway = venueType === 'takeaway';

  // ── Local UI state ────────────────────────────────────
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentVisible, setCommentVisible] = useState(false);
  const [orderActionsMode, setOrderActionsMode] = useState(false);
  const [selectedOrderAction, setSelectedOrderAction] = useState<OrderActionType>(null);
  const backPendingRef = useRef(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [pendingOrderMeta, setPendingOrderMeta] = useState<{
    guestCount?: number;
    ownerEmployeeId?: string;
    waiter?: string;
    comment?: string;
  }>({});
  const metadataQueueRef = useRef<Promise<void>>(Promise.resolve());
  const displayOrder = useMemo(() => {
    if (!currentOrder) return null;
    const tablePatch = pendingTableTransfer?.orderId === currentOrder.id
      ? {
          tableId: pendingTableTransfer.tableId,
          tableNumber: pendingTableTransfer.tableNumber,
          zone: pendingTableTransfer.zoneName,
          isQuickCheck: false,
        }
      : {};
    return { ...currentOrder, ...pendingOrderMeta, ...tablePatch };
  }, [currentOrder, pendingOrderMeta, pendingTableTransfer]);

  // ── Effects ───────────────────────────────────────────

  const isLocked = useMemo(
    () => requiresOrderTakeover(currentUser, displayOrder, isTakeaway),
    [currentUser, displayOrder, isTakeaway],
  );
  useEffect(() => {
    if (isCreatingOrder && currentOrder) setCreatingOrder(false);
  }, [currentOrder, isCreatingOrder, setCreatingOrder]);

  useEffect(() => {
    if (
      currentOrder
      && pendingTableTransfer?.orderId === currentOrder.id
      && pendingTableTransfer.tableId === currentOrder.tableId
    ) {
      setPendingTableTransfer(null);
    }
  }, [currentOrder, pendingTableTransfer, setPendingTableTransfer]);


  useEffect(() => {
    setPendingItems((current) => {
      const next = current.filter(
        (pending) => !pending.committedItemId || !items.some((item) => item.id === pending.committedItemId),
      );
      return next.length === current.length ? current : next;
    });
  }, [items]);

  useEffect(() => {
    setPendingQuantities((current) => {
      const entries = Object.entries(current).filter(([itemId, quantity]) =>
        !items.some((item) => item.id === itemId && item.quantity === quantity),
      );
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [items]);

  useEffect(() => {
    setPendingItems([]);
    setPendingQuantities({});
    pendingQuantitiesRef.current = {};
    recentItemTargetsRef.current.clear();
    itemMutationQueuesRef.current.clear();
    setPendingOrderMeta({});
    metadataQueueRef.current = Promise.resolve();
  }, [currentOrderId]);

  useEffect(() => {
    if (!currentOrder) return;
    setPendingOrderMeta((current) => {
      const next = { ...current };
      if (next.guestCount === currentOrder.guestCount) delete next.guestCount;
      if (next.ownerEmployeeId === currentOrder.ownerEmployeeId) {
        delete next.ownerEmployeeId;
        delete next.waiter;
      }
      if (next.comment === currentOrder.comment) delete next.comment;
      return next;
    });
  }, [currentOrder]);

  // ── Handlers ──────────────────────────────────────────

  const submitItem = useCallback(async (item: OrderItem): Promise<string> => {
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPendingItems((current) => [...current, { ...item, id: pendingId }]);
    try {
      const result = await addItem(item);
      if (!result) throw new Error('Заказ ещё не готов');
      setPendingItems((current) => itemsRef.current.some((currentItem) => currentItem.id === result.orderItemId)
        ? current.filter((pending) => pending.id !== pendingId)
        : current.map((pending) =>
          pending.id === pendingId ? { ...pending, committedItemId: result.orderItemId } : pending
        ));
      return result.orderItemId;
    } catch (error: unknown) {
      setPendingItems((current) => current.filter((pending) => pending.id !== pendingId));
      Alert.alert('Не удалось добавить блюдо', error instanceof Error ? error.message : 'Повторите попытку');
      throw error;
    }
  }, [addItem]);

  const queueItem = useCallback((item: OrderItem) => {
    const key = orderItemConfigurationKey(item);
    const previous = itemMutationQueuesRef.current.get(key) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(async () => {
      const currentItem = itemsRef.current.find(
        (candidate) => orderItemConfigurationKey(candidate) === key,
      );
      const recentTarget = recentItemTargetsRef.current.get(key);
      const targetId = currentItem?.id ?? recentTarget?.id;
      if (!targetId) {
        const id = await submitItem(item);
        recentItemTargetsRef.current.set(key, { id, quantity: item.quantity });
        return;
      }

      const currentQuantity = pendingQuantitiesRef.current[targetId]
        ?? currentItem?.quantity
        ?? recentTarget?.quantity
        ?? 0;
      const nextQuantity = currentQuantity + item.quantity;
      recentItemTargetsRef.current.set(key, { id: targetId, quantity: nextQuantity });
      pendingQuantitiesRef.current = {
        ...pendingQuantitiesRef.current,
        [targetId]: nextQuantity,
      };
      setPendingQuantities(pendingQuantitiesRef.current);
      setPendingItems((current) => current.map((pending) =>
        pending.committedItemId === targetId ? { ...pending, quantity: nextQuantity } : pending
      ));

      try {
        await updateItemQuantity(targetId, nextQuantity);
      } catch (error: unknown) {
        const { [targetId]: _failedQuantity, ...remainingQuantities } = pendingQuantitiesRef.current;
        pendingQuantitiesRef.current = remainingQuantities;
        setPendingQuantities(remainingQuantities);
        recentItemTargetsRef.current.set(key, { id: targetId, quantity: currentQuantity });
        setPendingItems((current) => current.map((pending) =>
          pending.committedItemId === targetId ? { ...pending, quantity: currentQuantity } : pending
        ));
        Alert.alert('Не удалось изменить количество', error instanceof Error ? error.message : 'Повторите попытку');
        throw error;
      }
    });
    let settled: Promise<void>;
    settled = queued.finally(() => {
      if (itemMutationQueuesRef.current.get(key) === settled) {
        itemMutationQueuesRef.current.delete(key);
      }
    });
    itemMutationQueuesRef.current.set(key, settled);
    void settled.catch(() => undefined);
  }, [submitItem, updateItemQuantity]);

  const handleAddProduct = useCallback((product: Product) => {
    if (product.hasModifiers) {
      // Create a local draft — user will configure modifiers, then commit
      const draftItem: OrderItem = {
        id: `draft-${Date.now()}`,
        product,
        quantity: 1,
        modifiers: [],
      };
      startDraft(draftItem);
    } else {
      // Serialize identical additions so repeated taps increment one line.
      queueItem({
        id: `item-${Date.now()}`,
        product,
        quantity: 1,
        modifiers: [],
      });
    }
  }, [queueItem, startDraft]);
  const queueOrderMeta = useCallback((
    updates: Record<string, unknown>,
    optimistic: typeof pendingOrderMeta,
  ) => {
    setPendingOrderMeta((current) => ({ ...current, ...optimistic }));
    const request = metadataQueueRef.current.then(() => updateMeta(updates));
    metadataQueueRef.current = request.then(() => undefined, () => undefined);
    void request.catch((error: unknown) => {
      setPendingOrderMeta((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(optimistic)) {
          if (next[key as keyof typeof next] === value) delete next[key as keyof typeof next];
        }
        return next;
      });
      Alert.alert('Не удалось обновить заказ', error instanceof Error ? error.message : 'Повторите попытку');
    });
  }, [updateMeta]);

  const handleWaiterChange = useCallback((employeeId: string) => {
    const waiter = employees.find((employee) => employee.id === employeeId);
    if (!waiter) return;
    queueOrderMeta(
      { employeeId },
      { ownerEmployeeId: employeeId, waiter: waiter.name },
    );
    setOrderActionsMode(false);
    setSelectedOrderAction(null);
  }, [employees, queueOrderMeta]);

  const handleGuestCountChange = useCallback((guestCount: number) => {
    queueOrderMeta({ guestCount }, { guestCount });
  }, [queueOrderMeta]);


  const handleCommitDraft = useCallback(() => {
    const state = usePosUiStore.getState();
    const draft = state.draftItem;
    if (!draft || !currentOrderId) return;
    const existingItem = itemsRef.current.find((item) => item.id === draft.id);
    const committed = state.commitDraft();
    if (!committed) return;
    if (!existingItem) {
      queueItem(committed);
      return;
    }

    setPendingQuantities((current) => ({ ...current, [committed.id]: committed.quantity }));
    void updateItemQuantity(committed.id, committed.quantity).catch((error: unknown) => {
      setPendingQuantities((current) => {
        const next = { ...current };
        delete next[committed.id];
        return next;
      });
      Alert.alert('Не удалось изменить количество', error instanceof Error ? error.message : 'Повторите попытку');
    });
  }, [currentOrderId, queueItem, updateItemQuantity]);

  const handleBack = useCallback(() => {
    if (backPendingRef.current) return;
    backPendingRef.current = true;

    const comment = displayOrder?.comment?.trim() || '';
    const empty = displayItems.length === 0 && !comment;
    cancelDraft();
    const targetOrderId = currentOrderId;
    if (empty && targetOrderId) {
      usePosUiStore.getState().setCurrentOrderId(null);
    }
    navigation?.navigate('Orders');
    backPendingRef.current = false;

    if (empty && targetOrderId) {
      void deleteCurrentOrder(targetOrderId).catch((error: unknown) => {
        if (error instanceof Error && error.message === 'Order is not active') return;
        Alert.alert(
          'Не удалось отменить пустой заказ',
          error instanceof Error ? error.message : 'Повторите попытку',
        );
      });
    }
  }, [displayOrder, displayItems, currentOrderId, deleteCurrentOrder, cancelDraft, navigation]);

  const handleSearchOpen = () => { setSearchMode(true); setSearchQuery(''); };
  const handleSearchClose = () => { setSearchMode(false); setSearchQuery(''); };

  const handleOrderActionsToggle = useCallback(() => {
    if (hasPendingItems) return;
    if (orderActionsMode) {
      setOrderActionsMode(false);
      setSelectedOrderAction(null);
    } else {
      cancelDraft();
      setOrderActionsMode(true);
      setSelectedOrderAction(null);
    }
  }, [hasPendingItems, orderActionsMode, cancelDraft]);

  const handleOrderActionSelect = useCallback((action: OrderActionType) => {
    if (action === 'transfer') {
      if (!isTakeaway) navigation?.navigate('TablePicker');
      setOrderActionsMode(false);
      setSelectedOrderAction(null);
    } else {
      setSelectedOrderAction(action);
    }
  }, [isTakeaway, navigation]);

  const closeOrderActions = () => {
    setOrderActionsMode(false);
    setSelectedOrderAction(null);
  };

  const handleDeleteCurrentOrder = useCallback(() => {
    if (!currentOrderId) return;
    const targetOrderId = currentOrderId;
    usePosUiStore.getState().setCurrentOrderId(null);
    setOrderActionsMode(false);
    setSelectedOrderAction(null);
    navigation?.replace('Orders');
    void deleteCurrentOrder(targetOrderId).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'Order is not active') return;
      Alert.alert(
        'Не удалось отменить заказ',
        error instanceof Error ? error.message : 'Повторите попытку',
      );
    });
  }, [currentOrderId, deleteCurrentOrder, navigation]);

  const handlePrecheck = async () => {
    if (isEmpty || hasPendingItems || !currentOrderId) return;
    const adapter = getPrintAdapter();
    const lines = items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => m.name),
      comment: item.comment,
    }));
    await adapter.print({
      ticketId: `precheck-${currentOrderId}-${Date.now()}`,
      orderNumber: displayOrder?.number ?? currentOrderId.slice(0, 6),
      table: displayOrder?.tableNumber ?? '',
      snapshot: { kind: 'initial', lines },
      attempt: 1,
      createdAt: new Date().toISOString(),
    });
  };

  if (isCreatingOrder) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar hidden />
        <View style={styles.orderCreating}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.orderCreatingText}>Создаём заказ…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        <PosHeader
          onBack={handleBack}
          onEditPress={handleOrderActionsToggle}
          editActive={orderActionsMode}
          searchMode={searchMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchOpen={handleSearchOpen}
          onSearchClose={handleSearchClose}
          onNotificationPress={() => setNotificationVisible(true)}
          hideRight={orderActionsMode && !!selectedOrderAction}
          currentOrder={displayOrder}
        />

        {isLocked ? (
          <View style={styles.mainRow}>
            <View style={styles.takeoverCol}>
              <TakeoverLock onTakeover={(waiterName) => updateMeta({ employeeId: waiterName })} />
            </View>
          </View>
        ) : searchMode ? (
          <View style={styles.mainRow}>
            <View style={styles.leftCol}>
              <View style={styles.colContent}>
                <OrderPanel
                  items={displayItems}
                  pendingItemIds={pendingItemIds}
                  currentOrder={displayOrder}
                  onCommentPress={() => setCommentVisible(true)}
                />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn} onPress={() => void handlePrecheck()} disabled={isEmpty || hasPendingItems}>
                  <Text style={styles.precheckText}>Пречек</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentBtn, (isEmpty || hasPendingItems) && styles.btnDisabled]}
                  onPress={() => navigation?.navigate('Payment', { totalAmountTiyin: total })}
                  disabled={isEmpty || hasPendingItems}
                >
                  <Text style={styles.paymentLabel}>Оплата</Text>
                  <Text style={styles.paymentAmount}>{formatAmount(total)} c</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ width: COL_GAP }} />
            <View style={styles.searchRightCol}>
              <ProductGrid
                items={displayItems}
                products={products}
                categories={categories}
                onAddItem={handleAddProduct}
              />
            </View>
          </View>
        ) : (
          <View style={styles.mainRow}>
            <View style={styles.leftCol}>
              <View style={styles.colContent}>
                <OrderPanel
                  items={displayItems}
                  pendingItemIds={pendingItemIds}
                  currentOrder={displayOrder}
                  onCommentPress={() => setCommentVisible(true)}
                />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn} onPress={() => void handlePrecheck()} disabled={isEmpty || hasPendingItems}>
                  <Text style={styles.precheckText}>Пречек</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentBtn, isItemSelected && styles.paymentBtnSecondary, (isEmpty || hasPendingItems) && styles.btnDisabled]}
                  onPress={() => navigation?.navigate('Payment', { totalAmountTiyin: total })}
                  disabled={isEmpty || hasPendingItems}
                >
                  <Text style={styles.paymentLabel}>Оплата</Text>
                  <Text style={styles.paymentAmount}>{formatAmount(total)} c</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ width: COL_GAP }} />

            {/* ── Middle: Menu / OrderActions / ItemActions ── */}
            <View style={styles.midCol}>
              <View style={styles.colContent}>
                {orderActionsMode ? (
                  <OrderActionsMenu selectedAction={selectedOrderAction} onSelect={handleOrderActionSelect} currentOrder={displayOrder} />
                ) : isModifierSelected ? (
                  <ModifierActionsMenu />
                ) : isItemSelected ? (
                  <ItemActionsMenu items={editorItems} />
                ) : (
                  <CategoryMenu categories={categories} />
                )}
              </View>
              <TouchableOpacity
                style={[styles.colFooterBtn, (orderActionsMode || isItemSelected || isModifierSelected) && styles.colFooterBtnDanger]}
                onPress={() => {
                  if (orderActionsMode) { closeOrderActions(); }
                  else if (isModifierSelected || isItemSelected) { cancelDraft(); }
                }}
              >
                <Text style={[styles.colFooterBtnText, (orderActionsMode || isItemSelected || isModifierSelected) && styles.colFooterBtnTextDanger]}>
                  {orderActionsMode ? 'Закрыть' : isItemSelected || isModifierSelected ? 'Отмена' : 'Скидки'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ width: COL_GAP }} />

            {/* ── Right: Products / Action panels ── */}
            <View style={styles.rightCol}>
              <View style={styles.colContent}>
                {orderActionsMode ? (
                  selectedOrderAction === 'waiter' ? <WaiterPickerPanel onChangeWaiter={handleWaiterChange} /> :
                  selectedOrderAction === 'guests' ? <GuestCounterPanel guestCount={displayOrder?.guestCount ?? 1} onChangeGuestCount={handleGuestCountChange} /> :
                  selectedOrderAction === 'delete' ? <DeleteOptions items={items} mode="order" orderNumber={displayOrder?.number} onDone={closeOrderActions} onDeleteOrder={handleDeleteCurrentOrder} /> :
                  <ProductGrid items={displayItems} products={products} categories={categories} onAddItem={handleAddProduct} />
                ) : isModifierSelected && modifierAction === 'delete' ? (
                  <DeleteOptions items={items} onDone={() => selectModifier(null)} />
                ) : isModifierSelected ? (
                  (() => {
                    const mod = draftItem?.modifiers.find(m => m.id === selectedModifierId);
                    if (!mod || !selectedModifierId) return null;
                    const count = draftItem!.modifiers.filter(m => m.id === selectedModifierId).length;
                    return (
                      <Numpad
                        mode="quantity"
                        value={String(count)}
                        onChange={(v) => setModifierQuantity(selectedModifierId, parseInt(v) || 0)}
                        title={mod.name}
                        accumulate={false}
                      />
                    );
                  })()
                ) : isItemSelected ? (
                  <ModifierGrid
                    items={editorItems}
                    modifierGroups={modifierGroups}
                    onRemoveItem={removeItem}
                  />
                ) : (
                  <ProductGrid items={displayItems} products={products} categories={categories} onAddItem={handleAddProduct} />
                )}
              </View>
              <TouchableOpacity
                style={[styles.colFooterBtn, (isItemSelected || isModifierSelected) && styles.colFooterBtnActive, isEmpty && !isItemSelected && !isModifierSelected && styles.btnDisabled]}
                onPress={() => {
                  if (isItemSelected || isModifierSelected) {
                    handleCommitDraft();
                  } else if (!isEmpty) {
                    cancelDraft();
                    navigation?.navigate('Orders');
                  }
                }}
                disabled={isEmpty && !isItemSelected && !isModifierSelected}
              >
                <Text style={[!isItemSelected && !isModifierSelected && !isEmpty && styles.colFooterBtnTextAccent, (isItemSelected || isModifierSelected) && styles.colFooterBtnTextActive, isEmpty && styles.colFooterBtnText]}>
                  {isItemSelected || isModifierSelected ? 'Готово' : 'Сохранить заказ'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      <CommentModal visible={commentVisible} onClose={() => setCommentVisible(false)} comment={displayOrder?.comment} onSaveComment={(comment) => queueOrderMeta({ comment }, { comment })} />
      <NotificationModal visible={notificationVisible} onClose={() => setNotificationVisible(false)} />
    </SafeAreaView>
  );
};

const formatAmount = (n: number) => (n / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
  root: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
  orderCreating: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: GAP, backgroundColor: theme.colors.background },
  orderCreatingText: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.medium },
  mainRow: { flex: 1, minHeight: 0, minWidth: 0, flexDirection: 'row', paddingHorizontal: PADDING, paddingBottom: COL_GAP },
  leftCol: { flex: 0.35, minHeight: 0, flexDirection: 'column' },
  midCol: { flex: 0.25, flexDirection: 'column' },
  rightCol: { flex: 0.40, flexDirection: 'column' },
  colContent: { flex: 1, overflow: 'hidden', borderRadius: theme.borderRadius },
  colFooterBtn: { height: 56, marginTop: GAP, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  colFooterBtnActive: { backgroundColor: theme.colors.accent },
  colFooterBtnText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  colFooterBtnTextAccent: { color: theme.colors.accentLight, fontSize: 16, fontFamily: theme.fonts.medium },
  colFooterBtnTextActive: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium },
  colFooterBtnDanger: { backgroundColor: theme.colors.destructive },
  colFooterBtnTextDanger: { color: theme.colors.white, fontFamily: theme.fonts.medium },
  paymentRow: { height: 56, flexDirection: 'row', gap: GAP, marginTop: GAP },
  searchRightCol: { flex: 0.65 },
  takeoverCol: { flex: 0.65, overflow: 'hidden', borderRadius: theme.borderRadius },
  paymentBtn: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius, paddingHorizontal: 12 },
  paymentBtnSecondary: { backgroundColor: theme.colors.surfaceLight },
  btnDisabled: { opacity: 0.4 },
  paymentLabel: { color: theme.colors.white, fontSize: 22, fontFamily: theme.fonts.medium },
  paymentAmount: { color: theme.colors.white, fontSize: 22, fontFamily: theme.fonts.medium },
  precheckBtn: { flex: 0.5, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius },
  precheckText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
});
