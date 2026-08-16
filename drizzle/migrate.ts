/**
 * Runtime migration runner.
 *
 * Applies all pending Drizzle migrations to the SQLite database pointed at by
 * DATABASE_PATH, enabling WAL mode first (the same mode the app uses at startup).
 * Intended to be run before booting the server, e.g. via start.sh:
 *
 *   node --import tsx drizzle/migrate.ts && node build
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
	throw new Error('DATABASE_PATH is not set; nothing to migrate.');
}

// This script lives inside the drizzle/ directory, which is also where the
// migration journal (meta/_journal) and generated SQL files are checked in.
const migrationsFolder = dirname(fileURLToPath(import.meta.url));
const client = new Database(databasePath);
client.pragma('journal_mode = WAL');

const db = drizzle(client);
migrate(db, { migrationsFolder });

console.log('Migrations applied successfully.');
client.close();