import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, classColour } from '../../server/notify.js';
import { createRefresher } from '../../server/refresh.js';
import { makeFetch, makeRoster, makeStack } from './helpers.js';

const URL_OK = 'https://discord.com/api/webhooks/123/SECRET-TOKEN';

function makeLog() {
  const lines = [];
  return Object.assign((m) => lines.push(String(m)), { lines, addSecret() {} });
}

function mockDiscord(responder = () => new Response(null, { status: 204 })) {
  const posts = [];
  const f = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return responder(posts.length);
  };
  f.posts = posts;
  return f;
}

const levelup = (i, extra = {}) => ({ id: `${i}-34`, name: `Char ${i}`, oldLevel: 33, newLevel: 34, classId: 9, className: 'Warlock', ...extra });

test('level-up embed: title, description, class colour', async () => {
  const f = mockDiscord();
  const n = createNotifier({ url: URL_OK, fetchImpl: f, log: makeLog(), config: {} });
  await n.notify({ guildName: 'Forced to Wipe', levelups: [levelup(1, { name: 'Carlos Frechette' })] });
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].url, URL_OK);
  assert.equal(f.posts[0].body.username, 'Forced to Wipe');
  assert.deepEqual(f.posts[0].body.embeds, [{
    title: 'Carlos Frechette reached level 34', description: 'Warlock · was 33', color: 0x8788ee,
  }]);
});

test('class colour mapping and fallback', () => {
  assert.equal(classColour(1), 0xc69b6d);
  assert.equal(classColour(6), 0xc41e3a);
  assert.equal(classColour(13), 0x33937f);
  assert.equal(classColour(99), 0x7a8499);
});

test('joins and leaves are formatted; event filter is honoured', async () => {
  const f = mockDiscord();
  const events = {
    guildName: 'G', levelups: [levelup(1)],
    joined: [{ name: 'New Guy', classId: 5, className: 'Priest', level: 12 }],
    left: [{ name: 'Old Guy', classId: 1, className: 'Warrior', level: 40 }],
  };
  await createNotifier({ url: URL_OK, fetchImpl: f, log: makeLog(), config: {} }).notify(events);
  assert.deepEqual(f.posts[0].body.embeds.map((e) => e.title), ['Char 1 reached level 34', 'New Guy joined the guild', 'Old Guy left the guild']);

  const g = mockDiscord();
  await createNotifier({ url: URL_OK, fetchImpl: g, log: makeLog(), config: { notify: { events: ['joins'], minDeaths: 3 } } }).notify(events);
  assert.deepEqual(g.posts[0].body.embeds.map((e) => e.title), ['New Guy joined the guild']);
});

test('more than 10 embeds are split into several POSTs', async () => {
  const f = mockDiscord();
  const n = createNotifier({ url: URL_OK, fetchImpl: f, log: makeLog(), config: {} });
  await n.notify({ guildName: 'G', levelups: Array.from({ length: 23 }, (_, i) => levelup(i)) });
  assert.deepEqual(f.posts.map((p) => p.body.embeds.length), [10, 10, 3]);
});

test('429 waits Retry-After once then gives up', async () => {
  const waits = [];
  const f = mockDiscord(() => new Response('', { status: 429, headers: { 'Retry-After': '2' } }));
  const log = makeLog();
  const n = createNotifier({ url: URL_OK, fetchImpl: f, log, config: {}, sleep: async (ms) => { waits.push(ms); } });
  await n.notify({ guildName: 'G', levelups: [levelup(1)] });
  assert.deepEqual(waits, [2000]);
  assert.equal(f.posts.length, 2);
  assert.ok(log.lines.some((l) => l.includes('429')));

  const ok = mockDiscord((n2) => (n2 === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '1' } }) : new Response(null, { status: 204 })));
  await createNotifier({ url: URL_OK, fetchImpl: ok, log, config: {}, sleep: async () => {} }).notify({ guildName: 'G', levelups: [levelup(1)] });
  assert.equal(ok.posts.length, 2);
});

test('webhook URL never appears in logs, even when fetch throws with it', async () => {
  const log = makeLog();
  const throwing = async (url) => { throw new Error(`connect failed for ${url}`); };
  await createNotifier({ url: URL_OK, fetchImpl: throwing, log, config: {} }).notify({ guildName: 'G', levelups: [levelup(1)] });
  const failing = mockDiscord(() => new Response('', { status: 500 }));
  await createNotifier({ url: URL_OK, fetchImpl: failing, log, config: {} }).notify({ guildName: 'G', levelups: [levelup(1)] });
  assert.equal(log.lines.length, 2);
  const text = log.lines.join('\n');
  assert.ok(!text.includes('SECRET-TOKEN'));
  assert.ok(!text.includes('discord.com/api/webhooks'));
});

test('missing or invalid URL means no network calls', async () => {
  const f = mockDiscord();
  const log = makeLog();
  const none = createNotifier({ url: '', fetchImpl: f, log, config: {} });
  await none.notify({ guildName: 'G', levelups: [levelup(1)] });
  const bad = createNotifier({ url: 'https://evil.example/api/webhooks/1/x', fetchImpl: f, log, config: {} });
  await bad.notify({ guildName: 'G', levelups: [levelup(1)] });
  assert.equal(f.posts.length, 0);
  assert.equal(none.enabled, false);
  assert.equal(bad.enabled, false);
  assert.equal(log.lines.length, 1); // only the invalid URL warns
  assert.ok(!log.lines[0].includes('evil.example'));
});

