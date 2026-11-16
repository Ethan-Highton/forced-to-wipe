import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR, normalizeConfig, readEnvFile, createLogger } from './config.js';
import { createBlizzard } from './blizzard.js';
import { parseRoster } from './parse.js';

const slugify = (name) => name.trim().toLowerCase().replace(/\s+/g, '-');

/** Writes config.json (merging over an existing one) and .env (preserving other keys). */
export function writeConfigFiles(rootDir, { guildName, guildSlug, region, clientId, clientSecret }) {
  const configFile = path.join(rootDir, 'config.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { /* fresh install */ }
  const merged = { refreshMinutes: 60, port: 8810, basePath: '', ...existing, guildName, guildSlug, region };
  fs.writeFileSync(configFile, JSON.stringify(merged, null, 2) + '\n');

  const envFile = path.join(rootDir, '.env');
  const env = { ...readEnvFile(envFile), BNET_CLIENT_ID: clientId, BNET_CLIENT_SECRET: clientSecret };
  fs.writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  return merged;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '') => (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def;

  console.log('Forced to Wipe setup. Create a client at https://develop.battle.net first.\n');
  const guildName = await ask('Guild name');
  const region = (await ask('Region (us/eu/kr/tw)', 'us')).toLowerCase();
  const guildSlug = await ask('Guild slug (as in the Blizzard API)', slugify(guildName));
  const clientId = await ask('Battle.net client ID');
  const clientSecret = await ask('Battle.net client secret');
  rl.close();

  if (!guildName || !clientId || !clientSecret) {
    console.error('Guild name, client ID and client secret are all required.');
    process.exit(1);
  }

  const raw = writeConfigFiles(ROOT_DIR, { guildName, guildSlug, region, clientId, clientSecret });
  console.log('\nWrote config.json and .env. Checking the credentials...');

  const log = createLogger([clientSecret]);
  try {
    const config = normalizeConfig(raw, {}, ROOT_DIR);
    const blizzard = createBlizzard({ config, credentials: { clientId, clientSecret }, log });
    await blizzard.getToken();
    console.log('Token OK.');
    const { members } = parseRoster(await blizzard.getRoster());
    console.log(`Roster OK: ${members.length} members. Run "npm start".`);
  } catch (err) {
    console.error(`Validation failed: ${err.code ?? err.message}. Check the guild slug, region and credentials, then rerun.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
