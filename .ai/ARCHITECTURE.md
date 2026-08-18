# Heatmap Meeting Finder — Code Structure & Architecture

This doc covers the tech stack, data model, and repository layout for the Heatmap Meeting Finder. For what the product does and how it's built out phase-by-phase, see `CORE.md`. For how UI markup is turned into Svelte components (naming, props, shared types), see `UI_COMPONENTS.md`.

---

## 1. Tech Stack Recommendation

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | SvelteKit (single app, `+page.server.ts` / `+layout.server.ts` loaders + `+page.server.ts` form actions) | One runtime, one process — ideal for a self-host tool run directly on a machine |
| Language | **TypeScript everywhere** — strict mode, no `any`/`!` except an allowlisted few | Catches type errors at build time; SvelteKit is fully typed end-to-end (loaders, actions, `$page`/`$props` data) |
| DB | SQLite (via `better-sqlite3` or `libsql`) + Drizzle ORM | Zero external DB service to run — huge win for self-hosting; single file, trivial backups (`cp data.db backup.db`) |
| Background jobs | In-process scheduler (`node-cron` or a simple `setInterval` loop) writing to the `sync_jobs` table for status | Avoids requiring Redis; fine at the scale this tool operates (dozens–hundreds of participants, not millions) |
| Calendar sync | ICS URL polling only — no OAuth, no CalDAV client | Every mainstream calendar (Google, Outlook/Office365, Apple, Fastmail, Nextcloud, Radicale, Baïkal) exposes a private ICS "secret address." Supporting only this cuts out all OAuth app registration, token storage/refresh, and CalDAV auth complexity — the repo needs zero third-party API credentials to run |
| Deployment | Run directly with Node — `npm run build && node build`, kept alive with a process manager (e.g. systemd unit or `pm2`) | No container runtime required at all; matches "we just run it directly" |
| Image processing | `sharp` | Resize profile pictures to 32×32 on upload |
| Calendar parsing | `ical.js` or `node-ical` | ICS VEVENT parsing → free/busy intervals; also used to validate submitted ICS URLs |
| Linting | ESLint with `typescript-eslint` + `eslint-plugin-svelte` | Catches type errors, unused imports, and Svelte-specific anti-patterns at build/CI time |
| Sessions | SvelteKit native cookie sessions | Cookie-based auth, no extra session library |
| Formatting | Prettier with `prettier-plugin-svelte` + `prettier-plugin-tailwindcss` | Auto-formatting that respects Svelte template syntax and Tailwind class ordering — enforced consistently across the team (or solo agent sessions) |

This is a deliberately narrow scope: no OAuth client IDs/secrets to register, no token refresh logic, no per-provider API quirks. The tradeoff is that participants must know how to find their calendar's private ICS URL (a short one-time setup step, well documented per-provider in the app's onboarding UI) rather than clicking "Sign in with Google."

### TypeScript & server-side data loading

- **TypeScript everywhere, strict.** The whole codebase is TypeScript (`.ts` / `.svelte` with `lang="ts"`). `strict: true` in `tsconfig.json`; `any`/`!` assertions are disallowed except in an allowlisted set of DB-migration and ICS-parsing internals where types are inherently dynamic (see the ESLint config in `PLAN.md`).
- **All data is loaded on the server.** Because this is a Node environment, every page loads its data in `+page.server.ts` (and shared data in `+layout.server.ts`) `load` functions. The client never fetches directly from the database or from third-party services — server loaders read the DB, fetch/parse ICS, and pass fully-shaped data down to components via `$props`/`$page.data`. This keeps secrets (encryption key, ICS URLs) and DB access strictly server-side.
- **No raw API routes.** The app exposes no `+server.ts` REST endpoints for its own functionality. All mutations go through SvelteKit's **enhanced form actions** (`use:enhance`), which handle progressive enhancement, pending states, and validation automatically. A `+server.ts` route is added only when truly required (e.g. a webhook or a non-form client that can't use forms) — and even then it's the exception, not the default.

---

## 2. Data Model (SQLite via Drizzle)

