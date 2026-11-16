# Forced to Wipe

A guild tracker for WoW Forever guilds. It reads the guild roster and per-character data from the Battle.net API, keeps its own history of level-ups and stats, and shows it in a small web UI with CSV export.

Runs as a Node server on your own machine, or as Firebase Hosting + Cloud Functions + Cloud Storage. Both modes share the same server code.

> **Screenshots:** placeholder. Add images under `docs/screenshots/` and link them here once the UI is final.

---

## What it does

- **Roster ledger** (`#/roster`): one row per member on desktop, one card per member under 880px. Shows level, item level, rank, main talent tree, up to two professions, last login (active / quiet / inactive), and last level-up. Search, class, rank and activity filters. Sort by clicking column headers (or the sort select on phones). Rows expand to show secondary skills.
- **Stats leaderboards** (`#/stats`): top five for Most deaths, Most quests, Most dungeons, Most boss kills, Most honorable kills, and Best BG win rate (minimum 2 played).
- **Stats heat matrix** (`#/stats`): one sortable table with grouped columns (Deaths | Quests | Dungeons & bosses | PvP) and per-level columns. Cells are shaded by rank within the column; column bests are bold. Rows expand to boss kills.
- **Boss board** (`#/stats`): guild kills per boss, grouped by instance, with which members killed it and how many times.
- **Level-up log** (`#/levelups`): entries grouped by day, filterable by member, with a "Most levels gained (7 days)" ranking. Times are approximate because detection runs at refresh time.
- **Member pages** (`#/member/<charId>`): level-over-time chart (inline SVG), levels gained in the last 7 and 30 days, professions, talents, statistics with guild rank (for example "#2 of 13"), and boss kills.
- **CSV export**: roster, stats and level-up log. Cells that start with `= + - @` are prefixed with `'` to block spreadsheet formula injection.
- **Refresh**: automatic on a schedule (every `refreshMinutes` locally, every 15 minutes on Firebase), plus a manual Refresh button with a 5-minute cooldown. A stale banner appears when data is out of date.

Level-ups are recorded from the second successful refresh onward. The first refresh only sets a baseline, so the log starts empty.

---

## Battle.net API credentials

You need a client ID and client secret from Battle.net. The app uses the client-credentials flow, so no user login is involved.

1. Go to <https://develop.battle.net> and sign in with your Battle.net account.
2. Open the API clients page and create a new client. Labels in the Blizzard portal change from time to time, so look for the "create client" action.
3. Fill in the name and any URL fields the form requires. This app does not use a redirect URL.
4. Copy the **client ID** and **client secret**. Treat the secret like a password: never commit it or paste it into chat or screenshots.

### WoW Forever specifics

- **Realmless.** WoW Forever has no realms. Guild and character paths carry no realm segment. The guild is identified by its **guild slug** alone. The roster call is `/data/wow/guild/<slug>/roster`.
- **Guild slug.** The lowercase, hyphenated guild name as it appears in the API, for example `forced-to-wipe`. `npm run setup` proposes one from the guild name. Check it matches what the API expects.
- **Namespace.** Characters use `profile-forever-<region>`, for example `profile-forever-us`. This is the default for `config.namespace`. Leave it at the default unless Blizzard changes it.
- **Undocumented API.** Blizzard does not publish WoW Forever endpoints or field names. Field names and statistic IDs may change without notice. All parsing lives in `server/blizzard.js` and `server/parse.js`. If a section fails to parse, the app keeps the last good data for that section and marks it stale. It does not crash. Sample responses are in `tests/fixtures/`.
- **Level 10 threshold.** Characters appear in the roster from level 1, but profile data only exists from level 10. Below 10 a member shows as a roster-only row with "Details appear at level 10." A 404 on the profile is treated the same way and is not an error.
- **Data lag.** In-game changes reach the API 20 to 40 minutes after they happen. The footer says so.

---

## Quick start (local)

Requirements: Node 18 or later. The root project has zero npm dependencies, so there is no `npm install` step.

```bash
npm run setup     # prompts for guild name, region, slug, client ID, secret
npm start         # serves on http://localhost:8810/
```

`npm run setup` writes `config.json` and `.env`, fetches a token and the roster to check the credentials, and prints the member count. Run it again to change settings. It merges over an existing `config.json`.

If `config.json` or the credentials are missing, the server answers every request with a "Setup required" page on port 8810 until you run setup and restart.

### config.json

Copy `config.example.json` to `config.json` (setup does this for you). Fields:

