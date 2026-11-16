// Pure derived values (no DOM), shared by views and tests.

const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_ACTIVITY_DAYS = { quiet: 3, inactive: 14 };

export function averageLevel(members) {
  if (!members.length) return null;
  const sum = members.reduce((s, m) => s + m.level, 0);
  return Math.round((sum / members.length) * 10) / 10;
}

// Highest level; ties broken by XP, then by name so the result is stable.
export function highestMember(members) {
  let best = null;
  for (const m of members) {
    if (!best || compareLevel(m, best) < 0) best = m;
  }
  return best;
}

export function compareLevel(a, b) {
  return b.level - a.level
    || xpOf(b) - xpOf(a)
    || String(a.name).localeCompare(String(b.name));
}

function xpOf(m) {
  return (m.profile && m.profile.xp) || 0;
}

// Member with the newest level-up, or null when none is recorded.
export function latestLevelUp(members) {
  let best = null;
  for (const m of members) {
    if (m.lastLevelUpAt != null && (!best || m.lastLevelUpAt > best.lastLevelUpAt)) best = m;
  }
  return best;
}

export function daysSince(ts, now = Date.now()) {
  return ts == null ? null : Math.floor((now - ts) / DAY);
}

// active < quiet days, quiet < inactive days, else inactive; unknown without a login time.
export function activity(lastLogin, now = Date.now(), days = DEFAULT_ACTIVITY_DAYS) {
  if (lastLogin == null) return 'unknown';
  const d = (now - lastLogin) / DAY;
  const quiet = days.quiet ?? DEFAULT_ACTIVITY_DAYS.quiet;
  const inactive = days.inactive ?? DEFAULT_ACTIVITY_DAYS.inactive;
  if (d < quiet) return 'active';
  if (d < inactive) return 'quiet';
  return 'inactive';
}

// Levels gained within the last `days`, from history points (oldest first).
// The baseline is the last point at or before the cutoff, or the oldest known point.
export function levelsGained(points, days, now = Date.now(), currentLevel) {
  if (!points || !points.length) return 0;
  const cutoff = now - days * DAY;
  let base = points[0].level;
  for (const p of points) {
    if (p.t <= cutoff) base = p.level;
    else break;
  }
  const latest = currentLevel ?? points[points.length - 1].level;
  return Math.max(0, latest - base);
}

export function bgTotals(pvp) {
  const bgs = (pvp && pvp.bgs) || [];
  const played = bgs.reduce((s, b) => s + (b.played || 0), 0);
  const won = bgs.reduce((s, b) => s + (b.won || 0), 0);
  return { played, won, winRate: played ? won / played : null };
}

// value / level, or null when either is missing or the level is zero.
export function perLevel(value, level) {
  if (value == null || !level) return null;
  return value / level;
}

// Sums across members that have the relevant data; missing stats/pvp count as nothing.
export function guildTotals(members) {
  const t = { deaths: 0, quests: 0, dungeons: 0, bossKills: 0, hk: 0, bgPlayed: 0, bgWon: 0, bgLost: 0, bgWinRate: null, withStats: 0, withPvp: 0 };
  for (const m of members || []) {
    if (m.stats) {
      t.withStats++;
      t.deaths += m.stats.deaths || 0;
      t.quests += m.stats.quests || 0;
      t.dungeons += m.stats.dungeons || 0;
      t.bossKills += m.stats.bossKills || 0;
    }
    if (m.pvp) {
      t.withPvp++;
      t.hk += m.pvp.hk || 0;
      const bg = bgTotals(m.pvp);
      t.bgPlayed += bg.played;
      t.bgWon += bg.won;
    }
  }
  t.bgLost = t.bgPlayed - t.bgWon;
  t.bgWinRate = t.bgPlayed ? t.bgWon / t.bgPlayed : null;
  return t;
}

const memberName = (m) => [m.name, m.surname].filter(Boolean).join(' ');

