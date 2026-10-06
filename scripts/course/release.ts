// `npm run release -- <N> [--push]`: release week N to the students, in Praise's copy.
//   1. course.json's week becomes N, and week N's files stop being hidden (.git/info/exclude)
//   2. its guide, lesson page, note template and tests are added (the filter stubs any regions)
//   3. the leak check runs on what's staged: nothing private and nothing unreleased goes
//   4. one commit, "Release week N", tagged week-N; with --push, main and the tag go to GitHub
// Students get it with npm start (the studio fetches the week-N tags as upstream/week-N).
//
// `npm run release -- <N> --update [--push]`: a fix to week N, already committed on main: its tag
// moves to the commit you're on, so students who have week N get the fix too.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { check } from "./check-stubs";
import { released, writeExclude } from "./exclude";

const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const run = (args: string[]) => execFileSync("git", args, { stdio: "inherit" });

/** course.json with `week` set, the field on its own first line as the week branches had it. */
export function withWeek(text: string, week: number): string {
  const course = JSON.parse(text) as Record<string, unknown>;
  return `${JSON.stringify({ ...course, week }, null, 2)}\n`;
}

/** Week N's own paths: its guide and page, its note template, its tests. */
export function weekPaths(week: number): string[] {
  const nn = String(week).padStart(2, "0");
  return [`docs/weeks/week-${nn}.*`, `docs/notes/week-${nn}.md`, `tests/week-${nn}`];
}

function push(tag: string): void {
  // The pre-push hook runs the leak check on everything that goes.
  run(["push", "origin", "main", `+refs/tags/${tag}:refs/tags/${tag}`]);
}

function main(): void {
  const args = process.argv.slice(2);
  const week = Number(args.find((a) => /^\d+$/.test(a)));
  if (!Number.isInteger(week) || week < 1 || week > 8) throw new Error("Which week? npm run release -- 3");
  if (git(["branch", "--show-current"]) !== "main") throw new Error("Release from main.");
  const tag = `week-${week}`;

  if (args.includes("--update")) {
    if (week > released()) throw new Error(`Week ${week} isn't released yet: npm run release -- ${week}`);
    const problems = check("HEAD");
    if (problems.length) throw new Error(`The leak check failed on HEAD:\n${problems.map((p) => `  ${p.path}: ${p.why}`).join("\n")}`);
    run(["tag", "-f", tag]);
    console.log(`✓ ${tag} now points at ${git(["rev-parse", "--short", "HEAD"])}`);
    if (args.includes("--push")) push(tag);
    return;
  }

  if (week !== released() + 1) throw new Error(`The next week to release is ${released() + 1} (course.json says ${released()}).`);
  if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("Commit or put away your changes first: a release is one commit of its own.");
  writeFileSync("course.json", withWeek(readFileSync("course.json", "utf8"), week));
  writeExclude(week);
  run(["add", "course.json", "--", ...weekPaths(week)]);
  const problems = check("--index");
  if (problems.length) {
    run(["reset", "-q"]);
    writeFileSync("course.json", withWeek(readFileSync("course.json", "utf8"), week - 1));
    writeExclude(week - 1);
    throw new Error(`Not released: the leak check found\n${problems.map((p) => `  ${p.path}: ${p.why}`).join("\n")}`);
  }
  run(["commit", "-q", "-m", `[PD]: Release week ${week}`]);
  run(["tag", "-f", tag]);
  console.log(`✓ week ${week} released: ${git(["rev-parse", "--short", "HEAD"])}, tagged ${tag}`);
  if (args.includes("--push")) push(tag);
  else console.log(`Push it when you're ready: git push origin main ${tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
