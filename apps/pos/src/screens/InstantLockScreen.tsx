import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EMPLOYEE_PIN_LENGTH } from '@lumo/data';
import { verifyOfflineEmployeePin, type OfflineEmployee } from '../data/employeePin';
import {
  cacheOfflineEmployees,
  loadOfflineEmployees,
  registerUnlockAttempt,
} from '../data/offlinePinState';
import { flushPendingUnlockAttempts } from '../data/unlockAttempts';
import { getInstantClient, getVenueId } from '../data/instant';
import { useUserStore } from '../store/userStore';
import { useInstantShift } from '../store/useInstantShift';
import { logger } from '../utils/logger';
import { theme } from '../theme/colors';
import { resolveShiftEntry } from '../utils/permissions';
import { LockIcon } from '../components/Icons';
import { useNotificationStore } from '../store/notificationStore';

const PIN_LENGTH = EMPLOYEE_PIN_LENGTH;
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

interface LockNavigation {
  goBack(): void;
  replace(screen: 'Orders' | 'OpenShift'): void;
}

interface Props {
  navigation: LockNavigation;
  route?: { params?: { mode?: string } };
}

export function InstantLockScreen({ navigation, route }: Props) {
  const db = getInstantClient();
  const venueId = getVenueId();
  const { data, isLoading: isEmployeesLoading, error: queryError } = db.useQuery({
    venues: {
      $: { where: { id: venueId } },
      employees: { pinCredential: {} },
    },
  });
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  const setCurrentUser = useUserStore((state) => state.setCurrentUser);
  const isLockMode = route?.params?.mode === 'lock';
  const { openShift, isLoading: isShiftLoading } = useInstantShift('authenticated-device');

  const freshEmployees = useMemo<OfflineEmployee[]>(() => {
    const raw = data?.venues?.[0]?.employees ?? [];
    return raw.flatMap((employee) => {
      const credential = Array.isArray(employee.pinCredential)
        ? employee.pinCredential[0]
        : employee.pinCredential;
      if (!credential || employee.status !== 'active') return [];
      return [{
        employeeId: employee.id,
        displayName: employee.displayName,
        role: employee.role,
        status: employee.status,
        pinSalt: credential.pinSalt,
        pinVerifier: credential.pinVerifier,
        credentialsVersion: credential.credentialsVersion,
        expiresAt: new Date(credential.expiresAt).toISOString(),
      }];
    });
  }, [data]);
  const [employees, setEmployees] = useState<OfflineEmployee[]>([]);
  const unseenCount = useNotificationStore((state) => state.unseenIds.size);
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
  }, [pulse, unseenCount]);

  useEffect(() => {
    let cancelled = false;
    void loadOfflineEmployees(venueId).then((cached) => {
      if (!cancelled) setEmployees(cached);
    });
    return () => { cancelled = true; };
  }, [venueId]);

  useEffect(() => {
    if (isEmployeesLoading || queryError) return;
    let cancelled = false;
    void cacheOfflineEmployees(venueId, freshEmployees)
      .then(() => loadOfflineEmployees(venueId))
      .then((cached) => {
        if (!cancelled) setEmployees(cached);
        return flushPendingUnlockAttempts(venueId);
      })
      .catch((cause) => logger.error('instant-pin.cache', cause));
    return () => { cancelled = true; };
  }, [freshEmployees, isEmployeesLoading, queryError, venueId]);

  const submitPin = useCallback(async (candidate: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    try {
      let employee: OfflineEmployee | undefined;
      for (const current of employees) {
        if (await verifyOfflineEmployeePin(current, candidate)) {
          employee = current;
          break;
        }
      }
      if (!employee) {
        await registerUnlockAttempt(venueId, 'failure');
        void flushPendingUnlockAttempts(venueId);
        setError('Неверный PIN');
        setPin('');
        return;
      }

      const shiftEntry = resolveShiftEntry(employee.role, openShift !== null, isShiftLoading);
      if (shiftEntry === 'loading') {
        setError('Проверяем открытую смену. Повторите PIN через секунду.');
        setPin('');
        return;
      }
      await registerUnlockAttempt(venueId, 'success', employee.employeeId);
      void flushPendingUnlockAttempts(venueId);
      if (shiftEntry === 'lock') {
        setError('Смена не открыта. Попросите кассира или менеджера открыть смену.');
        setPin('');
        return;
      }
      setCurrentUser({ id: employee.employeeId, name: employee.displayName, role: employee.role });
      setPin('');
      if (isLockMode && shiftEntry === 'orders') {
        navigation.goBack();
        return;
      }
      navigation.replace(shiftEntry === 'orders' ? 'Orders' : 'OpenShift');
    } catch (err) {
      logger.error('instant-pin.verify', err);
      setError('Не удалось проверить PIN. Повторите попытку.');
      setPin('');
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, [employees, isLockMode, isShiftLoading, navigation, openShift, setCurrentUser, venueId]);

  const handleKey = useCallback((key: string) => {
    if (verifyingRef.current) return;
    setError(null);
    if (key === '⌫') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    setPin((current) => current + key);
    if (pin.length + 1 === PIN_LENGTH) submitPin(pin + key);
  }, [pin, submitPin]);

  const dots = Array.from({ length: PIN_LENGTH }, (_, index) => (
    <View
      key={index}
      style={[
        styles.dot,
        index < pin.length && styles.dotFilled,
        error && styles.dotError,
      ]}
    />
  ));
  const keyRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
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
            {queryError
              ? 'Ошибка загрузки данных. Проверьте соединение.'
              : isEmployeesLoading
                ? 'Загрузка...'
                : isLockMode
                  ? 'Экран заблокирован'
                  : 'Введите PIN-код'}
          </Text>
          <View style={styles.dotsRow}>{dots}</View>
          <Text style={styles.errorText}>{error ?? ' '}</Text>
          {!queryError && (
            <View style={styles.numpad}>
              {keyRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.numRow}>
                  {row.map((key) => key ? (
                    <TouchableOpacity
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={key === '⌫' ? 'Удалить цифру' : key}
                      disabled={verifying}
                      onPress={() => handleKey(key)}
                      style={styles.numKey}
                      activeOpacity={0.6}
                    >
                      <Text style={key === '⌫' ? styles.delText : styles.numText}>{key}</Text>
                    </TouchableOpacity>
                  ) : <View key="empty" style={styles.numKey} />)}
                </View>
              ))}
            </View>
          )}
          {!isEmployeesLoading && !queryError && employees.length === 0 && (
            <Text style={styles.offlineHint}>Планшет не активирован или данные сотрудников ещё не синхронизированы.</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

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
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: theme.fonts.regular,
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
    backgroundColor: theme.colors.destructive,
    borderColor: theme.colors.destructive,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    marginBottom: 16,
    minHeight: 20,
    textAlign: 'center',
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
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  delText: {
    fontSize: 24,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
  },
  offlineHint: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    maxWidth: 360,
    textAlign: 'center',
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
    backgroundColor: theme.colors.warningOrange,
    zIndex: 10,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.white,
  },
  unseenText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
});
