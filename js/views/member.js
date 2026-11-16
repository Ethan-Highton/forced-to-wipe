import { el, svg, emptyState, errorState, skeleton } from '../dom.js';
import { getHistory } from '../api.js';
import { bgTotals, daysSince, levelsGained } from '../derive.js';
import { formatNumber, formatPercent, fullName, professionsText, rankText, relativeTime, talentsText } from '../format.js';
import { activityChip, classBadge } from './roster.js';

const W = 320;
const H = 170;
const PAD = { l: 30, r: 10, t: 10, b: 24 };

// Step chart: a level holds until the next recorded change.
function levelChart(points) {
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const lo = Math.min(...points.map((p) => p.level));
  const hi = Math.max(...points.map((p) => p.level), lo + 1);
  const x = (t) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (lv) => H - PAD.b - ((lv - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  let d = `M${x(points[0].t).toFixed(1)} ${y(points[0].level).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].level).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  const dateLabel = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const text = (attrs, s) => svg('text', { class: 'chart-text', ...attrs }, s);

  return svg('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Level over time, from ${lo} to ${hi}, currently ${last.level}`,
  },
  svg('line', { class: 'chart-grid', x1: PAD.l, x2: W - PAD.r, y1: y(lo), y2: y(lo) }),
  svg('line', { class: 'chart-grid', x1: PAD.l, x2: W - PAD.r, y1: y(hi), y2: y(hi) }),
  text({ x: PAD.l - 6, y: y(lo) + 4, 'text-anchor': 'end' }, String(lo)),
  text({ x: PAD.l - 6, y: y(hi) + 4, 'text-anchor': 'end' }, String(hi)),
  text({ x: PAD.l, y: H - 6, 'text-anchor': 'start' }, dateLabel(t0)),
  text({ x: W - PAD.r, y: H - 6, 'text-anchor': 'end' }, dateLabel(t1)),
  svg('path', { class: 'chart-line', d }),
  svg('circle', { class: 'chart-dot', cx: x(last.t), cy: y(last.level), r: 4 }));
}

function tile(label, value) {
  return el('div', { class: 'tile' }, el('span', { class: 'tile-label', text: label }), el('span', { class: 'tile-value', text: value }));
}

function section(title, ...children) {
  return el('section', { class: 'panel' }, el('h3', { class: 'panel-title', text: title }), ...children);
}

function kvList(rows) {
  return el('dl', { class: 'kvlist' }, ...rows.map(([k, v]) =>
    el('div', { class: 'kv' }, el('dt', { text: k }), el('dd', { text: v }))));
}

export function renderMember(root, ctx, id) {
  const m = (ctx.state.members || []).find((x) => String(x.id) === String(id));
  const back = el('a', { class: 'btn btn-link', href: '#/roster', text: '← Roster' });
  if (!m) {
    root.append(back, emptyState('Member not found', 'They may have left the guild.'));
    return;
  }
  const now = Date.now();
  const chartBox = el('div', { class: 'chart-box' }, skeleton(1));
  const gained = el('div', { class: 'strip' });

  root.append(back,
    el('header', { class: 'member-head', 'data-class': m.classId },
      el('span', { class: 'stripe', 'aria-hidden': 'true' }),
      el('h2', { class: 'member-name', text: fullName(m) }),
      el('div', { class: 'card-badges' }, classBadge(m),
        el('span', { class: 'badge', text: m.raceName || 'Unknown' }),
        el('span', { class: 'badge', text: rankText(m.rank) }),
        activityChip(m, now, ctx.config.activityDays))),
    gained,
    section('Level over time', chartBox));

  const loadHistory = async () => {
    chartBox.replaceChildren(skeleton(1));
    let points;
    try {
      points = (await getHistory(m.id)).points || [];
    } catch (err) {
      chartBox.replaceChildren(errorState(err.message, loadHistory));
      return;
    }
    gained.replaceChildren(
      tile('Level', String(m.level)),
      tile('Last 7 days', `+${levelsGained(points, 7, now, m.level)}`),
      tile('Last 30 days', `+${levelsGained(points, 30, now, m.level)}`),
      tile('Since level-up', m.lastLevelUpAt == null ? 'n/a' : `${daysSince(m.lastLevelUpAt, now)} d`));
    chartBox.replaceChildren(points.length >= 2
      ? levelChart(points)
      : emptyState('Not enough history yet', 'The chart appears after a few refreshes.'));
  };
  loadHistory();

  if (!m.detailsAvailable) {
    root.append(section('Details', el('p', { class: 'muted', text: 'Details appear at level 10' })));
    return;
  }
  const p = m.profile;
  root.append(
    section('Character', kvList([
      ['Item level', p ? formatNumber(p.ilvl) : '–'],
      ['Experience', p ? formatNumber(p.xp) : '–'],
      ['Last login', p ? relativeTime(p.lastLogin, now) : '–'],
      ['Last level-up', m.lastLevelUpAt == null ? 'Before tracking began' : relativeTime(m.lastLevelUpAt, now)],
    ])),
    section('Talents', el('p', { text: talentsText(m.talents) || 'None' })),
    section('Professions', kvList([
      ['Primary', professionsText(m.professions && m.professions.primary) || 'None'],
      ['Secondary', professionsText(m.professions && m.professions.secondary) || 'None'],
    ])));

  if (m.stats) {
    const s = m.stats;
    root.append(section('Statistics',
      kvList([['Deaths', formatNumber(s.deaths)], ['Quests', formatNumber(s.quests)],
        ['Dungeons', formatNumber(s.dungeons)], ['Boss kills', formatNumber(s.bossKills)]]),
      s.bosses.length ? el('ul', { class: 'boss-list' }, ...s.bosses.map((b) => el('li', {},
        `${b.name} `, el('span', { class: 'muted', text: `(${b.instance})` }), el('strong', { text: ` × ${b.count}` })))) : null));
  }
  if (m.pvp) {
    const t = bgTotals(m.pvp);
    root.append(section('PvP',
      kvList([['Honorable kills', formatNumber(m.pvp.hk)], ['BGs played', formatNumber(t.played)],
        ['BGs won', formatNumber(t.won)], ['Win rate', formatPercent(t.winRate)]]),
      m.pvp.bgs.length ? el('ul', { class: 'boss-list' }, ...m.pvp.bgs.map((b) =>
        el('li', { text: `${b.name}: ${b.won}/${b.played} won` }))) : null));
  }
}
