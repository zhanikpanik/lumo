#!/usr/bin/env node

/**
 * Print Bridge — HTTP → TCP ESC/POS gateway.
 *
 * Runs on MacBook (or any machine with network access to the printer).
 * Receives JSON receipt data via HTTP POST, converts to ESC/POS, and
 * sends to the printer over TCP port 9100.
 *
 * Usage:
 *   node src/print/bridge.mjs [--port 3456] [--printer 192.168.1.100]
 *
 * Endpoints:
 *   POST /print        — print a receipt (JSON body)
 *   POST /test         — print a test receipt
 *   GET  /status       — check printer connectivity
 *   GET  /             — simple health check
 */

import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { parseArgs } from 'node:util';

// ── Args ────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: '3456' },
    printer: { type: 'string', default: '192.168.1.100' },
    'printer-port': { type: 'string', default: '9100' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Print Bridge — HTTP → TCP ESC/POS gateway

Usage:
  node src/print/bridge.mjs [options]

Options:
  --port <port>            HTTP server port (default: 3456)
  --printer <ip>           Printer IP address (default: 192.168.1.100)
  --printer-port <port>    Printer TCP port (default: 9100)
  -h, --help               Show this help
`);
  process.exit(0);
}

const HTTP_PORT = parseInt(args.port, 10);
const PRINTER_IP = args.printer;
const PRINTER_PORT = parseInt(args['printer-port'], 10);

// ── ESC/POS Commands ────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  init: Buffer.from([ESC, 0x40]),
  cancelChineseMode: Buffer.from([0x1c, 0x2e]),
  codePageCP866: Buffer.from([ESC, 0x74, 17]),
  cut: Buffer.from([GS, 0x56, 1]), // partial cut
  cutFull: Buffer.from([GS, 0x56, 0]),
  alignLeft: Buffer.from([ESC, 0x61, 0]),
  alignCenter: Buffer.from([ESC, 0x61, 1]),
  alignRight: Buffer.from([ESC, 0x61, 2]),
  boldOn: Buffer.from([ESC, 0x45, 1]),
  boldOff: Buffer.from([ESC, 0x45, 0]),
  sizeNormal: Buffer.from([GS, 0x21, 0]),
  sizeWide: Buffer.from([GS, 0x21, 0x10]),  // width x2
  sizeTall: Buffer.from([GS, 0x21, 0x01]),  // height x2
  sizeBig: Buffer.from([GS, 0x21, 0x11]),   // both x2
  feed1: Buffer.from([ESC, 0x64, 1]),
  feed2: Buffer.from([ESC, 0x64, 2]),
  feed3: Buffer.from([ESC, 0x64, 3]),
};

// ── CP866 Encoder ───────────────────────────────────────────────

const CP866_MAP = new Map([
  ['А', 0x80], ['Б', 0x81], ['В', 0x82], ['Г', 0x83], ['Д', 0x84], ['Е', 0x85],
  ['Ж', 0x86], ['З', 0x87], ['И', 0x88], ['Й', 0x89], ['К', 0x8a], ['Л', 0x8b],
  ['М', 0x8c], ['Н', 0x8d], ['О', 0x8e], ['П', 0x8f], ['Р', 0x90], ['С', 0x91],
  ['Т', 0x92], ['У', 0x93], ['Ф', 0x94], ['Х', 0x95], ['Ц', 0x96], ['Ч', 0x97],
  ['Ш', 0x98], ['Щ', 0x99], ['Ъ', 0x9a], ['Ы', 0x9b], ['Ь', 0x9c], ['Э', 0x9d],
  ['Ю', 0x9e], ['Я', 0x9f],
  ['Ё', 0x85], ['№', 0x4e],
]);

function encodeCP866(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
    } else {
      bytes.push(CP866_MAP.get(ch.toUpperCase()) ?? 0x3f);
    }
  }
  return Buffer.from(bytes);
}

function textLine(text) {
  return Buffer.concat([encodeCP866(text), Buffer.from([LF])]);
}

// ── Receipt Builder ─────────────────────────────────────────────

function buildReceipt(data) {
  const parts = [];

  // Init + cancel double-byte Chinese mode + CP866
  parts.push(CMD.init);
  parts.push(CMD.cancelChineseMode);
  parts.push(CMD.codePageCP866);

  // Header
  parts.push(CMD.alignCenter);
  parts.push(CMD.sizeBig);
  parts.push(CMD.boldOn);
  parts.push(textLine(data.title || 'RECEIPT'));
  parts.push(CMD.boldOff);
  parts.push(CMD.sizeNormal);

  if (data.subtitle) {
    parts.push(textLine(data.subtitle));
  }
  parts.push(CMD.feed1);

  // Order info
  parts.push(CMD.alignLeft);
  parts.push(textLine(`Заказ #${data.orderNumber}`));
  if (data.table) parts.push(textLine(`Стол: ${data.table}`));
  if (data.waiter) parts.push(textLine(`Официант: ${data.waiter}`));
  parts.push(textLine(data.date || new Date().toLocaleString('ru-RU')));
  parts.push(textLine('-'.repeat(32)));

  // Items
  for (const line of (data.lines || [])) {
    if (line.right !== undefined) {
      const maxLen = 32;
      const rightLen = line.right.length;
      const leftMax = maxLen - rightLen - 1;
      const leftText = line.left.length > leftMax
        ? line.left.slice(0, leftMax - 1) + '…'
        : line.left;
      const pad = Math.max(1, maxLen - leftText.length - rightLen);
      parts.push(textLine(leftText + ' '.repeat(pad) + line.right));
    } else {
      parts.push(textLine(line.left));
    }
  }

  // Total
  parts.push(textLine('-'.repeat(32)));
  parts.push(CMD.boldOn);
  parts.push(CMD.sizeWide);
  const totalLabel = 'ИТОГО';
  const totalPad = Math.max(1, 32 - totalLabel.length - (data.total || '').length);
  parts.push(textLine(totalLabel + ' '.repeat(totalPad) + (data.total || '0')));
  parts.push(CMD.sizeNormal);
  parts.push(CMD.boldOff);

  // Payment
  if (data.paymentMethod) {
    parts.push(CMD.feed1);
    parts.push(CMD.alignCenter);
    parts.push(textLine(data.paymentMethod));
  }

  // Footer
  parts.push(CMD.feed1);
  if (data.footer) {
    parts.push(CMD.alignCenter);
    parts.push(textLine(data.footer));
  }

  parts.push(CMD.feed3);
  parts.push(CMD.cut);

  return Buffer.concat(parts);
}

