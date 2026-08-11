import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { EMPLOYEE_PIN_LENGTH } from '@lumo/data';
import { verifyOfflineEmployeePin, type OfflineEmployee } from '../data/employeePin';
import {
  cacheOfflineEmployees,
  loadOfflineEmployees,
  registerUnlockAttempt,
  unlockLockedUntil,
} from '../data/offlinePinState';
import { flushPendingUnlockAttempts } from '../data/unlockAttempts';
import { getInstantClient, getVenueId } from '../data/instant';
import { useUserStore } from '../store/userStore';
import { useInstantShift } from '../store/useInstantShift';
import { logger } from '../utils/logger';
import { theme } from '../theme/colors';

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
  const { openShift } = useInstantShift('authenticated-device');

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
    void NetInfo.fetch().then(async (network) => {
      if (!network.isConnected) return;
      await cacheOfflineEmployees(venueId, freshEmployees);
      if (!cancelled) setEmployees(await loadOfflineEmployees(venueId));
      await flushPendingUnlockAttempts(venueId);
    }).catch((cause) => logger.error('instant-pin.cache', cause));
    return () => { cancelled = true; };
  }, [freshEmployees, isEmployeesLoading, queryError, venueId]);

  const submitPin = useCallback(async (candidate: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    try {
      const lockedUntil = await unlockLockedUntil(venueId);
      if (lockedUntil) {
        setError(`Слишком много попыток. Повторите после ${new Date(lockedUntil).toLocaleTimeString()}.`);
        setPin('');
        return;
      }
      let employee: OfflineEmployee | undefined;
      for (const current of employees) {
        if (await verifyOfflineEmployeePin(current, candidate)) {
          employee = current;
          break;
        }
      }
      if (!employee) {
        const newLock = await registerUnlockAttempt(venueId, 'failure');
        void flushPendingUnlockAttempts(venueId);
        if (newLock) {
          setError(`Слишком много попыток. Повторите после ${new Date(newLock).toLocaleTimeString()}.`);
          setPin('');
          return;
        }
        setError('Неверный PIN');
        setPin('');
        return;
      }

      await registerUnlockAttempt(venueId, 'success', employee.employeeId);
      void flushPendingUnlockAttempts(venueId);
      setCurrentUser({ id: employee.employeeId, name: employee.displayName, role: employee.role });
      setPin('');
      if (isLockMode) {
        navigation.goBack();
        return;
      }
      // useInstantShift already provides openShift reactively — no manual setState needed
      navigation.replace(openShift ? 'Orders' : 'OpenShift');
    } catch (err) {
      logger.error('instant-pin.verify', err);
      setError('Не удалось проверить PIN. Повторите попытку.');
      setPin('');
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, [employees, isLockMode, navigation, openShift, setCurrentUser, venueId]);

  const handleKey = useCallback((key: string) => {
    if (verifyingRef.current) return;
    if (key === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= PIN_LENGTH) return;
    setPin((p) => p + key);
    if (pin.length + 1 === PIN_LENGTH) submitPin(pin + key);
  }, [pin, submitPin]);


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Alto Coffee</Text>
        {queryError ? (
          <Text style={styles.subtitle}>Ошибка загрузки данных. Проверьте соединение.</Text>
        ) : (
          <Text style={styles.subtitle}>{isEmployeesLoading ? 'Загрузка сотрудников…' : 'Введите PIN'}</Text>
        )}
        <View style={styles.dots}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <View key={index} style={[styles.dot, pin.length > index && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.error}>{error ?? ' '}</Text>
        {!queryError && (
          <View style={styles.keypad}>
            {keys.map((key, index) => key ? (
              <TouchableOpacity
                key={`${key}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={key === '⌫' ? 'Удалить цифру' : key}
                disabled={verifying}
                onPress={() => handleKey(key)}
                style={styles.key}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            ) : <View key={`empty-${index}`} style={styles.key} />)}
          </View>
        )}
        {!isEmployeesLoading && !queryError && employees.length === 0 && (
          <Text style={styles.offlineHint}>Планшет не активирован или данные сотрудников ещё не синхронизированы.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 32 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 17, marginTop: 8 },
  dots: { flexDirection: 'row', gap: 14, marginTop: 36 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.surfaceLight },
  dotActive: { backgroundColor: theme.colors.accent },
  error: { color: theme.colors.destructiveLight, fontFamily: theme.fonts.medium, height: 24, marginTop: 14 },
  keypad: { width: 330, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  key: { alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 10, height: 66, justifyContent: 'center', width: 103 },
  keyText: { color: theme.colors.textPrimary, fontFamily: theme.fonts.medium, fontSize: 24 },
  offlineHint: { color: theme.colors.warning, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 28, textAlign: 'center' },
});
