import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { EMPLOYEE_PIN_OFFLINE_TTL_MS } from '@lumo/data'
import type { OfflineEmployee } from './employeePin';

const STATE_KEY = 'lumo.offline-pin-state.v1';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface UnlockAttemptEvent {
  id: string;
  occurredAt: string;
  outcome: 'success' | 'failure';
  employeeId?: string;
}

interface OfflinePinState {
  venueId: string;
  cachedAt: string | null;
  employees: OfflineEmployee[];
  failedAttempts: number;
  lockedUntil: string | null;
  pendingAttempts: UnlockAttemptEvent[];
}

function emptyState(venueId: string): OfflinePinState {
  return { venueId, cachedAt: null, employees: [], failedAttempts: 0, lockedUntil: null, pendingAttempts: [] };
}

async function loadState(venueId: string): Promise<OfflinePinState> {
  const raw = await SecureStore.getItemAsync(STATE_KEY);
  if (!raw) return emptyState(venueId);
  try {
    const parsed = JSON.parse(raw) as OfflinePinState;
    return parsed.venueId === venueId ? parsed : emptyState(venueId);
  } catch {
    await SecureStore.deleteItemAsync(STATE_KEY);
    return emptyState(venueId);
  }
}

async function saveState(state: OfflinePinState): Promise<void> {
  await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(state), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function cacheOfflineEmployees(venueId: string, employees: OfflineEmployee[], now = Date.now()): Promise<void> {
  const state = await loadState(venueId);
  await saveState({ ...state, cachedAt: new Date(now).toISOString(), employees });
}

export async function loadOfflineEmployees(venueId: string, now = Date.now()): Promise<OfflineEmployee[]> {
  const state = await loadState(venueId);
  if (!state.cachedAt || now - Date.parse(state.cachedAt) > EMPLOYEE_PIN_OFFLINE_TTL_MS) return [];
  return state.employees.filter((employee) => Date.parse(employee.expiresAt) > now && employee.status === 'active');
}

export async function unlockLockedUntil(venueId: string, now = Date.now()): Promise<string | null> {
  const state = await loadState(venueId);
  if (!state.lockedUntil || Date.parse(state.lockedUntil) <= now) return null;
  return state.lockedUntil;
}

export async function registerUnlockAttempt(
  venueId: string,
  outcome: UnlockAttemptEvent['outcome'],
  employeeId?: string,
  now = Date.now(),
): Promise<string | null> {
  const state = await loadState(venueId);
  const event: UnlockAttemptEvent = {
    id: randomUUID(),
    occurredAt: new Date(now).toISOString(),
    outcome,
    ...(employeeId ? { employeeId } : {}),
  };
  if (outcome === 'success') {
    state.failedAttempts = 0;
    state.lockedUntil = null;
  } else {
    const priorLockExpired = state.lockedUntil && Date.parse(state.lockedUntil) <= now;
    state.failedAttempts = priorLockExpired ? 1 : state.failedAttempts + 1;
    state.lockedUntil = state.failedAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now + LOCKOUT_MS).toISOString()
      : null;
  }
  state.pendingAttempts = [...state.pendingAttempts, event].slice(-100);
  await saveState(state);
  return state.lockedUntil;
}

export async function pendingUnlockAttempts(venueId: string): Promise<UnlockAttemptEvent[]> {
  return (await loadState(venueId)).pendingAttempts;
}

export async function acknowledgeUnlockAttempts(venueId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const state = await loadState(venueId);
  const acknowledged = new Set(ids);
  state.pendingAttempts = state.pendingAttempts.filter((attempt) => !acknowledged.has(attempt.id));
  await saveState(state);
}

export async function clearOfflinePinState(): Promise<void> {
  await SecureStore.deleteItemAsync(STATE_KEY);
}
