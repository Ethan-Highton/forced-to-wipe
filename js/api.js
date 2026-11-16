// Data access. All URLs are relative (no leading slash) so a /guild mount works.
// With ?mock=1 a built-in sample dataset is served instead of fetching.

export const isMock = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mock') === '1';

async function getJson(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`Server answered ${res.status}`), { status: res.status });
  return res.json();
}

export const getConfig = () => (isMock ? Promise.resolve(mock.config()) : getJson('api/config'));
export const getState = () => (isMock ? Promise.resolve(mock.state()) : getJson('api/state'));
export const getLevelups = (limit = 200) =>
  isMock ? Promise.resolve(mock.levelups()) : getJson(`api/levelups?limit=${limit}`);
export const getHistory = (id) =>
  isMock ? Promise.resolve(mock.history(id)) : getJson(`api/history/${encodeURIComponent(id)}`);

// Resolves to { status, body } for 202 / 409 / 429 instead of throwing.
export async function postRefresh() {
  if (isMock) return { status: 429, body: { retryAfterSec: 30 } };
  const res = await fetch('api/refresh', { method: 'POST' });
  let body = {};
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body };
}

// ---- dev mock ----------------------------------------------------------

const H = 3600 * 1000;
const D = 24 * H;

const mock = {
  config: () => ({
    guildName: 'Forced to Wipe', region: 'eu', refreshMinutes: 60,
    activityDays: { quiet: 3, inactive: 14 }, basePath: '',
    branding: { title: 'Forced to Wipe', accent: '#e0a43a', logo: '' },
  }),

  state() {
    const now = Date.now();
    const tree = (name, points) => ({ name, points });
    const sec = { fetchedAt: now - 20 * 60000, stale: false };
    const make = (id, name, surname, rank, classId, className, raceName, level, ago, lvlAgo, extra = {}) => ({
      id, slug: `${name}-${surname}`.toLowerCase(), name, surname, rank, classId, className,
      raceId: 1, raceName, level, detailsAvailable: level >= 10,
      lastLevelUpAt: lvlAgo == null ? null : now - lvlAgo,
      profile: level >= 10 ? { xp: 1000 * level + id, ilvl: level - 2, lastLogin: now - ago, ...sec } : null,
      talents: level >= 10 ? { trees: extra.trees, ...sec } : null,
      professions: level >= 10 ? { primary: extra.prof, secondary: [{ name: 'Cooking', skill: 80, max: 150 }], ...sec } : null,
      stats: level >= 10 ? {
        deaths: extra.deaths ?? 3, quests: extra.quests ?? 120 + level, dungeons: 4 + (extra.bosses || []).length,
        bossKills: (extra.bosses || []).reduce((s, b) => s + b.count, 0),
        bosses: extra.bosses || [],
        ...sec,
      } : null,
      pvp: level >= 10 && !extra.noPvp ? { hk: 40 * level, bgs: extra.bgs || [{ name: 'Warsong Gulch', played: 10, won: 6 }], ...sec } : null,
    });
    const rfc = (name, count) => ({ name, instance: 'Ragefire Chasm', count });
    const wc = (name, count) => ({ name, instance: 'Wailing Caverns', count });
    const dm = (name, count) => ({ name, instance: 'The Deadmines', count });
    return {
      meta: { refreshedAt: now - 23 * 60000, refreshStatus: 'ok', lastSuccessAt: now - 23 * 60000, lastAttemptAt: now - 23 * 60000, refreshMinutes: 60, cooldownSec: 0 },
      guild: { name: 'Forced to Wipe', memberCount: 5 },
      errors: [],
      members: [
        make(1, 'Jeezus', 'Khryst', 0, 5, 'Priest', 'Troll', 35, 20 * 60000, 2 * D, { trees: [tree('Discipline', 19), tree('Shadow Magic', 7)], prof: [{ name: 'Tailoring', skill: 150, max: 225 }, { name: 'Enchanting', skill: 225, max: 225 }], deaths: 7, quests: 310, bosses: [rfc('Bazzalan', 3), rfc('Taragaman the Hungerer', 2), wc('Mutanus the Devourer', 1)], bgs: [{ name: 'Warsong Gulch', played: 10, won: 6 }, { name: 'Arathi Basin', played: 4, won: 1 }] }),
        make(2, 'Carlos', 'Ruiz', 1, 4, 'Rogue', 'Human', 35, 5 * D, 9 * D, { trees: [tree('Assassination', 21), tree('Subtlety', 6)], prof: [{ name: 'Mining', skill: 140, max: 150 }], deaths: 12, quests: 255, bosses: [rfc('Bazzalan', 2), dm('Edwin VanCleef', 4), dm('Mr. Smite', 4)], bgs: [{ name: 'Warsong Gulch', played: 20, won: 14 }] }),
        make(3, 'Brenna', 'Ashvale', 2, 8, 'Mage', 'Gnome', 28, 30 * D, 40 * D, { trees: [tree('Frost', 18)], prof: [{ name: 'Tailoring', skill: 200, max: 225 }], deaths: 7, quests: 198, bosses: [wc('Mutanus the Devourer', 2)], noPvp: true }),
        make(4, 'Ünsal', 'Grimtotem', 2, 7, 'Shaman', 'Tauren', 41, 2 * H, 6 * H, { trees: [tree('Restoration', 25), tree('Enhancement', 11)], prof: [{ name: 'Herbalism', skill: 230, max: 300 }], deaths: 2, quests: 402, bosses: [rfc('Bazzalan', 5), wc('Mutanus the Devourer', 3), dm('Edwin VanCleef', 1)], bgs: [{ name: 'Warsong Gulch', played: 1, won: 1 }] }),
        make(5, 'Pip', 'Tinker', 3, 1, 'Warrior', 'Dwarf', 7, 1 * D, null, {}),
      ],
    };
  },

  levelups() {
    const now = Date.now();
    const e = (id, charId, name, ago, o, n) => ({ id: `${charId}-${n}`, charId, name, at: now - ago, oldLevel: o, newLevel: n, approx: true, source: 'detected' });
    return { entries: [
      e(0, 4, 'Ünsal Grimtotem', 6 * H, 40, 41),
      e(0, 1, 'Jeezus Khryst', 2 * D, 34, 35),
      e(0, 2, 'Carlos Ruiz', 9 * D, 34, 35),
      e(0, 2, 'Carlos Ruiz', 9 * D + 5 * H, 33, 34),
      e(0, 3, 'Brenna Ashvale', 40 * D, 27, 28),
    ] };
  },

  // Plausible climb ending at the member's current level.
  history(id) {
    const m = this.state().members.find((x) => String(x.id) === String(id));
    const now = Date.now();
    const points = [];
    for (let i = 0; i <= 40; i++) {
      points.push({ t: now - (40 - i) * D, level: Math.max(1, (m ? m.level : 10) - Math.floor((40 - i) / 6)), xp: 0, ilvl: 0, deaths: 0, quests: 0, hk: 0 });
    }
    return { points };
  },
};
