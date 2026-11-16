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
