# Build Plan

Tick a box when a task is done. Phases are meant to be completed in order. Full context lives in `CORE.md` (functionality) and `ARCHITECTURE.md` (code structure). The schema referenced below lives in the architecture doc.

---

## Phase 0 — Scaffold

- [ ] `npm create svelte@latest` (SvelteKit, TypeScript, Tailwind, **ESLint**, **Prettier**), configured with the Node adapter (`@sveltejs/adapter-node`) so it builds to a plain `node build/index.js` server.
- [ ] Set up Drizzle + SQLite (`better-sqlite3` or `libsql`), enable WAL mode, write initial migration for the schema in the architecture doc.
- [ ] Configure linting & formatting:
  - [ ] `eslint.config.js` — enable `typescript-eslint` strict-type-checked config, `eslint-plugin-svelte` for template linting, and an allowlist for `any`/`!` assertions (acceptable only in DB-migration and ICS-parsing internals where types are inherently dynamic).
  - [ ] `prettier.config.js` — `plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss']`, `svelteSortOrder: "options-scripts-markup-styles"`, `tailwindPreserveWhitespace: true` (avoids Tailwind's default removal of whitespace in class strings).
  - [ ] `package.json` scripts — `lint` (runs `eslint src/`), `format` (runs `prettier --write src/`), `format:check` (runs `prettier --check src/`).
  - [ ] Add a **pre-commit hook** via `husky` + `lint-staged` that runs `prettier --check` and `eslint` on staged files — keeps commits clean even for solo development.
- [ ] `start.sh` (or an npm script) that runs migrations then starts the server, plus a sample `systemd` unit file in the repo for operators to copy.

## Phase 1 — Accounts & core event flow (no calendar integration yet)

- [ ] User accounts: register/login with **unique** username + password (argon2id, cookie session), profile picture (stored as a blob, resized to 32×32 on upload).
- [ ] Profile page (`/profile`): upload/change the 32×32 profile picture, manage the user's own calendar integration (ICS URL or one-off file), and set the user's **sleep schedule** (recurring daily sleep window, `sleep_start` / `sleep_end` local times). The sleep window acts as a base busy block for the auto calendar and pre-fills the manual-override grid.
- [ ] Create event (private or link), get shareable link. Creating an event auto-adds the organizer as a participant.
- [ ] Invite registered users by name (private events) via a picker showing users + profile pictures; invited-but-not-opened participants show as "pending invite".
- [ ] Join a link event as a participant; manual click-to-mark availability grid (this alone is a working When2Meet clone — a good milestone to validate the UI). Link-event participants who have joined but not responded are treated as free; private-event pending invites are excluded from the grid.
- [ ] Aggregated heatmap rendering.
- [ ] Events list: show events the user is invited to or joined.

## Phase 2 — ICS integration

- [ ] ICS URL submission (per-user, on the profile page) with immediate fetch + background polling job (in-process scheduler, writes to `sync_jobs`).
- [ ] ICS file upload parsing (one-off, no polling; uploaded on the profile page).
- [ ] Convert VEVENTs → busy intervals (expand `RRULE` recurrences within range), merge with manual overrides (calendar data pre-fills, manual clicks take precedence).
- [ ] Merge the user's **sleep schedule** as a base busy block into the availability computation (union with calendar blocks, minus manual free overrides), expanded to UTC per date with the same DST-aware logic as event time windows.
- [ ] Sync-status UI: "last synced Xm ago" / "sync failed — check your ICS URL."

## Phase 3 — Finalize & invite

- [ ] Organizer selects winning slot and sets the final meeting time (stored on the event).
- [ ] Generate a downloadable `.ics` invite for the chosen slot.

## Phase 4 — Polish

- [ ] Timezone display polish, "best slots" ranked list, dark mode, mobile-responsive grid.
- [ ] Rate limiting, ICS-URL validation/SSRF hardening, error handling.
- [ ] README with setup instructions and a per-provider guide to finding your ICS secret URL (Google/Outlook/Apple/Nextcloud/Radicale).