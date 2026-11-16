import { el, svg, emptyState, errorState, skeleton } from '../dom.js';
import { getHistory } from '../api.js';
import { activity, daysSince, levelsGained } from '../derive.js';
import { formatNumber, formatPercent, fullName, rankText, relativeTime } from '../format.js';
import { bossKillRows, meterClass, rankLabel, skillRows, statRows, talentRows } from '../member-model.js';

const DASH = '—';
const W = 640;
const H = 200;
const PAD = { l: 34, r: 12, t: 12, b: 26 };

// Reveal motion lives in js/motion.js; the page works without it.
async function reveal(root, selector) {
  try {
    const mod = await import('../motion.js');
    if (mod && typeof mod.revealChildren === 'function') mod.revealChildren(root, selector);
  } catch { /* motion is optional */ }
}

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
    class: 'm-chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Level over time, from ${lo} to ${hi}, currently ${last.level}`,
  },
  svg('line', { class: 'chart-grid', x1: PAD.l, x2: W - PAD.r, y1: y(lo), y2: y(lo) }),
  svg('line', { class: 'chart-grid', x1: PAD.l, x2: W - PAD.r, y1: y(hi), y2: y(hi) }),
  text({ x: PAD.l - 8, y: y(lo) + 4, 'text-anchor': 'end' }, String(lo)),
  text({ x: PAD.l - 8, y: y(hi) + 4, 'text-anchor': 'end' }, String(hi)),
  text({ x: PAD.l, y: H - 6, 'text-anchor': 'start' }, dateLabel(t0)),
  text({ x: W - PAD.r, y: H - 6, 'text-anchor': 'end' }, dateLabel(t1)),
  svg('path', { class: 'chart-line', d }),
  svg('rect', { class: 'chart-dot', x: x(last.t) - 4, y: y(last.level) - 4, width: 8, height: 8 }));
}

function backLink() {
  return el('a', { class: 'm-back', href: '#/roster' },
    svg('svg', { viewBox: '0 0 10 10', width: '10', height: '10', 'aria-hidden': 'true', focusable: 'false' },
      svg('path', { d: 'M6.5 2 3.5 5 6.5 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' })),
    'Roster');
}

function section(title, ...children) {
  return el('section', { class: 'm-section rv' }, el('h3', { class: 'm-title', text: title }), ...children);
}

function meterRow(name, valueText, ratio, strong) {
  return el('li', { class: strong ? 'm-row is-main' : 'm-row' },
    el('span', { class: 'm-row-name', text: name }),
    el('span', { class: 'm-row-val', text: valueText }),
    el('span', { class: 'm-meter', 'aria-hidden': 'true' }, el('span', { class: `m-fill ${meterClass(ratio)}` })));
}

function skillList(rows, empty) {
  return rows.length
    ? el('ul', { class: 'm-rows' }, ...rows.map((r) => meterRow(r.name, `${r.skill}/${r.max}`, r.ratio, false)))
    : el('p', { class: 'muted small', text: empty });
}

function statusLine(m, now, days) {
  const lastLogin = m.profile && m.profile.lastLogin;
  const level = activity(lastLogin, now, days);
  const label = { active: 'Active', quiet: 'Quiet', inactive: 'Inactive', unknown: 'No login on record' }[level];
  return el('p', { class: 'm-status' },
    el('span', { class: `mark is-${level}`, 'aria-hidden': 'true' }),
    level === 'unknown' ? label : `${label} · seen ${relativeTime(lastLogin, now)}`);
}

function simpleTable(headers, rows, numFrom) {
  return el('table', { class: 'm-table' },
    el('thead', {}, el('tr', {}, ...headers.map((h, i) => el('th', { scope: 'col', class: i >= numFrom ? 'num' : null, text: h })))),
    el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c, i) => el(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: i >= numFrom ? 'num' : null, text: c }))))));
}

function statisticsSection(members, m) {
  const rows = statRows(members, m);
  const grid = el('dl', { class: 'm-stats' }, ...rows.map((r) => el('div', { class: 'm-stat' },
    el('dt', { text: r.label }),
    el('dd', {},
      el('span', { class: 'm-figure', text: r.value == null ? DASH : (r.percent ? formatPercent(r.value) : formatNumber(r.value)) }),
      r.rank ? el('span', { class: 'm-rank', text: rankLabel(r.rank) }) : null))));
  const stale = (m.stats && m.stats.stale) || (m.pvp && m.pvp.stale);
  const bgs = (m.pvp && m.pvp.bgs) || [];
  return section('Statistics', grid,
    bgs.length ? simpleTable(['Battleground', 'Played', 'Won'], bgs.map((b) => [b.name, formatNumber(b.played), formatNumber(b.won)]), 1) : null,
    stale ? el('p', { class: 'muted small', text: 'Some figures are from an earlier refresh.' }) : null);
}

