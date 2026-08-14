import { EMPLOYEE_PIN_OFFLINE_TTL_MS } from '@lumo/data'
import type { OfflineEmployee } from './employeePin';
export interface UnlockAttemptEvent {
  id: string;
  occurredAt: string;
  outcome: 'success' | 'failure';
  employeeId?: string;
}

let venueIdInMemory: string | null = null;
let cachedAt = 0;
let employeesInMemory: OfflineEmployee[] = [];
let attemptsInMemory: UnlockAttemptEvent[] = [];

function resetForVenue(venueId: string): void {
  if (venueIdInMemory === venueId) return;
  venueIdInMemory = venueId;
  cachedAt = 0;
  employeesInMemory = [];
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


export async function registerUnlockAttempt(
  venueId: string,
  outcome: UnlockAttemptEvent['outcome'],
  employeeId?: string,
  now = Date.now(),
): Promise<void> {
  resetForVenue(venueId);
  attemptsInMemory = [...attemptsInMemory, {
    id: crypto.randomUUID(), occurredAt: new Date(now).toISOString(), outcome,
    ...(employeeId ? { employeeId } : {}),
  }].slice(-100);
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
  attemptsInMemory = [];
}
