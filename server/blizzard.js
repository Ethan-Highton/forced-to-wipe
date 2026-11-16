const TOKEN_URL = 'https://oauth.battle.net/token';
const TIMEOUT_MS = 10_000;
const MAX_5XX_RETRIES = 2;
const MAX_429_IN_A_ROW = 3;
const MAX_RETRY_AFTER_MS = 60_000;

export class BlizzardError extends Error {
  /** @param {string} code HTTP status as string, or timeout / network / bad_json / rate_limit_abort */
  constructor(code, { abort = false } = {}) {
    super(`Blizzard request failed: ${code}`);
    this.code = code;
    this.abort = abort; // true => abort the whole refresh cycle
  }
}

const SUBPATHS = {
  profile: '',
  specializations: '/specializations',
  professions: '/professions',
  statistics: '/achievements/statistics',
  pvp: '/pvp-summary',
};
export const SECTIONS = Object.keys(SUBPATHS);

/**
 * Minimal Blizzard API client: cached client-credentials token, timeout, retry on 5xx,
 * Retry-After handling on 429, one token refetch on 401. Secrets are never logged.
 */
export function createBlizzard({
  config, credentials, fetchImpl = fetch, log = () => {}, now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const host = `https://${config.region}.api.blizzard.com`;
  const query = `namespace=${encodeURIComponent(config.namespace)}&locale=${encodeURIComponent(config.locale)}`;
  let cached = null; // { token, expiresAt }
  let pendingToken = null;
  let rateLimited = 0;

  async function fetchToken() {
    const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
    let res;
    try {
      res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new BlizzardError(err.name === 'TimeoutError' ? 'timeout' : 'network');
    }
    if (!res.ok) throw new BlizzardError(`token_${res.status}`);
    const body = await res.json().catch(() => null);
    if (!body?.access_token) throw new BlizzardError('token_bad_json');
    log.addSecret?.(body.access_token);
    cached = { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3600) * 1000 };
    return cached.token;
  }

  function getToken() {
    if (cached && now() < cached.expiresAt - 60_000) return Promise.resolve(cached.token);
    pendingToken ??= fetchToken().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  /** GET a path under the API host. Resolves { status: 200|404, json }; throws BlizzardError otherwise. */
  async function request(pathAndQuery) {
    let retries5xx = 0;
    let refetchedToken = false;
    for (;;) {
      const token = await getToken();
      let res;
      try {
        res = await fetchImpl(`${host}${pathAndQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (retries5xx++ < MAX_5XX_RETRIES) { await sleep(500 * retries5xx); continue; }
        throw new BlizzardError(err.name === 'TimeoutError' ? 'timeout' : 'network');
      }

      if (res.status === 401 && !refetchedToken) {
        refetchedToken = true;
        cached = null;
        continue;
      }
      if (res.status === 429) {
        // Counter stays tripped after aborting so other in-flight requests give up too;
        // beginCycle() resets it.
        if (++rateLimited >= MAX_429_IN_A_ROW) {
          throw new BlizzardError('rate_limit_abort', { abort: true });
        }
        const retryAfter = Math.min(Number(res.headers.get('retry-after')) * 1000 || 1000, MAX_RETRY_AFTER_MS);
        log(`Blizzard 429, backing off ${retryAfter} ms`);
        await sleep(retryAfter + Math.random() * 500);
        continue;
      }
      rateLimited = 0;
      if (res.status >= 500) {
        if (retries5xx++ < MAX_5XX_RETRIES) { await sleep(500 * retries5xx); continue; }
        throw new BlizzardError(String(res.status));
      }
      if (res.status === 404) return { status: 404, json: null };
      if (!res.ok) throw new BlizzardError(String(res.status));
      try {
        return { status: 200, json: await res.json() };
      } catch {
        throw new BlizzardError('bad_json');
      }
    }
  }

  return {
    /** Verifies credentials; returns nothing, throws on failure. */
    getToken,
    beginCycle() { rateLimited = 0; },
    async getRoster() {
      const { json } = await request(`/data/wow/guild/${encodeURIComponent(config.guildSlug)}/roster?${query}`);
      if (!json) throw new BlizzardError('404');
      return json;
    },
    /** section is one of SECTIONS. Slug comes from the roster and is encoded verbatim. */
    getCharacter(slug, section) {
      return request(`/profile/wow/character/${encodeURIComponent(slug)}${SUBPATHS[section]}?${query}`);
    },
  };
}
