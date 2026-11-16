import { el, svg, emptyState } from '../dom.js';
import { activity, averageLevel, filterMembers, highestMember, latestLevelUp } from '../derive.js';
import { formatNumber, fullName, professionsText, rankText, relativeTime, talentsText } from '../format.js';
import {
  COLUMNS, activityStatus, classSegments, meterRatio, meterStep, nextSort, sortLedger, topIlvl,
} from '../roster-model.js';
import { revealChildren } from '../motion.js';

// Filter and sort state survives re-renders and tab switches.
const filters = { q: '', cls: '', rank: '', activity: '' };
let sort = { key: 'level', dir: 'desc' };
const expanded = new Set();

const HEADERS = [
  ['member', 'Member', ''], ['level', 'Lv', 'num'], ['ilvl', 'iLvl', ''], ['rank', 'Rank', 'col-rank'],
  ['talents', 'Talents', 'col-talents'], ['professions', 'Professions', ''], ['seen', 'Last seen', ''],
  ['levelup', 'Last level-up', 'col-up'],
];
const PHONE_SORTS = [
  ['level', 'Level'], ['member', 'Name'], ['ilvl', 'Item level'], ['seen', 'Last login'], ['levelup', 'Last level-up'],
];
const ACTIVITY_LABEL = { active: 'Active', quiet: 'Quiet', inactive: 'Inactive', unknown: 'Unknown' };

export function classBadge(m) {
  return el('span', { class: 'cls-tag', 'data-class': m.classId },
    el('span', { class: 'swatch', 'aria-hidden': 'true' }), m.className || 'Unknown');
}

export function activityChip(m, now, days) {
  const lastLogin = m.profile && m.profile.lastLogin;
  const a = activity(lastLogin, now, days);
  const text = lastLogin == null ? 'Login unknown' : `${ACTIVITY_LABEL[a]} · ${relativeTime(lastLogin, now)}`;
  return el('span', { class: 'seen' }, el('span', { class: `mark st-${activityStatus(lastLogin, now, days)}`, 'aria-hidden': 'true' }), text);
}

function chevron() {
  return svg('svg', { class: 'chev', viewBox: '0 0 12 12', width: '12', height: '12', 'aria-hidden': 'true' },
    svg('path', { d: 'M2.5 4.5 6 8l3.5-3.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }));
}

function select(label, key, options) {
  const sel = el('select', { 'aria-label': label, class: 'field' },
    ...options.map(([value, text]) => el('option', { value, text, selected: filters[key] === value })));
  sel.addEventListener('change', () => { filters[key] = sel.value; });
  return sel;
}

function stat(value, label, note) {
  return el('li', { class: 'sum-item' },
    el('b', { class: 'sum-num', text: value }),
    el('span', { class: 'sum-label', text: label }),
    note ? el('span', { class: 'sum-note', text: note }) : null);
}

function summary(members, now) {
  const top = highestMember(members);
  const last = latestLevelUp(members);
  const avg = averageLevel(members);
  return el('ul', { class: 'summary', 'aria-label': 'Guild summary' },
    stat(String(members.length), 'members'),
    stat(avg == null ? '–' : avg.toFixed(1), 'avg level'),
    stat(top ? String(top.level) : '–', 'top level', top ? fullName(top) : ''),
    stat(last ? relativeTime(last.lastLevelUpAt, now) : 'none yet', 'last level-up', last ? fullName(last) : ''));
}

function compositionBar(members) {
  const segs = classSegments(members);
  const label = segs.map((s) => `${s.className} ${s.count}`).join(', ');
  const bar = svg('svg', { class: 'compbar', viewBox: '0 0 100 12', preserveAspectRatio: 'none', role: 'img', 'aria-label': `Class mix: ${label}` },
    ...segs.map((s) => svg('rect', {
      x: s.start, y: 0, width: Math.max(s.pct - 0.3, 0.2), height: 12, 'data-class': s.classId,
    })));
  const legend = el('ul', { class: 'comp-legend' },
    ...segs.map((s) => el('li', { 'data-class': s.classId },
      el('span', { class: 'swatch', 'aria-hidden': 'true' }), `${s.className} `, el('b', { text: String(s.count) }))));
  return el('div', { class: 'composition' }, bar, legend);
}

function meter(step, small) {
  return el('span', { class: `meter${small ? ' meter-sm' : ''}`, 'aria-hidden': 'true' }, el('span', { class: `fill pc${step}` }));
}

function detailContent(m) {
  if (!m.detailsAvailable) {
    return el('div', { class: 'detail' }, el('p', { class: 'muted', text: 'Details appear at level 10.' }));
  }
  const row = (label, text) => el('div', { class: 'kv' }, el('dt', { text: label }), el('dd', { text: text || 'None' }));
  return el('div', { class: 'detail' },
    el('dl', { class: 'kvlist' },
      row('Rank', rankText(m.rank)),
      row('Talents', talentsText(m.talents)),
      row('Professions', professionsText(m.professions && m.professions.primary)),
      row('Secondary', professionsText(m.professions && m.professions.secondary))),
    el('p', { class: 'detail-links' },
      el('a', { href: `#/member/${encodeURIComponent(m.id)}`, text: 'Full details' }),
      el('a', { href: '#/stats', text: 'Guild stats' })));
}

// One open/closed state per member, shared by the table row and the phone card.
function wireToggle(trigger, button, panel, id) {
  trigger.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) expanded.add(id); else expanded.delete(id);
  });
}

