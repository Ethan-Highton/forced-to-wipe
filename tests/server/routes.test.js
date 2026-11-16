import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHandler } from '../../server/routes.js';
import { createStore } from '../../server/store.js';
import { createRefreshLimiter } from '../../server/ratelimit.js';
import { makeConfig, tmpDir } from './helpers.js';

const EVIL = '<img src=x onerror=alert(1)>';
const SECRET = 'SUPERSECRET-VALUE';

function member(id, name, extra = {}) {
  return {
    id, slug: `${id}-slug`, name, surname: 'Test', rank: 1, classId: 5, className: 'Priest', raceId: 8, raceName: 'Troll',
    level: 20, detailsAvailable: true, profile: { xp: 1, ilvl: 2, lastLogin: 1794788323000, fetchedAt: 1, stale: false },
    talents: { trees: [{ name: 'Discipline', points: 5 }], fetchedAt: 1, stale: false },
    professions: { primary: [{ name: 'Tailoring', skill: 1, max: 75 }], secondary: [], fetchedAt: 1, stale: false },
    stats: { deaths: 1, quests: 2, dungeons: 3, bossKills: 4, bosses: [], fetchedAt: 1, stale: false },
    pvp: { hk: 5, bgs: [{ name: 'Arathi Basin', played: 2, won: 1 }], fetchedAt: 1, stale: false },
    ...extra,
  };
}

