/**
 * Compares a fresh roster with what we knew before.
 *
 * @param prevMembers  members.json map { charId: record }
 * @param prevCurrent  Member[] from the last current.json (source of previous levels)
 * @param roster       parsed roster members
 * @param seeded       false on the first run: baseline only, no level-up entries
 * @returns { ok:false, reason } for bad data, else { ok:true, members, levelups, joined, left, renamed }
 */
export function diffRoster({ prevMembers, prevCurrent, roster, now, seeded }) {
  const prevLevel = new Map((prevCurrent ?? []).map((m) => [String(m.id), m.level]));

  for (const r of roster) {
    const before = prevLevel.get(String(r.id));
    if (before != null && r.level < before) {
      return { ok: false, reason: `level decreased for ${r.name} (${before} -> ${r.level})` };
    }
  }

  const members = {};
  for (const [id, rec] of Object.entries(prevMembers ?? {})) members[id] = { ...rec, previousNames: [...(rec.previousNames ?? [])] };

  const levelups = [];
  const joined = [];
  const renamed = [];
  const seen = new Set();

  for (const r of roster) {
    const key = String(r.id);
    seen.add(key);
    const rec = members[key];
    if (!rec) {
      members[key] = { id: r.id, slug: r.slug, name: r.name, surname: r.surname, firstSeen: now, leftAt: null, previousNames: [] };
      joined.push(r.id);
    } else {
      if (rec.slug !== r.slug || rec.name !== r.name || rec.surname !== r.surname) {
        rec.previousNames.push({ name: rec.name, surname: rec.surname, until: now });
        Object.assign(rec, { slug: r.slug, name: r.name, surname: r.surname });
        renamed.push(r.id);
      }
      rec.leftAt = null; // rejoining clears leftAt
    }

    const before = prevLevel.get(key);
    if (seeded && before != null && r.level > before) {
      levelups.push({
        id: `${r.id}-${r.level}`,
        charId: r.id,
        name: `${r.name} ${r.surname}`.trim(),
        at: now,
        oldLevel: before,
        newLevel: r.level,
        approx: true,
        source: 'detected',
      });
    }
  }

  const left = [];
  for (const [key, rec] of Object.entries(members)) {
    if (!seen.has(key) && rec.leftAt == null) {
      rec.leftAt = now;
      left.push(rec.id);
    }
  }

  return { ok: true, members, levelups, joined, left, renamed };
}
