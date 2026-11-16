import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR, ConfigError, loadConfig, createLogger } from './config.js';
import { createStore } from './store.js';
import { createBlizzard } from './blizzard.js';
import { createRefresher } from './refresh.js';
import { createRefreshLimiter } from './ratelimit.js';
import { createHandler, handleSetupRequired } from './routes.js';

/** Wires everything together. Returns the http server and refresher without starting either. */
export function buildApp({ config, credentials, accessCode = '', log, fetchImpl, sleep, rootDir = ROOT_DIR }) {
  const store = createStore(config.dataDir, log);
  const blizzard = createBlizzard({ config, credentials, fetchImpl, sleep, log });
  const refresher = createRefresher({ config, store, blizzard, log });
  const limiter = createRefreshLimiter({
    lastManualAt: store.readMeta().lastManualRefreshAt,
    onStart: (t) => store.write('meta.json', { ...store.readMeta(), lastManualRefreshAt: t }),
  });
  const handler = createHandler({ config, store, refresher, limiter, accessCode, log, staticRoot: rootDir });
  return { server: http.createServer(handler), refresher, store };
}

function main() {
  let loaded;
  const setupServer = (problem) => {
    const server = http.createServer((req, res) => handleSetupRequired(req, res, problem));
    server.listen(8810, '0.0.0.0', () => console.log(`${problem}. Serving a setup notice on port 8810; run "npm run setup".`));
  };
  try {
    loaded = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) return setupServer(err.message);
    throw err;
  }
  const { config, credentials, accessCode } = loaded;
  if (!credentials) return setupServer('Blizzard credentials are missing from .env');

  const log = createLogger([credentials.clientSecret, accessCode]);
  const { server, refresher } = buildApp({ config, credentials, accessCode, log });
  server.listen(config.port, config.host, () => {
    log(`Listening on ${config.host}:${config.port}${config.basePath || '/'}`);
    refresher.start();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
