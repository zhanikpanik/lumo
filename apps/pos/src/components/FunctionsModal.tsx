import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { theme } from '../theme/colors';
import { can, isAdmin, UserRole } from '../utils/permissions';

const POPOVER_WIDTH = 280;
const ARROW_SIZE = 10;

interface MenuItem {
  id: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  subtitle?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  role: UserRole;
  onOpenShift: () => void;
  onOpenChecksArchive: () => void;
  onOpenCash: () => void;
  onCloseShift: () => void;
  onLogout: () => void;
}

export const FunctionsModal: React.FC<Props> = ({
  visible,
  onClose,
  role,
  onOpenShift,
  onOpenChecksArchive,
  onOpenCash,
  onCloseShift,
  onLogout,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [shouldRender, setShouldRender] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => setShouldRender(false));
    }
  }, [visible]);

  if (!shouldRender) return null;

  const isWaiter = role === 'waiter';
  const canCash = can(role, 'cashTransaction');
  const canClose = can(role, 'closeShift');

  const groups: MenuItem[][] = [
    // Group 1: Shift & Orders
    [
      {
        id: 'shift',
        label: 'Смена',
        subtitle: !isWaiter ? undefined : 'Только кассир',
        onPress: () => { onClose(); setTimeout(onOpenShift, 200); },
      },
      {
        id: 'checksArchive',
        label: 'Архив чеков',
        onPress: () => { onClose(); setTimeout(onOpenChecksArchive, 200); },
      },
      {
        id: 'closeShift',
        label: 'Закрыть смену',
        subtitle: !canClose ? 'Только кассир' : undefined,
        disabled: !canClose,
        onPress: () => { onClose(); setTimeout(onCloseShift, 200); },
      },
    ],
    // Group 2: Cash
    [
      {
        id: 'cash',
        label: 'Касса',
        subtitle: !canCash ? 'Только кассир' : undefined,
        disabled: !canCash,
        onPress: () => { onClose(); setTimeout(onOpenCash, 200); },
      },
    ],
    // Group 3: Logout
    [
      {
        id: 'logout',
        label: 'Выход',
        destructive: true,
        onPress: () => { onClose(); setTimeout(onLogout, 200); },
      },
    ],
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: visible ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.popover,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {groups.map((group, gi) => (
          <View key={gi} style={[styles.group, gi < groups.length - 1 && styles.groupSpacing]}>
            {group.map((item, ii) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  ii < group.length - 1 && styles.menuItemBorder,
                  item.disabled && styles.menuItemDisabled,
                ]}
                onPress={item.onPress}
                disabled={item.disabled}
                activeOpacity={0.6}
              >
                <View style={styles.menuItemContent}>
                  <Text
                    style={[
                      styles.menuLabel,
                      item.disabled && styles.menuLabelDisabled,
                      item.destructive && styles.menuLabelDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={styles.arrow} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlayLight,
  },
  popover: {
    position: 'absolute',
    bottom: 84,
    left: 14,
    width: POPOVER_WIDTH,
    backgroundColor: 'transparent',
    borderRadius: 14,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    elevation: 20,
  },
  group: {
    backgroundColor: theme.colors.iOSSurface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  groupSpacing: {
    marginBottom: 8,
  },
  menuItem: {
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.pageDivider,
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 16,
    color: theme.colors.white,
    fontFamily: theme.fonts.regular,
  },
  menuLabelDisabled: {
    color: theme.colors.iOSTextSecondary,
  },
  menuLabelDestructive: {
    color: theme.colors.iOSDestructive,
  },
  menuSubtitle: {
    fontSize: 16,
    color: theme.colors.iOSTextSecondary,
    fontFamily: theme.fonts.regular,
  },
  arrow: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.colors.iOSSurface,
  },
});
