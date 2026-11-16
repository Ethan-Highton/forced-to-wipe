import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * JSON file store. Every file is `{ schemaVersion, data }`, written atomically
 * (tmp file + rename). A corrupt file is renamed to `<name>.bad` and treated as empty.
 */
export function createStore(dir, log = () => {}) {
  fs.mkdirSync(path.join(dir, 'history'), { recursive: true });

  const file = (name) => path.join(dir, name);

  function read(name, fallback) {
    const target = file(name);
    let text;
    try {
      text = fs.readFileSync(target, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new Error('missing data wrapper');
      return parsed.data;
    } catch (err) {
      log(`Corrupt ${name} (${err.message}); moved to ${name}.bad and starting empty`);
      fs.renameSync(target, `${target}.bad`);
      return fallback;
    }
  }

  function write(name, data) {
    const target = file(name);
    const tmp = `${target}.tmp`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
    fs.renameSync(tmp, target);
  }

  const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

  return {
    dir,
    read,
    write,
    readMeta: () => ({
      lastAttemptAt: null, lastSuccessAt: null, lastManualRefreshAt: null,
      consecutiveFailures: 0, seeded: false, ...read('meta.json', {}),
    }),
    readCurrent: () => read('current.json', null),
    readMembers: () => read('members.json', {}),
    readLevelups: () => read('levelups.json', []),
    historyName: (t) => `history/${monthKey(t)}.json`,
    /** All history points for one character across months, oldest first. */
    readHistory(charId) {
      let names = [];
      try {
        names = fs.readdirSync(path.join(dir, 'history')).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).sort();
      } catch { /* no history yet */ }
      const points = [];
      for (const n of names) points.push(...(read(`history/${n}`, {})[charId] ?? []));
      return points.sort((a, b) => a.t - b.t);
    },
  };
}
