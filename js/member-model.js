// Pure helpers for the Member page (no DOM): meter steps, guild ranks, row models.
import { bgTotals } from './derive.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Meters are 20 CSS steps (.w0 .. .w100) because inline styles are blocked by the CSP.
export function meterStep(ratio) {
  if (!isNum(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 20) * 5;
}

export function meterClass(ratio) {
  return `w${meterStep(ratio)}`;
}

// value / max clamped to 0..1; 0 when max is missing or zero.
export function ratioOf(value, max) {
  if (!isNum(value) || !isNum(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

// Guild rank of `member` for getValue: ties share a rank, members without data are not ranked.
// Returns { rank, of } (of = members with data) or null when the member has no value.
export function rankInGuild(members, getValue, member) {
  const mine = getValue(member);
  if (!isNum(mine)) return null;
  let greater = 0;
  let of = 0;
  for (const m of members || []) {
    const v = getValue(m);
    if (!isNum(v)) continue;
    of++;
    if (v > mine) greater++;
  }
  return { rank: greater + 1, of: Math.max(of, 1) };
}

export function rankLabel(r) {
  return r ? `#${r.rank} of ${r.of}` : '';
}

export const MEMBER_STATS = [
  { key: 'deaths', label: 'Deaths', value: (m) => m.stats && m.stats.deaths },
  { key: 'quests', label: 'Quests', value: (m) => m.stats && m.stats.quests },
  { key: 'dungeons', label: 'Dungeons', value: (m) => m.stats && m.stats.dungeons },
  { key: 'bossKills', label: 'Boss kills', value: (m) => m.stats && m.stats.bossKills },
  { key: 'hk', label: 'Honorable kills', value: (m) => m.pvp && m.pvp.hk },
  { key: 'played', label: 'BGs played', value: (m) => m.pvp && bgTotals(m.pvp).played },
  { key: 'won', label: 'BGs won', value: (m) => m.pvp && bgTotals(m.pvp).won },
  { key: 'winRate', label: 'Win rate', percent: true, value: (m) => m.pvp && bgTotals(m.pvp).winRate },
];

// One entry per stat: { key, label, percent, value, rank } with rank = { rank, of } or null.
export function statRows(members, member) {
  return MEMBER_STATS.map((s) => {
    const v = s.value(member);
    return {
      key: s.key,
      label: s.label,
      percent: !!s.percent,
      value: isNum(v) ? v : null,
      rank: rankInGuild(members, s.value, member),
    };
  });
}

// Profession list -> rows with a meter ratio.
export function skillRows(list) {
  return (list || []).map((p) => ({ name: p.name, skill: p.skill, max: p.max, ratio: ratioOf(p.skill, p.max) }));
}

// Talent trees -> rows; ratio is the tree's share of all points spent, main tree flagged.
export function talentRows(talents) {
  const trees = (talents && talents.trees) || [];
  const total = trees.reduce((s, t) => s + (t.points || 0), 0);
  const top = trees.reduce((mx, t) => Math.max(mx, t.points || 0), 0);
  return trees.map((t) => ({
    name: t.name,
    points: t.points,
    ratio: total > 0 ? (t.points || 0) / total : 0,
    main: top > 0 && t.points === top,
  }));
}

// Boss kills for the table: most kills first, then by name.
export function bossKillRows(stats) {
  return [...((stats && stats.bosses) || [])]
    .sort((a, b) => (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name)));
}
