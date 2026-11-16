import test from 'node:test';
import assert from 'node:assert/strict';
import { activity, averageLevel, highestMember, latestLevelUp, levelsGained, bgTotals, isStale, filterMembers, perLevel, guildTotals, leaders, bossBoard } from '../../js/derive.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const m = (name, level, xp = 0, extra = {}) => ({ name, surname: '', level, className: 'Mage', classId: 8, rank: 1, profile: { xp }, ...extra });

test('averageLevel rounds to one decimal', () => {
  assert.equal(averageLevel([m('a', 35), m('b', 28), m('c', 41)]), 34.7);
  assert.equal(averageLevel([]), null);
});

test('highestMember breaks level ties on XP', () => {
  const top = highestMember([m('a', 35, 100), m('b', 35, 900), m('c', 20, 5000)]);
  assert.equal(top.name, 'b');
  assert.equal(highestMember([]), null);
});

test('latestLevelUp picks newest and ignores null', () => {
  const r = latestLevelUp([m('a', 1, 0, { lastLevelUpAt: 5 }), m('b', 1, 0, { lastLevelUpAt: 9 }), m('c', 1, 0, { lastLevelUpAt: null })]);
  assert.equal(r.name, 'b');
  assert.equal(latestLevelUp([m('c', 1, 0, { lastLevelUpAt: null })]), null);
});

test('activity boundaries (3 and 14 days)', () => {
  const at = (days) => NOW - days * DAY;
  assert.equal(activity(at(2.99), NOW), 'active');
  assert.equal(activity(at(3), NOW), 'quiet');
  assert.equal(activity(at(13.99), NOW), 'quiet');
  assert.equal(activity(at(14), NOW), 'inactive');
  assert.equal(activity(null, NOW), 'unknown');
  assert.equal(activity(at(5), NOW, { quiet: 7, inactive: 30 }), 'active');
});

test('levelsGained over 7 and 30 day windows', () => {
  const points = [
    { t: NOW - 40 * DAY, level: 20 },
    { t: NOW - 20 * DAY, level: 25 },
    { t: NOW - 3 * DAY, level: 28 },
  ];
  assert.equal(levelsGained(points, 7, NOW, 30), 5); // baseline 25 at -20d
  assert.equal(levelsGained(points, 30, NOW, 30), 10); // baseline 20 at -40d
  assert.equal(levelsGained([], 7, NOW, 30), 0);
  // history shorter than the window falls back to the oldest known level
  assert.equal(levelsGained([{ t: NOW - DAY, level: 10 }], 30, NOW, 12), 2);
});

test('bgTotals and win rate', () => {
  const t = bgTotals({ bgs: [{ played: 10, won: 6 }, { played: 5, won: 1 }] });
  assert.deepEqual(t, { played: 15, won: 7, winRate: 7 / 15 });
  assert.equal(bgTotals(null).winRate, null);
});

test('isStale uses twice the refresh interval', () => {
  const meta = (ago) => ({ lastSuccessAt: NOW - ago, refreshMinutes: 60 });
  assert.equal(isStale(meta(119 * 60000), NOW), false);
  assert.equal(isStale(meta(121 * 60000), NOW), true);
  assert.equal(isStale({ lastSuccessAt: null, refreshMinutes: 60 }, NOW), true);
});

const sm = (name, level, stats, pvp) => ({ name, surname: '', level, classId: 8, stats, pvp });
const st = (deaths, bosses = []) => ({ deaths, quests: deaths * 10, dungeons: 1, bossKills: bosses.reduce((s, b) => s + b.count, 0), bosses });

test('perLevel guards against missing values and zero level', () => {
  assert.equal(perLevel(10, 4), 2.5);
  assert.equal(perLevel(0, 4), 0);
  assert.equal(perLevel(10, 0), null);
  assert.equal(perLevel(null, 5), null);
  assert.equal(perLevel(undefined, 5), null);
});

