import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';

/** Subscribe to transitions toward connectivity; unsubscribe on return fn. */
export function subscribeConnectivity(onReachable: () => void): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const fn = () => onReachable();
    window.addEventListener('online', fn);
    return () => window.removeEventListener('online', fn);
  }

  let sub: NetInfoSubscription | undefined;
  sub = NetInfo.addEventListener((state) => {
    if (state.isConnected ?? true) {
      onReachable();
    }
  });
  return () => {
    sub?.();
  };
}

/**
 * Subscribe to transitions toward foreground: tab focus on web,
 * AppState 'active' on native. Используется как дополнительный триггер для
 * прокачки outbox (после возврата к приложению пробуем дослать застрявшие
 * операции, не дожидаясь interval-таймера).
 */
export function subscribeForeground(onForeground: () => void): () => void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const fn = () => {
      if (!document.hidden) onForeground();
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }

  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') onForeground();
  });
  return () => sub.remove();
}

/** True when the app/tab is currently in foreground (best-effort, sync). */
export function isAppActive(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return !document.hidden;
  }
  return AppState.currentState === 'active';
}
