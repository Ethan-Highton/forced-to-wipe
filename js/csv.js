// CSV helpers. Mirrors the server rule: cells starting with = + - @ get a ' prefix.

export function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
