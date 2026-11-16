import { el, emptyState } from '../dom.js';
import { bgTotals, guildTotals, leaders, bossBoard, perLevel } from '../derive.js';
import { formatNumber, formatPercent, fullName } from '../format.js';

const sort = { key: 'name', dir: 1 };

const oneDecimal = (n) => (n == null ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const deaths = (m) => m.stats && m.stats.deaths;
const quests = (m) => m.stats && m.stats.quests;

const COLUMNS = [
  { key: 'name', label: 'Member', text: true, value: (m) => fullName(m) },
  { key: 'deaths', label: 'Deaths', value: deaths },
  { key: 'deathsPerLevel', label: 'Deaths / level', fmt: oneDecimal, value: (m) => m.stats && perLevel(m.stats.deaths, m.level) },
  { key: 'quests', label: 'Quests', value: quests },
  { key: 'questsPerLevel', label: 'Quests / level', fmt: oneDecimal, value: (m) => m.stats && perLevel(m.stats.quests, m.level) },
  { key: 'dungeons', label: 'Dungeons', value: (m) => m.stats && m.stats.dungeons },
  { key: 'bossKills', label: 'Boss kills', value: (m) => m.stats && m.stats.bossKills },
  { key: 'hk', label: 'HK', value: (m) => m.pvp && m.pvp.hk },
  { key: 'played', label: 'BGs played', value: (m) => m.pvp && bgTotals(m.pvp).played },
  { key: 'won', label: 'BGs won', value: (m) => m.pvp && bgTotals(m.pvp).won },
  { key: 'winPct', label: 'Win %', fmt: formatPercent, value: (m) => m.pvp && bgTotals(m.pvp).winRate },
];

// Bar widths are CSS classes (.w0 ... .w100 in steps of 5): inline styles are blocked by the CSP.
function widthClass(ratio) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return `w${Math.round(r * 20) * 5}`;
}

function swatch(m) {
  return el('span', { class: 'swatch', 'data-class': String(m.classId), 'aria-hidden': 'true' });
}

function compare(col) {
  return (a, b) => {
    const x = col.value(a);
    const y = col.value(b);
    // Members without data always sink to the bottom.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (col.text ? String(x).localeCompare(String(y)) : x - y) * sort.dir;
  };
}

function bossRow(m, colspan) {
  const bosses = (m.stats && m.stats.bosses) || [];
  const content = bosses.length
    ? el('ul', { class: 'boss-list' }, ...bosses.map((b) => el('li', {},
      el('span', { text: `${b.name} ` }), el('span', { class: 'muted', text: `(${b.instance})` }),
      el('strong', { text: ` × ${b.count}` }))))
    : el('p', { class: 'muted', text: m.stats ? 'No boss kills recorded' : 'Details appear at level 10' });
  return el('tr', { class: 'detail-row' }, el('td', { colspan: String(colspan) }, content));
}

// ---- 1. totals -----------------------------------------------------------

