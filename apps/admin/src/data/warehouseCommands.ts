import { canonicalJson } from '@lumo/data';
import { getInstantClient } from './instant';

const STORAGE_PREFIX = '@lumo/admin-warehouse-command/';
export const ACTIVATION_WORKER_URL = import.meta.env.VITE_ACTIVATION_WORKER_URL?.replace(/\/$/, '');

interface StoredWarehouseCommand {
  operationId: string;
  venueId: string;
  kind: string;
  payload: unknown;
  createdAt: string;
}

export class WarehouseCommandError extends Error {
  readonly code: string | undefined;
  readonly retryable: boolean;
  constructor(
    message: string,
    code: string | undefined,
    retryable: boolean,
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = 'WarehouseCommandError';
  }
}

function storageKey(command: Pick<StoredWarehouseCommand, 'venueId' | 'operationId'>): string {
  return `${STORAGE_PREFIX}${command.venueId}:${command.operationId}`;
}

function persist(command: StoredWarehouseCommand): void {
  localStorage.setItem(storageKey(command), canonicalJson(command));
}

function remove(command: Pick<StoredWarehouseCommand, 'venueId' | 'operationId'>): void {
  localStorage.removeItem(storageKey(command));
}

function pendingCommands(): StoredWarehouseCommand[] {
  const commands: StoredWarehouseCommand[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      commands.push(JSON.parse(raw) as StoredWarehouseCommand);
    } catch {
      localStorage.removeItem(key);
    }
  }
  return commands.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function getAdminBearerToken(): Promise<string> {
  const auth = await getInstantClient().getAuth();
  if (!auth?.refresh_token) throw new WarehouseCommandError('Admin is not authenticated', 'unauthenticated', false);
  return auth.refresh_token;
}

async function send<Result>(command: StoredWarehouseCommand): Promise<Result> {
  if (!ACTIVATION_WORKER_URL) {
    throw new WarehouseCommandError('VITE_ACTIVATION_WORKER_URL is required', 'missing_worker_url', false);
  }
  const token = await getAdminBearerToken();
  let response: Response;
  try {
    response = await fetch(`${ACTIVATION_WORKER_URL}/v1/admin/warehouse-commands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
  } catch (cause) {
    throw new WarehouseCommandError(
      cause instanceof Error ? cause.message : 'Warehouse command request failed',
      'network_error',
      true,
    );
  }
  const body = await response.json().catch(() => null) as Result | null;
  const errorBody = body && typeof body === 'object'
    ? body as { error?: unknown; code?: unknown; retryable?: unknown }
    : null;
  if (response.ok) {
    remove(command);
    return body as Result;
  }
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || errorBody?.retryable === true;
  if (!retryable) remove(command);
  throw new WarehouseCommandError(
    typeof errorBody?.error === 'string' ? errorBody.error : 'Warehouse command failed',
    typeof errorBody?.code === 'string' ? errorBody.code : undefined,
    retryable,
  );
}

export async function executeWarehouseCommand<Result>(
  kind: string,
  operationId: string,
  venueId: string,
  payload: unknown,
): Promise<Result> {
  const command: StoredWarehouseCommand = { operationId, venueId, kind, payload, createdAt: new Date().toISOString() };
  persist(command);
  try {
    return await send<Result>(command);
  } catch (error) {
    if (!(error instanceof WarehouseCommandError) || !error.retryable) throw error;
    return send<Result>(command);
  }
}

export async function flushPendingWarehouseCommands(): Promise<{ completed: number; remaining: number }> {
  let completed = 0;
  for (const command of pendingCommands()) {
    try {
      await send(command);
      completed += 1;
    } catch (error) {
      if (error instanceof WarehouseCommandError && error.retryable) break;
    }
  }
  return { completed, remaining: pendingCommands().length };
}
