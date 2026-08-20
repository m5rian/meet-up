# Build Plan

Tick a box when a task is done. Phases are meant to be completed in order. Full context lives in `CORE.md` (functionality) and `ARCHITECTURE.md` (code structure). The schema referenced below lives in the architecture doc.

---

## Phase 0 — Scaffold

- [x] `npm create svelte@latest` (SvelteKit, TypeScript, Tailwind, **ESLint**, **Prettier**), configured with the Node adapter (`@sveltejs/adapter-node`) so it builds to a plain `node build/index.js` server.
- [x] Set up Drizzle + SQLite (`better-sqlite3` or `libsql`), enable WAL mode, write initial migration for the schema in the architecture doc.
- [x] Configure linting & formatting:
  - [x] `eslint.config.js` — enable `typescript-eslint` strict-type-check config, `eslint-plugin-svelte` for template linting, and an allowlist for `any`/`!` assertions (acceptable only in DB-migration and ICS-parsing internals where types are inherently dynamic).
  - [x] `prettier.config.js` — `plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss']`, `svelteSortOrder: "options-scripts-markup-styles"`, `tailwindPreserveWhitespace: true` (avoids Tailwind's default removal of whitespace in class strings).
  - [x] `package.json` scripts — `lint` (runs `eslint src/`), `format` (runs `prettier --write src/`), `format:check` (runs `prettier --check src/`).
  - [x] Add a **pre-commit hook** via `husky` + `lint-staged` that runs `prettier --check` and `eslint` on staged files — keeps commits clean even for solo development.
- [x] `start.sh` (or an npm script) that runs migrations then starts the server, plus a sample `systemd` unit file in the repo for operators to copy.

## Phase 1 — Accounts & core event flow (no calendar integration yet)

- [x] User accounts: register/login with **unique** username + password (argon2id, cookie session), profile picture (stored as a blob, resized to 32×32 on upload).
- [x] Profile page (`/profile`): upload/change the 32×32 profile picture, manage the user's own calendar integration (ICS URL or one-off file), and set the user's **sleep schedule** (recurring daily sleep window, `sleep_start` / `sleep_end` local times). The sleep window acts as a base busy block for the auto calendar and pre-fills the manual-override grid.
- [x] Create event (private or link), get shareable link. Creating an event auto-adds the organizer as a participant.
- [x] Invite registered users by name (private events) via a picker showing users + profile pictures; invited-but-not-opened participants show as "pending invite".
- [x] Join a link event as a participant; manual click-to-mark availability grid (this alone is a working When2Meet clone — a good milestone to validate the UI). Link-event participants who have joined but not responded are treated as free; private-event pending invites are excluded from the grid.
- [x] Aggregated heatmap rendering.
- [x] Events list: show events the user is invited to or joined.

## Phase 2 — ICS integration

- [x] ICS URL submission (per-user, on the profile page) with immediate fetch + background polling job (in-process scheduler, writes to `sync_jobs`).
- [x] ICS file upload parsing (one-off, no polling; uploaded on the profile page).
- [x] Convert VEVENTs → busy intervals (expand `RRULE` recurrences within range), merge with manual overrides (calendar data pre-fills, manual clicks take precedence).
- [x] Merge the user's **sleep schedule** as a base busy block into the availability computation (union with calendar blocks, minus manual free overrides), expanded to UTC per date with the same DST-aware logic as event time windows.
- [x] Sync-status UI: "last synced Xm ago" / "sync failed — check your ICS URL."

## Phase 3 — Finalize & invite

- [x] Organizer selects winning slot and sets the final meeting time (`finalized_start_ts` / `finalized_end_ts` on the event; guard so only the organizer can finalize, and validate the slot is within the event's range).
- [x] Build a shared `buildVevent(event)` helper: start/end as UTC, `SUMMARY` = event title, `UID` = event id, organizer reference, `STATUS:CONFIRMED`. Single instance only — no `RRULE`. No `LOCATION` for now (decision: omit it).
- [x] Generate a downloadable `.ics` invite for the chosen slot (reuses `buildVevent`).

## Phase 4 — Per-user calendar feed

A user subscribes to a private, dynamically-generated ICS feed of all their **finalized** meetings, so those meetings appear automatically in their calendar app. This mirrors the "secret address" every provider exposes and keeps the app OAuth-free. Depends on Phase 3 (finalized meetings). Design notes live in `ARCHITECTURE.md` §5.

- [x] Add `users.calendar_token` (random 32-byte base64url, secret, regenerable; `NULL` until generated).
- [x] `GET /calendar/<token>.ics` → `text/calendar`; token-authenticated (constant-time lookup, no session). Serves only meetings where the user is a participant AND `finalized_start_ts` / `finalized_end_ts` are set.
- [x] Profile page: show the feed URL with a copy button, plus a "regenerate" action that rotates the token (old feed URL stops working).
- [x] Per-event "Add to calendar" download reusing `buildVevent` (same helper as Phase 3).

## Phase 5 — Polish

- [x] Timezone display polish, mobile-responsive grid.
- [x] Rate limiting, ICS-URL validation/SSRF hardening, error handling.
- [x] README with setup instructions and a per-provider guide to finding your ICS secret URL (Google/Outlook/Apple/Nextcloud/Radicale).