// ── TCP Printer Client ──────────────────────────────────────────

function sendToPrinter(data) {
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    const timeout = 5000;

    sock.setTimeout(timeout);

    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error(`Printer timeout after ${timeout}ms`));
    });

    sock.on('error', (err) => {
      sock.destroy();
      reject(new Error(`Printer connection error: ${err.message}`));
    });

    sock.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log(`[bridge] Connected to ${PRINTER_IP}:${PRINTER_PORT}`);
      sock.write(data, (err) => {
        if (err) {
          sock.destroy();
          reject(new Error(`Write error: ${err.message}`));
          return;
        }
        // Give printer time to process, then close
        setTimeout(() => {
          sock.end();
          resolve({ status: 'sent', bytes: data.length });
        }, 500);
      });
    });

    sock.on('close', () => {
      console.log('[bridge] Connection closed');
    });
  });
}

/** Quick connectivity check (TCP connect only, no data sent) */
function checkPrinter() {
  return new Promise((resolve) => {
    const sock = new Socket();
    sock.setTimeout(3000);

    sock.on('timeout', () => {
      sock.destroy();
      resolve({ online: false, error: 'timeout' });
    });

    sock.on('error', (err) => {
      sock.destroy();
      resolve({ online: false, error: err.message });
    });

    sock.connect(PRINTER_PORT, PRINTER_IP, () => {
      sock.end();
      resolve({ online: true, printer: `${PRINTER_IP}:${PRINTER_PORT}` });
    });
  });
}

// ── HTTP Server ─────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check
    if (url.pathname === '/' && req.method === 'GET') {
      sendJSON(res, 200, { status: 'ok', bridge: true, printer: `${PRINTER_IP}:${PRINTER_PORT}` });
      return;
    }

    // Printer status
    if (url.pathname === '/status' && req.method === 'GET') {
      const status = await checkPrinter();
      sendJSON(res, status.online ? 200 : 503, status);
      return;
    }

    // Test receipt
    if (url.pathname === '/test' && req.method === 'POST') {
      console.log('[bridge] Printing test receipt...');
      const receiptData = buildReceipt({
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
      const result = await sendToPrinter(receiptData);
      console.log(`[bridge] Test receipt sent (${result.bytes} bytes)`);
      sendJSON(res, 200, { ...result, receipt: 'test' });
      return;
    }

    // Print receipt from JSON
    if (url.pathname === '/print' && req.method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);
      console.log(`[bridge] Printing receipt for order #${data.orderNumber}...`);
      const receiptData = buildReceipt(data);
      const result = await sendToPrinter(receiptData);
      console.log(`[bridge] Receipt sent (${result.bytes} bytes)`);
      sendJSON(res, 200, { ...result, receipt: 'custom' });
      return;
    }

    // Raw ESC/POS passthrough (for debugging)
    if (url.pathname === '/raw' && req.method === 'POST') {
      const body = await readBody(req);
      const data = Buffer.from(JSON.parse(body).data, 'base64');
      console.log(`[bridge] Sending raw ${data.length} bytes...`);
      const result = await sendToPrinter(data);
      sendJSON(res, 200, result);
      return;
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(`[bridge] Error: ${err.message}`);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(HTTP_PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║             Print Bridge — ESC/POS Gateway           ║
╠══════════════════════════════════════════════════════╣
║  HTTP:    http://localhost:${HTTP_PORT}                    ║
║  Printer: ${PRINTER_IP}:${PRINTER_PORT}                  ║
╠══════════════════════════════════════════════════════╣
║  POST /print   — print receipt (JSON body)           ║
║  POST /test    — print test receipt                  ║
║  GET  /status  — check printer connectivity          ║
╚══════════════════════════════════════════════════════╝
`);
});
