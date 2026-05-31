import { create } from 'zustand';
import { Product, OrderItem, Modifier, ActiveAction, Order } from '../types';
import { supabase } from '../utils/supabase';
import { useShiftStore } from './shiftStore';
import { useMenuStore } from './menuStore';
import { VENUE_ID } from '../config';
import { logger } from '../utils/logger';

const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const now = () => new Date().toISOString();

const calcTotal = (items: OrderItem[]): number =>
  items.reduce((sum, item) => {
    const modPrice = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.product.price + modPrice) * item.quantity;
  }, 0);

const getNextOrderNumber = (orders: Order[]): string => {
  const nums = orders.map(o => parseFloat(o.number)).filter(n => !isNaN(n));
  const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
  return String(Math.floor(maxNum) + 1);
};

// ═══ Supabase sync functions (fire-and-forget) ═══

const syncCreateOrder = async (order: Order) => {
  try {
    const waiterId = useShiftStore.getState().currentUser?.id || null;
    const shiftId = useShiftStore.getState().currentShift?.id || null;
    const { error } = await supabase.from('orders').insert({
      id: order.id,
      venue_id: VENUE_ID,
      shift_id: shiftId,
      table_id: order.tableId || null,
      number: order.number,
      status: order.status,
      guest_count: order.guestCount,
      table_number: order.tableNumber || null,
      zone_name: order.zone,
      order_type: order.type,
      order_source: order.source ?? 'pos',
      external_order_id: order.externalOrderId ?? null,
      is_quick_check: order.isQuickCheck || false,
      opened_at: new Date().toISOString(),
      total_amount: order.totalAmount,
      waiter_id: waiterId,
    });
    if (error) logger.error('orderStore.syncCreateOrder', error, { orderId: order.id });
  } catch (e) {
    logger.error('orderStore.syncCreateOrder', e, { orderId: order.id });
  }
};

const syncUpdateOrder = async (order: Order) => {
  try {
    const waiterId = useShiftStore.getState().currentUser?.id || null;
    const { error } = await supabase.from('orders').update({
      status: order.status,
      guest_count: order.guestCount,
      table_id: order.tableId || null,
      table_number: order.tableNumber || null,
      zone_name: order.zone,
      total_amount: order.totalAmount,
      is_quick_check: order.isQuickCheck || false,
      comment: order.comment || null,
      waiter_id: waiterId,
      closed_at:
        order.status === 'paid' || order.status === 'cancelled'
          ? (order.closedAt ?? new Date().toISOString())
          : null,
    }).eq('id', order.id);
    if (error) logger.error('orderStore.syncUpdateOrder', error, { orderId: order.id });
  } catch (e) {
    logger.error('orderStore.syncUpdateOrder', e, { orderId: order.id });
  }
};

const syncUpdateOrderAwait = async (order: Order) => {
  const waiterId = useShiftStore.getState().currentUser?.id || null;
  const { error } = await supabase.from('orders').update({
    status: order.status,
    guest_count: order.guestCount,
    table_id: order.tableId || null,
    table_number: order.tableNumber || null,
    zone_name: order.zone,
    total_amount: order.totalAmount,
    is_quick_check: order.isQuickCheck || false,
    comment: order.comment || null,
    waiter_id: waiterId,
    closed_at:
      order.status === 'paid' || order.status === 'cancelled'
        ? (order.closedAt ?? new Date().toISOString())
        : null,
  }).eq('id', order.id);
  if (error) throw new Error(error.message);
};

