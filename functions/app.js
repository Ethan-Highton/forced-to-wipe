import { loadDocs, saveDocs } from './storage.js';

// Deployed: ./server is a copy made by scripts/sync-functions.mjs. In the repo (tests) fall back to ../server.
async function server(name) {
  try {
    return await import(`./server/${name}`);
  } catch (err) {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    return import(`../server/${name}`);
  }
}

const [{ createMemoryStore }, { createBlizzard }, { createRefresher }, { createRefreshLimiter }, { createHandler }, { createNotifier }] =
  await Promise.all(['store-memory.js', 'blizzard.js', 'refresh.js', 'ratelimit.js', 'routes.js', 'notify.js'].map(server));

/** Loads all docs from the bucket and wires a fresh stack on them. */
async function open({ config, credentials, bucket, log, fetchImpl, sleep, now, webhookUrl = '', notifyFetch }) {
  const store = createMemoryStore(await loadDocs(bucket, log), log);
  const blizzard = createBlizzard({ config, credentials, fetchImpl, sleep, log, now });
  const notifier = createNotifier({ url: webhookUrl, fetchImpl: notifyFetch, log, config });
  // refresh.js awaits onEvents, so the notification finishes before the function returns.
  const refresher = createRefresher({ config, store, blizzard, log, now, onEvents: notifier.enabled ? notifier.notify : null });
  const flush = async () => {
    const dirty = store.getDirty();
    await saveDocs(bucket, dirty);
    store.clearDirty();
  };
  return { store, refresher, flush };
}

/** Handles one API request. The response is ended only after dirty docs reach Storage. */
export async function handleRequest(opts, req, res) {
  const { store, refresher, flush } = await open(opts);
  const limiter = createRefreshLimiter({
    lastManualAt: store.readMeta().lastManualRefreshAt,
    onStart: (t) => store.write('meta.json', { ...store.readMeta(), lastManualRefreshAt: t }),
    ...(opts.now && { now: opts.now }),
  });
  const handler = createHandler({
    config: opts.config, store, refresher, limiter, log: opts.log, serveStatic: false, awaitRefresh: true,
    ...(opts.now && { now: opts.now }),
  });

  const end = res.end.bind(res);
  let endArgs = [];
  res.end = (...args) => { endArgs = args; return res; };
  try {
    await handler(req, res);
    await flush();
  } catch (err) {
    opts.log(`Flush failed: ${err.message}`);
  } finally {
    res.end = end;
    end(...endArgs);
  }
}

/** One scheduled refresh cycle; returns the cycle result. */
export async function refreshOnce(opts) {
  const { refresher, flush } = await open(opts);
  const result = await refresher.run();
  await flush();
  opts.log(`Scheduled refresh: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  return result;
}
