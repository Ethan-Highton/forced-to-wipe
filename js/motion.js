// The one authored motion: on route change, rows/blocks fade and rise 14px, staggered 18ms.
const RISE_PX = 14;
const DURATION_MS = 260;
const STAGGER_MS = 18;
const MAX_ITEMS = 12;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function revealChildren(container, selector) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  if (typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Skip anything not rendered (e.g. the phone card list on desktop) so it doesn't eat stagger slots.
  const items = [...container.querySelectorAll(selector)]
    .filter((n) => typeof n.getClientRects !== 'function' || n.getClientRects().length > 0)
    .slice(0, MAX_ITEMS);
  items.forEach((node, i) => {
    if (typeof node.animate !== 'function') return;
    node.animate(
      [{ opacity: 0, transform: `translateY(${RISE_PX}px)` }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: DURATION_MS, delay: i * STAGGER_MS, easing: EASE_OUT, fill: 'backwards' });
  });
}
