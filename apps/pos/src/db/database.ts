import { Platform } from 'react-native';
import { logger } from '../utils/logger';

// expo-sqlite only works on iOS/Android, not web.
// On web we provide noop stubs so the app doesn't crash during dev.

let db: any = null; // SQLiteDatabase | NoopDatabase

const SCHEMA_VERSION = 3;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS order_outbox (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      action_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_order_outbox_created ON order_outbox(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_type ON catalog(type)`,
  ],
  2: [
    `CREATE TABLE IF NOT EXISTS local_orders (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      synced_at TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_local_orders_synced ON local_orders(synced_at)`,
  ],
  3: [
    `CREATE TABLE IF NOT EXISTS consumption_outbox (
      id TEXT PRIMARY KEY,
      action_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_consumption_outbox_created ON consumption_outbox(created_at)`,
  ],
};

// ─── Web noop stub ─────────────────────────────────────

function createNoopDb() {
  return {
    execAsync: async (_sql: string) => {},
    runAsync: async (_sql: string, ..._params: any[]) => {},
    getAllAsync: async (_sql: string, ..._params: any[]): Promise<any[]> => [],
    closeAsync: async () => {},
  };
}

// ─── Public API ─────────────────────────────────────────

export async function getDatabase(): Promise<any> {
  if (Platform.OS === 'web') {
    if (!db) db = createNoopDb();
    return db;
  }

  if (db) return db;

  // Dynamic import so web doesn't crash on module resolution
  // @ts-ignore — Metro handles dynamic imports; TS module setting is irrelevant
  const SQLite = await import('expo-sqlite');
  db = await SQLite.openDatabaseAsync('rkeeper.db');

  await runMigrations(db);

  logger.info('db.open', 'SQLite database opened', { version: SCHEMA_VERSION });
  return db;
}

async function runMigrations(database: any): Promise<void> {
  try {
    const rows = await database.getAllAsync(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const currentVersion = rows.length > 0 ? rows[0].version : 0;

    if (currentVersion >= SCHEMA_VERSION) return;

    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      const sqls = MIGRATIONS[v];
      if (!sqls) continue;
      for (const sql of sqls) {
        await database.execAsync(sql);
      }
    }

    await database.runAsync(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      SCHEMA_VERSION,
    );
  } catch (e) {
    logger.error('db.migration', e);
    throw e;
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

// ─── Local orders persistence ──────────────────────────

export async function saveOrderToLocal(order: unknown): Promise<void> {
  try {
    const database = await getDatabase();
    const o = order as Record<string, unknown>;
    await database.runAsync(
      `INSERT OR REPLACE INTO local_orders (id, data_json, synced_at, updated_at)
       VALUES (?, ?, NULL, ?)`,
      o.id as string,
      JSON.stringify(order),
      new Date().toISOString(),
    );
  } catch (e) {
    logger.error('db.saveOrderToLocal', e);
  }
}

export async function markOrderSynced(orderId: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE local_orders SET synced_at = ? WHERE id = ?`,
      new Date().toISOString(),
      orderId,
    );
  } catch (e) {
    logger.error('db.markOrderSynced', e);
  }
}

export async function deleteOrderFromLocal(orderId: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM local_orders WHERE id = ?', orderId);
  } catch (e) {
    logger.error('db.deleteOrderFromLocal', e);
  }
}

export async function loadOrdersFromLocal(): Promise<Array<{ id: string } & Record<string, unknown>>> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync(
      'SELECT id, data_json FROM local_orders ORDER BY updated_at DESC',
    );
    return rows.map((row: any) => JSON.parse(row.data_json));
  } catch (e) {
    logger.error('db.loadOrdersFromLocal', e);
    return [];
  }
}

export async function saveAllOrdersToLocal(orders: unknown[]): Promise<void> {
  try {
    const database = await getDatabase();
    await database.execAsync('DELETE FROM local_orders');
    for (const order of orders) {
      const o = order as Record<string, unknown>;
      await database.runAsync(
        `INSERT INTO local_orders (id, data_json, synced_at, updated_at)
         VALUES (?, ?, NULL, ?)`,
        o.id as string,
        JSON.stringify(order),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    logger.error('db.saveAllOrdersToLocal', e);
  }
}
