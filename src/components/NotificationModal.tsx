import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BaseModal } from './BaseModal';
import { NotificationIcon } from './Icons';
import { theme } from '../theme/colors';
import { useNotificationStore } from '../store/notificationStore';
import { AppNotification, NotificationType } from '../types';

const TYPE_ICONS: Record<NotificationType, string> = {
  shift_ending: '⏰',
  order_stuck: '⏳',
  low_stock: '📦',
  sync_error: '⚠️',
  subscription: '💳',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  shift_ending: 'Смена',
  order_stuck: 'Заказ',
  low_stock: 'Склад',
  sync_error: 'Ошибка',
  subscription: 'Подписка',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectOrder?: (orderId: string) => void;
}

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `${hh}:${mm}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
  } catch {
    return '';
  }
};

export const NotificationModal: React.FC<Props> = ({ visible, onClose, onSelectOrder }) => {
  const { notifications, unreadCount, markAllRead } = useNotificationStore();

  const handleClose = () => {
    markAllRead();
    onClose();
  };

  const handlePress = (notif: AppNotification) => {
    if (notif.orderId && onSelectOrder) {
      onSelectOrder(notif.orderId);
    }
    handleClose();
  };

  return (
    <BaseModal visible={visible} onClose={handleClose} title={`Уведомления${unreadCount > 0 ? ` (${unreadCount})` : ''}`} width="40%">
      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <NotificationIcon size={32} color={theme.colors.textDisabled} />
          <Text style={styles.emptyText}>Нет уведомлений</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notifications.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[styles.item, !n.read && styles.itemUnread]}
              onPress={() => handlePress(n)}
              activeOpacity={0.7}
            >
              <Text style={styles.itemIcon}>{TYPE_ICONS[n.type] || '📌'}</Text>
              <View style={styles.itemBody}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.itemTime}>{formatTime(n.createdAt)}</Text>
                </View>
                <Text style={styles.itemMessage} numberOfLines={2}>{n.message}</Text>
                <Text style={styles.itemType}>{TYPE_LABELS[n.type] || n.type}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    color: theme.colors.textDisabled,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  list: {
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceLight,
  },
  itemUnread: {
    backgroundColor: theme.colors.editActiveBg,
    marginHorizontal: -4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  itemIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    flex: 1,
    marginRight: 8,
  },
  itemTime: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontFamily: theme.fonts.regular,
  },
  itemMessage: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontFamily: theme.fonts.regular,
    lineHeight: 19,
  },
  itemType: {
    color: theme.colors.textDisabled,
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
    marginTop: 6,
  },
});
