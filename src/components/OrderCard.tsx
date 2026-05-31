import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { SomIcon } from './Icons';
import { theme } from '../theme/colors';
import { Order } from '../types';
import YandexIcon from '../assets/icons/yandex.svg';
import { useNotificationStore } from '../store/notificationStore';
import { useVenueStore } from '../store/venueStore';

const formatAmount = (amount: number): string => {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const formatRelativeTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
};

const getElapsedMinutes = (iso: string): number => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
};

interface Props {
  order: Order;
  onPress: () => void;
  scale?: number;
}

const ICON_COLOR = '#fff';

export const OrderCard: React.FC<Props> = ({ order, onPress, scale = 1 }) => {
  const isTakeaway = useVenueStore((s) => s.venueType === 'takeaway');
  const [, setTick] = useState(0);

  // Update relative time every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const dishPreview = order.items
    .map(item => item.product.name)
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .join(', ');

  const elapsed = getElapsedMinutes(order.openedAt);

  const getBackgroundColor = () => {
    if (order.status === 'paid') return theme.colors.orderActive;
    if (order.status === 'cancelled') return '#4A0A0A';
    if (order.status === 'alert') return theme.colors.orderAlert;
    // active — heat map
    if (elapsed > 60) return '#4A1A0A'; // hot
    if (elapsed > 30) return '#4A3A00'; // warm
    return theme.colors.orderDefault;    // normal
  };

  const bgColor = getBackgroundColor();

  // ── Top line: table + waiter, or quick check, or delivery, or cancel reason ──
  const renderTopLine = () => {
    if (order.status === 'cancelled' && order.closeReason) {
      return (
        <View style={styles.topLine}>
          <Feather name="alert-triangle" size={14} color="#FF8A80" />
          <Text style={styles.closeReason} numberOfLines={1}>{order.closeReason}</Text>
        </View>
      );
    }
    if (order.isQuickCheck && !isTakeaway) {
      return (
        <View style={styles.topLine}>
          <Text style={styles.topText}>Быстрый чек</Text>
        </View>
      );
    }
    if (order.tableNumber) {
      return (
        <View style={styles.topLine}>
          {order.waiter ? (
            <>
              <Text style={styles.topText}>{order.waiter}</Text>
              <Text style={styles.topDivider}>·</Text>
            </>
          ) : null}
          <Text style={styles.topText}>Стол {order.tableNumber}</Text>
        </View>
      );
    }
    // Delivery / marketplace — no table, show source badge
    if (order.source === 'yandex_eda') {
      return (
        <View style={styles.topLine}>
          <YandexIcon width={14} height={14} />
          <Text style={styles.topText}>Доставка</Text>
        </View>
      );
    }
    if (order.source === 'glovo') {
      return (
        <View style={styles.topLine}>
          <Feather name="truck" size={12} color={ICON_COLOR} />
          <Text style={styles.topText}>Glovo</Text>
        </View>
      );
    }
    // Takeaway — clock
    if (isTakeaway) {
      return (
        <View style={styles.topLine}>
          <Feather name="clock" size={12} color={ICON_COLOR} />
          <Text style={styles.topText}>{formatRelativeTime(order.openedAt)}</Text>
        </View>
      );
    }
    return null;
  };

  // ── Marketplace notification pulse ──
  const isMarketplace = order.source === 'glovo' || order.source === 'yandex_eda';
  const isUnseen = useNotificationStore((s) =>
    isMarketplace ? s.unseenIds.has(order.id) : false,
  );
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isUnseen) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isUnseen, pulse]);

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ scale: pulse }],
        opacity: pulse,
      }}
    >
      <TouchableOpacity
        style={[styles.card, { backgroundColor: bgColor }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {/* ── TOP: table / waiter ── */}
        {renderTopLine()}

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* ── MIDDLE: comment + dishes ── */}
        {order.comment ? (
          <View style={styles.commentWrap}>
            <Text style={styles.comment} numberOfLines={1}>{order.comment}</Text>
            <LinearGradient
              colors={['transparent', bgColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.dishFade}
            />
          </View>
        ) : null}

        {dishPreview ? (
          <View style={styles.dishPreviewWrap}>
            <Text style={styles.dishPreview} numberOfLines={2}>{dishPreview}</Text>
            <LinearGradient
              colors={['transparent', bgColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.dishFade}
            />
          </View>
        ) : null}

        {/* ── BOTTOM: time · order # · amount ── */}
        <View style={styles.bottomRow}>
          <View style={styles.bottomLeft}>
            {order.status === 'active' ? (
              <>
                <Feather name="clock" size={12} color={elapsed > 30 ? '#FFB74D' : 'rgba(255,255,255,0.5)'} />
                <Text style={[styles.bottomTime, elapsed > 60 && styles.bottomTimeHot]}>
                  {formatRelativeTime(order.openedAt)}
                </Text>
              </>
            ) : order.status === 'cancelled' ? (
              <Text style={styles.bottomStatus}>Отменён</Text>
            ) : (
              <Text style={styles.bottomStatus}>Закрыт</Text>
            )}
            <Text style={styles.bottomDivider}>·</Text>
            <Text style={styles.bottomOrderNum}>№{order.number}</Text>
          </View>
          <View style={styles.bottomAmount}>
            <Text style={styles.bottomAmountText}>{formatAmount(order.totalAmount)}</Text>
            <SomIcon size={8} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: theme.borderRadius,
    justifyContent: 'space-between',
    padding: 12,
  },

  // ── Top line ──
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  topText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.85,
  },
  topDivider: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
    fontWeight: '600',
  },
  closeReason: {
    color: '#FF8A80',
    fontWeight: '600',
    fontSize: 13,
    flexShrink: 1,
  },

  // ── Middle: dishes ──
  dishPreviewWrap: {
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 2,
  },
  dishPreview: {
    color: '#EAE6E5',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  commentWrap: {
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 2,
  },
  comment: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  dishFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 50,
  },

  // ── Bottom row ──
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  bottomTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomTimeHot: {
    color: '#FF8A65',
    fontWeight: '500',
  },
  bottomDivider: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
  },
  bottomOrderNum: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '400',
  },
  bottomStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '400',
  },
  bottomAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  bottomAmountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
