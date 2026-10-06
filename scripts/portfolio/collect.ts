// The impure half of the history export: git, the notes on disk, and the week tests (now, and at
// old commits for "first green"). Works offline: it only reads this repository.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { groupByWeek, LOG_FORMAT, mergedWeek, ownCommits, pagesUrl, parseLog, type Commit } from "./history";
import { parseNote, type Note } from "./notes";
import { firstPassing, weekResults, type PortfolioHistory, type VitestReport, type WeekTests } from "./report";

export const git = (root: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

const tryGit = (root: string, ...args: string[]) => {
  try {
    return git(root, ...args);
  } catch {
    return "";
  }
};

/** Your commits, oldest first: everything on this branch that didn't come from the course. */
export function readCommits(root: string): Commit[] {
  // The course's own commits are reachable from upstream's week branches when that remote exists...
  const upstream = tryGit(root, "for-each-ref", "--format=%(refname)", "refs/remotes/upstream").split("\n").filter(Boolean);
  const raw = git(root, "log", "--date-order", "--reverse", "--numstat", `--format=${LOG_FORMAT}`, "HEAD", ...(upstream.length ? ["--not", ...upstream] : []));
  const commits = parseLog(raw);
  // ...and otherwise (a zipped copy, a fresh clone) they're the ones by whoever made the week branches.
  const tips = commits.filter((c) => mergedWeek(c) !== null).map((c) => c.parents[1]);
  const starter = new Set(tips.length ? tryGit(root, "show", "-s", "--format=%ae", ...tips).split("\n").filter(Boolean) : []);
  return ownCommits(commits, starter);
}

/** The week the work branch was made from: course.json just before your first commit. */
function firstWeek(root: string, commits: readonly Commit[]): number {
  const parent = commits[0]?.parents[0];
  if (!parent) return 1;
  try {
    return (JSON.parse(git(root, "show", `${parent}:course.json`)) as { week?: number }).week ?? 1;
  } catch {
    return 1;
  }
}

export function readNotes(root: string): Note[] {
  const dir = join(root, "docs", "notes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, match: /^week-(\d+)\.md$/.exec(name) }))
    .filter((f): f is { name: string; match: RegExpExecArray } => f.match !== null)
    .map(({ name, match }) => parseNote(Number(match[1]), `docs/notes/${name}`, readFileSync(join(dir, name), "utf8")))
    .sort((a, b) => a.week - b.week);
}

/** Pictures of the board: anything in docs/screenshots/ or portfolio/media/, or named like a screenshot. */
export function findScreenshots(root: string): string[] {
  return tryGit(root, "ls-files", "--cached", "--others", "--exclude-standard")
    .split("\n")
    .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .filter((f) => !f.startsWith("docs/notes/") && !f.startsWith("public/"))
    .filter((f) => /^(docs\/screenshots|portfolio\/media)\//.test(f) || /screen ?shot|board|demo/i.test(basename(f)))
    .sort();
}

/** Run the week tests in `dir` (all of them, or one week's) and read Vitest's JSON report. */
function vitest(dir: string, vitestBin: string, only?: number): VitestReport | null {
  const out = mkdtempSync(join(tmpdir(), "netsim-portfolio-"));
  const report = join(out, "vitest.json");
  try {
    const filter = only === undefined ? [] : [`tests/week-${String(only).padStart(2, "0")}/`];
    // Plain node, not npx: much faster on machines with endpoint-security agents.
    spawnSync(process.execPath, [vitestBin, "run", ...filter, "--reporter=json", `--outputFile=${report}`], { cwd: dir, stdio: "ignore" });
    return existsSync(report) ? (JSON.parse(readFileSync(report, "utf8")) as VitestReport) : null;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** Which weeks pass right now (your working tree, uncommitted changes included). */
export function testsNow(root: string): WeekTests[] | null {
  const report = vitest(root, join(root, "node_modules", "vitest", "vitest.mjs"));
  if (!report) return null;
  return [...weekResults(report)]
    .map(([week, { passed, failed }]) => ({ week, passed, failed, status: failed === 0 && passed > 0 ? ("pass" as const) : ("fail" as const) }))
    .sort((a, b) => a.week - b.week);
}

/** Does `week` pass at `commit`? Runs in a throwaway copy of that commit, never your working tree. */
function passesAt(root: string, commit: string, week: number): boolean {
  const dir = mkdtempSync(join(tmpdir(), "netsim-portfolio-at-"));
  try {
    const tarball = execFileSync("git", ["archive", "--format=tar", commit], { cwd: root, maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tarball });
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
    const results = weekResults(vitest(dir, join(root, "node_modules", "vitest", "vitest.mjs"), week) ?? { testResults: [] }).get(week);
    return results !== undefined && results.failed === 0 && results.passed > 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Fill in each passing week's `firstGreen`, reusing (and adding to) earlier results in `probes`. */
export async function findFirstGreen(
  root: string,
  history: Pick<PortfolioHistory, "weeks" | "tests" | "probes">,
  commits: readonly Commit[],
  progress: (text: string) => void,
): Promise<void> {
  for (const tests of history.tests) {
    if (tests.status !== "pass") continue;
    const start = history.weeks.find((w) => w.week === tests.week)?.start;
    const from = start ? commits.indexOf(start) : 0;
    const candidates = commits.slice(Math.max(from, 0)).filter((c) => c.parents.length === 1 || c === start);
    const green = await firstPassing(candidates, async (c) => {
      const known = history.probes[c.hash]?.[tests.week];
      if (known !== undefined) return known;
      progress(`  week ${tests.week} at ${c.short} "${c.subject}"`);
      const passed = passesAt(root, c.hash, tests.week);
      history.probes[c.hash] = { ...history.probes[c.hash], [tests.week]: passed };
      return passed;
    });
    if (green) tests.firstGreen = { short: green.short, date: green.date };
  }
}

/** Everything HISTORY.md and history.json hold, except the test results (see testsNow). */
export function collect(root: string, probes: PortfolioHistory["probes"]): { history: PortfolioHistory; commits: Commit[] } {
  const commits = readCommits(root);
  const remote = tryGit(root, "remote", "get-url", "origin");
  const repo = /([^/:]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? basename(root);
  return {
    commits,
    history: {
      exportedAt: new Date().toISOString(),
      branch: tryGit(root, "branch", "--show-current") || "(detached)",
      head: tryGit(root, "rev-parse", "--short", "HEAD"),
      repo,
      pagesUrl: pagesUrl(remote),
      weeks: groupByWeek(commits, firstWeek(root, commits)),
      notes: readNotes(root),
      tests: [],
      timeline: false,
      screenshots: findScreenshots(root),
      probes,
    },
  };
}
