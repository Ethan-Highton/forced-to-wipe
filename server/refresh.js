import { diffRoster } from './diff.js';
import { className, raceName } from './static-data.js';
import {
  parseRoster, parseProfile, parseSpecializations, parseProfessions, parseStatistics, parsePvp,
} from './parse.js';

const CONCURRENCY = 3;
const MIN_DETAIL_LEVEL = 10;

// Sections fetched after the profile; each maps to a Member key and a parser.
const SUB_SECTIONS = [
  ['specializations', 'talents', parseSpecializations],
  ['professions', 'professions', parseProfessions],
  ['statistics', 'stats', parseStatistics],
  ['pvp', 'pvp', parsePvp],
];

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !failed) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true; // stop handing out work once the cycle is doomed
        throw err;
      }
    }
  }));
  return results;
}

/** Fetches and parses one section. Returns { section } or { error } (abort errors are rethrown). */
async function fetchSection(blizzard, rm, apiName, parse, previous, now) {
  try {
    const { status, json } = await blizzard.getCharacter(rm.slug, apiName);
    if (status === 404) throw Object.assign(new Error('404'), { code: '404' });
    return { section: { ...parse(json), fetchedAt: now, stale: false } };
  } catch (err) {
    if (err.abort) throw err;
    return {
      section: previous ? { ...previous, stale: true } : null,
      error: err.code ?? 'parse_error',
    };
  }
}

async function buildMember(blizzard, rm, prev, now) {
  const base = {
    id: rm.id, slug: rm.slug, name: rm.name, surname: rm.surname, rank: rm.rank,
    classId: rm.classId, className: className(rm.classId),
    raceId: rm.raceId, raceName: raceName(rm.raceId),
    level: rm.level, detailsAvailable: false,
    profile: null, talents: null, professions: null, stats: null, pvp: null,
  };
  const errors = [];
  if (rm.level < MIN_DETAIL_LEVEL) return { member: base, errors };

  const profile = await fetchSection(blizzard, rm, 'profile', parseProfile, prev?.profile, now);
  // A 404 profile is "no details yet", not an error.
  if (profile.error === '404') return { member: base, errors };
  if (profile.error) {
    errors.push({ id: rm.id, section: 'profile', code: profile.error });
  }
  const member = { ...base, detailsAvailable: true };
  if (profile.section) {
    const { raceName: race, className: cls, ...rest } = profile.section;
    member.profile = rest;
    if (race) member.raceName = race;
    if (cls) member.className = cls;
  }
  for (const [apiName, key, parse] of SUB_SECTIONS) {
    const r = await fetchSection(blizzard, rm, apiName, parse, prev?.[key], now);
    member[key] = r.section;
    if (r.error) errors.push({ id: rm.id, section: key, code: r.error });
  }
  return { member, errors };
}

const historyPoint = (m, t) => ({
  t, level: m.level, xp: m.profile?.xp ?? null, ilvl: m.profile?.ilvl ?? null,
  deaths: m.stats?.deaths ?? null, quests: m.stats?.quests ?? null, hk: m.pvp?.hk ?? null,
});

const sameValues = (a, b) => ['level', 'xp', 'ilvl', 'deaths', 'quests', 'hk'].every((k) => a[k] === b[k]);

export function createRefresher({
  config, store, blizzard, log = () => {}, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let running = false;
  let timer = null;
  const intervalMs = config.refreshMinutes * 60_000;

  function recordFailure(reason) {
    const meta = store.readMeta();
    store.write('meta.json', { ...meta, lastAttemptAt: now(), consecutiveFailures: meta.consecutiveFailures + 1 });
    log(`Refresh rejected: ${reason}`);
    return { status: 'failed', reason };
  }

  async function cycle() {
    const t = now();
    const meta = store.readMeta();
    const prevCurrent = store.readCurrent();
    const prevMap = new Map((prevCurrent?.members ?? []).map((m) => [m.id, m]));

    blizzard.beginCycle?.();
    let roster;
    try {
      roster = parseRoster(await blizzard.getRoster());
    } catch (err) {
      return recordFailure(`roster: ${err.code ?? err.message}`);
    }
    if (roster.members.length === 0) return recordFailure('roster is empty');

    const diff = diffRoster({
      prevMembers: store.readMembers(), prevCurrent: prevCurrent?.members,
      roster: roster.members, now: t, seeded: meta.seeded,
    });
    if (!diff.ok) return recordFailure(diff.reason);

    let built;
    try {
      built = await mapLimit(roster.members, CONCURRENCY, (rm) => buildMember(blizzard, rm, prevMap.get(rm.id), t));
    } catch (err) {
      return recordFailure(err.code ?? err.message);
    }
    const members = built.map((b) => b.member);
    const errors = built.flatMap((b) => b.errors);

    // Commit everything at once; nothing was written before this point.
    const known = new Set(store.readLevelups().map((e) => e.id));
    const fresh = diff.levelups.filter((e) => !known.has(e.id));
    if (fresh.length) store.write('levelups.json', [...store.readLevelups(), ...fresh]);

    const histName = store.historyName(t);
    const history = store.read(histName, {});
    for (const m of members) {
      const point = historyPoint(m, t);
      const list = history[m.id] ?? (history[m.id] = []);
      if (!list.length || !sameValues(list.at(-1), point)) list.push(point);
    }
    store.write(histName, history);

    store.write('members.json', diff.members);
    const refreshStatus = errors.length ? 'partial' : 'ok';
    store.write('current.json', {
      refreshedAt: t, refreshStatus, errors,
      guild: { name: roster.guildName ?? config.guildName, memberCount: members.length },
      members,
    });
    store.write('meta.json', { ...meta, lastAttemptAt: t, lastSuccessAt: t, consecutiveFailures: 0, seeded: true });
    log(`Refresh ${refreshStatus}: ${members.length} members, ${fresh.length} level-ups, ${errors.length} errors`);
    return { status: refreshStatus, levelups: fresh.length, errors };
  }

  async function run() {
    if (running) return { status: 'busy' };
    running = true;
    try {
      return await cycle();
    } catch (err) {
      return recordFailure(`unexpected: ${err.message}`);
    } finally {
      running = false;
    }
  }

  function schedule(delayMs) {
    timer = setTimer(async () => {
      await run();
      schedule(intervalMs);
    }, delayMs);
    timer?.unref?.();
  }

  return {
    isRunning: () => running,
    run,
    /** Refresh now if data is older than the interval, then keep a setTimeout chain going. */
    start() {
      const last = store.readMeta().lastSuccessAt;
      const age = last == null ? Infinity : now() - last;
      schedule(age >= intervalMs ? 0 : intervalMs - age);
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
}
