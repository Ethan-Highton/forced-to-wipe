import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from '../../server/store.js';
import { csvCell, toCsv, parseCsv, levelupsCsv } from '../../server/csv.js';
import { createRefreshLimiter } from '../../server/ratelimit.js';
import { parseEnv } from '../../server/config.js';
import { buildImportedEntries, mergeLevelups } from '../../server/import-levelups.js';
import { tmpDir } from './helpers.js';

test('store: atomic write leaves no tmp file and round-trips', () => {
  const dir = tmpDir();
  const store = createStore(dir);
  store.write('current.json', { a: 1 });
  store.write('current.json', { a: 2 });
  assert.deepEqual(store.read('current.json', null), { a: 2 });
  assert.equal(fs.existsSync(path.join(dir, 'current.json.tmp')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8')).schemaVersion, 1);
});

test('store: corrupt file is renamed to .bad and treated as empty', () => {
  const dir = tmpDir();
  const logs = [];
  const store = createStore(dir, (m) => logs.push(m));
  fs.writeFileSync(path.join(dir, 'levelups.json'), '{"schemaVersion":1,"data":[');
  assert.deepEqual(store.readLevelups(), []);
  assert.equal(fs.existsSync(path.join(dir, 'levelups.json.bad')), true);
  assert.equal(fs.existsSync(path.join(dir, 'levelups.json')), false);
  assert.equal(logs.length, 1);
});

test('csv: formula-injection prefix and quoting', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv(['A', 'B'], [['x', '=1']]), "A,B\r\nx,'=1\r\n");
});

test('csv: parse handles quotes and the export round-trips for import', () => {
  assert.deepEqual(parseCsv('a,"b,c"\r\n"d""e",f\n'), [['a', 'b,c'], ['d"e', 'f']]);
  const out = levelupsCsv([{ at: Date.UTC(2026, 0, 2), name: 'Jeezus Khryst', oldLevel: 34, newLevel: 35, source: 'detected' }]);
  assert.equal(parseCsv(out)[1][1], 'Jeezus Khryst');
});

test('ratelimit: global cooldown, then clears', () => {
  let t = 0;
  const started = [];
  const lim = createRefreshLimiter({ now: () => t, onStart: (x) => started.push(x) });
  assert.deepEqual(lim.check('1.1.1.1'), { ok: true });
  lim.markStarted();
  assert.deepEqual(started, [0]);
  t = 60_000;
  const blocked = lim.check('2.2.2.2');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 240);
  assert.equal(lim.cooldownSec(), 240);
  t = 300_001;
  assert.equal(lim.check('2.2.2.2').ok, true);
});

test('ratelimit: 3 requests per minute per IP', () => {
  let t = 0;
  const lim = createRefreshLimiter({ now: () => t, cooldownMs: 0 });
  for (let i = 0; i < 3; i++) assert.equal(lim.check('ip').ok, true);
  const fourth = lim.check('ip');
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterSec >= 1 && fourth.retryAfterSec <= 60);
  assert.equal(lim.check('other').ok, true);
  t = 61_000;
  assert.equal(lim.check('ip').ok, true);
});

test('env parser: comments, quotes, blanks', () => {
  assert.deepEqual(parseEnv('# c\nA=1\n\nB="two words"\nC = x=y\n'), { A: '1', B: 'two words', C: 'x=y' });
});

test('import: matches members, skips unknown, never duplicates', () => {
  const members = { 5: { id: 5, name: 'Jeezus', surname: 'Khryst' } };
  const rows = [['2026-01-02', 'Jeezus', '34', '35'], ['2026-01-02', 'Nobody', '1', '2'], ['bad', 'Jeezus', '1', '2']];
  const { entries, skipped } = buildImportedEntries(rows, members);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, '5-35');
  assert.equal(entries[0].source, 'imported');
  assert.equal(skipped.length, 2);
  assert.equal(mergeLevelups([{ id: '5-35' }], entries).added, 0);
});