async function setup({ basePath = '', accessCode = '', running = false } = {}) {
  const config = makeConfig({ basePath });
  const root = tmpDir();
  for (const [file, body] of Object.entries({
    'index.html': '<!doctype html>INDEX', 'css/a.css': 'body{}', 'js/a.js': 'export {}',
    'server/secret.js': SECRET, '.env': `BNET_CLIENT_SECRET=${SECRET}`, 'data/current.json': SECRET,
  })) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  }
  const store = createStore(config.dataDir);
  store.write('current.json', {
    refreshedAt: 1000, refreshStatus: 'ok', errors: [], guild: { name: 'G', memberCount: 2 },
    members: [member(1, EVIL), member(2, '=cmd')],
  });
  store.write('levelups.json', [
    { id: '1-20', charId: 1, name: `${EVIL} Test`, at: 5, oldLevel: 19, newLevel: 20, approx: true, source: 'detected' },
  ]);
  store.write('meta.json', { lastSuccessAt: 1000, lastAttemptAt: 1000, consecutiveFailures: 0, seeded: true });
  store.write('history/2026-11.json', { 1: [{ t: 1, level: 19, xp: 1, ilvl: 1, deaths: 0, quests: 0, hk: 0 }] });
  let runs = 0;
  const refresher = { isRunning: () => running, run: async () => { runs++; return {}; } };
  const handler = createHandler({
    config, store, refresher, limiter: createRefreshLimiter(), accessCode, staticRoot: root, log: () => {},
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  // Raw request: fetch() would normalise ".." out of the path before it reaches us.
  const raw = (p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { raw, runs: () => runs, close: () => server.close() };
}

test('basePath is stripped; paths outside it 404', async (t) => {
  const s = await setup({ basePath: '/guild' });
  t.after(s.close);
  assert.equal((await s.raw('/guild/api/health')).status, 200);
  assert.equal((await s.raw('/guild/')).body, '<!doctype html>INDEX');
  assert.equal((await s.raw('/guild')).status, 200);
  assert.equal((await s.raw('/api/health')).status, 404);
  assert.equal((await s.raw('/guildx/api/health')).status, 404);
  assert.equal((await s.raw('/')).status, 404);
  assert.equal((await s.raw('/guild/css/a.css')).headers['content-type'], 'text/css; charset=utf-8');
});

test('static allowlist and traversal guard', async (t) => {
  const s = await setup();
  t.after(s.close);
  assert.equal((await s.raw('/')).status, 200);
  assert.equal((await s.raw('/js/a.js')).status, 200);
  for (const p of [
    '/js/../server/secret.js', '/js/..%2fserver%2fsecret.js', '/js/%2e%2e/server/secret.js', '/css/..%5c..%5c.env',
    '/js/%00.js', '/server/secret.js', '/.env', '/data/current.json', '/js/', '/js', '/css/missing.css', '/package.json',
  ]) {
    const res = await s.raw(p);
    assert.equal(res.status, 404, p);
    assert.ok(!res.body.includes(SECRET), p);
  }
});

test('security headers on every response', async (t) => {
  const s = await setup();
  t.after(s.close);
  for (const p of ['/', '/api/state', '/nope']) {
    const { headers } = await s.raw(p);
    assert.equal(headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(headers['content-security-policy'], /default-src 'self'; style-src 'self'; script-src 'self'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
  }
});

test('no secret appears in any response', async (t) => {
  const s = await setup();
  t.after(s.close);
  for (const p of ['/', '/api/config', '/api/state', '/api/levelups', '/api/history/1', '/api/health',
    '/api/export/roster.csv', '/api/export/stats.csv', '/api/export/levelups.csv', '/api/nope', '/.env']) {
    const res = await s.raw(p);
    assert.ok(!res.body.includes(SECRET), p);
    assert.ok(!JSON.stringify(res.headers).includes(SECRET), p);
  }
  const cfg = JSON.parse((await s.raw('/api/config')).body);
  assert.deepEqual(Object.keys(cfg).sort(), ['activityDays', 'basePath', 'branding', 'guildName', 'refreshMinutes', 'region']);
});

test('HTML-like names survive the round trip as inert JSON', async (t) => {
  const s = await setup();
  t.after(s.close);
  const state = await s.raw('/api/state');
  assert.match(state.headers['content-type'], /^application\/json/);
  assert.equal(JSON.parse(state.body).members[0].name, EVIL);
  assert.equal(JSON.parse(state.body).members[0].lastLevelUpAt, 5);
  assert.equal(JSON.parse((await s.raw('/api/levelups?charId=1')).body).entries[0].name, `${EVIL} Test`);
});

test('state, history and levelups shapes', async (t) => {
  const s = await setup();
  t.after(s.close);
  const state = JSON.parse((await s.raw('/api/state')).body);
  assert.equal(state.meta.refreshStatus, 'ok');
  assert.equal(state.meta.refreshMinutes, 60);
  assert.equal(state.guild.memberCount, 2);
  assert.equal(JSON.parse((await s.raw('/api/history/1')).body).points.length, 1);
  assert.equal((await s.raw('/api/history/..%2f..%2fmeta')).status, 404);
  assert.deepEqual(JSON.parse((await s.raw('/api/levelups?charId=2')).body), { entries: [] });
});

test('csv exports are attachments and neutralise formulas', async (t) => {
  const s = await setup();
  t.after(s.close);
  const res = await s.raw('/api/export/roster.csv');
  assert.match(res.headers['content-type'], /^text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment/);
  assert.ok(res.body.includes("'=cmd Test"));
  assert.ok((await s.raw('/api/export/stats.csv')).body.startsWith('Name,Deaths'));
});

test('refresh: 202, then cooldown 429; GET not allowed; 409 while running', async (t) => {
  const s = await setup();
  t.after(s.close);
  assert.equal((await s.raw('/api/refresh')).status, 405);
  const first = await s.raw('/api/refresh', { method: 'POST' });
  assert.equal(first.status, 202);
  assert.deepEqual(JSON.parse(first.body), { started: true });
  const second = await s.raw('/api/refresh', { method: 'POST' });
  assert.equal(second.status, 429);
  assert.ok(JSON.parse(second.body).retryAfterSec > 0);
  assert.equal(s.runs(), 1);
  assert.ok(JSON.parse((await s.raw('/api/state')).body).meta.cooldownSec > 0);

  const busy = await setup({ running: true });
  t.after(busy.close);
  const res = await busy.raw('/api/refresh', { method: 'POST' });
  assert.equal(res.status, 409);
  assert.deepEqual(JSON.parse(res.body), { running: true });
});

test('access code gate sets a cookie after login', async (t) => {
  const s = await setup({ accessCode: 'open-sesame' });
  t.after(s.close);
  assert.equal((await s.raw('/api/state')).status, 401);
  const post = (code) => s.raw('/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `code=${code}`,
  });
  assert.equal((await post('wrong')).status, 401);
  const ok = await post('open-sesame');
  assert.equal(ok.status, 303);
  const cookie = ok.headers['set-cookie'][0].split(';')[0];
  assert.equal((await s.raw('/api/state', { headers: { Cookie: cookie } })).status, 200);
});
