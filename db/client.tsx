// Web-first DB client — sql.js + IndexedDB.
//
// Why sql.js + IndexedDB instead of expo-sqlite/web (wa-sqlite + OPFS):
//
//   wa-sqlite's `SyncAccessHandle` pool deadlocks once an init crashes
//   leaving an open SAH. The "modifications are not allowed" failure is
//   well-documented; in practice it bricks the database for the entire
//   browser session. sql.js + IndexedDB has none of those constraints:
//   no SharedArrayBuffer, no cross-origin isolation requirement, no
//   COOP/COEP headers, no service worker dance — it just works in any
//   modern browser, including Safari and the iOS PWA we care about.
//
//   Tradeoff: writes serialize the whole DB to bytes and persist via
//   IndexedDB. At Marka's data volumes (hundreds to low-thousands of
//   rows, < 100 KB serialized) this is sub-10ms — perfectly fine.
//
// Persistence model — `total_changes()` polling:
//
//   SQLite's `total_changes()` function returns the cumulative row
//   count modified by INSERT/UPDATE/DELETE on the current connection.
//   It increments monotonically across our entire session, so polling
//   it on a 500 ms timer is a perfect change detector — whenever it
//   has moved since the last save, we serialize and write to IndexedDB.
//
//   (Why not `pragma data_version`? It only fires when *other*
//   connections write to the file — useless for a single-connection
//   browser DB.)
//
//   This polling is bulletproof: it doesn't depend on us hooking the
//   right driver method, doesn't care about transactions, and catches
//   any write path including future ones we haven't enumerated.
//
//   On `pagehide` and `visibilitychange:hidden`, we do a final
//   best-effort flush so a tab close mid-burst persists the latest
//   state. The browser may cancel pending IDB writes on a hard kill,
//   but for soft navigations (refresh, route change, app close) it
//   typically completes — the bundle is < 100 KB.
//
// Diagnostics: every save logs a single line to the console with the
// new data_version and the serialized byte count. If you suspect a
// persistence bug, that log makes it obvious whether saves are firing.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import migrationsBundle from './migrations/migrations';
import { seedStarterCategories } from './seed';

/** The DB type every screen / hook / query helper accepts. */
export type DB = SQLJsDatabase;

// ---------- IndexedDB layer ----------
// We stash the entire SQLite bytes blob under a single key. No need for
// a record-oriented schema — sql.js owns the SQLite layout in memory.

const IDB_NAME = 'marka-store';
const STORE = 'kv';
const KEY = 'sqlite-bytes';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readBytes(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      const raw = req.result;
      if (!raw) return resolve(null);
      // IDB may return either Uint8Array or ArrayBuffer depending on
      // the browser's structured-clone behaviour — normalize to
      // Uint8Array so SQL.Database's constructor is happy.
      if (raw instanceof Uint8Array) return resolve(raw);
      if (raw instanceof ArrayBuffer) return resolve(new Uint8Array(raw));
      resolve(null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function writeBytes(bytes: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- sql.js init ----------

let sqlPromise: Promise<SqlJsStatic> | null = null;

function ensureSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      // sql-wasm.wasm is staged in `public/` so the export pipeline
      // copies it to the dist root verbatim. Tested URL: `/sql-wasm.wasm`.
      locateFile: () => '/sql-wasm.wasm',
    });
  }
  return sqlPromise;
}

// ---------- Persistence orchestration ----------

let rawDb: Database | null = null;
let lastSavedChanges = 0;
let saveInflight: Promise<void> | null = null;

const POLL_MS = 500;

/** Read SQLite's `total_changes()` — cumulative row mutations since open. */
function readTotalChanges(db: Database): number {
  const result = db.exec('SELECT total_changes()');
  return (result[0]?.values?.[0]?.[0] as number) ?? 0;
}

