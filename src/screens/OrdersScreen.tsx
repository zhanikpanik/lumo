import React, { useEffect, useState } from 'react';
import { Alert, View, StyleSheet, Text, TextInput, TouchableOpacity, SafeAreaView, StatusBar, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { SearchIcon, NotificationIcon } from '../components/Icons';
import { OrderCard } from '../components/OrderCard';
import { FloorPlan } from '../components/FloorPlan';
import { BottomTabBar } from '../components/BottomTabBar';
import { SegmentedSwitcher } from '../components/SegmentedSwitcher';
import { FunctionsModal } from '../components/FunctionsModal';
import { SalesReportModal } from '../components/SalesReportModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { CashOperationModal } from '../components/CashOperationModal';
import { CashModal } from '../components/CashModal';
import { useShiftStore } from '../store/shiftStore';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore, VenueTable } from '../store/venueStore';
import { useNotificationStore } from '../store/notificationStore';
import { useOrdersUiStore } from '../store/ordersUiStore';
import { Order } from '../types';
import { can } from '../utils/permissions';

const getCols = (width: number): number => {
  if (width < 1200) return 4;
  if (width < 1800) return 5;
  return 6;
};
const GAP = 8;
const PADDING = 8;

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

export const OrdersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
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
  const [closeShiftVisible, setCloseShiftVisible] = useState(false);
  const [cashOpVisible, setCashOpVisible] = useState(false);
  const [cashOpMode, setCashOpMode] = useState<'collection' | 'in' | 'out'>('collection');
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const sortMode = useOrdersUiStore((s) => s.sortMode);
  const setSortMode = useOrdersUiStore((s) => s.setSortMode);
  const closeShift = useShiftStore((s) => s.closeShift);
  const addCashCollection = useShiftStore((s) => s.addCashCollection);
  const addCashTransaction = useShiftStore((s) => s.addCashTransaction);
  const refreshShiftCashSummary = useShiftStore((s) => s.refreshShiftCashSummary);
  const logout = useShiftStore((s) => s.logout);
  const currentUser = useShiftStore((s) => s.currentUser);
  const [searchQuery, setSearchQuery] = useState('');
  const venueType = useVenueStore((s) => s.venueType);
  const isTakeaway = venueType === 'takeaway';
  const isOrders = isTakeaway || activeTab === 'orders';
  const canCloseShift = can(currentUser?.role, 'closeShift');
  const canCashTransaction = can(currentUser?.role, 'cashTransaction');
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

  const cashTransactionErrorMessage = (
    err: string,
    detail?: Record<string, unknown>,
  ): { title: string; message: string } => {
    switch (err) {
      case 'shift_not_open':
      case 'shift_not_found':
        return { title: 'Смена не открыта', message: 'Откройте смену и повторите.' };
      case 'invalid_amount':
        return { title: 'Ошибка', message: 'Сумма должна быть больше нуля.' };
      case 'invalid_kind':
        return { title: 'Ошибка', message: 'Тип транзакции не распознан.' };
      case 'insufficient_cash': {
        const available = Number(detail?.available ?? 0);
        return {
          title: 'Недостаточно наличных',
          message: `Доступно: ${formatAmount(available)} ₽. Уменьшите сумму или сначала проведите внесение.`,
        };
      }
      case 'actor_forbidden_role':
      case 'actor_not_allowed':
      case 'forbidden':
        return { title: 'Недостаточно прав', message: 'Эта операция недоступна для вашей роли.' };
      default:
        return { title: 'Ошибка', message: `Не удалось провести операцию: ${err}` };
    }
  };

  const handleCashTransaction = async (
    kind: 'in' | 'out',
    amount: number,
    note?: string,
  ): Promise<{ ok: boolean }> => {
    if (!canCashTransaction) {
      Alert.alert('Недостаточно прав', 'Эта операция недоступна для вашей роли.');
      return { ok: false };
    }
    const shift = useShiftStore.getState().currentShift;
    if (!shift) {
      Alert.alert('Смена не открыта', 'Откройте смену и повторите.');
      return { ok: false };
    }
    const res = await addCashTransaction(kind, amount, note, currentUser?.id ?? null);
    if (!res.ok) {
      const { title, message } = cashTransactionErrorMessage(
        res.error ?? 'cash_transaction_failed',
        res.detail,
      );
      Alert.alert(title, message);
      return { ok: false };
    }
    return { ok: true };
  };

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
        <View style={[styles.headerRow, { marginHorizontal: PADDING, marginBottom: GAP }]}>
          {searchActive ? (
            <View style={styles.searchInputWrap}>
              <SearchIcon size={18} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Номер, стол, официант, блюдо, сумма…"
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={(text) => { setSearchQuery(text); setPage(0); }}
                autoFocus
              />
              <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); setPage(0); }} style={styles.searchCloseBtn}>
                <Feather name="x" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <SegmentedSwitcher
                options={[
                  { value: 'all', label: STATUS_LABELS.all },
                  { value: 'active', label: STATUS_LABELS.active },
                  { value: 'paid', label: STATUS_LABELS.paid },
                ]}
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(0); }}
              />

              {currentUser && (
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

              {currentUser && (
                <View style={styles.userChip}>
                  <View style={[styles.onlineDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.userChipText} numberOfLines={1}>{currentUser.name}</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.iconBtn, { marginRight: GAP }]}>
                <NotificationIcon size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconBtn} onPress={() => { setSearchActive(true); }}>
                <SearchIcon size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ═══ CONTENT ═══ */}
        {isOrders ? (
          /* Orders grid */
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
                      <View style={styles.actionsCell}>
                        <TouchableOpacity style={styles.actionFull} onPress={handleQuickCheck}>
                          <Feather name="plus" size={24} color="#fff" />
                          <Text style={styles.actionLabel}>Новый{'\n'}заказ</Text>
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
                          <Feather name="chevron-up" size={28} color={page === 0 ? '#999' : theme.colors.tabActive} />
                        </TouchableOpacity>
                        <View style={styles.pageDivider} />
                        <TouchableOpacity
                          style={[styles.pageHalf, page >= totalPages - 1 && styles.pageDisabled]}
                          onPress={handlePageDown}
                          disabled={page >= totalPages - 1}
                        >
                          <Feather name="chevron-down" size={28} color={page >= totalPages - 1 ? '#999' : theme.colors.tabActive} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          /* Floor plan */
          <View style={[styles.floorPlanArea, { marginHorizontal: PADDING }]}>
            <FloorPlan onTablePress={handleTablePress} zoneIdx={zoneIdx} />
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
          onOpenShift={() => setReportVisible(true)}
          onOpenChecksArchive={() => navigation.navigate('PaidCheck')}
          onOpenCash={() => {
            void refreshShiftCashSummary();
            setCashModalVisible(true);
          }}
          onCloseShift={() => {
            if (!canCloseShift) return;
            void refreshShiftCashSummary();
            setCloseShiftVisible(true);
          }}
          onCashCollection={() => {
            void refreshShiftCashSummary();
            setCashOpMode('collection'); setCashOpVisible(true);
          }}
          onCashIn={() => {
            if (!canCashTransaction) return;
            void refreshShiftCashSummary();
            setCashOpMode('in'); setCashOpVisible(true);
          }}
          onCashOut={() => {
            if (!canCashTransaction) return;
            void refreshShiftCashSummary();
            setCashOpMode('out'); setCashOpVisible(true);
          }}
          canCloseShift={canCloseShift}
          canCashTransaction={canCashTransaction}
          onLogout={() => {
            logout();
            navigation.replace('Lock');
          }}
        />
        <SalesReportModal visible={reportVisible} onClose={() => setReportVisible(false)} />
        <CashModal
          visible={cashModalVisible}
          onClose={() => setCashModalVisible(false)}
          role={currentUser?.role ?? null}
          onCashIn={() => {
            if (!canCashTransaction) return;
            setCashOpMode('in'); setCashOpVisible(true);
          }}
          onCashOut={() => {
            if (!canCashTransaction) return;
            setCashOpMode('out'); setCashOpVisible(true);
          }}
          onCashCollection={() => { setCashOpMode('collection'); setCashOpVisible(true); }}
        />
        <CloseShiftModal
          visible={closeShiftVisible}
          onClose={() => setCloseShiftVisible(false)}
          canConfirmClose={canCloseShift}
          onConfirmClose={async (counted) => {
            if (!canCloseShift) return;
            const closed = await closeShift(counted);
            if (!closed) {
              Alert.alert('Ошибка', 'Не удалось закрыть смену. Проверьте соединение и попробуйте снова.');
              return;
            }
            setCloseShiftVisible(false);
            navigation.replace('OpenShift');
          }}
        />
        <CashOperationModal
          visible={cashOpVisible}
          mode={cashOpMode}
          onClose={() => setCashOpVisible(false)}
          onConfirm={async (amount, note) => {
            if (cashOpMode === 'collection') {
              const res = await addCashCollection(amount, note);
              if (!res.ok) {
                Alert.alert('Ошибка', res.error ?? 'Не удалось провести инкассацию');
                return;
              }
            } else {
              const res = await handleCashTransaction(cashOpMode, amount, note);
              if (!res.ok) return;
            }
            setCashOpVisible(false);
          }}
        />
      </View>
    </SafeAreaView>
  );
};

const formatAmount = (n: number) => Number(n).toLocaleString('ru-RU');

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: '#1A1A1A' },
  root: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: '#1A1A1A' },

  headerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: PADDING,
    zIndex: 1000,
    overflow: 'visible',
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#333',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    marginRight: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userChipText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 100,
  },

  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: theme.borderRadius,
    paddingHorizontal: 12,
    gap: 8,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  searchCloseBtn: { padding: 4 },

  gridArea: { flex: 1, marginBottom: GAP },
  gridRow: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1, borderRadius: theme.borderRadius, overflow: 'hidden' },

  floorPlanArea: {
    flex: 1,
    marginBottom: GAP,
  },

  actionsCell: { flex: 1, flexDirection: 'row' },
  actionHalf: {
    flex: 1,
    backgroundColor: '#00C853',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionFull: {
    flex: 1,
    backgroundColor: '#00C853',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },

  paginationCell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: theme.borderRadius,
    overflow: 'hidden',
  },
  pageHalf: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageDisabled: { opacity: 0.4 },
  pageDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
});
