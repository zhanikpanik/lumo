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
  const isEmpty = items.length === 0;
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
        {isLocked ? (
          <View style={styles.mainRow}>
            <View style={styles.takeoverCol}>
              <TakeoverLock
                onTakeover={(waiterName) => {
                  updateOrderMeta({ waiter: waiterName });
                }}
              />
            </View>
          </View>
        ) : searchMode ? (
          <View style={styles.mainRow}>
            <View style={styles.searchRightCol}>
              <SearchMode
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
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
                  style={[
                    styles.paymentBtn,
                    isItemSelected && styles.paymentBtnSecondary,
                    isEmpty && styles.btnDisabled,
                  ]}
                  onPress={() => navigation?.navigate('Payment')}
                  disabled={isEmpty}
                >
                  <Text style={styles.paymentLabel}>Оплата</Text>
                  <Text style={styles.paymentAmount}>{formatAmount(total)} ₽</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ width: COL_GAP }} />

            {/* ── Middle: Menu + Discount/Cancel ── */}
            <View style={styles.midCol}>
              <View style={styles.colContent}>
                {isItemSelected ? <ItemActionsMenu /> : <CategoryMenu />}
              </View>
              <TouchableOpacity
                style={[styles.colFooterBtn, isItemSelected && styles.colFooterBtnDanger]}
                onPress={() => {
                  if (isItemSelected) {
                    useOrderStore.getState().selectItem(null);
                  }
                }}
              >
                <Text style={[styles.colFooterBtnText, isItemSelected && styles.colFooterBtnTextDanger]}>
                  {isItemSelected ? 'Отмена' : 'Скидки'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ width: COL_GAP }} />

            {/* ── Right: Products + Save/Done ── */}
            <View style={styles.rightCol}>
              <View style={styles.colContent}>
                {isItemSelected ? <ModifierGrid /> : <ProductGrid />}
              </View>
              <TouchableOpacity
                style={[
                  styles.colFooterBtn,
                  isItemSelected && styles.colFooterBtnActive,
                  isEmpty && styles.btnDisabled,
                ]}
                onPress={() => {
                  if (isItemSelected) {
                    useOrderStore.getState().selectItem(null);
                  } else if (!isEmpty) {
                    closeOrder();
                    navigation?.navigate('Orders');
                  }
                }}
                disabled={isEmpty && !isItemSelected}
              >
                <Text
                  style={[
                    !isItemSelected && !isEmpty && styles.colFooterBtnTextAccent,
                    isItemSelected && styles.colFooterBtnTextActive,
                    isEmpty && styles.colFooterBtnText,
                  ]}
                >
                  {isItemSelected ? 'Готово' : 'Сохранить заказ'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
    flexDirection: 'column',
  },
  midCol: {
    flex: 0.25,
    flexDirection: 'column',
  },
  rightCol: {
    flex: 0.40,
    flexDirection: 'column',
  },
  colContent: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: theme.borderRadius,
  },
  colFooterBtn: {
    height: 48,
    marginTop: GAP,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colFooterBtnActive: {
    backgroundColor: '#00C853',
  },
  colFooterBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  colFooterBtnTextAccent: {
    color: '#00E676',
    fontSize: 14,
    fontWeight: '600',
  },
  colFooterBtnTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  colFooterBtnDanger: {
    backgroundColor: '#D32F2F',
  },
  colFooterBtnTextDanger: {
    color: '#fff',
    fontWeight: '700',
  },

  paymentRow: {
    height: 48,
    flexDirection: 'row',
    gap: GAP,
    marginTop: GAP,
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
  paymentBtnSecondary: {
    backgroundColor: theme.colors.surfaceLight,
  },
  btnDisabled: {
    opacity: 0.4,
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
