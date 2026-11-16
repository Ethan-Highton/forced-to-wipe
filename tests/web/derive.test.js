import test from 'node:test';
import assert from 'node:assert/strict';
import { activity, averageLevel, highestMember, latestLevelUp, levelsGained, bgTotals, isStale, filterMembers } from '../../js/derive.js';

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

test('filterMembers combines search, class and activity', () => {
  const list = [
    m('Ann', 10, 0, { profile: { lastLogin: NOW - DAY } }),
    m('Bob', 10, 0, { classId: 4, className: 'Rogue', profile: { lastLogin: NOW - 20 * DAY } }),
  ];
  assert.equal(filterMembers(list, { q: 'rog' }, NOW).length, 1);
  assert.equal(filterMembers(list, { cls: '8' }, NOW)[0].name, 'Ann');
  assert.equal(filterMembers(list, { activity: 'inactive' }, NOW)[0].name, 'Bob');
});
