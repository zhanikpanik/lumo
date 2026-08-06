import React, { useRef, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Feather } from '../components/Feather';
import { ChevronUpIcon, ChevronDownIcon, PencilIcon, PrinterIcon } from './Icons';
import { theme } from '../theme/colors';
import { OrderItem } from './OrderItem';
import { usePosUiStore } from '../store/posUiStore';
import { OrderItem as OrderItemType } from '../types';

const SCROLL_STEP = 150;

interface Props {
  onCommentPress?: () => void;
  /** Order items from InstantDB */
  items: OrderItemType[];
  /** Current order from InstantDB */
  currentOrder?: {
    comment?: string;
    sentToKitchen?: boolean;
    number?: string;
    tableNumber?: string;
    guestCount?: number;
  } | null;
  /** Called on item remove */
  onRemoveItem?: (itemId: string, priceTiyin: number, quantity: number) => void;
}

const calcTotal = (items: OrderItemType[]): number =>
  items.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.product.price + modTotal) * item.quantity;
  }, 0);

export const OrderPanel: React.FC<Props> = ({ onCommentPress, items, currentOrder, onRemoveItem }) => {
  const { selectedItemId, selectedModifierId, selectItem, selectModifier } = usePosUiStore();
  const comment = currentOrder?.comment || '';
  const sentToKitchen = currentOrder?.sentToKitchen ?? false;
  const isEmpty = items.length === 0;

  const total = calcTotal(items);

  // Scroll controls
  const scrollRef = useRef<FlatList>(null);
  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  const canScrollUp = scrollY > 0;
  const canScrollDown = contentHeight > viewHeight && scrollY < contentHeight - viewHeight - 1;

  const handleScrollUp = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: Math.max(0, scrollY - SCROLL_STEP), animated: true });
  }, [scrollY]);

  const handleScrollDown = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: Math.min(contentHeight - viewHeight, scrollY + SCROLL_STEP), animated: true });
  }, [scrollY, contentHeight, viewHeight]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setViewHeight(e.nativeEvent.layout.height);
  }, []);

  const renderItem = (item: OrderItemType) => (
    <TouchableOpacity
      onPress={() => {
        if (item.id === selectedItemId) {
          selectItem(null);
        } else {
          selectItem(item.id);
        }
      }}
      activeOpacity={0.7}
    >
      <OrderItem
        item={item}
        isSelected={item.id === selectedItemId}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTotal}>{(total / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} c</Text>
        <View style={styles.headerActions}>
          {comment ? (
            <TouchableOpacity style={styles.headerBtn} onPress={onCommentPress}>
              <PencilIcon size={18} color={theme.colors.accent} />
            </TouchableOpacity>
          ) : null}
          {sentToKitchen ? (
            <View style={styles.headerBtn}>
              <PrinterIcon size={18} color={theme.colors.accent} />
            </View>
          ) : null}
        </View>
      </View>

      {/* Items list */}
      {isEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Добавьте блюда</Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderItem(item)}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleLayout}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Scroll controls */}
      {!isEmpty && (
        <View style={styles.scrollControls}>
          <TouchableOpacity
            style={[styles.scrollBtn, !canScrollUp && styles.scrollBtnDisabled]}
            onPress={handleScrollUp}
            disabled={!canScrollUp}
          >
            <ChevronUpIcon size={20} color={canScrollUp ? theme.colors.textPrimary : theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scrollBtn, !canScrollDown && styles.scrollBtnDisabled]}
            onPress={handleScrollDown}
            disabled={!canScrollDown}
          >
            <ChevronDownIcon size={20} color={canScrollDown ? theme.colors.textPrimary : theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const GAP = 10;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: GAP, paddingVertical: 8 },
  headerTotal: { color: theme.colors.textPrimary, fontSize: 18, fontFamily: theme.fonts.bold },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, fontFamily: theme.fonts.medium },
  scrollControls: { flexDirection: 'row', justifyContent: 'center', gap: GAP, paddingVertical: 4 },
  scrollBtn: { width: 40, height: 32, borderRadius: 8, backgroundColor: theme.colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  scrollBtnDisabled: { opacity: 0.3 },
});
