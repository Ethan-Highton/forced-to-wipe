/**
 * In-memory store with the same interface as createStore (store.js). Docs are keyed by the
 * file-store names ("current.json", "history/2026-11.json") and hold bare data, not the
 * { schemaVersion, data } wrapper. Values are copied on the way in and out, like a file roundtrip.
 */
export function createMemoryStore(initialDocs = {}, log = () => {}) {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const docs = new Map(Object.entries(initialDocs).map(([k, v]) => [k, copy(v)]));
  const dirty = new Set();

  const read = (name, fallback) => (docs.has(name) ? copy(docs.get(name)) : fallback);

  function write(name, data) {
    docs.set(name, copy(data));
    dirty.add(name);
  }

  const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

  return {
    dir: null,
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
    readHistory(charId) {
      const names = [...docs.keys()].filter((n) => /^history\/\d{4}-\d{2}\.json$/.test(n)).sort();
      const points = [];
      for (const n of names) points.push(...(read(n, {})[charId] ?? []));
      return points.sort((a, b) => a.t - b.t);
    },
    getDirty: () => Object.fromEntries([...dirty].map((n) => [n, copy(docs.get(n))])),
    clearDirty: () => dirty.clear(),
  };
}
