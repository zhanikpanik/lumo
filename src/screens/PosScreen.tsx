import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { theme } from '../theme/colors';
import { PosHeader } from '../components/PosHeader';
import { OrderPanel } from '../components/OrderPanel';
import { CategoryMenu } from '../components/CategoryMenu';
import { ProductGrid } from '../components/ProductGrid';
import { ItemActionsMenu } from '../components/ItemActionsMenu';
import { ModifierGrid } from '../components/ModifierGrid';
import { SearchMode } from '../components/SearchMode';
import { TakeoverLock } from '../components/TakeoverLock';
import { useOrderStore } from '../store/orderStore';
import { useShiftStore } from '../store/shiftStore';
import { useVenueStore } from '../store/venueStore';
import { CommentModal } from '../components/CommentModal';

const GAP = 8;
const COL_GAP = 8;
const PADDING = 8;

export const PosScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { selectedItemId, items, getTotal, closeOrder, deleteOrder, tableNumber, currentOrderId, updateOrderMeta } = useOrderStore();
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const selectedItem = items.find(i => i.id === selectedItemId);
  const isItemSelected = !!selectedItem;
  const total = getTotal();
  const currentUser = useShiftStore((s) => s.currentUser);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentVisible, setCommentVisible] = useState(false);
  const isTakeaway = useVenueStore((s) => s.venueType === 'takeaway');

  // Lock: waiter viewing someone else's order
  const isLocked = useMemo(() => {
    if (!currentUser || !currentOrder) return false;
    if (currentUser.role !== 'waiter') return false;
    if (isTakeaway) return false;
    return currentOrder.waiter !== currentUser.name;
  }, [currentUser, currentOrder, isTakeaway]);

  const handleBack = () => {
    const comment = currentOrder?.comment || '';
    const isEmpty = items.length === 0 && !tableNumber && !comment;
    if (isEmpty && currentOrderId) {
      deleteOrder(currentOrderId);
    } else {
      closeOrder();
    }
    navigation?.navigate('Orders');
  };

  const handleSearchOpen = () => {
    setSearchMode(true);
    setSearchQuery('');
  };

  const handleSearchClose = () => {
    setSearchMode(false);
    setSearchQuery('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        {/* ═══ HEADER ═══ */}
        <PosHeader
          onBack={handleBack}
          searchMode={searchMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchOpen={handleSearchOpen}
          onSearchClose={handleSearchClose}
          tableNumber={tableNumber}
          isTakeaway={isTakeaway}
          onTablePress={() => {
            if (isTakeaway) return;
            navigation?.navigate('TablePicker');
          }}
        />

        {/* ═══ MAIN CONTENT ═══ */}
        <View style={styles.mainRow}>
          {/* ── Left: Order Panel + Payment buttons ── */}
          <View style={styles.leftCol}>
            <View style={styles.orderPanelWrap}>
              <OrderPanel onCommentPress={() => setCommentVisible(true)} />
            </View>
            {!isLocked && (
              <View style={styles.paymentRow}>
                <TouchableOpacity style={styles.precheckBtn}>
                  <Text style={styles.precheckText}>Пречек</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.paymentBtn} onPress={() => navigation?.navigate('Payment')}>
                  <Text style={styles.paymentLabel}>Оплата</Text>
                  <Text style={styles.paymentAmount}>{formatAmount(total)} ₽</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ width: COL_GAP }} />

          {isLocked ? (
            <View style={styles.takeoverCol}>
              <TakeoverLock
                onTakeover={(waiterName) => {
                  updateOrderMeta({ waiter: waiterName });
                }}
              />
            </View>
          ) : searchMode ? (
            <View style={styles.searchRightCol}>
              <SearchMode
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </View>
          ) : (
            <>
              {/* ── Middle: Categories or Actions ── */}
              <View style={styles.midCol}>
                {isItemSelected ? <ItemActionsMenu /> : <CategoryMenu />}
              </View>

              <View style={{ width: COL_GAP }} />

              {/* ── Right: Products or Modifiers ── */}
              <View style={styles.rightCol}>
                {isItemSelected ? <ModifierGrid /> : <ProductGrid />}
              </View>
            </>
          )}
        </View>
      </View>

      <CommentModal
        visible={commentVisible}
        onClose={() => setCommentVisible(false)}
      />
    </SafeAreaView>
  );
};

const formatAmount = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: '#1A1A1A' },
  root: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: '#1A1A1A' },

  mainRow: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    flexDirection: 'row',
    paddingHorizontal: PADDING,
    paddingBottom: COL_GAP,
  },
  leftCol: {
    flex: 0.35,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: theme.borderRadius,
    flexDirection: 'column',
  },
  orderPanelWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  paymentRow: {
    height: 56,
    flexDirection: 'row',
    gap: GAP,
    marginTop: GAP,
  },
  midCol: {
    flex: 0.25,
    overflow: 'hidden',
    borderRadius: theme.borderRadius,
  },
  rightCol: {
    flex: 0.40,
    overflow: 'hidden',
    borderRadius: theme.borderRadius,
  },
  searchRightCol: {
    flex: 0.65,
  },
  takeoverCol: {
    flex: 0.65,
    overflow: 'hidden',
    borderRadius: theme.borderRadius,
  },

  paymentBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#00C853',
    borderRadius: theme.borderRadius,
    paddingHorizontal: 12,
  },
  paymentLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentAmount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  precheckBtn: {
    flex: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
  },
  precheckText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

});
