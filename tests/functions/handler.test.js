import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleRequest } from '../../functions/app.js';
import { makeConfig, makeFetch } from '../server/helpers.js';
import { fakeBucket } from './fake-bucket.js';

async function setup() {
  const fetchImpl = makeFetch();
  const bucket = fakeBucket();
  const clock = { t: Date.UTC(2026, 10, 15, 12, 0, 0) };
  const opts = {
    config: makeConfig(), credentials: { clientId: 'id', clientSecret: 's' }, bucket, log: () => {},
    fetchImpl, sleep: async () => {}, now: () => clock.t,
  };
  const server = http.createServer((req, res) => handleRequest(opts, req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const call = async (path, method = 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
    return { status: res.status, body: await res.text(), headers: res.headers };
  };
  return { call, bucket, fetchImpl, close: () => server.close() };
}

test('POST /api/refresh awaits the refresh, persists it, then 429s during cooldown', async () => {
  const s = await setup();
  try {
    const first = await s.call('/api/refresh', 'POST');
    assert.equal(first.status, 202);
    assert.deepEqual(JSON.parse(first.body), { started: true });
    assert.ok(s.fetchImpl.calls.length > 0);
    assert.ok(s.bucket.files.has('ftw/current.json'));
    assert.ok(s.bucket.files.has('ftw/meta.json'));

    const second = await s.call('/api/refresh', 'POST');
    assert.equal(second.status, 429);
    assert.ok(Number(second.headers.get('retry-after')) > 0);

    const state = JSON.parse((await s.call('/api/state')).body);
    assert.equal(state.guild.memberCount, 2);
  } finally {
    s.close();
  }
});

test('non-api paths are 404 in function mode', async () => {
  const s = await setup();
  try {
    assert.equal((await s.call('/index.html')).status, 404);
    assert.equal((await s.call('/')).status, 404);
    assert.equal((await s.call('/api/health')).status, 200);
  } finally {
    s.close();
  }
});
