# Heatmap Meeting Finder — Core Functionality

A self-hostable "When2Meet"-style tool where availability is visualized as a heatmap, but instead of manual clicking, each participant's grid auto-fills from their connected calendar (Google/Outlook/CalDAV/ICS). This doc is written as a spec + phased task list for a coding agent (e.g. Claude Code) to execute.

---

## 1. Product Summary

**Core flow:**
1. A logged-in user creates an event with a date range and time window (e.g. "next 2 weeks, 9am–6pm"). Events are either **private** (only invited users can see it) or **link-based** (any logged-in user with the link can join).
2. The organizer gets a shareable link and can invite users by name (optional).
3. Each participant opens the link (or finds the event in their list) and signs in. **Their calendar is configured once, per user, on their profile page** — they paste a private ICS URL or upload a one-off `.ics` file there, and they can set their **local sleep schedule** (a recurring daily sleep window). The tool auto-computes their free/busy blocks for every proposed window across all events they participate in, treating the sleep window as a base busy block. No manual clicking required (but manual override/edit per event should still be possible).
4. The group view renders a heatmap: darker cells = more people free at that time.
5. The organizer picks a slot and sets the final meeting time; the tool generates a downloadable `.ics` invite.

**Design principle:** never store raw calendar event details — only computed free/busy intervals. This keeps the privacy footprint small and makes self-hosting more defensible to security-conscious users.

---

## 2. Calendar Integration Strategy (ICS-only)

Single tier, deliberately:

- **ICS URL** — user pastes their calendar's private ICS "secret address" (every mainstream provider exposes one: Google Calendar → Settings → "Secret address in iCal format"; Outlook/Office365 → "Publish a calendar" → ICS link; Apple/iCloud → public calendar share link; Nextcloud/Radicale/Baïkal → the calendar's `?export` URL). This is stored per-user (see ARCHITECTURE.md) and managed on the profile page. Document how to find this per-provider on the profile page with short screenshots/links.
- **ICS file upload** — drag-and-drop `.ics` export, for anyone who'd rather not share a live URL, or whose provider doesn't expose one, or for one-off/offline use. Same parser as the URL path, just skips future polling.
- Backend fetches the URL periodically (poll every N minutes — configurable via `ICS_POLL_INTERVAL_MINUTES`, default 30; respect `Cache-Control`/`ETag` headers where the provider sends them to avoid unnecessary refetches).
- Parse VEVENTs → free/busy intervals only; discard `SUMMARY`/`DESCRIPTION`/`LOCATION` immediately after computing the busy range — never persist them.
- Handle recurring events (`RRULE`) by expanding occurrences within a fixed lookahead horizon (`NOW()` → `NOW() + 90 days`) intersected with the union of the active event date ranges the user participates in — `ical.js`/`node-ical` both support this, don't hand-roll RRULE math.
- No OAuth client registration, no CalDAV auth, no per-provider API integration — this is the whole calendar layer.

