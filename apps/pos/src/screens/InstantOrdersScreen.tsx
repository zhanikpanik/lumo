import React, { useEffect, useState, useMemo } from 'react';
import { Alert, View, StyleSheet, Text, TextInput, TouchableOpacity, SafeAreaView, StatusBar, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { SearchIcon, CrossIcon, ChevronUpIcon, ChevronDownIcon } from '../components/Icons';
import { NotificationBell } from '../components/NotificationBell';
import { NotificationModal } from '../components/NotificationModal';
import { OrderCard } from '../components/OrderCard';
import { FloorPlan } from '../components/FloorPlan';
import { BottomTabBar } from '../components/BottomTabBar';
import { SegmentedSwitcher } from '../components/SegmentedSwitcher';
import { FunctionsModal } from '../components/FunctionsModal';
import { SalesReportModal } from '../components/SalesReportModal';
import { useUserStore } from '../store/userStore';
import { useInstantShift } from '../store/useInstantShift';
import { usePosUiStore } from '../store/posUiStore';
import { useNotificationStore } from '../store/notificationStore';
import { useOrdersUiStore } from '../store/ordersUiStore';
import { useInstantOrders } from '../store/useInstantOrders';
import { useInstantVenue } from '../store/useInstantVenue';
import { createPosOrder } from '../data/posCommands';
import type { Order } from '../types';

const getCols = (width: number): number => {
  if (width < 1200) return 4;
  if (width < 1800) return 5;
  return 6;
};
const GAP = 10;
const PADDING = 10;

const getRows = (height: number): number => {
  if (height < 800) return 4;
  if (height < 1200) return 5;
  return 6;
};

function parseAmountSearchQuery(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/\d/.test(s)) return null;
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function orderItemsSearchHaystack(o: Order): string {
  const parts: string[] = [];
  for (const it of o.items) {
    parts.push(it.product.name);
    if (it.comment) parts.push(it.comment);
    for (const m of it.modifiers) {
      parts.push(m.name);
    }
  }
  return parts.join(' ').toLowerCase();
}

function InstantOrdersScreenImpl({ navigation }: { navigation: any }) {
  const [activeTab, setActiveTab] = useState<'orders' | 'tables'>('orders');
  const [page, setPage] = useState(0);

  const currentUser = useUserStore((s) => s.currentUser);
  const logout = useUserStore((s) => s.logout);
  const { openShift } = useInstantShift(currentUser?.id);
  const { orders, isLoading } = useInstantOrders(openShift?.id);
  const { venueType, zones: venueZones } = useInstantVenue();


  const [menuVisible, setMenuVisible] = useState(false);
  const [zoneIdx, setZoneIdx] = useState(0);
  const statusFilter = useOrdersUiStore((s) => s.statusFilter);
  const setStatusFilter = useOrdersUiStore((s) => s.setStatusFilter);
  const [reportVisible, setReportVisible] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const sortMode = useOrdersUiStore((s) => s.sortMode);
  const setSortMode = useOrdersUiStore((s) => s.setSortMode);
  const [orderCounter, setOrderCounter] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const isTakeaway = venueType === 'takeaway';
  const isOrders = isTakeaway || activeTab === 'orders';
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [waiterFilter, setWaiterFilter] = useState(false);

  useEffect(() => {
    if (isTakeaway) setActiveTab('orders');
  }, [isTakeaway]);

  const { height, width } = useWindowDimensions();
  const ROWS = getRows(height);
  const COLUMNS = getCols(width);
  const CELLS_PER_PAGE = COLUMNS * ROWS;
  const ORDER_SLOTS = CELLS_PER_PAGE - 1;
  const rightGroupWidth = Math.round((width - 2 * PADDING) * (width < 1100 ? 0.32 : 0.40));
  const gridHeight = height - 44 - GAP - 56 - PADDING * 2;
  const cardHeight = (gridHeight - GAP * (ROWS - 1)) / ROWS;
  const scale = Math.max(0.8, Math.min(1.5, cardHeight / 120));

  const statusFiltered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);
  const waiterFiltered = waiterFilter && currentUser
    ? statusFiltered.filter(o => o.waiter === currentUser.name)
    : statusFiltered;

  const filteredOrders = searchQuery.trim()
    ? waiterFiltered.filter((o) => {
        const raw = searchQuery.trim();
        const q = raw.toLowerCase();
        const amount = parseAmountSearchQuery(raw);
        const itemsHay = orderItemsSearchHaystack(o);
        return (
          o.number.toLowerCase().includes(q) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          o.waiter.toLowerCase().includes(q) ||
          (o.zone && o.zone.toLowerCase().includes(q)) ||
          (o.comment && o.comment.toLowerCase().includes(q)) ||
          itemsHay.includes(q) ||
          (amount !== null && Math.abs(o.totalAmount - amount) < 0.005)
        );
      })
    : waiterFiltered;

  const STATUS_LABELS: Record<string, string> = {
    all: 'Все заказы',
    active: 'Открытые',
    paid: 'Закрытые',
  };

  const SORT_LABELS: Record<string, string> = {
    time: 'По времени',
    table: 'По столам',
  };

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortMode === 'table') return (a.tableNumber || '').localeCompare(b.tableNumber || '', undefined, { numeric: true });
    return 0;
  });

  const totalItems = sortedOrders.length;
  const needsPagination = totalItems > ORDER_SLOTS;
  const slotsThisView = needsPagination ? ORDER_SLOTS - 1 : ORDER_SLOTS;
  const totalPages = needsPagination ? Math.ceil(totalItems / slotsThisView) : 1;
  const pageItems = sortedOrders.slice(page * slotsThisView, page * slotsThisView + slotsThisView);

  // Derive next order number from reactive InstantDB orders
  const nextOrderNumber = useMemo(() => {
    const nums = orders.map(o => parseFloat(o.number)).filter(n => !isNaN(n));
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return String(Math.floor(maxNum) + 1);
  }, [orders]);

  // Open an order for editing — sets local UI state so PosScreen can render
  const openInstantOrder = (order: Order) => {
    usePosUiStore.getState().setCurrentOrderId(order.id);
    usePosUiStore.getState().setCreatingOrder(false);
    usePosUiStore.getState().selectItem(null);
    usePosUiStore.getState().setActiveAction(null);
  };

  const handleQuickCheck = async () => {
    if (!openShift) return;
    if (!currentUser) { console.warn('handleQuickCheck: no currentUser'); return; }
    const operationId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    usePosUiStore.getState().setCurrentOrderId(null);
    usePosUiStore.getState().setCreatingOrder(true);
    navigation.navigate('Pos');
    try {
      const { orderId } = await createPosOrder({
        operationId,
        actorEmployeeId: currentUser.id,
        shiftId: openShift.id,
        guestCount: 1,
        orderType: 'Общий',
        isQuickCheck: true,
        orderNumber: nextOrderNumber,
      });
      usePosUiStore.getState().setCurrentOrderId(orderId);
      usePosUiStore.getState().selectItem(null);
      usePosUiStore.getState().setActiveAction(null);
    } catch (e: unknown) {
      usePosUiStore.getState().setCreatingOrder(false);
      navigation.navigate('Orders');
      Alert.alert('Не удалось создать заказ', e instanceof Error ? e.message : 'Повторите попытку');
    }
  };

  const handleNewOrder = () => {
    navigation.navigate('TablePicker', { mode: 'new' });
  };

  const handleSelectOrder = (orderId: string) => {
    useNotificationStore.getState().markSeen(orderId);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      openInstantOrder(order);
      navigation.navigate(order.status === 'paid' ? 'PaidCheck' : 'Pos');
    }
  };

  const handleTablePress = async (table: any, existingOrder?: Order) => {
    if (existingOrder) {
      openInstantOrder(existingOrder);
      navigation.navigate(existingOrder.status === 'paid' ? 'PaidCheck' : 'Pos');
      return;
    }
    if (!openShift) return;
    if (!currentUser) { console.warn('handleTablePress: no currentUser'); return; }

    const operationId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    usePosUiStore.getState().setCurrentOrderId(null);
    usePosUiStore.getState().setCreatingOrder(true);
    navigation.navigate('Pos');
    try {
      const { orderId } = await createPosOrder({
        operationId,
        actorEmployeeId: currentUser.id,
        shiftId: openShift.id,
        tableId: table.id,
        guestCount: 1,
        orderType: 'Общий',
        isQuickCheck: false,
        orderNumber: nextOrderNumber,
      });
      usePosUiStore.getState().setCurrentOrderId(orderId);
      usePosUiStore.getState().selectItem(null);
      usePosUiStore.getState().setActiveAction(null);
    } catch (e: unknown) {
      usePosUiStore.getState().setCreatingOrder(false);
      navigation.navigate('Orders');
      Alert.alert('Не удалось создать заказ', e instanceof Error ? e.message : 'Повторите попытку');
    }
  };

  const handlePageUp = () => setPage((p) => Math.max(0, p - 1));
  const handlePageDown = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  type Cell =
    | { kind: 'actions' }
    | { kind: 'order'; data: Order }
    | { kind: 'pagination' }
    | { kind: 'empty' };

  const cells: Cell[] = [{ kind: 'actions' }];
  pageItems.forEach((item) => cells.push({ kind: 'order', data: item }));
  while (cells.length < CELLS_PER_PAGE) cells.push({ kind: 'empty' });
  if (needsPagination) cells[CELLS_PER_PAGE - 1] = { kind: 'pagination' };

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLUMNS, r * COLUMNS + COLUMNS));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>
        {/* HEADER */}
        <View style={[styles.headerRow, { marginHorizontal: PADDING }]}>
          {isOrders && (
            <SegmentedSwitcher
              options={[
                { value: 'all', label: STATUS_LABELS.all },
                { value: 'active', label: STATUS_LABELS.active },
                { value: 'paid', label: STATUS_LABELS.paid },
              ]}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(0); }}
            />
          )}

          {isOrders && currentUser && (
            <SegmentedSwitcher
              style={{ marginLeft: GAP }}
              options={[
                { value: 'false', label: 'Все' },
                { value: 'true', label: 'Мои' },
              ]}
              value={String(waiterFilter)}
              onChange={(v) => { setWaiterFilter(v === 'true'); setPage(0); }}
            />
          )}

          {isOrders && !isTakeaway && (
            <SegmentedSwitcher
              style={{ marginLeft: GAP }}
              options={[
                { value: 'time', label: SORT_LABELS.time },
                { value: 'table', label: SORT_LABELS.table },
              ]}
              value={sortMode}
              onChange={setSortMode}
            />
          )}

          <View style={{ flex: 1 }} />

          {searchActive ? (
            <View style={[styles.searchInputWrap, { width: rightGroupWidth }]}>
              <SearchIcon size={22} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Номер, стол, официант, блюдо, сумма…"
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={(text) => { setSearchQuery(text); setPage(0); }}
                autoFocus
              />
              <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); setPage(0); }} style={styles.searchCloseBtn}>
                <CrossIcon size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.rightGroup, { width: rightGroupWidth }]}>
              {currentUser ? (
                <View style={styles.userChip}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.chipText} numberOfLines={1}>{currentUser.name}</Text>
                </View>
              ) : (
                <View style={styles.iconBtn} />
              )}
              <TouchableOpacity style={styles.iconBtn} onPress={() => setNotificationVisible(true)}>
                <NotificationBell size={28} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => { setSearchActive(true); }}>
                <SearchIcon size={28} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* CONTENT */}
        {isOrders ? (
          <View style={[styles.gridArea, { marginHorizontal: PADDING }]}>
            {isLoading && orders.length === 0 && (
              <View style={[styles.emptyOverlay, { pointerEvents: 'none' }]}>
                <Text style={styles.emptyOrdersText}>Загрузка…</Text>
              </View>
            )}
            {rows.map((row, rowIdx) => (
              <View
                key={rowIdx}
                style={[styles.gridRow, rowIdx < ROWS - 1 ? { marginBottom: GAP } : undefined]}
              >
                {row.map((cell, colIdx) => (
                  <View
                    key={colIdx}
                    style={[styles.cellWrap, colIdx < COLUMNS - 1 ? { marginRight: GAP } : undefined]}
                  >
                    {cell.kind === 'actions' && (
                      <View style={styles.actionCell}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleNewOrder}>
                          <Feather name="plus" size={24} color={theme.colors.white} />
                          <Text style={styles.actionLabel}>Новый заказ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleQuickCheck}>
                          <Feather name="plus" size={24} color={theme.colors.white} />
                          <Text style={styles.actionLabel}>Быстрый чек</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {cell.kind === 'order' && (
                      <OrderCard order={cell.data} onPress={() => handleSelectOrder(cell.data.id)} scale={scale} />
                    )}

                    {cell.kind === 'pagination' && (
                      <View style={styles.paginationCell}>
                        <TouchableOpacity
                          style={[styles.pageHalf, page === 0 && styles.pageDisabled]}
                          onPress={handlePageUp}
                          disabled={page === 0}
                        >
                          <ChevronUpIcon size={28} color={page === 0 ? theme.colors.textSecondary : theme.colors.tabActive} />
                        </TouchableOpacity>
                        <View style={styles.pageDivider} />
                        <TouchableOpacity
                          style={[styles.pageHalf, page >= totalPages - 1 && styles.pageDisabled]}
                          onPress={handlePageDown}
                          disabled={page >= totalPages - 1}
                        >
                          <ChevronDownIcon size={28} color={page >= totalPages - 1 ? theme.colors.textSecondary : theme.colors.tabActive} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
            {sortedOrders.length === 0 && !isLoading && (
              <View style={[styles.emptyOverlay, { pointerEvents: 'none' }]}>
                <Feather name="inbox" size={48} color={theme.colors.textDisabled} />
                <Text style={styles.emptyOrdersText}>Нет заказов</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.floorPlanArea, { marginHorizontal: PADDING }]}>
            <FloorPlan onTablePress={handleTablePress} zoneIdx={zoneIdx} zones={venueZones} orders={orders} />
          </View>
        )}

        <BottomTabBar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (isTakeaway && tab === 'tables') return;
            setActiveTab(tab);
          }}
          onMenuPress={() => setTimeout(() => setMenuVisible(true), 0)}
          onLockPress={() => navigation.navigate('Lock', { mode: 'lock' })}
          showTablesTab={!isTakeaway}
          scale={scale}
        />

        <FunctionsModal
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          role={currentUser?.role ?? null}
          onOpenShift={() => setReportVisible(true)}
          onOpenChecksArchive={() => navigation.navigate('PaidCheck')}
          onOpenCash={() => navigation.navigate('Cash')}
          onCloseShift={() => navigation.navigate('CloseShift')}
          onLogout={() => {
            logout();
            navigation.replace('Lock');
          }}
        />
        <SalesReportModal visible={reportVisible} onClose={() => setReportVisible(false)} orders={orders} />
        <NotificationModal visible={notificationVisible} onClose={() => setNotificationVisible(false)} />
      </View>
    </SafeAreaView>
  );
}

const formatAmount = (n: number) => Number(n / 100).toLocaleString('ru-RU');

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
  },
  root: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
  },
  headerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: PADDING,
    zIndex: 1000,
  },
  rightGroup: {
    flexDirection: 'row',
    gap: GAP,
  },
  iconBtn: {
    flex: 1,
    height: 56,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userChip: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.online,
  },
  chipText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    maxWidth: 120,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 12,
    gap: 8,
    height: 56,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  searchCloseBtn: {
    padding: 4,
  },
  gridArea: {
    flex: 1,
    marginTop: GAP,
    marginBottom: GAP,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  cellWrap: {
    flex: 1,
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
  },
  actionCell: {
    flex: 1,
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: GAP,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.borderRadius,
  },
  actionLabel: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  paginationCell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
  },
  pageHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageDisabled: {
    opacity: 0.4,
  },
  pageDivider: {
    width: 1,
    backgroundColor: theme.colors.pageDivider,
  },
  floorPlanArea: {
    flex: 1,
    marginTop: GAP,
    marginBottom: GAP,
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyOrdersText: {
    color: theme.colors.textDisabled,
    fontSize: 18,
    fontFamily: theme.fonts.medium,
  },
});

/**
 * InstantDB-powered OrdersScreen. Reads via reactive queries,
 * writes via @lumo/data typed commands — no Supabase outbox.
 */
export function InstantOrdersScreen({ navigation }: { navigation: any }) {
  return <InstantOrdersScreenImpl navigation={navigation} />;
}
