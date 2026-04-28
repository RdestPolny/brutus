export function parseMarkdownTable(markdown: string): Record<string, string>[] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (lines.length < 2) return [];

  const header = splitRow(lines[0]).map(normalizeHeader);
  const dataLines = lines.slice(1).filter((line) => !isSeparatorRow(line));

  return dataLines.map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = cleanCell(cells[index] ?? "");
    });
    return row;
  });
}

export function pickValue(row: Record<string, string>, headers: string[]): string {
  for (const header of headers.map(normalizeHeader)) {
    const value = row[header];
    if (value) return value;
  }
  return "";
}

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return splitRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function cleanCell(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[\d+(?:,\s*\d+)*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
