# Forced to Wipe: build plan

Planned by Fable (planning only), based on a baseline Opus pass. Built by Sonnet.

**Assumption:** the roster response includes a stable Blizzard character `id` per member; if it does not, key on the slug and accept that a rename looks like a leave plus a join.

## 1) Data model
All files live in `data/` (gitignored) and are written atomically (write `*.tmp`, then rename). Every file carries `schemaVersion`.

| File | Shape |
|---|---|
| `members.json` | `{ "<charId>": { id, slug, name, surname, firstSeen, leftAt\|null, previousNames:[{name,surname,until}] } }` |
| `current.json` | `{ refreshedAt, refreshStatus:"ok\|partial\|failed", errors:[{id,section,code}], guild:{name,memberCount}, members:[Member] }` |
| `levelups.json` | `[{ id:"<charId>-<newLevel>", charId, name, at, oldLevel, newLevel, approx:true, source:"detected\|imported" }]`, append-only |
| `history/YYYY-MM.json` | `{ "<charId>": [{ t, level, xp, ilvl, deaths, quests, hk }] }`, appended only when a value changed |
| `meta.json` | `{ lastAttemptAt, lastSuccessAt, lastManualRefreshAt, consecutiveFailures, seeded }` |

`Member` has one object per API section, each with its own `fetchedAt` and `stale` flag:
- **Top level:** `id, slug, name, surname, rank, classId, className, raceName, level, detailsAvailable`
- **`profile`:** `{ xp, ilvl, lastLogin, fetchedAt, stale }`
- **`talents`:** `{ trees:[{name,points}], fetchedAt, stale }`
- **`professions`:** `{ primary:[{name,skill,max}], secondary:[…], fetchedAt, stale }`
- **`stats`:** `{ deaths, quests, dungeons, bossKills, bosses:[{name,instance,count}], fetchedAt, stale }`
- **`pvp`:** `{ hk, bgs:[{name,played,won}], fetchedAt, stale }`

## 2) Views
A single page with a bottom tab bar and hash routes.

| Route | Shows |
|---|---|
| `#/roster` | Header strip (member count, average level, top member, latest level-up) and one card per member: class-colour stripe, level, XP bar, item level, last-login chip. Tap expands talents, professions and secondary skills. Has search, class/rank/activity filters, and sort by level, name, item level, last login or last level-up. |
| `#/stats` | Sortable table with a sticky name column: deaths, quests, dungeons, boss kills, HKs, BGs played/won/win %. Tap a row for the per-boss list. |
| `#/levelups` | Log grouped by day, filterable by member. Times are marked "≈" because detection is hourly. |
| `#/member/<id>` | Level-over-time chart as hand-drawn inline SVG (no chart library), levels in the last 7 and 30 days, full detail. |
| Footer | "Updated 23 min ago · game data lags 20–40 min", Refresh button with cooldown countdown, CSV export. |

Every view needs these states: loading skeleton, empty ("No level-ups recorded yet"), error with retry, and a stale banner when `lastSuccessAt` is older than twice the interval.

## 3) Derived values
Computed in `js/derive.js` as pure functions, loadable by both browser and tests.

- **Header:** average level to one decimal, highest member (tie-break on XP), latest level-up.
- **Last level-up per member:** the newest log entry, or "before tracking began".
- **XP to next:** the API gives no XP cap, so ship `server/xp-table.json` with the classic 1–60 values. Show percent and remaining; hide the bar if `xp` exceeds the table value or `config.xpTable` is false.
- **Activity flag:** active under 3 days since last login, quiet 3–14, inactive over 14. Thresholds live in config.
- **Progress:** levels per 7 and 30 days from history, and days since last level-up.
- **Rates:** BG win %, deaths per level.

## 4) Edge cases
| Case | Handling |
|---|---|
| New member | Add to `members.json` and set a baseline. No level-up entry is written. |
| Member leaves | Set `leftAt`, drop from `current.json`, keep log and history. Rejoining clears `leftAt`. |
| Under level 10, or profile 404 | Show a roster-only row with `detailsAvailable:false` and "Details appear at level 10". This is not counted as an error. |
| Sub-endpoint 404 or 5xx | Keep the previous section, set `stale:true`, and mark the refresh `partial`. |
| 429 | Honour `Retry-After` with jittered backoff. After 3 in a row, abort the cycle and keep the last good data. |
| Token expiry | Cache the token in memory until 60 s before expiry. On a 401, refetch once and retry. |
| Accented slugs | Use the roster's slug verbatim and pass it through `encodeURIComponent`. Never derive it from the name. |
| Name change | Same `id` with a new slug: update the record and push the old name to `previousNames`. |
| First run | `seeded:false` means baseline only, with no log entries. `npm run import-levelups <csv>` backfills from the old sheet with `source:"imported"`. |
| Multi-level jump | One entry (old → new). The entry id makes duplicates impossible. |
| Level decrease or zero roster | Treat as bad data and reject the entire cycle. |
| Roster call fails | Abort the cycle and leave `current.json` untouched. |
| Corrupt JSON | Rename to `.bad`, start empty, and log it. |

