import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
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
import { CommentModal } from '../components/CommentModal';
import { NotificationModal } from '../components/NotificationModal';
import type { OrderActionType, OrderItem, Product } from '../types';
import type { InstantModifierGroup } from '../store/useInstantMenu';
import { getPrintAdapter } from '../print/printService';

const COL_GAP = 10;

/**
 * Compute total from order items (replaces orderStore.getTotal).
 */
const calcTotal = (items: OrderItem[]): number =>
  items.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.product.price + modTotal) * item.quantity;
  }, 0);

export const PosScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  // ── UI state (from posUiStore) ────────────────────────
  const {
    currentOrderId,
    selectedItemId, selectedModifierId, modifierAction,
    activeAction, draftItem,
    selectItem, selectModifier, cancelDraft,
    setModifierQuantity, startDraft,
  } = usePosUiStore();

  // ── InstantDB data ────────────────────────────────────
  const { employees, venueType } = useInstantVenue();
  const currentUser = employees[0]; // TODO: proper current user from auth
  const { openShift: currentShift } = useInstantShift(currentUser?.id);
  const shiftId = currentShift?.id;

  const { orders: instantOrders } = useInstantOrders(shiftId);
  const { products, categories } = useInstantMenu();

  const currentOrder = useMemo(() => {
    if (!currentOrderId) return null;
    return instantOrders.find((o) => o.id === currentOrderId) ?? null;
  }, [instantOrders, currentOrderId]);

  const items = currentOrder?.items ?? [];

  // ── InstantDB write commands ──────────────────────────
  const { addItem, removeItem, deleteCurrentOrder, updateMeta } =
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
  const selectedItem = items.find((i) => i.id === selectedItemId);
  const isItemSelected = !!selectedItem || !!draftItem;
  const isEmpty = items.length === 0;
  const total = calcTotal(items);

  const modifierGroups: InstantModifierGroup[] | undefined =
    selectedItem && products[selectedItem.product.id]?.modifierGroups;

  const isTakeaway = venueType === 'takeaway';

  // ── Local UI state ────────────────────────────────────
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentVisible, setCommentVisible] = useState(false);
  const [orderActionsMode, setOrderActionsMode] = useState(false);
  const [selectedOrderAction, setSelectedOrderAction] = useState<OrderActionType>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);

  // ── Effects ───────────────────────────────────────────

  const isLocked = useMemo(() => {
    if (!currentUser || !currentOrder) return false;
    if (currentUser.role !== 'waiter') return false;
    if (isTakeaway) return false;
    return currentOrder.waiter !== currentUser.name;
  }, [currentUser, currentOrder, isTakeaway]);

  // ── Handlers ──────────────────────────────────────────

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
      // Simple product — add directly to InstantDB
      addItem({
        id: `item-${Date.now()}`,
        product,
        quantity: 1,
        modifiers: [],
      });
    }
  }, [addItem, startDraft]);

  const handleCommitDraft = useCallback(() => {
    const committed = usePosUiStore.getState().commitDraft();
    if (committed && currentOrderId) {
      // Persist to InstantDB
      addItem(committed);
    }
  }, [addItem, currentOrderId]);

  const handleBack = useCallback(() => {
    const comment = currentOrder?.comment || '';
    const empty = items.length === 0 && !comment;
    if (empty && currentOrderId && deleteCurrentOrder) {
      deleteCurrentOrder();
    }
    cancelDraft();
    navigation?.navigate('Orders');
  }, [currentOrder, items, currentOrderId, deleteCurrentOrder, cancelDraft, navigation]);

  const handleSearchOpen = () => { setSearchMode(true); setSearchQuery(''); };
  const handleSearchClose = () => { setSearchMode(false); setSearchQuery(''); };

  const handleOrderActionsToggle = useCallback(() => {
    if (orderActionsMode) {
      setOrderActionsMode(false);
      setSelectedOrderAction(null);
    } else {
      cancelDraft();
      setOrderActionsMode(true);
      setSelectedOrderAction(null);
    }
  }, [orderActionsMode, cancelDraft]);

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

  const handlePrecheck = async () => {
    if (isEmpty || !currentOrderId) return;
    const adapter = getPrintAdapter();
    const lines = items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => m.name),
      comment: item.comment,
    }));
    await adapter.print({
      ticketId: `precheck-${currentOrderId}-${Date.now()}`,
      orderNumber: currentOrder?.number ?? currentOrderId.slice(0, 6),
      table: currentOrder?.tableNumber ?? '',
      snapshot: { kind: 'initial', lines },
      attempt: 1,
      createdAt: new Date().toISOString(),
    });
  };

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
          currentOrder={currentOrder}
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
                  items={items}
                  currentOrder={currentOrder}
                  onCommentPress={() => setCommentVisible(true)}
                />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn} onPress={() => void handlePrecheck()} disabled={isEmpty}>
                  <Text style={styles.precheckText}>Пречек</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentBtn, isEmpty && styles.btnDisabled]}
                  onPress={() => navigation?.navigate('Payment')}
                  disabled={isEmpty}
                >
                  <Text style={styles.paymentLabel}>Оплата</Text>
                  <Text style={styles.paymentAmount}>{formatAmount(total)} c</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ width: COL_GAP }} />
            <View style={styles.searchRightCol}>
              <ProductGrid
                items={items}
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
                  items={items}
                  currentOrder={currentOrder}
                  onCommentPress={() => setCommentVisible(true)}
                />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn} onPress={() => void handlePrecheck()} disabled={isEmpty}>
                  <Text style={styles.precheckText}>Пречек</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentBtn, isItemSelected && styles.paymentBtnSecondary, isEmpty && styles.btnDisabled]}
                  onPress={() => navigation?.navigate('Payment')}
                  disabled={isEmpty}
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
                  <OrderActionsMenu selectedAction={selectedOrderAction} onSelect={handleOrderActionSelect} currentOrder={currentOrder} />
                ) : isModifierSelected ? (
                  <ModifierActionsMenu />
                ) : isItemSelected ? (
                  <ItemActionsMenu items={items} />
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
                  selectedOrderAction === 'waiter' ? <WaiterPickerPanel onChangeWaiter={(id) => updateMeta({ employeeId: id })} /> :
                  selectedOrderAction === 'guests' ? <GuestCounterPanel guestCount={currentOrder?.guestCount ?? 1} onChangeGuestCount={(count) => updateMeta({ guestCount: count })} /> :
                  selectedOrderAction === 'delete' ? <DeleteOptions items={items} mode="order" orderNumber={currentOrder?.number} onDone={closeOrderActions} onDeleteOrder={deleteCurrentOrder} /> :
                  <ProductGrid items={items} products={products} categories={categories} onAddItem={handleAddProduct} />
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
                    items={items}
                    modifierGroups={modifierGroups}
                    onRemoveItem={removeItem}
                  />
                ) : (
                  <ProductGrid items={items} products={products} categories={categories} onAddItem={handleAddProduct} />
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
      <CommentModal visible={commentVisible} onClose={() => setCommentVisible(false)} comment={currentOrder?.comment} onSaveComment={(comment) => updateMeta({ comment })} />
      <NotificationModal visible={notificationVisible} onClose={() => setNotificationVisible(false)} />
    </SafeAreaView>
  );
};

