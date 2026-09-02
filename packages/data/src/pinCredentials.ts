import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const EMPLOYEE_PIN_LENGTH = 4;
export const EMPLOYEE_PIN_KDF_ITERATIONS = 20_000;
export const EMPLOYEE_PIN_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const EMPLOYEE_PIN_OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;

export interface EmployeePinVerifier {
  pinSalt: string;
  pinVerifier: string;
  credentialsVersion: number;
  expiresAt: string;
}

function asciiBytes(value: string, name: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint > 0x7f) throw new Error(`${name} must contain ASCII characters only`);
    bytes[index] = codePoint;
  }
  return bytes;
}

export function validateEmployeePin(pin: string): void {
  if (!new RegExp(`^\\d{${EMPLOYEE_PIN_LENGTH}}$`).test(pin)) {
    throw new Error(`PIN must contain exactly ${EMPLOYEE_PIN_LENGTH} digits`);
  }
}

export async function deriveEmployeePinVerifier(pin: string, pinSalt: string): Promise<string> {
  validateEmployeePin(pin);
  if (!pinSalt) throw new Error('PIN salt is required');
  const derived = await pbkdf2Async(
    sha256,
    asciiBytes(pin, 'PIN'),
    asciiBytes(pinSalt, 'PIN salt'),
    {
      c: EMPLOYEE_PIN_KDF_ITERATIONS,
      dkLen: 32,
      asyncTick: 4,
    },
  );
  return `pbkdf2-sha256:${EMPLOYEE_PIN_KDF_ITERATIONS}:${bytesToHex(derived)}`;
}

export function employeePinLookupHash(venueId: string, pin: string): string {
  validateEmployeePin(pin);
  if (!venueId) throw new Error('Venue ID is required');
  return bytesToHex(sha256(asciiBytes(`${venueId}:${pin}`, 'Venue PIN lookup input')));
}

export async function verifyEmployeePin(
  credential: Pick<EmployeePinVerifier, 'pinSalt' | 'pinVerifier' | 'expiresAt'>,
  pin: string,
  now = Date.now(),
): Promise<boolean> {
  if (Date.parse(credential.expiresAt) <= now) return false;
  const [scheme, iterationsText, expected] = credential.pinVerifier.split(':', 3);
  const iterations = Number(iterationsText);
  if (scheme !== 'pbkdf2-sha256' || iterations !== EMPLOYEE_PIN_KDF_ITERATIONS || !/^[0-9a-f]{64}$/.test(expected ?? '')) {
    return false;
  }
  let actual: string;
  try {
    actual = (await deriveEmployeePinVerifier(pin, credential.pinSalt)).split(':', 3)[2] ?? '';
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