// Top n members by getValue (null/undefined = no data, excluded). `min` is a floor on
// opts.played(m) (default: the value itself). Ties share a rank and `share` (value / leader
// value, 0 when the leader is 0) and keep name order.
export function leaders(members, getValue, n = 5, opts = {}) {
  const { min, played } = opts;
  const rows = [];
  for (const m of members || []) {
    const value = getValue(m);
    if (value == null || Number.isNaN(value)) continue;
    if (min != null) {
      const p = played ? played(m) : value;
      if (p == null || p < min) continue;
    }
    rows.push({ member: m, value });
  }
  rows.sort((a, b) => b.value - a.value || memberName(a.member).localeCompare(memberName(b.member)));
  const top = rows.slice(0, n);
  const lead = top.length ? top[0].value : 0;
  let rank = 0;
  return top.map((r, i) => {
    if (i === 0 || r.value !== top[i - 1].value) rank = i + 1;
    return { member: r.member, value: r.value, rank, share: lead > 0 ? r.value / lead : 0 };
  });
}

// Instances (most kills first) -> bosses (most kills first) -> members with their counts.
export function bossBoard(members) {
  const inst = new Map();
  for (const m of members || []) {
    for (const b of (m.stats && m.stats.bosses) || []) {
      const count = b.count || 0;
      if (!inst.has(b.instance)) inst.set(b.instance, { instance: b.instance, total: 0, bosses: new Map() });
      const i = inst.get(b.instance);
      if (!i.bosses.has(b.name)) i.bosses.set(b.name, { name: b.name, total: 0, members: [] });
      const boss = i.bosses.get(b.name);
      boss.total += count;
      i.total += count;
      boss.members.push({ member: m, count });
    }
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  return [...inst.values()].map((i) => ({
    instance: i.instance,
    total: i.total,
    bosses: [...i.bosses.values()].map((b) => ({
      ...b,
      members: b.members.sort((x, y) => y.count - x.count || memberName(x.member).localeCompare(memberName(y.member))),
    })).sort((a, b) => b.total - a.total || byName(a, b)),
  })).sort((a, b) => b.total - a.total || a.instance.localeCompare(b.instance));
}

export function isStale(meta, now = Date.now()) {
  if (!meta || meta.lastSuccessAt == null) return true;
  return now - meta.lastSuccessAt > 2 * (meta.refreshMinutes || 60) * 60 * 1000;
}

const SORTS = {
  level: compareLevel,
  name: (a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`),
  ilvl: (a, b) => ((b.profile && b.profile.ilvl) || 0) - ((a.profile && a.profile.ilvl) || 0) || compareLevel(a, b),
  lastLogin: (a, b) => ((b.profile && b.profile.lastLogin) || 0) - ((a.profile && a.profile.lastLogin) || 0),
  lastLevelUp: (a, b) => (b.lastLevelUpAt || 0) - (a.lastLevelUpAt || 0) || compareLevel(a, b),
};

export function sortMembers(members, key) {
  return [...members].sort(SORTS[key] || SORTS.level);
}

// f: { q, cls, rank, activity } where empty string means "any".
export function filterMembers(members, f, now = Date.now(), days = DEFAULT_ACTIVITY_DAYS) {
  const q = (f.q || '').trim().toLowerCase();
  return members.filter((m) => {
    if (q && !`${m.name} ${m.surname} ${m.className}`.toLowerCase().includes(q)) return false;
    if (f.cls && String(m.classId) !== f.cls) return false;
    if (f.rank !== '' && f.rank != null && String(m.rank) !== f.rank) return false;
    if (f.activity && activity(m.profile && m.profile.lastLogin, now, days) !== f.activity) return false;
    return true;
  });
}

/** Share of loot rolls that were Need: need / (need + greed), or null when no rolls are recorded. */
export function needShare(stats) {
  if (!stats) return null;
  const need = Number(stats.need) || 0;
  const greed = Number(stats.greed) || 0;
  return need + greed > 0 ? need / (need + greed) : null;
}
