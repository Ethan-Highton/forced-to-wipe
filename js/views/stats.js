import { el, svg, emptyState } from '../dom.js';
import { bgTotals, leaders, bossBoard, perLevel, needShare } from '../derive.js';
import { formatNumber, formatPercent, fullName } from '../format.js';
import { heatClasses, columnBest, compareValues, recordHolders, bossRows, firstName } from '../stats-model.js';
import { meterClass } from '../member-model.js';

const sort = { key: 'name', dir: 1 };

const DASH = '—';
const oneDecimal = (n) => (n == null ? DASH : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const num = (n) => (n == null ? DASH : formatNumber(n));
const pct = (n) => (n == null ? DASH : formatPercent(n));
const deaths = (m) => m.stats && m.stats.deaths;
const quests = (m) => m.stats && m.stats.quests;
const dungeons = (m) => m.stats && m.stats.dungeons;
const bossKills = (m) => m.stats && m.stats.bossKills;
const hk = (m) => m.pvp && m.pvp.hk;
const played = (m) => m.pvp && bgTotals(m.pvp).played;

const GROUPS = ['Deaths', 'Quests', 'Dungeons & bosses', 'PvP', 'Loot rolls'];
const COLUMNS = [
  { key: 'name', label: 'Member', text: true, value: (m) => fullName(m) },
  { key: 'deaths', group: 0, label: 'Total', sr: 'Deaths ', value: deaths },
  { key: 'deathsPerLevel', group: 0, label: 'Per level', sr: 'Deaths ', fmt: oneDecimal, value: (m) => m.stats && perLevel(m.stats.deaths, m.level) },
  { key: 'quests', group: 1, label: 'Total', sr: 'Quests ', value: quests },
  { key: 'questsPerLevel', group: 1, label: 'Per level', sr: 'Quests ', fmt: oneDecimal, value: (m) => m.stats && perLevel(m.stats.quests, m.level) },
  { key: 'dungeons', group: 2, label: 'Dungeons', value: dungeons },
  { key: 'bossKills', group: 2, label: 'Boss kills', value: bossKills },
  { key: 'hk', group: 3, label: 'HK', value: hk },
  { key: 'played', group: 3, label: 'Played', sr: 'Battlegrounds ', value: played },
  { key: 'won', group: 3, label: 'Won', sr: 'Battlegrounds ', value: (m) => m.pvp && bgTotals(m.pvp).won },
  { key: 'winPct', group: 3, label: 'Win %', fmt: pct, value: (m) => m.pvp && bgTotals(m.pvp).winRate },
  { key: 'need', group: 4, label: 'Need', sr: 'Loot rolls ', value: (m) => m.stats && m.stats.need },
  { key: 'greed', group: 4, label: 'Greed', sr: 'Loot rolls ', value: (m) => m.stats && m.stats.greed },
  { key: 'needPct', group: 4, label: 'Need %', fmt: pct, value: (m) => m.stats && needShare(m.stats) },
];

// Reveal motion lives in js/motion.js; the page works without it.
async function reveal(root, selector) {
  try {
    const mod = await import('../motion.js');
    if (mod && typeof mod.revealChildren === 'function') mod.revealChildren(root, selector);
  } catch { /* motion is optional */ }
}

function swatch(m) {
  return el('span', { class: 'swatch', 'data-class': String(m.classId), 'aria-hidden': 'true' });
}

function chevron(cls) {
  return svg('svg', { class: cls, viewBox: '0 0 10 10', width: '10', height: '10', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M2 6.5 5 3.5 8 6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }));
}

const memberHref = (m) => `#/member/${encodeURIComponent(m.id)}`;

// ---- 1. records ----------------------------------------------------------

const RECORDS = [
  { key: 'deaths', label: 'Deaths', value: deaths },
  { key: 'quests', label: 'Quests', value: quests },
  { key: 'dungeons', label: 'Dungeon runs', value: dungeons },
  { key: 'bossKills', label: 'Boss kills', value: bossKills },
  { key: 'hk', label: 'Honorable kills', value: hk },
  { key: 'played', label: 'Battlegrounds', value: played },
];

function recordsRow(members) {
  const rows = recordHolders(members, RECORDS);
  return el('dl', { class: 'records rv' }, ...rows.map((r) => {
    const holder = r.holders.length
      ? el('dd', { class: 'rec-holder' },
        el('a', { href: memberHref(r.holders[0]), text: firstName(r.holders[0]) }),
        ` ${formatNumber(r.value)}`,
        r.holders.length > 1 ? ` +${r.holders.length - 1} tied` : '')
      : el('dd', { class: 'rec-holder', text: 'No record yet' });
    return el('div', { class: 'rec' },
      el('dt', { text: r.label }),
      el('dd', { class: 'rec-total', text: formatNumber(r.total) }),
      holder);
  }));
}

// ---- 2. leaderboards -----------------------------------------------------