function seenCell(m, now, days) {
  const lastLogin = m.profile && m.profile.lastLogin;
  const a = activity(lastLogin, now, days);
  return el('span', { class: 'seen' },
    el('span', { class: `mark st-${activityStatus(lastLogin, now, days)}`, 'aria-hidden': 'true' }),
    el('span', { class: 'vh', text: `${ACTIVITY_LABEL[a]}, ` }),
    lastLogin == null ? '–' : relativeTime(lastLogin, now));
}

function talentsCell(m) {
  const trees = (m.talents && m.talents.trees) || [];
  if (!trees.length) return el('span', { class: 'muted', text: '–' });
  return el('span', { class: 'talents' },
    el('b', { class: 'talent-main', text: `${trees[0].name} ${trees[0].points}` }),
    trees.length > 1 ? el('span', { class: 'talent-rest', text: trees.slice(1).map((t) => `${t.name} ${t.points}`).join(' · ') }) : null);
}

function professionsCell(m) {
  const list = ((m.professions && m.professions.primary) || []).slice(0, 2);
  if (!list.length) return el('span', { class: 'muted', text: '–' });
  return el('span', { class: 'profs' }, ...list.map((p) => el('span', { class: 'prof' },
    el('span', { class: 'prof-line' }, el('span', { text: p.name }), el('span', { class: 'prof-n', text: `${p.skill}/${p.max}` })),
    meter(meterStep(meterRatio(p.skill, p.max)), true))));
}

function ledgerRows(m, now, days, topIl) {
  const open = expanded.has(m.id);
  const panelId = `row-detail-${m.id}`;
  const ilvl = m.profile && m.profile.ilvl;
  const button = el('button', { class: 'member-btn', type: 'button', 'aria-expanded': String(open), 'aria-controls': panelId },
    el('span', { class: 'swatch', 'aria-hidden': 'true' }),
    el('span', { class: 'member-id' },
      el('span', { class: 'member-name', text: fullName(m) }),
      el('span', { class: 'member-sub', text: [m.className || 'Unknown', m.raceName || 'Unknown'].join(' · ') })));
  const tr = el('tr', { class: 'lrow', 'data-class': m.classId },
    el('td', { class: 'c-member' }, button),
    el('td', { class: 'num lvl', text: String(m.level) }),
    el('td', { class: 'c-ilvl' }, ilvl == null ? el('span', { class: 'muted', text: '–' })
      : el('span', { class: 'ilvl' }, el('span', { class: 'ilvl-n', text: formatNumber(ilvl) }), meter(meterStep(meterRatio(ilvl, topIl))))),
    el('td', { class: 'col-rank', text: rankText(m.rank) }),
    el('td', { class: 'col-talents' }, talentsCell(m)),
    el('td', {}, professionsCell(m)),
    el('td', {}, seenCell(m, now, days)),
    el('td', { class: 'col-up' }, m.lastLevelUpAt == null ? el('span', { class: 'muted', text: '–' }) : relativeTime(m.lastLevelUpAt, now)));
  const panel = el('tr', { class: 'drow', id: panelId, 'data-class': m.classId, hidden: !open },
    el('td', { colspan: '8' }, detailContent(m)));
  wireToggle(tr, button, panel, m.id);
  return [tr, panel];
}