**Outbound (push to users' calendars):** finalized meetings are served back to each participant via a private per-user ICS feed they subscribe to in their own calendar app (see §4.1 and `ARCHITECTURE.md` §5). No push API is used — their provider polls the feed, which keeps this OAuth-free like everything else.

**Timezone handling:** each user's time zone is auto-detected from their browser and stored in `users.tz_id`; the organizer's is copied to `events.tz_id` at creation (the event's canonical time zone). Absolute meeting timestamps are stored as **UTC** (ISO 8601, `YYYY-MM-DDTHH:mm:ssZ`), while recurring daily time windows are stored as **local wall-clock times-of-day** (`HH:mm:ss`) and expanded to UTC dynamically per date. Never store fixed numeric offsets like `+04:00` as the primary time zone reference — offsets shift with Daylight Saving Time (DST). The client renders time-axis labels, day columns, and available slots in each viewer's local time zone; daily availability windows defined by the organizer are converted dynamically to the viewer's local equivalent. The full conversion algorithm, DST edge cases, grid day-boundary rules, and ICS parsing rules are specified in `ARCHITECTURE.md` §3.

---

## 3. Heatmap UI

- Grid: rows = time slots (configurable granularity: 15/30/60 min, default 15), columns = days in range. Rows and day columns are rendered in the viewer's local time zone; the organizer's daily availability window is projected onto the viewer's local axis (see `ARCHITECTURE.md` §3.3).
- Cell color intensity = `count(free participants at this slot) / total participants`.
- **Denominator / non-responders:** for **link events**, anyone who hasn't joined yet is excluded; anyone who has joined is treated as **free** by default (gaps in their calendar are assumed free). For **private events**, participants still holding a "pending invite" (`has_opened = 0`) are excluded from the grid entirely; once they've opened the invite they are counted as free by default. This same rule drives the "best slots" ranking.
- **Viewing vs. joining (link events):** a logged-in user can view a link event's heatmap without joining; they are simply not counted until they join.
- **Manual override editing:** the heatmap is read-only by default. An "edit" button enters editing mode. Clicking a cell marks it as a manual **busy** block; clicking an adjacent cell merges it into the same block; dragging expands a block into neighboring cells. A small toggle icon on a block flips it to a manual **free** override (busy: 0). Leaving editing mode saves the overrides. The grid pre-fills from the user's **sleep schedule** (their recurring daily sleep window, set on the profile page) and their calendar: sleep hours and calendar-busy hours start as busy, and the user can flip any of them to free (or add busy where they're actually unavailable).
- Hover/tap a cell → list of who's free / who's busy / who hasn't responded.
- Toggle: "heatmap" view vs "best slots" ranked list (top 5 slots sorted by availability %).
- Manual override: participant can click cells to correct auto-detected availability (e.g. mark a "tentative" event as actually free). Overrides are stored separately from calendar blocks and take precedence where they overlap: a manual "busy" block marks the user busy even if the calendar shows free, and a manual "free" block marks the user free even if the calendar shows busy.
- Blocking projection: any overlap between a busy block and a grid cell blocks the whole cell; gaps between blocks are assumed free.

---

## 4. Data Flows (implemented via loaders & form actions)

Per the architecture doc, the app exposes **no raw API endpoints**. Each of the operations below is realized as a SvelteKit server `load` (for reads) or a **form action** (for writes), so the client never makes direct API calls. Auth is a single external OIDC provider; aside from `/` and the `/auth*` routes, all routes and actions require a logged-in session:

```
Reads (server loaders)
GET   /                           sign-in page (redirects to OIDC provider)
GET   /auth                       start OIDC authorization-code flow (redirect to IdP)
GET   /auth/callback              OIDC callback: exchange code, upsert user, create session
GET   /events                     list of events the user is invited to or joined
GET   /events/new                 create-event form
GET   /events/:slug               public event + aggregated heatmap data (link events: any logged-in user; private: invited users only)
GET   /events/:slug/join          join form for a participant
GET   /profile                    current user's profile: picture upload + calendar integration management + sleep schedule
GET   /sync-status                 current user's last-synced time / last error, for the "last synced" UI

Writes (form actions, use:enhance)
POST  logout                      clear session
POST  create-event                create event (private or link), returns slug + shareable link
POST  invite                      invite a registered user by name (private events)
POST  join                        join a link event as a participant
POST  update-profile-picture      upload/resize a 32×32 profile picture
POST  update-timezone             set the user's IANA time zone
POST  submit-ics-url              submit/update a live ICS URL (per-user, triggers immediate fetch + starts polling)
POST  upload-ics-file             upload a one-off .ics file (parsed once, no polling)
POST  update-sleep-schedule       set/clear the user's recurring daily sleep window (sleep_start / sleep_end, local times)
POST  update-availability         manual overrides (per event)
POST  finalize                    organizer picks a slot → sets finalized_start_ts/end_ts (see §4.1) and generates a downloadable `.ics` invite
POST  regenerate-calendar-token   rotate the user's secret feed token (invalidates the old feed URL)

Public (no session)
GET   /calendar/<token>.ics       per-user private ICS feed of finalized meetings (token-authenticated, see §6)
```

### 4.1 Finalized meetings → per-user calendar feed

Once a meeting is finalized, participants should get it in their own calendars automatically. To stay OAuth-free, each user subscribes to a **private ICS feed** of their finalized meetings (ARCHITECTURE.md §5):

- **Finalize** (`POST finalize`): the organizer picks a slot; the app stores `events.finalized_start_ts` / `finalized_end_ts` (UTC) and returns a downloadable `.ics` invite.
- **Feed** (`GET /calendar/<token>.ics`): serves one `VEVENT` per finalized meeting the user participates in. `token` is a per-user secret (`users.calendar_token`), regenerable from the profile page.
- **Profile UX**: copy the feed URL + a "regenerate" button (rotates the token). New finalized meetings appear automatically once the user's calendar provider re-polls the feed.
- **Privacy**: the feed only ever contains titles and time ranges of **finalized** meetings — consistent with the tool's "free/busy only, no raw details" stance, but the title is intentionally included so the meeting is recognizable.

---

## 5. Security & Privacy Notes (important for a self-host tool)

- Encrypt stored ICS URLs at rest (AES-GCM, key from `ENCRYPTION_KEY`) — a private ICS address is a bearer secret for someone's whole calendar, treat it like a password.
- Never log ICS URLs or raw calendar payloads.
- Only persist computed busy/free intervals, not event titles/locations — call this out explicitly in the UI ("we never see your event details, only free/busy") since it's a strong selling point for an ICS-only, OAuth-free tool.
- Rate-limit ICS fetch/polling per user to avoid hammering upstream calendar providers (and to avoid the tool itself being used to hit arbitrary URLs — validate the submitted URL is `https://` and parse it with the same ICS library used for reading, as basic SSRF hygiene since the server is fetching a user-supplied URL).
- CSRF protection on all mutating form actions (SvelteKit's `use:enhance` uses the `Origin`-checked form post, and custom form actions carry an anti-CSRF token). The OIDC callback is a GET, so it is protected by the OIDC `state`/`nonce` parameters (stored in an httpOnly cookie, validated by `openid-client` on callback). Access is gated by the logged-in session cookie: private events are only viewable by invited users, and only the organizer can finalize.
- Provide a `.env.example` — auth requires `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (+ optional `OIDC_SCOPE`, `OIDC_USERNAME_CLAIM`, `OIDC_REDIRECT_URI`); calendar/ICS scope needs `DATABASE_PATH`, `ENCRYPTION_KEY` (hex, required), `BASE_URL`, `ORIGIN`, `ICS_POLL_INTERVAL_MINUTES` (default 30), `EVENT_TTL_DAYS` (default 7). Only `https://` ICS URLs are accepted (no `http://`).

---

## 6. Error Handling — Never Throw (Result Types)

**Core principle: prevent throwing errors at all costs.** A thrown error is treated as an **unexpected error** — it is not handled by the app and will break the site. Therefore, throwing must be reserved exclusively for genuinely unexpected, unrecoverable conditions (a programming bug, a corrupted DB, an impossible invariant). Every *expected* failure — a network timeout, a malformed ICS file, a missing row, an invalid input, a provider returning 500 — must be represented as **data**, not as an exception.

### Result type

Every function and every data-loading mechanism returns a dedicated result type that carries **both** the explicit errors and the actual data:

```ts
// src/lib/result.ts

export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export const ok = <T, E = Error>(data: T): Result<T, E> => ({ ok: true, data });
export const err = <T, E = Error>(error: E): Result<T, E> => ({ ok: false, error });
```

- **Every error is typed.** `E` is a concrete, named error type (a discriminated union of the possible failure modes for that operation), never `unknown` and never a bare `string`. No error remains untyped.
- **Every function types its errors.** The signature of each function declares exactly which errors it can produce, so callers know and handle every possible failure up front. If a function can fail in several ways, `E` is a union of those specific error types.
- **Callers must handle both branches.** Because the result is a discriminated union, TypeScript forces the caller to narrow on `ok` and handle the `error` case — there is no way to silently ignore a failure.

### Where this applies

- **Server loaders** (`+page.server.ts` / `+layout.server.ts` `load`): return a `Result`-shaped payload (or a discriminated union of success/error states) down to the component, so the UI renders the appropriate error state instead of crashing.
- **Form actions:** validate and return typed errors to the form (via `fail(...)` with typed fields), never throw for expected validation failures.
- **Data access / DB queries:** wrap reads and writes so missing rows, constraint violations, and connection failures come back as typed errors.
- **ICS fetching & parsing:** network failures, timeouts, invalid URLs, and malformed calendar data are all expected outcomes — each is a typed error, never a throw.
- **Calendar sync / background jobs:** record failures as typed errors in the `sync_jobs` table for the "last synced / last error" UI.

### What may still throw

Only truly unexpected conditions may throw, and they should be caught at the app boundary (a top-level error handler / SvelteKit `+error.svelte`) so the site degrades gracefully rather than crashing outright. If a throw is ever caught, it must be logged as an unexpected error — it is a bug to fix, not a control-flow path.

---

## 7. Build Plan

The phased, box-tickable build plan lives in `PLAN.md`. Tick the boxes there as each task is completed.