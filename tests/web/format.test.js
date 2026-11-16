import test from 'node:test';
import assert from 'node:assert/strict';
import { fullName, professionsText, rankText, relativeTime, talentsText, formatCountdown, readableTextColor } from '../../js/format.js';

test('talentsText matches the sheet style', () => {
  const t = { trees: [{ name: 'Discipline', points: 19 }, { name: 'Shadow Magic', points: 7 }] };
  assert.equal(talentsText(t), 'Discipline 19 / Shadow Magic 7');
  assert.equal(talentsText(null), '');
});

test('professionsText', () => {
  const list = [{ name: 'Tailoring', skill: 150, max: 225 }, { name: 'Enchanting', skill: 225, max: 225 }];
  assert.equal(professionsText(list), 'Tailoring 150/225, Enchanting 225/225');
  assert.equal(professionsText(undefined), '');
});

test('rankText and fullName', () => {
  assert.equal(rankText(0), 'Guild Master');
  assert.equal(rankText(3), 'Rank 3');
  assert.equal(fullName({ name: 'Jeezus', surname: 'Khryst' }), 'Jeezus Khryst');
  assert.equal(fullName({ name: 'Solo', surname: '' }), 'Solo');
});

test('relativeTime', () => {
  const now = 10_000_000_000;
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 23 * 60000, now), '23 min ago');
  assert.equal(relativeTime(now - 5 * 3600000, now), '5 h ago');
  assert.equal(relativeTime(now - 3 * 86400000, now), '3 d ago');
  assert.equal(relativeTime(null, now), 'never');
});

test('formatCountdown', () => {
  assert.equal(formatCountdown(125), '2:05');
  assert.equal(formatCountdown(-3), '0:00');
});

test('readableTextColor flips with luminance', () => {
  assert.equal(readableTextColor('#ffffff'), '#0e1117');
  assert.equal(readableTextColor('#000000'), '#ffffff');
  assert.equal(readableTextColor('nope'), '#0e1117');
});
