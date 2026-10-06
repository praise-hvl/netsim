// Checks a design week's note (docs/notes/week-NN.md): every section is really filled in, and
// the board sketch is committed next to it. Used by tests/week-02, week-04 and week-06.
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findRegions } from "@/scripts/lib/regions";

/** The fewest words of your own each section needs (tables count their rows, not their header). */
export const MIN_WORDS: Record<string, number> = {
  goal: 12,
  parts: 12,
  messages: 12,
  states: 15,
  scenario: 15,
  board: 12,
  decisions: 15,
  questions: 3,
  brief: 20,
};

/** Your own words in a section: no comments, no table headers or rules, no image links or bold labels. */
export function ownWords(lines: readonly string[]): number {
  const kept: string[] = [];
  const text = lines.filter((line) => !/^\s*<!--.*-->\s*$/.test(line));
  text.forEach((line, i) => {
    if (/^\s*\|?\s*:?-{3,}/.test(line)) return; // |---|---|
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(text[i + 1] ?? "")) return; // the header row above it
    kept.push(line.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\*\*[^*]+:\*\*/g, "").replace(/\|/g, " "));
  });
  return kept.join(" ").split(/\s+/).filter((word) => /\w/.test(word)).length;
}

/** PNG or JPEG, by its first bytes, and big enough to be a real photo or drawing. */
function isImage(path: string): boolean {
  const head = readFileSync(path).subarray(0, 4);
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  return (png || jpeg) && statSync(path).size > 2048;
}

export function checkDesignNote(week: number): void {
  const nn = String(week).padStart(2, "0");
  const file = `docs/notes/week-${nn}.md`;
  const regions = findRegions(file, readFileSync(file, "utf8"));

  describe(`week ${week} design note (${file})`, () => {
    for (const [section, min] of Object.entries(MIN_WORDS)) {
      it(`'${section}' is filled in (${min}+ words of your own)`, () => {
        const region = regions.find((r) => r.id === `design-${nn}-${section}`);
        expect(region, `the design-${nn}-${section} section is missing from ${file}`).toBeDefined();
        expect(ownWords(region!.body), `write at least ${min} words of your own under "${section}"`).toBeGreaterThanOrEqual(min);
      });
    }

    it("links your board sketch, and the photo is committed next to the note", () => {
      const board = regions.find((r) => r.id === `design-${nn}-board`)?.body.join("\n") ?? "";
      const link = new RegExp(`\\]\\((week-${nn}-board\\.(?:png|jpe?g))\\)`).exec(board);
      expect(link, `link your sketch in the board section: ![My board sketch](week-${nn}-board.jpg)`).not.toBeNull();
      const photo = `docs/notes/${link![1]}`;
      expect(existsSync(photo), `commit your sketch as ${photo}`).toBe(true);
      expect(isImage(photo), `${photo} should be a real PNG or JPEG photo of your sketch`).toBe(true);
    });
  });
}