const BOARDS = [
  { title: 'Most deaths', value: deaths },
  { title: 'Most quests', value: quests },
  { title: 'Most dungeons', value: dungeons },
  { title: 'Most boss kills', value: bossKills },
  { title: 'Most honorable kills', value: hk },
  {
    title: 'Best BG win rate',
    note: 'Min. 2 played',
    value: (m) => m.pvp && bgTotals(m.pvp).winRate,
    opts: { min: 2, played: (m) => (m.pvp ? bgTotals(m.pvp).played : 0) },
    fmt: formatPercent,
    detail: (m) => { const b = bgTotals(m.pvp); return `${b.won}/${b.played} won`; },
  },
  {
    title: 'Highest need %',
    note: 'Min. 10 rolls',
    value: (m) => m.stats && needShare(m.stats),
    opts: { min: 10, played: (m) => (m.stats ? (m.stats.need || 0) + (m.stats.greed || 0) : 0) },
    fmt: formatPercent,
    detail: (m) => `${formatNumber(m.stats.need)} need / ${formatNumber(m.stats.greed)} greed`,
  },
  { title: 'Most need rolls', value: (m) => m.stats && m.stats.need },
  { title: 'Most greed rolls', value: (m) => m.stats && m.stats.greed },
];

function leaderCard(board, members) {
  const rows = leaders(members, board.value, 5, board.opts);
  const fmt = board.fmt || formatNumber;
  const list = rows.length
    ? el('ol', { class: 'lb-list' }, ...rows.map((r) => el('li', { class: r.rank === 1 ? 'lb-row is-first' : 'lb-row' },
      el('span', { class: 'lb-rank', text: String(r.rank) }),
      el('a', { class: 'lb-name', href: memberHref(r.member) }, swatch(r.member), el('span', { text: fullName(r.member) })),
      el('span', { class: 'lb-value' },
        board.detail ? el('span', { class: 'lb-detail', text: board.detail(r.member) }) : null,
        el('strong', { text: fmt(r.value) })),
      el('span', { class: 'meter', 'aria-hidden': 'true' },
        el('span', { class: `bar ${meterClass(r.share)}`, 'data-class': String(r.member.classId) })))))
    : el('p', { class: 'muted small', text: 'Nobody has qualified yet.' });
  return el('article', { class: 'lb-card' },
    el('h3', { class: 'lb-title' }, board.title, board.note ? el('span', { class: 'lb-note', text: board.note }) : null),
    list);
}

// ---- 3. matrix -----------------------------------------------------------

function detailRow(m, colspan) {
  const bosses = (m.stats && m.stats.bosses) || [];
  const list = bosses.length
    ? el('ul', { class: 'detail-bosses' }, ...bosses.map((b) => el('li', {},
      el('span', { class: 'db-name', text: b.name }),
      el('span', { class: 'db-inst', text: b.instance }),
      el('span', { class: 'db-count', text: `×${b.count}` }))))
    : el('p', { class: 'muted small', text: m.stats ? 'No boss kills yet.' : 'Boss details unlock at level 10.' });
  return el('tr', { class: 'detail-row' }, el('td', { colspan: String(colspan) },
    el('div', { class: 'detail-inner' },
      el('p', { class: 'detail-head' },
        el('span', { class: 'muted', text: `${m.className} · level ${m.level}` }),
        el('a', { class: 'detail-link', href: memberHref(m), text: 'Full profile' })),
      list)));
}

