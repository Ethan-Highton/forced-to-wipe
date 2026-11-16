import { el, emptyState, errorState, skeleton } from '../dom.js';
import { getLevelups } from '../api.js';
import { dayKey, formatDay, formatTime } from '../format.js';

let selected = '';

export async function renderLevelups(root) {
  root.replaceChildren(skeleton(5));
  let entries;
  try {
    entries = (await getLevelups()).entries || [];
  } catch (err) {
    root.replaceChildren(errorState(err.message, () => renderLevelups(root)));
    return;
  }
  if (!entries.length) {
    root.replaceChildren(emptyState('No level-ups recorded yet', 'New level-ups show up after the next refresh that detects one.'));
    return;
  }

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
        ul = el('ul', { class: 'log-items' });
        list.append(el('section', { class: 'log-day' }, el('h3', { class: 'day-title', text: formatDay(e.at) }), ul));
      }
      ul.append(el('li', { class: 'log-item' },
        el('span', { class: 'log-time', text: `${e.approx ? '~' : ''}${formatTime(e.at)}` }),
        el('span', { class: 'log-text' },
          el('a', { class: 'log-name', href: `#/member/${encodeURIComponent(e.charId)}`, text: e.name }),
          ` ${e.oldLevel} → `, el('strong', { text: String(e.newLevel) }),
          e.source === 'imported' ? el('span', { class: 'badge', text: 'imported' }) : null)));
    }
  };

  const pick = el('select', { class: 'field', 'aria-label': 'Filter by member' },
    el('option', { value: '', text: 'All members' }),
    ...people.map(([id, name]) => el('option', { value: id, text: name, selected: id === selected })));
  pick.addEventListener('change', () => { selected = pick.value; paint(); });

  root.replaceChildren(
    el('div', { class: 'controls' }, pick),
    el('p', { class: 'muted small', text: '~ times are approximate: level-ups are detected on each refresh.' }),
    list);
  paint();
}
