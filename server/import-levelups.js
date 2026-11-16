import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './csv.js';
import { ROOT_DIR, loadConfig } from './config.js';
import { createStore } from './store.js';

/**
 * Turns CSV rows (Date,Name,Old level,New level) into levelups entries with source "imported".
 * Names are matched against members.json ("Name" or "Name Surname"); unmatched rows are skipped.
 */
export function buildImportedEntries(rows, members) {
  const byName = new Map();
  for (const m of Object.values(members)) {
    byName.set(`${m.name} ${m.surname}`.trim().toLowerCase(), m);
    if (!byName.has(m.name.toLowerCase())) byName.set(m.name.toLowerCase(), m);
  }
  const entries = [];
  const skipped = [];
  for (const [date, name, oldLevel, newLevel] of rows) {
    const at = Date.parse(date);
    const member = byName.get(String(name).trim().toLowerCase());
    const oldL = Number(oldLevel);
    const newL = Number(newLevel);
    if (!member || Number.isNaN(at) || !Number.isInteger(oldL) || !Number.isInteger(newL)) {
      skipped.push(name);
      continue;
    }
    entries.push({
      id: `${member.id}-${newL}`, charId: member.id, name: `${member.name} ${member.surname}`.trim(),
      at, oldLevel: oldL, newLevel: newL, approx: true, source: 'imported',
    });
  }
  return { entries, skipped };
}

/** Merges imported entries into existing ones, never replacing an existing id. */
export function mergeLevelups(existing, imported) {
  const known = new Set(existing.map((e) => e.id));
  const added = imported.filter((e) => !known.has(e.id));
  return { merged: [...existing, ...added], added: added.length };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run import-levelups <file.csv>');
    process.exit(1);
  }
  const { config } = loadConfig({ rootDir: ROOT_DIR });
  const store = createStore(config.dataDir, console.log);
  const members = store.readMembers();
  if (!Object.keys(members).length) {
    console.error('No members known yet. Start the server once so the first refresh completes, then import.');
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (rows[0] && Number.isNaN(Date.parse(rows[0][0]))) rows.shift(); // header row
  const { entries, skipped } = buildImportedEntries(rows, members);
  const { merged, added } = mergeLevelups(store.readLevelups(), entries);
  store.write('levelups.json', merged);
  console.log(`Imported ${added} entries (${entries.length - added} duplicates, ${skipped.length} skipped).`);
  if (skipped.length) console.log(`Skipped names: ${[...new Set(skipped)].join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
