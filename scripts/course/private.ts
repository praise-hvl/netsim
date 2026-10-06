// `npm run private -- <command>`: the instructor's private files, backed up to a private repository.
// They sit at their normal places in Praise's copy (teacher/, solutions/, the unreleased weeks, …),
// hidden from the public repo, and a second git directory (.private.git) keeps them:
//
//   init <url>      start the private side here, pushing to <url> (a private GitHub repo)
//   save [message]  commit every private file and push it
//   restore <url>   on a new laptop: bring the private files back from <url>
//   status          what would be saved
//
// "Private" is the same list the leak check refuses (scripts/course/private-paths.ts): only files
// the public repo ignores, so nothing public is ever saved twice.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { released } from "./exclude";
import { privateReason } from "./private-paths";

export const PRIVATE_GIT = ".private.git";
const git = (args: string[], input?: string) => execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 }).trim();
const priv = (args: string[], input?: string) => git([`--git-dir=${PRIVATE_GIT}`, "--work-tree=.", ...args], input);

/** Files on disk that the public repo ignores and the leak check calls private (not generated ones). */
export function privateFiles(): string[] {
  const week = released();
  return git(["ls-files", "--others", "--ignored", "--exclude-standard", "--", ".", ":(exclude)node_modules", ":(exclude).next", ":(exclude)out", `:(exclude)${PRIVATE_GIT}`])
    .split("\n")
    .filter((path) => path && path !== "programs/bundle.ts" && !path.startsWith("node_modules/") && privateReason(path, week) !== "");
}

function configure(): void {
  priv(["config", "core.bare", "false"]);
  priv(["config", "status.showUntrackedFiles", "no"]);
}

function save(message: string): void {
  const files = privateFiles();
  // A week released since the last save is public now: the private side stops keeping it.
  const week = released();
  const nowPublic = priv(["ls-files"]).split("\n").filter((path) => path && privateReason(path, week) === "");
  if (nowPublic.length) priv(["rm", "-q", "--cached", "--pathspec-from-file=-"], nowPublic.join("\n"));
  priv(["add", "-u"]); // changed and deleted files it already keeps
  if (files.length) priv(["add", "-f", "--pathspec-from-file=-"], files.join("\n"));
  const staged = priv(["diff", "--cached", "--name-only"]);
  if (!staged) console.log("Nothing new to save.");
  else {
    priv(["-c", "user.useConfigOnly=false", "commit", "-q", "-m", message]);
    console.log(`Saved ${staged.split("\n").length} changed file(s).`);
  }
  if (priv(["remote"]).includes("origin")) {
    priv(["push", "-q", "origin", "HEAD:main"]);
    console.log("Pushed to the private repository.");
  }
}

function main(): void {
  const [command, arg] = process.argv.slice(2);
  if (command === "init") {
    if (existsSync(PRIVATE_GIT)) throw new Error(`${PRIVATE_GIT} already exists`);
    git(["init", "-q", "--bare", "-b", "main", PRIVATE_GIT]);
    configure();
    if (arg) priv(["remote", "add", "origin", arg]);
    save("Private files");
  } else if (command === "save") {
    save(arg ?? `Save ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  } else if (command === "restore") {
    if (!arg) throw new Error("restore needs the private repository's URL");
    if (existsSync(PRIVATE_GIT)) throw new Error(`${PRIVATE_GIT} already exists`);
    git(["clone", "-q", "--bare", arg, PRIVATE_GIT]);
    configure();
    priv(["checkout", "-f", "main", "--", "."]);
    console.log("The private files are back. Now: npm run instructor:setup");
  } else if (command === "status") {
    console.log(privateFiles().join("\n") || "(no private files)");
  } else {
    console.log("npm run private -- init <url> | save [message] | restore <url> | status");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
