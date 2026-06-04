import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { theme } from '../theme/colors';

const POPOVER_WIDTH = 280;
const ARROW_SIZE = 10;

interface MenuItem {
  id: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenShift: () => void;
  onOpenChecksArchive: () => void;
  onOpenCash: () => void;
  onCloseShift: () => void;
  onCashCollection: () => void;
  onCashIn: () => void;
  onCashOut: () => void;
  canCloseShift?: boolean;
  canCashTransaction?: boolean;
  onLogout: () => void;
}

export const FunctionsModal: React.FC<Props> = ({
  visible,
  onClose,
  onOpenShift,
  onOpenChecksArchive,
  onOpenCash,
  onCloseShift,
  onCashCollection,
  onCashIn,
  onCashOut,
  canCloseShift = true,
  canCashTransaction = true,
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

  const groups: MenuItem[][] = [
    [
      {
        id: 'shift',
        label: 'Смена',
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
        disabled: !canCloseShift,
        onPress: () => { onClose(); setTimeout(onCloseShift, 200); },
      },
    ],
    [
      {
        id: 'cash',
        label: 'Касса',
        onPress: () => { onClose(); setTimeout(onOpenCash, 200); },
      },
      {
        id: 'cashIn',
        label: 'Внесение в кассу',
        disabled: !canCashTransaction,
        onPress: () => { onClose(); setTimeout(onCashIn, 200); },
      },
      {
        id: 'cashOut',
        label: 'Изъятие из кассы',
        disabled: !canCashTransaction,
        onPress: () => { onClose(); setTimeout(onCashOut, 200); },
      },
      {
        id: 'cashDrawer',
        label: 'Инкассация',
        onPress: () => { onClose(); setTimeout(onCashCollection, 200); },
      },
    ],
    [
      {
        id: 'devices',
        label: 'Принтеры и устройства',
        disabled: true,
      },
      {
        id: 'clearCache',
        label: 'Обновить данные',
        disabled: true,
      },
    ],
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
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Overlay — subtle, not heavy */}
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Popover positioned above the ≡ button (bottom-left) */}
      <Animated.View
        style={[
          styles.popover,
          {
            opacity: opacityAnim,
            transform: [
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Menu groups */}
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
                <Text
                  style={[
                    styles.menuLabel,
                    item.disabled && styles.menuLabelDisabled,
                    item.destructive && styles.menuLabelDestructive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Arrow pointing down to ≡ button */}
        <View style={styles.arrow} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  popover: {
    position: 'absolute',
    bottom: 84,
    left: 14,
    width: POPOVER_WIDTH,
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    paddingVertical: 4,
    // iOS-style shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
  },
  group: {
    backgroundColor: '#2C2C2E',
    borderRadius: 0,
    overflow: 'hidden',
  },
  groupSpacing: {
    borderBottomWidth: 8,
    borderBottomColor: '#1C1C1E',
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuItemDisabled: {
    opacity: 0.35,
  },
  menuLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: theme.fonts.regular,
  },
  menuLabelDisabled: {
    color: '#8E8E93',
  },
  menuLabelDestructive: {
    color: '#FF453A',
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
    borderTopColor: '#2C2C2E',
  },
});
