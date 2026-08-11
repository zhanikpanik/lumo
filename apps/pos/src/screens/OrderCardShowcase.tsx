import React from 'react';
import { View, Text, ScrollView, SafeAreaView, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import { OrderCard } from '../components/OrderCard';
import { Order } from '../types';
import { theme } from '../theme/colors';

// ── Mock helper ──
const minsAgo = (m: number): string =>
  new Date(Date.now() - m * 60_000).toISOString();

type PartialOrder = Partial<Order> & Pick<Order, 'items' | 'openedAt'>;

const mk = (overrides: Partial<Order> & { id: string; number: string; totalAmount: number }): Order => {
  const defaults: Order = {
    id: '',
    number: '',
    status: 'active',
    source: 'pos',
    waiter: '',
    openedAt: minsAgo(5),
    zone: '',
    type: '',
    totalAmount: 0,
    tableNumber: '',
    tableId: '',
    guestCount: 0,
    items: [{ id: 'i1', product: { id: 'p1', name: 'Тестовое блюдо', price: 0, categoryId: 'food' }, quantity: 1, modifiers: [] }],
    isQuickCheck: false,
    sentToKitchen: false,
    hasNote: false,
    hasAlert: false,
    hasEdit: false,
  };
  const merged = { ...defaults, ...overrides } as Order;
  // fix item price to match totalAmount for display purposes
  if (merged.items[0]) {
    merged.items[0].product.price = merged.totalAmount;
  }
  return merged;
};

// ── All variants ──
const variants: { label: string; order: Order }[] = [
  {
    label: 'Активный стол',
    order: mk({ id: '1', number: '1001', totalAmount: 3450, tableNumber: '12', tableId:'t1', waiter: 'Иван', zone: 'Веранда', sentToKitchen: true, hasEdit: true, hasAlert: true }),
  },
  {
    label: 'Активный, без зоны',
    order: mk({ id: '2', number: '1002', totalAmount: 2100, tableNumber: '5', tableId:'t2', waiter: 'Анна', sentToKitchen: true }),
  },
  {
    label: 'Долго висит (>60 мин)',
    order: mk({ id: '3', number: '1003', totalAmount: 8900, tableNumber: '8', tableId:'t3', waiter: 'Сергей', zone: 'Зал', openedAt: minsAgo(75), hasAlert: true }),
  },
  {
    label: 'Только стол, без официанта',
    order: mk({ id: '4', number: '1004', totalAmount: 1500, tableNumber: '3', tableId:'t4', zone: 'Терраса' }),
  },
  {
    label: 'Закрыт (paid)',
    order: mk({ id: '5', number: '1005', totalAmount: 4200, tableNumber: '7', tableId:'t5', waiter: 'Иван', zone: 'Зал', status: 'paid', openedAt: minsAgo(120), sentToKitchen: true, hasEdit: true }),
  },
  {
    label: 'Отменён с причиной',
    order: mk({ id: '6', number: '1006', totalAmount: 0, tableNumber: '4', tableId:'t6', waiter: 'Анна', status: 'cancelled', closeReason: 'Гости ушли' }),
  },
  {
    label: 'Отменён без причины',
    order: mk({ id: '7', number: '1007', totalAmount: 0, tableNumber: '9', tableId:'t7', status: 'cancelled' }),
  },
  {
    label: 'Тревога (alert)',
    order: mk({ id: '8', number: '1008', totalAmount: 5600, tableNumber: '2', tableId:'t8', waiter: 'Сергей', zone: 'Зал', status: 'alert', hasAlert: true }),
  },
  {
    label: 'Быстрый чек',
    order: mk({ id: '9', number: '1009', totalAmount: 1850, waiter: 'Иван', isQuickCheck: true, sentToKitchen: true, comment: 'Без лука' }),
  },
  {
    label: 'Доставка Яндекс',
    order: mk({ id: '10', number: '1010', totalAmount: 3200, source: 'yandex_eda' as const, openedAt: minsAgo(23), hasAlert: true }),
  },
  {
    label: 'Доставка Glovo',
    order: mk({ id: '11', number: '1011', totalAmount: 4100, source: 'glovo' as const, openedAt: minsAgo(12), sentToKitchen: true }),
  },
  {
    label: 'Самовывоз',
    order: mk({ id: '12', number: '1012', totalAmount: 2800, openedAt: minsAgo(8) }),
  },
  {
    label: 'Чистый (без иконок)',
    order: mk({ id: '13', number: '1013', totalAmount: 990, tableNumber: '11', tableId:'t9', waiter: 'Анна' }),
  },
  {
    label: 'Комментарий (карандаш)',
    order: mk({ id: '14', number: '1014', totalAmount: 2400, tableNumber: '6', tableId:'t10', waiter: 'Иван', zone: 'Веранда', hasEdit: true }),
  },
  {
    label: 'Пречек + алерт',
    order: mk({ id: '15', number: '1015', totalAmount: 6700, tableNumber: '10', tableId:'t11', waiter: 'Сергей', sentToKitchen: true, hasAlert: true }),
  },
];

const GAP = 12;

export const OrderCardShowcase: React.FC = () => {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(220, (width - GAP * 4) / 2);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar hidden />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Все варианты OrderCard</Text>
        <View style={styles.grid}>
          {variants.map((v) => (
            <View key={v.order.id} style={styles.cell}>
              <Text style={styles.label}>{v.label}</Text>
              <View style={{ width: cardWidth, height: 160 }}>
                <OrderCard
                  order={v.order}
                  onPress={() => {}}
                  scale={1}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: GAP },
  title: {
    color: '#fff',
    fontSize: 24,
    fontFamily: theme.fonts.medium,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    marginBottom: 8,
  },
  label: {
    color: theme.colors.whiteAlpha50,
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    marginBottom: 4,
  },
});
