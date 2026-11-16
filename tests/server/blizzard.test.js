import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlizzard } from '../../server/blizzard.js';
import { makeConfig, makeFetch } from './helpers.js';

const creds = { clientId: 'id', clientSecret: 'SUPERSECRET' };
const make = (config, fetchImpl) => createBlizzard({ config, credentials: creds, fetchImpl, sleep: async () => {} });

test('accented slugs are percent-encoded verbatim', async () => {
  const f = makeFetch();
  await make(makeConfig(), f).getCharacter('carlos-fréchette', 'profile');
  assert.ok(f.calls.some((u) => u.includes('/profile/wow/character/carlos-fr%C3%A9chette?namespace=profile-forever-us')));
  const g = makeFetch();
  await make(makeConfig({ guildSlug: 'été' }), g).getRoster();
  assert.ok(g.calls.some((u) => u.startsWith('https://us.api.blizzard.com/data/wow/guild/%C3%A9t%C3%A9/roster?namespace=profile-forever-us&locale=en_US')));
});

test('token request uses client_credentials with basic auth and is cached', async () => {
  let tokenInit;
  const f = makeFetch({ hook: (_u, init, kind) => { if (kind === 'token') tokenInit = init; return undefined; } });
  const b = make(makeConfig(), f);
  await b.getCharacter('jeezus-khryst', 'profile');
  await b.getCharacter('jeezus-khryst', 'pvp');
  assert.equal(f.calls.filter((u) => u.includes('oauth.battle.net')).length, 1);
  assert.equal(tokenInit.body, 'grant_type=client_credentials');
  assert.equal(tokenInit.headers.Authorization, `Basic ${Buffer.from('id:SUPERSECRET').toString('base64')}`);
});

test('region picks the API host', async () => {
  const f = makeFetch();
  await make(makeConfig({ region: 'eu' }), f).getRoster();
  assert.ok(f.calls.some((u) => u.startsWith('https://eu.api.blizzard.com/')));
});
