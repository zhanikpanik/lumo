import { ACTIVATION_WORKER_URL, getAdminBearerToken } from './warehouseCommands';

export class StaffCommandError extends Error {
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
    this.name = 'StaffCommandError';
  }
}

export async function executeStaffCommand<Result>(
  kind: 'create-employee' | 'update-employee' | 'reset-employee-pin' | 'deactivate-employee',
  operationId: string,
  venueId: string,
  payload: unknown,
): Promise<Result> {
  if (!ACTIVATION_WORKER_URL) {
    throw new StaffCommandError('VITE_ACTIVATION_WORKER_URL is required', 'missing_worker_url', false);
  }
  const token = await getAdminBearerToken();
  let response: Response;
  try {
    response = await fetch(`${ACTIVATION_WORKER_URL}/v1/admin/staff-commands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind, operationId, venueId, payload }),
    });
  } catch (cause) {
    throw new StaffCommandError(cause instanceof Error ? cause.message : 'Staff command request failed', 'network_error', true);
  }
  const body = await response.json().catch(() => null) as Result | { error?: unknown; code?: unknown; retryable?: unknown } | null;
  if (response.ok) return body as Result;
  const error = body && typeof body === 'object'
    ? body as { error?: unknown; code?: unknown; retryable?: unknown }
    : null;
  throw new StaffCommandError(
    typeof error?.error === 'string' ? error.error : 'Staff command failed',
    typeof error?.code === 'string' ? error.code : undefined,
    response.status === 408 || response.status === 429 || response.status >= 500 || error?.retryable === true,
  );
}
