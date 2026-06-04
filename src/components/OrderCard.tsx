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

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

interface Props {
  order: Order;
  onPress: () => void;
  scale?: number;
}

export const OrderCard: React.FC<Props> = ({ order, onPress, scale = 1 }) => {
  const isTakeaway = useVenueStore((s) => s.venueType === 'takeaway');
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const getBackgroundColor = () => {
    if (order.status === 'paid') return theme.colors.orderActive;
    if (order.status === 'cancelled') return '#4A0A0A';
    if (order.status === 'alert') return theme.colors.orderAlert;
    return theme.colors.orderDefault;
  };

  const bgColor = getBackgroundColor();

  const dishPreview = order.items
    .map(item => item.product.name)
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .join(', ');

  // ── Hero: table number (28px) or label + amount ──
  const renderHero = () => {
    if (order.status === 'cancelled' && order.closeReason) {
      return (
        <View style={styles.heroRow}>
          <Feather name="alert-triangle" size={22} color="#FF8A80" />
          <Text style={styles.cancelReason} numberOfLines={1}>{order.closeReason}</Text>
        </View>
      );
    }

    const leftContent = order.tableNumber ? (
      <Text style={styles.heroTableNum}>{order.tableNumber}</Text>
    ) : (
      <View style={styles.heroLabelRow}>
        {order.source === 'yandex_eda' && (
          <YandexIcon width={18} height={18} />
        )}
        {order.source === 'glovo' && (
          <Feather name="truck" size={16} color="rgba(255,255,255,0.85)" />
        )}
        <Text style={order.isQuickCheck && !isTakeaway ? styles.heroLabelQuick : styles.heroLabel}>
          {order.isQuickCheck && !isTakeaway
            ? 'Быстрый чек'
            : order.source === 'yandex_eda'
              ? 'Яндекс'
              : order.source === 'glovo'
                ? 'Glovo'
                : isTakeaway
                  ? 'Самовывоз'
                  : ''}
        </Text>
      </View>
    );

    return (
      <View style={styles.heroRow}>
        {leftContent}
        <View style={styles.heroRight}>
          <Text style={styles.heroAmount}>{formatAmount(order.totalAmount)}</Text>
          <SomIcon size={9} color="#fff" />
        </View>
      </View>
    );
  };

  const hasAlert = order.hasAlert || order.status === 'alert';
  const hasEdit = order.hasEdit;
  const showIcons = hasAlert || hasEdit;

  // ── Info line: time + zone (zone only for table orders) ──
  const infoParts: string[] = [];
  infoParts.push(formatTime(order.openedAt));
  if (order.tableNumber && order.zone) infoParts.push(order.zone);
  const infoLine = infoParts.join(' • ');

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
        {renderHero()}

        {order.waiter ? (
          <Text style={styles.waiterName} numberOfLines={1}>{order.waiter}</Text>
        ) : null}

        {infoLine ? (
          <Text style={styles.infoLine} numberOfLines={1}>{infoLine}</Text>
        ) : null}

        {dishPreview ? (
          <View style={styles.dishPreviewWrap}>
            <Text style={styles.dishPreview} numberOfLines={1}>{dishPreview}</Text>
            <LinearGradient
              colors={['transparent', bgColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.dishFade}
            />
          </View>
        ) : null}

        {showIcons ? (
          <View style={styles.iconsRow}>
            {hasEdit && (
              <Feather name="edit-2" size={16} color="#FFB74D" />
            )}
            {hasAlert && (
              <Feather name="alert-circle" size={16} color="#FF5252" />
            )}
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: theme.borderRadius,
    justifyContent: 'space-between',
    padding: 10,
  },

  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    marginLeft: 8,
  },
  heroTableNum: {
    color: '#fff',
    fontSize: 28,
    fontFamily: theme.fonts.medium,
    lineHeight: 30,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLabel: {
    color: '#ADADAD',
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  heroLabelQuick: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  heroAmount: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  cancelReason: {
    color: '#ADADAD',
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    flexShrink: 1,
    marginLeft: 8,
  },

  waiterName: {
    color: '#ADADAD',
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    marginTop: 10,
  },

  infoLine: {
    color: '#ADADAD',
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },

  dishPreviewWrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  dishPreview: {
    color: '#ADADAD',
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    lineHeight: 19,
  },
  dishFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 50,
  },

  iconsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
});
