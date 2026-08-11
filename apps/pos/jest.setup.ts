import { TextDecoder, TextEncoder } from 'node:util';
import { randomUUID } from 'node:crypto';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.assign(globalThis.crypto, { randomUUID });
