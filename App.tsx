import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { LogBox, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { PosScreen } from './src/screens/PosScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { PaidCheckScreen } from './src/screens/PaidCheckScreen';
import { TablePickerScreen } from './src/screens/TablePickerScreen';
import { LockScreen } from './src/screens/LockScreen';
import { OpenShiftScreen } from './src/screens/OpenShiftScreen';
import { useShiftStore } from './src/store/shiftStore';
import { useVenueStore } from './src/store/venueStore';
import { useMenuStore } from './src/store/menuStore';
import { useOrderStore } from './src/store/orderStore';
import { useOrderRealtime } from './src/hooks/useOrderRealtime';
import { useSyncOutboxStore } from './src/store/syncOutboxStore';
import { useDeadLetterStore } from './src/store/deadLetterStore';
import { DeadLetterModal } from './src/components/DeadLetterModal';
import { subscribeConnectivity, subscribeForeground, isAppActive } from './src/utils/network';

// Ignore specific warnings coming from react-native-web or navigation libraries
LogBox.ignoreLogs([
  'props.pointerEvents is deprecated',
  'Blocked aria-hidden on an element',
]);

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef<any>();
const SHIFT_REQUIRED_ROUTES = ['Orders', 'Pos', 'Payment', 'PaidCheck', 'TablePicker'];

// Старше этого порога — считаем очередь «застрявшей» и красим баннер в красный.
const OUTBOX_STALE_MS = 5 * 60 * 1000;

export default function App() {
  const currentUser = useShiftStore((s) => s.currentUser);
  const hasShift = useShiftStore((s) => s.currentShift !== null);
  const currentShiftId = useShiftStore((s) => s.currentShift?.id ?? null);
  const lastSyncError = useShiftStore((s) => s.lastSyncError);
  const isSyncing = useShiftStore((s) => s.isSyncing);
  const clearSyncError = useShiftStore((s) => s.clearSyncError);
  const retryShiftSync = useShiftStore((s) => s.retryShiftSync);
  const fetchVenue = useVenueStore((s) => s.fetchVenue);

  const fetchMenu = useMenuStore((s) => s.fetchMenu);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);

  const outboxEvents = useSyncOutboxStore((s) => s.events);
  const outboxSyncing = useSyncOutboxStore((s) => s.syncing);
  const outboxCount = outboxEvents.length;
  const oldestEventAge =
    outboxCount > 0 ? Date.now() - new Date(outboxEvents[0].createdAt).getTime() : 0;
  const outboxStale = oldestEventAge > OUTBOX_STALE_MS;

  const deadLetters = useDeadLetterStore((s) => s.items);
  const deadLetterCount = deadLetters.length;
  const [deadLetterModalVisible, setDeadLetterModalVisible] = useState(false);

  // Load menu + venue once on app start
  useEffect(() => {
    fetchVenue();
    fetchMenu();
  }, []);

  // Orders are shift-scoped: reload whenever shift changes.
  useEffect(() => {
    fetchOrders();
  }, [currentShiftId]);

  // Live order updates from other devices
  useOrderRealtime();

  // Offline inventory consumption outbox: hydrate on start, flush на любой
  // полезный триггер — восстановление сети, возврат во foreground и
  // страховочный interval (только пока app active, чтобы не дрейнить батарею).
  useEffect(() => {
    const init = async () => {
      await useSyncOutboxStore.getState().hydrate();
      await useSyncOutboxStore.getState().flush();
      await useDeadLetterStore.getState().refresh();
    };
    void init();

    const flush = () => {
      void useSyncOutboxStore.getState().flush();
      void useDeadLetterStore.getState().refresh();
    };
    const unsubConnectivity = subscribeConnectivity(flush);
    const unsubForeground = subscribeForeground(flush);
    const intervalId = setInterval(() => {
      if (isAppActive()) flush();
    }, 60_000);

    return () => {
      unsubConnectivity();
      unsubForeground();
      clearInterval(intervalId);
    };
  }, []);

  // Hard runtime guard: app is not usable without open shift.
  useEffect(() => {
    if (!navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute()?.name;
    if (!hasShift && route && SHIFT_REQUIRED_ROUTES.includes(route)) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: 'OpenShift' }],
      });
    }
  }, [hasShift]);

  // Determine initial route
  const getInitialRoute = () => {
    if (!currentUser) return 'Lock';
    if (!hasShift) return 'OpenShift';
    return 'Orders';
  };

  return (
    <NavigationContainer ref={navigationRef}>
      {lastSyncError && (
        <View style={styles.syncErrorBanner}>
          <Text style={styles.syncErrorText} numberOfLines={1}>
            Ошибка синхронизации: {lastSyncError}
          </Text>
          <TouchableOpacity onPress={retryShiftSync} style={styles.syncErrorRetryBtn}>
            <Text style={styles.syncErrorCloseText}>Повторить</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearSyncError} style={styles.syncErrorCloseBtn}>
            <Text style={styles.syncErrorCloseText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      )}
      {isSyncing && !lastSyncError && (
        <View style={styles.syncingBanner}>
          <Text style={styles.syncingText}>Синхронизация...</Text>
        </View>
      )}
      {outboxCount > 0 && (
        <TouchableOpacity
          onPress={() => void useSyncOutboxStore.getState().flush()}
          style={[styles.outboxBanner, outboxStale && styles.outboxBannerStale]}
          activeOpacity={0.7}
        >
          <Text style={styles.outboxBannerText} numberOfLines={1}>
            {outboxSyncing
              ? `Досылаем операции склада... (${outboxCount})`
              : outboxStale
                ? `Очередь застряла: ${outboxCount}. Нажмите для повтора`
                : `Необсчитанных операций склада: ${outboxCount}. Нажмите для повтора`}
          </Text>
        </TouchableOpacity>
      )}
      {deadLetterCount > 0 && (
        <TouchableOpacity
          onPress={() => setDeadLetterModalVisible(true)}
          style={styles.deadLetterBanner}
          activeOpacity={0.7}
        >
          <Text style={styles.deadLetterBannerText} numberOfLines={1}>
            Требуется внимание: {deadLetterCount} зависших операций склада. Открыть.
          </Text>
        </TouchableOpacity>
      )}
      <DeadLetterModal
        visible={deadLetterModalVisible}
        onClose={() => setDeadLetterModalVisible(false)}
      />
      <Stack.Navigator 
        initialRouteName={getInitialRoute()}
        screenOptions={{
          headerShown: false,
          animation: 'none', 
        }}
      >
        <Stack.Screen name="Lock" component={LockScreen} />
        <Stack.Screen name="OpenShift" component={OpenShiftScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="Pos" component={PosScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="PaidCheck" component={PaidCheckScreen} />
        <Stack.Screen name="TablePicker" component={TablePickerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  syncErrorBanner: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 9999,
    height: 40,
    backgroundColor: '#5A1010',
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncErrorText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  syncErrorCloseBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncErrorRetryBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncErrorCloseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  syncingBanner: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 9998,
    height: 32,
    backgroundColor: '#254A62',
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  outboxBanner: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 9997,
    height: 36,
    backgroundColor: '#7A5A00',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  outboxBannerStale: {
    backgroundColor: '#7A1010',
  },
  outboxBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  deadLetterBanner: {
    position: 'absolute',
    top: 48,
    left: 8,
    right: 8,
    zIndex: 9996,
    height: 36,
    backgroundColor: '#B71C1C',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  deadLetterBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
