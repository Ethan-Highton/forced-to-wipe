import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFetch, makeRoster, makeStack, readRaw, json } from './helpers.js';

const FILES = ['current.json', 'members.json', 'levelups.json'];
// Copy only files that exist; writing null would create files the real code never made.
const seed = (to, from) => FILES.forEach((f) => { const d = from.read(f, null); if (d !== null) to.write(f, d); });
const snapshot = (store) => FILES.map((f) => readRaw(store, f));
const isSection = (url, name) => url.includes(`/${name}?`);

test('first run writes a baseline: members, history, no level-ups', async () => {
  const s = makeStack();
  const result = await s.refresher.run();
  assert.equal(result.status, 'ok');
  const current = s.store.readCurrent();
  assert.equal(current.refreshStatus, 'ok');
  assert.equal(current.guild.memberCount, 2);
  const jeezus = current.members.find((m) => m.name === 'Jeezus');
  assert.equal(jeezus.stats.deaths, 103);
  assert.equal(jeezus.profile.xp, 31466);
  assert.equal(jeezus.className, 'Priest');
  assert.equal(jeezus.raceName, 'Troll');
  assert.equal(jeezus.detailsAvailable, true);
  assert.equal(s.store.readLevelups().length, 0);
  assert.equal(s.store.readMeta().seeded, true);
  assert.equal(s.store.readHistory('5677618').length, 1);
});

test('second run: level-up detected once, history only appended on change', async () => {
  const s = makeStack();
  await s.refresher.run();
  // Unchanged data: no new history point.
  s.clock.t += 3_600_000;
  await s.refresher.run();
  assert.equal(s.store.readHistory('5677618').length, 1);

  const roster = makeRoster(['Jeezus', 'Carlos'], { Jeezus: 36 });
  const s2 = makeStack({ fetchImpl: makeFetch({ roster }) });
  s2.store.write('current.json', s.store.readCurrent());
  s2.store.write('members.json', s.store.readMembers());
  s2.store.write('meta.json', s.store.readMeta());
  await s2.refresher.run();
  const ups = s2.store.readLevelups();
  assert.equal(ups.length, 1);
  assert.equal(ups[0].id, '5677618-36');
  assert.equal(ups[0].oldLevel, 35);
  await s2.refresher.run(); // same level again: no duplicate
  assert.equal(s2.store.readLevelups().length, 1);
});

test('sub-endpoint failure keeps the previous section as stale and marks partial', async () => {
  const s = makeStack();
  await s.refresher.run();
  const before = s.store.readCurrent().members.find((m) => m.name === 'Jeezus').pvp;

  const failing = makeFetch({ hook: (url, _i, kind) => (kind === 'character' && isSection(url, 'pvp-summary') ? new Response('', { status: 500 }) : undefined) });
  const s2 = makeStack({ fetchImpl: failing });
  s2.store.write('current.json', s.store.readCurrent());
  s2.store.write('members.json', s.store.readMembers());
  s2.store.write('meta.json', s.store.readMeta());
  s2.clock.t += 3_600_000;
  const result = await s2.refresher.run();
  assert.equal(result.status, 'partial');
  const current = s2.store.readCurrent();
  assert.equal(current.refreshStatus, 'partial');
  const pvp = current.members.find((m) => m.name === 'Jeezus').pvp;
  assert.equal(pvp.hk, 196);
  assert.equal(pvp.stale, true);
  assert.equal(pvp.fetchedAt, before.fetchedAt);
  assert.ok(current.errors.some((e) => e.section === 'pvp' && e.code === '500'));
  // Two retries on 5xx => 3 attempts per failing request.
  assert.equal(failing.calls.filter((u) => u.includes('jeezus-khryst/pvp-summary')).length, 3);
});

