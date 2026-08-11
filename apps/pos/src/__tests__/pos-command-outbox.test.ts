const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
    getAllKeys: jest.fn(async () => [...mockStorage.keys()]),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockStorage.get(key) ?? null])),
  },
}));

jest.mock('@lumo/data', () => ({
  canonicalJson: (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort()),
}));

jest.mock('../config', () => ({
  ACTIVATION_WORKER_URL: 'https://worker.test',
}));

jest.mock('../data/instant', () => ({
  loadStoredDeviceAuth: jest.fn(async () => ({
    deviceId: 'device-1',
    venueId: 'venue-1',
    token: 'device-token',
  })),
}));

import { createPosCashMovement, flushPendingPosCommands, PosCommandError } from '../data/posCommands';

const request = {
  operationId: 'cash-operation-1',
  shiftId: 'shift-1',
  movementType: 'float_in' as const,
  amountTiyin: 10_000,
};

describe('POS command outbox', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_ACTIVATION_WORKER_URL = 'https://worker.test';
  });

  test('replays the same operationId after a network failure and removes it after commit', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ cashMovementId: 'movement-1' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(createPosCashMovement(request)).rejects.toEqual(
      expect.objectContaining<Partial<PosCommandError>>({ retryable: true }),
    );
    expect(mockStorage.size).toBe(1);

    await expect(flushPendingPosCommands()).resolves.toEqual({ completed: 1, remaining: 0 });
    expect(mockStorage.size).toBe(0);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).operationId).toBe(request.operationId);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).operationId).toBe(request.operationId);
  });

  test('removes final command rejections instead of replaying them forever', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'resource changed', code: 'resource_conflict', retryable: false }),
    }) as unknown as typeof fetch;

    await expect(createPosCashMovement(request)).rejects.toEqual(
      expect.objectContaining<Partial<PosCommandError>>({
        code: 'resource_conflict',
        retryable: false,
      }),
    );
    expect(mockStorage.size).toBe(0);
  });
});
