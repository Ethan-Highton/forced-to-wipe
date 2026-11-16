// Pure helpers for the Stats page (no DOM): heat bucketing, record holders, sorting, boss rows.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const memberName = (m) => [m.name, m.surname].filter(Boolean).join(' ');

// Heat class (0..4) per value, by rank within the column. Ties share a class, the column's
// highest value is always 4 and the lowest 0. null/undefined/NaN stay null. A column with
// fewer than two distinct values has no spread, so everything is 0.
export function heatClasses(values) {
  const nums = values.filter(isNum);
  const n = nums.length;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (n < 2 || lo === hi) return values.map((v) => (isNum(v) ? 0 : null));
  return values.map((v) => {
    if (!isNum(v)) return null;
    if (v === hi) return 4;
    if (v === lo) return 0;
    let less = 0;
    let same = 0;
    for (const x of nums) {
      if (x < v) less++;
      else if (x === v) same++;
    }
    const p = (less + (same - 1) / 2) / (n - 1);
    return Math.min(4, Math.max(0, Math.floor(p * 5)));
  });
}

// Highest value in the column, or null when nobody has data.
export function columnBest(values) {
  const nums = values.filter(isNum);
  return nums.length ? Math.max(...nums) : null;
}

// Sort comparator for one column. Missing values sink to the bottom whatever the direction.
export function compareValues(x, y, dir = 1, text = false) {
  const xn = x == null || (typeof x === 'number' && Number.isNaN(x));
  const yn = y == null || (typeof y === 'number' && Number.isNaN(y));
  if (xn && yn) return 0;
  if (xn) return 1;
  if (yn) return -1;
  return (text ? String(x).localeCompare(String(y)) : x - y) * dir;
}

// defs: [{ key, label, value(member) }]. total sums members with data; the record is the
// highest value (> 0) and every member who shares it.
export function recordHolders(members, defs) {
  return defs.map((d) => {
    let total = 0;
    let withData = 0;
    let best = null;
    let holders = [];
    for (const m of members || []) {
      const v = d.value(m);
      if (!isNum(v)) continue;
      withData++;
      total += v;
      if (best === null || v > best) { best = v; holders = [m]; } else if (v === best) holders.push(m);
    }
    if (!best) holders = [];
    return { key: d.key, label: d.label, total, withData, value: best, holders };
  });
}

export function firstName(m) {
  return (m && m.name) || '';
}

// bossBoard() output -> flat rows: an instance header followed by its bosses.
export function bossRows(board) {
  const rows = [];
  for (const inst of board || []) {
    rows.push({ type: 'instance', instance: inst.instance, total: inst.total, bossCount: inst.bosses.length });
    for (const b of inst.bosses) {
      rows.push({
        type: 'boss',
        instance: inst.instance,
        name: b.name,
        total: b.total,
        who: [...b.members].sort((x, y) => y.count - x.count || memberName(x.member).localeCompare(memberName(y.member))),
      });
    }
  }
  return rows;
}
