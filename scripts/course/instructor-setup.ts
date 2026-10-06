// `npm run instructor:setup`: turn a clone of the course into Praise's working copy, once per laptop.
//   - the solutions filter (scripts/course/git-filter.ts), required: git stops rather than commit
//     a region file it couldn't filter
//   - the pre-push leak check (.githooks/pre-push)
//   - the unreleased weeks hidden from the public repo (.git/info/exclude)
//   - every region file shown with its solution (from solutions/, the private side)
// Get the private side first (npm run private -- restore <its URL>), or it can only warn.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isRegionFile } from "../lib/regions";
import { released, writeExclude } from "./exclude";
import { smudge, SOLUTIONS } from "./git-filter";

const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

export const FILTER = "netsim-solutions";
export const FILTER_COMMAND = "node node_modules/tsx/dist/cli.mjs scripts/course/git-filter.ts";

function main(): void {
  git(["config", `filter.${FILTER}.process`, FILTER_COMMAND]);
  git(["config", `filter.${FILTER}.required`, "true"]);
  git(["config", "core.hooksPath", ".githooks"]);
  const week = released();
  const exclude = writeExclude(week);
  console.log(`✓ the solutions filter and the pre-push leak check are on`);
  console.log(`✓ weeks ${week + 1}-8 are hidden from the public repo (${exclude})`);
  if (!existsSync(SOLUTIONS)) {
    console.log(`! there's no ${SOLUTIONS}/ here yet: get the private side (npm run private -- restore <URL>), then run this again`);
    return;
  }
  // Show the solutions: each region file as the filter would check it out (from what's committed).
  // git then sees the same (clean gives back what's committed), so nothing shows as changed.
  const filled: string[] = [];
  for (const path of git(["ls-files"]).split("\n")) {
    if (!isRegionFile(path) || !existsSync(join(SOLUTIONS, path))) continue;
    const committed = execFileSync("git", ["show", `:${path}`], { encoding: "utf8" }); // as committed, untrimmed
    const solved = smudge(path, committed);
    if (solved !== readFileSync(path, "utf8")) {
      writeFileSync(path, solved);
      filled.push(path);
    }
  }
  // git still has the stubbed files' sizes: adding them again runs them through the filter (the
  // same stubbed blobs, so nothing is staged) and git records the solved files as unchanged.
  if (filled.length) git(["add", "--", ...filled]);
  console.log(`✓ ${filled.length} file${filled.length === 1 ? "" : "s"} now show their solutions`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
