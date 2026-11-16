// Pure text formatting helpers (no DOM), shared by views and tests.

export function fullName(m) {
  return [m.name, m.surname].filter(Boolean).join(' ');
}

export function rankText(rank) {
  return rank === 0 ? 'Guild Master' : `Rank ${rank}`;
}

// "Discipline 19 / Shadow Magic 7"
export function talentsText(talents) {
  const trees = talents && talents.trees ? talents.trees : [];
  return trees.map((t) => `${t.name} ${t.points}`).join(' / ');
}

// "Tailoring 150/225, Enchanting 225/225"
export function professionsText(list) {
  return (list || []).map((p) => `${p.name} ${p.skill}/${p.max}`).join(', ');
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function relativeTime(ts, now = Date.now()) {
  if (ts == null) return 'never';
  const diff = now - ts;
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  return `${Math.floor(diff / DAY)} d ago`;
}

export function formatNumber(n) {
  return n == null ? '–' : Number(n).toLocaleString('en-US');
}

export function formatPercent(ratio) {
  return ratio == null ? '–' : `${Math.round(ratio * 100)}%`;
}

export function formatDay(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// "m:ss" for the refresh cooldown
export function formatCountdown(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Dark or light text colour that stays readable on the given #rrggbb fill.
export function readableTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#0e1117';
  const lin = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return lum > 0.18 ? '#0e1117' : '#ffffff';
}