| Field | Default | Purpose |
|---|---|---|
| `guildName` | required | Display name. Also the default branding title. |
| `guildSlug` | required | Guild slug in the Blizzard API, for example `forced-to-wipe`. |
| `region` | `us` (or `BNET_REGION`) | Two-letter region: `us`, `eu`, `kr` or `tw`. |
| `namespace` | `profile-forever-<region>` | Blizzard namespace. See above. |
| `locale` | `en_US` | Locale for API responses. |
| `refreshMinutes` | `60` if absent; minimum `15` | Interval between automatic refreshes. The example file uses 15. |
| `port` | `8810` | HTTP port. |
| `host` | `0.0.0.0` | Bind address. |
| `basePath` | `""` | Mount path, for example `/guild`. See "Serving on a home network". |
| `branding` | title = guild name | `title`, `accent` (CSS colour), `logo`. |
| `activityDays` | `quiet: 3`, `inactive: 14` | Days since last login for the quiet and inactive thresholds. Under `quiet` is active. |
| `xpTable` | `true` | Parsed from config. No browser code reads it yet. |
| `dataDir` | `data` | Optional. Where JSON data is stored, relative to the repo root. |

The file may start with a UTF-8 BOM. Windows editors add one, and the loader strips it.

### .env

| Variable | Required | Purpose |
|---|---|---|
| `BNET_CLIENT_ID` | yes | Battle.net client ID. |
| `BNET_CLIENT_SECRET` | yes | Battle.net client secret. Never sent to the browser. |
| `BNET_REGION` | no | Used only when `config.json` has no `region`. |
| `ACCESS_CODE` | no | Enables a password gate for the local server. See below. |

Real environment variables with the same names override `.env`. Values may be wrapped in matching single or double quotes.

### Optional: ACCESS_CODE

Set `ACCESS_CODE` in `.env` and every page and API call except the login form requires it. The browser gets a cookie (`ftw_access`, HttpOnly, SameSite=Lax, 30 days) after a correct code. Login attempts are limited to 10 per minute per IP. This gate is local-only. Firebase mode does not support it.

### Other commands

- `npm run import-levelups <file.csv>`: backfills the level-up log from a CSV with the columns `Date, Name, Old level, New level`. Names match members by "Name" or "Name Surname". Imported rows get `source: "imported"`. Run one successful refresh first so members are known.
- `node --test "tests/*/*.test.js"`: runs the test suite (see Tests).

---

## Data storage and backup

Local data lives in `data/` at the repo root. It is gitignored. Every file is a JSON object of the form `{ "schemaVersion": 1, "data": ... }`. Writes go to a `.tmp` file and are then renamed into place, so a crash cannot leave a half-written file.

| File | Holds |
|---|---|
| `members.json` | Every character ever seen, keyed by Blizzard character ID: slug, name, surname, `firstSeen`, `leftAt` (null while in the guild), and `previousNames` for renames. |
| `current.json` | The latest snapshot the UI shows: refresh time and status, errors, guild name and count, and all members with their sections (profile, talents, professions, stats, PvP) and per-section `fetchedAt` and `stale`. |
| `levelups.json` | Append-only log of level changes: `id`, character, time, old and new level, `approx`, and `source` (`detected` or `imported`). |
| `history/YYYY-MM.json` | Per-character points (level, XP, item level, deaths, quests, honorable kills) by month. A point is added only when a value changes. |
| `meta.json` | Last attempt and success times, last manual refresh, consecutive failure count, and `seeded` (false until the first successful refresh). |

A file that fails to parse is renamed to `<name>.bad` and treated as empty. The server logs it.

**Backup (local):** stop the server, then copy the whole `data/` folder somewhere safe. Restoring means stopping the server and copying the folder back in. A copy taken while the server runs is usually consistent because of the atomic writes, but stopping it guarantees a clean snapshot.

**Backup (Firebase):** the data lives in your default Cloud Storage bucket under the `ftw/` prefix. Back it up with:

```bash
gcloud storage cp -r gs://<your-bucket>/ftw ./ftw-backup
```

---

## Firebase deployment

Hosting serves the UI, Cloud Functions serves `/api/**` and runs the refresh schedule, and Cloud Storage keeps the JSON data under `ftw/`. **This requires the Blaze (pay-as-you-go) plan.** The free Spark plan cannot deploy Cloud Functions or the scheduled refresh.

Steps (from `docs/FIREBASE.md`):

1. Install the functions dependencies: `npm i --prefix functions`
2. Log in: `firebase login`
3. Select a project: `firebase use <project>` (this creates `.firebaserc`)
4. Store the secret: `firebase functions:secrets:set BNET_CLIENT_SECRET`. Paste the secret when prompted. It goes to Google Secret Manager.
5. Create `functions/.env` containing `BNET_CLIENT_ID=<your client id>`. The client ID is not secret, but this file is gitignored.
6. Make sure `config.json` exists in the repo root with public values only. The deploy copies it to `functions/config.json`.
7. Deploy: `firebase deploy` or `npm run deploy`. The predeploy step runs `scripts/sync-functions.mjs`, which copies `server/` into `functions/server/`, copies `config.json`, and builds `public/` from `index.html`, `css/` and `js/`.
8. The first scheduled run, within 15 minutes, seeds the data. The UI shows "never refreshed" until then.

