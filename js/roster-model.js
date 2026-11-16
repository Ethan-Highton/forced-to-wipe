// Pure roster helpers (no DOM): class composition, activity mark, meters, ledger sorting.
import { activity, compareLevel } from './derive.js';

// Segments for the class composition bar. `start` and `pct` are percentages (0-100).
export function classSegments(members) {
  const by = new Map();
  for (const m of members || []) {
    const key = String(m.classId);
    if (!by.has(key)) by.set(key, { classId: m.classId, className: m.className || 'Unknown', count: 0 });
    by.get(key).count++;
  }
  const total = (members || []).length;
  const rows = [...by.values()].sort((a, b) => b.count - a.count || a.className.localeCompare(b.className));
  let start = 0;
  return rows.map((r) => {
    const pct = total ? (r.count / total) * 100 : 0;
    const seg = { ...r, start: round2(start), pct: round2(pct) };
    start += pct;
    return seg;
  });
}

const round2 = (n) => Math.round(n * 100) / 100;

// ok / warn / danger map onto the status colours; none when the login time is unknown.
export function activityStatus(lastLogin, now = Date.now(), days) {
  const a = activity(lastLogin, now, days);
  return { active: 'ok', quiet: 'warn', inactive: 'danger' }[a] || 'none';
}

// value / top, clamped to 0..1; 0 when either is missing.
export function meterRatio(value, top) {
  if (value == null || !top || top <= 0) return 0;
  return Math.min(1, Math.max(0, value / top));
}

// Ratio -> 0..100 in steps of 5, matching the .pc0 .. .pc100 width classes.
export function meterStep(ratio) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return Math.round(r * 20) * 5;
}

export function topIlvl(members) {
  let top = 0;
  for (const m of members || []) {
    const v = m.profile && m.profile.ilvl;
    if (v != null && v > top) top = v;
  }
  return top;
}

// Ledger columns. `dir` is the direction a first click sorts in.
export const COLUMNS = {
  member: { dir: 'asc' },
  level: { dir: 'desc' },
  ilvl: { dir: 'desc' },
  rank: { dir: 'asc' },
  talents: { dir: 'asc' },
  professions: { dir: 'desc' },
  seen: { dir: 'desc' },
  levelup: { dir: 'desc' },
};

// Sort value for a column; null means "no data" and always sinks to the bottom.
export function columnValue(m, key) {
  switch (key) {
    case 'member': return `${m.name} ${m.surname || ''}`.trim();
    case 'level': return m.level;
    case 'ilvl': return m.profile && m.profile.ilvl != null ? m.profile.ilvl : null;
    case 'rank': return m.rank;
    case 'talents': {
      const t = m.talents && m.talents.trees && m.talents.trees[0];
      return t ? t.name : null;
    }
    case 'professions': {
      const list = m.professions && m.professions.primary;
      return list && list.length ? list.reduce((s, p) => s + (p.skill || 0), 0) : null;
    }
    case 'seen': return m.profile && m.profile.lastLogin != null ? m.profile.lastLogin : null;
    case 'levelup': return m.lastLevelUpAt != null ? m.lastLevelUpAt : null;
    default: return null;
  }
}

export function compareMembers(key, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    const va = columnValue(a, key);
    const vb = columnValue(b, key);
    if (va == null && vb == null) return compareLevel(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return c * sign || compareLevel(a, b);
  };
}

export function sortLedger(members, sort) {
  const key = COLUMNS[sort.key] ? sort.key : 'level';
  return [...members].sort(compareMembers(key, sort.dir));
}

// Clicking the active column reverses it; a new column starts in its natural direction.
export function nextSort(current, key) {
  if (!COLUMNS[key]) return current;
  if (current && current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: COLUMNS[key].dir };
}
