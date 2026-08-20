/**
 * Lazily-initialized Drizzle + SQLite client.
 *
 * The database is NOT created at module load time. SvelteKit's build step (and
 * any module that imports this file) can run without `DATABASE_PATH` being set,
 * which would otherwise crash `vite build`'s post-build analysis. Instead, the
 * underlying better-sqlite3 connection is created on first actual access, at
 * runtime, via a Proxy.
 *
 * The Proxy returns every property bound to the real db instance so methods like
 * `db.select()` keep their correct `this` (which the query builders need to read
 * `.session` / `.dialect`). This preserves the exact `db.select(...)` API used
 * across the codebase with no call-site changes.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

/** The concrete type of the drizzle db instance this module exposes. */
type DatabaseInstance = ReturnType<typeof createDb>;

let dbInstance: DatabaseInstance | null = null;

/** Create the SQLite connection and configure pragmas. */
function createDb() {
	const dbPath = env.DATABASE_PATH;
	if (!dbPath) throw new Error('DATABASE_PATH environment variable is not set.');

	const client = new Database(dbPath);

	// WAL allows concurrent reads while the ICS polling job writes (ARCHITECTURE.md §2 / §4).
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');

	return drizzle(client, { schema });
}

/** Lazily resolve the real db instance (created once). */
function getDb(): DatabaseInstance {
	if (!dbInstance) dbInstance = createDb();
	return dbInstance;
}

/**
 * A Proxy that forwards every property access to the lazily-created db, binding
 * methods so `this` stays correct. Accessing any property on `db` triggers the
 * connection to be created.
 */
export const db: DatabaseInstance = new Proxy({} as DatabaseInstance, {
	get(_target, prop) {
		const instance = getDb();
		// Dynamic reflection over the db instance is inherently untyped; the
		// properties of a Proxy target can't be statically narrowed (db internals).
		const value = Reflect.get(instance, prop) as unknown;
		return typeof value === 'function'
			? (value as (...a: unknown[]) => unknown).bind(instance)
			: value;
	}
});

export { schema };
