import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, SafeAreaView, StatusBar, useWindowDimensions } from 'react-native';
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
import { useShiftStore } from '../store/shiftStore';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore, VenueTable } from '../store/venueStore';
import { useNotificationStore } from '../store/notificationStore';
import { useOrdersUiStore } from '../store/ordersUiStore';
import { INSTANT_AUTH_ENABLED } from '../data/instant';
import { Order } from '../types';

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

/** Digits / spaces / comma as decimal separator → number for matching `totalAmount`. */
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

export const SupabaseOrdersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'tables'>('orders');
  const [page, setPage] = useState(0);
  const orders = useOrderStore((s) => s.orders);
  const createOrderForTable = useOrderStore((s) => s.createOrderForTable);
  const createQuickCheck = useOrderStore((s) => s.createQuickCheck);
  const openOrder = useOrderStore((s) => s.openOrder);
  const [menuVisible, setMenuVisible] = useState(false);
  const [zoneIdx, setZoneIdx] = useState(0);
  const statusFilter = useOrdersUiStore((s) => s.statusFilter);
  const setStatusFilter = useOrdersUiStore((s) => s.setStatusFilter);
  const [reportVisible, setReportVisible] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const sortMode = useOrdersUiStore((s) => s.sortMode);
  const setSortMode = useOrdersUiStore((s) => s.setSortMode);
  const logout = useShiftStore((s) => s.logout);
  const currentUser = useShiftStore((s) => s.currentUser);
  const [searchQuery, setSearchQuery] = useState('');
  const venueType = useVenueStore((s) => s.venueType);
  const isTakeaway = venueType === 'takeaway';
  const isOrders = isTakeaway || activeTab === 'orders';
  const [notificationVisible, setNotificationVisible] = useState(false);

  // Realtime notification subscription
  useEffect(() => {
    const unsub = useNotificationStore.getState().subscribe();
    return unsub;
  }, []);
  const venueZones = useVenueStore((s) => s.zones);
  const [waiterFilter, setWaiterFilter] = useState(false);

  useEffect(() => {
    // Takeaway has no tables tab — keep the user on the orders grid.
    // We deliberately do NOT touch statusFilter/sortMode here: they live in
    // the persisted ordersUiStore and must survive navigation back from an
    // order. Restricted options for takeaway are enforced at the switcher
    // level (sortMode 'table' is simply not offered).
    if (isTakeaway) setActiveTab('orders');
  }, [isTakeaway]);

  // Data is fetched once at App level — no need to re-fetch on mount

  // ── Dynamic rows based on screen height ──
  const { height, width } = useWindowDimensions();
  const ROWS = getRows(height);
  const COLUMNS = getCols(width);
  const CELLS_PER_PAGE = COLUMNS * ROWS;
  const ORDER_SLOTS = CELLS_PER_PAGE - 1; // cell 0 = action buttons
  const rightGroupWidth = Math.round((width - 2 * PADDING) * 0.40); // same proportion as PosScreen

  // ── Scale factor for card text ──
  // Available grid height = screen - header(44+GAP) - tabbar(~56) - padding
  const gridHeight = height - 44 - GAP - 56 - PADDING * 2;
  const cardHeight = (gridHeight - GAP * (ROWS - 1)) / ROWS;
  const scale = Math.max(0.8, Math.min(1.5, cardHeight / 120));

  // ── Filter orders by status ──
  const statusFiltered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  // ── Filter orders by waiter ──
  const waiterFiltered = waiterFilter && currentUser
    ? statusFiltered.filter(o => o.waiter === currentUser.name)
    : statusFiltered;

  // ── Filter orders by search ──
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

  // ── Sort ──
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortMode === 'table') return (a.tableNumber || '').localeCompare(b.tableNumber || '', undefined, { numeric: true });
    return 0; // 'time' — already sorted by DB query
  });

  // ── Pagination (orders only) ──
  const totalItems = sortedOrders.length;
  const needsPagination = totalItems > ORDER_SLOTS;
  const slotsThisView = needsPagination ? ORDER_SLOTS - 1 : ORDER_SLOTS;
  const totalPages = needsPagination ? Math.ceil(totalItems / slotsThisView) : 1;
  const pageItems = sortedOrders.slice(page * slotsThisView, page * slotsThisView + slotsThisView);


  const handleQuickCheck = () => {
    createQuickCheck();
    navigation.navigate('Pos');
  };

  const handleNewOrder = () => {
    navigation.navigate('TablePicker', { mode: 'new' });
  };

  const handleSelectOrder = (orderId: string) => {
    useNotificationStore.getState().markSeen(orderId);
    openOrder(orderId);
    const order = useOrderStore.getState().orders.find(o => o.id === orderId);
    navigation.navigate(order?.status === 'paid' ? 'PaidCheck' : 'Pos');
  };

  // ── Table tap ──
  const handleTablePress = (table: VenueTable, existingOrder?: Order) => {
    if (existingOrder) {
      openOrder(existingOrder.id);
      navigation.navigate(existingOrder.status === 'paid' ? 'PaidCheck' : 'Pos');
    } else {
      createOrderForTable(table.id, table.number, table.zone);
      navigation.navigate('Pos');
    }
  };

  const handlePageUp = () => setPage((p) => Math.max(0, p - 1));
  const handlePageDown = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  // ── Build flat cell list for orders grid ──
  type Cell =
    | { kind: 'actions' }
    | { kind: 'order'; data: Order }
    | { kind: 'pagination' }
    | { kind: 'empty' };

  const cells: Cell[] = [{ kind: 'actions' }];
  pageItems.forEach((item) => cells.push({ kind: 'order', data: item }));
  while (cells.length < CELLS_PER_PAGE) cells.push({ kind: 'empty' });
  // Always place pagination at the last cell (bottom-right)
  if (needsPagination) cells[CELLS_PER_PAGE - 1] = { kind: 'pagination' };

  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.slice(r * COLUMNS, r * COLUMNS + COLUMNS));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.root}>

        {/* ═══ HEADER ROW ═══ */}
        <View style={[styles.headerRow, { marginHorizontal: PADDING }]}>
          {/* Filters — visible in orders mode, hidden in table view */}
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

          {/* Right: search input or user/notification/search chips */}
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

        {/* ═══ CONTENT ═══ */}
        {isOrders ? (
          /* Orders grid — always rendered so action buttons stay in place */
          <View style={[styles.gridArea, { marginHorizontal: PADDING }]}>
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
                          <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
                          <Text style={styles.actionLabel}>Новый заказ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleQuickCheck}>
                          <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
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
                          <ChevronUpIcon size={28} color={page === 0 ? '#999' : theme.colors.tabActive} />
                        </TouchableOpacity>
                        <View style={styles.pageDivider} />
                        <TouchableOpacity
                          style={[styles.pageHalf, page >= totalPages - 1 && styles.pageDisabled]}
                          onPress={handlePageDown}
                          disabled={page >= totalPages - 1}
                        >
                          <ChevronDownIcon size={28} color={page >= totalPages - 1 ? '#999' : theme.colors.tabActive} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
            {sortedOrders.length === 0 && (
              <View style={[styles.emptyOverlay, { pointerEvents: 'none' }]}>
                <Text style={{ fontSize: 48, color: theme.colors.textDisabled }}>📭</Text>
                <Text style={styles.emptyOrdersText}>Нет заказов</Text>
              </View>
            )}
          </View>
        ) : (
          /* Floor plan */
          <View style={[styles.floorPlanArea, { marginHorizontal: PADDING }]}>
            <FloorPlan onTablePress={handleTablePress} zoneIdx={zoneIdx} zones={venueZones} orders={orders} />
          </View>
        )}

        {/* ═══ BOTTOM TAB BAR ═══ */}
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (isTakeaway && tab === 'tables') return;
            setActiveTab(tab);
          }}
          onMenuPress={() => setMenuVisible(true)}
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
};