```
users(id, username UNIQUE, password_hash, profile_picture, tz_id, sleep_start, sleep_end, created_at, calendar_token)
       -- tz_id = user's auto-detected IANA time zone ID (e.g. 'America/New_York'), captured from the browser
       -- sleep_start / sleep_end = LOCAL wall-clock times-of-day 'HH:mm:ss' (e.g. '23:00:00' / '07:00:00'),
       --   the user's recurring daily sleep window, interpreted in the user's tz_id; NULL = no sleep block set.
       --   Overnight windows (sleep_end < sleep_start) span midnight, per the same rule as event time windows (§3.2).
       -- calendar_token = random secret used to authenticate the user's private ICS feed (see §5). NULL until generated.
       --   Regenerable; rotating it invalidates the old feed URL.

events(id, slug, organizer_id, title, visibility text[private|link], tz_id,
       date_range_start, date_range_end, time_window_start, time_window_end,
       slot_granularity_minutes, finalized_start_ts, finalized_end_ts, created_at)
       -- tz_id = organizer's auto-detected IANA time zone ID (the event's canonical time zone)
       -- date_range_start / date_range_end = date-only ISO strings 'YYYY-MM-DD', interpreted in the event's tz_id;
       --   the range opens at 00:00:00 on start date and closes at 23:59:59 on end date within tz_id
       -- time_window_start / time_window_end = LOCAL wall-clock times-of-day as 'HH:mm:ss' (e.g. '09:00:00' / '18:00:00'),
       --   NOT absolute UTC datetimes; the UTC equivalent is derived dynamically per date (see §3.2)

participants(id, event_id, user_id, has_opened integer, created_at)
calendar_blocks(id, user_id, start_ts, end_ts, is_floating integer)  -- busy intervals from the user's calendar
       -- is_floating = 1 for ICS floating times (no Z / no TZID); 0 for resolved UTC timestamps
manual_blocks(id, participant_id, start_ts, end_ts, busy integer)  -- user overrides per event
sync_jobs(user_id, last_success_at, last_attempt_at, last_error)   -- PK = user_id
```

