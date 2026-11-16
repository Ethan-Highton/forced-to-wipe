import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDocs, saveDocs } from '../../functions/storage.js';
import { fakeBucket } from './fake-bucket.js';

test('save then load roundtrips docs in the file store format', async () => {
  const bucket = fakeBucket();
  await saveDocs(bucket, { 'current.json': { a: 1 }, 'history/2026-11.json': { 5: [{ t: 1 }] } });
  assert.deepEqual(JSON.parse(bucket.files.get('ftw/current.json')), { schemaVersion: 1, data: { a: 1 } });
  assert.deepEqual(await loadDocs(bucket), { 'current.json': { a: 1 }, 'history/2026-11.json': { 5: [{ t: 1 }] } });
});

test('missing files are absent and corrupt or unwrapped files are treated as empty', async () => {
  const logs = [];
  const bucket = fakeBucket({
    'ftw/members.json': '{not json',
    'ftw/meta.json': JSON.stringify({ nope: true }),
    'ftw/levelups.json': JSON.stringify({ schemaVersion: 1, data: [] }),
    'other/x.json': JSON.stringify({ data: 1 }),
  });
  const docs = await loadDocs(bucket, (m) => logs.push(m));
  assert.deepEqual(docs, { 'levelups.json': [] });
  assert.equal(logs.length, 2);
  assert.deepEqual(await loadDocs(fakeBucket()), {});
});