function card(m, now, days) {
  const open = expanded.has(m.id);
  const panelId = `detail-${m.id}`;
  const panel = detailContent(m);
  panel.id = panelId;
  panel.hidden = !open;
  const ilvl = m.profile && m.profile.ilvl;
  const lastUp = m.lastLevelUpAt == null ? 'No level-up on record' : `Level-up ${relativeTime(m.lastLevelUpAt, now)}`;
  const toggle = el('button', { class: 'card-main', type: 'button', 'aria-expanded': String(open), 'aria-controls': panelId },
    el('span', { class: 'card-top' },
      el('span', { class: 'card-name' }, el('span', { class: 'swatch', 'aria-hidden': 'true' }), fullName(m)),
      el('span', { class: 'level', text: String(m.level), 'aria-label': `Level ${m.level}` })),
    el('span', { class: 'card-sub', text: [m.className || 'Unknown', m.raceName || 'Unknown', rankText(m.rank)].join(' · ') }),
    el('span', { class: 'card-meta' },
      el('span', { text: ilvl == null ? 'iLvl –' : `iLvl ${formatNumber(ilvl)}` }),
      activityChip(m, now, days),
      el('span', { class: 'muted', text: lastUp })));
  const article = el('article', { class: 'card', 'data-class': m.classId }, toggle, panel);
  wireToggle(toggle, toggle, panel, m.id);
  return article;
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
  const topIl = topIlvl(members);

  const body = el('tbody');
  const head = el('tr');
  const sortButtons = new Map();
  for (const [key, label, cls] of HEADERS) {
    const btn = el('button', { class: 'sort-btn', type: 'button' }, label, chevron());
    btn.addEventListener('click', () => { sort = nextSort(sort, key); paint(); btn.focus(); });
    sortButtons.set(key, btn);
    head.append(el('th', { scope: 'col', class: cls, 'data-key': key }, btn));
  }
  const table = el('table', { class: 'ledger' },
    el('caption', { class: 'vh', text: 'Guild roster. Use the column headers to sort.' }),
    el('thead', {}, head), body);
  const wrap = el('div', { class: 'ledger-wrap' }, table);
  const list = el('div', { class: 'card-list' });
  const none = el('div', { class: 'none-slot' });
  const count = el('p', { class: 'muted small count', 'aria-live': 'polite' });

  const phoneSort = el('select', { class: 'field sort-phone', 'aria-label': 'Sort by' },
    ...PHONE_SORTS.map(([v, t]) => el('option', { value: v, text: `Sort: ${t}` })));
  phoneSort.addEventListener('change', () => { sort = { key: phoneSort.value, dir: COLUMNS[phoneSort.value].dir }; paint(); });

  const paint = () => {
    const shown = sortLedger(filterMembers(members, filters, now, days), sort);
    body.replaceChildren();
    list.replaceChildren();
    none.replaceChildren();
    count.textContent = `${shown.length} of ${members.length} members`;
    for (const [key, th] of [...head.children].map((c) => [c.dataset.key, c])) {
      if (key === sort.key) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    }
    if (PHONE_SORTS.some(([v]) => v === sort.key)) phoneSort.value = sort.key;
    wrap.hidden = !shown.length;
    if (!shown.length) none.append(emptyState('No members match', `None of the ${members.length} fit these filters.`));
    for (const m of shown) {
      body.append(...ledgerRows(m, now, days, topIl));
      list.append(card(m, now, days));
    }
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
    phoneSort);
  controls.addEventListener('change', paint);

  root.append(el('h2', { class: 'vh', text: 'Roster' }),
    el('div', { class: 'roster-head' }, summary(members, now), compositionBar(members)),
    controls, count, wrap, none, list);
  paint();
  revealChildren(root, '.summary, .composition, .controls, .lrow, .card');
}