const formatAmount = (n: number) => Number(n / 100).toLocaleString('ru-RU');

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },
  root: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: theme.colors.background },

  headerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: PADDING,
    zIndex: 1000,
  },

  // Right group: user chip + notification + search (matching PosHeader)
  rightGroup: {
    flexDirection: 'row',
    gap: GAP,
  },
  iconBtn: { flex: 1, height: 56, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  userChip: { flex: 1, height: 56, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.online },
  chipText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular, maxWidth: 120 },

  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 12,
    gap: 8,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  searchCloseBtn: { padding: 4 },

  gridArea: { flex: 1, marginTop: GAP, marginBottom: GAP },
  gridRow: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1, borderRadius: theme.borderRadius, overflow: 'hidden' },

  floorPlanArea: {
    flex: 1,
    marginTop: GAP,
    marginBottom: GAP,
  },

  actionFull: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    margin: 0,
  },
  actionCell: {
    flex: 1,
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.borderRadius,
  },
  actionLabel: { color: theme.colors.white, fontSize: 16, fontFamily: theme.fonts.medium, textAlign: 'center' },

  paginationCell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
  },
  pageHalf: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageDisabled: { opacity: 0.4 },
  pageDivider: { width: 1, backgroundColor: theme.colors.pageDivider },
  emptyOrders: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyOrdersText: { color: theme.colors.textDisabled, fontSize: 18, fontFamily: theme.fonts.medium },
});
export const OrdersScreen: React.FC<{ navigation: any }> = INSTANT_AUTH_ENABLED
  ? require('./InstantOrdersScreen').InstantOrdersScreen
  : SupabaseOrdersScreen;
