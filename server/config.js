import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class ConfigError extends Error {}

/** Tiny .env parser: KEY=VALUE lines, # comments, optional matching quotes. */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function readEnvFile(file) {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function normalizeBasePath(value) {
  const trimmed = String(value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Validates config.json contents and fills in defaults. */
export function normalizeConfig(raw, env = {}, rootDir = ROOT_DIR) {
  if (!raw || typeof raw !== 'object') throw new ConfigError('config.json must contain a JSON object');
  const region = String(raw.region ?? env.BNET_REGION ?? 'us').toLowerCase();
  if (!/^[a-z]{2}$/.test(region)) throw new ConfigError(`Invalid region "${region}"`);
  if (!raw.guildName) throw new ConfigError('config.json is missing guildName');
  if (!raw.guildSlug) throw new ConfigError('config.json is missing guildSlug');

  const refreshMinutes = Math.max(15, Number(raw.refreshMinutes) || 60);
  const port = Number(raw.port) || 8810;
  const branding = raw.branding ?? {};
  return {
    guildName: String(raw.guildName),
    guildSlug: String(raw.guildSlug),
    region,
    namespace: raw.namespace || `profile-forever-${region}`,
    locale: raw.locale || 'en_US',
    refreshMinutes,
    port,
    host: raw.host || '0.0.0.0',
    basePath: normalizeBasePath(raw.basePath),
    branding: {
      title: branding.title || String(raw.guildName),
      accent: branding.accent || '#b8860b',
      logo: branding.logo || '',
    },
    activityDays: {
      quiet: Number(raw.activityDays?.quiet) || 3,
      inactive: Number(raw.activityDays?.inactive) || 14,
    },
    xpTable: raw.xpTable !== false,
    dataDir: path.resolve(rootDir, raw.dataDir || 'data'),
  };
}

/**
 * Loads config.json and .env from rootDir. Throws ConfigError when config.json is
 * missing or invalid. `credentials` is null when the Blizzard client id/secret are absent.
 */
export function loadConfig({ rootDir = ROOT_DIR, processEnv = process.env } = {}) {
  const file = path.join(rootDir, 'config.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new ConfigError('config.json not found');
    throw new ConfigError(`config.json is not valid JSON: ${err.message}`);
  }
  const env = { ...readEnvFile(path.join(rootDir, '.env')), ...pick(processEnv, ['BNET_CLIENT_ID', 'BNET_CLIENT_SECRET', 'BNET_REGION', 'ACCESS_CODE']) };
  const config = normalizeConfig(raw, env, rootDir);
  const credentials = env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET
    ? { clientId: env.BNET_CLIENT_ID, clientSecret: env.BNET_CLIENT_SECRET }
    : null;
  return { config, credentials, accessCode: env.ACCESS_CODE || '' };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k]) out[k] = obj[k];
  return out;
}

/** Logger that scrubs registered secrets (client secret, access tokens) from every line. */
export function createLogger(secrets = [], sink = (line) => console.log(line)) {
  const known = new Set(secrets.filter(Boolean));
  const scrub = (text) => {
    let out = String(text);
    for (const s of known) out = out.split(s).join('[redacted]');
    return out;
  };
  const log = (message) => sink(`${new Date().toISOString()} ${scrub(message)}`);
  log.addSecret = (s) => { if (s) known.add(s); };
  return log;
}