function statsTable(members) {
  const wrap = el('div', { class: 'table-wrap matrix-wrap', tabindex: '0', role: 'region', 'aria-label': 'Member statistics' });

  // Heat and column bests depend only on the data, never on the sort.
  const heat = COLUMNS.map((c) => {
    if (c.text) return null;
    const values = members.map((m) => c.value(m));
    return { values, classes: heatClasses(values), best: columnBest(values) };
  });

  const paint = () => {
    const sc = COLUMNS.find((c) => c.key === sort.key);
    const rows = members.map((m, i) => ({ m, i })).sort((a, b) => compareValues(sc.value(a.m), sc.value(b.m), sort.dir, sc.text));

    const sortBtn = (c) => {
      const active = c.key === sort.key;
      const btn = el('button', { class: 'th-btn', type: 'button' },
        c.sr ? el('span', { class: 'sr-only', text: c.sr }) : null,
        el('span', { text: c.label }),
        active ? chevron(sort.dir === 1 ? 'sort-ico asc' : 'sort-ico desc') : null);
      btn.addEventListener('click', () => {
        sort.dir = active ? -sort.dir : (c.text ? 1 : -1);
        sort.key = c.key;
        paint();
        const again = wrap.querySelector(`th[data-key="${c.key}"] .th-btn`);
        if (again) again.focus();
      });
      return btn;
    };
    const sortAttr = (c) => ({ 'aria-sort': c.key === sort.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none' });

    const groupRow = el('tr', { class: 'group-row' },
      el('th', { scope: 'col', rowspan: '2', 'data-key': 'name', class: 'corner', ...sortAttr(COLUMNS[0]) }, sortBtn(COLUMNS[0])),
      ...GROUPS.map((g, gi) => el('th', {
        scope: 'colgroup', colspan: String(COLUMNS.filter((c) => c.group === gi).length), class: 'group', text: g,
      })));
    const colRow = el('tr', { class: 'col-row' }, ...COLUMNS.slice(1).map((c) =>
      el('th', { scope: 'col', 'data-key': c.key, class: 'num', ...sortAttr(c) }, sortBtn(c))));

    const body = el('tbody');
    for (const { m, i } of rows) {
      const detail = detailRow(m, COLUMNS.length);
      detail.hidden = true;
      const btn = el('button', { class: 'row-btn', type: 'button', 'aria-expanded': 'false' },
        swatch(m), el('span', { class: 'row-name', text: fullName(m) }),
        el('span', { class: 'sr-only', text: ` (${m.className})` }), chevron('row-ico'));
      const tr = el('tr', { class: 'data-row' }, el('th', { scope: 'row' }, btn));
      btn.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
        btn.setAttribute('aria-expanded', String(!detail.hidden));
        tr.classList.toggle('is-open', !detail.hidden);
      });
      COLUMNS.forEach((c, ci) => {
        if (c.text) return;
        const h = heat[ci];
        const v = h.values[i];
        if (v == null || Number.isNaN(v)) {
          tr.append(el('td', { class: 'num empty', 'data-key': c.key, text: DASH }));
          return;
        }
        const best = h.best != null && v === h.best && v > 0;
        tr.append(el('td', { class: `num h${h.classes[i]}${best ? ' best' : ''}`, 'data-key': c.key, text: (c.fmt || num)(v) }));
      });
      body.append(tr, detail);
    }

    // Crosshair: the row is highlighted by CSS, the column header is tinted here.
    let hot = null;
    const setHot = (key) => {
      if (hot === key) return;
      hot = key;
      for (const th of wrap.querySelectorAll('thead th[data-key]')) th.classList.toggle('is-hot', th.dataset.key === key);
    };
    body.addEventListener('mouseover', (e) => {
      const td = e.target.closest ? e.target.closest('td[data-key]') : null;
      setHot(td ? td.dataset.key : null);
    });
    body.addEventListener('mouseleave', () => setHot(null));

    wrap.replaceChildren(el('table', { class: 'stats-table matrix' }, el('thead', {}, groupRow, colRow), body));
  };

  paint();
  return wrap;
}

// ---- 4. boss board -------------------------------------------------------

function bossTable(board) {
  const rows = bossRows(board);
  const tables = [];
  let body = null;
  for (const r of rows) {
    if (r.type === 'instance') {
      body = el('tbody', {},
        el('tr', { class: 'inst-row' },
          el('th', { scope: 'colgroup', colspan: '3' },
            el('span', { class: 'inst-name', text: r.instance }),
            el('span', { class: 'inst-total', text: `${formatNumber(r.total)} ${r.total === 1 ? 'kill' : 'kills'}` }))));
      tables.push(body);
    } else {
      body.append(el('tr', { class: 'boss-row' },
        el('th', { scope: 'row', class: 'boss-name', text: r.name }),
        el('td', { class: 'num boss-kills', text: formatNumber(r.total) }),
        el('td', { class: 'boss-who' }, el('ul', {}, ...r.who.map((w) => el('li', {},
          swatch(w.member), `${firstName(w.member)} ${formatNumber(w.count)}`))))));
    }
  }
  return el('div', { class: 'boss-wrap' },
    el('table', { class: 'boss-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', text: 'Boss' }),
        el('th', { scope: 'col', class: 'num', text: 'Guild kills' }),
        el('th', { scope: 'col', text: 'Killed by' }))),
      ...tables));
}

function heading(id, text) {
  return el('h2', { class: 'section-title', id, text });
}

export function renderStats(root, ctx) {
  const members = ctx.state.members || [];
  if (!members.length) {
    root.append(emptyState('No stats yet', 'The first refresh has not finished.'));
    return;
  }
  const board = bossBoard(members);
  const olderFigures = members.filter((m) => (m.stats && m.stats.stale) || (m.pvp && m.pvp.stale)).length;
  root.append(el('div', { class: 'stats-page' },
    recordsRow(members),
    el('section', { class: 'rv', 'aria-labelledby': 'lb-h' },
      heading('lb-h', 'Leaderboards'),
      el('div', { class: 'lb-grid' }, ...BOARDS.map((b) => leaderCard(b, members)))),
    el('section', { class: 'rv', 'aria-labelledby': 'tbl-h' },
      heading('tbl-h', 'All members'),
      statsTable(members),
      olderFigures
        ? el('p', { class: 'muted small', text: `${olderFigures} ${olderFigures === 1 ? 'member shows' : 'members show'} figures from an earlier refresh.` })
        : null),
    el('section', { class: 'rv', 'aria-labelledby': 'boss-h' },
      heading('boss-h', 'Boss board'),
      board.length
        ? bossTable(board)
        : el('p', { class: 'muted', text: 'No boss has died to the guild yet.' }))));
  reveal(root, '.rv');
}
