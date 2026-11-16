import { el, emptyState } from '../dom.js';
import { bgTotals } from '../derive.js';
import { formatNumber, formatPercent, fullName } from '../format.js';

const sort = { key: 'name', dir: 1 };

const COLUMNS = [
  { key: 'name', label: 'Member', text: true, value: (m) => fullName(m) },
  { key: 'deaths', label: 'Deaths', value: (m) => m.stats && m.stats.deaths },
  { key: 'quests', label: 'Quests', value: (m) => m.stats && m.stats.quests },
  { key: 'dungeons', label: 'Dungeons', value: (m) => m.stats && m.stats.dungeons },
  { key: 'bossKills', label: 'Boss kills', value: (m) => m.stats && m.stats.bossKills },
  { key: 'hk', label: 'HK', value: (m) => m.pvp && m.pvp.hk },
  { key: 'played', label: 'BGs played', value: (m) => m.pvp && bgTotals(m.pvp).played },
  { key: 'won', label: 'BGs won', value: (m) => m.pvp && bgTotals(m.pvp).won },
  { key: 'winPct', label: 'Win %', fmt: formatPercent, value: (m) => m.pvp && bgTotals(m.pvp).winRate },
];

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

export function renderStats(root, ctx) {
  const members = ctx.state.members || [];
  if (!members.length) {
    root.append(emptyState('No stats yet', 'The first refresh has not finished.'));
    return;
  }
  const wrap = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Member statistics, scrolls sideways' });

  const paint = () => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const rows = [...members].sort(compare(col));
    const head = el('tr', {}, ...COLUMNS.map((c) => {
      const active = c.key === sort.key;
      const btn = el('button', { class: 'th-btn', type: 'button', text: c.label });
      btn.addEventListener('click', () => {
        sort.dir = active ? -sort.dir : (c.text ? 1 : -1);
        sort.key = c.key;
        paint();
      });
      return el('th', { scope: 'col', 'aria-sort': active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none' }, btn);
    }));
    const body = el('tbody');
    for (const m of rows) {
      const detail = bossRow(m, COLUMNS.length);
      detail.hidden = true;
      const tr = el('tr', { class: 'data-row' }, ...COLUMNS.map((c, i) => {
        const v = c.value(m);
        const text = c.text ? v : (c.fmt || formatNumber)(v);
        if (i === 0) {
          const btn = el('button', { class: 'row-btn', type: 'button', 'aria-expanded': 'false', text });
          btn.addEventListener('click', () => {
            detail.hidden = !detail.hidden;
            btn.setAttribute('aria-expanded', String(!detail.hidden));
          });
          return el('th', { scope: 'row' }, btn);
        }
        return el('td', { class: 'num', text });
      }));
      body.append(tr, detail);
    }
    wrap.replaceChildren(el('table', { class: 'stats-table' }, el('thead', {}, head), body));
  };

  root.append(el('p', { class: 'muted small', text: 'Tap a name for the per-boss list.' }), wrap);
  paint();
}
