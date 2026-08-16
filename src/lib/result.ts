/**
 * Result type — the app's universal error-handling primitive (CORE.md §6).
 *
 * Every expected failure is represented as data, never as a thrown exception.
 * A discriminated union forces callers to narrow on `ok` and handle the
 * `error` branch, so no failure can be silently ignored.
 */
export type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

export const ok = <T, E = Error>(data: T): Result<T, E> => ({ ok: true, data });
export const err = <T, E = Error>(error: E): Result<T, E> => ({ ok: false, error });