async function flushIfDirty(): Promise<void> {
  if (!rawDb) return;
  const current = readTotalChanges(rawDb);
  if (current === lastSavedChanges) return;
  if (saveInflight) {
    await saveInflight;
    if (readTotalChanges(rawDb) === lastSavedChanges) return;
  }
  const bytes = rawDb.export();
  const c = readTotalChanges(rawDb);
  saveInflight = writeBytes(bytes)
    .then(() => {
      lastSavedChanges = c;
      console.log(
        `[db] persisted ${c} changes (${bytes.byteLength.toLocaleString()} bytes)`,
      );
    })
    .catch((err) => {
      console.error('[db] flush failed', err);
    })
    .finally(() => {
      saveInflight = null;
    });
  await saveInflight;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void flushIfDirty();
  }, POLL_MS);
}

function installPagehideFlush(): void {
  if (typeof window === 'undefined') return;
  // `pagehide` is the most reliable "tab going away" signal across
  // mobile browsers. `visibilitychange→hidden` covers backgrounding on
  // iOS PWAs. We trigger an explicit flush; IDB writes may complete
  // even after the page is unloading for soft navigations.
  const handler = () => {
    void flushIfDirty();
  };
  window.addEventListener('pagehide', handler);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handler();
  });
}

// ---------- Initialization ----------

async function initDb(): Promise<DB> {
  const SQL = await ensureSql();
  const stored = await readBytes();
  rawDb = stored ? new SQL.Database(stored) : new SQL.Database();
  console.log(
    `[db] opened (${stored ? `${stored.byteLength.toLocaleString()} bytes from IDB` : 'fresh'})`,
  );

  installPagehideFlush();

  // Run any pending migrations. Idempotent — already-applied migrations
  // are skipped via the `__drizzle_migrations` tracking table.
  runMigrations(rawDb);

  // Capture the post-migration change count. If migrations ran (and
  // therefore inserted into __drizzle_migrations), persist once so the
  // schema is on disk before any user activity. Otherwise the polling
  // baseline is whatever total_changes() reports right now — usually 0
  // on a fresh open, or the previous session's count when reloaded
  // from IDB (close enough — the next user write will trigger a save).
  const postMigrationChanges = readTotalChanges(rawDb);
  if (postMigrationChanges > 0 && !stored) {
    const bytes = rawDb.export();
    await writeBytes(bytes);
    lastSavedChanges = postMigrationChanges;
    console.log(
      `[db] persisted ${postMigrationChanges} changes (post-migration, ${bytes.byteLength.toLocaleString()} bytes)`,
    );
  } else {
    lastSavedChanges = postMigrationChanges;
  }

  startPolling();

  return drizzle(rawDb);
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}

interface MigrationsBundle {
  journal: { entries: JournalEntry[] };
  migrations: Record<string, string>;
}

function runMigrations(db: Database): void {
  const bundle = migrationsBundle as unknown as MigrationsBundle;

  db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      tag TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedResult = db.exec('SELECT tag FROM __drizzle_migrations');
  const applied = new Set<string>();
  if (appliedResult.length > 0) {
    for (const row of appliedResult[0].values) {
      applied.add(row[0] as string);
    }
  }

  for (const entry of bundle.journal.entries) {
    if (applied.has(entry.tag)) continue;
    const key = `m${String(entry.idx).padStart(4, '0')}`;
    const sql = bundle.migrations[key];
    if (typeof sql !== 'string') {
      throw new Error(`Migration "${entry.tag}" missing SQL body for ${key}`);
    }

    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      db.exec(stmt);
    }

    db.run(
      'INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)',
      [entry.tag, Date.now()],
    );
  }
}

// ---------- React provider ----------

const DatabaseContext = createContext<DB | null>(null);

export interface DatabaseProviderProps {
  children: React.ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // React 19 strict-mode fires effects twice in dev. The ref guards
  // against double-init (which would recreate the rawDb singleton mid-
  // flight and orphan the first one).
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const ready = await initDb();
        await seedStarterCategories(ready);
        // Coalesce the categories-seed write into one flush so the
        // first paint sees a stable on-disk snapshot.
        await flushIfDirty();
        setDb(ready);
      } catch (err) {
        setError(err as Error);
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Database failed to load: {error.message}
        </Text>
      </View>
    );
  }
  if (!db) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }
  return (
    <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>
  );
}

export function useDb(): DB {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDb must be used inside <DatabaseProvider>.');
  }
  return ctx;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.6,
  },
  errorText: {
    fontSize: 14,
    color: '#B3261E',
    textAlign: 'center',
  },
});