function totalsStrip(members) {
  const t = guildTotals(members);
  const bg = t.bgPlayed
    ? `${formatNumber(t.bgWon)}-${formatNumber(t.bgLost)} (${formatPercent(t.bgWinRate)})`
    : '–';
  const tile = (label, value, sub) => el('div', { class: 'tile' },
    el('span', { class: 'tile-label', text: label }),
    el('span', { class: 'tile-value', text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null);
  return el('section', { 'aria-label': 'Guild totals' },
    el('div', { class: 'strip' },
      tile('Deaths', formatNumber(t.deaths), `${t.withStats} members`),
      tile('Quests', formatNumber(t.quests)),
      tile('Dungeon runs', formatNumber(t.dungeons)),
      tile('Boss kills', formatNumber(t.bossKills)),
      tile('Honorable kills', formatNumber(t.hk), `${t.withPvp} members`),
      tile('Battlegrounds', bg, 'wins-losses (win rate)')));
}

// ---- 2. leaderboards -----------------------------------------------------

const BOARDS = [
  { title: 'Most deaths', value: deaths },
  { title: 'Most quests', value: quests },
  { title: 'Most dungeons', value: (m) => m.stats && m.stats.dungeons },
  { title: 'Most boss kills', value: (m) => m.stats && m.stats.bossKills },
  { title: 'Most honorable kills', value: (m) => m.pvp && m.pvp.hk },
  {
    title: 'Best battleground win rate',
    note: 'min. 2 battlegrounds played',
    value: (m) => m.pvp && bgTotals(m.pvp).winRate,
    opts: { min: 2, played: (m) => (m.pvp ? bgTotals(m.pvp).played : 0) },
    fmt: formatPercent,
    detail: (m) => { const b = bgTotals(m.pvp); return `${b.won}/${b.played} won`; },
  },
];

function leaderCard(board, members) {
  const rows = leaders(members, board.value, 5, board.opts);
  const fmt = board.fmt || formatNumber;
  const list = rows.length
    ? el('ol', { class: 'lb-list' }, ...rows.map((r) => el('li', { class: 'lb-row' },
      el('span', { class: 'lb-rank', text: String(r.rank) }),
      el('a', { class: 'lb-name', href: `#/member/${encodeURIComponent(r.member.id)}` }, swatch(r.member), el('span', { text: fullName(r.member) })),
      el('span', { class: 'lb-value' },
        el('strong', { text: fmt(r.value) }),
        board.detail ? el('span', { class: 'muted small', text: ` ${board.detail(r.member)}` }) : null),
      el('span', { class: 'meter', 'aria-hidden': 'true' },
        el('span', { class: `bar ${widthClass(r.share)}`, 'data-class': String(r.member.classId) })))))
    : el('p', { class: 'muted small', text: 'Nobody qualifies yet.' });
  return el('article', { class: 'lb-card' },
    el('h3', { class: 'lb-title', text: board.title }),
    board.note ? el('p', { class: 'muted small', text: board.note }) : null,
    list);
}

// ---- 3. table ------------------------------------------------------------

function statsTable(members) {
  const wrap = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Member statistics' });

  const paint = () => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const rows = [...members].sort(compare(col));
    const maxes = COLUMNS.map((c) => (c.text ? 0 : Math.max(0, ...members.map((m) => c.value(m) || 0))));

    const head = el('tr', {}, ...COLUMNS.map((c) => {
      const active = c.key === sort.key;
      const btn = el('button', { class: 'th-btn', type: 'button', text: c.label });
      btn.addEventListener('click', () => {
        sort.dir = active ? -sort.dir : (c.text ? 1 : -1);
        sort.key = c.key;
        paint();
        const again = wrap.querySelector(`th[data-key="${c.key}"] .th-btn`);
        if (again) again.focus();
      });
      return el('th', {
        scope: 'col', 'data-key': c.key, class: c.text ? null : 'num',
        'aria-sort': active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none',
      }, btn);
    }));

    const body = el('tbody');
    for (const m of rows) {
      const detail = bossRow(m, COLUMNS.length);
      detail.hidden = true;
      const tr = el('tr', { class: 'data-row' }, ...COLUMNS.map((c, i) => {
        const v = c.value(m);
        if (i === 0) {
          const btn = el('button', { class: 'row-btn', type: 'button', 'aria-expanded': 'false' },
            swatch(m), el('span', { text: v }), el('span', { class: 'sr-only', text: ` (${m.className})` }));
          btn.addEventListener('click', () => {
            detail.hidden = !detail.hidden;
            btn.setAttribute('aria-expanded', String(!detail.hidden));
            tr.classList.toggle('is-open', !detail.hidden);
          });
          return el('th', { scope: 'row' }, btn);
        }
        if (v == null) return el('td', { class: 'num empty', text: '–' });
        const ratio = maxes[i] > 0 ? v / maxes[i] : 0;
        return el('td', { class: 'num' },
          el('span', { class: `bar ${widthClass(ratio)}`, 'aria-hidden': 'true' }),
          el('span', { class: 'val', text: (c.fmt || formatNumber)(v) }));
      }));
      body.append(tr, detail);
    }
    wrap.replaceChildren(el('table', { class: 'stats-table' }, el('thead', {}, head), body));
  };

  paint();
  return wrap;
}

// ---- 4. boss board -------------------------------------------------------

function bossCard(inst, index) {
  const open = index < 3;
  const bodyId = `boss-inst-${index}`;
  const btn = el('button', { class: 'boss-toggle', type: 'button', 'aria-expanded': String(open), 'aria-controls': bodyId },
    el('span', { class: 'boss-inst', text: inst.instance }),
    el('span', { class: 'boss-total', text: `${formatNumber(inst.total)} kills` }),
    el('span', { class: 'boss-caret', 'aria-hidden': 'true' }));
  const body = el('div', { class: 'boss-body', id: bodyId },
    ...inst.bosses.map((b) => el('div', { class: 'boss-item' },
      el('div', { class: 'boss-head' },
        el('span', { class: 'boss-name', text: b.name }),
        el('span', { class: 'muted small', text: `${formatNumber(b.total)} kills` })),
      el('ul', { class: 'boss-chips' }, ...b.members.map((x) => el('li', { class: 'chip' },
        swatch(x.member), el('span', { text: `${fullName(x.member)} × ${formatNumber(x.count)}` })))))));
  body.hidden = !open;
  btn.addEventListener('click', () => {
    body.hidden = !body.hidden;
    btn.setAttribute('aria-expanded', String(!body.hidden));
  });
  return el('article', { class: 'boss-card' }, el('h3', { class: 'boss-card-title' }, btn), body);
}

export function renderStats(root, ctx) {
  const members = ctx.state.members || [];
  if (!members.length) {
    root.append(emptyState('No stats yet', 'The first refresh has not finished.'));
    return;
  }
  const board = bossBoard(members);
  root.append(el('div', { class: 'stats-page' },
    el('p', { class: 'muted small', text: 'Guild totals, top players and per-member numbers, plus every boss the guild has killed. Click a row for boss details.' }),
    totalsStrip(members),
    el('section', { 'aria-labelledby': 'lb-h' },
      el('h2', { class: 'section-title', id: 'lb-h', text: 'Leaderboards' }),
      el('div', { class: 'lb-grid' }, ...BOARDS.map((b) => leaderCard(b, members)))),
    el('section', { 'aria-labelledby': 'tbl-h' },
      el('h2', { class: 'section-title', id: 'tbl-h', text: 'All members' }),
      statsTable(members)),
    el('section', { 'aria-labelledby': 'boss-h' },
      el('h2', { class: 'section-title', id: 'boss-h', text: 'Boss board' }),
      board.length
        ? el('div', { class: 'boss-grid' }, ...board.map(bossCard))
        : el('p', { class: 'muted', text: 'No boss kills recorded yet.' }))));
}
