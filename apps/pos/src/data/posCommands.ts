import type { DeviceActivationResult } from '@lumo/data';
import { ACTIVATION_WORKER_URL } from '../config';
import { loadStoredDeviceAuth } from './instant';
import {
  loadPendingPosCommands,
  persistPosCommand,
  removePosCommand,
  type PendingPosCommand,
} from './posCommandOutbox';

export interface CreatePosOrderRequest {
  operationId: string;
  shiftId: string;
  actorEmployeeId: string;
  tableId?: string;
  guestCount: number;
  orderType: string;
  isQuickCheck: boolean;
  orderNumber: string;
}

export interface CreatePosOrderResult {
  orderId: string;
}

export class PosCommandError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PosCommandError';
  }
}

async function sendPendingCommand<Result>(
  workerUrl: string,
  auth: DeviceActivationResult,
  pending: PendingPosCommand,
): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl}${pending.path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(pending.payload),
    });
  } catch (cause) {
    throw new PosCommandError(
      cause instanceof Error ? cause.message : 'POS command network request failed',
      true,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'POS command failed';
    const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
      ? body.code
      : undefined;
    const retryable = response.status >= 500 || Boolean(
      body && typeof body === 'object' && 'retryable' in body && body.retryable === true,
    );
    if (!retryable) await removePosCommand(pending.operationId);
    throw new PosCommandError(message, retryable, code);
  }

  await removePosCommand(pending.operationId);
  return body as Result;
}

export async function flushPendingPosCommands(): Promise<{ completed: number; remaining: number }> {
  const workerUrl = ACTIVATION_WORKER_URL;
  if (!workerUrl) return { completed: 0, remaining: 0 };
  const auth = await loadStoredDeviceAuth();
  if (!auth) return { completed: 0, remaining: 0 };

  const pending = await loadPendingPosCommands();
  let completed = 0;
  for (const command of pending) {
    try {
      await sendPendingCommand(workerUrl, auth, command);
      completed += 1;
    } catch (cause) {
      if (cause instanceof PosCommandError && cause.retryable) break;
    }
  }
  return { completed, remaining: (await loadPendingPosCommands()).length };
}
async function postCommand<Result>(path: string, payload: unknown): Promise<Result> {
  const workerUrl = ACTIVATION_WORKER_URL;
  if (!workerUrl) throw new Error('EXPO_PUBLIC_ACTIVATION_WORKER_URL is required for POS commands');

  const auth = await loadStoredDeviceAuth();
  if (!auth) throw new Error('Device not authenticated');
  const pending = await persistPosCommand(path, payload);
  return sendPendingCommand<Result>(workerUrl, auth, pending);
}

/** Creates an authoritative order. Venue and device identity are derived by the worker. */
export function createPosOrder(input: CreatePosOrderRequest): Promise<CreatePosOrderResult> {
  return postCommand<CreatePosOrderResult>('/v1/pos/orders', input);
}

export interface AddPosOrderLineRequest {
  operationId: string;
  orderId: string;
  actorEmployeeId: string;
  productId: string;
  quantity: number;
  guestNumber: number;
  modifierIds?: string[];
  comment?: string;
}

export interface AddPosOrderLineResult {
  orderItemId: string;
  newTotal: number;
}

/** Adds a server-priced order line with a server-built stock snapshot. */
export function addPosOrderLine(input: AddPosOrderLineRequest): Promise<AddPosOrderLineResult> {
  return postCommand<AddPosOrderLineResult>('/v1/pos/order-lines', input);
}

export interface RemovePosOrderLineRequest {
  operationId: string;
  orderId: string;
  orderItemId: string;
  actorEmployeeId: string;
}

export interface RemovePosOrderLineResult {
  newTotal: number;
}

export function removePosOrderLine(input: RemovePosOrderLineRequest): Promise<RemovePosOrderLineResult> {
  return postCommand<RemovePosOrderLineResult>('/v1/pos/order-lines/remove', input);
}

export interface CancelPosOrderRequest {
  operationId: string;
  orderId: string;
  actorEmployeeId: string;
  closeReason: string;
}

export function cancelPosOrder(input: CancelPosOrderRequest): Promise<{ orderId: string; status: 'cancelled' }> {
  return postCommand('/v1/pos/orders/cancel', input);
}

export interface UpdatePosOrderRequest {
  operationId: string;
  orderId: string;
  actorEmployeeId: string;
  updates: {
    guestCount?: number;
    comment?: string;
    ownerEmployeeId?: string;
    tableId?: string;
  };
}

export function updatePosOrder(input: UpdatePosOrderRequest): Promise<{ orderId: string }> {
  return postCommand('/v1/pos/orders/update', input);
}

export interface PayPosOrderRequest {
  operationId: string;
  orderId: string;
  shiftId: string;
  actorEmployeeId: string;
  method: 'cash' | 'card';
  tenderedCashTiyin?: number;
}

export function payPosOrder(input: PayPosOrderRequest): Promise<{ paymentId: string; status: 'paid'; changeTiyin: number }> {
  return postCommand('/v1/pos/orders/pay', input);
}

export function openPosShift(input: {
  operationId: string;
  actorEmployeeId: string;
  startingCashTiyin: number;
}): Promise<{ shiftId: string }> {
  return postCommand('/v1/pos/shifts/open', input);
}

export function closePosShift(input: {
  operationId: string;
  shiftId: string;
  countedCashTiyin: number;
  closingNote?: string;
}): Promise<{ shiftId: string; status: 'closed' }> {
  return postCommand('/v1/pos/shifts/close', input);
}

export function createPosCashMovement(input: {
  operationId: string;
  shiftId: string;
  movementType: 'collection' | 'float_in' | 'float_out';
  amountTiyin: number;
  note?: string;
}): Promise<{ cashMovementId: string }> {
  return postCommand('/v1/pos/cash-movements', input);
}

export function refundPosOrder(input: {
  operationId: string;
  orderId: string;
  shiftId: string;
  actorEmployeeId: string;
  reason?: string;
}): Promise<{ refundPaymentId: string; status: 'refunded' }> {
  return postCommand('/v1/pos/orders/refund', input);
}

export function cancelPosRefund(input: {
  operationId: string;
  orderId: string;
  shiftId: string;
  actorEmployeeId: string;
}): Promise<{ status: 'paid' }> {
  return postCommand('/v1/pos/orders/refund/cancel', input);
}
