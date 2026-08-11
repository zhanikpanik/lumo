import { EMPLOYEE_PIN_OFFLINE_TTL_MS } from '@lumo/data'
import type { OfflineEmployee } from './employeePin';
export interface UnlockAttemptEvent {
  id: string;
  occurredAt: string;
  outcome: 'success' | 'failure';
  employeeId?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
let venueIdInMemory: string | null = null;
let cachedAt = 0;
let employeesInMemory: OfflineEmployee[] = [];
let failedAttempts = 0;
let lockedUntil: string | null = null;
let attemptsInMemory: UnlockAttemptEvent[] = [];

function resetForVenue(venueId: string): void {
  if (venueIdInMemory === venueId) return;
  venueIdInMemory = venueId;
  cachedAt = 0;
  employeesInMemory = [];
  failedAttempts = 0;
  lockedUntil = null;
  attemptsInMemory = [];
}

export async function cacheOfflineEmployees(venueId: string, employees: OfflineEmployee[], now = Date.now()): Promise<void> {
  resetForVenue(venueId);
  cachedAt = now;
  employeesInMemory = employees;
}

export async function loadOfflineEmployees(venueId: string, now = Date.now()): Promise<OfflineEmployee[]> {
  resetForVenue(venueId);
  if (now - cachedAt > EMPLOYEE_PIN_OFFLINE_TTL_MS) return [];
  return employeesInMemory.filter((employee) => Date.parse(employee.expiresAt) > now && employee.status === 'active');
}

export async function unlockLockedUntil(venueId: string, now = Date.now()): Promise<string | null> {
  resetForVenue(venueId);
  return lockedUntil && Date.parse(lockedUntil) > now ? lockedUntil : null;
}

export async function registerUnlockAttempt(
  venueId: string,
  outcome: UnlockAttemptEvent['outcome'],
  employeeId?: string,
  now = Date.now(),
): Promise<string | null> {
  resetForVenue(venueId);
  attemptsInMemory = [...attemptsInMemory, {
    id: crypto.randomUUID(), occurredAt: new Date(now).toISOString(), outcome,
    ...(employeeId ? { employeeId } : {}),
  }].slice(-100);
  if (outcome === 'success') {
    failedAttempts = 0;
    lockedUntil = null;
  } else {
    const priorLockExpired = lockedUntil && Date.parse(lockedUntil) <= now;
    failedAttempts = priorLockExpired ? 1 : failedAttempts + 1;
    lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;
  }
  return lockedUntil;
}

export async function pendingUnlockAttempts(venueId: string): Promise<UnlockAttemptEvent[]> {
  resetForVenue(venueId);
  return attemptsInMemory;
}

export async function acknowledgeUnlockAttempts(venueId: string, ids: string[]): Promise<void> {
  resetForVenue(venueId);
  const acknowledged = new Set(ids);
  attemptsInMemory = attemptsInMemory.filter((attempt) => !acknowledged.has(attempt.id));
}

export async function clearOfflinePinState(): Promise<void> {
  venueIdInMemory = null;
  cachedAt = 0;
  employeesInMemory = [];
  failedAttempts = 0;
  lockedUntil = null;
  attemptsInMemory = [];
}
