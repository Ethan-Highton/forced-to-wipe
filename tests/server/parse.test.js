import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoster, parseProfile, parseSpecializations, parseProfessions, parseStatistics, parsePvp,
} from '../../server/parse.js';
import { className, raceName } from '../../server/static-data.js';
import { fixture } from './helpers.js';

test('roster: carlos is level 33 with accented slug kept verbatim', () => {
  const { members, guildName } = parseRoster(fixture('roster'));
  assert.equal(guildName, 'Forced to Wipe');
  const carlos = members.find((m) => m.name === 'Carlos');
  assert.equal(carlos.level, 33);
  assert.equal(carlos.slug, 'carlos-fréchette');
  assert.equal(carlos.surname, 'Fréchette');
  const jeezus = members.find((m) => m.name === 'Jeezus');
  assert.deepEqual([jeezus.id, jeezus.rank, jeezus.classId, jeezus.raceId, jeezus.level], [5677618, 1, 5, 8, 35]);
});

test('jeezus profile: xp, ilvl, last login', () => {
  const p = parseProfile(fixture('jeezus-profile'));
  assert.equal(p.xp, 31466);
  assert.equal(p.ilvl, 31);
  assert.equal(p.lastLogin, 1794788323000);
  assert.equal(p.raceName, 'Troll');
  assert.equal(p.className, 'Priest');
});

test('jeezus talents: Discipline first, other trees present', () => {
  const { trees } = parseSpecializations(fixture('jeezus-specializations'));
  assert.deepEqual(trees[0], { name: 'Discipline', points: 19 });
  assert.deepEqual(trees[1], { name: 'Shadow Magic', points: 7 });
});

test('jeezus professions: uses the largest tier', () => {
  const p = parseProfessions(fixture('jeezus-professions'));
  assert.deepEqual(p.primary.map((x) => [x.name, x.skill, x.max]), [['Tailoring', 150, 225], ['Enchanting', 225, 225]]);
  assert.ok(p.secondary.some((x) => x.name === 'Fishing' && x.skill === 163 && x.max === 225));
});

test('jeezus statistics', () => {
  const s = parseStatistics(fixture('jeezus-statistics'));
  assert.equal(s.deaths, 103);
  assert.equal(s.quests, 259);
  assert.equal(s.dungeons, 23);
  assert.equal(s.bossKills, 16);
  assert.deepEqual(s.bosses.find((b) => b.name === 'Bazzalan'), { name: 'Bazzalan', instance: 'Ragefire Chasm', count: 1 });
  assert.ok(s.bosses.some((b) => b.name === "Rath'mael" && b.instance === 'Ruins of Lordaeron'));
});

test('jeezus pvp', () => {
  const p = parsePvp(fixture('jeezus-pvp'));
  assert.equal(p.hk, 196);
  assert.deepEqual(p.bgs, [
    { name: 'Warsong Gulch', played: 1, won: 0 },
    { name: 'Arathi Basin', played: 3, won: 3 },
  ]);
});

test('carlos fixtures parse without throwing', () => {
  assert.equal(parseProfile(fixture('carlos-profile')).ilvl >= 0, true);
  parseSpecializations(fixture('carlos-specializations'));
  parseProfessions(fixture('carlos-professions'));
  parseStatistics(fixture('carlos-statistics'));
  parsePvp(fixture('carlos-pvp'));
});

test('bad shapes throw so refresh can mark the section stale', () => {
  assert.throws(() => parseStatistics({}));
  assert.throws(() => parseSpecializations({}));
  assert.throws(() => parseRoster({}));
});

test('static maps', () => {
  assert.equal(className(5), 'Priest');
  assert.equal(raceName(25), 'Pandaren');
  assert.equal(raceName(999), 'Unknown');
});
