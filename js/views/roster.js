import { el, emptyState } from '../dom.js';
import { activity, averageLevel, filterMembers, highestMember, latestLevelUp, sortMembers } from '../derive.js';
import { formatNumber, fullName, professionsText, rankText, relativeTime, talentsText } from '../format.js';

// Filter state survives re-renders and tab switches.
const filters = { q: '', cls: '', rank: '', activity: '', sort: 'level' };
const expanded = new Set();

const SORT_OPTIONS = [
  ['level', 'Level'], ['name', 'Name'], ['ilvl', 'Item level'],
  ['lastLogin', 'Last login'], ['lastLevelUp', 'Last level-up'],
];
const ACTIVITY_LABEL = { active: 'Active', quiet: 'Quiet', inactive: 'Inactive', unknown: 'Unknown' };

export function classBadge(m) {
  return el('span', { class: 'badge badge-class', 'data-class': m.classId },
    el('span', { class: 'swatch', 'aria-hidden': 'true' }), m.className || 'Unknown');
}

export function activityChip(m, now, days) {
  const lastLogin = m.profile && m.profile.lastLogin;
  const a = activity(lastLogin, now, days);
  const text = lastLogin == null ? 'Login unknown' : `${ACTIVITY_LABEL[a]} · ${relativeTime(lastLogin, now)}`;
  return el('span', { class: `chip chip-${a}`, text });
}

function select(label, key, options) {
  const sel = el('select', { 'aria-label': label, class: 'field' },
    ...options.map(([value, text]) => el('option', { value, text, selected: filters[key] === value })));
  sel.addEventListener('change', () => { filters[key] = sel.value; });
  return sel;
}

function headerStrip(members, now) {
  const top = highestMember(members);
  const last = latestLevelUp(members);
  const tile = (label, value, sub) => el('div', { class: 'tile' },
    el('span', { class: 'tile-label', text: label }),
    el('span', { class: 'tile-value', text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null);
  const avg = averageLevel(members);
  return el('section', { class: 'strip', 'aria-label': 'Guild summary' },
    tile('Members', String(members.length)),
    tile('Average level', avg == null ? '–' : avg.toFixed(1)),
    tile('Highest', top ? `Lv ${top.level}` : '–', top ? fullName(top) : ''),
    tile('Latest level-up', last ? fullName(last) : '–', last ? relativeTime(last.lastLevelUpAt, now) : 'none recorded'));
}

function detailPanel(m) {
  if (!m.detailsAvailable) {
    return el('div', { class: 'detail' }, el('p', { class: 'muted', text: 'Details appear at level 10' }));
  }
  const row = (label, text) => el('div', { class: 'kv' },
    el('dt', { text: label }), el('dd', { text: text || 'None' }));
  return el('div', { class: 'detail' },
    el('dl', { class: 'kvlist' },
      row('Talents', talentsText(m.talents)),
      row('Professions', professionsText(m.professions && m.professions.primary)),
      row('Secondary', professionsText(m.professions && m.professions.secondary))),
    el('a', { class: 'btn btn-link', href: `#/member/${encodeURIComponent(m.id)}`, text: 'Full details' }));
}

function card(m, now, days) {
  const open = expanded.has(m.id);
  const panelId = `detail-${m.id}`;
  const panel = detailPanel(m);
  panel.id = panelId;
  panel.hidden = !open;
  const lastUp = m.lastLevelUpAt == null ? 'Before tracking began' : `Level-up ${relativeTime(m.lastLevelUpAt, now)}`;
  const toggle = el('button', {
    class: 'card-main', type: 'button', 'aria-expanded': String(open), 'aria-controls': panelId,
  },
    el('span', { class: 'card-top' },
      el('span', { class: 'card-name', text: fullName(m) }),
      el('span', { class: 'level' }, el('span', { class: 'level-label', text: 'Lv' }), String(m.level))),
    el('span', { class: 'card-badges' }, classBadge(m),
      el('span', { class: 'badge', text: m.raceName || 'Unknown' }),
      el('span', { class: 'badge', text: rankText(m.rank) })),
    el('span', { class: 'card-meta' },
      el('span', { class: 'chip', text: m.profile ? `iLvl ${formatNumber(m.profile.ilvl)}` : 'iLvl –' }),
      activityChip(m, now, days),
      el('span', { class: 'muted small', text: lastUp })));
  toggle.addEventListener('click', () => {
    const nowOpen = panel.hidden;
    panel.hidden = !nowOpen;
    toggle.setAttribute('aria-expanded', String(nowOpen));
    if (nowOpen) expanded.add(m.id); else expanded.delete(m.id);
  });
  return el('article', { class: 'card', 'data-class': m.classId },
    el('span', { class: 'stripe', 'aria-hidden': 'true' }), toggle, panel);
}

export function renderRoster(root, ctx) {
  const { state, config } = ctx;
  const members = state.members || [];
  if (!members.length) {
    root.append(emptyState('No members yet', 'The first refresh has not finished.'));
    return;
  }
  const now = Date.now();
  const days = config.activityDays;
  const list = el('div', { class: 'card-list' });
  const count = el('p', { class: 'muted small', 'aria-live': 'polite' });

  const paint = () => {
    const shown = sortMembers(filterMembers(members, filters, now, days), filters.sort);
    list.replaceChildren();
    count.textContent = `${shown.length} of ${members.length} members`;
    if (!shown.length) list.append(emptyState('No members match', 'Try clearing a filter.'));
    for (const m of shown) list.append(card(m, now, days));
  };

  const classes = [...new Map(members.map((m) => [String(m.classId), m.className || 'Unknown'])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const ranks = [...new Set(members.map((m) => m.rank))].sort((a, b) => a - b);

  const search = el('input', {
    class: 'field', type: 'search', placeholder: 'Search name or class', 'aria-label': 'Search members', value: filters.q,
  });
  search.addEventListener('input', () => { filters.q = search.value; paint(); });

  const controls = el('div', { class: 'controls' }, search,
    select('Class', 'cls', [['', 'All classes'], ...classes]),
    select('Rank', 'rank', [['', 'All ranks'], ...ranks.map((r) => [String(r), rankText(r)])]),
    select('Activity', 'activity', [['', 'Any activity'], ['active', 'Active'], ['quiet', 'Quiet'], ['inactive', 'Inactive']]),
    select('Sort by', 'sort', SORT_OPTIONS.map(([v, t]) => [v, `Sort: ${t}`])));
  controls.addEventListener('change', paint);

  root.append(headerStrip(members, now), controls, count, list);
  paint();
}
