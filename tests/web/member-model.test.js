import test from 'node:test';
import assert from 'node:assert/strict';
import { meterStep, meterClass, ratioOf, rankInGuild, rankLabel, statRows, skillRows, talentRows, bossKillRows } from '../../js/member-model.js';

test('meterStep rounds to 5% steps and clamps', () => {
  assert.equal(meterStep(0), 0);
  assert.equal(meterStep(1), 100);
  assert.equal(meterStep(0.5), 50);
  assert.equal(meterStep(0.512), 50);
  assert.equal(meterStep(0.53), 55);
  assert.equal(meterStep(-3), 0);
  assert.equal(meterStep(7), 100);
  assert.equal(meterStep(NaN), 0);
  assert.equal(meterStep(null), 0);
  assert.equal(meterClass(0.2), 'w20');
});

test('ratioOf survives zero division and missing data', () => {
  assert.equal(ratioOf(5, 0), 0);
  assert.equal(ratioOf(5, null), 0);
  assert.equal(ratioOf(undefined, 10), 0);
  assert.equal(ratioOf(150, 225), 150 / 225);
  assert.equal(ratioOf(300, 225), 1);
});

const mk = (id, deaths, extra = {}) => ({ id, name: id, stats: deaths == null ? null : { deaths, quests: 1, dungeons: 0, bossKills: 0, bosses: [] }, pvp: null, ...extra });
const get = (m) => m.stats && m.stats.deaths;

test('rankInGuild ranks with ties sharing a rank', () => {
  const list = [mk('a', 10), mk('b', 30), mk('c', 30), mk('d', 5)];
  assert.deepEqual(rankInGuild(list, get, list[1]), { rank: 1, of: 4 });
  assert.deepEqual(rankInGuild(list, get, list[2]), { rank: 1, of: 4 });
  assert.deepEqual(rankInGuild(list, get, list[0]), { rank: 3, of: 4 });
  assert.deepEqual(rankInGuild(list, get, list[3]), { rank: 4, of: 4 });
});

test('rankInGuild: missing data, n=1, zero values', () => {
  const list = [mk('a', 10), mk('b', null)];
  assert.equal(rankInGuild(list, get, list[1]), null);
  assert.deepEqual(rankInGuild(list, get, list[0]), { rank: 1, of: 1 });
  const solo = [mk('x', 0)];
  assert.deepEqual(rankInGuild(solo, get, solo[0]), { rank: 1, of: 1 });
  assert.deepEqual(rankInGuild([], get, mk('y', 4)), { rank: 1, of: 1 });
});

test('rankLabel', () => {
  assert.equal(rankLabel({ rank: 2, of: 13 }), '#2 of 13');
  assert.equal(rankLabel(null), '');
});

test('statRows covers every stat and tolerates a member with no data', () => {
  const bare = mk('z', null);
  const rows = statRows([bare], bare);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.value === null && r.rank === null));
  const full = mk('f', 3, { pvp: { hk: 9, bgs: [{ name: 'WSG', played: 4, won: 1 }] } });
  const r = Object.fromEntries(statRows([full, bare], full).map((x) => [x.key, x]));
  assert.equal(r.deaths.value, 3);
  assert.deepEqual(r.deaths.rank, { rank: 1, of: 1 });
  assert.equal(r.winRate.value, 0.25);
  assert.equal(r.winRate.percent, true);
});

test('skillRows and talentRows', () => {
  assert.deepEqual(skillRows([{ name: 'Tailoring', skill: 150, max: 225 }])[0].ratio, 150 / 225);
  assert.equal(skillRows([{ name: 'X', skill: 0, max: 0 }])[0].ratio, 0);
  assert.deepEqual(skillRows(null), []);
  const t = talentRows({ trees: [{ name: 'Disc', points: 19 }, { name: 'Shadow', points: 1 }] });
  assert.equal(t[0].main, true);
  assert.equal(t[1].main, false);
  assert.equal(t[0].ratio, 19 / 20);
  assert.deepEqual(talentRows(null), []);
  assert.equal(talentRows({ trees: [{ name: 'A', points: 0 }] })[0].ratio, 0);
  assert.equal(talentRows({ trees: [{ name: 'A', points: 0 }] })[0].main, false);
});

test('bossKillRows sorts by count then name and copes with no stats', () => {
  const rows = bossKillRows({ bosses: [{ name: 'B', count: 1 }, { name: 'A', count: 1 }, { name: 'C', count: 5 }] });
  assert.deepEqual(rows.map((r) => r.name), ['C', 'A', 'B']);
  assert.deepEqual(bossKillRows(null), []);
});