What runs where:

- `api` (HTTP function, us-central1, max 2 instances, 120 s timeout, 256 MiB) answers `/api/**`. Hosting rewrites those paths to it.
- `refreshHourly` is the scheduled function. Its name is stale: it runs **every 15 minutes**, not hourly.
- Both bind `BNET_CLIENT_SECRET` as a secret. The client ID comes from `functions/.env`.

Hosting headers come from `firebase.json`: CSP, `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, and `Cache-Control: no-cache`.

**Custom domain:** in the Firebase console, open Hosting, choose Add custom domain, and enter the domain. Create the DNS records the console shows at your registrar. Firebase then provisions the TLS certificate, which can take a while.

**Secret handling:** the client secret lives only in Secret Manager (Firebase) or `.env` (local). It is never written to `config.json`, `functions/config.json` or `public/`. The `.gitignore` covers `.env` at any depth, `config.json`, `functions/config.json`, `functions/server/`, `public/` and `.firebase/`.

---

## Serving on a home network (WebAppLib)

The local server can run on a home PC and be reached from your other devices over Tailscale.

1. Run `npm start` on the host. The host must stay awake: the refresh runs inside the server process, so data goes stale while it is off.
2. Install Tailscale on the host and on each device, and sign in to the same tailnet.
3. Open `http://<host-name>.<tailnet>.ts.net:8810/` from a tailnet device. The server listens on `0.0.0.0`, so Windows Defender Firewall may ask on first start. Allow it on Private networks only, or block 8810 on public networks.
4. To serve the app under a path on your personal site, set `"basePath": "/guild"` in `config.json`, restart, and have the site's reverse proxy forward `/guild/` to port 8810. With a base path set, the server strips the prefix and returns 404 for anything outside it. All front-end URLs are relative, so they work under the mount.
5. The WebAppLib entry that links to this app lives on the host's disk only. It is not part of this repository and is not committed.

A hidden path is not private. The server sends `noindex` headers, but anyone who has the URL can open the site. Use `ACCESS_CODE` for the local server if the URL is shared.

---

## Security notes

- **The client secret never reaches the browser.** `/api/config` returns only public values. The logger redacts the client secret and access tokens from every line.
- **CSP:** `default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`. The UI writes API strings with `textContent` only. The browser enforces the CSP, which blocks inline scripts and styles. Also sent: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`.
- **Rate limits:**
  - Manual refresh: 5-minute global cooldown, and 3 requests per minute per IP. Excess requests get `429` with `retryAfterSec`.
  - Login (with `ACCESS_CODE`): 10 attempts per minute per IP.
  - Blizzard `429`: honours `Retry-After` with jitter. After 3 in a row the cycle aborts and keeps the last good data.
- **No open proxy.** The server calls only fixed Blizzard URLs built from `config.json` and roster slugs. Slugs are URL-encoded. No client input reaches an upstream URL.
- **Static files** come from an allowlist: `index.html`, `css/` and `js/`. Path traversal returns 404. `data/`, `server/` and `.env` are never served.
- **Read-only, with one exception.** Member data cannot be edited through the API. The only write-style endpoint is `POST /api/refresh`, which anyone can call. It starts a Blizzard refresh and is rate-limited as above.

---

## Folder layout

```
.
├── index.html               app shell
├── config.example.json      copy to config.json
├── .env.example             copy to .env (or let npm run setup write it)
├── package.json             scripts and engines (root has zero dependencies)
├── firebase.json            Hosting rewrites, headers, functions source
├── PLAN.md                  build plan and edge-case decisions
├── API-CONTRACT.md          server/browser contract: members, endpoints, display rules
├── DESIGN.md                visual and UX direction
├── docs/
│   └── FIREBASE.md          Firebase deployment steps
├── css/                     base, layout, components, classes, stats, member, fonts/
├── js/
│   ├── app.js, api.js, router.js, dom.js, format.js, csv.js
│   ├── derive.js, member-model.js, roster-model.js, stats-model.js
│   └── views/               roster.js, stats.js, levelups.js, member.js
├── server/
│   ├── server.js            entry point (npm start)
│   ├── config.js            config.json and .env loading, defaults, validation
│   ├── setup.js             setup wizard (npm run setup)
│   ├── blizzard.js          token, fetch, retry, 429 handling
│   ├── parse.js             Blizzard JSON to member sections
│   ├── refresh.js           refresh cycle and scheduler
│   ├── diff.js              joins, leaves, renames, level-ups
│   ├── store.js             JSON files in data/, atomic writes
│   ├── store-memory.js      in-memory store for Cloud Functions
│   ├── routes.js            HTTP handler, API, access gate, security headers
│   ├── static.js            static file allowlist
│   ├── ratelimit.js         manual refresh limiter
│   ├── csv.js               CSV export and formula-injection guard
│   ├── static-data.js       class and race id maps
│   └── import-levelups.js   CSV backfill (npm run import-levelups)
├── functions/               Firebase Functions (own package.json)
│   ├── index.js             api and refreshHourly exports
│   ├── app.js               request and refresh wiring for Functions
│   └── storage.js           Cloud Storage load and save for ftw/
├── scripts/
│   └── sync-functions.mjs   predeploy copy into functions/ and public/
└── tests/
    ├── server/              blizzard, diff, parse, refresh, routes, store, csv, ratelimit
    ├── web/                 csv, derive, format, member, roster and stats models
    ├── functions/           handler, memory store, storage, sync
    └── fixtures/            real API samples (roster, guild, per-character JSON)
