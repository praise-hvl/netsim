// `npm run check-stubs [-- <what>]`: the course's leak check. Nothing in the public repository may
// carry a solution, a teacher note, an instructor tool or a week that isn't released yet.
//
//   (nothing)        the commit you're on (HEAD)
//   --index          what's staged (the next commit)
//   --all            every commit in HEAD's history (the whole public history)
//   <a>..<b>         every commit in that range (the pre-push hook passes what's being pushed)
//   --history <ref>  <ref> and every commit before it (a branch or tag that's new on the remote)
//
// For every file of every commit checked: it isn't private (scripts/course/private-paths.ts), and
// a file with @student regions has every region stubbed. Exit 1 and a list when anything fails.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { findRegions, isRegionFile, isStubbed } from "../lib/regions";
import { privateReason } from "./private-paths";

export type Problem = { commit: string; path: string; why: string };
type Git = (args: string[], input?: string) => string;

const git: Git = (args, input) => execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 });

/** Is every region in this file a stub? */
export function fullyStubbed(path: string, text: string): boolean {
  return findRegions(path, text).every(isStubbed);
}

/**
 * The problems in one tree: `files` maps each path to a way of reading it (only region files and
 * course.json are read).
 */
export function checkTree(commit: string, files: ReadonlyMap<string, () => string>): Problem[] {
  const course = files.get("course.json");
  let released = 0;
  try {
    released = Number((JSON.parse(course ? course() : "{}") as { week?: unknown }).week) || 0;
  } catch {
    return [{ commit, path: "course.json", why: "not valid JSON, so which weeks are released can't be told" }];
  }
  const problems: Problem[] = [];
  for (const [path, read] of files) {
    const reason = privateReason(path, released);
    if (reason) {
      problems.push({ commit, path, why: reason });
      continue;
    }
    if (!isRegionFile(path)) continue;
    const text = read();
    if (!text.includes("@student")) continue;
    try {
      if (!fullyStubbed(path, text)) problems.push({ commit, path, why: "an @student region holds code, not its stub (a solution)" });
    } catch (error) {
      problems.push({ commit, path, why: `its @student regions can't be read: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return problems;
}

/** Every file of a tree-ish, read lazily (and each blob only once, whichever commit it's in). */
function treeFiles(treeish: string, blobs: Map<string, string>): Map<string, () => string> {
  const files = new Map<string, () => string>();
  for (const line of git(["ls-tree", "-r", "--full-tree", treeish]).split("\n")) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
    if (!match) continue;
    const [, sha, path] = match;
    files.set(path, () => {
      let text = blobs.get(sha);
      if (text === undefined) blobs.set(sha, (text = git(["cat-file", "blob", sha])));
      return text;
    });
  }
  return files;
}

/** The problems in each commit (or in the index, for --index). */
export function check(what: string): Problem[] {
  const blobs = new Map<string, string>();
  if (what === "--index") return checkTree("(staged)", treeFiles(git(["write-tree"]).trim(), blobs));
  const commits =
    what === "--all" ? git(["rev-list", "HEAD"]) : what.startsWith("--history=") ? git(["rev-list", what.slice("--history=".length)]) : what.includes("..") ? git(["rev-list", what]) : git(["rev-parse", what]);
  return commits
    .split("\n")
    .filter(Boolean)
    .flatMap((commit) => checkTree(commit.slice(0, 12), treeFiles(commit, blobs)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const what = process.argv[2] === "--history" ? `--history=${process.argv[3]}` : (process.argv[2] ?? "HEAD");
  const problems = check(what);
  if (problems.length === 0) {
    console.log(`check-stubs: ${what === "--all" ? "every commit" : what}: no solutions, no instructor files, no unreleased weeks.`);
  } else {
    for (const p of problems) console.error(`✗ ${p.commit} ${p.path}: ${p.why}`);
    console.error(`\ncheck-stubs: ${problems.length} problem${problems.length === 1 ? "" : "s"}. Nothing with these may go to the public repository.`);
    process.exit(1);
  }
}