## 5) Refresh and rate limits
- **Cycle:** one roster call, then five calls per member with concurrency 3, a 10 s timeout, and two retries on 5xx. That is about 66 calls an hour, far below Blizzard's commonly cited limits (36,000 per hour, 100 per second); Sonnet should confirm the current figures.
- **Schedule:** refresh on boot if the data is older than the interval, then every `refreshMinutes` (minimum 15) using a `setTimeout` chain. A single-flight lock prevents overlapping cycles.
- **Manual refresh:** global 5-minute cooldown, plus 3 requests per minute per IP. Returns 429 with `retryAfterSec`.
- **Staging:** build the whole cycle in memory, then validate and commit it in one step.

## 6) Stack and layout
Node 18 or later, zero npm dependencies (`node:http`, global `fetch`, `node:test`), vanilla ES modules, no build step.

```
index.html  config.example.json  .env.example  README.md  package.json
css/   base.css  layout.css  components.css  classes.css
js/    app.js  api.js  router.js  derive.js  format.js  dom.js  csv.js
       views/roster.js  stats.js  levelups.js  member.js
server/ server.js  config.js  static.js  routes.js  blizzard.js  refresh.js
        store.js  diff.js  ratelimit.js  setup.js  import-levelups.js  xp-table.json
data/  tests/  tests/fixtures/
```

**`config.json`:** `{ guildName, guildSlug, region, namespace, locale, refreshMinutes, port, host, basePath, branding:{title, accent, logo}, activityDays:{quiet, inactive}, xpTable }`. `.env` holds only `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`.

**Endpoints** (all under `basePath`):

| Method and path | Returns |
|---|---|
| `GET /api/config` | Public branding only |
| `GET /api/state` | `current.json` plus meta and cooldown |
| `GET /api/levelups?limit=&charId=` | Log entries |
| `GET /api/history/:charId` | History points |
| `POST /api/refresh` | Triggers a cycle |
| `GET /api/export/roster.csv`, `/stats.csv`, `/levelups.csv` | CSV |
| `GET /api/health` | Status |

**Setup:** `npm run setup` is a readline wizard. It writes `config.json` and `.env`, fetches a token and the roster to validate them, and prints the member count. If config is missing, the server shows a "run npm run setup" page. There is no web form for secrets.

**README:** create a client at develop.battle.net, then setup, `npm start`, Tailscale URL, the `/guild` mount, troubleshooting, and the data-lag caveat.

**Security:**
- The server only calls fixed Blizzard URLs built from config and roster slugs; no client input reaches an upstream URL, so it cannot act as a proxy.
- Static files are served from an allowlist (`index.html`, `css/`, `js/`) with a traversal guard. `data/`, `server/` and `.env` are never served.
- The UI writes API strings with `textContent` only, through `dom.js`. CSP is `default-src 'self'`.
- CSV cells starting with `= + - @` get a `'` prefix.
- Logs never contain the secret or the token.

**Hidden `/guild` mount:**
- The server strips `basePath` and 404s anything outside it.
- All front-end URLs are relative, with no leading slash.
- Sends `X-Robots-Tag: noindex` and a robots meta tag.
- The personal site reverse-proxies `/guild/` to the port.
- The README must say that hidden is not private, and offer an optional `ACCESS_CODE` in `.env` for a cookie gate.

**Accessibility:**
- Contrast of at least 4.5:1. Class colours appear as a stripe or badge with a text label, never as coloured text on a dark background (Rogue yellow and Priest white would fail).
- Tap targets of at least 44 px.
- `prefers-reduced-motion` disables transitions.
- Semantic tables and buttons, visible focus, `aria-live` on the refresh status.
- Viewport is `width=device-width` with fixed tabs and no horizontal page scroll. The stats table scrolls inside its own container. Do not set `user-scalable=no`.

## 7) Build order, tests, verification
**Build order:**
1. `config.js` and `store.js`
2. `blizzard.js` (token, fetch, retry)
3. `diff.js` and `refresh.js`
4. `routes.js`, `static.js`, `server.js`
5. `setup.js`
6. `derive.js` and `format.js`
7. Views
8. CSV export and import
9. README

**Tests (`node --test`, fixtures and a mocked `fetch`):**
- `diff`: level-up, multi-level jump, join, leave, rename, first run, level decrease.
- `refresh`: partial failure keeps the stale section, roster failure leaves files untouched, 429 abort, 401 retry.
- `store`: atomic write and corrupt-file recovery.
- `derive`: averages, ties, XP percent, activity boundaries.
- `csv`: quoting and formula-injection prefix.
- `ratelimit`: cooldown.
- `routes`: `basePath` stripping, path traversal returns 404, no secret in any response, HTML-like names survive the round trip unexecuted.
- Slug encoding with accents.

**End-to-end check:**
1. Run `npm run setup` and confirm the member count matches the sheet.
2. Run `npm start`, then compare three members field by field against the sheet.
3. Edit a level in `current.json` and refresh: a log entry should appear.
4. Break the secret: the stale banner should show and the data should be retained.
5. Open on a phone over Tailscale.
6. Set `basePath:"/guild"` and re-check.
7. Grep the network responses for the client secret.

## Three biggest risks
1. **Undocumented API drift.** Field or category names may change. Keep all parsing in `blizzard.js`, validate shapes, and degrade to stale sections rather than crash. Save raw samples as fixtures.
2. **Statistics parsing.** Boss, death and quest counts depend on fragile category and name matching. Build a mapping table from a captured real response before coding the stats view.
3. **Level-up accuracy and identity.** Hourly polling, API lag and PC downtime make timestamps approximate. If the roster has no stable `id`, a rename breaks continuity. Label times "≈" and keep the import path.
