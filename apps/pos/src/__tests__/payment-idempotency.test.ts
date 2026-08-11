/**
 * Фокусный тест на логику идемпотентности платежей:
 * - Формат ключа
 * - Regex-проверка имени индекса в сообщении ошибки 23505
 * - generatePaymentAttemptId уникальность
 */

// ─── генератор ключа (повторяет логику из PaymentScreen, выделена для тестируемости) ───

function generatePaymentAttemptId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildIdempotencyKey(
  orderId: string,
  method: string,
  attemptId: string,
): string {
  return `${orderId}:${method}:${attemptId}`;
}

// ─── regex из PaymentScreen для обработки 23505 ───

function isIdempotencyConflict(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  return (
    error.code === '23505' &&
    /payments_idempotency_key_venue_uidx/i.test(
      `${error.message ?? ''} ${error.details ?? ''}`,
    )
  );
}

// ─── тесты ───

describe('generatePaymentAttemptId', () => {
  it('produces valid UUID v4 format', () => {
    const id = generatePaymentAttemptId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePaymentAttemptId()));
    expect(ids.size).toBe(100);
  });
});

describe('buildIdempotencyKey', () => {
  it('contains orderId, method, and attemptId separated by colons', () => {
    const key = buildIdempotencyKey('order-1', 'cash', 'attempt-abc');
    expect(key).toBe('order-1:cash:attempt-abc');
  });

  it('same inputs produce same key (idempotent)', () => {
    const a = buildIdempotencyKey('o', 'card', 'x');
    const b = buildIdempotencyKey('o', 'card', 'x');
    expect(a).toBe(b);
  });

  it('different attemptId produces different key', () => {
    const a = buildIdempotencyKey('o', 'cash', 'x');
    const b = buildIdempotencyKey('o', 'cash', 'y');
    expect(a).not.toBe(b);
  });
});

describe('isIdempotencyConflict', () => {
  it('returns true for our index name in message', () => {
    expect(
      isIdempotencyConflict({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "payments_idempotency_key_venue_uidx"',
      }),
    ).toBe(true);
  });

  it('returns true when index name is in details instead of message', () => {
    expect(
      isIdempotencyConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details:
          'Key (venue_id, idempotency_key)=(...) already exists. constraint: payments_idempotency_key_venue_uidx',
      }),
    ).toBe(true);
  });

  it('returns false for a different unique constraint violation', () => {
    expect(
      isIdempotencyConflict({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "payments_pkey"',
      }),
    ).toBe(false);
  });

  it('returns false for non-23505 error codes', () => {
    expect(
      isIdempotencyConflict({
        code: '23503',
        message: 'payments_idempotency_key_venue_uidx',
      }),
    ).toBe(false);
  });

  it('returns false when message and details are both undefined', () => {
    expect(isIdempotencyConflict({ code: '23505' })).toBe(false);
  });
});