```

Generated at runtime or deploy time, not in git: `data/`, `public/`, `functions/server/`, `functions/config.json`, `.firebase/`, `.firebaserc`, `node_modules/`.

---

## Tests

```bash
node --test "tests/*/*.test.js"
```

`npm test` runs the same suite through `node --test tests/`. Tests use `node:test`, the fixtures in `tests/fixtures/` and a mocked `fetch`.

- `tests/server/`: Blizzard client, parsing, diffing (joins, leaves, renames, level-ups), refresh cycles, routes, store, CSV and rate limiting.
- `tests/web/`: pure browser models (derive, format, CSV, roster, member and stats models).
- `tests/functions/`: Cloud Functions handler, in-memory store, Cloud Storage adapter and the predeploy sync.

---

## Stack

- **Server:** Node 18 or later, `node:http`, global `fetch`, `node:test`. Zero npm dependencies in the root project.
- **Browser:** vanilla ES modules, no build step, no framework, no chart library.
- **Fonts:** Big Shoulders Display and IBM Plex Sans, bundled as WOFF2 in `css/fonts/`.
- **Firebase (optional):** Hosting, Cloud Functions and Cloud Storage, using the Firebase Admin and Functions SDKs in `functions/`.

---

## Troubleshooting

**"Setup required" page on startup.** `config.json` is missing or invalid, or `.env` lacks the client ID or secret. Run `npm run setup`, then restart.

**Token rejected (`token_401`).** The client ID or secret is wrong, or the secret was rotated. Check `.env` for stray spaces or truncated characters. The server log then shows `Refresh rejected: roster: token_401`. A `401` on a data call (code `401`) means the API rejected the token even after one refetch. Check the same credentials.

**`404` on the roster.** Wrong `guildSlug` or `region`. The log shows `Refresh rejected: roster: 404`. Re-check the slug. Run `npm run setup` again to validate it.

**`404` on a member under level 10.** This is expected. The member shows as a roster-only row with "Details appear at level 10." It is not counted as an error.

**`404` on a section for a member at level 10 or above.** The section is marked stale and the refresh status becomes `partial`. Check `errors` in `GET /api/state`.

**Stale banner and "partial" status.** Some sections failed to fetch or parse. The previous values are kept and marked stale. Check the `errors` array in `GET /api/state` for section and code. Blizzard field changes are the usual cause.

**No level-ups after the first refresh.** The first successful refresh only sets the baseline. Level-ups are recorded from the second refresh onward.

**Refresh button says "Refresh available in ...".** The 5-minute manual cooldown is active, or the IP has hit 3 requests per minute.

**`config.json` is "not valid JSON".** A byte-order mark is tolerated, so the cause is usually a trailing comma or a comment. Re-save the file as UTF-8 and check it with a JSON validator.

**Port 8810 already in use.** Change `port` in `config.json`. Find the holder with `netstat -ano | findstr :8810`.

**Windows: `npm` blocked by execution policy.** PowerShell may refuse `npm.ps1`. Run `npm.cmd` instead, or set the policy for your user with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**Windows: file writes fail intermittently.** If the repo is inside OneDrive or another sync folder, the sync client can lock `data/` files mid-rename. Keep `data/` outside synced folders, or exclude it from sync.

**Windows: `.env` permissions.** Setup writes `.env` with mode `0600`, which Windows does not enforce. Keep the repo folder private.

**Firebase deploy fails.** Check that the project is on the Blaze plan, that `firebase use` points at the right project, that `functions/.env` has `BNET_CLIENT_ID`, and that the secret was set. Function logs are in the Firebase console or via `firebase functions:log`.

**Firebase reports refresh status `never`.** The first scheduled run has not happened yet. It runs every 15 minutes. Check the logs for `Scheduled refresh:` lines.

---

## License

TBD. Placeholder until a license is chosen. The package is currently marked `"private": true`.
