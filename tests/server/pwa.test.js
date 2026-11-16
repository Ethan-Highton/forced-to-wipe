import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStaticPath } from '../../server/static.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('manifest is installable: name, start_url, standalone, 192 and 512 icons that exist', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url.startsWith('.'));
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), `${i.src} missing`);
});

test('index.html links the manifest, icons and the service worker registration', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /src="js\/pwa\.js"/);
  assert.ok(fs.existsSync(path.join(root, 'sw.js')));
});

test('the static allowlist serves the PWA files but still refuses everything else', () => {
  assert.ok(resolveStaticPath(root, '/manifest.webmanifest'));
  assert.ok(resolveStaticPath(root, '/sw.js'));
  assert.equal(resolveStaticPath(root, '/package.json'), null);
  assert.equal(resolveStaticPath(root, '/server/config.js'), null);
  assert.equal(resolveStaticPath(root, '/.env'), null);
});
