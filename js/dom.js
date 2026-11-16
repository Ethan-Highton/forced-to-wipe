// Tiny DOM builder. API strings only ever reach the page via textContent / text nodes.

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(node, props) {
  for (const [key, val] of Object.entries(props || {})) {
    if (val == null || val === false) continue;
    if (key === 'class') node.setAttribute('class', val);
    else if (key === 'text') node.textContent = val;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), val);
    else node.setAttribute(key, val === true ? '' : String(val));
  }
}

function append(node, children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  apply(node, props);
  append(node, children);
  return node;
}

export function svg(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, props);
  append(node, children);
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function skeleton(rows = 4) {
  const box = el('div', { class: 'skeleton-list', 'aria-busy': 'true', 'aria-label': 'Loading' });
  for (let i = 0; i < rows; i++) box.append(el('div', { class: 'skeleton' }));
  return box;
}

export function emptyState(title, hint) {
  return el('div', { class: 'state state-empty' },
    el('p', { class: 'state-title', text: title }),
    hint ? el('p', { class: 'state-hint', text: hint }) : null);
}

export function errorState(message, onRetry) {
  return el('div', { class: 'state state-error', role: 'alert' },
    el('p', { class: 'state-title', text: 'Could not load' }),
    el('p', { class: 'state-hint', text: message }),
    el('button', { class: 'btn', type: 'button', text: 'Retry', onclick: onRetry }));
}
