import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { OrderSetting } from './OrderSettingsMenu';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';
const ORDER_TYPES = ['Общий', 'Раздельный', 'Банкет'];

// Simple table list for picking
const TABLES = [
  { id: 't1', number: '1', zone: 'Основной зал' },
  { id: 't2', number: '2', zone: 'Основной зал' },
  { id: 't3', number: '3', zone: 'Основной зал' },
  { id: 't4', number: '4', zone: 'Основной зал' },
  { id: 't5', number: '5', zone: 'Основной зал' },
  { id: 't6', number: '6', zone: 'Основной зал' },
  { id: 't7', number: '7', zone: 'Основной зал' },
  { id: 't8', number: '8', zone: 'Основной зал' },
  { id: 't9', number: '9', zone: 'Основной зал' },
  { id: 't10', number: '10', zone: 'Основной зал' },
  { id: 'v1', number: '21', zone: 'Веранда' },
  { id: 'v2', number: '22', zone: 'Веранда' },
  { id: 'v3', number: '23', zone: 'Веранда' },
  { id: 'v4', number: '24', zone: 'Веранда' },
  { id: 'v5', number: '25', zone: 'Веранда' },
  { id: 'v6', number: '26', zone: 'Веранда' },
];

interface Props {
  setting: OrderSetting;
}

export const OrderSettingsDetail: React.FC<Props> = ({ setting }) => {
  const { tableNumber, tableId, currentOrderId } = useOrderStore();
  const [comment, setComment] = useState('');

  const updateOrder = (updates: Record<string, any>) => {
    useOrderStore.setState((state) => ({
      ...updates,
      orders: state.orders.map(o =>
        o.id === state.currentOrderId ? { ...o, ...updates } : o
      ),
    }));
  };

  if (!setting) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Выберите настройку</Text>
        </View>
      </View>
    );
  }

  if (setting === 'table') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Выбор стола</Text>
        </View>
        <ScrollView style={styles.list}>
          {TABLES.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.listItem, tableId === t.id && styles.listItemActive]}
              onPress={() => updateOrder({ tableNumber: t.number, tableId: t.id })}
              activeOpacity={0.7}
            >
              <Text style={[styles.listItemText, tableId === t.id && styles.listItemTextActive]}>
                Стол {t.number}
              </Text>
              <Text style={[styles.listItemSub, tableId === t.id && styles.listItemTextActive]}>
                {t.zone}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (setting === 'waiter') {
    const waiters = useVenueStore((s) => s.waiters);
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Официант</Text>
        </View>
        <View style={styles.list}>
          {waiters.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.listItem}
              onPress={() => updateOrder({ waiter: w.name })}
              activeOpacity={0.7}
            >
              <Text style={styles.listItemText}>{w.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (setting === 'type') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Тип заказа</Text>
        </View>
        <View style={styles.list}>
          {ORDER_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={styles.listItem}
              onPress={() => updateOrder({ type: t })}
              activeOpacity={0.7}
            >
              <Text style={styles.listItemText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (setting === 'comment') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Комментарий</Text>
        </View>
        <View style={styles.commentWrap}>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={(text) => {
              setComment(text);
              updateOrder({ comment: text });
            }}
            placeholder="Введите комментарий..."
            placeholderTextColor={theme.colors.textSecondary}
            multiline
          />

        </View>
      </View>
    );
  }

  return null;
};

const GAP = 2;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#191919',
    marginBottom: GAP,
  },
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#191919',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  list: {
    flex: 1,
    padding: 8,
  },
  listItem: {
    height: 52,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  listItemActive: {
    backgroundColor: theme.colors.actionMenuPurple,
  },
  listItemText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  listItemTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listItemSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  commentWrap: {
    padding: 8,
  },
  commentInput: {
    height: 100,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    padding: 16,
    color: theme.colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
    outlineStyle: 'none',
    borderWidth: 0,
  } as any,

});
