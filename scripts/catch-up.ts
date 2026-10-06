// `npm run course:catch-up -- 3`: fell behind? Replace your week-3 regions with the reference
// solution, once Praise has published week-3-solution. Only the code between that
// week's `@student` / `@end` markers changes; everything else you wrote stays.
//   --from <ref>   take the solution from somewhere else (default: upstream/week-N-solution)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { copyRegion, findRegions, isRegionFile, readRef } from "./lib/regions";

const week = Number(process.argv[2]);
if (!Number.isInteger(week) || week < 1 || week > 8) {
  console.error("usage: npm run course:catch-up -- <week 1-8> [--from <ref>]");
  process.exit(1);
}
const fromIndex = process.argv.indexOf("--from");
const ref = fromIndex === -1 ? `upstream/week-${week}-solution` : process.argv[fromIndex + 1];
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

if (fromIndex === -1) {
  try {
    git("fetch", "upstream", `week-${week}-solution`);
  } catch {
    console.error(`couldn't fetch week-${week}-solution from upstream. Has Praise published it yet?`);
    process.exit(1);
  }
}

// Not through git(): trimming would eat the leading space of the first " M path" line.
const dirty = new Set(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3)),
);
const changed: string[] = [];
for (const [file, solution] of readRef(ref)) {
  if (!isRegionFile(file)) continue;
  const ids = findRegions(file, solution).filter((r) => r.week === week).map((r) => r.id);
  if (ids.length === 0) continue;
  if (dirty.has(file)) {
    console.error(`${file} has uncommitted changes. Commit them first so you can always get your version back.`);
    process.exit(1);
  }
  let text = readFileSync(file, "utf8");
  for (const id of ids) text = copyRegion(file, text, solution, id);
  writeFileSync(file, text);
  changed.push(`${file} (${ids.join(", ")})`);
}

if (changed.length === 0) console.log(`no week-${week} regions found in ${ref}`);
else console.log(`replaced with the reference solution:\n  ${changed.join("\n  ")}\nReview with \`git diff\`, run the tests, and commit.`);
