import test from 'node:test';
import assert from 'node:assert/strict';
import { heatClasses, columnBest, compareValues, recordHolders, bossRows, firstName } from '../../js/stats-model.js';

test('heatClasses spreads distinct values over 0..4', () => {
  assert.deepEqual(heatClasses([1, 2, 3, 4, 5]), [0, 1, 2, 3, 4]);
});

test('heatClasses ties share a class and the top is always 4', () => {
  const h = heatClasses([5, 5, 5, 1, 3]);
  assert.equal(h[0], 4);
  assert.equal(h[1], 4);
  assert.equal(h[2], 4);
  assert.equal(h[3], 0);
  assert.deepEqual(heatClasses([2, 9, 2, 9, 5]).filter((_, i) => i === 0 || i === 2), [0, 0]);
});

test('heatClasses handles missing data, n=1 and flat columns', () => {
  assert.deepEqual(heatClasses([]), []);
  assert.deepEqual(heatClasses([7]), [0]);
  assert.deepEqual(heatClasses([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(heatClasses([null, 3, undefined, 8]), [null, 0, null, 4]);
  assert.deepEqual(heatClasses([null, null]), [null, null]);
  assert.deepEqual(heatClasses([NaN, 1, 2]), [null, 0, 4]);
});

test('heatClasses is monotonic', () => {
  const v = [3, 14, 1, 59, 26, 5, 35, 8, 97, 93, 23];
  const h = heatClasses(v);
  const pairs = v.map((x, i) => [x, h[i]]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i][1] >= pairs[i - 1][1]);
  assert.ok(h.every((c) => c >= 0 && c <= 4));
});

test('columnBest', () => {
  assert.equal(columnBest([1, null, 9, 4]), 9);
  assert.equal(columnBest([null]), null);
  assert.equal(columnBest([]), null);
  assert.equal(columnBest([0, 0]), 0);
});

test('compareValues sinks missing data in both directions', () => {
  assert.ok(compareValues(null, 5, 1) > 0);
  assert.ok(compareValues(null, 5, -1) > 0);
  assert.ok(compareValues(5, undefined, -1) < 0);
  assert.equal(compareValues(null, undefined), 0);
  assert.ok(compareValues(2, 9, 1) < 0);
  assert.ok(compareValues(2, 9, -1) > 0);
  assert.ok(compareValues('Anna', 'Bob', 1, true) < 0);
});

const m = (name, deaths, extra = {}) => ({ id: name, name, surname: '', stats: deaths == null ? null : { deaths }, ...extra });
const defs = [{ key: 'deaths', label: 'Deaths', value: (x) => x.stats && x.stats.deaths }];

test('recordHolders totals, ties and missing data', () => {
  const [r] = recordHolders([m('a', 4), m('b', 9), m('c', 9), m('d', null)], defs);
  assert.equal(r.total, 22);
  assert.equal(r.value, 9);
  assert.equal(r.withData, 3);
  assert.deepEqual(r.holders.map((x) => x.name), ['b', 'c']);
});

test('recordHolders with nobody or all zero has no holders', () => {
  const [none] = recordHolders([m('a', null)], defs);
  assert.equal(none.value, null);
  assert.deepEqual(none.holders, []);
  const [zero] = recordHolders([m('a', 0), m('b', 0)], defs);
  assert.equal(zero.value, 0);
  assert.deepEqual(zero.holders, []);
  assert.equal(recordHolders([], defs)[0].total, 0);
});

test('bossRows flattens instances then bosses and orders who by count', () => {
  const a = { name: 'Ann', surname: '' };
  const b = { name: 'Bo', surname: '' };
  const rows = bossRows([{ instance: 'RFC', total: 5, bosses: [{ name: 'Bazzalan', total: 5, members: [{ member: a, count: 1 }, { member: b, count: 4 }] }] }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { type: 'instance', instance: 'RFC', total: 5, bossCount: 1 });
  assert.equal(rows[1].type, 'boss');
  assert.deepEqual(rows[1].who.map((w) => w.member.name), ['Bo', 'Ann']);
  assert.deepEqual(bossRows([]), []);
  assert.deepEqual(bossRows(null), []);
});

test('firstName', () => {
  assert.equal(firstName({ name: 'Jeezus', surname: 'Khryst' }), 'Jeezus');
  assert.equal(firstName(null), '');
});
