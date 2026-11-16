/**
 * Manual refresh limiter: a global cooldown plus a per-IP request cap per window.
 * check() never mutates cooldown state; call markStarted() once a refresh really starts.
 */
export function createRefreshLimiter({
  cooldownMs = 5 * 60_000, perIpMax = 3, windowMs = 60_000, now = Date.now,
  lastManualAt = null, onStart = () => {},
} = {}) {
  let lastStart = lastManualAt;
  const hits = new Map(); // ip -> timestamps within window

  return {
    cooldownSec() {
      if (lastStart == null) return 0;
      return Math.max(0, Math.ceil((lastStart + cooldownMs - now()) / 1000));
    },
    /** @returns {{ok:true}|{ok:false, retryAfterSec:number}} */
    check(ip) {
      const t = now();
      const recent = (hits.get(ip) ?? []).filter((h) => t - h < windowMs);
      recent.push(t);
      hits.set(ip, recent);
      if (hits.size > 1000) for (const [k, v] of hits) if (t - v.at(-1) >= windowMs) hits.delete(k);

      if (recent.length > perIpMax) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }
      const wait = this.cooldownSec();
      return wait > 0 ? { ok: false, retryAfterSec: wait } : { ok: true };
    },
    markStarted() {
      lastStart = now();
      onStart(lastStart);
    },
  };
}