function bossSection(m) {
  const rows = bossKillRows(m.stats);
  return section('Boss kills', rows.length
    ? simpleTable(['Boss', 'Instance', 'Kills'], rows.map((b) => [b.name, b.instance, formatNumber(b.count)]), 2)
    : el('p', { class: 'muted small', text: m.stats ? 'No boss kills recorded.' : 'Boss kills unlock once statistics load.' }));
}

export function renderMember(root, ctx, id) {
  const members = ctx.state.members || [];
  const m = members.find((x) => String(x.id) === String(id));
  if (!m) {
    root.append(el('div', { class: 'member-page' }, backLink(), emptyState('Member not found', 'They may have left the guild.')));
    return;
  }
  const now = Date.now();
  const chartBox = el('div', { class: 'chart-box' }, skeleton(1));
  const g7 = el('dd', { class: 'm-gain', text: DASH });
  const g30 = el('dd', { class: 'm-gain', text: DASH });
  const p = m.profile;

  const side = el('aside', { class: 'm-side rv' },
    backLink(),
    el('div', { class: 'm-ident', 'data-class': String(m.classId) },
      el('h2', { class: 'm-name' }, el('span', { class: 'swatch', 'aria-hidden': 'true' }), el('span', { text: fullName(m) })),
      el('p', { class: 'm-line', text: [m.className, m.raceName || 'Unknown', rankText(m.rank)].join(' · ') }),
      statusLine(m, now, ctx.config.activityDays)),
    el('div', { class: 'm-level' },
      el('span', { class: 'm-level-label', text: 'Level' }),
      el('span', { class: 'm-level-num', text: String(m.level) })),
    el('dl', { class: 'm-gained' },
      el('div', {}, el('dt', { text: 'Gained 7d' }), g7),
      el('div', {}, el('dt', { text: 'Gained 30d' }), g30)),
    el('dl', { class: 'm-facts' },
      el('div', {}, el('dt', { text: 'Item level' }), el('dd', { text: p ? formatNumber(p.ilvl) : DASH })),
      el('div', {}, el('dt', { text: 'Experience' }), el('dd', { text: p ? formatNumber(p.xp) : DASH })),
      el('div', {}, el('dt', { text: 'Last level-up' }),
        el('dd', { text: m.lastLevelUpAt == null ? 'Before tracking' : `${relativeTime(m.lastLevelUpAt, now)} (${daysSince(m.lastLevelUpAt, now)} d)` }))));

  const main = el('div', { class: 'm-main' }, section('Progress', chartBox));

  const loadHistory = async () => {
    chartBox.replaceChildren(skeleton(1));
    let points;
    try {
      points = (await getHistory(m.id)).points || [];
    } catch (err) {
      chartBox.replaceChildren(errorState(err.message, loadHistory));
      return;
    }
    g7.textContent = `+${levelsGained(points, 7, now, m.level)}`;
    g30.textContent = `+${levelsGained(points, 30, now, m.level)}`;
    chartBox.replaceChildren(points.length >= 2
      ? levelChart(points)
      : el('p', { class: 'muted small', text: `${points.length} history ${points.length === 1 ? 'point' : 'points'} so far. The chart needs two refreshes.` }));
  };
  loadHistory();

  if (!m.detailsAvailable) {
    main.append(section('Details', el('p', { class: 'muted small', text: `${m.name} is under level 10. Professions, talents and statistics unlock at 10.` })));
  } else {
    const prof = m.professions || {};
    main.append(
      section('Professions',
        skillList(skillRows(prof.primary), 'No primary professions.'),
        (prof.secondary || []).length ? el('p', { class: 'm-sub', text: 'Secondary' }) : null,
        (prof.secondary || []).length ? skillList(skillRows(prof.secondary), '') : null),
      section('Talents', talentRows(m.talents).length
        ? el('ul', { class: 'm-rows' }, ...talentRows(m.talents).map((t) => meterRow(t.name, `${t.points} points`, t.ratio, t.main)))
        : el('p', { class: 'muted small', text: 'No talent points spent.' })),
      statisticsSection(members, m),
      bossSection(m));
  }

  root.append(el('div', { class: 'member-page' }, side, main));
  reveal(root, '.rv');
}
