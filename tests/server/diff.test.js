import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRoster } from '../../server/diff.js';

const r = (id, level, extra = {}) => ({ id, slug: `n${id}-s`, name: `N${id}`, surname: 'S', rank: 1, level, ...extra });
const rec = (id) => ({ id, slug: `n${id}-s`, name: `N${id}`, surname: 'S', firstSeen: 1, leftAt: null, previousNames: [] });
const base = (over = {}) => ({
  prevMembers: { 1: rec(1), 2: rec(2) },
  prevCurrent: [{ id: 1, level: 10 }, { id: 2, level: 20 }],
  roster: [r(1, 10), r(2, 20)],
  now: 1000,
  seeded: true,
  ...over,
});

test('level-up creates one entry with id charId-newLevel', () => {
  const d = diffRoster(base({ roster: [r(1, 11), r(2, 20)] }));
  assert.equal(d.levelups.length, 1);
  assert.deepEqual(d.levelups[0], {
    id: '1-11', charId: 1, name: 'N1 S', at: 1000, oldLevel: 10, newLevel: 11, approx: true, source: 'detected',
  });
});

test('multi-level jump is a single entry', () => {
  const d = diffRoster(base({ roster: [r(1, 14), r(2, 20)] }));
  assert.equal(d.levelups.length, 1);
  assert.equal(d.levelups[0].id, '1-14');
  assert.equal(d.levelups[0].oldLevel, 10);
});

test('join adds a record with no level-up', () => {
  const d = diffRoster(base({ roster: [r(1, 10), r(2, 20), r(3, 15)] }));
  assert.deepEqual(d.joined, [3]);
  assert.equal(d.members[3].firstSeen, 1000);
  assert.equal(d.levelups.length, 0);
});

test('leave sets leftAt; rejoin clears it', () => {
  const left = diffRoster(base({ roster: [r(1, 10)] }));
  assert.deepEqual(left.left, [2]);
  assert.equal(left.members[2].leftAt, 1000);
  const back = diffRoster(base({
    prevMembers: left.members, prevCurrent: [{ id: 1, level: 10 }], roster: [r(1, 10), r(2, 20)], now: 2000,
  }));
  assert.equal(back.members[2].leftAt, null);
  assert.equal(back.levelups.length, 0);
});

test('rename keeps the id and records the old name', () => {
  const d = diffRoster(base({ roster: [r(1, 10, { slug: 'new-s', name: 'New' }), r(2, 20)] }));
  assert.deepEqual(d.renamed, [1]);
  assert.equal(d.members[1].name, 'New');
  assert.equal(d.members[1].slug, 'new-s');
  assert.deepEqual(d.members[1].previousNames, [{ name: 'N1', surname: 'S', until: 1000 }]);
});

test('first run (seeded=false) writes baseline only', () => {
  const d = diffRoster({ prevMembers: {}, prevCurrent: null, roster: [r(1, 10), r(2, 20)], now: 5, seeded: false });
  assert.equal(d.ok, true);
  assert.equal(d.levelups.length, 0);
  assert.equal(Object.keys(d.members).length, 2);

  const unseededLevelUp = diffRoster(base({ seeded: false, roster: [r(1, 12), r(2, 20)] }));
  assert.equal(unseededLevelUp.levelups.length, 0);
});

test('any level decrease rejects the cycle', () => {
  const d = diffRoster(base({ roster: [r(1, 9), r(2, 25)] }));
  assert.equal(d.ok, false);
  assert.match(d.reason, /level decreased/);
});
