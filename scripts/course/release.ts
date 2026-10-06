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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Week N's own files that exist: its guide and page, its note template (design weeks), its tests. */
export function weekPaths(week: number, root = "."): string[] {
  const nn = String(week).padStart(2, "0");
  const pages = existsSync(`${root}/docs/weeks`) ? readdirSync(`${root}/docs/weeks`).filter((f) => f.startsWith(`week-${nn}.`)).map((f) => `docs/weeks/${f}`) : [];
  return [...pages, `docs/notes/week-${nn}.md`, `tests/week-${nn}`].filter((p) => existsSync(`${root}/${p}`));
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
  const paths = weekPaths(week);
  if (!paths.some((p) => p.startsWith("docs/weeks/"))) throw new Error(`Week ${week} has no guide here (docs/weeks/week-${String(week).padStart(2, "0")}.md): nothing to release.`);
  writeFileSync("course.json", withWeek(readFileSync("course.json", "utf8"), week));
  writeExclude(week);
  // Anything that goes wrong from here puts course.json and the hidden weeks back as they were.
  const undo = (why: string) => {
    run(["reset", "-q"]);
    writeFileSync("course.json", withWeek(readFileSync("course.json", "utf8"), week - 1));
    writeExclude(week - 1);
    return new Error(why);
  };
  try {
    run(["add", "course.json", "--", ...paths]);
  } catch (error) {
    throw undo(`Not released: git add failed (${error instanceof Error ? error.message : String(error)})`);
  }
  const problems = check("--index");
  if (problems.length) throw undo(`Not released: the leak check found\n${problems.map((p) => `  ${p.path}: ${p.why}`).join("\n")}`);
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
