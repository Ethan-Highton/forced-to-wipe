const WEBHOOK_PREFIXES = ['https://discord.com/api/webhooks/', 'https://discordapp.com/api/webhooks/'];
const MAX_EMBEDS = 10;
const MAX_RETRY_WAIT_MS = 30_000;
const FALLBACK_COLOUR = 0x7a8499;

// Same palette as css/classes.css, as integers.
const CLASS_COLOURS = {
  1: 0xc69b6d, 2: 0xf48cba, 3: 0xaad372, 4: 0xfff468, 5: 0xffffff, 6: 0xc41e3a, 7: 0x0070dd,
  8: 0x3fc7eb, 9: 0x8788ee, 10: 0x00ff98, 11: 0xff7c0a, 12: 0xa330c9, 13: 0x33937f,
};

export const classColour = (classId) => CLASS_COLOURS[classId] ?? FALLBACK_COLOUR;

export const isWebhookUrl = (url) => WEBHOOK_PREFIXES.some((p) => url.startsWith(p) && url.length > p.length);

const cls = (m) => m.className || 'Unknown class';

function buildEmbeds(events, settings) {
  const on = new Set(settings.events);
  const embeds = [];
  if (on.has('levelups')) {
    for (const e of events.levelups ?? []) {
      embeds.push({
        title: `${e.name} reached level ${e.newLevel}`,
        description: `${cls(e)} · was ${e.oldLevel}`,
        color: classColour(e.classId),
      });
    }
  }
  if (on.has('joins')) {
    for (const m of events.joined ?? []) {
      embeds.push({ title: `${m.name} joined the guild`, description: `${cls(m)} · level ${m.level ?? '?'}`, color: classColour(m.classId) });
    }
  }
  if (on.has('leaves')) {
    for (const m of events.left ?? []) {
      embeds.push({ title: `${m.name} left the guild`, description: `${cls(m)} · level ${m.level ?? '?'}`, color: classColour(m.classId) });
    }
  }
  if (on.has('deaths')) {
    for (const d of events.deaths ?? []) {
      if (d.to - d.from < settings.minDeaths) continue;
      embeds.push({
        title: `${d.name} died ${d.to - d.from} times`,
        description: `${cls(d)} · ${d.from} → ${d.to} total deaths`,
        color: classColour(d.classId),
      });
    }
  }
  return embeds;
}

/**
 * Discord webhook notifier. Never throws and never logs the webhook URL.
 * `events`: { guildName, levelups, joined, left, deaths } as built by the refresher.
 */
export function createNotifier({
  url, fetchImpl = globalThis.fetch, log = () => {}, config = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const target = String(url ?? '').trim();
  const settings = {
    events: config.notify?.events ?? ['levelups', 'joins', 'leaves'],
    minDeaths: config.notify?.minDeaths ?? 3,
  };
  let enabled = false;
  if (target) {
    log.addSecret?.(target);
    if (isWebhookUrl(target)) enabled = true;
    else log('Discord notifications disabled: DISCORD_WEBHOOK_URL is not a Discord webhook URL');
  }
  const scrub = (text) => String(text).split(target).join('[redacted]');

  async function post(body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(target, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.status === 429 && attempt === 0) {
        const secs = Number(res.headers?.get?.('Retry-After'));
        await sleep(Math.min(Number.isFinite(secs) && secs >= 0 ? secs * 1000 : 1000, MAX_RETRY_WAIT_MS));
        continue;
      }
      if (!res.ok) throw new Error(`Discord responded ${res.status}`);
      return;
    }
  }

  async function notify(events) {
    if (!enabled || !events) return;
    try {
      const embeds = buildEmbeds(events, settings);
      for (let i = 0; i < embeds.length; i += MAX_EMBEDS) {
        await post({ username: events.guildName, embeds: embeds.slice(i, i + MAX_EMBEDS) });
      }
    } catch (err) {
      try { log(`Discord notification failed: ${scrub(err?.message ?? err)}`); } catch { /* never throw */ }
    }
  }

  return { enabled, notify };
}
