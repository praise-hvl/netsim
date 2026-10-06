// Week 1 is setup. You run `npm run doctor` until everything passes, try Codex on a real file,
// and write it up in docs/notes/week-01.md. These tests check the write-up is really there.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_GOOD } from "@/scripts/doctor";

const NOTES = "docs/notes/week-01.md";
const MIN_OWN_WORDS = 60;

/** The text under each `## ` heading, with HTML comments (the TODOs) removed. */
function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  let current: string | null = null;
  for (const line of markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = heading[1].trim();
      result.set(current, "");
    } else if (current !== null) {
      result.set(current, `${result.get(current)}${line}\n`);
    }
  }
  return result;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("week 1 setup", () => {
  const notes = sections(readFileSync(NOTES, "utf8"));
  const section = (name: string) => notes.get(name) ?? "";

  it("runs on Node 22 or newer", () => {
    const [major] = process.versions.node.split(".").map(Number);
    expect(major, `you have Node ${process.versions.node}; install 22 or newer from https://nodejs.org`).toBeGreaterThanOrEqual(22);
  });

  it("has the npm run doctor output pasted in, with every check passing", () => {
    const doctor = section("npm run doctor output");
    expect(doctor, `paste the output of \`npm run doctor\` under "npm run doctor output" in ${NOTES}`).toMatch(ALL_GOOD);
    const failures = doctor.split("\n").filter((line) => line.trimStart().startsWith("✗"));
    expect(failures, "fix these and run `npm run doctor` again").toEqual([]);
  });

  it(`explains bus/server.ts in your own words (${MIN_OWN_WORDS}+ words)`, () => {
    const summary = section("Codex: what bus/server.ts does");
    expect(words(summary), `write at least ${MIN_OWN_WORDS} words of your own under "Codex: what bus/server.ts does"`).toBeGreaterThanOrEqual(MIN_OWN_WORDS);
  });

  it("says one thing you checked yourself", () => {
    expect(section("One thing I checked myself").trim(), 'fill in "One thing I checked myself"').not.toBe("");
  });
});
