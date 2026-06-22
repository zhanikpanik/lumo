import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NotificationIcon } from './Icons';
import { theme } from '../theme/colors';
import { useNotificationStore } from '../store/notificationStore';

interface Props {
  size?: number;
}

export const NotificationBell: React.FC<Props> = ({ size = 28 }) => {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <View style={styles.wrap}>
      <NotificationIcon size={size} color={theme.colors.textPrimary} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.destructive,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 11,
    fontFamily: theme.fonts.bold,
  },
});
