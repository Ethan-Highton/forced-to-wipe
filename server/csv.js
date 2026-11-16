// Server-side CSV builders. Cells starting with = + - @ get a ' prefix (formula injection guard).

export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Minimal RFC 4180 parser (quotes, doubled quotes, CRLF/LF). Returns string[][]. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

const fullName = (m) => `${m.name} ${m.surname}`.trim();
const rankLabel = (rank) => (rank === 0 ? 'Guild Master' : `Rank ${rank}`);
const iso = (t) => (t ? new Date(t).toISOString() : '');

export function rosterCsv(members) {
  const headers = ['Name', 'Class', 'Race', 'Rank', 'Level', 'XP', 'Item level', 'Last login', 'Talents', 'Professions', 'Secondary skills'];
  const skills = (list) => (list ?? []).map((p) => `${p.name} ${p.skill}/${p.max}`).join(', ');
  return toCsv(headers, members.map((m) => [
    fullName(m), m.className, m.raceName, rankLabel(m.rank), m.level,
    m.profile?.xp ?? '', m.profile?.ilvl ?? '', iso(m.profile?.lastLogin),
    (m.talents?.trees ?? []).map((t) => `${t.name} ${t.points}`).join(' / '),
    skills(m.professions?.primary), skills(m.professions?.secondary),
  ]));
}

export function statsCsv(members) {
  const headers = ['Name', 'Deaths', 'Quests', 'Dungeons', 'Boss kills', 'HKs', 'BGs played', 'BGs won', 'BG win %', 'Need rolls', 'Greed rolls', 'Need %'];
  return toCsv(headers, members.map((m) => {
    const played = (m.pvp?.bgs ?? []).reduce((s, b) => s + b.played, 0);
    const won = (m.pvp?.bgs ?? []).reduce((s, b) => s + b.won, 0);
    return [
      fullName(m), m.stats?.deaths ?? '', m.stats?.quests ?? '', m.stats?.dungeons ?? '',
      m.stats?.bossKills ?? '', m.pvp?.hk ?? '', m.pvp ? played : '', m.pvp ? won : '',
      played ? Math.round((won / played) * 100) : '',
      m.stats?.need ?? '', m.stats?.greed ?? '',
      (m.stats?.need || m.stats?.greed) ? Math.round((m.stats.need / (m.stats.need + m.stats.greed)) * 100) : '',
    ];
  }));
}

/** Same columns as the import format: Date,Name,Old level,New level (plus Source). */
export function levelupsCsv(entries) {
  return toCsv(['Date', 'Name', 'Old level', 'New level', 'Source'],
    entries.map((e) => [iso(e.at), e.name, e.oldLevel, e.newLevel, e.source]));
}