const formatAmount = (n: number) => (n / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1, padding: 10 },
  mainRow: { flex: 1, flexDirection: 'row', marginTop: 10 },
  leftCol: { flex: 0.35, justifyContent: 'space-between' },
  colContent: { flex: 1 },
  midCol: { flex: 0.25, justifyContent: 'space-between' },
  rightCol: { flex: 0.4, justifyContent: 'space-between' },
  searchRightCol: { flex: 0.65 },
  takeoverCol: { flex: 1 },
  paymentRow: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  precheckBtn: { flex: 0.3, height: 56, borderRadius: 10, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center' },
  precheckText: { color: theme.colors.textSecondary, fontSize: 14, fontFamily: theme.fonts.medium },
  paymentBtn: { flex: 0.7, height: 56, borderRadius: 10, backgroundColor: theme.colors.accent, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  paymentBtnSecondary: { backgroundColor: theme.colors.surface },
  btnDisabled: { opacity: 0.4 },
  paymentLabel: { color: '#fff', fontSize: 14, fontFamily: theme.fonts.medium },
  paymentAmount: { color: '#fff', fontSize: 16, fontFamily: theme.fonts.bold },
  colFooterBtn: { height: 56, borderRadius: 10, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center' },
  colFooterBtnDanger: { backgroundColor: theme.colors.destructive },
  colFooterBtnActive: { backgroundColor: theme.colors.accent },
  colFooterBtnText: { color: theme.colors.textSecondary, fontSize: 14, fontFamily: theme.fonts.medium },
  colFooterBtnTextAccent: { color: theme.colors.accent, fontSize: 14, fontFamily: theme.fonts.medium },
  colFooterBtnTextActive: { color: '#fff', fontSize: 14, fontFamily: theme.fonts.medium },
  colFooterBtnTextDanger: { color: '#fff', fontSize: 14, fontFamily: theme.fonts.medium },
});
