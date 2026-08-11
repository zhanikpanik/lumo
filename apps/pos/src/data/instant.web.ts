import { init, type InstantReactWebDatabase } from '@instantdb/react';
import type { AppSchema, DeviceActivationRequest, DeviceActivationResult } from '@lumo/data';
import { clearOfflinePinState } from './offlinePinState';

export type InstantPosClient = InstantReactWebDatabase<AppSchema, false>;

// ── Feature flags ──────────────────────────────────────────────────

const INSTANT_ENV = process.env.EXPO_PUBLIC_INSTANT_ENV;
const DEVELOPMENT_DEVICE_AUTH = INSTANT_ENV === 'development';

// ── Storage (localStorage for web) ──────────────────────────────────

const AUTH_KEY = '@lumo/device-auth';
const INSTALLATION_KEY = '@lumo/installation-id';

const storage = {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};

// ── Module state ───────────────────────────────────────────────────

let instantClient: InstantPosClient | null = null;
let developmentDeviceAuth: Promise<void> | null = null;
let storedAuth: DeviceActivationResult | null = null;
let storedInstallationId: string | null = null;

// ── Helpers ────────────────────────────────────────────────────────

function parseActivationResult(value: unknown): DeviceActivationResult {
  if (
    !value ||
    typeof value !== 'object' ||
    !('deviceId' in value) ||
    !('venueId' in value) ||
    !('token' in value) ||
    typeof value.deviceId !== 'string' ||
    typeof value.venueId !== 'string' ||
    typeof value.token !== 'string'
  ) {
    throw new Error('Activation worker returned an invalid response');
  }
  return { deviceId: value.deviceId, venueId: value.venueId, token: value.token };
}

function authenticateDevelopmentDevice(): Promise<void> {
  if (!DEVELOPMENT_DEVICE_AUTH) return Promise.resolve();
  const devToken = process.env.EXPO_PUBLIC_DEV_DEVICE_TOKEN;
  if (!devToken) return Promise.resolve();

  instantClient ??= createInstantClient();
  developmentDeviceAuth ??= instantClient.auth
    .signInWithToken(devToken)
    .then(() => undefined)
    .catch((error: unknown) => {
      developmentDeviceAuth = null;
      throw error;
    });
  return developmentDeviceAuth!;
}

// ── Installation identity ──────────────────────────────────────────

export async function getInstallationId(): Promise<string> {
  if (storedInstallationId) return storedInstallationId;
  try {
    const existing = await storage.getItem(INSTALLATION_KEY);
    if (existing) {
      storedInstallationId = existing;
      return existing;
    }
  } catch { /* fall through to generate */ }

  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  storedInstallationId = id;
  try { await storage.setItem(INSTALLATION_KEY, id); } catch { /* best-effort */ }
  return id;
}

// ── Client factory ─────────────────────────────────────────────────

export function createInstantClient(
  appId = process.env.EXPO_PUBLIC_INSTANT_APP_ID,
): InstantPosClient {
  if (!appId) {
    throw new Error('EXPO_PUBLIC_INSTANT_APP_ID is required before InstantDB can be used');
  }
  return init<AppSchema>({ appId, verbose: true });
}

export function getInstantClient(): InstantPosClient {
  instantClient ??= createInstantClient();
  void authenticateDevelopmentDevice().catch(() => undefined);
  return instantClient;
}

// ── Auth persistence ───────────────────────────────────────────────

export async function saveDeviceAuth(auth: DeviceActivationResult): Promise<void> {
  storedAuth = auth;
  await storage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export async function loadStoredDeviceAuth(): Promise<DeviceActivationResult | null> {
  if (storedAuth) return storedAuth;
  try {
    const raw = await storage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.token === 'string' &&
      typeof parsed.deviceId === 'string' &&
      typeof parsed.venueId === 'string'
    ) {
      storedAuth = parsed as DeviceActivationResult;
      return storedAuth;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  if (!storedAuth) throw new Error('Device not authenticated — call bootstrapInstantDevice first');
  return storedAuth.deviceId;
}

export function getVenueId(): string {
  if (!storedAuth) throw new Error('Device not authenticated — call bootstrapInstantDevice first');
  return storedAuth.venueId;
}

export async function clearStoredDeviceAuth(): Promise<void> {
  storedAuth = null;
  instantClient = null;
  await storage.removeItem(AUTH_KEY);
  await clearOfflinePinState();
}

// ── Bootstrap ──────────────────────────────────────────────────────

export interface BootstrapResult {
  status: 'authenticated' | 'activation-required';
  deviceId?: string;
  venueId?: string;
}

export async function bootstrapInstantDevice(): Promise<BootstrapResult> {
  if (DEVELOPMENT_DEVICE_AUTH && process.env.EXPO_PUBLIC_DEV_DEVICE_TOKEN) {
    try {
      await authenticateDevelopmentDevice();
      const existingAuth = await loadStoredDeviceAuth();
      if (existingAuth) {
        return { status: 'authenticated', deviceId: existingAuth.deviceId, venueId: existingAuth.venueId };
      }
      const syntheticAuth: DeviceActivationResult = {
        deviceId: 'bc06127e-7f60-4e15-8498-e3f5a14f0106',
        venueId: 'bc06127e-7f60-4e15-8498-e3f5a14f0102',
        token: process.env.EXPO_PUBLIC_DEV_DEVICE_TOKEN!,
      };
      await saveDeviceAuth(syntheticAuth);
      return { status: 'authenticated', deviceId: syntheticAuth.deviceId, venueId: syntheticAuth.venueId };
    } catch (err) {
      console.error('bootstrapInstantDevice dev path failed:', err);
      return { status: 'activation-required' };
    }
  }

  const auth = await loadStoredDeviceAuth();
  if (!auth) return { status: 'activation-required' };

  try {
    instantClient ??= createInstantClient();
    await instantClient.auth.signInWithToken(auth.token);
    return { status: 'authenticated', deviceId: auth.deviceId, venueId: auth.venueId };
  } catch {
    await clearStoredDeviceAuth();
    return { status: 'activation-required' };
  }
}

// ── Legacy ─────────────────────────────────────────────────────────

export async function waitForInstantDeviceAuthentication(): Promise<void> {
  await authenticateDevelopmentDevice();
}

export async function isDeviceActivated(): Promise<boolean> {
  return (await loadStoredDeviceAuth()) !== null;
}

export async function tryStoredDeviceAuth(): Promise<boolean> {
  const result = await bootstrapInstantDevice();
  return result.status === 'authenticated';
}

// ── Activation ─────────────────────────────────────────────────────

export async function activateInstantDevice(
  request: Omit<DeviceActivationRequest, 'installationId'>,
): Promise<DeviceActivationResult> {
  const workerUrl = process.env.EXPO_PUBLIC_ACTIVATION_WORKER_URL;
  if (!workerUrl) {
    throw new Error('EXPO_PUBLIC_ACTIVATION_WORKER_URL is required before a device can be activated');
  }

  const installationId = await getInstallationId();

  const response = await fetch(`${workerUrl}/v1/device-activations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, installationId }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Device activation failed';
    throw new Error(message);
  }

  const result = parseActivationResult(payload);
  await getInstantClient().auth.signInWithToken(result.token);
  await saveDeviceAuth(result);
  return result;
}
