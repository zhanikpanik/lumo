import React, { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ChevronDownIcon, ChevronUpIcon, PencilIcon } from './Icons';
import { theme } from '../theme/colors';
import { OrderItem } from './OrderItem';
import { usePosUiStore } from '../store/posUiStore';
import type { OrderItem as OrderItemType } from '../types';

const SCROLL_STEP = 150;
const GAP = 10;

interface Props {
  onCommentPress?: () => void;
  items: OrderItemType[];
  pendingItemIds?: ReadonlySet<string>;
  currentOrder?: {
    comment?: string;
    sentToKitchen?: boolean;
    number?: string;
    tableNumber?: string;
    guestCount?: number;
  } | null;
  onRemoveItem?: (itemId: string, priceTiyin: number, quantity: number) => void;
}

const calcTotal = (items: OrderItemType[]): number =>
  items.reduce((sum, item) => {
    const modifierTotal = item.modifiers.reduce((current, modifier) => current + modifier.price, 0);
    return sum + (item.product.price + modifierTotal) * item.quantity;
  }, 0);

const formatAmount = (amountTiyin: number): string =>
  Math.round(amountTiyin / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const OrderPanel: React.FC<Props> = ({ onCommentPress, items, currentOrder, pendingItemIds }) => {
  const { selectedItemId, selectedModifierId, selectItem, selectModifier } = usePosUiStore();
  const comment = currentOrder?.comment || '';
  const isEmpty = items.length === 0;
  const total = calcTotal(items);

  const scrollRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  const canScrollUp = scrollY > 0;
  const canScrollDown = contentHeight > viewHeight && scrollY < contentHeight - viewHeight - 1;

  const handleScrollUp = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, scrollY - SCROLL_STEP), animated: true });
  }, [scrollY]);

  const handleScrollDown = useCallback(() => {
    const maxY = contentHeight - viewHeight;
    scrollRef.current?.scrollTo({ y: Math.min(maxY, scrollY + SCROLL_STEP), animated: true });
  }, [contentHeight, scrollY, viewHeight]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(event.nativeEvent.contentOffset.y);
  }, []);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    setContentHeight(height);
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setViewHeight(event.nativeEvent.layout.height);
  }, []);

  const renderItem = (item: OrderItemType) => {
    const isPending = pendingItemIds?.has(item.id) ?? false;
    return (
      <View key={item.id} style={isPending ? styles.itemPending : undefined}>
        <Pressable
          disabled={isPending}
          onPress={() => selectItem(item.id === selectedItemId ? null : item.id)}
          style={({ pressed }) => pressed ? styles.itemPressed : undefined}
        >
          <OrderItem item={item} isSelected={item.id === selectedItemId} />
        </Pressable>
      {item.modifiers.length > 0 && (
        <View style={[styles.modifiersContainer, item.id === selectedItemId && styles.modifiersContainerSelected]}>
          {item.modifiers.map((modifier, index) => (
            <TouchableOpacity
              key={`${modifier.id}-${index}`}
              style={[
                styles.modifierRow,
                item.id === selectedItemId && selectedModifierId === modifier.id && styles.modifierRowSelected,
              ]}
              onPress={() => {
                if (item.id === selectedItemId) {
                  selectModifier(selectedModifierId === modifier.id ? null : modifier.id);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.modifierLine} />
              <Text style={[styles.modifierText, item.id === selectedItemId && styles.modifierTextSelected]}>{modifier.name}</Text>
              <Text style={[styles.modifierQty, item.id === selectedItemId && styles.modifierTextSelected]}>1</Text>
              <Text style={[styles.modifierPrice, item.id === selectedItemId && styles.modifierTextSelected]}>{formatAmount(modifier.price)} c</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderHeaderTitle}>Заказ</Text>
        <Text style={styles.orderHeaderTotal}>{formatAmount(total)} c</Text>
      </View>

      <View style={styles.itemListContainer}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator
          contentContainerStyle={isEmpty ? styles.scrollContentEmpty : styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleLayout}
        >
          {isEmpty ? (
            <View style={styles.emptyOrder}>
              <Feather name="plus-circle" size={32} color={theme.colors.textDisabled} />
              <Text style={styles.emptyOrderText}>Добавьте блюда из меню</Text>
            </View>
          ) : items.map(renderItem)}
        </ScrollView>
      </View>

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.scrollBtn, !canScrollUp && styles.btnDisabled]}
          onPress={handleScrollUp}
          disabled={!canScrollUp}
          activeOpacity={0.6}
        >
          <ChevronUpIcon size={22} color={canScrollUp ? theme.colors.textPrimary : theme.colors.textDisabled} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scrollBtn, !canScrollDown && styles.btnDisabled]}
          onPress={handleScrollDown}
          disabled={!canScrollDown}
          activeOpacity={0.6}
        >
          <ChevronDownIcon size={22} color={canScrollDown ? theme.colors.textPrimary : theme.colors.textDisabled} />
        </TouchableOpacity>
      </View>

      <View style={styles.commentRow}>
        <TouchableOpacity style={styles.commentButton} onPress={onCommentPress} activeOpacity={0.6}>
          <Text style={styles.commentText} numberOfLines={1}>{comment || 'Комментарий'}</Text>
          {comment ? <PencilIcon size={16} color={theme.colors.textSecondary} /> : null}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  orderHeader: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  orderHeaderTitle: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  orderHeaderTotal: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  itemListContainer: { flex: 1, position: 'relative', minHeight: 0 },
  scrollView: { ...StyleSheet.absoluteFillObject },
  scrollContent: { paddingBottom: 4 },
  scrollContentEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyOrder: { alignItems: 'center', gap: 12 },
  emptyOrderText: { color: theme.colors.textDisabled, fontSize: 15, fontFamily: theme.fonts.medium },
  itemPressed: { backgroundColor: theme.colors.surfaceLight },
  itemPending: { opacity: 0.55 },
  modifiersContainer: { backgroundColor: theme.colors.surfaceDeep },
  modifiersContainerSelected: { backgroundColor: theme.colors.orderItemActiveText },
  modifierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingRight: 16 },
  modifierRowSelected: { backgroundColor: theme.colors.accentTintSubtle },
  modifierLine: {
    width: 2,
    height: '100%',
    backgroundColor: theme.colors.textSecondary,
    marginLeft: 16,
    marginRight: 14,
  },
  modifierText: { flex: 1, color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  modifierTextSelected: { color: theme.colors.textPrimary },
  modifierQty: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    width: 30,
    textAlign: 'center',
  },
  modifierPrice: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    width: 60,
    textAlign: 'right',
  },
  bottomActions: { flexDirection: 'row', height: 44, gap: GAP, marginTop: GAP },
  scrollBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  commentRow: { height: 44, marginTop: GAP },
  commentButton: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  commentText: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    flexShrink: 1,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
