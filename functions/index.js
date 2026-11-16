import fs from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString, defineSecret } from 'firebase-functions/params';
import { handleRequest, refreshOnce } from './app.js';

initializeApp();

const clientId = defineString('BNET_CLIENT_ID');
const clientSecret = defineSecret('BNET_CLIENT_SECRET');

// Resolved lazily so deploy-time analysis does not need config.json or the synced server/ copy.
async function options() {
  const { normalizeConfig, createLogger } = await import(new URL('./server/config.js', import.meta.url).href);
  const raw = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  const credentials = { clientId: clientId.value(), clientSecret: clientSecret.value() };
  return {
    config: normalizeConfig(raw, process.env),
    credentials,
    bucket: getStorage().bucket(),
    log: createLogger([credentials.clientSecret]),
  };
}

export const api = onRequest({
  region: 'us-central1', maxInstances: 2, timeoutSeconds: 120, memory: '256MiB', secrets: [clientSecret],
}, async (req, res) => handleRequest(await options(), req, res));

export const refreshHourly = onSchedule({
  region: 'us-central1', schedule: 'every 15 minutes', timeoutSeconds: 300, secrets: [clientSecret],
}, async () => { await refreshOnce(await options()); });