test('deaths are off by default and respect minDeaths', async () => {
  const events = {
    guildName: 'G',
    deaths: [
      { name: 'A', classId: 1, className: 'Warrior', from: 10, to: 12 },
      { name: 'B', classId: 1, className: 'Warrior', from: 10, to: 13 },
    ],
  };
  const off = mockDiscord();
  await createNotifier({ url: URL_OK, fetchImpl: off, log: makeLog(), config: {} }).notify(events);
  assert.equal(off.posts.length, 0);

  const on = mockDiscord();
  const config = { notify: { events: ['deaths'], minDeaths: 3 } };
  await createNotifier({ url: URL_OK, fetchImpl: on, log: makeLog(), config }).notify(events);
  assert.deepEqual(on.posts[0].body.embeds.map((e) => e.title), ['B died 3 times']);
});

// --- refresher integration ---

function stackWith(notifyConfig, fetchImpl) {
  const s = makeStack({ fetchImpl, configExtra: notifyConfig ? { notify: notifyConfig } : {} });
  const discord = mockDiscord();
  const notifier = createNotifier({ url: URL_OK, fetchImpl: discord, log: s.log, config: s.config });
  s.discord = discord;
  s.refresher = createRefresher({
    config: s.config, store: s.store, blizzard: s.blizzard, log: s.log, now: () => s.clock.t, onEvents: notifier.notify,
  });
  return s;
}

const carry = (to, from) => ['current.json', 'members.json', 'meta.json'].forEach((f) => to.store.write(f, from.store.read(f, {})));

test('seeded-run silence: first run posts nothing', async () => {
  const s = stackWith();
  assert.equal((await s.refresher.run()).status, 'ok');
  assert.equal(s.discord.posts.length, 0);
});

test('level-up cycle notifies once, with class colour; retried cycle does not repeat', async () => {
  const base = stackWith();
  await base.refresher.run();

  const s2 = stackWith(null, makeFetch({ roster: makeRoster(['Jeezus', 'Carlos'], { Jeezus: 36 }) }));
  carry(s2, base);
  await s2.refresher.run();
  assert.equal(s2.discord.posts.length, 1);
  const [embed] = s2.discord.posts[0].body.embeds;
  assert.match(embed.title, /^Jeezus Khryst reached level 36$/);
  assert.equal(embed.description, 'Priest · was 35');
  assert.equal(embed.color, classColour(5));
  assert.deepEqual(s2.store.readMeta().notifiedLevelups, ['5677618-36']);

  // Retry from the pre-cycle state but with the saved meta (levelups.json not carried over).
  const s3 = stackWith(null, makeFetch({ roster: makeRoster(['Jeezus', 'Carlos'], { Jeezus: 36 }) }));
  carry(s3, base);
  s3.store.write('meta.json', s2.store.readMeta());
  await s3.refresher.run();
  assert.equal(s3.discord.posts.length, 0);
});

test('failed or rejected cycles never notify', async () => {
  const base = stackWith();
  await base.refresher.run();
  const s = stackWith(null, makeFetch({ roster: makeRoster(['Jeezus', 'Carlos'], { Carlos: 30 }) }));
  carry(s, base);
  assert.equal((await s.refresher.run()).status, 'failed');
  assert.equal(s.discord.posts.length, 0);
});

test('joins and leaves are announced; deaths only past the threshold', async () => {
  const base = stackWith();
  await base.refresher.run();

  const s2 = stackWith(null, makeFetch({ roster: makeRoster(['Jeezus']) }));
  carry(s2, base);
  await s2.refresher.run();
  assert.equal(s2.discord.posts[0].body.embeds.length, 1);
  assert.match(s2.discord.posts[0].body.embeds[0].title, /^Carlos \S+ left the guild$/);

  const s3 = stackWith({ events: ['deaths'], minDeaths: 3 });
  carry(s3, base);
  const cur = s3.store.read('current.json', {});
  const jeezus = cur.members.find((m) => m.name === 'Jeezus');
  jeezus.stats.deaths -= 3;
  s3.store.write('current.json', cur);
  await s3.refresher.run();
  assert.deepEqual(s3.discord.posts[0].body.embeds.map((e) => e.title), ['Jeezus Khryst died 3 times']);

  const s4 = stackWith({ events: ['deaths'], minDeaths: 3 });
  carry(s4, base);
  const cur4 = s4.store.read('current.json', {});
  cur4.members.find((m) => m.name === 'Jeezus').stats.deaths -= 2;
  s4.store.write('current.json', cur4);
  await s4.refresher.run();
  assert.equal(s4.discord.posts.length, 0);
});

test('a failing notifier does not fail the refresh', async () => {
  const base = stackWith();
  await base.refresher.run();
  const s = stackWith(null, makeFetch({ roster: makeRoster(['Jeezus']) }));
  carry(s, base);
  s.refresher = createRefresher({
    config: s.config, store: s.store, blizzard: s.blizzard, log: s.log, now: () => s.clock.t,
    onEvents: async () => { throw new Error('boom'); },
  });
  assert.equal((await s.refresher.run()).status, 'ok');
});
