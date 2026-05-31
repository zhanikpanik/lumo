import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { theme } from '../theme/colors';
import { LockIcon } from '../components/Icons';
import { useVenueStore } from '../store/venueStore';
import { useShiftStore } from '../store/shiftStore';
import { useNotificationStore } from '../store/notificationStore';

const PIN_LENGTH = 4;

interface Props {
  navigation: any;
  route?: any;
}

export const LockScreen: React.FC<Props> = ({ navigation, route }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const waiters = useVenueStore((s) => s.waiters);
  const fetchVenue = useVenueStore((s) => s.fetchVenue);
  const setCurrentUser = useShiftStore((s) => s.setCurrentUser);
  const currentUser = useShiftStore((s) => s.currentUser);

  // If coming from lock button (already logged in), just need any valid PIN
  const isLockMode = route?.params?.mode === 'lock';

  const handleDigit = useCallback(async (digit: string) => {
    setError(false);
    const newPin = pin + digit;

    if (newPin.length === PIN_LENGTH) {
      // Make sure waiters are loaded
      let currentWaiters = waiters;
      if (currentWaiters.length === 0) {
        setLoading(true);
        await fetchVenue();
        currentWaiters = useVenueStore.getState().waiters;
        setLoading(false);
      }

      // Find user by PIN
      const user = currentWaiters.find(w => w.pin === newPin);

      if (user) {
        setPin('');
        setCurrentUser({ id: user.id, name: user.name, role: user.role });

        if (isLockMode) {
          navigation.goBack();
        } else {
          // Check shift optimistically: navigate immediately, verify in background.
          // If no shift is found, the App-level useEffect will redirect to OpenShift.
          useShiftStore.getState().fetchOpenShift().catch(() => {});
          navigation.replace('Orders');
        }
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      }
    } else {
      setPin(newPin);
    }
  }, [pin, navigation, waiters, isLockMode]);

  const handleDelete = useCallback(() => {
    setError(false);
    setPin((p) => p.slice(0, -1));
  }, []);

  const unseenCount = useNotificationStore((s) => s.unseenIds.size);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (unseenCount === 0) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [unseenCount, pulse]);

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <View
      key={i}
      style={[
        styles.dot,
        i < pin.length && styles.dotFilled,
        error && styles.dotError,
      ]}
    />
  ));

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      {unseenCount > 0 && (
        <Animated.View style={[styles.unseenChip, { opacity: pulse }]}>
          <View style={styles.unseenDot} />
          <Text style={styles.unseenText}>Новых заказов: {unseenCount}</Text>
        </Animated.View>
      )}
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <LockIcon size={48} color={theme.colors.textSecondary} />
          </View>

          <Text style={styles.title}>r_keeper</Text>
          <Text style={styles.subtitle}>
            {loading ? 'Загрузка...' : isLockMode ? 'Экран заблокирован' : 'Введите PIN-код'}
          </Text>

          <View style={styles.dotsRow}>{dots}</View>

          {error && <Text style={styles.errorText}>Неверный PIN</Text>}

          <View style={styles.numpad}>
            {keys.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.numRow}>
                {row.map((key) => {
                  if (key === '') {
                    return <View key="empty" style={styles.numKey} />;
                  }
                  if (key === 'del') {
                    return (
                      <TouchableOpacity
                        key="del"
                        style={styles.numKey}
                        onPress={handleDelete}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.delText}>⌫</Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.numKey}
                      onPress={() => handleDigit(key)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.numText}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    height: 30,
    alignItems: 'center',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: theme.colors.tabActive,
    borderColor: theme.colors.tabActive,
  },
  dotError: {
    backgroundColor: '#D32F2F',
    borderColor: '#D32F2F',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    height: 20,
  },
  numpad: {
    marginTop: 16,
  },
  numRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  numKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numText: {
    fontSize: 28,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  delText: {
    fontSize: 24,
    color: theme.colors.textSecondary,
  },
  unseenChip: {
    position: 'absolute',
    top: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: '#FF7A45',
    zIndex: 10,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  unseenText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
