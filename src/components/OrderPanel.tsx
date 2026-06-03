import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { OrderItem } from './OrderItem';
import { useOrderStore } from '../store/orderStore';
import { OrderItem as OrderItemType } from '../types';

const SCROLL_STEP = 150;

interface Props {
  onCommentPress?: () => void;
}

export const OrderPanel: React.FC<Props> = ({ onCommentPress }) => {
  const { items, selectedItemId, selectItem, getTotal, sendToKitchen } = useOrderStore();
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const comment = currentOrder?.comment || '';
  const sentToKitchen = currentOrder?.sentToKitchen ?? false;
  const isEmpty = items.length === 0;

  const total = getTotal();

  // Scroll controls
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
  }, [scrollY, contentHeight, viewHeight]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setViewHeight(e.nativeEvent.layout.height);
  }, []);

  const renderItems = () => items.map(item => renderItem(item));

  const renderItem = (item: OrderItemType) => (
    <View key={item.id}>
      <Pressable
        onPress={() => selectItem(item.id === selectedItemId ? null : item.id)}
        style={({ pressed }) => pressed && styles.itemPressed}
      >
        <OrderItem item={item} isSelected={item.id === selectedItemId} />
      </Pressable>
      {item.modifiers.length > 0 && (
        <View style={[styles.modifiersContainer, item.id === selectedItemId && styles.modifiersContainerSelected]}>
          {item.modifiers.map((mod) => (
            <View key={mod.id} style={styles.modifierRow}>
              <View style={styles.modifierLine} />
              <Text style={[styles.modifierText, item.id === selectedItemId && styles.modifierTextSelected]}>{mod.name}</Text>
              <Text style={[styles.modifierQty, item.id === selectedItemId && styles.modifierTextSelected]}>1</Text>
              <Text style={[styles.modifierPrice, item.id === selectedItemId && styles.modifierTextSelected]}>{mod.price} ₽</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Order total row */}
      <View style={styles.orderHeader}>
        <Text style={styles.orderHeaderTitle}>Заказ</Text>
        <Text style={styles.orderHeaderTotal}>{total} ₽</Text>
      </View>

      {/* Items list */}
      <View style={styles.itemListContainer}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={true}
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
          ) : (
            renderItems()
          )}
        </ScrollView>
      </View>

      {/* Bottom: ↑ ↓ scroll */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.scrollBtn, !canScrollUp && styles.btnDisabled]}
          onPress={handleScrollUp}
          disabled={!canScrollUp}
          activeOpacity={0.6}
        >
          <Feather name="chevron-up" size={22} color={canScrollUp ? theme.colors.textPrimary : theme.colors.textDisabled} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scrollBtn, !canScrollDown && styles.btnDisabled]}
          onPress={handleScrollDown}
          disabled={!canScrollDown}
          activeOpacity={0.6}
        >
          <Feather name="chevron-down" size={22} color={canScrollDown ? theme.colors.textPrimary : theme.colors.textDisabled} />
        </TouchableOpacity>
      </View>

      {/* Send to kitchen */}
      {!isEmpty ? (
        <View style={styles.sendRow}>
          <TouchableOpacity
            style={[styles.sendBtn, sentToKitchen && styles.sendBtnDone]}
            onPress={() => sendToKitchen()}
            disabled={sentToKitchen}
            activeOpacity={0.6}
          >
            <Feather
              name={sentToKitchen ? 'check-circle' : 'printer'}
              size={16}
              color={sentToKitchen ? theme.colors.textSecondary : '#FFB74D'}
            />
            <Text style={[styles.sendText, sentToKitchen && styles.sendTextDone]}>
              {sentToKitchen ? 'На кухне' : 'Отправить'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Comment button */}
      <View style={styles.commentRow}>
        <TouchableOpacity
          style={styles.commentButton}
          onPress={onCommentPress}
          activeOpacity={0.6}
        >
          <Text
            style={styles.commentText}
            numberOfLines={1}
          >
            {comment || 'Комментарий'}
          </Text>
          {comment ? (
            <Feather name="edit-2" size={16} color={theme.colors.textSecondary} />
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const GAP = 8;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },

  // Order header
  orderHeader: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  orderHeaderTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderHeaderTotal: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Items list
  itemListContainer: { flex: 1, position: 'relative', minHeight: 0 },
  scrollView: { ...StyleSheet.absoluteFillObject },
  scrollContent: { paddingBottom: 4 },
  scrollContentEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyOrder: {
    alignItems: 'center',
    gap: 12,
  },
  emptyOrderText: {
    color: theme.colors.textDisabled,
    fontSize: 15,
    fontWeight: '500',
  },

  itemPressed: {
    backgroundColor: '#333',
  },
  modifiersContainer: {
    backgroundColor: theme.colors.surfaceDeep,
  },
  modifiersContainerSelected: {
    backgroundColor: theme.colors.orderItemActiveText,
  },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 16,
  },
  modifierLine: {
    width: 2,
    height: '100%',
    backgroundColor: theme.colors.textSecondary,
    marginLeft: 16,
    marginRight: 14,
  },
  modifierText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  modifierTextSelected: {
    color: theme.colors.textPrimary,
  },
  modifierQty: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    width: 30,
    textAlign: 'center',
  },
  modifierPrice: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    width: 60,
    textAlign: 'right',
  },

  // Bottom actions: ↑ ↓
  bottomActions: {
    flexDirection: 'row',
    height: 44,
    gap: GAP,
    marginTop: GAP,
  },
  scrollBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },

  // Send to kitchen
  sendRow: {
    height: 44,
    marginTop: GAP,
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4A3A00',
  },
  sendBtnDone: {
    backgroundColor: theme.colors.surfaceLight,
  },
  sendText: {
    color: '#FFB74D',
    fontSize: 16,
    fontWeight: '600',
  },
  sendTextDone: {
    color: theme.colors.textSecondary,
  },

  // Comment button
  commentRow: {
    height: 44,
    marginTop: GAP,
  },
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
    fontWeight: '500',
    flexShrink: 1,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
