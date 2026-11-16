import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../../server/store-memory.js';
import { createStore } from '../../server/store.js';
import { createBlizzard } from '../../server/blizzard.js';
import { createRefresher } from '../../server/refresh.js';
import { makeConfig, makeFetch, makeRoster } from '../server/helpers.js';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);

function stackWith(makeStore, fetchImpl = makeFetch()) {
  const config = makeConfig();
  const log = Object.assign(() => {}, { addSecret() {} });
  const store = makeStore(config);
  const clock = { t: T0 };
  const now = () => clock.t;
  const blizzard = createBlizzard({ config, credentials: { clientId: 'id', clientSecret: 's' }, fetchImpl, log, now, sleep: async () => {} });
  return { store, refresher: createRefresher({ config, store, blizzard, log, now }), clock };
}

const view = (s) => ({
  current: s.store.readCurrent(), members: s.store.readMembers(), meta: s.store.readMeta(),
  levelups: s.store.readLevelups(), history: s.store.readHistory('5677618'),
});

test('memory store matches the file store for a seed cycle and a level-up cycle', async () => {
  const file = stackWith((c) => createStore(c.dataDir));
  const mem = stackWith(() => createMemoryStore());
  await file.refresher.run();
  await mem.refresher.run();
  assert.deepEqual(view(mem), view(file));

  const roster = makeRoster(['Jeezus', 'Carlos'], { Jeezus: 36 });
  const carry = (s) => ({
    'current.json': s.store.readCurrent(), 'members.json': s.store.readMembers(), 'meta.json': s.store.readMeta(),
    'history/2026-11.json': s.store.read('history/2026-11.json', {}),
  });
  const file2 = stackWith((c) => {
    const st = createStore(c.dataDir);
    for (const [k, v] of Object.entries(carry(file))) st.write(k, v);
    return st;
  }, makeFetch({ roster }));
  const mem2 = stackWith(() => createMemoryStore(carry(mem)), makeFetch({ roster }));
  await file2.refresher.run();
  await mem2.refresher.run();
  assert.deepEqual(view(mem2), view(file2));
  assert.equal(view(mem2).levelups[0].id, '5677618-36');
});

test('tracks dirty docs and serves history from memory', () => {
  const store = createMemoryStore({ 'history/2026-10.json': { 1: [{ t: 2 }] }, 'history/2026-11.json': { 1: [{ t: 1 }] } });
  assert.deepEqual(store.getDirty(), {});
  assert.deepEqual(store.readHistory('1'), [{ t: 1 }, { t: 2 }]);
  store.write('meta.json', { seeded: true });
  assert.deepEqual(store.getDirty(), { 'meta.json': { seeded: true } });
  store.clearDirty();
  assert.deepEqual(store.getDirty(), {});
  assert.equal(store.historyName(T0), 'history/2026-11.json');
  assert.equal(store.readMeta().seeded, true);
});
