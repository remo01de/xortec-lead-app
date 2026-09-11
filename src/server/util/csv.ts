/** RFC-style quoted fields, escaped quotes and embedded newlines; German Excel delimiters. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  let quoted = false;
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    }
    if (!quoted && (ch === '\r' || ch === '\n')) break;
    if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false, closed = false;
  const endField = () => { row.push(field.trim()); field = ''; closed = false; };
  const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; closed = true; }
      else field += ch;
    } else if (ch === delimiter) endField();
    else if (ch === '\r' || ch === '\n') { endRow(); if (ch === '\r' && text[i + 1] === '\n') i++; }
    else if (ch === '"' && !field && !closed) inQuotes = true;
    else if (ch === '"' || (closed && ch.trim())) throw new Error('Ungültige Anführungszeichen in der CSV-Datei.');
    else if (!closed) field += ch;
    if (field.length > 5000 || row.length > 100 || rows.length > 10001) throw new Error('CSV zu groß: maximal 10.000 Zeilen, 100 Spalten und 5.000 Zeichen je Feld.');
  }
  if (inQuotes) throw new Error('Nicht geschlossenes Anführungszeichen in der CSV-Datei.');
  endRow();
  if (rows.length > 10001 || rows.some(r => r.length > 100)) throw new Error('CSV zu groß: maximal 10.000 Datenzeilen und 100 Spalten.');
  if (rows.length < 2) throw new Error('CSV benötigt eine Kopfzeile und mindestens einen Datensatz.');
  const width = rows[0]!.length;
  if (rows.some(r => r.length !== width)) throw new Error('Die CSV-Zeilen haben unterschiedlich viele Spalten.');
  return rows;
}

/** BOM + semicolon + CRLF for Excel. Neutralize spreadsheet formula interpretation. */
export function toCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n') + '\r\n';
}
