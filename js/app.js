import { el, errorState, skeleton } from './dom.js';
import { getConfig, getState, postRefresh } from './api.js';
import { startRouter } from './router.js';
import { isStale } from './derive.js';
import { formatCountdown, readableTextColor, relativeTime } from './format.js';
import { renderRoster } from './views/roster.js';
import { renderStats } from './views/stats.js';
import { renderLevelups } from './views/levelups.js';
import { renderMember } from './views/member.js';

const ctx = {
  config: { guildName: '', refreshMinutes: 60, activityDays: { quiet: 3, inactive: 14 }, branding: { title: 'Forced to Wipe', accent: '#e0a43a', logo: '' } },
  state: null,
  loadError: null,
};

const $ = (id) => document.getElementById(id);
const view = $('view');
let route = { name: 'roster' };
let renderToken = 0;

function applyBranding() {
  const b = ctx.config.branding || {};
  const accent = /^#[0-9a-f]{6}$/i.test(b.accent || '') ? b.accent : '#e0a43a';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', readableTextColor(accent));
  const title = b.title || 'Forced to Wipe';
  document.title = title;
  $('brand-title').textContent = title;
  $('brand-sub').textContent = ctx.config.guildName || '';
  const logo = $('brand-logo');
  if (b.logo) { logo.src = b.logo; logo.hidden = false; } else logo.hidden = true;
}

async function loadAll() {
  view.replaceChildren(skeleton(5));
  try {
    try { ctx.config = { ...ctx.config, ...(await getConfig()) }; } catch { /* defaults are fine */ }
    ctx.state = await getState();
    ctx.loadError = null;
  } catch (err) {
    ctx.loadError = err;
  }
  applyBranding();
  renderChrome();
  renderRoute();
}

// Stale banner and footer text both depend on the freshest state.
function renderChrome() {
  const banner = $('stale-banner');
  const meta = ctx.state && ctx.state.meta;
  if (meta && meta.refreshStatus === 'never') {
    banner.textContent = 'No data has been fetched yet. The first refresh is still pending.';
    banner.hidden = false;
  } else if (meta && isStale(meta)) {
    banner.textContent = `Data is out of date: last successful refresh ${relativeTime(meta.lastSuccessAt)}.`;
    banner.hidden = false;
  } else if (meta && meta.refreshStatus === 'partial') {
    banner.textContent = 'Some sections could not be refreshed and show older data.';
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
  $('updated').textContent = meta && meta.refreshedAt != null
    ? `Updated ${relativeTime(meta.refreshedAt)} · game data lags 20–40 min`
    : 'Not updated yet · game data lags 20–40 min';
  if (meta && meta.cooldownSec > 0 && !cooldownTimer) startCooldown(meta.cooldownSec);
}

function renderRoute() {
  const token = ++renderToken;
  view.replaceChildren();
  for (const a of document.querySelectorAll('.tabbar a')) {
    const on = a.dataset.route === route.name || (route.name === 'member' && a.dataset.route === 'roster');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  // Level-ups load their own data, so they work even if state failed.
  if (route.name === 'levelups') { renderLevelups(view); return; }
  if (ctx.loadError) {
    view.append(errorState(ctx.loadError.message, loadAll));
    return;
  }
  if (!ctx.state) { view.append(skeleton(5)); return; }
  if (token !== renderToken) return;
  if (route.name === 'stats') renderStats(view, ctx);
  else if (route.name === 'member') renderMember(view, ctx, route.id);
  else renderRoster(view, ctx);
}

// ---- refresh button -------------------------------------------------------

const btn = $('refresh');
const status = $('refresh-status');
let cooldownTimer = null;

function startCooldown(sec) {
  let left = sec;
  clearInterval(cooldownTimer);
  const tick = () => {
    if (left <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      btn.disabled = false;
      status.textContent = '';
      return;
    }
    btn.disabled = true;
    status.textContent = `Refresh available in ${formatCountdown(left)}`;
    left -= 1;
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

// After a refresh starts, poll until the server reports a newer attempt.
async function waitForRefresh(prevAttempt) {
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const s = await getState();
      if (s.meta.lastAttemptAt !== prevAttempt) {
        ctx.state = s;
        ctx.loadError = null;
        status.textContent = s.meta.refreshStatus === 'failed' ? 'Refresh failed. Showing earlier data.' : 'Refresh complete.';
        btn.disabled = false;
        renderChrome();
        renderRoute();
        return;
      }
    } catch { /* keep polling */ }
  }
  btn.disabled = false;
  status.textContent = 'Still refreshing. Check back shortly.';
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Starting refresh…';
  const prev = ctx.state && ctx.state.meta.lastAttemptAt;
  try {
    const { status: code, body } = await postRefresh();
    if (code === 202) {
      status.textContent = 'Refreshing…';
      await waitForRefresh(prev);
    } else if (code === 429) {
      startCooldown(body.retryAfterSec || 60);
    } else if (code === 409) {
      status.textContent = 'A refresh is already running.';
      await waitForRefresh(prev);
    } else {
      status.textContent = `Refresh failed (${code}).`;
      btn.disabled = false;
    }
  } catch {
    status.textContent = 'Could not reach the server.';
    btn.disabled = false;
  }
});

startRouter((r) => {
  route = r;
  renderRoute();
});
loadAll();
setInterval(renderChrome, 60000);
