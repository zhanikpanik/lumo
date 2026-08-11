/**
 * Minimal ESC/POS command builder for thermal receipt printers.
 * Supports Xprinter and other generic ESC/POS-compatible devices.
 *
 * Reference: ESC/POS Application Programming Guide (Seiko Epson Corp.)
 */

// ── Control characters ──────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ── Raw command builders ────────────────────────────────────────

/** Initialize printer (ESC @) */
export function init(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

/** Line feed */
export function newline(): Uint8Array {
  return new Uint8Array([LF]);
}

/** Cut paper (GS V m) — m=1 = partial cut, m=0 = full cut */
export function cut(partial = true): Uint8Array {
  return new Uint8Array([GS, 0x56, partial ? 1 : 0]);
}

// ── Text alignment ──────────────────────────────────────────────

/** Set alignment (ESC a n) — 0=left, 1=center, 2=right */
export function align(mode: 0 | 1 | 2): Uint8Array {
  return new Uint8Array([ESC, 0x61, mode]);
}

// ── Text style ──────────────────────────────────────────────────

/** Enable/disable bold (ESC E n) */
export function bold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

/** Enable/disable double-strike (ESC G n) */
export function doubleStrike(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x47, on ? 1 : 0]);
}

/** Set character size (GS ! n) — high nibble=width, low nibble=height, 0-7 each */
export function charSize(width: number, height: number): Uint8Array {
  const n = ((width & 0x07) << 4) | (height & 0x07);
  return new Uint8Array([GS, 0x21, n]);
}

/** Reset text style to normal */
export function resetStyle(): Uint8Array {
  return new Uint8Array([ESC, 0x45, 0, ESC, 0x47, 0, GS, 0x21, 0]);
}

// ── Code page (Cyrillic) ────────────────────────────────────────

/** Set code page (ESC t n) — 17 = CP866 (Cyrillic) */
export function codePage(page: number = 17): Uint8Array {
  return new Uint8Array([ESC, 0x74, page]);
}

/** Cancel Chinese double-byte character mode (FS .). */
export function cancelChineseMode(): Uint8Array {
  return new Uint8Array([0x1c, 0x2e]);
}

// ── Line rules ──────────────────────────────────────────────────

/** Feed N lines */
export function feedLines(n: number): Uint8Array {
  return new Uint8Array([ESC, 0x64, n & 0xff]);
}

/** Print an ASCII dashed separator line. */
export function separator(width: number = 32): Uint8Array {
  return textLine('-'.repeat(width));
}

/** Print an ASCII double separator line. */
export function doubleSeparator(width: number = 32): Uint8Array {
  return textLine('='.repeat(width));
}

// ── Text helpers ────────────────────────────────────────────────

/** Encode text to CP866 bytes for Cyrillic support */
function encodeCP866(text: string): Uint8Array {
  const map: Record<string, number> = {
    'А': 0x80, 'Б': 0x81, 'В': 0x82, 'Г': 0x83, 'Д': 0x84, 'Е': 0x85,
    'Ж': 0x86, 'З': 0x87, 'И': 0x88, 'Й': 0x89, 'К': 0x8a, 'Л': 0x8b,
    'М': 0x8c, 'Н': 0x8d, 'О': 0x8e, 'П': 0x8f, 'Р': 0x90, 'С': 0x91,
    'Т': 0x92, 'У': 0x93, 'Ф': 0x94, 'Х': 0x95, 'Ц': 0x96, 'Ч': 0x97,
    'Ш': 0x98, 'Щ': 0x99, 'Ъ': 0x9a, 'Ы': 0x9b, 'Ь': 0x9c, 'Э': 0x9d,
    'Ю': 0x9e, 'Я': 0x9f,
    'Ё': 0x85, '№': 0x4e,
  };

  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
    } else {
      bytes.push(map[ch.toUpperCase()] ?? 0x3f);
    }
  }
  return new Uint8Array(bytes);
}

