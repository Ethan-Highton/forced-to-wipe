import test from 'node:test';
import assert from 'node:assert/strict';
import { needShare } from '../../js/derive.js';

test('needShare is need over all rolls', () => {
  assert.equal(needShare({ need: 1, greed: 3 }), 0.25);
  assert.equal(needShare({ need: 71, greed: 234 }), 71 / 305);
});

test('needShare is null with no rolls or no stats', () => {
  assert.equal(needShare({ need: 0, greed: 0 }), null);
  assert.equal(needShare({}), null);
  assert.equal(needShare(null), null);
});
