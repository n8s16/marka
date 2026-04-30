// Database connection, migration runner, and React context provider.
//
// Why this file exists: every screen needs the same Drizzle DB instance, but
// expo-sqlite's `openDatabaseSync` should only be called once per app boot.
// Migrations and seeds also need to run exactly once before any query runs.
// We solve both by opening the DB at module-load and gating children behind a
// provider that completes migrations + seeds before rendering its tree.
//
// Pattern:
//   - openDatabase() — `openDatabaseSync('marka.db')`. expo-sqlite's default
//     location lands the file in iOS Documents/ (iCloud-backed-up) and
//     Android default app data dir per devops-engineer guidance — we don't
//     override.
//   - createDb() — wraps with drizzle(db).
//   - DatabaseProvider — runs migrations via useMigrations, then runs the
//     idempotent seeds once, then renders children. Renders a minimal loading
//     view while pending and an error view if migrations fail.
//   - useDb() — hook that returns the Drizzle DB instance. Throws if called
//     outside the provider so we fail loud rather than producing a runtime
//     undefined-deref deep in a screen.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from './migrations/migrations';
import { seedDefaultWallets, seedStarterCategories } from './seed';

// expo-sqlite's openDatabaseSync is required for Drizzle's expo-sqlite driver
// — the driver assumes synchronous access for transaction semantics.
export function openDatabase() {
  return openDatabaseSync('marka.db');
}

export function createDb(): ExpoSQLiteDatabase {
  return drizzle(openDatabase());
}

// Module-level instance: opening expo-sqlite is cheap and idempotent against
// the same path, but to keep the React tree clean we resolve the DB once.
const dbInstance = createDb();

const DatabaseContext = createContext<ExpoSQLiteDatabase | null>(null);

export interface DatabaseProviderProps {
  children: React.ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const migrationState = useMigrations(dbInstance, migrations);

  // Seeds run after migrations succeed, exactly once per app session. A ref
  // guards against React 19 strict-mode double-invocation in dev.
  const seededRef = useRef(false);
  const [seedState, setSeedState] = useState<{
    done: boolean;
    error?: Error;
  }>({ done: false });

  useEffect(() => {
    if (!migrationState.success) return;
    if (seededRef.current) return;
    seededRef.current = true;

    (async () => {
      try {
        await seedStarterCategories(dbInstance);
        await seedDefaultWallets(dbInstance);
        setSeedState({ done: true });
      } catch (err) {
        setSeedState({ done: false, error: err as Error });
      }
    })();
  }, [migrationState.success]);

  if (migrationState.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Database migration failed: {migrationState.error.message}
        </Text>
      </View>
    );
  }

  if (seedState.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Database seed failed: {seedState.error.message}
        </Text>
      </View>
    );
  }

  if (!migrationState.success || !seedState.done) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={dbInstance}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDb(): ExpoSQLiteDatabase {
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
