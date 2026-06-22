import React, { useState, useMemo, useEffect } from 'react';
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
import { useOrderStore } from '../store/orderStore';
import { useShiftStore } from '../store/shiftStore';
import { useVenueStore } from '../store/venueStore';
import { CommentModal } from '../components/CommentModal';
import { NotificationModal } from '../components/NotificationModal';
import { OrderActionType } from '../types';
import { useNotificationStore } from '../store/notificationStore';

const GAP = 10;
const COL_GAP = 10;
const PADDING = 10;

export const PosScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { selectedItemId, selectedModifierId, modifierAction, items, getTotal, closeOrder, deleteOrder, tableNumber, currentOrderId, updateOrderMeta, commitDraft, cancelDraft, draftItem, setModifierQuantity } = useOrderStore();
  const isModifierSelected = !!selectedModifierId;
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const selectedItem = items.find(i => i.id === selectedItemId);
  const isItemSelected = !!selectedItem;
  const isEmpty = items.length === 0;
  const total = getTotal();
  const currentUser = useShiftStore((s) => s.currentUser);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentVisible, setCommentVisible] = useState(false);
  const [orderActionsMode, setOrderActionsMode] = useState(false);
  const [selectedOrderAction, setSelectedOrderAction] = useState<OrderActionType>(null);
  const isTakeaway = useVenueStore((s) => s.venueType === 'takeaway');
  const [notificationVisible, setNotificationVisible] = useState(false);

  // Realtime notification subscription
  useEffect(() => {
    const unsub = useNotificationStore.getState().subscribe();
    return unsub;
  }, []);

  const isLocked = useMemo(() => {
    if (!currentUser || !currentOrder) return false;
    if (currentUser.role !== 'waiter') return false;
    if (isTakeaway) return false;
    return currentOrder.waiter !== currentUser.name;
  }, [currentUser, currentOrder, isTakeaway]);

  const handleBack = () => {
    const comment = currentOrder?.comment || '';
    const empty = items.length === 0 && !tableNumber && !comment;
    if (empty && currentOrderId) {
      deleteOrder(currentOrderId);
    } else {
      closeOrder();
    }
    navigation?.navigate('Orders');
  };

  const handleSearchOpen = () => { setSearchMode(true); setSearchQuery(''); };
  const handleSearchClose = () => { setSearchMode(false); setSearchQuery(''); };

  const handleOrderActionsToggle = () => {
    if (orderActionsMode) {
      setOrderActionsMode(false);
      setSelectedOrderAction(null);
    } else {
      useOrderStore.getState().cancelDraft();
      setOrderActionsMode(true);
      setSelectedOrderAction(null);
    }
  };

  const handleOrderActionSelect = (action: OrderActionType) => {
    if (action === 'transfer') {
      if (!isTakeaway) navigation?.navigate('TablePicker');
      setOrderActionsMode(false);
      setSelectedOrderAction(null);
    } else {
      setSelectedOrderAction(action);
    }
  };

  const closeOrderActions = () => {
    setOrderActionsMode(false);
    setSelectedOrderAction(null);
  };

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
        />

        {isLocked ? (
          <View style={styles.mainRow}>
            <View style={styles.takeoverCol}>
              <TakeoverLock onTakeover={(waiterName) => { updateOrderMeta({ waiter: waiterName }); }} />
            </View>
          </View>
        ) : searchMode ? (
          <View style={styles.mainRow}>
            <View style={styles.leftCol}>
              <View style={styles.colContent}>
                <OrderPanel onCommentPress={() => setCommentVisible(true)} />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn}>
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
              <ProductGrid searchQuery={searchQuery} />
            </View>
          </View>
        ) : (
          <View style={styles.mainRow}>
            {/* ── Left: Order + Payment ── */}
            <View style={styles.leftCol}>
              <View style={styles.colContent}>
                <OrderPanel onCommentPress={() => setCommentVisible(true)} />
              </View>
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn}>
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
                  <OrderActionsMenu selectedAction={selectedOrderAction} onSelect={handleOrderActionSelect} />
                ) : isModifierSelected ? (
                  <ModifierActionsMenu />
                ) : isItemSelected ? (
                  <ItemActionsMenu />
                ) : (
                  <CategoryMenu />
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
                  selectedOrderAction === 'waiter' ? <WaiterPickerPanel /> :
                  selectedOrderAction === 'guests' ? <GuestCounterPanel /> :
                  selectedOrderAction === 'delete' ? <DeleteOptions mode="order" onDone={closeOrderActions} /> :
                  <ProductGrid />
                ) : isModifierSelected && modifierAction === 'delete' ? (
                  <DeleteOptions onDone={() => useOrderStore.getState().selectModifier(null)} />
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
                  <ModifierGrid />
                ) : (
                  <ProductGrid />
                )}
              </View>
              <TouchableOpacity
                style={[styles.colFooterBtn, (isItemSelected || isModifierSelected) && styles.colFooterBtnActive, isEmpty && !isItemSelected && !isModifierSelected && styles.btnDisabled]}
                onPress={() => {
                  if (isItemSelected || isModifierSelected) {
                    commitDraft();
                  } else if (!isEmpty) {
                    closeOrder();
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
      <CommentModal visible={commentVisible} onClose={() => setCommentVisible(false)} />
      <NotificationModal visible={notificationVisible} onClose={() => setNotificationVisible(false)} />
    </SafeAreaView>
  );
};

const formatAmount = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
  root: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
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
