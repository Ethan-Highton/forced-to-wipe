import crypto from 'node:crypto';
import { serveStatic } from './static.js';
import { rosterCsv, statsCsv, levelupsCsv } from './csv.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

const COOKIE = 'ftw_access';

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(payload);
}
const sendJson = (res, status, body, extra) => send(res, status, body, undefined, extra);
const notFound = (res) => send(res, 404, 'Not found', 'text/plain; charset=utf-8');

function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

/** Plain page shown when config or credentials are missing. */
export function handleSetupRequired(req, res, problem) {
  applySecurityHeaders(res);
  send(res, 503, `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Setup required</title>
<h1>Setup required</h1><p>${problem}. Run <code>npm run setup</code> on the server, then restart it.</p>`, 'text/html; charset=utf-8');
}

const hash = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

/**
 * Builds the request handler.
 * ctx: { config, store, refresher, limiter, accessCode, log, staticRoot, now }
 */
export function createHandler(ctx) {
  const { config, store, refresher, limiter, accessCode = '', log = () => {}, staticRoot, now = Date.now } = ctx;
  const startedAt = now();
  const base = config.basePath;
  const cookieValue = accessCode ? hash(`ftw:${accessCode}`).toString('hex') : '';
  const loginHits = new Map();

  const hasAccess = (req) => {
    if (!accessCode) return true;
    const match = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
    return !!match && safeEqual(match.slice(COOKIE.length + 1), cookieValue);
  };

  function loginPage(res, status = 401, note = '') {
    send(res, status, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Access code</title>
<form method="post" action="${base}/login"><p>${note}Enter the access code:</p><input type="password" name="code" autofocus autocomplete="current-password"> <button>Enter</button></form>`, 'text/html; charset=utf-8');
  }

  async function handleLogin(req, res, ip) {
    const t = now();
    const hits = (loginHits.get(ip) ?? []).filter((h) => t - h < 60_000);
    hits.push(t);
    loginHits.set(ip, hits);
    if (hits.length > 10) return sendJson(res, 429, { retryAfterSec: 60 });
    const code = new URLSearchParams(await readBody(req)).get('code') ?? '';
    if (!safeEqual(code, accessCode)) return loginPage(res, 401, 'Wrong code. ');
    res.writeHead(303, {
      Location: './',
      'Set-Cookie': `${COOKIE}=${cookieValue}; Path=${base || '/'}; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    });
    res.end();
  }

  function composeState() {
    const current = store.readCurrent();
    const meta = store.readMeta();
    const lastUp = new Map();
    for (const e of store.readLevelups()) lastUp.set(e.charId, Math.max(lastUp.get(e.charId) ?? 0, e.at));
    const status = meta.consecutiveFailures > 0 ? 'failed' : (current?.refreshStatus ?? 'never');
    return {
      meta: {
        refreshedAt: current?.refreshedAt ?? null,
        refreshStatus: current ? status : 'never',
        lastSuccessAt: meta.lastSuccessAt,
        lastAttemptAt: meta.lastAttemptAt,
        refreshMinutes: config.refreshMinutes,
        cooldownSec: limiter.cooldownSec(),
      },
      guild: current?.guild ?? { name: config.guildName, memberCount: 0 },
      members: (current?.members ?? []).map((m) => ({ ...m, lastLevelUpAt: lastUp.get(m.id) ?? null })),
      errors: current?.errors ?? [],
    };
  }

  function sortedLevelups(url) {
    const charId = url.searchParams.get('charId');
    let entries = store.readLevelups();
    if (charId) entries = entries.filter((e) => String(e.charId) === charId);
    return entries.sort((a, b) => b.at - a.at);
  }

  function csv(res, name, body) {
    send(res, 200, body, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${name}"` });
  }

  async function handleApi(req, res, url, route, ip) {
    const method = req.method;
    if (route === 'refresh') {
      if (method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
      if (refresher.isRunning()) return sendJson(res, 409, { running: true });
      const verdict = limiter.check(ip);
      if (!verdict.ok) return sendJson(res, 429, { retryAfterSec: verdict.retryAfterSec }, { 'Retry-After': String(verdict.retryAfterSec) });
      limiter.markStarted();
      refresher.run().catch((err) => log(`Manual refresh crashed: ${err.message}`));
      return sendJson(res, 202, { started: true });
    }
    if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' }, { Allow: 'GET, HEAD' });

    switch (route) {
      case 'config':
        return sendJson(res, 200, {
          guildName: config.guildName, region: config.region, refreshMinutes: config.refreshMinutes,
          activityDays: config.activityDays, basePath: config.basePath, branding: config.branding,
        });
      case 'state':
        return sendJson(res, 200, composeState());
      case 'health':
        return sendJson(res, 200, {
          ok: true, uptimeSec: Math.round((now() - startedAt) / 1000), lastSuccessAt: store.readMeta().lastSuccessAt,
        });
      case 'levelups': {
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        return sendJson(res, 200, { entries: sortedLevelups(url).slice(0, limit) });
      }
      case 'export/roster.csv':
        return csv(res, 'roster.csv', rosterCsv(composeState().members));
      case 'export/stats.csv':
        return csv(res, 'stats.csv', statsCsv(composeState().members));
      case 'export/levelups.csv':
        return csv(res, 'levelups.csv', levelupsCsv(sortedLevelups(url)));
      default: {
        const m = /^history\/(\d+)$/.exec(route);
        if (m) return sendJson(res, 200, { points: store.readHistory(m[1]) });
        return notFound(res);
      }
    }
  }

  return async function handler(req, res) {
    applySecurityHeaders(res);
    try {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        return notFound(res);
      }
      // Strip the mount point; anything outside it does not exist.
      if (base) {
        if (pathname === base) pathname = '/';
        else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
        else return notFound(res);
      }
      const url = new URL(req.url, 'http://localhost');
      const ip = req.socket?.remoteAddress ?? 'unknown';

      if (accessCode) {
        if (pathname === '/login' && req.method === 'POST') return await handleLogin(req, res, ip);
        if (!hasAccess(req)) return loginPage(res);
      }
      if (pathname.startsWith('/api/')) return await handleApi(req, res, url, pathname.slice(5), ip);
      if (await serveStatic(req, res, pathname, staticRoot)) return;
      return notFound(res);
    } catch (err) {
      log(`Request error: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
}