/** Print a single text line with LF */
export function textLine(text: string): Uint8Array {
  const encoded = encodeCP866(text);
  const result = new Uint8Array(encoded.length + 1);
  result.set(encoded);
  result[encoded.length] = LF;
  return result;
}

/** Print text without trailing LF */
export function text(text: string): Uint8Array {
  return encodeCP866(text);
}

// ── Receipt builder ─────────────────────────────────────────────

export interface ReceiptLine {
  left: string;
  right?: string;
}

/**
 * Build a complete receipt from structured data.
 * Returns raw bytes ready to send to the printer.
 */
export function buildReceipt(opts: {
  title: string;
  subtitle?: string;
  orderNumber: string;
  table?: string;
  waiter?: string;
  date: string;
  lines: ReceiptLine[];
  total: string;
  paymentMethod?: string;
  footer?: string;
}): Uint8Array {
  const parts: Uint8Array[] = [];

  // Init + cancel Chinese double-byte mode + CP866
  parts.push(init());
  parts.push(cancelChineseMode());
  parts.push(codePage(17));

  // Header
  parts.push(align(1));
  parts.push(charSize(1, 1));
  parts.push(bold(true));
  parts.push(textLine(opts.title));
  parts.push(bold(false));

  if (opts.subtitle) {
    parts.push(textLine(opts.subtitle));
  }

  parts.push(charSize(0, 0));
  parts.push(feedLines(1));

  // Order info
  parts.push(align(0));
  parts.push(textLine(`Заказ #${opts.orderNumber}`));
  if (opts.table) {
    parts.push(textLine(`Стол: ${opts.table}`));
  }
  if (opts.waiter) {
    parts.push(textLine(`Официант: ${opts.waiter}`));
  }
  parts.push(textLine(opts.date));
  parts.push(separator());

  // Items
  for (const line of opts.lines) {
    if (line.right !== undefined) {
      // Left-right aligned: left takes remaining space after right
      const maxLine = 32;
      const rightLen = line.right.length;
      const leftMax = maxLine - rightLen - 1; // 1 space gap
      const leftText = line.left.length > leftMax
        ? line.left.slice(0, leftMax - 1) + '…'
        : line.left;
      const padding = maxLine - leftText.length - rightLen;
      parts.push(textLine(leftText + ' '.repeat(Math.max(1, padding)) + line.right));
    } else {
      parts.push(textLine(line.left));
    }
  }

  // Total
  parts.push(separator());
  parts.push(bold(true));
  parts.push(charSize(1, 0));
  const totalLine = 'ИТОГО';
  const totalPadding = 32 - totalLine.length - opts.total.length;
  parts.push(textLine(totalLine + ' '.repeat(Math.max(1, totalPadding)) + opts.total));
  parts.push(charSize(0, 0));
  parts.push(bold(false));

  // Payment method
  if (opts.paymentMethod) {
    parts.push(feedLines(1));
    parts.push(align(1));
    parts.push(textLine(opts.paymentMethod));
  }

  // Footer
  parts.push(feedLines(1));
  if (opts.footer) {
    parts.push(align(1));
    parts.push(textLine(opts.footer));
  }

  parts.push(feedLines(3));
  parts.push(cut(true));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// ── Test print ──────────────────────────────────────────────────

/** Build a simple test receipt for printer verification */
export function buildTestReceipt(): Uint8Array {
  return buildReceipt({
    title: 'ALTO COFFEE',
    subtitle: 'Тестовый чек',
    orderNumber: '0001',
    table: '1',
    waiter: 'Тест',
    date: new Date().toLocaleString('ru-RU'),
    lines: [
      { left: '1 x Капучино', right: '180 с' },
      { left: '1 x Круассан', right: '150 с' },
      { left: '2 x Американо', right: '240 с' },
      { left: '' },
      { left: 'Скидка 10%', right: '-57 с' },
    ],
    total: '513 с',
    paymentMethod: 'НАЛИЧНЫЕ',
    footer: 'Спасибо за визит!',
  });
}
