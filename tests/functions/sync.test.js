import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sync } from '../../scripts/sync-functions.mjs';
import { tmpDir } from '../server/helpers.js';

function fakeRoot(withConfig = true) {
  const root = tmpDir();
  const put = (f, body) => {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), body);
  };
  for (const f of ['routes.js', 'store.js', 'store-memory.js', 'server.js', 'setup.js', 'import-levelups.js', 'static.js']) put(`server/${f}`, f);
  put('index.html', '<html>');
  put('css/a.css', 'a');
  put('js/a.js', 'b');
  put('data/current.json', 'secret');
  if (withConfig) put('config.json', '{"guildName":"G"}');
  return root;
}

test('sync copies shared server code, config and the UI', () => {
  const root = fakeRoot();
  sync(root);
  assert.deepEqual(fs.readdirSync(path.join(root, 'functions/server')).sort(), ['routes.js', 'store-memory.js', 'store.js']);
  assert.equal(fs.readFileSync(path.join(root, 'functions/config.json'), 'utf8'), '{"guildName":"G"}');
  assert.deepEqual(fs.readdirSync(path.join(root, 'public')).sort(), ['css', 'index.html', 'js']);
  assert.ok(fs.existsSync(path.join(root, 'public/css/a.css')));
  assert.ok(!fs.existsSync(path.join(root, 'public/data')));
});

test('sync fails clearly without config.json', () => {
  const root = fakeRoot(false);
  assert.throws(() => sync(root), /config\.json not found/);
});
