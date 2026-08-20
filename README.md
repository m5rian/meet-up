# 📅 Meet-Up

A self-hostable "When2Meet"-style tool where availability is shown as a heatmap that
auto-fills from each participant's connected calendar (ICS URL or file upload). No
OAuth, no third-party accounts — just ICS.

## ✨ Features

- **Accounts**: username + password signup/login (argon2id), profile pictures, sessions.
- **Events**: private or link-based; invite users or share a link; auto-join organizer.
- **Heatmap**: participant-centric grid of free/busy, computed from everyone's calendars,
  sleep schedules, and manual overrides.
- **Multiple calendars**: connect any number of live ICS URLs and/or uploaded `.ics` files.
- **Finalize & invite**: the organizer clicks a slot to set the meeting time and
  downloads an `.ics` invite.
- **Per-user calendar feed**: each user gets a private ICS feed of their finalized
  meetings, so they appear automatically in the user's own calendar app.

## ✨ Setup (local)

Requirements: Node.js >= 22.

```sh
npm install
cp .env.example .env       # then fill in DATABASE_PATH and ENCRYPTION_KEY (required)
```

Generate an encryption key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run migrations, build, and start:

```sh
# one-shot: runs migrations, builds, and starts the server
./start.sh

# or step by step
npm run db:migrate:run
npm run build
npm start
```

For development:

```sh
npm run dev
```

### ✨ Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_PATH` | Path to the SQLite database file (WAL mode enabled). |
| `ENCRYPTION_KEY` | **Required.** Hex-encoded 256-bit key for encrypting stored ICS URLs at rest. |
| `BASE_URL` | Public base URL, used for shareable links and invite/feed URLs. |
| `ORIGIN` | The scheme + host browsers use to reach the app (CSRF checking + absolute URLs). |
| `ICS_POLL_INTERVAL_MINUTES` | How often (min) background jobs poll live ICS URLs. Default 30. |
| `EVENT_TTL_DAYS` | How many days an event lives before being expired. Default 7. |

## Deployment

A sample systemd unit is included at [`deploy/meet-up.service`](deploy/meet-up.service).
Copy it, adjust `User`/`WorkingDirectory`/`Environment` to your deployment, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now meet-up
```

The app is built to a plain `node build` server. Back up the SQLite DB file (ideally
with `VACUUM INTO` for a consistent snapshot). A load-tested reverse proxy (nginx /
caddy) in front is recommended to terminate TLS.

## Connecting a calendar (per-provider)

On your **Profile → Calendar** page you can add a live ICS URL or upload an `.ics` file.
The app only stores computed free/busy intervals — never your event titles or details.

To get the secret ICS address for your provider:

| Provider | How to find your ICS URL |
| --- | --- |
| **Google Calendar** | Settings → select the calendar → scroll to "Secret address in iCal format" → copy the `private-.../basic.ics` URL. Requires an ICS-only URL, not the HTML one. |
| **Outlook / Office 365** | Settings → Calendar → "Shared calendars" → "Publish a calendar" → choose ICS → copy the `.ics` link (e.g. `calendar.outlook.com/.../calendar.ics`). |
| **Apple iCloud** | iCloud Calendar → Share → Public Calendar → "Public URL" → copy the `webcal://pXX-caldav.icloud.com/.../calendar.ics` link. The app accepts `webcal://` and treats it as `https`. |
| **Nextcloud / Radicale / Baïkal** | Open the calendar's settings and copy the `?export` / webcal ICS URL, or build one from the CalDAV endpoint (`https://host/remote.php/dav/calendars/user/calname` with `?export`). |
| **Generic / other** | Any service that exposes a `https://` `.ics` export URL works. |

> Only `https://` URLs are accepted (`http://` is rejected). Uploaded files must be `.ics`.

## Automatically getting finalized meetings in your calendar

Once a meeting is **finalized**, you can subscribe to your private feed on the
**Profile → Calendar feed** page. Copy the feed URL and add it as a "New calendar by
URL" subscription in your calendar app (Google, Outlook, Apple, Thunderbird, ...).
New finalized meetings appear once your provider re-polls the feed. Treat the feed
URL as a secret — anyone with it can see your finalized meetings. Use
**Regenerate feed URL** to invalidate an old link.