Notes for SQLite specifically:
- **Timestamps.** SQLite has no native `TIMESTAMPTZ` type, so all absolute timestamps are stored as ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ssZ`, TEXT) — never fixed numeric offsets like `+04:00`, since offsets shift with Daylight Saving Time (DST). The canonical time zone is stored separately as an IANA time zone ID string (`events.tz_id`, e.g. `America/New_York`).
- **Daily time windows are NOT absolute timestamps.** `events.time_window_start` / `events.time_window_end` are local wall-clock times-of-day (`HH:mm:ss`) interpreted in the event's `tz_id`; their UTC equivalent is derived dynamically per target date (see §3.2).
- **Date ranges are date-only.** `events.date_range_start` / `events.date_range_end` are stored as `YYYY-MM-DD` strings interpreted in the event's `tz_id`; the range opens at `00:00:00` on the start date and closes at `23:59:59` on the end date within `tz_id`.
- **User time zones.** Each user's time zone is auto-detected from their browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and stored in `users.tz_id`. The organizer's `users.tz_id` is copied to `events.tz_id` at event creation (the event's canonical time zone).
- **Sleep schedule (per-user base busy block).** Each user can set a recurring daily sleep window (`users.sleep_start` / `users.sleep_end`, local wall-clock `HH:mm:ss` interpreted in `users.tz_id`). It is a per-user setting managed on the profile page alongside the profile picture and calendar connection. When set, the sleep window is treated as a **base busy block** for the user's availability: it is merged into the auto calendar (the user is busy during sleep hours regardless of what their calendar shows) and it pre-fills the manual-override grid as busy. Manual overrides still take precedence — a manual `busy: 0` block can mark a sleep hour as actually free, and a manual `busy: 1` block can mark a non-sleep hour as busy. The sleep window is expanded to UTC dynamically per date using the same DST-aware logic as event time windows (§3.2), including overnight windows that span midnight. It is per-user (not per-event), so it applies to every event the user participates in, exactly like `calendar_blocks`.
- **Accounts are required.** Every user has a `users` row identified by `username` + `password_hash`. Usernames are **unique** — they are the login identifier, and are capped at **32 characters**. Passwords are hashed with **argon2id** and must be **at least 12 characters** and contain **at least one number, one alphabetical character, and one symbol**. No email on file. Each user has a `profile_picture` so people can recognize each other at a glance.
- **Profile pictures** are stored as blobs in the DB, always resized to **32×32** on upload (no other sizes are kept).
- **Access is managed through the logged-in user** (`events.organizer_id` and `participants.user_id` reference `users`) — there are no shareable edit tokens. Sessions use cookies.
- **Two event types, both with a link:** `visibility = 'link'` events are joinable by any logged-in user via the link; `visibility = 'private'` events are only viewable by users who are invited (membership tracked in `participants`). The `slug` is a non-secret identifier: it points to an event, but without access (login + invitation for private events) nothing can be derived from it.
- **Inviting by name** shows a picker of **existing, registered users** (matched by username, shown with their profile pictures). You cannot invite a user who hasn't registered yet.
- `busy` and `has_opened` as `integer` (0/1) since SQLite has no boolean type.
- Enable **WAL mode** (`PRAGMA journal_mode = WAL;`) on startup — allows concurrent reads while the ICS polling job writes, which matters for the heatmap-polling read pattern.
- **The calendar is owned by the user, not the event.** `users.ics_url_enc` holds the user's one ICS URL, and `calendar_blocks` (busy intervals) plus `sync_jobs` (sync status) are all per-user. The same availability is projected onto every event a user participates in, clipped to that event's date range. Making it per-user means a user sets up their calendar once (on their profile) instead of re-entering it per event, and there are no correctness issues: availability is computed per event range, and per-event manual overrides still allow tailoring.
- **ICS URL vs. uploaded file (mutually exclusive).** Uploading an `.ics` file clears the user's ICS URL. File-derived `calendar_blocks` persist until the user either uploads a new file or sets a calendar URL.
- **`calendar_blocks` are rebuilt on every successful poll** (or file parse) so they always reflect the most recent version of the calendar — they are not merged incrementally.
- **Availability is split into two tables.** `calendar_blocks` holds the busy intervals computed from the user's calendar (the ICS parser discards `SUMMARY`/`DESCRIPTION` immediately after computing them — never persisted). `manual_blocks` holds the user's **per-event** manual overrides, each with a `busy` flag (0 = actually free, 1 = actually busy). Manual overrides take precedence over calendar blocks where they overlap. `manual_blocks.start_ts` / `end_ts` are always stored as absolute UTC timestamps, matching the grid's underlying UTC duration.
- **Organizer is always a participant.** Creating an event auto-adds the organizer to `participants` so they can mark their own availability.
- **Invitation state.** `has_opened` is tracked on every event type for simplicity, but it only affects the heatmap for **private** events. A private event's invited users get a `participants` row immediately on invite, but with `has_opened = 0` — they show as "pending invite" and are excluded from the heatmap. Opening the event page flips `has_opened = 1`; from then on they are counted as available by default (subject to any busy blocks). For link events, a `participants` row is created on join and the user is counted from then on.
- **Manual override precedence (explicit):** `manual_blocks` always wins over `calendar_blocks` where they overlap. A `busy: 1` manual block marks the user busy for that range even if the calendar shows them free; a `busy: 0` manual block marks the user free for that range even if the calendar shows them busy. Where a manual block overlaps a calendar block, the calendar block is ignored for that range.
- **Blocking projection:** any overlap between a block and a grid cell blocks the whole cell; gaps between blocks are assumed free.
- `ics_url_enc` (on `users`): encrypt at rest with AES-GCM (Node's built-in `crypto`). The key is a **hex string passed via the `ENCRYPTION_KEY` env var**; the AES-GCM nonce is **prepended to the ciphertext** in the stored value. No key rotation. A calendar's private ICS address is effectively a bearer secret (anyone with it can read the full calendar), so treat it with the same care as a password.
- `sync_jobs` is **one row per user** (no poll history): it records when the last poll attempt happened, when the last *successful* poll happened, and the last error — enough to render "last synced Xm ago" and "sync failed".
- **Events expire:** an event is removed after a predefined lifetime set in the env file (e.g. `EVENT_TTL_DAYS`), which also stops the ICS polling job from polling long-over events. The in-process scheduler runs this expiry cleanup.
- Back up by copying the `.db` file (ideally with `VACUUM INTO` for a consistent snapshot) — document a cron-friendly backup script in the README.

---

## 3. Time Zones, Daily Time Windows & Grid Rendering

### 3.1 Time zone capture

- **User time zones are auto-detected from the browser** via `Intl.DateTimeFormat().resolvedOptions().timeZone` and stored in `users.tz_id` (e.g. `America/New_York`).
- **Event time zone:** at event creation, the organizer's `users.tz_id` is copied to `events.tz_id` — the event's canonical time zone.
- Never store fixed numeric offsets like `+04:00` as the primary time zone reference — offsets shift with Daylight Saving Time (DST).

### 3.2 Recurring daily time windows

Recurring daily time windows MUST NOT be stored as absolute UTC datetimes. They are stored as **wall-clock times-of-day** alongside the canonical `tz_id`:

- `time_window_start`: local time string `HH:mm:ss` (e.g. `09:00:00`).
- `time_window_end`: local time string `HH:mm:ss` (e.g. `18:00:00`).
- `tz_id`: IANA time zone ID string (e.g. `America/New_York`).

**Dynamic UTC expansion (per target date `D`):** because the UTC representation of a daily window shifts across DST transitions, convert the local wall-clock window to UTC dynamically per date during query/grid evaluation:
1. Combine date & local time: `LocalStart = D + time_window_start`, `LocalEnd = D + time_window_end`.
2. Apply DST rules: evaluate the active UTC offset for `LocalStart` and `LocalEnd` on date `D` in `tz_id`.
3. Derive UTC range: `UTCStart = ConvertToUTC(LocalStart, tz_id)`, `UTCEnd = ConvertToUTC(LocalEnd, tz_id)`.

**Overnight / cross-midnight windows:** if `time_window_end` is numerically smaller than `time_window_start` (e.g. `22:00:00` → `06:00:00`), the window spans midnight: `LocalStart` belongs to date `D`, while `LocalEnd` belongs to date `D + 1 day`. Calculate UTC bounds using their respective target dates before generating the query interval.

**DST edge cases (applies to any local → UTC conversion):**
- **Ambiguous local time (fall back):** if the local time falls during a repeated hour due to a DST fall-back transition (e.g. 01:30 AM occurring twice), resolve to the first occurrence (standard/pre-transition time).
- **Invalid local time (spring forward):** if the local time falls within a skipped hour due to a DST spring-forward gap (e.g. 02:30 AM does not exist), advance to the first valid time (03:00 AM) before converting to UTC.

### 3.3 Dual-axis grid rendering (participant-centric)

The calendar grid uses a **participant-centric axis** by default, with **organizer reference context** overlaid.

- **Time-axis labels (rows):** rendered in the **viewer's/participant's local time zone**.
- **Day-axis columns:** rendered in the **viewer's/participant's local calendar dates**.
- **Window overlay (shaded bounds):** the organizer's daily availability window (e.g. 9am–6pm in `organizer_tz`) is projected into the viewer's local time axis, shifting numerically to match the participant's local clock.

**Concrete example (cross-time-zone viewing):**
- Organizer in `America/New_York` (UTC-4) sets availability `09:00 – 18:00`.
- Participant in `Europe/London` (UTC+1) views the grid (offset +5h).
- **Time axis (rows):** displays `00:00` to `23:59` London time.
- **Availability window (shaded rows):** the organizer's `09:00 – 18:00 EDT` window is converted and highlighted on the participant's grid as `14:00 – 23:00 BST`.
- **Contextual badge:** the header shows an explicit reference label, e.g. *"Organizer window: 9:00 AM – 6:00 PM EDT (14:00 – 23:00 your time)"*.

**Grid day boundaries:** day columns are anchored to the participant's local midnight (NOT UTC midnight). For querying, the stored UTC timestamps are filtered between `SOD_UTC = ConvertToUTC(Date 00:00:00.000, participant_tz)` and `EOD_UTC = ConvertToUTC(Date 23:59:59.999, participant_tz)`, then mapped into the participant's local time zone for display.

**Grid continuity:** if a meeting spans across the participant's local midnight due to a timezone offset, render the event across two adjacent display days while retaining the underlying UTC duration.

### 3.4 ICS parsing & calendar block updates

When parsing `.ics` files to update `calendar_blocks`, process event times according to their explicit time format:

- **UTC times** (`DTSTART:20261015T130000Z`): parse directly as ISO 8601 UTC strings; store with `is_floating = false`.
- **Timezone-bound times** (`DTSTART;TZID=...`): resolve `TZID` against IANA names or embedded `VTIMEZONE` transition rules; convert the local datetime to UTC using the target offset on that date; store the resolved UTC timestamp.
- **Floating times** (`DTSTART:20261015T090000` — no `Z` or `TZID`): do NOT convert to UTC; store the plain wall-clock string (`YYYY-MM-DDTHH:mm:ss`) and set `is_floating = true`.

**Busy interval evaluation:**
- **Fixed UTC blocks** (`is_floating = false`): evaluate collisions using standard absolute UTC timestamp overlap against booking slots.
- **Floating blocks** (`is_floating = true`): evaluate collisions directly against local wall-clock hours in the **calendar owner's** local time zone grid (e.g. a `09:00–10:00` floating event blocks `09:00–10:00` local time in the owner's `tz_id`, regardless of timezone offset). Because the grid is participant-centric, the resulting busy interval is then projected onto the viewer's local axis like any other block.

**Clipping floating blocks to an event's date range:** a floating block's `start_ts`/`end_ts` are wall-clock ISO strings (`YYYY-MM-DDTHH:mm:ss`, `is_floating = 1`). To clip one to an event's range, first project the event's `date_range_start` / `date_range_end` into the **calendar owner's** local wall-clock time (i.e. convert the event's date-range bounds into the owner's `tz_id`). Matching then happens purely on the owner's date level (`YYYY-MM-DD`), comparing the block's local date portion against the projected bounds — no offset conversion is applied to the block itself.

**Recurring-event (RRULE) expansion range:** recurring events are expanded within a fixed lookahead horizon (`NOW()` through `NOW() + 90 days`) intersected with the union of the active event date ranges the user participates in. This bounds background sync while ensuring every visible event window is covered.

### 3.5 Sleep schedule as a base busy block

The user's sleep window is a per-user recurring daily window that behaves like an always-on busy block. It is stored as local wall-clock times-of-day (`users.sleep_start` / `users.sleep_end`, `HH:mm:ss`) interpreted in `users.tz_id`, and expanded to UTC dynamically per date using the exact same algorithm as event time windows (§3.2) — including the overnight rule (`sleep_end < sleep_start` spans midnight) and the DST ambiguous/invalid-time handling.

**Merge into availability (free/busy computation):** a user's final busy state for a given grid cell is the union of busy sources minus any manual free override:

```
busy = ( sleep_window ∪ calendar_blocks ∪ manual_busy_blocks ) − manual_free_blocks
```

- **Sleep window** is the base: if set, the user is busy during those hours even if their calendar shows them free, and the manual-override grid pre-fills those cells as busy.
- **`calendar_blocks`** (from ICS) add busy on top of the sleep base.
- **`manual_busy_blocks`** (`busy: 1`) add busy and override any free state.
- **`manual_free_blocks`** (`busy: 0`) carve out free time and override any busy state — including sleep hours, so a user can explicitly mark a sleep hour as actually available.

Because the sleep window is per-user and recurring, it is projected onto every event the user participates in (clipped to each event's date range), exactly like `calendar_blocks`. It is not stored per-event and requires no calendar sync — it is always available as soon as it is set.

---

## 4. Repository Layout

Repository layout (single SvelteKit app, but structured so calendar-sync logic is cleanly separable if you ever want to extract a worker process):

```
/
├─ src/
│  ├─ routes/                # pages: +page.svelte / +page.server.ts (load + actions), +layout.svelte / +layout.server.ts
│  ├─ lib/
│  │  ├─ server/
│  │  │  ├─ db/              # Drizzle schema + client
│  │  │  ├─ calendar/        # ics.ts (fetch + parse), free-busy.ts (compute merged intervals)
│  │  │  └─ jobs/            # scheduler + ICS polling job definitions
│  │  └─ components/         # Heatmap.svelte, AvailabilityGrid.svelte, etc.
├─ drizzle/                  # migrations
├─ .env.example
└─ package.json              # single package.json — no workspaces needed for this scope
```

A true multi-package monorepo (pnpm workspaces with separate `packages/db`, `packages/calendar-sync`, `apps/web`) is reasonable if you want to later ship the calendar-sync logic as a standalone worker for scale — mention this as a Phase 7+ option, but don't build it up front. Start as one SvelteKit package; split later only if you actually hit SQLite's concurrency limits (unlikely at this tool's scale — SQLite in WAL mode handles the read-heavy heatmap-polling pattern fine).

---

## 5. Finalized meetings → per-user calendar feed

**Goal:** once a meeting is finalized, each participant gets it pushed automatically into their own calendar. To stay OAuth-free and in keeping with `CORE.md` §2, we don't push to Google/Outlook/Apple directly. Instead every user gets a **private, dynamically-generated ICS feed** of their finalized meetings; they subscribe to it in their calendar app exactly like the "secret address" every provider exposes. Their provider polls the feed periodically, so new finalized meetings show up automatically.

### 5.1 Finalize (prerequisite)

Finalizing records the chosen slot on the event so the feed (and a one-off invite) can serve it:

- Only the **organizer** can finalize. Store the chosen slot as `events.finalized_start_ts` / `events.finalized_end_ts` (UTC ISO strings). Validate the slot is inside the event's `date_range_*` and `time_window_*` and is aligned to `slot_granularity_minutes`.
- Clearing/re-picking a slot updates the two columns in place; no history table needed for now.
- **No `LOCATION` is stored or rendered** (decision for now — title + start/end + organizer reference only). If locations are wanted later, add an `events.location` column and include `LOCATION` in the feed/invite.

### 5.2 Auth token (`users.calendar_token`)

- A random 32-byte value, stored base64url, treated as a **bearer secret** (anyone with it can read the user's finalized meetings).
- `NULL` until generated; **regenerable** from the profile page — rotating it immediately invalidates the old feed URL.
- Constant-time lookup on the feed route; no session/cookie required (calendar providers fetch without one).

### 5.3 Feed route

`GET /calendar/<token>.ics` → `Content-Type: text/calendar; charset=utf-8`.

- Resolve the token to a user; unknown token → `404`.
- Query the events where the user is a participant (`participants.user_id`) **and** `finalized_start_ts` / `finalized_end_ts` are both set.
- Generate one `VEVENT` per finalized meeting via a shared `buildVevent(event)` helper: `DTSTART`/`DTEND` as UTC (`YYYYMMDDTHHMMSSZ`), `SUMMARY` = `events.title`, `UID` = `events.id`, `STATUS:CONFIRMED`, organizer reference from `events.organizer_id`.
- Single instances only — no `RRULE` expansion needed for finalized one-off meetings. If a future feature finalizes recurring meetings, revisit this.
- The feed contains only **finalized** meetings (decision); tentative/pending are excluded.

### 5.4 Reuse: per-event download

`buildVevent` is also used by the one-off "Add to calendar" `.ics` download (Phase 3), so both paths share identical output and stay in sync.

### 5.5 Profile UX

- Show the feed URL with a **copy** button.
- A **regenerate** action that rotates `calendar_token` (old URL stops working).
- Note in the UI that the URL is secret and that new finalized meetings appear automatically once the provider re-polls.