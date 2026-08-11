import AsyncStorage from '@react-native-async-storage/async-storage';
import { canonicalJson } from '@lumo/data';

const KEY_PREFIX = '@lumo/pos-command/';

export interface PendingPosCommand {
  operationId: string;
  path: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function storageKey(operationId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(operationId)}`;
}

function parsePending(raw: string): PendingPosCommand {
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('operationId' in value) ||
    !('path' in value) ||
    !('payload' in value) ||
    !('createdAt' in value) ||
    typeof value.operationId !== 'string' ||
    typeof value.path !== 'string' ||
    !value.payload ||
    typeof value.payload !== 'object' ||
    Array.isArray(value.payload) ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error('Stored POS command is invalid');
  }
  return value as PendingPosCommand;
}

export async function persistPosCommand(path: string, payload: unknown): Promise<PendingPosCommand> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('POS command payload must be an object');
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.operationId !== 'string' || record.operationId.length === 0) {
    throw new Error('POS command operationId is required');
  }

  const key = storageKey(record.operationId);
  const existingRaw = await AsyncStorage.getItem(key);
  if (existingRaw) {
    const existing = parsePending(existingRaw);
    if (existing.path !== path || canonicalJson(existing.payload) !== canonicalJson(record)) {
      throw new Error('Pending operationId was already used with another POS command');
    }
    return existing;
  }

  const pending: PendingPosCommand = {
    operationId: record.operationId,
    path,
    payload: record,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(pending));
  return pending;
}

export async function removePosCommand(operationId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(operationId));
}

export async function loadPendingPosCommands(): Promise<PendingPosCommand[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(KEY_PREFIX));
  if (keys.length === 0) return [];
  const entries = await AsyncStorage.multiGet(keys);
  return entries
    .flatMap(([, raw]) => raw === null ? [] : [parsePending(raw)])
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
