// Hash router: #/roster #/stats #/levelups #/member/<id>

export function parseHash(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'roster';
  if (name === 'member' && parts[1]) return { name, id: decodeURIComponent(parts[1]) };
  if (['roster', 'stats', 'levelups'].includes(name)) return { name };
  return { name: 'roster' };
}

export function startRouter(onRoute) {
  const fire = () => onRoute(parseHash(location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}
