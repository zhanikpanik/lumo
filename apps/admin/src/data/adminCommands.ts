import { canonicalJson } from '@lumo/data';
import { ACTIVATION_WORKER_URL, getAdminBearerToken } from './warehouseCommands';

const STORAGE_PREFIX = '@lumo/admin-operational-command/';

interface StoredAdminCommand {
  operationId: string;
  venueId: string;
  kind: string;
  payload: unknown;
  createdAt: string;
}

export class AdminCommandError extends Error {
  readonly code: string | undefined;
  readonly retryable: boolean;

  constructor(message: string, code: string | undefined, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = 'AdminCommandError';
  }
}

function storageKey(command: Pick<StoredAdminCommand, 'venueId' | 'operationId'>): string {
  return `${STORAGE_PREFIX}${command.venueId}:${command.operationId}`;
}

function persist(command: StoredAdminCommand): void {
  localStorage.setItem(storageKey(command), canonicalJson(command));
}

function remove(command: Pick<StoredAdminCommand, 'venueId' | 'operationId'>): void {
  localStorage.removeItem(storageKey(command));
}

async function send<Result>(command: StoredAdminCommand): Promise<Result> {
  if (!ACTIVATION_WORKER_URL) {
    throw new AdminCommandError('VITE_ACTIVATION_WORKER_URL is required', 'missing_worker_url', false);
  }
  const token = await getAdminBearerToken();
  let response: Response;
  try {
    response = await fetch(`${ACTIVATION_WORKER_URL}/v1/admin/operational-commands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
  } catch (cause) {
    throw new AdminCommandError(
      cause instanceof Error ? cause.message : 'Admin command request failed',
      'network_error',
      true,
    );
  }

  const body = await response.json().catch(() => null) as Result | null;
  if (response.ok) {
    remove(command);
    return body as Result;
  }
  const error = body && typeof body === 'object'
    ? body as { error?: unknown; code?: unknown; retryable?: unknown }
    : null;
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || error?.retryable === true;
  if (!retryable) remove(command);
  throw new AdminCommandError(
    typeof error?.error === 'string' ? error.error : 'Admin command failed',
    typeof error?.code === 'string' ? error.code : undefined,
    retryable,
  );
}

export async function executeAdminCommand<Result>(
  kind: string,
  operationId: string,
  venueId: string,
  payload: unknown,
): Promise<Result> {
  const command = { operationId, venueId, kind, payload, createdAt: new Date().toISOString() };
  persist(command);
  try {
    return await send<Result>(command);
  } catch (cause) {
    if (!(cause instanceof AdminCommandError) || !cause.retryable) throw cause;
    return send<Result>(command);
  }
}

export async function flushPendingAdminCommands(): Promise<void> {
  const commands: StoredAdminCommand[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      commands.push(JSON.parse(raw) as StoredAdminCommand);
    } catch {
      localStorage.removeItem(key);
    }
  }
  commands.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const command of commands) {
    try {
      await send(command);
    } catch (cause) {
      if (cause instanceof AdminCommandError && !cause.retryable) continue;
      break;
    }
  }
}