const syncOrderItems = async (orderId: string, items: OrderItem[]) => {
  try {
    if (items.length > 0) {
      await supabase.from('order_item_modifiers')
        .delete()
        .in('order_item_id', items.map(i => i.id));
    }

    await supabase.from('order_items').delete().eq('order_id', orderId);

    if (items.length > 0) {
      const orderItems = items.map((item) => ({
        id: item.id,
        order_id: orderId,
        product_id: item.product.id,
        product_name: item.product.name,
        product_price: item.product.price,
        quantity: item.quantity,
        guest_number: 1,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .upsert(orderItems, { onConflict: 'id' });
      if (itemsError) {
        logger.error('orderStore.syncOrderItems.upsertItems', itemsError, {
          orderId,
          code: itemsError.code,
        });
        // 23503 — FK violation (например, product_id больше нет в products после правок в админке).
        // Инвалидируем кэш меню — далее пользователь увидит свежие позиции.
        if (itemsError.code === '23503') {
          useMenuStore.getState().fetchMenu(true).catch(() => {});
        }
        return; // без order_items нет смысла пытаться вставлять модификаторы
      }

      const modRows: any[] = [];
      items.forEach(item => {
        item.modifiers.forEach(mod => {
          modRows.push({
            order_item_id: item.id,
            modifier_id: mod.id,
            modifier_name: mod.name,
            modifier_price: mod.price,
          });
        });
      });
      if (modRows.length > 0) {
        // id генерится сервером, поэтому простой insert (без бессмысленного onConflict: 'id').
        const { error: modError } = await supabase.from('order_item_modifiers').insert(modRows);
        if (modError) {
          logger.error('orderStore.syncOrderItems.insertModifiers', modError, {
            orderId,
            code: modError.code,
          });
          if (modError.code === '23503') {
            // FK на modifier_id отвалился — кэш меню устарел (модификаторы пересоздали в админке).
            // Принудительно обновляем — на следующей попытке клиент возьмёт актуальные UUID.
            useMenuStore.getState().fetchMenu(true).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    logger.error('orderStore.syncOrderItems', e, { orderId });
  }
};

const syncDeleteOrder = async (orderId: string) => {
  try {
    await supabase.from('order_item_modifiers')
      .delete()
      .in('order_item_id',
        (await supabase.from('order_items').select('id').eq('order_id', orderId)).data?.map((i: any) => i.id) || []
      );
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('orders').delete().eq('id', orderId);
  } catch (e) {
    logger.error('orderStore.syncDeleteOrder', e, { orderId });
  }
};

// ═══ Load orders from Supabase ═══

const loadOrdersFromSupabase = async (): Promise<Order[]> => {
  try {
    const currentShiftId = useShiftStore.getState().currentShift?.id;
    if (!currentShiftId) return [];

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*, users(name)')
      .eq('venue_id', VENUE_ID)
      .eq('shift_id', currentShiftId)
      .in('status', ['active', 'alert', 'paid', 'cancelled'])
      .order('opened_at', { ascending: false });

    if (orderError) throw orderError;
    if (!orderData || orderData.length === 0) return [];

    const orderIds = orderData.map((o: any) => o.id);
    const { data: itemData } = await supabase
      .from('order_items')
      .select('*, order_item_modifiers(*)')
      .in('order_id', orderIds);

    const mapped = orderData.map((o: any) => {
      const items: OrderItem[] = (itemData || [])
        .filter((i: any) => i.order_id === o.id)
        .map((i: any) => ({
          id: i.id,
          product: {
            id: i.product_id,
            categoryId: '',
            name: i.product_name,
            price: Number(i.product_price),
          },
          quantity: i.quantity,
          modifiers: (i.order_item_modifiers || []).map((m: any) => ({
            id: m.modifier_id || m.id,
            name: m.modifier_name,
            price: Number(m.modifier_price),
          })),
        }));

      return {
        id: o.id,
        number: o.number,
        status: o.status as any,
        source: (o.order_source as 'pos' | 'glovo' | 'yandex_eda' | undefined) ?? 'pos',
        externalOrderId: o.external_order_id || undefined,
        waiter: (Array.isArray(o.users) ? o.users[0]?.name : o.users?.name) || 'Иванов',
        openedAt: o.opened_at,
        closedAt: o.closed_at || undefined,
        zone: o.zone_name || '',
        type: o.order_type || 'Общий',
        totalAmount: Number(o.total_amount),
        tableNumber: o.table_number || '',
        tableId: o.table_id || '',
        guestCount: o.guest_count || 1,
        items,
        isQuickCheck: o.is_quick_check || false,
        comment: o.comment || undefined,
        closeReason: o.close_reason || undefined,
      } as Order;
    });

    // Sort: active/alert first, then paid/cancelled. Within each group — newest first.
    const statusPriority: Record<string, number> = { active: 0, alert: 0, paid: 1, cancelled: 2 };
    mapped.sort((a, b) => {
      const pa = statusPriority[a.status] ?? 0;
      const pb = statusPriority[b.status] ?? 0;
      if (pa !== pb) return pa - pb;
      return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
    });
    return mapped;
  } catch (e) {
    logger.error('orderStore.loadOrdersFromSupabase', e);
    return [];
  }
};

// ═══ Sync helper: debounced item sync ═══
let itemSyncTimeout: any = null;
let pendingSync: { orderId: string; items: OrderItem[] } | null = null;

const debouncedSyncItems = (orderId: string, items: OrderItem[]) => {
  if (itemSyncTimeout) clearTimeout(itemSyncTimeout);
  pendingSync = { orderId, items };
  itemSyncTimeout = setTimeout(() => {
    syncOrderItems(orderId, items);
    const total = calcTotal(items);
    supabase.from('orders').update({ total_amount: total }).eq('id', orderId);
    pendingSync = null;
  }, 500);
};

const flushPendingSyncAwait = async () => {
  if (itemSyncTimeout) {
    clearTimeout(itemSyncTimeout);
    itemSyncTimeout = null;
  }
  if (!pendingSync) return;
  const { orderId, items } = pendingSync;
  pendingSync = null;
  await syncOrderItems(orderId, items);
  const total = calcTotal(items);
  const { error } = await supabase.from('orders').update({ total_amount: total }).eq('id', orderId);
  if (error) throw new Error(error.message);
};

// ═══ Store ═══

const syncToOrders = (state: OrderStoreState): Order[] => {
  if (!state.currentOrderId) return state.orders;

  const total = calcTotal(state.items);
  const updated = state.orders.map(o =>
    o.id === state.currentOrderId
      ? {
          ...o,
          items: state.items,
          totalAmount: total,
          tableNumber: state.tableNumber,
          tableId: state.tableId,
          isQuickCheck: state.isQuickCheck,
          status: o.status === 'paid' || o.status === 'cancelled' ? o.status : (total > 0 ? 'active' as const : o.status),
        }
      : o
  );

  debouncedSyncItems(state.currentOrderId, state.items);

  return updated;
};

interface OrderStoreState {
  orders: Order[];
  currentOrderId: string | null;
  items: OrderItem[];
  tableNumber: string;
  tableId: string;
  isQuickCheck: boolean;
  selectedItemId: string | null;
  activeAction: ActiveAction;
  activeCategoryId: string;
  activeModifierGroupId: string;

  flushPendingItemsToServer: () => Promise<void>;
  syncRemoteOrder: (order: Order) => Promise<void>;

  fetchOrders: () => Promise<void>;
  createOrderForTable: (tableId: string, tableNumber: string, zone: string) => string;
  createQuickCheck: () => string;
  getOrderForTable: (tableId: string) => Order | undefined;
  openOrder: (orderId: string) => void;
  closeOrder: () => Promise<void>;
  deleteOrder: (orderId: string) => void;
  setGuestCount: (delta: number) => void;
  sendToKitchen: () => void;
  updateOrderMeta: (patch: Partial<Pick<Order, 'waiter' | 'tableId' | 'tableNumber' | 'zone' | 'guestCount'>>) => void;
  addProduct: (product: Product) => void;
  removeProduct: (itemId: string) => void;
  duplicateItem: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  getTotal: () => number;
  selectItem: (itemId: string | null) => void;
  setActiveAction: (action: ActiveAction) => void;
  setActiveCategory: (categoryId: string) => void;
  setActiveModifierGroup: (groupId: string) => void;
  toggleModifier: (modifier: Modifier) => void;
  setItemComment: (itemId: string, comment: string) => void;
}

export const useOrderStore = create<OrderStoreState>((set, get) => ({
  orders: [],
  currentOrderId: null,
  items: [],
  tableNumber: '',
  tableId: '',
  isQuickCheck: false,
  selectedItemId: null,
  activeAction: null,
  activeCategoryId: '',
  activeModifierGroupId: 'filling',

  flushPendingItemsToServer: async () => {
    await flushPendingSyncAwait();
  },

  syncRemoteOrder: async (order: Order) => {
    await syncUpdateOrderAwait(order);
  },

  fetchOrders: async () => {
    const orders = await loadOrdersFromSupabase();
    set({ orders });
  },

  createOrderForTable: (tableId: string, tableNumber: string, zone: string) => {
    const state = get();
    const existing = state.orders.find(o => o.tableId === tableId && (o.status === 'active' || o.status === 'alert'));
    if (existing) {
      get().openOrder(existing.id);
      return existing.id;
    }

    const id = generateId();
    const currentUser = useShiftStore.getState().currentUser;

    const newOrder: Order = {
      id,
      number: getNextOrderNumber(state.orders),
      status: 'active',
      source: 'pos',
      waiter: currentUser?.name || 'Иванов',
      openedAt: now(),
      zone,
      type: 'Общий',
      totalAmount: 0,
      tableNumber,
      tableId,
      guestCount: 1,
      items: [],
    };

    set({
      orders: [newOrder, ...state.orders],
      currentOrderId: id,
      items: [],
      tableNumber,
      tableId,
      isQuickCheck: false,
      selectedItemId: null,
      activeAction: null,
    });

    syncCreateOrder(newOrder);
    return id;
  },

  createQuickCheck: () => {
    const state = get();
    const id = generateId();
    const currentUser = useShiftStore.getState().currentUser;

    const newOrder: Order = {
      id,
      number: getNextOrderNumber(state.orders),
      status: 'active',
      source: 'pos',
      waiter: currentUser?.name || 'Иванов',
      openedAt: now(),
      zone: 'Быстрый чек',
      type: 'Общий',
      totalAmount: 0,
      tableNumber: '',
      tableId: '',
      guestCount: 1,
      items: [],
      isQuickCheck: true,
    };

    set({
      orders: [newOrder, ...state.orders],
      currentOrderId: id,
      items: [],
      tableNumber: '',
      tableId: '',
      isQuickCheck: true,
      selectedItemId: null,
      activeAction: null,
    });

    syncCreateOrder(newOrder);
    return id;
  },

  getOrderForTable: (tableId: string) => {
    return get().orders.find(o => o.tableId === tableId && (o.status === 'active' || o.status === 'alert'));
  },

  openOrder: (orderId: string) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;

    set({
      currentOrderId: order.id,
      items: JSON.parse(JSON.stringify(order.items)),
      tableNumber: order.tableNumber,
      tableId: order.tableId || '',
      isQuickCheck: order.isQuickCheck || false,
      selectedItemId: null,
      activeAction: null,
    });
  },

  closeOrder: async () => {
    const state = get();
    try {
      await flushPendingSyncAwait();
    } catch (e) {
      logger.error('orderStore.flushPendingItemsToServer', e);
    }

    if (!state.currentOrderId) {
      set({
        currentOrderId: null,
        items: [],
        selectedItemId: null,
        tableId: '',
        tableNumber: '',
        isQuickCheck: false,
      });
      return;
    }

    const total = calcTotal(state.items);
    const updatedOrders = state.orders.map((o) =>
      o.id === state.currentOrderId
        ? {
            ...o,
            items: state.items,
            totalAmount: total,
            tableNumber: state.tableNumber,
            tableId: state.tableId,
            isQuickCheck: state.isQuickCheck,
            status:
              o.status === 'paid' || o.status === 'cancelled'
                ? o.status
                : total > 0
                  ? ('active' as const)
                  : o.status,
          }
        : o
    );

    const order = updatedOrders.find((o) => o.id === state.currentOrderId);
    if (order) {
      try {
        await syncUpdateOrderAwait(order);
      } catch (e) {
        logger.error('orderStore.syncRemoteOrder', e, { orderId: order.id });
      }
    }

    set({
      orders: updatedOrders,
      currentOrderId: null,
      items: [],
      selectedItemId: null,
      tableId: '',
      tableNumber: '',
      isQuickCheck: false,
    });
  },

  deleteOrder: (orderId: string) => {
    set((state) => ({
      orders: state.orders.filter(o => o.id !== orderId),
    }));
    syncDeleteOrder(orderId);
  },

  setGuestCount: (delta: number) => {
    const state = get();
    if (!state.currentOrderId) return;
    const order = state.orders.find(o => o.id === state.currentOrderId);
    if (!order) return;
    const newCount = Math.max(1, order.guestCount + delta);
    const updatedOrders = state.orders.map(o =>
      o.id === state.currentOrderId ? { ...o, guestCount: newCount } : o
    );
    set({ orders: updatedOrders });
    syncUpdateOrder({ ...order, guestCount: newCount });
  },

  sendToKitchen: () => {
    const state = get();
    if (!state.currentOrderId) return;
    const order = state.orders.find(o => o.id === state.currentOrderId);
    if (!order || order.sentToKitchen) return;
    const updated = { ...order, sentToKitchen: true };
    const updatedOrders = state.orders.map(o =>
      o.id === state.currentOrderId ? updated : o
    );
    set({ orders: updatedOrders });
    syncUpdateOrder(updated);
  },

  updateOrderMeta: (patch) => {
    const state = get();
    if (!state.currentOrderId) return;
    const order = state.orders.find(o => o.id === state.currentOrderId);
    if (!order) return;
    const updated = { ...order, ...patch };
    const updatedOrders = state.orders.map(o =>
      o.id === state.currentOrderId ? updated : o
    );
    set({ orders: updatedOrders });
    syncUpdateOrder(updated);
  },

  addProduct: (product: Product) => {
    set((state) => {
      // Для продуктов с модификаторами каждое добавление — это отдельная позиция,
      // чтобы можно было задать разные модификаторы (например, два Латте с разным молоком).
      const existing = product.hasModifiers
        ? undefined
        : state.items.find(
            (item) => item.product.id === product.id && item.modifiers.length === 0
          );

      if (existing) {
        const newItems = state.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
        const newState = { ...state, items: newItems };
        return { items: newItems, orders: syncToOrders(newState) };
      }

      const newItem: OrderItem = {
        id: generateId(),
        product,
        quantity: 1,
        modifiers: [],
      };
      const newItems = [...state.items, newItem];
      const newState = { ...state, items: newItems };

      if (product.hasModifiers) {
        return {
          items: newItems,
          selectedItemId: newItem.id,
          activeAction: 'modifiers' as ActiveAction,
          orders: syncToOrders(newState),
        };
      }

      return { items: newItems, orders: syncToOrders(newState) };
    });
  },

  removeProduct: (itemId: string) => {
    set((state) => {
      const newItems = state.items.filter((item) => item.id !== itemId);
      const newState = { ...state, items: newItems };
      return {
        items: newItems,
        selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
        activeAction: state.selectedItemId === itemId ? null : state.activeAction,
        orders: syncToOrders(newState),
      };
    });
  },

  duplicateItem: (itemId: string) => {
    set((state) => {
      const idx = state.items.findIndex((item) => item.id === itemId);
      if (idx < 0) return state;
      const source = state.items[idx];
      const clone: OrderItem = {
        id: generateId(),
        product: source.product,
        quantity: 1,
        modifiers: source.modifiers.map((m) => ({ ...m })),
        comment: source.comment,
      };
      const newItems = [
        ...state.items.slice(0, idx + 1),
        clone,
        ...state.items.slice(idx + 1),
      ];
      const newState = { ...state, items: newItems };
      return {
        items: newItems,
        selectedItemId: clone.id,
        activeAction: source.product.hasModifiers ? ('modifiers' as ActiveAction) : state.activeAction,
        orders: syncToOrders(newState),
      };
    });
  },

  updateQuantity: (itemId: string, delta: number) => {
    set((state) => {
      const newItems = state.items.map(item => {
        if (item.id === itemId) {
          return { ...item, quantity: Math.max(0, item.quantity + delta) };
        }
        return item;
      }).filter(item => item.quantity > 0);

      const itemStillExists = newItems.some(i => i.id === state.selectedItemId);
      const newState = { ...state, items: newItems };
      return {
        items: newItems,
        selectedItemId: itemStillExists ? state.selectedItemId : null,
        activeAction: itemStillExists ? state.activeAction : null,
        orders: syncToOrders(newState),
      };
    });
  },

  getTotal: () => calcTotal(get().items),

  selectItem: (itemId: string | null) => {
    if (!itemId) {
      set({ selectedItemId: null, activeAction: null });
      return;
    }
    const item = get().items.find(i => i.id === itemId);
    const hasModifiers = item?.product.hasModifiers || item?.modifiers.length;
    set({
      selectedItemId: itemId,
      activeAction: hasModifiers ? 'modifiers' : 'quantity',
    });
  },

  setActiveAction: (action: ActiveAction) => set({ activeAction: action }),
  setActiveCategory: (categoryId: string) => set({ activeCategoryId: categoryId }),
  setActiveModifierGroup: (groupId: string) => set({ activeModifierGroupId: groupId }),

  toggleModifier: (modifier: Modifier) => {
    set((state) => {
      if (!state.selectedItemId) return state;
      // Группа модификатора и её правила (max_select, is_required) живут в menuStore.
      // 0 / undefined трактуем как «без лимита» — поведение совместимо со старым кодом.
      const group = useMenuStore
        .getState()
        .modifierGroups.find((g) => g.modifiers.some((m) => m.id === modifier.id));
      const siblingIds = group ? group.modifiers.map((m) => m.id) : [modifier.id];
      const maxSelect = group?.maxSelect ?? 0;

      const newItems = state.items.map((item) => {
        if (item.id !== state.selectedItemId) return item;
        const has = item.modifiers.some((m) => m.id === modifier.id);
        if (has) {
          return { ...item, modifiers: item.modifiers.filter((m) => m.id !== modifier.id) };
        }
        let newMods = [...item.modifiers, modifier];
        if (maxSelect > 0) {
          // Считаем выбранные из той же группы и убираем самый ранний (FIFO),
          // пока не уложимся в лимит. При max_select=1 это даёт радио-поведение.
          const inGroup = newMods.filter((m) => siblingIds.includes(m.id));
          const overflow = inGroup.length - maxSelect;
          if (overflow > 0) {
            const toRemove = new Set(inGroup.slice(0, overflow).map((m) => m.id));
            newMods = newMods.filter((m) => !toRemove.has(m.id));
          }
        }
        return { ...item, modifiers: newMods };
      });
      const newState = { ...state, items: newItems };
      return { items: newItems, orders: syncToOrders(newState) };
    });
  },

  setItemComment: (itemId: string, comment: string) => {
    set((state) => {
      const newItems = state.items.map(item =>
        item.id === itemId ? { ...item, comment: comment || undefined } : item
      );
      const newState = { ...state, items: newItems };
      return { items: newItems, orders: syncToOrders(newState) };
    });
  },
}));
