import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeConfig } from '../../server/config.js';
import { createStore } from '../../server/store.js';
import { createBlizzard } from '../../server/blizzard.js';
import { createRefresher } from '../../server/refresh.js';

export const fixture = (name) =>
  JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ftw-'));

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export const makeConfig = (extra = {}, dir = tmpDir()) =>
  normalizeConfig({ guildName: 'Forced to Wipe', guildSlug: 'forced-to-wipe', region: 'us', ...extra }, {}, dir);

/** Roster fixture reduced to the named characters, with optional per-name level overrides. */
export function makeRoster(names = ['Jeezus', 'Carlos'], levels = {}) {
  const full = fixture('roster');
  const members = full.members
    .filter((m) => names.includes(m.character.name))
    .map((m) => ({ ...m, character: { ...m.character, level: levels[m.character.name] ?? m.character.level } }));
  return { ...full, members };
}

const SECTION_FILES = {
  '': 'profile', specializations: 'specializations', professions: 'professions',
  'achievements/statistics': 'statistics', 'pvp-summary': 'pvp',
};

/**
 * Mock Blizzard. `hook(url, init, kind)` may return a Response to override; kind is
 * 'token' | 'roster' | 'character'. Records every URL in `calls`.
 */
export function makeFetch({ roster = makeRoster(), hook = () => undefined } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    calls.push(url);
    if (url.startsWith('https://oauth.battle.net/token')) {
      return hook(url, init, 'token') ?? json({ access_token: 'tok-secret-123', expires_in: 86400 });
    }
    if (url.includes('/data/wow/guild/')) return hook(url, init, 'roster') ?? json(roster);
    const m = /\/profile\/wow\/character\/([^/?]+)(?:\/([^?]+))?\?/.exec(url);
    if (!m) return new Response('nope', { status: 404 });
    const overridden = hook(url, init, 'character');
    if (overridden) return overridden;
    const slug = decodeURIComponent(m[1]);
    const key = slug.split('-')[0];
    try {
      return json(fixture(`${key}-${SECTION_FILES[m[2] ?? '']}`));
    } catch {
      return new Response('{}', { status: 404 });
    }
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/** Full refresh stack on a temp data dir with an advancing fake clock and no-op sleep. */
export function makeStack({ fetchImpl = makeFetch(), configExtra = {} } = {}) {
  const config = makeConfig(configExtra);
  const logs = [];
  const log = Object.assign((m) => logs.push(m), { addSecret() {} });
  const store = createStore(config.dataDir, log);
  const clock = { t: Date.UTC(2026, 10, 15, 12, 0, 0) };
  const now = () => clock.t;
  const blizzard = createBlizzard({
    config, credentials: { clientId: 'id', clientSecret: 'SUPERSECRET' }, fetchImpl, log, now, sleep: async () => {},
  });
  const refresher = createRefresher({ config, store, blizzard, log, now });
  return { config, store, refresher, blizzard, fetchImpl, clock, logs, log };
}

export const readRaw = (store, name) => {
  try { return fs.readFileSync(path.join(store.dir, name), 'utf8'); } catch { return null; }
};
