import { el, svg, errorState, skeleton } from '../dom.js';
import { getLevelups } from '../api.js';
import { dayKey, formatTime } from '../format.js';
import { meterStep } from '../roster-model.js';
import { revealChildren } from '../motion.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
let selected = '';

function arrow() {
  return svg('svg', { class: 'arrow', viewBox: '0 0 16 12', width: '16', height: '12', 'aria-hidden': 'true' },
    svg('path', { d: 'M1 6h13M9.5 1.5 14 6l-4.5 4.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }));
}

// "Most levels gained (7 days)": sum of newLevel - oldLevel per character, top five.
function weeklyLeaders(entries, now, memberById) {
  const by = new Map();
  for (const e of entries) {
    if (now - e.at > WEEK) continue;
    const row = by.get(e.charId) || { charId: e.charId, name: e.name, gained: 0 };
    row.gained += Math.max(0, e.newLevel - e.oldLevel);
    by.set(e.charId, row);
  }
  const rows = [...by.values()].filter((r) => r.gained > 0)
    .sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name)).slice(0, 5);
  const lead = rows.length ? rows[0].gained : 0;
  const box = el('aside', { class: 'lu-side' }, el('h2', { class: 'rule-title', text: 'Most levels gained (7 days)' }));
  if (!rows.length) {
    box.append(el('p', { class: 'calm', text: 'Nobody has gained a level in the last 7 days.' }));
    return box;
  }
  box.append(el('ol', { class: 'lu-rank' }, ...rows.map((r, i) => {
    const m = memberById.get(String(r.charId));
    return el('li', { class: 'lu-rank-row', 'data-class': m ? m.classId : null },
      el('span', { class: 'lu-pos', text: String(i + 1) }),
      el('span', { class: 'lu-who' },
        el('span', { class: 'swatch', 'aria-hidden': 'true' }),
        el('a', { href: `#/member/${encodeURIComponent(r.charId)}`, text: r.name })),
      el('span', { class: 'lu-gain', text: `+${r.gained}` }),
      el('span', { class: 'meter', 'aria-hidden': 'true' }, el('span', { class: `fill pc${meterStep(r.gained / lead)}` })));
  })));
  return box;
}

function nextRefreshText(ctx) {
  const state = ctx && ctx.state;
  const mins = (ctx && ctx.config && ctx.config.refreshMinutes) || 60;
  const at = state && state.meta && state.meta.refreshedAt;
  if (at == null) return `Refreshes run every ${mins} min.`;
  const left = Math.ceil((at + mins * 60000 - Date.now()) / 60000);
  return left > 0 ? `The next refresh runs in about ${left} min.` : 'The next refresh is due now.';
}

export async function renderLevelups(root, ctx) {
  root.replaceChildren(skeleton(5));
  let entries;
  try {
    entries = (await getLevelups()).entries || [];
  } catch (err) {
    root.replaceChildren(errorState(err.message, () => renderLevelups(root, ctx)));
    return;
  }
  if (!entries.length) {
    root.replaceChildren(
      el('h2', { class: 'rule-title', text: 'Level-ups' }),
      el('p', { class: 'calm', text: `Nobody has levelled since tracking began. Level-ups are recorded from the first refresh. ${nextRefreshText(ctx)}` }));
    return;
  }

  const memberById = new Map(((ctx && ctx.state && ctx.state.members) || []).map((m) => [String(m.id), m]));
  const people = [...new Map(entries.map((e) => [String(e.charId), e.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  if (!people.some(([id]) => id === selected)) selected = '';

  const list = el('div', { class: 'log' });
  const paint = () => {
    list.replaceChildren();
    const shown = entries.filter((e) => !selected || String(e.charId) === selected);
    let lastDay = null;
    let ul = null;
    for (const e of shown) {
      const key = dayKey(e.at);
      if (key !== lastDay) {
        lastDay = key;
        const d = new Date(e.at);
        ul = el('ul', { class: 'log-items' });
        list.append(el('section', { class: 'log-day' },
          el('h3', { class: 'day' },
            el('span', { class: 'day-num', text: String(d.getDate()) }),
            el('span', { class: 'day-month', text: d.toLocaleDateString(undefined, { month: 'short' }) }),
            el('span', { class: 'day-week', text: d.toLocaleDateString(undefined, { weekday: 'short' }) })),
          ul));
      }
      const m = memberById.get(String(e.charId));
      ul.append(el('li', { class: 'log-item', 'data-class': m ? m.classId : null },
        el('span', { class: 'log-time', text: `${e.approx ? '~' : ''}${formatTime(e.at)}` }),
        el('span', { class: 'swatch', 'aria-hidden': 'true' }),
        el('a', { class: 'log-name', href: `#/member/${encodeURIComponent(e.charId)}`, text: e.name }),
        m && m.className ? el('span', { class: 'log-class', text: m.className }) : null,
        el('span', { class: 'log-levels' },
          el('span', { class: 'lv-old', text: String(e.oldLevel) }), arrow(),
          el('span', { class: 'lv-new', text: String(e.newLevel) }),
          el('span', { class: 'vh', text: `, level ${e.oldLevel} to ${e.newLevel}` })),
        e.source === 'imported' ? el('span', { class: 'log-src', text: 'imported' }) : null));
    }
  };

  const pick = el('select', { class: 'field', 'aria-label': 'Filter by member' },
    el('option', { value: '', text: 'All members' }),
    ...people.map(([id, name]) => el('option', { value: id, text: name, selected: id === selected })));
  pick.addEventListener('change', () => { selected = pick.value; paint(); });

  root.replaceChildren(
    el('div', { class: 'lu' },
      el('div', { class: 'lu-head' },
        el('h2', { class: 'rule-title', text: 'Level-ups' }),
        el('div', { class: 'controls' }, pick),
        el('p', { class: 'muted small', text: '~ marks an approximate time: level-ups are detected on each refresh.' })),
      weeklyLeaders(entries, Date.now(), memberById),
      el('div', { class: 'lu-feed' }, list)));
  paint();
  revealChildren(root, '.lu-head, .lu-side, .log-day');
}
