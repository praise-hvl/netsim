// Read a student's notes (docs/notes/week-NN.md) down to their own words: the text they wrote
// inside the `@student` regions, section by section. Pure: markdown in, sections out.

export type Section = { heading: string; text: string };
export type Decision = { decision: string; chose: string; didnt: string };

export type Note = {
  week: number;
  file: string;
  title: string;
  sections: Section[];
  /** The sketch the note links to (`week-NN-board.png`), relative to docs/notes/. */
  sketch?: string;
};

const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Split a note into its `## ` sections and keep what the student wrote. When the note has
 * `@student` regions only the regions count (the rest is the course's instructions); otherwise
 * the whole section does. Sections left empty are dropped.
 */
export function parseNote(week: number, file: string, markdown: string): Note {
  const lines = markdown.split("\n");
  const hasRegions = lines.some((line) => /<!--\s*@student\b/.test(line));
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() ?? `Week ${week} notes`;
  const sections: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let inRegion = false;
  const close = () => {
    if (!current) return;
    const text = current.lines.join("\n").replace(COMMENT, "").replace(/\n{3,}/g, "\n\n").trim();
    if (text && !isEmptyTable(text)) sections.push({ heading: current.heading, text });
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      close();
      current = { heading: line.slice(3).trim(), lines: [] };
      continue;
    }
    if (/<!--\s*@student\b/.test(line)) inRegion = true;
    else if (/<!--\s*@end\s*-->/.test(line)) inRegion = false;
    else if (current && (inRegion || !hasRegions)) current.lines.push(line);
  }
  close();
  // From what the student wrote, not from a commented-out stub that shows the expected link.
  const sketch = /!\[[^\]]*\]\((week-\d+-board\.(?:png|jpe?g|gif|webp))\)/i.exec(sections.map((x) => x.text).join("\n"))?.[1];
  return { week, file, title, sections, ...(sketch ? { sketch } : {}) };
}

/** A table with a header and nothing in its rows: a stub nobody filled in yet. */
function isEmptyTable(text: string): boolean {
  return text.split("\n").every((line) => /^\s*\|/.test(line)) && tableRows(text).length === 0;
}

/** The cells of a markdown table's body rows (header and the |---| rule skipped, empty rows dropped). */
export function tableRows(text: string): string[][] {
  const rows = text.split("\n").filter((line) => /^\s*\|/.test(line));
  return rows
    .filter((line, i) => !/^\s*\|?\s*:?-{3,}/.test(line) && !/^\s*\|?\s*:?-{3,}/.test(rows[i + 1] ?? ""))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ""));
}

/** The first section whose heading matches, e.g. sectionText(note, /decision/i). */
export function sectionText(note: Note, heading: RegExp): string | undefined {
  return note.sections.find((s) => heading.test(s.heading))?.text;
}

/** The "Decisions" table: what was chosen and what wasn't. */
export function decisions(note: Note): Decision[] {
  const text = sectionText(note, /decision/i);
  if (!text) return [];
  return tableRows(text)
    .filter((cells) => cells.length >= 3 && cells[1] !== "")
    .map(([decision, chose, didnt]) => ({ decision, chose, didnt }));
}

/** The "Questions I still have" section, one question per line or bullet. */
export function openQuestions(note: Note): string[] {
  const text = sectionText(note, /question/i);
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
    .filter((line) => line.length > 0);
}
