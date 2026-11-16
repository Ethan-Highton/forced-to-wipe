# API contract (server <-> browser)

PLAN.md is the overall plan. This file is the exact contract both halves must follow. All paths are under `basePath` (default `""`). The browser must use RELATIVE URLs (no leading slash) so a `/guild` mount works.

## Members (state.members[])
```
{
  id: number,                 // Blizzard character id from the roster (stable)
  slug: "jeezus-khryst",      // roster slug, used verbatim for API calls
  name: "Jeezus", surname: "Khryst",
  rank: 0,                    // number, 0 = Guild Master
  classId: 5, className: "Priest", raceId: 8, raceName: "Troll",   // names from static id maps if profile missing
  level: 35,
  detailsAvailable: true,     // false when profile 404 (under level 10)
  lastLevelUpAt: 1794789000000 | null,   // epoch ms, newest levelups.json entry for this id
  profile:     { xp: 31466, ilvl: 31, lastLogin: 1794788323000, fetchedAt, stale } | null,
  talents:     { trees: [{ name: "Discipline", points: 19 }], fetchedAt, stale } | null,  // only trees with points > 0, sorted by points desc
  professions: { primary: [{ name, skill, max }], secondary: [{ name, skill, max }], fetchedAt, stale } | null,
  stats:       { deaths, quests, dungeons, bossKills, bosses: [{ name, instance, count }], fetchedAt, stale } | null,
  pvp:         { hk, bgs: [{ name, played, won }], fetchedAt, stale } | null
}
```
Sources (see tests/fixtures/*.json for real samples, one file per endpoint):
- roster.json -> id, slug, name, surname, rank, level, classId (playable_class.id), raceId (playable_race.id)
- <char>-profile.json -> experience (xp), average_item_level (ilvl), last_login_timestamp, race.name, character_class.name
- <char>-specializations.json -> active group (is_active) -> specializations[] -> sum of talents[].talent_rank per spec name
- <char>-professions.json -> primaries[] and secondaries[] -> profession.name, tiers[] skill_points / max_skill_points (use the tier with the largest max_skill_points)
- <char>-statistics.json -> categories[] (nested sub_categories[].statistics[]), match by statistic id: deaths id 60 ("Total deaths"), quests id 98 ("Quests completed"), dungeons id 932 ("Total 5-player dungeons entered"), sub-category named "Boss Kills" inside "Dungeons & Raids": each statistic name looks like "Bazzalan kills (Ragefire Chasm)" or "Rath'mael Kills (Ruins of Lordaeron)" -> {name:"Bazzalan", instance:"Ragefire Chasm", count}; bossKills = sum of counts. Missing statistic = 0.
- <char>-pvp.json -> honorable_kills (hk), pvp_map_statistics[] -> bgs[{name: world_map.name, played, won}]
Static maps (server/static-data.js): class ids 1 Warrior, 2 Paladin, 3 Hunter, 4 Rogue, 5 Priest, 6 Death Knight, 7 Shaman, 8 Mage, 9 Warlock, 10 Monk, 11 Druid, 12 Demon Hunter, 13 Evoker; race ids 1 Human, 2 Orc, 3 Dwarf, 4 Night Elf, 5 Undead, 6 Tauren, 7 Gnome, 8 Troll, 10 Blood Elf, 11 Draenei, 22 Worgen, 24-26 Pandaren (name "Pandaren"), 27 Nightborne, 28 Highmountain Tauren, 29 Void Elf, 30 Lightforged Draenei, 31 Zandalari Troll, 32 Kul Tiran, 34 Dark Iron Dwarf, 35 Vulpera, 36 Mag'har Orc, 37 Mechagnome. Unknown id -> "Unknown".

## Endpoints (all JSON unless noted)
- `GET api/config` -> `{ guildName, region, refreshMinutes, activityDays:{quiet,inactive}, basePath, branding:{title,accent,logo} }` (public values only, never secrets)
- `GET api/state` -> `{ meta:{ refreshedAt, refreshStatus:"ok"|"partial"|"failed"|"never", lastSuccessAt, lastAttemptAt, refreshMinutes, cooldownSec }, guild:{ name, memberCount }, members:[Member], errors:[{ id, section, code }] }`. `refreshedAt`/`lastSuccessAt` are epoch ms or null.
- `GET api/levelups?limit=50&charId=` -> `{ entries:[{ id, charId, name, at, oldLevel, newLevel, approx, source }] }` newest first, `at` epoch ms. `name` is "Name Surname".
- `GET api/history/:charId` -> `{ points:[{ t, level, xp, ilvl, deaths, quests, hk }] }` oldest first, `t` epoch ms.
- `POST api/refresh` -> `202 { started:true }` or `429 { retryAfterSec }`; while a cycle runs returns `409 { running:true }`.
- `GET api/export/roster.csv`, `api/export/stats.csv`, `api/export/levelups.csv` -> text/csv with Content-Disposition attachment; cells starting with = + - @ are prefixed with `'`.
- `GET api/health` -> `{ ok:true, uptimeSec, lastSuccessAt }`
- Static: `/`, `css/*`, `js/*`, `index.html` only. Anything else 404.

## Display rules (browser)
- Rank 0 shows "Guild Master", others "Rank N". Name shown as "Name Surname".
- Sheet-style talents text: "Discipline 19 / Shadow Magic 7"; professions "Tailoring 150/225, Enchanting 225/225".
- Activity: days since lastLogin < activityDays.quiet = active, < activityDays.inactive = quiet, else inactive (defaults 3 and 14).
- Class colour = coloured stripe/badge plus text label, never coloured text alone.