test('roster failure leaves data files untouched', async () => {
  const s = makeStack();
  await s.refresher.run();
  const before = snapshot(s.store);
  const broken = makeFetch({ hook: (_u, _i, kind) => (kind === 'roster' ? new Response('', { status: 503 }) : undefined) });
  const s2 = makeStack({ fetchImpl: broken });
  seed(s2.store, s.store);
  s2.store.write('meta.json', s.store.readMeta());
  const raw = snapshot(s2.store);
  const result = await s2.refresher.run();
  assert.equal(result.status, 'failed');
  assert.deepEqual(snapshot(s2.store), raw);
  assert.equal(s2.store.readMeta().consecutiveFailures, 1);
});

test('empty roster and level decrease reject the cycle', async () => {
  const s = makeStack();
  await s.refresher.run();
  const raw = snapshot(s.store);

  const empty = makeStack({ fetchImpl: makeFetch({ roster: { guild: { name: 'x' }, members: [] } }) });
  seed(empty.store, s.store);
  assert.equal((await empty.refresher.run()).status, 'failed');
  assert.deepEqual(snapshot(empty.store), snapshot(s.store));

  const lower = makeStack({ fetchImpl: makeFetch({ roster: makeRoster(['Jeezus', 'Carlos'], { Carlos: 30 }) }) });
  seed(lower.store, s.store);
  const result = await lower.refresher.run();
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /level decreased/);
  assert.deepEqual(snapshot(lower.store), raw);
});

test('3 consecutive 429s abort the cycle and keep last good data', async () => {
  const s = makeStack();
  await s.refresher.run();
  const raw = snapshot(s.store);
  const limited = makeFetch({ hook: (_u, _i, kind) => (kind === 'character' ? new Response('', { status: 429, headers: { 'Retry-After': '1' } }) : undefined) });
  const s2 = makeStack({ fetchImpl: limited });
  seed(s2.store, s.store);
  s2.store.write('meta.json', s.store.readMeta());
  const result = await s2.refresher.run();
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /rate_limit_abort/);
  assert.deepEqual(snapshot(s2.store), raw);
  // Concurrency is 3, so at most 3 requests were in flight when it gave up.
  assert.ok(limited.calls.filter((u) => u.includes('/profile/wow/character/')).length <= 5);
});

test('401 refetches the token once and retries', async () => {
  let rejected = false;
  const f = makeFetch({
    hook: (_u, _i, kind) => {
      if (kind === 'character' && !rejected) { rejected = true; return new Response('', { status: 401 }); }
      return undefined;
    },
  });
  const s = makeStack({ fetchImpl: f });
  const result = await s.refresher.run();
  assert.equal(result.status, 'ok');
  assert.equal(f.calls.filter((u) => u.startsWith('https://oauth.battle.net/token')).length, 2);
});

test('under level 10 and profile 404 give detailsAvailable:false without errors', async () => {
  const roster = makeRoster(['Jeezus', 'Carlos'], { Carlos: 5 });
  const f = makeFetch({ roster });
  const s = makeStack({ fetchImpl: f });
  await s.refresher.run();
  const carlos = s.store.readCurrent().members.find((m) => m.name === 'Carlos');
  assert.equal(carlos.detailsAvailable, false);
  assert.equal(carlos.level, 5);
  assert.equal(f.calls.filter((u) => u.includes('carlos')).length, 0);

  const f404 = makeFetch({ hook: (u, _i, kind) => (kind === 'character' && u.includes('jeezus-khryst?') ? new Response('', { status: 404 }) : undefined) });
  const s2 = makeStack({ fetchImpl: f404 });
  const result = await s2.refresher.run();
  assert.equal(result.status, 'ok');
  assert.equal(s2.store.readCurrent().members.find((m) => m.name === 'Jeezus').detailsAvailable, false);
});

test('logs never contain the secret or token', async () => {
  const s = makeStack({ fetchImpl: makeFetch({ hook: (_u, _i, kind) => (kind === 'roster' ? json({}, 500) : undefined) }) });
  await s.refresher.run();
  const text = s.logs.join('\n');
  assert.ok(!text.includes('SUPERSECRET'));
  assert.ok(!text.includes('tok-secret-123'));
});
