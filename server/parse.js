// Pure functions turning raw Blizzard JSON into the Member sections of API-CONTRACT.md.
// Each section parser returns the data without fetchedAt/stale; refresh.js adds those.

const STAT_DEATHS = 60;
const STAT_QUESTS = 98;
const STAT_DUNGEONS = 932;
const STAT_GREED = 1043;
const STAT_NEED = 1044;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function parseRoster(json) {
  if (!json || !Array.isArray(json.members)) throw new Error('roster has no members array');
  const members = json.members
    .filter((m) => m?.character?.id != null && m.character.slug)
    .map((m) => ({
      id: m.character.id,
      slug: m.character.slug,
      name: m.character.name ?? '',
      surname: m.character.surname ?? '',
      rank: num(m.rank),
      level: num(m.character.level),
      classId: m.character.playable_class?.id ?? null,
      raceId: m.character.playable_race?.id ?? null,
    }));
  return { guildName: json.guild?.name ?? null, members };
}

export function parseProfile(json) {
  if (!json || typeof json !== 'object') throw new Error('bad profile');
  return {
    xp: num(json.experience),
    ilvl: num(json.average_item_level),
    lastLogin: json.last_login_timestamp ?? null,
    raceName: json.race?.name ?? null,
    className: json.character_class?.name ?? null,
  };
}

export function parseSpecializations(json) {
  const groups = json?.specialization_groups;
  if (!Array.isArray(groups)) throw new Error('bad specializations');
  const group = groups.find((g) => g.is_active) ?? groups[0];
  const trees = (group?.specializations ?? [])
    .map((spec) => ({
      name: spec.specialization?.name ?? spec.specialization_name ?? 'Unknown',
      points: (spec.talents ?? []).reduce((sum, t) => sum + num(t.talent_rank), 0),
    }))
    .filter((t) => t.points > 0)
    .sort((a, b) => b.points - a.points);
  return { trees };
}

function parseSkills(list) {
  return (list ?? []).map((p) => {
    // Use the tier with the largest max skill (the current expansion's tier).
    const tier = (p.tiers ?? []).reduce(
      (best, t) => (!best || num(t.max_skill_points) > num(best.max_skill_points) ? t : best),
      null,
    );
    return { name: p.profession?.name ?? 'Unknown', skill: num(tier?.skill_points), max: num(tier?.max_skill_points) };
  });
}

export function parseProfessions(json) {
  if (!json || typeof json !== 'object') throw new Error('bad professions');
  return { primary: parseSkills(json.primaries), secondary: parseSkills(json.secondaries) };
}

/** Depth-first walk over categories -> sub_categories, yielding every category node. */
function* walkCategories(nodes, parents = []) {
  for (const node of nodes ?? []) {
    yield { node, parents };
    yield* walkCategories(node.sub_categories, [...parents, node.name]);
  }
}

const BOSS_RE = /^(.+?)\s+kills\s*\((.+)\)\s*$/i;

export function parseStatistics(json) {
  if (!json || !Array.isArray(json.categories)) throw new Error('bad statistics');
  const byId = new Map();
  const bosses = [];
  for (const { node } of walkCategories(json.categories)) {
    for (const st of node.statistics ?? []) byId.set(st.id, st);
    if (node.name === 'Boss Kills') {
      for (const st of node.statistics ?? []) {
        const m = BOSS_RE.exec(st.name ?? '');
        if (m) bosses.push({ name: m[1].trim(), instance: m[2].trim(), count: num(st.quantity) });
      }
    }
  }
  const q = (id) => num(byId.get(id)?.quantity);
  return {
    deaths: q(STAT_DEATHS),
    quests: q(STAT_QUESTS),
    dungeons: q(STAT_DUNGEONS),
    need: q(STAT_NEED),
    greed: q(STAT_GREED),
    bossKills: bosses.reduce((sum, b) => sum + b.count, 0),
    bosses,
  };
}

export function parsePvp(json) {
  if (!json || typeof json !== 'object') throw new Error('bad pvp');
  return {
    hk: num(json.honorable_kills),
    bgs: (json.pvp_map_statistics ?? []).map((m) => ({
      name: m.world_map?.name ?? 'Unknown',
      played: num(m.match_statistics?.played),
      won: num(m.match_statistics?.won),
    })),
  };
}
