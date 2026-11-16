import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityStatus, classSegments, compareMembers, meterRatio, meterStep, nextSort, sortLedger, topIlvl,
} from '../../js/roster-model.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const mk = (id, over = {}) => ({ id, name: `N${id}`, surname: 'S', rank: 1, classId: 5, className: 'Priest', level: 10, ...over });

test('classSegments counts, orders and offsets', () => {
  const segs = classSegments([
    mk(1, { classId: 5, className: 'Priest' }), mk(2, { classId: 8, className: 'Mage' }),
    mk(3, { classId: 8, className: 'Mage' }), mk(4, { classId: 1, className: 'Warrior' }),
  ]);
  assert.deepEqual(segs.map((s) => [s.className, s.count]), [['Mage', 2], ['Priest', 1], ['Warrior', 1]]);
  assert.equal(segs[0].start, 0);
  assert.equal(segs[0].pct, 50);
  assert.equal(segs[1].start, 50);
  assert.equal(Math.round(segs.reduce((s, x) => s + x.pct, 0)), 100);
  assert.deepEqual(classSegments([]), []);
});

test('activityStatus follows the activity thresholds', () => {
  assert.equal(activityStatus(NOW - DAY, NOW), 'ok');
  assert.equal(activityStatus(NOW - 5 * DAY, NOW), 'warn');
  assert.equal(activityStatus(NOW - 20 * DAY, NOW), 'danger');
  assert.equal(activityStatus(null, NOW), 'none');
  assert.equal(activityStatus(NOW - 5 * DAY, NOW, { quiet: 7, inactive: 30 }), 'ok');
});

test('meterRatio and meterStep', () => {
  assert.equal(meterRatio(30, 60), 0.5);
  assert.equal(meterRatio(90, 60), 1);
  assert.equal(meterRatio(null, 60), 0);
  assert.equal(meterRatio(10, 0), 0);
  assert.equal(meterStep(0.5), 50);
  assert.equal(meterStep(0.52), 50);
  assert.equal(meterStep(0.53), 55);
  assert.equal(meterStep(2), 100);
  assert.equal(meterStep(NaN), 0);
});

test('topIlvl ignores missing profiles', () => {
  assert.equal(topIlvl([mk(1), mk(2, { profile: { ilvl: 31 } }), mk(3, { profile: { ilvl: 20 } })]), 31);
  assert.equal(topIlvl([]), 0);
});

test('sortLedger sorts numerically and sinks missing data both ways', () => {
  const a = mk(1, { profile: { ilvl: 10 } });
  const b = mk(2, { profile: { ilvl: 30 } });
  const c = mk(3);
  assert.deepEqual(sortLedger([a, c, b], { key: 'ilvl', dir: 'desc' }).map((m) => m.id), [2, 1, 3]);
  assert.deepEqual(sortLedger([a, c, b], { key: 'ilvl', dir: 'asc' }).map((m) => m.id), [1, 2, 3]);
});

test('level sort ties fall back to xp then name', () => {
  const a = mk(1, { level: 20, profile: { xp: 5 } });
  const b = mk(2, { level: 20, profile: { xp: 50 } });
  assert.deepEqual(sortLedger([a, b], { key: 'level', dir: 'desc' }).map((m) => m.id), [2, 1]);
});

test('text columns sort alphabetically', () => {
  const a = mk(1, { name: 'Zed' });
  const b = mk(2, { name: 'Amy' });
  assert.deepEqual([a, b].sort(compareMembers('member', 'asc')).map((m) => m.id), [2, 1]);
  const t1 = mk(1, { talents: { trees: [{ name: 'Shadow', points: 5 }] } });
  const t2 = mk(2, { talents: { trees: [{ name: 'Holy', points: 5 }] } });
  assert.deepEqual(sortLedger([t1, t2], { key: 'talents', dir: 'asc' }).map((m) => m.id), [2, 1]);
});

test('professions sort by total primary skill', () => {
  const p = (skill) => ({ professions: { primary: [{ name: 'X', skill, max: 300 }], secondary: [] } });
  const a = mk(1, p(100));
  const b = mk(2, p(250));
  const c = mk(3, { professions: { primary: [], secondary: [] } });
  assert.deepEqual(sortLedger([a, c, b], { key: 'professions', dir: 'desc' }).map((m) => m.id), [2, 1, 3]);
});

test('nextSort toggles the active column and resets on a new one', () => {
  assert.deepEqual(nextSort({ key: 'level', dir: 'desc' }, 'level'), { key: 'level', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'level', dir: 'asc' }, 'level'), { key: 'level', dir: 'desc' });
  assert.deepEqual(nextSort({ key: 'level', dir: 'desc' }, 'member'), { key: 'member', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'level', dir: 'desc' }, 'bogus'), { key: 'level', dir: 'desc' });
});