test('guildTotals skips members without stats or pvp', () => {
  const t = guildTotals([
    sm('a', 20, st(3), { hk: 10, bgs: [{ played: 4, won: 3 }] }),
    sm('b', 20, st(5), { hk: 5, bgs: [{ played: 6, won: 1 }] }),
    sm('c', 5, null, null),
  ]);
  assert.equal(t.deaths, 8);
  assert.equal(t.quests, 80);
  assert.equal(t.hk, 15);
  assert.deepEqual([t.bgPlayed, t.bgWon, t.bgLost, t.bgWinRate], [10, 4, 6, 0.4]);
  assert.equal(t.withStats, 2);
  const empty = guildTotals([]);
  assert.equal(empty.bgWinRate, null);
  assert.equal(empty.deaths, 0);
});

test('leaders ranks ties together and keeps name order', () => {
  const list = [sm('Cy', 20, st(4)), sm('Al', 20, st(4)), sm('Bo', 20, st(2)), sm('Di', 20, st(8)), sm('Ed', 5, null)];
  const r = leaders(list, (m) => m.stats && m.stats.deaths, 3);
  assert.deepEqual(r.map((x) => x.member.name), ['Di', 'Al', 'Cy']);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 2]);
  assert.deepEqual(r.map((x) => x.share), [1, 0.5, 0.5]);
});

test('leaders handles all-zero values and empty input', () => {
  const r = leaders([sm('a', 20, st(0)), sm('b', 20, st(0))], (m) => m.stats.deaths, 5);
  assert.deepEqual(r.map((x) => x.share), [0, 0]);
  assert.deepEqual(r.map((x) => x.rank), [1, 1]);
  assert.deepEqual(leaders([], () => 1), []);
  assert.deepEqual(leaders(null, () => 1), []);
});

test('leaders min-played filter excludes small samples and missing pvp', () => {
  const pv = (played, won) => ({ hk: 0, bgs: [{ played, won }] });
  const list = [sm('a', 20, st(1), pv(1, 1)), sm('b', 20, st(1), pv(4, 2)), sm('c', 20, st(1), null), sm('d', 20, st(1), pv(2, 2))];
  const rate = (m) => (m.pvp ? bgTotals(m.pvp).winRate : null);
  const r = leaders(list, rate, 5, { min: 2, played: (m) => bgTotals(m.pvp).played });
  assert.deepEqual(r.map((x) => x.member.name), ['d', 'b']);
});

test('bossBoard groups by instance with per-member counts', () => {
  const a = sm('Al', 20, st(1, [{ name: 'Bazzalan', instance: 'Ragefire Chasm', count: 3 }, { name: 'Rath', instance: 'Lordaeron', count: 1 }]));
  const b = sm('Bo', 20, st(1, [{ name: 'Bazzalan', instance: 'Ragefire Chasm', count: 5 }]));
  const c = sm('Cy', 5, null);
  const board = bossBoard([a, b, c]);
  assert.deepEqual(board.map((i) => [i.instance, i.total]), [['Ragefire Chasm', 8], ['Lordaeron', 1]]);
  const boss = board[0].bosses[0];
  assert.equal(boss.name, 'Bazzalan');
  assert.equal(boss.total, 8);
  assert.deepEqual(boss.members.map((x) => [x.member.name, x.count]), [['Bo', 5], ['Al', 3]]);
  assert.deepEqual(bossBoard([c]), []);
});

test('filterMembers combines search, class and activity', () => {
  const list = [
    m('Ann', 10, 0, { profile: { lastLogin: NOW - DAY } }),
    m('Bob', 10, 0, { classId: 4, className: 'Rogue', profile: { lastLogin: NOW - 20 * DAY } }),
  ];
  assert.equal(filterMembers(list, { q: 'rog' }, NOW).length, 1);
  assert.equal(filterMembers(list, { cls: '8' }, NOW)[0].name, 'Ann');
  assert.equal(filterMembers(list, { activity: 'inactive' }, NOW)[0].name, 'Bob');
});
