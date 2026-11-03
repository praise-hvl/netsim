#!/usr/bin/env node
// NetSim Studio, week 1: gets a laptop ready for the course, one step at a time. Once that's done,
// running it again gets the next week's work (fetch, merge, push, install, check), every week.
//
//   The first time (before the course folder exists), from the course's current week (its default branch):
//   macOS:   curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -o setup.mjs && node setup.mjs
//   Windows: irm https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -OutFile setup.mjs; node setup.mjs
//   Every class after that, inside the course folder: npm start  (npm start -- --week N for an earlier week)
//   Again, inside the course folder: npm run setup
//
//   node setup.mjs              the studio: a local page in your browser where you type each command
//   node setup.mjs --terminal   the same steps, in this terminal
//   add --dry-run               commands are typed but never run (add --fresh to pretend nothing is set up yet)
//   add --setup                 the week-1 setup steps, even when setup is already done
//
// Every step checks first. If it's already done you see ✓ and press Enter to go on. If not, you
// type the command yourself (it's shown in grey), and the step checks again after it runs.
// No dependencies: only Node's built-in modules, so it runs before the course repo exists.
// @ts-check
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants as fsConstants, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STARTER = "praiseisaac/netsim";
/** The course's repository before it became one repo (week branches): a copy of it is an old copy. */
export const LEGACY_STARTER = "praiseisaac/netsim-starter";
export const STARTER_URL = `https://github.com/${STARTER}.git`;
/** The repository's name: a student's fork has it too (ada/netsim). */
const REPO_NAME = STARTER.split("/")[1];
/** The Mac's folder picker, in front of the browser; it prints the chosen folder, or nothing if cancelled. */
export const MAC_PICK_FOLDER = [
  "on run argv",
  'tell application "System Events"',
  "activate",
  "try",
  "return POSIX path of (choose folder with prompt (item 2 of argv) default location (POSIX file (item 1 of argv)))",
  "on error",
  'return ""',
  "end try",
  "end tell",
  "end run",
];

/**
 * The program that shows the computer's folder picker: the Mac app's own (NETSIM_PICK_FOLDER, which
 * prints the chosen folder; the app sets it), else osascript, PowerShell or zenity.
 * @param {Platform} platform @param {string} initial @param {string} prompt
 * @returns {[string, string[]]}
 */
export function pickFolderCommand(platform, initial, prompt, env = process.env) {
  if (env.NETSIM_PICK_FOLDER) return [env.NETSIM_PICK_FOLDER, [initial, prompt]];
  return platform === "mac"
    ? ["osascript", [...MAC_PICK_FOLDER.flatMap((line) => ["-e", line]), initial, prompt]]
    : platform === "windows"
      ? ["powershell", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = $args[1]; $d.SelectedPath = $args[0]; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }", initial, prompt]]
      : ["zenity", ["--file-selection", "--directory", `--title=${prompt}`, `--filename=${initial.replace(/\/?$/, "/")}`]];
}

/** Where the board's server (Next.js, what `npm run dev` serves) shows the board. */
export const BOARD_URL = "http://localhost:3005/board";

/**
 * What `npm run dev:all` runs, as fixed commands the studio can start and stop itself: the demo
 * programs first (once), then the bus, the components and the board's server, from the course
 * folder's own packages (no npx, no shell).
 * @param {string} dir
 * @returns {{ programs: [string[], string], servers: [string[], string][] }}
 */
export function boardCommands(dir) {
  const tsx = join(dir, "node_modules", "tsx", "dist", "cli.mjs");
  const next = join(dir, "node_modules", "next", "dist", "bin", "next");
  return {
    programs: [[process.execPath, tsx, "scripts/programs-bundle.ts"], dir],
    servers: [
      [[process.execPath, tsx, "bus/start.ts"], dir],
      [[process.execPath, tsx, "components/run.ts", "memory", "cpu", "host"], dir],
      [[process.execPath, next, "dev", "-p", "3005"], dir],
    ],
  };
}

/**
 * A week's checks: week 1's is the doctor, every other week's is its tests.
 * @param {string} dir
 * @param {number} week
 * @returns {[string[], string]}
 */
export function checkCommand(dir, week) {
  if (week === 1) return [[process.execPath, join(dir, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/doctor.ts"], dir];
  return [[process.execPath, join(dir, "node_modules", "vitest", "vitest.mjs"), "run", `tests/week-${String(week).padStart(2, "0")}`], dir];
}
/**
 * This studio's version. On start it looks at the newest published week: a newer studio there
 * runs instead (see newerStudio), so every student uses the same one, whatever week their folder has.
 */
export const STUDIO_VERSION = 19;
/**
 * The course's weeks, in order. weeks.json in the course is the list the studio shows (read from
 * GitHub on start, so a new title shows up without a new studio); this copy is the fallback offline.
 * A week counts as out when its tag (week-N, on the course's main) is published.
 * @typedef {{ week: number, title: string, kind?: string, guide?: string | null, page?: string | null, note?: string | null, board?: boolean }} CourseWeek
 * @type {CourseWeek[]}
 */
export const COURSE_WEEKS = [
  { week: 1, title: "Setup & system roles", kind: "setup", guide: "docs/weeks/week-01.md", page: "docs/weeks/week-01.html", note: "docs/notes/week-01.md", board: false },
  { week: 2, title: "Design: the machine and its bus", kind: "design", guide: "docs/weeks/week-02.md", page: "docs/weeks/week-02.html", note: "docs/notes/week-02.md", board: false },
  { week: 3, title: "Build: bus + memory on screen", kind: "build", guide: "docs/weeks/week-03.md", page: "docs/weeks/week-03.html", note: null, board: true },
  { week: 4, title: "Build: decode and encode (in week 5)", kind: "design", guide: "docs/weeks/week-04.md", page: "docs/weeks/week-04.html", note: null, board: false },
  { week: 5, title: "Design + build: a CPU that runs programs", kind: "build", guide: "docs/weeks/week-05.md", page: "docs/weeks/week-05.html", note: null, board: true },
  { week: 6, title: "Build: taking turns and interrupts", kind: "design", guide: "docs/weeks/week-06.md", page: "docs/weeks/week-06.html", note: null, board: false },
  { week: 7, title: "Build: many cores on the board", kind: "build", guide: "docs/weeks/week-07.md", page: "docs/weeks/week-07.html", note: null, board: true },
  { week: 8, title: "Demo: ship it", kind: "demo", guide: "docs/weeks/week-08.md", page: "docs/weeks/week-08.html", note: null, board: true },
];
/**
 * The newest week fetched from the course (upstream/week-N, from the course's week-N tag): where a
 * new student's work branch starts, so someone setting up in week 3 starts from week 3.
 * @param {Context} ctx
 * @param {string} dir
 */
function newestFetchedWeek(ctx, dir) {
  const refs = output(ctx, ["git", "for-each-ref", "--format=%(refname:short)", "refs/remotes/upstream/"], dir) ?? "";
  const weeks = [...refs.matchAll(/^upstream\/week-(\d+)$/gm)].map((m) => Number(m[1]));
  return `week-${weeks.length ? Math.max(...weeks) : 1}`;
}
/**
 * What `remote.upstream.fetch` is so every released week comes down: the course tags each week
 * (week-1, week-2, …) on its main, and they arrive as upstream/week-N. A fix to a released week
 * moves its tag forward, so `+`. The doctor checks the same.
 */
export const UPSTREAM_WEEKS = "+refs/tags/week-*:refs/remotes/upstream/week-*";
const HOMEBREW_INSTALL = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
const REOPEN_TERMINAL = "Close and reopen the terminal, then run `node setup.mjs` again (new programs only show up in a new terminal).";
const WEEK1_GUIDE = `https://github.com/${STARTER}/blob/HEAD/docs/weeks/week-01.md`;
// Every time the studio starts codex: no update check, which would add a network wait (and a prompt).
const CODEX_FLAGS = ["-c", "check_for_update_on_startup=false"];

/**
 * @typedef {{ code: number, stdout: string, stderr: string }} RunResult
 * @typedef {"mac" | "windows" | "linux"} Platform
 * @typedef {{ done: boolean, found: string, ask?: string, items?: { check: string, found: string, fix: string }[] }} CheckResult
 *   `found` is one plain line. `ask` is a yes/no question the student answers before the step counts as done.
 * @typedef {{
 *   display: string,
 *   argv: string[],
 *   cwd?: string,
 *   what?: string,
 *   words?: [string, string][],
 *   label?: string,
 *   waitFor?: "browser" | "window" | "terminal",
 *   openUrl?: boolean,
 *   judge?: (result: RunResult) => CheckResult,
 *   note?: string,
 *   slowNote?: string,
 *   slowAfterMs?: number,
 *   timeoutMs?: number,
 *   record?: (ctx: Context, output: string) => void,
 *   stop?: boolean,
 * }} Command
 *   `display` is what the student types; `argv` is what actually runs. `what` is "what this does" in one
 *   line and `words` explains the terms in it. `waitFor`: the student finishes in the browser, in a window
 *   that pops up, or in a real terminal (commands that ask for the Mac password). `judge` decides the step
 *   from the command's output instead of checking again. `note` is shown while it runs (and `slowNote`
 *   once it has taken `slowAfterMs`); `timeoutMs` stops it; `record` keeps something from its output.
 *   `stop`: when its judge says not done, that's where the student stops for today (Try again isn't the next thing).
 * @typedef {{ name: string, label: string, hint?: string, placeholder?: string, type?: string }} Field
 * @typedef {{ kind: "command", command: Command | ((ctx: Context) => Command) }
 *   | { kind: "auto", command: Command }
 *   | { kind: "form", fields: Field[], button: string, submit: (ctx: Context, values: Record<string, string>) => { error?: string, commands?: Command[], found?: string } }
 *   | { kind: "choice", question: string, links: { label: string, url: string }[], yes: string, submit: (ctx: Context) => void }
 *   | { kind: "folder", label: string, hint: string, initial: (ctx: Context) => string, submit: (ctx: Context, value: string, options?: { create?: string }) => string | null | { missing: string } }} Action
 *   A folder's submit returns { missing } for a folder that doesn't exist; called again with create set to that
 *   same path (the student said yes), it makes it.
 *   `auto` runs without typing (the student has nothing to do; the studio shows what it ran).
 * @typedef {{ bold: (s: string) => string, dim: (s: string) => string, green: (s: string) => string, red: (s: string) => string, yellow: (s: string) => string }} Style
 * @typedef {{
 *   id: string,
 *   title: string,
 *   technical: string,
 *   explain: string,
 *   why: string,
 *   optional?: boolean,
 *   diagram?: boolean,
 *   example: string,
 *   check: (ctx: Context) => Promise<CheckResult>,
 *   confirm?: (ctx: Context, yes: boolean) => void,
 *   pretend?: (ctx: Context) => CheckResult | void,
 *   preview?: string[],
 *   changeable?: boolean,
 *   accountChange?: (ctx: Context) => boolean,
 *   plan: (ctx: Context) => Action[],
 *   hint: (ctx: Context) => string,
 * }} Step
 *   `title` is a plain question or task, `technical` its technical name, and `explain` says what that
 *   name means in one line. `accountChange`: this step offers "Use a different account" right now. `example` is what a dry run shows once the step "passes", and `pretend`
 *   fills in what a real run would have learned; it can return a question to ask first (the GitHub login).
 * @typedef {{ done: Promise<number>, kill: () => void }} Running
 * @typedef {{
 *   kind: string, display?: string, what?: string, words?: [string, string][], label?: string, waitFor?: string,
 *   pasteOk?: boolean, runs?: string, cwd?: string, fields?: Field[], button?: string, question?: string,
 *   links?: { label: string, url: string }[], yes?: string, hint?: string, initial?: string,
 * }} ActionView
 *   One action as the page sees it: a command to type, a form, a question or a folder.
 * @typedef {[type: string, from: string, to: string, address?: number, value?: number]} TraceEvent
 * @typedef {[phase: string, pc: number, instruction: string | null, process: string | null, inHandler: number]} TraceCore
 * @typedef {{ t: number, e: TraceEvent[], c: TraceCore[], p: [string, string][], q: number, led: number, d: number, b: string, n: number }} TraceTick
 *   One tick of the machine replay: its bus messages, each core, each process, and the devices.
 * @typedef {{ about: string, parts: Record<string, string>, ticks: TraceTick[] }} MachineTrace
 * @typedef {{
 *   platform: Platform,
 *   cwd: string,
 *   dryRun: boolean,
 *   fresh?: boolean,
 *   color: boolean,
 *   style: Style,
 *   capture: (argv: string[], cwd?: string, options?: { timeout?: number }) => RunResult | null,
 *   env?: Record<string, string | undefined>,
 *   execute: (argv: string[], cwd?: string) => number,
 *   stream?: (argv: string[], cwd: string | undefined, onData: (text: string) => void) => Running,
 *   openUrl?: (url: string) => void,
 *   openTerminal?: (command: Command) => void,
 *   httpStatus?: (url: string) => Promise<number>,
 *   pickFolder?: (initial: string, prompt: string) => Promise<string | null>,
 *   ask: (question: string) => Promise<string>,
 *   print: (line: string) => void,
 *   exists: (path: string) => boolean,
 *   isDir?: (path: string) => boolean,
 *   rename?: (from: string, to: string) => void,
 *   mkdir?: (path: string) => void,
 *   mtime?: (path: string) => number | null,
 *   readText: (path: string) => string | null,
 *   save?: () => void,
 *   state: { madeFolder?: string, movedOld?: string, login?: string, seenLogin?: string, parent?: string, repoDir?: string, chatgpt?: string, doctorOk?: boolean, refused?: { dir: string, why: string }, codexVersion?: string, agentThreads?: Record<string, string>, dryDone?: Record<string, boolean>, dryFound?: Record<string, string> },
 * }} Context
 */

// ── Showing and typing commands ────────────────────────────────────────────

/**
 * ANSI styles, or plain text when colour is off (NO_COLOR, or output isn't a terminal).
 * @param {boolean} color
 * @returns {Style}
 */
export function makeStyle(color) {
  /** @param {number} open @param {number} close */
  const wrap = (open, close) => (/** @type {string} */ text) => (color ? `\x1b[${open}m${text}\x1b[${close}m` : text);
  return { bold: wrap(1, 22), dim: wrap(2, 22), green: wrap(32, 39), red: wrap(31, 39), yellow: wrap(33, 39) };
}

/**
 * Compare what was typed with the command: extra spaces and ' vs " don't matter.
 * @param {string} text
 */
export function normalizeCommand(text) {
  return text.trim().replace(/\s+/g, " ").replace(/'/g, '"');
}

/**
 * Index of the first character where two (normalized) lines differ, or -1 if they're equal.
 * @param {string} typed
 * @param {string} expected
 */
export function firstDifference(typed, expected) {
  if (typed === expected) return -1;
  let i = 0;
  while (i < typed.length && i < expected.length && typed[i] === expected[i]) i++;
  return i;
}

/**
 * The "you typed / expected" message, with ^ under the first difference.
 * @param {string} typedRaw
 * @param {string} expectedRaw
 */
export function mismatchMessage(typedRaw, expectedRaw) {
  const typed = normalizeCommand(typedRaw);
  const expected = normalizeCommand(expectedRaw);
  const at = firstDifference(typed, expected);
  return [`  you typed: ${typed}`, `  expected:  ${expected}`, `             ${" ".repeat(at)}^ first difference`].join("\n");
}

// ── The studio's command line (these functions also run in the browser, copied into the page) ──

/**
 * Short commands are typed by hand; only long ones (the Homebrew installer) may be pasted.
 * @param {string} expected
 */
export function pasteAllowed(expected) {
  return expected.length > 50;
}

/**
 * A fresh command line: nothing typed yet, no wrong character.
 * @param {string} expected
 * @returns {{ expected: string, typed: string, wrong: string }}
 */
export function lineStart(expected) {
  return { expected, typed: "", wrong: "" };
}

/**
 * One key on the command line. A matching character is added; a wrong one is held (shown red) and
 * blocks everything until Backspace removes it. ' and " count as the same.
 * @param {{ expected: string, typed: string, wrong: string }} line
 * @param {string} key  a single character, or "Backspace"
 */
export function lineKey(line, key) {
  if (key === "Backspace") return line.wrong ? { ...line, wrong: "" } : { ...line, typed: line.typed.slice(0, -1) };
  if (key.length !== 1 || line.wrong) return line;
  const want = line.expected[line.typed.length];
  const quote = (/** @type {string | undefined} */ c) => c === '"' || c === "'";
  if (want !== undefined && (key === want || (quote(key) && quote(want)))) return { ...line, typed: line.typed + want };
  return { ...line, wrong: key };
}

/**
 * Pasting: refused for short commands; for long ones, the text is typed in one go.
 * @param {{ expected: string, typed: string, wrong: string }} line
 * @param {string} text
 * @returns {{ line: { expected: string, typed: string, wrong: string }, blocked: boolean }}
 */
export function linePaste(line, text) {
  if (!pasteAllowed(line.expected)) return { line, blocked: true };
  let next = line;
  for (const ch of text.replace(/[\r\n]+$/, "").replace(/[\r\n]/g, " ")) next = lineKey(next, ch);
  return { line: next, blocked: false };
}

/** @param {{ expected: string, typed: string, wrong: string }} line */
export function lineComplete(line) {
  return line.wrong === "" && line.typed === line.expected;
}

/**
 * What Enter does on the current step, or null when it does nothing yet.
 * @param {string} phase  checking | ready | confirm | running | waiting | passed | failed
 * @param {string} actionKind  the kind of the action waiting for the student ("" if none)
 * @param {boolean} lineDone  the command line is typed out completely
 */
export function enterAction(phase, actionKind, lineDone) {
  if (phase === "passed") return "next";
  if (phase === "failed") return "retry";
  if (phase === "waiting") return "recheck";
  if (phase === "confirm") return "yes";
  if (phase === "ready" && actionKind === "command") return lineDone ? "run" : null;
  if (phase === "ready" && (actionKind === "form" || actionKind === "folder" || actionKind === "choice")) return "submit";
  return null;
}

/**
 * Terminal output made readable: no colour codes, and a progress bar that redraws with \r keeps only its last state.
 * @param {string} text
 */
export function cleanOutput(text) {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.split("\r").filter((part) => part !== "").pop() ?? "")
    .join("\n");
}

/**
 * The one-line summary under a running command: its last line with something in it.
 * @param {string} text
 */
export function lastLine(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines[lines.length - 1] ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

// ── Remotes and credentials (setup can't import scripts/doctor.ts, so parseRemote is a copy) ──

/**
 * OWNER/REPO from any GitHub URL form, or null.
 * @param {string} url
 * @returns {{ protocol: "https" | "ssh", host: string, owner: string, repo: string } | null}
 */
export function parseRemote(url) {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (https) return { protocol: "https", host: https[1], owner: https[2], repo: https[3] };
  const sshUrl = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshUrl) return { protocol: "ssh", host: sshUrl[1], owner: sshUrl[2], repo: sshUrl[3] };
  const scp = /^(?:[^@/:]+@)?([^/:\\]{2,}):([^/]+)\/([^/]+)$/.exec(trimmed);
  if (scp) return { protocol: "ssh", host: scp[1], owner: scp[2], repo: scp[3] };
  return null;
}

/**
 * Is Codex signed in? `codex login status`, which reads whichever store this laptop uses.
 * @param {Context} ctx
 */
export function codexSignedIn(ctx) {
  // Codex keeps its sign-in in the keychain or in auth.json: ask it (once it has run, so a Mac's first-run
  // check is out of the way), and only fall back to the file before that.
  if (ctx.state.codexVersion) {
    const r = ctx.capture(["codex", ...CODEX_FLAGS, "login", "status"]);
    if (r) return r.code === 0;
  }
  return ctx.exists(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"));
}

/**
 * Does git sign in to github.com through gh? Only `gh auth setup-git` sets that up. Apple's and
 * Homebrew's git come with osxkeychain as the general helper, which asks for a password the first
 * time, and GitHub doesn't accept passwords: so that one doesn't count.
 * @param {Context} ctx
 */
export function gitUsesGh(ctx) {
  const helpers = ctx.capture(["git", "config", "--global", "--get-all", "credential.https://github.com.helper"])?.stdout ?? "";
  return helpers.split("\n").some((line) => line.includes("gh auth git-credential"));
}

// ── Small helpers the steps share ──────────────────────────────────────────

/**
 * Output of a command that succeeded, or null.
 * @param {Context} ctx
 * @param {string[]} argv
 * @param {string} [cwd]
 */
function output(ctx, argv, cwd) {
  const result = ctx.capture(argv, cwd);
  return result && result.code === 0 ? result.stdout.trim() : null;
}

/** @param {Context} ctx */
const repoDir = (ctx) => ctx.state.repoDir ?? ctx.cwd;

/**
 * Is `program` installed (somewhere on PATH)? Looks, without running it.
 * @param {Context} ctx
 * @param {string} program
 */
export function onPath(ctx, program) {
  const names = ctx.platform === "windows" ? [`${program}.cmd`, `${program}.exe`, program] : [program];
  return (process.env.PATH ?? "").split(delimiter).some((dir) => dir && names.some((name) => ctx.exists(join(dir, name))));
}

/**
 * A path with the home folder shown as ~, the way the student thinks of it.
 * @param {string} path
 */
export function tildify(path) {
  const home = homedir();
  return path === home ? "~" : path.startsWith(home + "/") || path.startsWith(home + "\\") ? `~${path.slice(home.length)}` : path;
}

/**
 * @param {string} display
 * @param {string[]} argv
 * @param {Partial<Command>} [more]
 * @returns {Action}
 */
const cmd = (display, argv, more = {}) => ({ kind: "command", command: { display, argv, ...more } });

/** @type {[string, string][]} */
const BREW_WORDS = [["brew", "Homebrew, the Mac's installer for developer tools"], ["install", "download and set up a program"]];

/**
 * Homebrew's `brew`, even if a fresh install isn't on PATH yet.
 * @param {Context} ctx
 */
function brew(ctx) {
  for (const path of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) if (ctx.exists(path)) return path;
  return output(ctx, ["brew", "--version"]) ? "brew" : null;
}

/**
 * On a Mac without Homebrew, installing it comes first, as its own typed command (long, so it may be pasted).
 * @param {Context} ctx
 * @param {string} formula
 * @param {string} what
 * @returns {Action[]}
 */
function withBrew(ctx, formula, what) {
  const b = brew(ctx);
  if (b) return [cmd(`brew install ${formula}`, [b, "install", ...formula.split(" ")], { what, words: formula.startsWith("--cask") ? [...BREW_WORDS, ["--cask", "a full app (with a window), not just a command"]] : BREW_WORDS })];
  return [
    cmd(HOMEBREW_INSTALL, ["/bin/bash", "-c", HOMEBREW_INSTALL], {
      label: "First: install Homebrew",
      what: "Downloads Homebrew's installer and runs it. It asks for your Mac password, so it opens in a Terminal window.",
      words: [["Homebrew", "the Mac's installer for developer tools; the next steps use it"], ["curl", "downloads a file from the web"], ["bash", "runs a script of terminal commands"]],
      waitFor: "terminal",
    }),
  ];
}

/**
 * @param {string} id
 * @param {string} what
 */
const winget = (id, what) =>
  cmd(`winget install --id ${id} -e`, ["winget", "install", "--id", id, "-e", "--accept-source-agreements", "--accept-package-agreements"], {
    what,
    words: [["winget", "Windows' installer for programs"], ["-e", "exactly this program, not a similar name"]],
  });

/**
 * The GitHub account gh is using now, or null.
 * @param {Context} ctx
 */
function ghLogin(ctx) {
  return output(ctx, ["gh", "api", "user", "--jq", ".login"]);
}

/**
 * Is this a possible GitHub username? Letters, digits and single hyphens, not at either end, at
 * most 39 characters. Only names that pass this ever go into a command the studio plans.
 * @param {unknown} name
 * @returns {name is string}
 */
export function isGithubUsername(name) {
  return typeof name === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(name);
}

/**
 * The github.com accounts gh knows, from `gh auth status`. Newer gh (2.40+) lists every account,
 * "Logged in to github.com account NAME" with an "Active account: true/false" line; older gh has
 * one, "Logged in to github.com as NAME". An account whose sign-in failed isn't listed: switching
 * to it wouldn't work.
 * @param {string} text  what gh printed (it writes to stderr or stdout, depending on the version)
 * @returns {{ login: string, active: boolean }[]}
 */
export function parseGhAccounts(text) {
  /** @type {{ login: string, active: boolean }[]} */
  const accounts = [];
  /** @type {{ login: string, active: boolean } | null} */
  let last = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const account = /Logged in to (\S+) (?:account|as) (\S+)/.exec(line);
    if (account) {
      last = null;
      if (/^(?:X|✗|×)\s/.test(line) || /Failed to log in/i.test(line)) continue;
      if (account[1].toLowerCase() !== "github.com" || !isGithubUsername(account[2])) continue;
      if (accounts.some((a) => a.login.toLowerCase() === account[2].toLowerCase())) continue;
      last = { login: account[2], active: false };
      accounts.push(last);
      continue;
    }
    const active = /Active account:\s*(true|false)/i.exec(line);
    if (active && last) last.active = active[1].toLowerCase() === "true";
  }
  // Older gh: one account, and no "Active account" line, so that one is in use.
  if (accounts.length === 1 && !/Active account:/i.test(text)) accounts[0].active = true;
  return accounts;
}

/**
 * Every github.com account gh knows on this laptop.
 * @param {Context} ctx
 */
export function ghAccounts(ctx) {
  const result = ctx.capture(["gh", "auth", "status", "-h", "github.com"]);
  // gh exits 1 when any account has a problem, and still lists the others.
  return result ? parseGhAccounts(`${result.stdout}\n${result.stderr}`) : [];
}

/**
 * The token this terminal gives gh, by name: GH_TOKEN, else GITHUB_TOKEN (gh uses it instead of the
 * accounts it's signed in to), or null. Never its value.
 * @param {Context} ctx
 * @returns {"GH_TOKEN" | "GITHUB_TOKEN" | null}
 */
export function ghTokenVar(ctx) {
  const env = ctx.env ?? process.env;
  return env.GH_TOKEN ? "GH_TOKEN" : env.GITHUB_TOKEN ? "GITHUB_TOKEN" : null;
}

/** Whose each token is, asked of GitHub once per token (kept only in memory). @type {Map<string, string | null>} */
const tokenLogins = new Map();

/**
 * The account gh (and so git) uses now. With a token in this terminal, that's the token's account
 * (asked of GitHub once); otherwise gh's own setting, read without going to GitHub, so the studio
 * can show it at any time.
 * @param {Context} ctx
 */
export function ghActiveAccount(ctx) {
  const name = ghTokenVar(ctx);
  if (name) {
    const token = /** @type {string} */ ((ctx.env ?? process.env)[name]);
    if (!tokenLogins.has(token)) tokenLogins.set(token, ghLogin(ctx));
    const login = tokenLogins.get(token);
    return isGithubUsername(login) ? login : null;
  }
  const user = output(ctx, ["gh", "config", "get", "-h", "github.com", "user"]);
  return isGithubUsername(user) ? user : null;
}

/**
 * git, as the studio runs it for GitHub (fetch, push): with a token in this terminal, gh is git's
 * only credential helper, so git acts as the token's account too (not whatever the keychain holds).
 * @param {Context} ctx
 * @param {string[]} args
 */
export function gitArgv(ctx, args) {
  return ghTokenVar(ctx) ? ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", ...args] : ["git", ...args];
}

/**
 * What the folder's own git config (which the agent can write) could make a network git command run
 * or reach instead of GitHub: a rewritten address (url.*.insteadOf, a push URL), a program for the
 * remote end (uploadpack/receivepack/proxy), a credential helper, an askpass or ssh command, or (for
 * a push) a hooks folder: the reason the studio won't run it, or null.
 * @param {Context} ctx
 * @param {string} dir
 * @param {{ push?: boolean }} [options]
 */
export function networkRefusal(ctx, dir, { push = false } = {}) {
  const r = ctx.capture(["git", "config", "--list", "--show-scope"], dir, { timeout: 5000 });
  if (!r || r.code !== 0) return null; // not a git folder yet: nothing of its own to read
  const local = r.stdout.split("\n").filter((line) => /^(local|worktree)\t/.test(line)).map((line) => line.slice(line.indexOf("\t") + 1));
  const risky = local.find((e) => /^(url\..*\.(insteadof|pushinsteadof)=|remote\.[^=]*\.(pushurl|uploadpack|receivepack|proxy|vcs)=|credential\.[^=]*helper=|core\.(askpass|sshcommand|gitproxy)=|[^=]*command=)/i.test(e) || (push && /^core\.hookspath=/i.test(e)));
  if (risky) return `This folder's git settings (.git/config: ${risky.split("=")[0]}) could send git somewhere else or run a program, so the studio won't do it: check .git/config, or run it in the terminal.`;
  if (push) {
    // git pushes to every url origin has: exactly one, and it's GitHub's.
    const urls = local.filter((e) => /^remote\.origin\.url=/i.test(e)).map((e) => e.split("=").slice(1).join("="));
    if (urls.length > 1) return `origin has ${urls.length} addresses (${urls.join(", ")}), and git would push to all of them, so the studio won't push: keep only GitHub's (git remote set-url origin <it>).`;
    const url = urls[0] ?? "";
    const named = /^https:\/\/[^/@]+@github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url);
    if (named) return `origin has a user name in its address (${url}), so the studio won't push there. Take it out: git remote set-url origin https://github.com/${named[1]}/${named[2]}.git`;
    if (!originKind(url)) return `origin isn't a GitHub address (${url || "none"}), so the studio won't push there: check it with git remote -v.`;
  }
  return null;
}

/**
 * How the student's fork is reached: "https" (https://github.com/owner/repo), "ssh"
 * (git@github.com:owner/repo or ssh://git@github.com/owner/repo), or null for anything else.
 * @param {string} url
 */
export function originKind(url) {
  if (/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+?(\.git)?\/?$/.test(url)) return "https";
  if (/^(git@github\.com:|ssh:\/\/git@github\.com\/)[A-Za-z0-9-]+\/[A-Za-z0-9._-]+?(\.git)?\/?$/.test(url)) return "ssh";
  return null;
}

/** The folder's origin address, as its own config has it ("" without one). @param {Context} ctx @param {string} dir */
function originUrl(ctx, dir) {
  return ctx.capture(["git", "config", "--local", "--get-all", "remote.origin.url"], dir, { timeout: 5000 })?.stdout.trim() ?? "";
}

/**
 * Git talking to GitHub from outside the sandbox: https only (ssh too for a fork reached by ssh, with
 * the system's ssh), no hooks, no fsmonitor, no askpass. The course's repository (upstream) is
 * public: it's reached at its address, never through the folder's remote config, with no
 * credentials. The student's fork (origin) signs in with gh's helper only. A local file:// copy is
 * allowed only in a rehearsal or a test (NETSIM_FILE_REMOTES=1 in the studio's environment): pushing
 * to one runs that repository's hooks.
 * @param {Context} ctx
 * @param {"upstream" | "origin"} remote
 * @param {string[]} args  with the remote's name where git would take it
 * @param {{ ssh?: boolean }} [options]  ssh: the fork is reached by ssh (originKind)
 */
export function networkGit(ctx, remote, args, { ssh = false } = {}) {
  const none = process.platform === "win32" ? "NUL" : "/dev/null";
  const file = process.env.NETSIM_FILE_REMOTES === "1" ? "always" : "never";
  // Each protocol by name too: the folder's own protocol.ext.allow=always would beat a general "never".
  const guard = ["-c", "protocol.allow=never", "-c", "protocol.ext.allow=never", "-c", `protocol.ssh.allow=${ssh && remote === "origin" ? "always" : "never"}`, "-c", "protocol.git.allow=never", "-c", "protocol.http.allow=never", "-c", "protocol.https.allow=always", "-c", `protocol.file.allow=${file}`, "-c", `core.hooksPath=${none}`, "-c", "core.fsmonitor=false", "-c", "core.askPass=", "-c", "core.sshCommand=ssh", "-c", "credential.helper="];
  if (remote === "upstream") return ["git", ...guard, ...args.map((a) => (a === "upstream" ? STARTER_URL : a))];
  return ["git", ...guard, "-c", "credential.helper=!gh auth git-credential", ...args];
}

/**
 * A push to the student's fork, guarded (networkGit); when the folder's config could send it
 * elsewhere or run a program, a command that only says why and fails.
 * @param {Context} ctx
 * @param {string[]} args
 */
function pushArgv(ctx, args) {
  const dir = ctx.state.repoDir ?? null;
  const why = dir ? networkRefusal(ctx, dir, { push: true }) : null;
  return why ? refusedCommand(why) : networkGit(ctx, "origin", args, { ssh: dir !== null && originKind(originUrl(ctx, dir)) === "ssh" });
}

/** A command that only says why the studio won't run the real one, and fails. @param {string} why */
const refusedCommand = (why) => [process.execPath, "-e", `console.error(${JSON.stringify(why)}); process.exit(1)`];

/** The fetch of the course's weeks, guarded (networkGit, networkRefusal). @param {Context} ctx @param {string | null} dir */
function fetchArgv(ctx, dir) {
  const why = dir ? networkRefusal(ctx, dir) : null;
  return why ? refusedCommand(why) : networkGit(ctx, "upstream", FETCH_UPSTREAM);
}

/** Fetching the course's weeks from upstream, by its address, into the refs `git fetch upstream` fills. */
const FETCH_UPSTREAM = ["fetch", "-q", "--no-tags", "upstream", UPSTREAM_WEEKS];

/**
 * Who the course folder's copy on GitHub (origin) belongs to, or null when there's no folder yet.
 * @param {Context} ctx
 */
function cloneOwner(ctx) {
  const dir = ctx.state.repoDir ?? findClone(ctx);
  if (!dir) return null;
  const url = output(ctx, ["git", "remote", "get-url", "origin"], dir);
  return url ? (parseRemote(url)?.owner ?? null) : null;
}

/**
 * "Your copy belongs to A; you're now B." when the folder's copy isn't this account's, else "".
 * @param {Context} ctx
 * @param {string | null | undefined} login
 */
export function ownerMismatch(ctx, login) {
  const owner = cloneOwner(ctx);
  if (!owner || !login || owner.toLowerCase() === login.toLowerCase()) return "";
  return `Your copy belongs to ${owner}; you're now ${login}.`;
}

/**
 * Switch gh (and so git) to another account it already knows.
 * @param {string} login  checked with isGithubUsername by the caller
 * @returns {Command}
 */
export function switchAccountCommand(login) {
  return {
    display: `gh auth switch --user ${login}`,
    argv: ["gh", "auth", "switch", "-h", "github.com", "--user", login],
    what: `Makes ${login} the account gh and git use on this laptop. Nothing is signed out: you can switch back the same way.`,
    words: [["auth", "sign-in (authentication)"], ["switch", "use another account gh already knows"], ["--user", "which account"]],
  };
}

/** Sign in to one more GitHub account; gh then uses it. @returns {Command} */
export function addAccountCommand() {
  return {
    display: "gh auth login",
    argv: ["gh", "auth", "login", "--web", "-h", "github.com", "-p", "https"],
    what: "Signs in to another GitHub account, next to the ones gh already knows, and makes it the one in use. The studio shows a one-time code and opens github.com: sign in there with the other account, paste the code and approve.",
    words: [["auth", "sign-in (authentication)"], ["login", "sign in (to one more account)"]],
    waitFor: "browser",
    openUrl: true,
  };
}

/**
 * The course folder, if there is one here or where the student chose to put it.
 * @param {Context} ctx
 */
function findClone(ctx) {
  // The folder you're in comes first, then a netsim folder inside it, and only then the one
  // remembered from last time (a second copy elsewhere must not win over the one you're in).
  const here = output(ctx, ["git", "rev-parse", "--show-toplevel"], ctx.cwd);
  const candidates = [here, join(ctx.cwd, "netsim"), ctx.state.repoDir ?? null, join(ctx.state.parent ?? ctx.cwd, "netsim")].filter((d) => d !== null);
  for (const dir of candidates) {
    const pkg = ctx.readText(join(dir, "package.json"));
    if (!pkg || !ctx.exists(join(dir, ".git")) || !/"name":\s*"simulated-cpu"/.test(pkg)) continue;
    const why = notACourseCopy(ctx, dir);
    if (!why) return dir;
    // Looks like the course but isn't a student's copy (the instructor's repo, another clone):
    // never adopt it, never change its branches or remotes; say so instead.
    ctx.state.refused = { dir, why };
  }
  return null;
}

/**
 * Why a folder that looks like the course (same package name) isn't a student's copy, or "" if it
 * is one: its origin must be a netsim repository (the student's fork, or the course's own), and its
 * upstream, when there is one, the course's (praiseisaac/netsim). A copy of the old starter
 * (netsim-starter, before the course became one repo) isn't one: setup makes a new copy. The instructor's
 * repo (simulated-cpu, the reference solution) is refused by its own files as well.
 * @param {Context} ctx
 * @param {string} dir
 * @returns {string}
 */
export function notACourseCopy(ctx, dir) {
  if (isInstructorRepo(ctx, dir)) return "it's the instructor's course repository, not a copy of the starter";
  /** owner/repo from any remote address: a GitHub URL, or a local path like …/ada/netsim.git. @param {string} url */
  const ownerRepo = (url) => parseRemote(url) ?? (/([^/\\:]+)[/\\]([^/\\]+?)(?:\.git)?[/\\]?$/.exec(url) ? { owner: RegExp.$1, repo: RegExp.$2 } : null);
  const originUrl = output(ctx, ["git", "remote", "get-url", "origin"], dir);
  const origin = originUrl ? ownerRepo(originUrl) : null;
  if (origin && origin.repo.toLowerCase() === LEGACY_STARTER.split("/")[1].toLowerCase()) return `it's a copy of the old starter (${LEGACY_STARTER}), from before the course moved to ${STARTER}`;
  if (!origin || origin.repo.toLowerCase() !== REPO_NAME.toLowerCase())
    return originUrl ? `its origin is ${originUrl}, not a copy of ${STARTER}` : "it has no origin on GitHub";
  const upstreamUrl = output(ctx, ["git", "remote", "get-url", "upstream"], dir);
  const upstream = upstreamUrl ? ownerRepo(upstreamUrl) : null;
  if (upstreamUrl && (!upstream || `${upstream.owner}/${upstream.repo}`.toLowerCase() !== STARTER.toLowerCase())) return `its upstream is ${upstreamUrl}, not ${STARTER}`;
  return "";
}

/**
 * Is this folder a copy of the old starter (praiseisaac/netsim-starter)? Setup then makes a new copy
 * of the course and keeps the old one as netsim-old.
 * @param {Context} ctx
 * @param {string} dir
 */
export function oldStarterCopy(ctx, dir) {
  return notACourseCopy(ctx, dir).startsWith("it's a copy of the old starter");
}

/**
 * The instructor's own repo has the same package name as a student's copy. These files exist only
 * there; week branches never carry them.
 * @param {Context} ctx
 * @param {string} dir
 */
export function isInstructorRepo(ctx, dir) {
  return ctx.exists(join(dir, "scripts", "make-week-branches.ts")) || ctx.exists(join(dir, "course", "AGENTS.student.md"));
}

/**
 * Step 9 on a laptop without the course folder: choose where, then download the fork.
 * @returns {Action[]}
 */
function cloneFresh() {
  return [
    {
      kind: "folder",
      label: "Which folder should the course go in?",
      hint: "A netsim folder is made inside it. Your home folder is fine.",
      // Running inside an old copy of the course (netsim-starter): its parent folder, not inside it.
      initial: (ctx) => ctx.state.parent ?? (oldStarterCopy(ctx, ctx.cwd) ? dirname(ctx.cwd) : ctx.cwd),
      // A folder that doesn't exist yet: the studio asks, and makes it when the student says yes.
      submit: (ctx, value, { create = "" } = {}) => {
        const path = resolve(ctx.cwd, value.trim().replace(/^~(?=$|[/\\])/, homedir()) || ".");
        if (!(ctx.isDir ?? ctx.exists)(path)) {
          if (ctx.exists(path)) return `${tildify(path)} is a file, not a folder. Pick a folder.`;
          if (create !== path) return { missing: path };
          if (!ctx.dryRun) {
            try {
              (ctx.mkdir ?? (() => { throw new Error("can't make folders here"); }))(path);
            } catch (error) {
              return `Couldn't make ${tildify(path)}: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
          ctx.state.madeFolder = path;
        }
        const there = join(path, "netsim");
        if (ctx.exists(there)) {
          // An old copy from before the course moved to one repo: keep it, under another name.
          const old = oldStarterCopy(ctx, there) ? join(path, "netsim-old") : null;
          if (!old || ctx.exists(old) || !ctx.rename) return `There's already a netsim folder in ${tildify(path)}. Pick another folder (or delete that one if it's an old attempt).`;
          try {
            ctx.rename(there, old);
          } catch {
            return `Your old copy of the course is in ${tildify(there)}, and it couldn't be renamed (is it open somewhere?). Rename it to netsim-old yourself, then try again.`;
          }
          ctx.state.movedOld = old;
        }
        ctx.state.parent = path;
        return null;
      },
    },
    {
      kind: "command",
      command: (ctx) => {
        const login = ctx.state.login ?? "<you>";
        return {
          display: `gh repo clone ${login}/${REPO_NAME} netsim`,
          argv: ["gh", "repo", "clone", `${login}/${REPO_NAME}`, "netsim"],
          cwd: ctx.state.parent ?? ctx.cwd,
          what: "Downloads your fork into a new folder called netsim, and links it to GitHub.",
          words: [["clone", "download a repository, with its history"], [`${login}/${REPO_NAME}`, "your fork"], ["netsim", "the folder to make"]],
        };
      },
    },
  ];
}

// ── The 15 steps ───────────────────────────────────────────────────────────

/** @returns {Step[]} */
export function courseSteps() {
  return [
    {
      id: "node",
      title: "Is Node installed?",
      technical: "Node 22+",
      explain: "Node runs JavaScript programs outside a browser. This studio is one of them.",
      why: "The course code, its tests and this studio all run on Node, version 22 or newer.",
      example: "Node 22 is installed (this studio runs on it).",
      check: async () => {
        const major = Number(process.versions.node.split(".")[0]);
        return { done: major >= 22, found: major >= 22 ? `Node ${process.versions.node} is installed (this studio runs on it).` : `Node ${process.versions.node} is too old: the course needs 22 or newer.` };
      },
      plan: (ctx) =>
        ctx.platform === "windows" ? [winget("OpenJS.NodeJS.LTS", "Installs Node 22 LTS.")] : ctx.platform === "mac" ? withBrew(ctx, "node@22", "Installs Node 22.") : [],
      hint: (ctx) => (ctx.platform === "windows" ? REOPEN_TERMINAL : "Install Node 22 LTS from https://nodejs.org, open a new terminal, and run this again."),
    },
    {
      id: "git",
      title: "Is git installed?",
      technical: "git",
      explain: "git records the history of your work and sends it to GitHub.",
      why: "You'll save your work with git every week, and hand it in by sending it to GitHub.",
      example: "git version 2.x is installed.",
      check: async (ctx) => {
        const version = output(ctx, ["git", "--version"]);
        return { done: version !== null, found: version ? `${version} is installed.` : "git isn't installed yet." };
      },
      plan: (ctx) =>
        ctx.platform === "windows"
          ? [winget("Git.Git", "Installs git.")]
          : brew(ctx)
            ? withBrew(ctx, "git", "Installs git with Homebrew.")
            : [
                cmd("xcode-select --install", ["xcode-select", "--install"], {
                  what: "Asks macOS to install Apple's command line tools, which include git. A window pops up: click Install.",
                  words: [["xcode-select", "manages Apple's developer tools"], ["--install", "install them"]],
                  waitFor: "window",
                }),
              ],
      hint: (ctx) => (ctx.platform === "windows" ? REOPEN_TERMINAL : "If a window popped up, finish the install there, then check again."),
    },
    {
      id: "identity",
      title: "Who should your work be signed by?",
      technical: "git identity",
      explain: "the name and email git writes on every commit (a saved point in your work's history).",
      why: "Every commit carries a name and email. Use the email on your GitHub account, so GitHub knows the work is yours.",
      example: "Your commits will be signed Ada Obi <ada@example.com>.",
      changeable: true, // already set? the student can still change the name or email
      check: async (ctx) => {
        const name = output(ctx, ["git", "config", "--global", "user.name"]);
        const email = output(ctx, ["git", "config", "--global", "user.email"]);
        return { done: Boolean(name && email), found: name && email ? `Your commits will be signed ${name} <${email}>.` : "git doesn't know your name and email yet." };
      },
      plan: () => [
        {
          kind: "form",
          button: "Save",
          fields: [
            { name: "name", label: "Your name", hint: "as it should appear on your work", placeholder: "Ada Obi" },
            { name: "email", label: "Your email", hint: "the one on your GitHub account", placeholder: "ada@example.com", type: "email" },
          ],
          submit: (_ctx, values) => {
            const name = (values.name ?? "").trim();
            const email = (values.email ?? "").trim();
            if (!name) return { error: "Type your name." };
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That doesn't look like an email address." };
            return {
              commands: [
                { display: `git config --global user.name "${name}"`, argv: ["git", "config", "--global", "user.name", name] },
                { display: `git config --global user.email "${email}"`, argv: ["git", "config", "--global", "user.email", email] },
              ],
              found: `Your commits will be signed ${name} <${email}>.`,
            };
          },
        },
      ],
      hint: () => "Both a name and an email are needed.",
    },
    {
      id: "gh",
      title: "Install the GitHub tool",
      technical: "GitHub CLI (gh)",
      explain: "gh is GitHub's tool for the terminal (CLI means command-line interface).",
      why: "gh signs you in to GitHub and makes your copy of the course, without passwords or tokens to copy around.",
      example: "gh version 2.x is installed.",
      check: async (ctx) => {
        const version = output(ctx, ["gh", "--version"]);
        return { done: version !== null, found: version ? `${version.split("\n")[0]} is installed.` : "gh isn't installed yet." };
      },
      plan: (ctx) => (ctx.platform === "windows" ? [winget("GitHub.cli", "Installs gh, GitHub's command-line tool.")] : withBrew(ctx, "gh", "Installs gh, GitHub's command-line tool.")),
      hint: (ctx) => (ctx.platform === "windows" ? REOPEN_TERMINAL : "If Homebrew was just installed, check again: the studio finds it without a new terminal."),
    },
    {
      id: "gh-login",
      title: "Sign in to GitHub",
      technical: "gh auth login",
      explain: "gh's sign-in: it opens GitHub in your browser, where you approve this laptop.",
      why: "Your copy of the course and everything you send to GitHub belong to this account.",
      example: "You're signed in to GitHub as your-github-name.",
      check: async (ctx) => {
        const login = ghLogin(ctx);
        const token = ghTokenVar(ctx);
        if (!login) return { done: false, found: token ? `This terminal's ${token} doesn't sign in to GitHub (an old or wrong token?).` : "You're not signed in to GitHub yet." };
        // A token in this terminal decides the account: gh auth switch wouldn't change it.
        const as = token ? `This terminal uses ${login} (${token}).` : `You're signed in to GitHub as ${login}.`;
        if (ctx.state.login === login) return { done: true, found: as };
        ctx.state.seenLogin = login;
        return { done: false, found: token ? as : `Signed in to GitHub as ${login}.`, ask: `Is ${login} the GitHub account you'll use for this course?` };
      },
      confirm: (ctx, yes) => {
        if (yes && ctx.state.seenLogin) ctx.state.login = ctx.state.seenLogin;
      },
      // Signed in: this is where the student changes which account the course uses.
      accountChange: (ctx) => !ghTokenVar(ctx) && ghActiveAccount(ctx) !== null,
      // A dry run still asks the account question, about a pretend login.
      pretend: (ctx) => {
        ctx.state.seenLogin = ctx.state.login ?? "your-github-name";
        return { done: false, found: `Signed in to GitHub as ${ctx.state.seenLogin}.`, ask: `Is ${ctx.state.seenLogin} the GitHub account you'll use for this course?` };
      },
      plan: () => [
        cmd("gh auth login", ["gh", "auth", "login", "--web", "-h", "github.com", "-p", "https"], {
          what: "Starts GitHub's sign-in. The studio shows a one-time code and opens github.com: paste the code there and approve.",
          words: [["gh", "GitHub's command-line tool"], ["auth", "sign-in (authentication)"], ["login", "sign in"]],
          waitFor: "browser",
          openUrl: true,
        }),
      ],
      hint: (ctx) =>
        ghTokenVar(ctx)
          ? `This terminal's ${ghTokenVar(ctx)} picks the account. For another one, run npm start in a terminal with that account's token, or without ${ghTokenVar(ctx)}.`
          : "If you have two GitHub accounts, sign in with the one for this course. Signed in to both? \"Use a different account\" in this step picks the other one.",
    },
    {
      id: "git-helper",
      title: "Let git use that sign-in",
      technical: "credential helper",
      explain: "a small program that hands git your GitHub sign-in, so git never asks for a password.",
      why: "git talks to GitHub on its own. Without this, it asks for a password, and GitHub doesn't accept passwords.",
      example: "git signs in to GitHub with your gh account.",
      check: async (ctx) => {
        const ok = gitUsesGh(ctx);
        return { done: ok, found: ok ? "git signs in to GitHub with your gh account." : "git isn't using your gh sign-in yet, so it would ask for a password." };
      },
      plan: () => [
        cmd("gh auth setup-git", ["gh", "auth", "setup-git"], {
          what: "Tells git to ask gh for your GitHub sign-in.",
          words: [["setup-git", "connect git to gh's sign-in"]],
        }),
      ],
      hint: () => "Make sure step 5 (Sign in to GitHub) is done first.",
    },
    {
      id: "chatgpt",
      title: "ChatGPT and the student offer",
      technical: "optional",
      explain: "you can do this later; nothing else depends on it today.",
      why: "The course's AI assistant is Codex, which comes with a ChatGPT account. Students can claim a free offer.",
      optional: true,
      example: "You have a ChatGPT account.",
      check: async (ctx) => ({ done: ctx.state.chatgpt === "yes", found: ctx.state.chatgpt === "yes" ? "You have a ChatGPT account." : "Not done yet." }),
      plan: () => [
        {
          kind: "choice",
          question: "Do you have a ChatGPT account, with the student offer claimed?",
          links: [
            { label: "1. Sign up or sign in at chatgpt.com", url: "https://chatgpt.com" },
            { label: "2. Claim the student offer (by October 31)", url: "https://chatgpt.com/students" },
            { label: "3. Codex credits for students", url: "https://chatgpt.com/codex/students" },
          ],
          yes: "Yes, I have it",
          submit: (ctx) => {
            ctx.state.chatgpt = "yes";
          },
        },
      ],
      hint: () => "No problem: you can finish this later. Skip it for now.",
    },
    {
      id: "fork",
      title: "Make your own copy of the course",
      technical: "fork",
      explain: "your own copy of a repository (a project and its history), on your GitHub account.",
      why: "The course's repository belongs to Praise. Your fork is yours: you send your work there every week.",
      diagram: true,
      example: "Your fork exists: github.com/your-github-name/netsim",
      check: async (ctx) => {
        const login = ctx.state.login ?? ghLogin(ctx);
        if (!login) return { done: false, found: "You're not signed in to GitHub yet (step 5)." };
        ctx.state.login = login;
        // It has to be a real fork: the starter itself (Praise's account) doesn't count.
        const info = output(ctx, ["gh", "repo", "view", `${login}/${REPO_NAME}`, "--json", "nameWithOwner,isFork", "--jq", '.nameWithOwner + " " + (.isFork|tostring)']);
        const [name, isFork] = (info ?? "").split(" ");
        if (!info) return { done: false, found: `There's no ${login}/${REPO_NAME} yet.${ownerMismatch(ctx, login) ? ` ${ownerMismatch(ctx, login)} Make a copy for ${login} below, or switch back in step 5.` : ""}` };
        return { done: isFork === "true", found: isFork === "true" ? `Your fork exists: github.com/${name}` : `github.com/${name} isn't a fork of ${STARTER}.` };
      },
      plan: () => [
        // gh would ask "clone it too?"; the studio answers No (--clone=false): step 9 does the download.
        cmd(`gh repo fork ${STARTER}`, ["gh", "repo", "fork", STARTER, "--clone=false"], {
          what: "Makes your copy on GitHub. gh asks whether to download it too: the studio answers No, because step 9 does that.",
          words: [["repo", "repository: a project folder and its history"], ["fork", "make your own copy on GitHub"], [STARTER, "the course's repository (owner/name)"]],
        }),
      ],
      hint: () => "Check you're signed in to the right account (step 5), then try again.",
    },
    {
      id: "clone",
      title: "Download it to this laptop",
      technical: "clone",
      explain: "a copy of a repository on your laptop, linked to the one on GitHub.",
      why: "You work on your laptop, in a folder called netsim, and send your work back to your fork.",
      diagram: true,
      example: "The course is at ~/netsim.",
      check: async (ctx) => {
        const dir = findClone(ctx);
        if (dir) ctx.state.repoDir = dir;
        const mismatch = dir ? ownerMismatch(ctx, ctx.state.login) : "";
        if (mismatch) return { done: false, found: `${mismatch} The folder at ${tildify(/** @type {string} */ (dir))} still sends your work to ${cloneOwner(ctx)}'s copy.` };
        if (!dir && ctx.state.refused)
          return { done: false, found: `${tildify(ctx.state.refused.dir)} isn't your copy of the course (${ctx.state.refused.why}), so the studio won't touch it. Download the course into another folder.` };
        return { done: dir !== null, found: dir ? `The course is at ${tildify(dir)}.` : "The course isn't on this laptop yet." };
      },
      plan: (ctx) => {
        const dir = findClone(ctx);
        const login = ctx.state.login;
        // The folder is here but linked to another account's copy (the student switched accounts):
        // point it at this account's copy instead of downloading again.
        if (dir && isGithubUsername(login) && ownerMismatch(ctx, login)) {
          const url = `https://github.com/${login}/${REPO_NAME}.git`;
          return [
            cmd(`git remote set-url origin ${url}`, ["git", "remote", "set-url", "origin", url], {
              cwd: dir,
              label: `Send your work to ${login}'s copy from now on`,
              what: `Points your folder's link to GitHub (origin) at ${login}/${REPO_NAME}. Your files don't change.`,
              words: [["remote", "a named link to a copy on GitHub"], ["set-url", "change where it points"], ["origin", "the link to your own copy"]],
            }),
          ];
        }
        return cloneFresh();
      },
      pretend: (ctx) => {
        (ctx.state.dryDone ??= {}).upstream = true; // gh repo clone links upstream for a fork
      },
      hint: () => "The fork has to exist first (step 8). If the netsim folder already exists, pick another folder.",
    },
    {
      id: "upstream",
      title: "Connect it to the course",
      technical: "upstream remote",
      explain: "a remote is a named link to a copy on GitHub. origin is your fork; upstream is the course.",
      why: "Each week's new work comes from the course's repository. gh already linked it when it downloaded your fork: nothing to type.",
      preview: [], // normally nothing to type (the typed fallback is only for a clone made some other way)
      diagram: true,
      example: "upstream is linked to the course: github.com/praiseisaac/netsim",
      check: async (ctx) => {
        const dir = repoDir(ctx);
        const url = output(ctx, ["git", "remote", "get-url", "upstream"], dir);
        const remote = url ? parseRemote(url) : null;
        const ok = remote !== null && `${remote.owner}/${remote.repo}`.toLowerCase() === STARTER.toLowerCase();
        if (!ok) return { done: false, found: url ? `upstream points somewhere else: ${url}` : "There's no link called upstream yet." };
        // gh links upstream for its main branch only; every released week (a tag) has to come down.
        const refspecs = (output(ctx, ["git", "config", "--get-all", "remote.upstream.fetch"], dir) ?? "").split("\n").map((l) => l.trim());
        if (!refspecs.includes(UPSTREAM_WEEKS)) return { done: false, found: "upstream is linked, but it doesn't bring the course's weeks yet." };
        const fetched = /^upstream\/week-\d+$/m.test(output(ctx, ["git", "for-each-ref", "--format=%(refname:short)", "refs/remotes/upstream/"], dir) ?? "");
        return { done: fetched, found: fetched ? `upstream is linked to the course: github.com/${STARTER}` : "upstream is linked, but the course's weeks haven't been fetched yet." };
      },
      plan: (ctx) => {
        const dir = repoDir(ctx);
        const url = output(ctx, ["git", "remote", "get-url", "upstream"], dir);
        const remote = url ? parseRemote(url) : null;
        const right = remote !== null && `${remote.owner}/${remote.repo}`.toLowerCase() === STARTER.toLowerCase();
        /** @type {Action[]} */
        const automatic = [
          // Safe to run every time: it only makes sure every released week (week-N tag) is fetched.
          { kind: "auto", command: { display: `git config --replace-all remote.upstream.fetch "${UPSTREAM_WEEKS}"`, argv: ["git", "config", "--replace-all", "remote.upstream.fetch", UPSTREAM_WEEKS], cwd: dir, what: "Makes upstream bring down every released week (week-1, week-2, …)." } },
          { kind: "auto", command: { display: "git config remote.upstream.tagOpt --no-tags", argv: ["git", "config", "remote.upstream.tagOpt", "--no-tags"], cwd: dir, what: "Keeps the course's week tags under upstream/, not mixed in with yours." } },
          { kind: "auto", command: { display: "git fetch upstream", argv: fetchArgv(ctx, dir), cwd: dir, what: "Gets the course's weeks from GitHub." } },
        ];
        if (right) return automatic;
        const verb = url ? "set-url" : "add";
        return [
          cmd(`git remote ${verb} upstream ${STARTER_URL}`, ["git", "remote", verb, "upstream", STARTER_URL], {
            cwd: dir,
            label: url ? "upstream points somewhere else: type this once to fix it" : "This folder isn't linked yet (gh does it when step 9 downloads): type this once",
            what: "Links your folder to the course's repository, under the name upstream.",
            words: [["remote", "a named link to a copy on GitHub"], ["upstream", "the name for the course's copy"]],
          }),
          ...automatic,
        ];
      },
      hint: () => "This needs the course folder from step 9.",
    },
    {
      id: "work",
      title: "Make your work branch",
      technical: "branch",
      explain: "a named line of work in git. You'll do all your course work on one called work.",
      why: "Your work branch starts from the course's current week. Each week after that you bring in the next one and carry on.",
      diagram: true,
      example: "You're on your work branch, started from this week.",
      check: async (ctx) => {
        const branch = output(ctx, ["git", "branch", "--show-current"], repoDir(ctx));
        return { done: branch === "work", found: branch === "work" ? "You're on your work branch." : branch ? `You're on '${branch}', not work.` : "The course folder isn't there yet (step 9)." };
      },
      plan: (ctx) => {
        const dir = repoDir(ctx);
        const hasWork = output(ctx, ["git", "rev-parse", "--verify", "--quiet", "refs/heads/work"], dir) !== null;
        return [
          hasWork
            ? cmd("git switch work", ["git", "switch", "work"], { cwd: dir, what: "Moves you onto your work branch.", words: [["switch", "move to a branch"]] })
            : cmd(`git switch -c work upstream/${newestFetchedWeek(ctx, dir)}`, ["git", "switch", "-c", "work", `upstream/${newestFetchedWeek(ctx, dir)}`], {
                cwd: dir,
                what: "Makes a branch called work, starting from the course's current week, and moves you onto it.",
                words: [["switch", "move to a branch"], ["-c", "create it first"], ["work", "the new branch's name"], [`upstream/${newestFetchedWeek(ctx, dir)}`, "where it starts: the newest week on the course's repository"]],
              }),
        ];
      },
      hint: () => "This needs the course folder (step 9) and the upstream link (step 10).",
    },
    {
      id: "push",
      title: "Put your branch on GitHub",
      technical: "push",
      explain: "sending your commits from this laptop to your fork on GitHub.",
      why: "Pushing is how your work reaches GitHub, where Praise sees it. This first push links work to your fork.",
      diagram: true,
      example: "Your work branch is on GitHub, at your-github-name/netsim.",
      check: async (ctx) => {
        const mismatch = ownerMismatch(ctx, ctx.state.login);
        if (mismatch) return { done: false, found: `${mismatch} Your work branch would go to the wrong copy.` };
        const tracking = output(ctx, ["git", "rev-parse", "--abbrev-ref", "work@{upstream}"], repoDir(ctx));
        if (tracking !== "origin/work") return { done: false, found: "Your work branch isn't on GitHub yet." };
        // Ask GitHub too (when it answers): after an account switch, the new copy may not have it yet.
        const remote = networkRefusal(ctx, repoDir(ctx), { push: true }) ? null : ctx.capture(networkGit(ctx, "origin", ["ls-remote", "--heads", "origin", "work"], { ssh: originKind(originUrl(ctx, repoDir(ctx))) === "ssh" }), repoDir(ctx));
        if (remote?.code === 0 && !remote.stdout.includes("refs/heads/work")) return { done: false, found: `Your work branch isn't on ${ctx.state.login ?? "your"}'s copy on GitHub yet.` };
        return { done: true, found: "Your work branch is on GitHub, linked to origin/work." };
      },
      plan: (ctx) => [
        cmd("git push -u origin work", pushArgv(ctx, ["push", "-u", "origin", "work"]), {
          cwd: repoDir(ctx),
          what: "Sends your work branch to your fork, and remembers the link, so later a plain git push is enough.",
          words: [["push", "send commits to GitHub"], ["-u", "from now on, work goes to origin/work, so later a plain git push is enough"], ["origin", "your fork on GitHub"], ["work", "the branch to send"]],
        }),
      ],
      hint: () => "If GitHub refused, check you're signed in to your own account (step 5) and git uses it (step 6).",
    },
    {
      id: "vscode",
      title: "Install VS Code",
      technical: "optional · code editor",
      explain: "an editor is the app where you read and write code. The course uses VS Code.",
      why: "Any editor works, but the course's examples use VS Code. The code command opens a folder in it from the terminal.",
      optional: true,
      example: "VS Code is installed (code 1.x).",
      check: async (ctx) => {
        const version = output(ctx, ["code", "--version"]);
        return { done: version !== null, found: version ? `VS Code is installed (code ${version.split("\n")[0]}).` : "VS Code's code command isn't found." };
      },
      plan: (ctx) =>
        ctx.platform === "windows" ? [winget("Microsoft.VisualStudioCode", "Installs VS Code.")] : withBrew(ctx, "--cask visual-studio-code", "Installs VS Code, with its code command."),
      hint: (ctx) =>
        ctx.platform === "windows"
          ? REOPEN_TERMINAL
          : "If VS Code is installed but `code` isn't found: in VS Code press Cmd+Shift+P and run \"Shell Command: Install 'code' command in PATH\". This step is optional.",
    },
    {
      id: "codex",
      title: "Install and sign in to Codex",
      technical: "Codex CLI",
      explain: "the course's AI assistant, in the terminal. You lead the design; it can help write code.",
      why: "You'll use Codex in class. It signs in with your ChatGPT account (step 7).",
      example: "Codex is installed and signed in.",
      // The studio never runs codex just to look: on a Mac its first run waits for macOS to check
      // it, which can take minutes. It looks for the program instead, and runs `codex --version`
      // once, visibly, after installing.
      check: async (ctx) => {
        const version = ctx.state.codexVersion ? ` (${ctx.state.codexVersion})` : "";
        if (!onPath(ctx, "codex")) return { done: false, found: "Codex isn't installed yet." };
        if (ctx.state.codexVersion && versionOlder(ctx.state.codexVersion, CODEX_MIN_VERSION)) return { done: false, found: `Codex ${ctx.state.codexVersion} is too old for the studio's Agent tab (it needs ${CODEX_MIN_VERSION} or newer).` };
        const signedIn = codexSignedIn(ctx);
        return { done: signedIn, found: signedIn ? `Codex is installed${version} and signed in.` : `Codex is installed${version} but not signed in.` };
      },
      plan: (ctx) => {
        const installed = onPath(ctx, "codex");
        const old = installed && ctx.state.codexVersion && versionOlder(ctx.state.codexVersion, CODEX_MIN_VERSION);
        if (old)
          return [
            cmd("npm install -g @openai/codex@latest", ["npm", "install", "-g", "@openai/codex@latest"], {
              what: "Updates Codex to the newest version.",
              words: [["npm", "Node's installer for packages"], ["-g", "global: for the whole laptop"], ["@latest", "the newest version"]],
              record: (/** @type {Context} */ c) => {
                delete c.state.codexVersion; // read again below
              },
            }),
            {
              kind: /** @type {const} */ ("auto"),
              command: { display: "codex --version", argv: ["codex", ...CODEX_FLAGS, "--version"], what: "Checks the version you have now.", record: (/** @type {Context} */ c, /** @type {string} */ text) => {
                const version = /\d+\.\d+\.\d+[\w.-]*/.exec(text)?.[0];
                if (version) c.state.codexVersion = version;
              } },
            },
          ];
        return [
          ...(installed
            ? []
            : [
                cmd("npm install -g @openai/codex", ["npm", "install", "-g", "@openai/codex"], {
                  what: "Installs the Codex command for your whole laptop.",
                  words: [["npm", "Node's installer for packages (code other people wrote)"], ["-g", "global: for the whole laptop, not one project"], ["@openai/codex", "the Codex package"]],
                }),
              ]),
          ...(installed && ctx.state.codexVersion
            ? []
            : [
                {
                  kind: /** @type {const} */ ("auto"),
                  command: {
                    display: "codex --version",
                    argv: ["codex", ...CODEX_FLAGS, "--version"],
                    what: "Starts Codex once, to check it works and see which version you have.",
                    ...(ctx.platform === "mac" && {
                      note: "macOS is checking Codex before its first run. This can take a few minutes; leave this open.",
                      slowNote: "Still waiting? Look for a macOS dialog about codex and click Open.",
                    }),
                    slowAfterMs: 60_000,
                    timeoutMs: 15 * 60_000,
                    record: (/** @type {Context} */ c, /** @type {string} */ text) => {
                      const version = /\d+\.\d+\.\d+[\w.-]*/.exec(text)?.[0];
                      if (version) c.state.codexVersion = version;
                    },
                  },
                },
              ]),
          cmd("codex login", ["codex", ...CODEX_FLAGS, "login"], {
            what: "Opens ChatGPT in your browser to sign Codex in.",
            words: [["login", "sign in"]],
            waitFor: "browser",
          }),
        ];
      },
      hint: (ctx) => (ctx.platform === "windows" ? `${REOPEN_TERMINAL} (Codex on Windows also works well inside WSL.)` : "Finish signing in in the browser window, then try again."),
    },
    {
      id: "doctor",
      title: "Get the course's packages, then check everything",
      technical: "npm install + doctor",
      explain: "npm install downloads the code the course uses; the doctor checks your whole setup.",
      why: "The last step: install the course's packages, then run the course's own check. Paste its output into docs/notes/week-01.md.",
      example: "doctor: all 8 checks passed",
      check: async (ctx) => ({ done: ctx.state.doctorOk === true, found: ctx.state.doctorOk ? "doctor: all 8 checks passed" : "The doctor hasn't run yet." }),
      plan: (ctx) => {
        const dir = repoDir(ctx);
        const installed = ctx.exists(join(dir, "node_modules", "zod", "package.json")) && ctx.exists(join(dir, "node_modules", "vitest", "package.json"));
        return [
          ...(installed
            ? []
            : [
                cmd("npm install", ["npm", "install"], {
                  cwd: dir,
                  what: "Downloads the packages the course code uses (zod, vitest, Next.js...) into node_modules.",
                  words: [["npm", "Node's package installer"], ["install", "get everything package.json lists"]],
                }),
              ]),
          doctorCommand(ctx, dir),
        ];
      },
      hint: () => "Fix each one as it says (most are earlier steps: Go back to that step), then try again.",
    },
  ];
}

/**
 * `npm run doctor`, passing only when it ends with "all 8 checks passed".
 * @param {Context} ctx
 * @param {string} dir
 * @returns {Action}
 */
function doctorCommand(ctx, dir) {
  return cmd("npm run doctor", ["npm", "run", "doctor"], {
    cwd: dir,
    what: "Runs the course's checks of your setup (8 must pass; a couple more are only advice). It must end with: doctor: all 8 checks passed.",
    words: [["run", "run one of the course's scripts, from package.json"], ["doctor", "the setup check"]],
    judge: (result) => {
      const text = `${result.stdout}\n${result.stderr}`;
      const ok = /doctor: all 8 checks passed/.test(text);
      ctx.state.doctorOk = ok;
      if (ok) return { done: true, found: "doctor: all 8 checks passed" };
      const items = doctorFailures(text);
      return {
        done: false,
        found: items.length === 0 ? "The doctor didn't pass (Show full output has what it printed)." : items.length === 1 ? "One of the doctor's checks didn't pass:" : `${items.length} of the doctor's checks didn't pass:`,
        items,
      };
    },
  });
}

/**
 * The doctor's failed checks, each with what it found and how to fix it. The doctor prints
 * "✗ <check, padded> <what it found>" and, on the next line, "→ <how to fix it>".
 * @param {string} text
 * @returns {{ check: string, found: string, fix: string }[]}
 */
export function doctorFailures(text) {
  const lines = cleanOutput(text).split("\n");
  /** @type {{ check: string, found: string, fix: string }[]} */
  const items = [];
  lines.forEach((line, i) => {
    const m = /^\s*[✗×] (.{27}) (.*)$/.exec(line) ?? /^\s*[✗×] (\S.*?)\s{2,}(.*)$/.exec(line);
    if (!m) return;
    const next = /^\s*→\s*(.*)$/.exec(lines[i + 1] ?? "");
    items.push({ check: m[1].trim(), found: m[2].trim(), fix: next ? next[1].trim() : "" });
  });
  return items;
}

// ── Get this week's work (every week from week 2) ──────────────────────────

/** @param {number} n */
const weekBranch = (n) => `week-${n}`; // upstream/week-N: the course's week-N tag
/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Is setup finished in this course folder? The work branch exists and is on GitHub (origin/work).
 * @param {Context} ctx
 * @param {string} dir
 */
export function setupComplete(ctx, dir) {
  return output(ctx, ["git", "rev-parse", "--abbrev-ref", "work@{upstream}"], dir) === "origin/work";
}

/**
 * Which week to get: the first released week (upstream/week-N, the course's week-N tag) that isn't in `work` yet. Looks at GitHub
 * (git ls-remote, read-only) and at what was fetched before, so it works offline too.
 * @param {Context} ctx
 * @param {string} dir
 * @returns {{ week: number, published: true } | { week: number, published: false }}
 */
export function findWeek(ctx, dir) {
  // Each week's latest commit: GitHub's when it answers (a fix Praise pushed to a published week
  // counts as new), else what was fetched before.
  /** @type {Map<number, string>} */
  const tips = new Map();
  const local = output(ctx, ["git", "for-each-ref", "--format=%(objectname) %(refname:short)", "refs/remotes/upstream/"], dir) ?? "";
  for (const m of local.matchAll(/^([0-9a-f]{40}) upstream\/week-(\d+)$/gm)) tips.set(Number(m[2]), m[1]);
  for (const [n, sha] of remoteWeeks(ctx, dir)) tips.set(n, sha);
  const sorted = [...tips.keys()].sort((a, b) => a - b);
  // In work already: that commit is here and work contains it.
  const merged = (/** @type {number} */ n) => ctx.capture(["git", "merge-base", "--is-ancestor", /** @type {string} */ (tips.get(n)), "work"], dir)?.code === 0;
  const waiting = sorted.filter((n) => !merged(n));
  if (waiting.length) return { week: /** @type {number} */ (newestHolding(ctx, dir, waiting, tips)), published: true };
  return { week: (sorted.at(-1) ?? 1) + 1, published: false };
}

/**
 * Which of the weeks waiting to get to offer: the newest one that already holds all the ones before
 * it (each release is built on the last), so one "Get this week's work" brings them all. A student
 * who's weeks behind doesn't get them one at a time. Weeks that don't line up are got in order.
 * @param {Context} ctx
 * @param {string} dir
 * @param {number[]} waiting  the released weeks not in work, in order
 * @param {Map<number, string>} tips  each week's latest commit
 * @returns {number | null}
 */
function newestHolding(ctx, dir, waiting, tips) {
  // Comparing the weeks needs their commits: fetch the week tags if one isn't here yet (it only
  // moves upstream/week-N, never the student's work).
  const missing = (/** @type {number} */ n) => ctx.capture(["git", "cat-file", "-e", `${tips.get(n)}^{commit}`], dir)?.code !== 0;
  if (waiting.length > 1 && !ctx.dryRun && waiting.some(missing) && !networkRefusal(ctx, dir)) ctx.capture(networkGit(ctx, "upstream", FETCH_UPSTREAM), dir);
  let toGet = waiting[0] ?? null;
  for (const n of waiting.slice(1)) {
    const holds = waiting.filter((m) => m < n).every((m) => ctx.capture(["git", "merge-base", "--is-ancestor", /** @type {string} */ (tips.get(m)), /** @type {string} */ (tips.get(n))], dir)?.code === 0);
    if (!holds) break;
    toGet = n;
  }
  return toGet;
}

/**
 * The weeks published on upstream (GitHub), with each one's latest commit. Empty when offline.
 * @param {Context} ctx
 * @param {string} dir
 * @returns {Map<number, string>}
 */
function remoteWeeks(ctx, dir) {
  // By itself, at start and in checks: at the course's address, whatever the folder's config says.
  if (networkRefusal(ctx, dir)) return new Map();
  const remote = output(ctx, networkGit(ctx, "upstream", ["ls-remote", "--tags", "upstream", "week-*"]), dir) ?? "";
  return new Map([...remote.matchAll(/^([0-9a-f]{40})\s+refs\/tags\/week-(\d+)$/gm)].map((m) => [Number(m[2]), m[1]]));
}

/**
 * Is a merge stopped halfway (conflicts not resolved)? Then nothing may be committed until it's undone.
 * @param {Context} ctx
 * @param {string} dir
 */
export function mergeInProgress(ctx, dir) {
  return output(ctx, ["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], dir) !== null;
}

/**
 * What week N brings, in plain words, from the course files on its branch.
 * @param {Context} ctx
 * @param {string} dir
 * @param {number} week
 */
export function whatArrived(ctx, dir, week) {
  const ref = `upstream/${weekBranch(week)}`;
  // A task is a stubbed region: a comment line that starts with TODO(week N, …), in the course code
  // (not the guide's prose, the tests or the design mockups).
  const region = `^[[:space:]]*(//|#|<!--)[[:space:]]*TODO\\(week ${week},`;
  const counts = output(ctx, ["git", "grep", "-c", "-E", region, ref, "--", ".", ":(exclude)tests", ":(exclude)docs", ":(exclude)design"], dir) ?? "";
  const tasks = counts.split("\n").reduce((n, line) => n + (Number(line.split(":").pop()) || 0), 0);
  const guide = ctx.capture(["git", "cat-file", "-e", `${ref}:docs/weeks/week-${pad2(week)}.md`], dir)?.code === 0;
  const tests = (output(ctx, ["git", "ls-tree", "-r", "--name-only", ref, `tests/week-${pad2(week)}/`], dir) ?? "").split("\n").filter(Boolean).length;
  const parts = [
    ...(tasks ? [`${tasks} task${tasks === 1 ? "" : "s"} (marked TODO(week ${week}, …) in the code)`] : []),
    ...(guide ? [`the week-${week} guide (docs/weeks/week-${pad2(week)}.md)`] : []),
    ...(tests ? [`the tests that check your work (tests/week-${pad2(week)}, ${tests} file${tests === 1 ? "" : "s"})`] : []),
  ];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return list ? `New this week: ${list}.` : "";
}

/**
 * The files git couldn't merge by itself, while a merge is stopped.
 * @param {Context} ctx
 * @param {string} dir
 */
function conflictedFiles(ctx, dir) {
  return (output(ctx, ["git", "diff", "--name-only", "--diff-filter=U"], dir) ?? "").split("\n").filter(Boolean);
}

/**
 * The steps to get week N into the student's work: the same studio, one flow for every week.
 * @param {number} week
 * @param {{ onWork?: boolean }} [options]  onWork: false adds a first step back to the work branch
 * @returns {Step[]}
 */
export function weekSteps(week, { onWork = true } = {}) {
  const branch = weekBranch(week);
  const ref = `upstream/${branch}`;
  /** @type {Step[]} */
  const steps = [
    {
      id: "half-merged",
      title: "Finish up from last time",
      technical: "unfinished merge",
      explain: "a merge that stopped halfway because of a conflict, and was never undone.",
      why: "If a merge stopped last time and wasn't undone, saving now would save the half-merged files (with git's conflict marks in them). So it's undone first.",
      example: "Nothing is half-merged.",
      check: async (ctx) => {
        const dir = repoDir(ctx);
        if (!mergeInProgress(ctx, dir)) return { done: true, found: "Nothing is half-merged." };
        const files = conflictedFiles(ctx, dir);
        return { done: false, found: `A merge from last time is still half-done${files.length ? ` (in ${files.join(", ")})` : ""}. Undo it first: your work comes back exactly as it was.` };
      },
      plan: (ctx) => [
        cmd("git merge --abort", ["git", "merge", "--abort"], {
          cwd: repoDir(ctx),
          label: "Undo the half-done merge",
          what: "Puts everything back the way it was before that merge, so nothing half-merged gets saved.",
          words: [["merge", "combine another branch into this one"], ["--abort", "stop the merge and undo it"]],
        }),
      ],
      hint: () => "If git won't undo it, show me in class.",
    },
  ];
  if (!onWork)
    steps.push({
      id: "on-work",
      title: "Go back to your work branch",
      technical: "branch",
      explain: "a named line of work in git; all your course work is on the one called work.",
      why: "The new week goes into your work branch, so that's where you need to be.",
      example: "You're on your work branch.",
      check: async (ctx) => {
        const current = output(ctx, ["git", "branch", "--show-current"], repoDir(ctx));
        return { done: current === "work", found: current === "work" ? "You're on your work branch." : `You're on '${current ?? "?"}', not work.` };
      },
      plan: (ctx) => [cmd("git switch work", ["git", "switch", "work"], { cwd: repoDir(ctx), what: "Moves you onto your work branch.", words: [["switch", "move to a branch"]] })],
      hint: () => "If git says your changes would be overwritten, save them first (commit), then try again.",
    });
  steps.push(
    {
      id: "saved",
      title: "Check your work is saved",
      technical: "clean working tree",
      explain: "every change in your folder is saved in git (committed), so nothing can get mixed up.",
      why: `Before week ${week} arrives, everything you've done so far is saved as a commit, so it's safe and you can always get back to it.`,
      example: "Everything is saved.",
      check: async (ctx) => {
        const changes = (output(ctx, ["git", "status", "--porcelain"], repoDir(ctx)) ?? "").split("\n").filter(Boolean);
        return { done: changes.length === 0, found: changes.length === 0 ? "Everything is saved." : `${changes.length} file${changes.length === 1 ? " isn't" : "s aren't"} saved yet.` };
      },
      plan: (ctx) => [
        // Never save half-merged files: undo a stopped merge instead (step 1 normally already has).
        ...(mergeInProgress(ctx, repoDir(ctx))
          ? [
              cmd("git merge --abort", ["git", "merge", "--abort"], {
          cwd: repoDir(ctx),
          label: "Undo the half-done merge",
          what: "Puts everything back the way it was before that merge, so nothing half-merged gets saved.",
          words: [["merge", "combine another branch into this one"], ["--abort", "stop the merge and undo it"]],
        }),
            ]
          : [
              cmd("git add -A", ["git", "add", "-A"], { cwd: repoDir(ctx), what: "Marks every change in the folder to be saved.", words: [["add", "choose what goes in the next save"], ["-A", "all changes"]] }),
              cmd(`git commit -m "week ${Math.max(1, week - 1)}"`, ["git", "commit", "-m", `week ${Math.max(1, week - 1)}`], {
                cwd: repoDir(ctx),
                what: "Saves them as one commit, named after last week.",
                words: [["commit", "save a snapshot of your work in git"], ["-m", "the commit's message (its name)"]],
              }),
            ]),
      ],
      hint: () => "If git says it doesn't know who you are, go back to step 3 (\"Who should your work be signed by?\") in the setup steps above.",
    },
    {
      id: "fetch",
      title: "Get this week's files from the course",
      technical: "fetch",
      explain: "downloading what's new on GitHub, without changing your files yet.",
      why: `Week ${week}'s files are on the course's repository (upstream). Fetching brings them to this laptop.`,
      example: `${ref} is here.`,
      check: async (ctx) => {
        const dir = repoDir(ctx);
        const local = output(ctx, ["git", "rev-parse", "--verify", "--quiet", `refs/remotes/${ref}`], dir);
        const latest = remoteWeeks(ctx, dir).get(week); // undefined when offline: then what's here counts
        if (local === null) return { done: false, found: `Week ${week} isn't on this laptop yet.` };
        if (latest && latest !== local) return { done: false, found: `The course updated week ${week} since you last fetched it.` };
        return { done: true, found: `Week ${week}'s files are on this laptop (${ref}).` };
      },
      plan: (ctx) => [cmd("git fetch upstream", fetchArgv(ctx, repoDir(ctx)), { cwd: repoDir(ctx), what: "Downloads the course's new branches, including this week's.", words: [["fetch", "download what's new, without changing your files"], ["upstream", "the course's repository"]] })],
      hint: () => `If it worked but week ${week} still isn't here, it isn't published yet: check back before class.`,
    },
    {
      id: "merge",
      title: "Add them to your work",
      technical: "merge",
      explain: "combining two lines of work: your work branch and this week's files.",
      why: `Your work keeps everything you did; merging adds week ${week}'s new files and tasks on top.`,
      example: `Week ${week} is in your work.`,
      check: async (ctx) => {
        const dir = repoDir(ctx);
        if (output(ctx, ["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], dir) !== null) {
          const files = conflictedFiles(ctx, dir);
          return { done: false, found: `The merge stopped: your copy and the course both changed ${files.length ? files.join(", ") : "the same file"}.` };
        }
        const merged = ctx.capture(["git", "merge-base", "--is-ancestor", ref, "HEAD"], dir)?.code === 0;
        return { done: merged, found: merged ? `Week ${week} is in your work. ${whatArrived(ctx, dir, week)}`.trim() : `Week ${week} isn't in your work yet.` };
      },
      plan: (ctx) => {
        const dir = repoDir(ctx);
        if (output(ctx, ["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], dir) !== null)
          return [
            cmd("git merge --abort", ["git", "merge", "--abort"], {
              cwd: dir,
              label: "Undo the merge",
              what: "Puts everything back the way it was before the merge, so nothing is left half-merged.",
              words: [["--abort", "stop the merge and undo it"]],
              judge: () => ({ done: false, found: "The merge is undone: your work is exactly as it was before. Show me the files in class and we'll sort it out together." }),
              stop: true,
            }),
          ];
        return [
          cmd(`git merge ${ref}`, ["git", "merge", "--no-edit", ref], {
            cwd: dir,
            what: `Adds week ${week}'s files to your work branch, as one merge commit.`,
            words: [["merge", "combine another branch into this one"], [ref, `week ${week}, as fetched from the course`]],
          }),
        ];
      },
      hint: () => "Nothing else to do here today: bring it to class.",
    },
    {
      id: "push-week",
      title: "Put it on GitHub",
      technical: "push",
      explain: "sending your commits from this laptop to your fork on GitHub.",
      why: `So your fork on GitHub has week ${week} too, and Praise sees the same thing you do.`,
      example: "Your fork on GitHub has it too.",
      check: async (ctx) => {
        // Pushing as another account than the copy's owner fails: say so before trying.
        const mismatch = ownerMismatch(ctx, ghActiveAccount(ctx));
        if (mismatch) return { done: false, found: `${mismatch} GitHub would refuse the push.` };
        const ahead = output(ctx, ["git", "rev-list", "--count", "origin/work..work"], repoDir(ctx));
        return { done: ahead === "0", found: ahead === "0" ? "Your fork on GitHub has it too." : `GitHub doesn't have ${ahead ?? "your latest"} of your commits yet.` };
      },
      plan: (ctx) => {
        const owner = cloneOwner(ctx);
        // Signed in as someone else, and gh knows the copy's owner: switch to it first.
        const back = owner && !ghTokenVar(ctx) && ownerMismatch(ctx, ghActiveAccount(ctx)) && ghAccounts(ctx).some((a) => a.login.toLowerCase() === owner.toLowerCase()) ? owner : null;
        return [
          ...(back && isGithubUsername(back) ? [{ kind: /** @type {const} */ ("command"), command: { ...switchAccountCommand(back), label: `First: use ${back}, the account your copy belongs to` } }] : []),
          cmd("git push", pushArgv(ctx, ["push", "origin", "work"]), { cwd: repoDir(ctx), what: "Sends your work branch to your fork on GitHub.", words: [["push", "send commits to GitHub"]] }),
        ];
      },
      // Only here, and only when it's the wrong account, does "Get week N" offer a different one.
      accountChange: (ctx) => !ghTokenVar(ctx) && Boolean(ownerMismatch(ctx, ghActiveAccount(ctx))),
      hint: (ctx) =>
        ghTokenVar(ctx) && ownerMismatch(ctx, ghActiveAccount(ctx))
          ? `${ownerMismatch(ctx, ghActiveAccount(ctx))} This terminal's ${ghTokenVar(ctx)} picks the account: run npm start in a terminal with ${cloneOwner(ctx)}'s token (export ${ghTokenVar(ctx)}=$(gh auth token --user ${cloneOwner(ctx)})), or without ${ghTokenVar(ctx)}.`
          : ownerMismatch(ctx, ghActiveAccount(ctx))
          ? `Use the account your copy belongs to ("Use a different account" in this step). ${ownerMismatch(ctx, ghActiveAccount(ctx))}`
          : "If GitHub refused, go back to steps 5 and 6 (signing in to GitHub) in the setup steps above.",
    },
    {
      id: "install-week",
      title: "Install anything new",
      technical: "npm install",
      explain: "npm downloads the packages (code other people wrote) that package.json lists.",
      why: "If this week added a package, it gets installed now. If not, this is quick.",
      example: "Everything the course needs is installed.",
      check: async (ctx) => {
        const dir = repoDir(ctx);
        const lock = ctx.mtime?.(join(dir, "package-lock.json")) ?? null;
        const installed = ctx.mtime?.(join(dir, "node_modules", ".package-lock.json")) ?? null;
        const ok = installed !== null && (lock === null || installed >= lock);
        return { done: ok, found: ok ? "Everything the course needs is installed." : "There's something new to install." };
      },
      plan: (ctx) => [cmd("npm install", ["npm", "install"], { cwd: repoDir(ctx), what: "Installs the packages package.json lists, including any new ones.", words: [["npm", "Node's package installer"], ["install", "get everything package.json lists"]] })],
      hint: () => "Check the Wi-Fi, then try again.",
    },
    {
      id: "doctor-week",
      title: "Check everything",
      technical: "doctor",
      explain: "the course's own check of your whole setup.",
      why: "The same check as week 1: 8 checks must still pass.",
      example: "doctor: all 8 checks passed",
      check: async () => ({ done: false, found: "The doctor hasn't run yet." }),
      plan: (ctx) => [doctorCommand(ctx, repoDir(ctx))],
      hint: () => "Fix each one as it says, then try again. Stuck? Show me in class.",
    },
  );
  return steps;
}

/**
 * A step's command, whether it's written out or depends on earlier answers.
 * @param {Action} action
 * @param {Context} ctx
 * @returns {Command | null}
 */
function commandOf(action, ctx) {
  if (action.kind !== "command" && action.kind !== "auto") return null;
  return typeof action.command === "function" ? action.command(ctx) : action.command;
}

/**
 * A step's dry-run result, with the GitHub login filled in when it's known.
 * @param {Step} step
 * @param {Context} ctx
 */
function exampleOf(step, ctx) {
  return step.example.replace(/your-github-name/g, ctx.state.login ?? "your-github-name");
}

/**
 * The step's check. In a dry run, a step whose commands were "run" counts as done, and --fresh
 * pretends nothing else is (so the whole flow can be walked on a laptop that's already set up).
 * @param {Step} step
 * @param {Context} ctx
 * @returns {Promise<CheckResult>}
 */
export async function checkStep(step, ctx) {
  if (ctx.dryRun && ctx.state.dryDone?.[step.id]) return { done: true, found: `(dry run) ${ctx.state.dryFound?.[step.id] ?? exampleOf(step, ctx)}` };
  if (ctx.dryRun && ctx.fresh && step.id !== "node") return { done: false, found: "(dry run) pretending this isn't done yet." };
  return step.check(ctx);
}

/**
 * What went wrong with a command, in plain words, with the fix, and the step to go back to if it
 * belongs to an earlier one.
 * @param {Step} step
 * @param {Command} command
 * @param {string} text  the command's output
 * @param {number} code
 * @param {Context} ctx
 * @returns {{ what: string, fix: string, back?: number }}
 */
export function diagnose(step, command, text, code, ctx) {
  const stopped = `\`${command.display}\` stopped with an error (exit code ${code}).`;
  if (/Could not resolve host|ENOTFOUND|getaddrinfo|network is unreachable|timed out/i.test(text))
    return { what: "The laptop couldn't reach the internet.", fix: "Check the Wi-Fi, then try again." };
  if (/EACCES|permission denied.*node_modules/i.test(text))
    return { what: "npm isn't allowed to install for the whole laptop.", fix: "In Terminal, run the same command with sudo in front (it asks for your Mac password), then come back and try again." };
  if (/already exists and is not an empty directory/.test(text))
    return { what: "There's already a netsim folder there.", fix: "Try again and pick another folder (or delete the old netsim folder if it's from an earlier attempt)." };
  if (/not logged in|gh auth login|authentication required|HTTP 401|Bad credentials/i.test(text))
    return { what: "GitHub doesn't know who you are yet.", fix: "Sign in again in step 5, then come back.", back: 5 };
  if (/denied to|HTTP 403|Permission to .* denied|could not read Username/i.test(text))
    return { what: "GitHub refused: git isn't using your GitHub account.", fix: "Check step 5 (the right account) and step 6 (git uses it).", back: 6 };
  if (/command not found|ENOENT|is not recognized/i.test(text)) {
    const program = command.argv[0];
    const installs = { gh: 4, git: 2, codex: 14, npm: 1, brew: 4 };
    const back = /** @type {Record<string, number>} */ (installs)[program];
    return { what: `The ${program} program isn't installed (or the studio can't find it yet).`, fix: back ? `Install it in step ${back}, then come back.` : step.hint(ctx), back };
  }
  if (/CONFLICT|Automatic merge failed/.test(text)) {
    const files = [...text.matchAll(/Merge conflict in (.+)/g)].map((m) => m[1].trim());
    return {
      what: `Your copy and the course both changed the same file${files.length === 1 ? "" : "s"}${files.length ? `: ${files.join(", ")}` : ""}. Undo the merge first, then show me in class.`,
      fix: "Press Try again ↵: the studio offers Undo the merge. Don't close the studio before you've undone it.",
    };
  }
  if (/invalid reference|not a commit|couldn't find remote ref/i.test(text))
    return { what: "Week 1's starting point wasn't found.", fix: "Go back to step 10 so the studio fetches it, then come back.", back: 10 };
  return { what: stopped, fix: step.hint(ctx) };
}

// ── The terminal version (node setup.mjs --terminal) ──────────────────────

/**
 * Ask the student to type `command`. Nothing runs before a match.
 * @param {Context} ctx
 * @param {Command} command
 * @returns {Promise<"run" | "skip" | "quit">}
 */
async function typeToRun(ctx, command) {
  ctx.print(`  ${ctx.style.bold(command.label ? command.label.toUpperCase() : "TYPE THIS COMMAND")}`);
  ctx.print(`    ${ctx.style.dim(command.display)}`);
  let misses = 0;
  for (;;) {
    const line = await ctx.ask(misses >= 3 ? "  > (Enter = let me run it for you) " : "  > ");
    const answer = line.trim().toLowerCase();
    if (answer === "s") return "skip";
    if (answer === "q") return "quit";
    if (answer === "" && misses >= 3) return "run";
    if (answer === "") continue;
    if (normalizeCommand(line) === normalizeCommand(command.display)) return "run";
    misses++;
    ctx.print(ctx.style.yellow(mismatchMessage(line, command.display)));
    ctx.print(misses >= 3 ? "  Try once more, or press Enter and I'll run it for you." : "  Try again (s = skip this step, q = quit).");
  }
}

/** @typedef {"done" | "pending" | "skipped"} Mark */

/**
 * The checklist: ✓ done, • still to do, – skipped.
 * @param {Context} ctx
 * @param {Step[]} steps
 * @param {Mark[]} marks
 */
function printChecklist(ctx, steps, marks) {
  const symbol = { done: ctx.style.green("✓"), pending: "•", skipped: ctx.style.dim("–") };
  steps.forEach((step, i) => {
    const mark = marks[i] ?? "pending";
    const label = `${String(i + 1).padStart(2)}. ${step.title}${step.optional ? " (optional)" : ""}`;
    ctx.print(`  ${symbol[mark]} ${mark === "skipped" ? ctx.style.dim(`${label} (skipped)`) : label}`);
  });
}

/**
 * Walk through the steps. Never moves on without a keypress, and never runs a command the
 * student didn't type (or ask to have run after three tries). The exception: the first setupSteps
 * steps (week 1's setup, above a week's steps) tick themselves off when they're already done.
 * @param {Step[]} steps
 * @param {Context} ctx
 * @param {{ week?: number, setupSteps?: number, autoSteps?: number, published?: boolean, nextWeek?: number, groups?: WeekGroup[] }} [options]  week: getting week N's work (not the week-1 setup)
 */
export async function runSteps(steps, ctx, { week, setupSteps = 0, autoSteps = setupSteps, published = true, nextWeek = 0, groups = [] } = {}) {
  const { bold } = ctx.style;
  ctx.print(bold("NetSim: Building a Simulated Computer System"));
  ctx.print(week ? `Let's get week ${week}'s work into your folder, one step at a time.` : "I'll walk you through setting up your laptop, one step at a time.");
  ctx.print("Each step checks first. Nothing runs until you type it yourself.\n");

  /** @type {Mark[]} */
  const marks = steps.map(() => "pending");
  ctx.print(bold("Your checklist"));
  printChecklist(ctx, steps, marks);
  if ((await ctx.ask("\nPress Enter to start (q = quit) ")).trim().toLowerCase() === "q") return { marks, quit: true };

  for (const [i, step] of steps.entries()) {
    if (groups.length) {
      for (const g of groups) if (g.count > 0 && g.start === i) ctx.print(`\n${bold(`Week ${g.week} · ${g.title}`)}${g.status === "done" ? " (done)" : ""}`);
    } else {
      if (i === 0 && setupSteps > 0) ctx.print(`\n${bold("Week 1 · Setup")}`);
      if (i === setupSteps && setupSteps > 0) ctx.print(`\n${bold(`Week ${week} · ${nextWeek ? "In your work" : "Get this week's work"}`)}`);
    }
    // Week 1's setup above a week's steps: done ones tick off without an Enter, an optional one is skipped.
    if (i < autoSteps) {
      const r = await checkStep(step, ctx);
      if (r.done || step.optional) {
        ctx.print(`  ${r.done ? ctx.style.green(`✓ ${step.title}`) : `${step.title}: skipped (optional)`}`);
        marks[i] = r.done ? "done" : "skipped";
        continue;
      }
    }
    ctx.print(`\n${bold(`Step ${i + 1} of ${steps.length} · ${step.title}`)}${step.optional ? " (optional)" : ""}`);
    ctx.print(`  ${bold("WHAT")}    ${step.technical}: ${step.explain}`);
    ctx.print(`  ${bold("WHY")}     ${step.why}`);
    const outcome = await doStep(step, ctx);
    if (outcome === "quit") {
      ctx.print(`\n${QUIT_MESSAGE}`);
      return { marks, quit: true };
    }
    marks[i] = outcome === "done" ? "done" : "skipped";
  }

  ctx.print(`\n${bold("Your checklist")}`);
  printChecklist(ctx, steps, marks);
  const notOut = groups.filter((g) => g.status === "future");
  if (notOut.length) ctx.print(`\nNot out yet: ${notOut.map((g) => `week ${g.week} (${g.title})`).join(", ")}.`);
  if (nextWeek) ctx.print(`\nWeek ${nextWeek} isn't out yet. Check back before Monday's class.`);
  if (week && !published) {
    ctx.print(`\nWeek ${week} isn't out yet. Check back before Monday's class.`);
    return { marks, quit: false };
  }
  const left = steps.filter((s, i) => marks[i] !== "done" && !s.optional);
  const guide = `docs/weeks/week-${String(week ?? 1).padStart(2, "0")}.md`;
  const next = week ? `open ${guide} and do the tasks marked TODO(week ${week}, …)` : `open ${guide} and do the take-home`;
  ctx.print(
    left.length === 0
      ? `\n${ctx.style.green(week ? `Week ${week} is in your work.` : "All set.")} Next: ${next}.`
      : `\nNext: finish the skipped steps (run \`node setup.mjs\` again), then ${next}.`,
  );
  return { marks, quit: false };
}

export const QUIT_MESSAGE = "Run node setup.mjs again anytime; finished steps are remembered because they're re-checked.";

/**
 * @param {Step} step
 * @param {Context} ctx
 * @returns {Promise<"done" | "skipped" | "quit">}
 */
async function doStep(step, ctx) {
  /** @param {string} text @param {boolean} ok */
  const status = (text, ok) => ctx.print(`  ${ctx.style.bold("STATUS")}  ${ok ? ctx.style.green(`✓ ${text}`) : text}`);
  /** @param {CheckResult} r */
  const passed = async (r) => {
    status(r.found, true);
    ctx.save?.();
    const answer = (await ctx.ask("  Press Enter for the next step (q = quit) ")).trim().toLowerCase();
    return answer === "q" ? "quit" : "done";
  };
  for (;;) {
    const found = await checkStep(step, ctx);
    if (found.ask && step.confirm) {
      const yes = (await ctx.ask(`  ${found.ask} (y/n) `)).trim().toLowerCase().startsWith("y");
      step.confirm(ctx, yes);
      if (yes) continue;
    }
    if (found.done) return passed(found);
    status(`not done yet: ${found.found}`, false);

    /** @type {CheckResult | null} */
    let judged = null;
    for (const action of step.plan(ctx)) {
      if (action.kind === "form") {
        for (;;) {
          /** @type {Record<string, string>} */
          const values = {};
          for (const field of action.fields) values[field.name] = await ctx.ask(`  ${field.label}${field.hint ? ` (${field.hint})` : ""}: `);
          const result = action.submit(ctx, values);
          if (result.error) {
            ctx.print(ctx.style.yellow(`  ${result.error}`));
            continue;
          }
          for (const c of result.commands ?? []) {
            ctx.print(ctx.style.dim(`  ${ctx.dryRun ? "(dry run: not running) " : ""}${c.display}`));
            if (!ctx.dryRun) ctx.execute(c.argv, c.cwd);
          }
          break;
        }
        continue;
      }
      if (action.kind === "choice") {
        ctx.print("  Do this in your browser (it can't be checked from here):");
        for (const link of action.links) ctx.print(`    ${link.label}: ${link.url}`);
        const yes = (await ctx.ask(`  ${action.question} (y/n) `)).trim().toLowerCase().startsWith("y");
        if (!yes) return "skipped";
        action.submit(ctx);
        continue;
      }
      if (action.kind === "folder") {
        for (;;) {
          const initial = action.initial(ctx);
          const answer = (await ctx.ask(`  ${action.label} (Enter = ${initial}) `)).trim();
          let error = action.submit(ctx, answer || initial);
          if (error && typeof error === "object") {
            const yes = (await ctx.ask(`  There's no folder at ${tildify(error.missing)}. Create it? (y/n) `)).trim().toLowerCase().startsWith("y");
            if (!yes) continue;
            error = action.submit(ctx, answer || initial, { create: error.missing });
          }
          if (!error) break;
          ctx.print(ctx.style.yellow(`  ${typeof error === "string" ? error : `There's no folder at ${tildify(error.missing)}.`}`));
        }
        continue;
      }
      const command = /** @type {Command} */ (commandOf(action, ctx));
      if (action.kind === "command") {
        const choice = await typeToRun(ctx, command);
        if (choice !== "run") return choice === "skip" ? "skipped" : "quit";
      } else ctx.print(ctx.style.dim(`  Running: ${command.display}${command.note ? `\n  ${command.note}` : ""}`));
      if (ctx.dryRun) {
        ctx.print(ctx.style.dim(`  (dry run: not running ${command.display})`));
        continue;
      }
      if (command.judge) {
        const result = ctx.capture(command.argv, command.cwd) ?? { code: 1, stdout: "", stderr: `${command.argv[0]} not found` };
        for (const line of `${result.stdout}\n${result.stderr}`.trim().split("\n")) ctx.print(`    ${line}`);
        judged = command.judge(result);
        continue;
      }
      const code = ctx.execute(command.argv, command.cwd);
      if (code !== 0) ctx.print(ctx.style.yellow(`  That command exited with code ${code}.`));
    }

    if (ctx.dryRun) {
      await ctx.ask("  (dry run) Press Enter for the next step ");
      return "skipped";
    }
    const again = judged ?? (await checkStep(step, ctx));
    if (again.done) return passed(again);
    if (again.ask) continue; // the loop asks the question
    ctx.print(ctx.style.red(`  ✗ Still not done: ${again.found}`));
    ctx.print(`  → ${step.hint(ctx)}`);
    const answer = (await ctx.ask("  Enter = try again, s = skip, q = quit ")).trim().toLowerCase();
    if (answer === "s") return "skipped";
    if (answer === "q") return "quit";
  }
}

/**
 * Reads answers one line at a time. Lines that arrive before a question is asked wait in a
 * queue, so typing ahead (or piping answers in) works like a person typing each one. When the
 * input ends (Ctrl+D, or piped input runs out), `onEnd` is called instead of hanging.
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @param {() => void} onEnd
 */
export function lineReader(input, output, onEnd) {
  const terminal = Boolean(/** @type {{ isTTY?: boolean }} */ (output).isTTY);
  const rl = createInterface({ input, output, terminal });
  // A terminal echoes what you type, Enter included. Piped input isn't echoed, so end the line ourselves.
  const endLine = () => {
    if (!terminal) output.write("\n");
  };
  /** @type {string[]} */
  const queued = [];
  /** @type {((line: string) => void) | null} */
  let waiting = null;
  let ended = false;
  rl.on("line", (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      endLine();
      resolve(line);
    } else queued.push(line);
  });
  rl.on("close", () => {
    ended = true;
    if (waiting) onEnd(); // someone is waiting for an answer that will never come
  });
  return {
    rl,
    /** @param {string} question */
    ask: (question) => {
      output.write(question);
      const next = queued.shift();
      if (next !== undefined) {
        endLine();
        return Promise.resolve(next);
      }
      if (ended) {
        onEnd();
        return new Promise(() => {}); // onEnd exits; this answer never arrives
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    close: () => rl.close(),
  };
}

// ── The studio: the same steps, driven from a page in the browser ──────────

const OUTPUT_LIMIT = 200_000;

/** The steps that depend on which GitHub account is in use: checked again after a switch. */
const ACCOUNT_STEPS = new Set(["gh-login", "git-helper", "fork", "clone", "push", "doctor", "push-week", "doctor-week"]);

/**
 * The studio's state and the only way to change it. The browser sends actions; each is checked
 * against the current step and its plan, so the only commands that ever run are the ones the
 * current step planned, and only once the typed text matches.
 * @param {Context} ctx
 * @param {Step[]} steps
 * @param {{ mode?: "setup" | "week", week?: number, published?: boolean, setupSteps?: number, autoSteps?: number, inWork?: boolean, next?: number, groups?: WeekGroup[], update?: boolean, focus?: number, home?: number }} [meta]  what the page is for:
 *   setup (week 1), or getting week N (published: false when week N isn't out yet)
 * @param {{ agentTransport?: (cwd: string) => AgentTransport }} [options]  (tests: a scripted Codex)
 */
export function createStudio(ctx, steps, meta = {}, options = {}) {
  const setupSteps = meta.mode === "week" ? (meta.setupSteps ?? 0) : 0;
  // How many leading steps tick themselves off when done: the setup, or everything when the week is already in.
  const autoSteps = meta.mode === "week" ? (meta.autoSteps ?? setupSteps) : 0;
  // Only the first pass ticks setup steps off by itself: going back to one later stays there.
  let autoSetup = autoSteps > 0;
  // Steps "I've done all this" found done, after the first one left: they tick themselves off when
  // the student gets to them (if they still pass).
  /** @type {Set<number>} */
  const vouched = new Set();
  /** @type {Set<(event: string, data: unknown) => void>} */
  const listeners = new Set();
  /** @type {Mark[]} */
  const marks = steps.map(() => "pending");
  const found = steps.map(() => "");
  /** @type {string[][]} */
  const ran = steps.map(() => []);
  // What later steps will ask for, shown when a future step is clicked. Worked out without running
  // anything (as if nothing were installed yet), so the studio starts straight away.
  /** @type {Context} */
  const looking = { ...ctx, capture: () => null };
  /** @param {Step} s */
  const preview = (s) => {
    if (s.preview) return s.preview;
    try {
      // Only what the student will type: the studio runs "auto" actions itself.
      return s.plan(looking).flatMap((a) => (a.kind === "command" ? [/** @type {Command} */ (commandOf(a, looking)).display] : []));
    } catch {
      return [];
    }
  };
  // Worked out again when the GitHub login changes, so the clone command shows the student's name.
  /** @type {string[][]} */
  let previews = steps.map(preview);
  let previewLogin = ctx.state.login;
  const previewsNow = () => {
    if (ctx.state.login !== previewLogin) {
      previewLogin = ctx.state.login;
      previews = steps.map(preview);
    }
    return previews;
  };
  // A fresh dry run plans as if nothing were installed on this laptop, like a student's.
  const planCtx = ctx.dryRun && ctx.fresh ? looking : ctx;
  let current = 0;
  let attempt = 0;
  let ranHere = false; // a command ran in this step (so a pass isn't "already done")
  let outputId = 0;
  let out = "";
  /** @type {Action[]} */
  let plan = [];
  /** @type {Running | null} */
  let child = null;
  /**
   * @type {{ phase: string, already: boolean, index: number, error: { what: string, fix: string, back?: number, stop?: boolean, items?: { check: string, found: string, fix: string }[] } | null,
   *   ask: string, note: string, slowNote: string, slowAfterMs: number, startedAt: number, code: string, url: string, waitFor: string, formError: string, picked?: string, missing?: string }}
   */
  let view = blank("checking");
  /** The account gh uses now (step 5 and the panel show it). A dry run shows the pretend login. */
  let active = ctx.dryRun ? (ctx.state.login ?? null) : ghActiveAccount(ctx);
  const refreshActive = () => {
    active = ctx.dryRun ? (ctx.state.login ?? active) : ghActiveAccount(ctx);
  };
  /**
   * "Use a different account", while it's open: the accounts gh knows, then the one command the
   * student picked. Only an account gh listed (or "add") can become a command.
   * @type {null | { phase: "choose" | "ready" | "running" | "failed", accounts: { login: string, active: boolean }[], choice: string,
   *   command: Command | null, attempt: number, error: string, code: string, url: string, before: string | null }}
   */
  let acct = null;
  let acctRun = 0; // which account command is running (an older one's ending is ignored)
  let notice = ""; // what changed after a switch, shown in the step
  let keepNotice = false;
  let canChange = false; // the current step offers "Use a different account"
  const updateCanChange = () => {
    const step = steps[current];
    canChange = Boolean(step?.accountChange?.(ctx));
  };

  /** @param {string} phase */
  function blank(phase) {
    return { phase, already: false, index: 0, error: null, ask: "", note: "", slowNote: "", slowAfterMs: 0, startedAt: 0, code: "", url: "", waitFor: "", formError: "" };
  }

  /**
   * @param {Action} action
   * @returns {ActionView}
   */
  function describe(action) {
    const command = commandOf(action, ctx);
    if (command) {
      const runs = command.argv.join(" ");
      return {
        kind: action.kind,
        display: command.display,
        what: command.what ?? "",
        words: command.words ?? [],
        label: command.label ?? "",
        waitFor: command.waitFor ?? "",
        pasteOk: pasteAllowed(command.display),
        runs: normalizeCommand(runs) === normalizeCommand(command.display) || command.argv[0].includes("/") ? "" : runs,
        cwd: command.cwd ? tildify(command.cwd) : "",
      };
    }
    if (action.kind === "form") return { kind: "form", fields: action.fields, button: action.button };
    if (action.kind === "choice") return { kind: "choice", question: action.question, links: action.links, yes: action.yes };
    if (action.kind === "folder") return { kind: "folder", label: action.label, hint: action.hint, initial: tildify(action.initial(ctx)) };
    return { kind: "none" };
  }

  function snapshot() {
    return {
      dryRun: ctx.dryRun,
      fresh: Boolean(ctx.fresh),
      platform: ctx.platform,
      current,
      total: steps.length,
      mode: meta.mode ?? "setup",
      week: meta.week ?? 1,
      published: meta.published ?? true,
      setupSteps,
      inWork: Boolean(meta.inWork),
      groups: meta.groups ?? [],
      board: { phase: board.phase, error: board.error, url: BOARD_URL },
      checks: { week: checks.week, phase: checks.phase, out: cleanOutput(checks.out) },
      code,
      focus: meta.focus ?? 0,
      home: meta.home ?? 0,
      update: Boolean(meta.update),
      next: meta.next ?? 0,
      // Only on the finish screen: it asks git.
      arrived: meta.mode === "week" && current >= steps.length && ctx.state.repoDir && meta.published !== false ? whatArrived(ctx, ctx.state.repoDir, meta.week ?? 2) : "",
      login: ctx.state.login ?? "",
      account: {
        login: active ?? "",
        notice,
        panel: acct && {
          phase: acct.phase,
          others: acct.accounts.filter((x) => !x.active && x.login !== active).map((x) => x.login),
          choice: acct.choice,
          action: acct.command ? describe({ kind: "command", command: acct.command }) : null,
          attempt: acct.attempt,
          error: acct.error,
          code: acct.code,
          url: acct.url,
          waitFor: acct.command?.waitFor ?? "",
        },
      },
      codexVersion: ctx.state.codexVersion ?? "",
      repoDir: ctx.state.repoDir ? tildify(ctx.state.repoDir) : "",
      steps: steps.map((s, i) => ({
        id: s.id,
        n: i + 1,
        title: s.title,
        technical: s.technical,
        explain: s.explain,
        why: s.why,
        optional: Boolean(s.optional),
        diagram: Boolean(s.diagram),
        changeable: Boolean(s.changeable),
        mark: marks[i],
        found: found[i],
        ran: ran[i],
        preview: previewsNow()[i],
      })),
      view: current < steps.length ? { ...view, attempt, outputId, actions: plan.map(describe), canChangeAccount: canChange, canPickFolder: Boolean(ctx.pickFolder) && !ctx.dryRun, canCheckAll: canCheckAll() } : null,
    };
  }

  const publish = () => {
    const snap = snapshot();
    for (const l of listeners) l("state", snap);
  };

  /**
   * @param {number} i
   * @param {boolean} [again]  the same step, straight after answering its question (keeps "a command ran")
   */
  async function enter(i, again = false) {
    child?.kill();
    child = null;
    if (!again) {
      ranHere = false;
      if (ran[i]) ran[i] = [];
      // A new step starts with no output (the page closes Show full output too).
      out = "";
      outputId++;
      for (const l of listeners) l("output", { id: outputId, text: "", reset: true });
    }
    current = i;
    plan = [];
    if (!keepNotice) notice = "";
    keepNotice = false;
    refreshActive();
    const mine = ++attempt;
    view = blank("checking");
    publish();
    if (i >= steps.length) return;
    const step = steps[i];
    const r = await checkStep(step, ctx);
    if (mine !== attempt) return;
    found[i] = r.found;
    updateCanChange();
    // Week 1's setup, shown above a week's steps: done steps tick themselves off, an optional one
    // not done yet is skipped, and the first one that needs the student stops here.
    const isVouched = vouched.delete(i);
    if (((autoSetup && i < autoSteps) || isVouched) && !ranHere && (r.done || step.optional)) {
      marks[i] = r.done ? "done" : "skipped";
      if (r.done && !ctx.dryRun) ctx.save?.();
      return enter(i + 1);
    }
    autoSetup = false;
    if (r.done) return pass(r.found, !ranHere);
    if (r.ask) {
      view = { ...blank("confirm"), ask: r.ask };
      return publish();
    }
    plan = step.plan(planCtx);
    view = blank("ready");
    publish();
    await advance(mine);
  }

  /** Runs the next action if it needs no typing. @param {number} mine */
  async function advance(mine) {
    const action = plan[view.index];
    const command = action ? commandOf(action, ctx) : null;
    // Never an account change by itself (gh auth switch): that's the person's call.
    // Never an account change (gh auth switch) or undoing a merge (it would throw away a hand-resolved,
    // uncommitted merge) by itself: those are the person's call.
    const theirs = command && (command.argv[0] === "gh" || (command.argv[0] === "git" && command.argv.includes("--abort")));
    if (action?.kind === "auto" || (command && resuming() && !command.waitFor && !theirs)) await runCommand(/** @type {Command} */ (command), mine, true);
  }

  /**
   * Getting the week's work runs by itself (save, fetch, merge, push, install, check): students do it
   * every week. Only the week steps after setup, and never a command that needs the person (a
   * browser sign-in): a step that fails stops here, saying what to do, as before.
   */
  function resuming() {
    return meta.mode === "week" && setupSteps > 0 && current >= setupSteps && current < steps.length && !ctx.dryRun;
  }

  /** @param {string} text @param {boolean} [already] */
  function pass(text, already = false) {
    found[current] = text;
    updateCanChange();
    marks[current] = "done";
    view = { ...blank("passed"), already, index: view.index };
    if (!ctx.dryRun) ctx.save?.();
    publish();
    if (resuming() && !acct) void enter(current + 1);
  }

  /** @param {{ what: string, fix: string, back?: number, stop?: boolean, items?: { check: string, found: string, fix: string }[] }} error */
  function fail(error) {
    updateCanChange();
    view = {
      ...view,
      phase: "failed",
      error: { what: error.what, fix: error.fix, ...(error.back && error.back - 1 < current && { back: error.back }), ...(error.stop && { stop: true }), ...(error.items?.length && { items: error.items }) },
    };
    publish();
  }

  /**
   * @param {Command} command
   * @param {number} mine
   * @param {boolean} [auto]
   */
  async function runCommand(command, mine, auto = false) {
    const step = steps[current];
    out = "";
    outputId++;
    ranHere = true;
    view = { ...view, phase: "running", code: "", url: "", waitFor: command.waitFor ?? "", note: command.note ?? "", slowNote: command.slowNote ?? "", slowAfterMs: command.slowAfterMs ?? 0, startedAt: Date.now() };
    publish();
    for (const l of listeners) l("output", { id: outputId, text: "", reset: true });

    if (command.waitFor === "terminal" && !ctx.dryRun) {
      ctx.openTerminal?.(command);
      view = { ...view, phase: "waiting" };
      return publish();
    }
    const run = /** @type {NonNullable<Context["stream"]>} */ (ctx.stream)(command.argv, command.cwd, (chunk) => {
      if (mine !== attempt) return;
      out = (out + chunk).slice(-OUTPUT_LIMIT);
      for (const l of listeners) l("output", { id: outputId, text: chunk });
      if (command.waitFor === "browser" && !view.code) {
        const clean = cleanOutput(out);
        const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(clean)?.[1] ?? "";
        const url = /(https:\/\/\S+)/.exec(clean)?.[1] ?? "";
        if (code || url) {
          // gh only opens the browser itself when it has a terminal; without one it says "Open this URL".
          if (command.openUrl && url && /Open this URL/i.test(clean)) ctx.openUrl?.(url);
          view = { ...view, code, url };
          publish();
        }
      }
    });
    child = run;
    let timedOut = false;
    const limit = command.timeoutMs ? setTimeout(() => ((timedOut = true), run.kill()), command.timeoutMs) : null;
    const code = await run.done;
    if (limit) clearTimeout(limit);
    if (mine !== attempt) return;
    child = null;
    if (!ctx.dryRun && command.argv[0] === "gh") refreshActive();
    if (auto) ran[current].push(command.display);
    if (timedOut)
      return fail({ what: `\`${command.display}\` didn't finish within ${Math.round((command.timeoutMs ?? 0) / 60_000)} minutes.`, fix: command.slowNote ?? step.hint(ctx) });
    if (code === 0) command.record?.(ctx, cleanOutput(out));
    const last = view.index >= plan.length - 1;

    if (ctx.dryRun) {
      if (code !== 0) return fail(diagnose(step, command, cleanOutput(out), code, ctx));
      if (!last) return next(mine);
      const pretended = step.pretend?.(ctx);
      if (pretended?.ask) {
        view = { ...blank("confirm"), ask: pretended.ask };
        return publish();
      }
      (ctx.state.dryDone ??= {})[step.id] = true;
      return pass(`(dry run) ${exampleOf(step, ctx)}`);
    }
    if (command.judge) {
      const r = command.judge({ code, stdout: cleanOutput(out), stderr: "" });
      return r.done ? pass(r.found) : fail({ what: r.found, fix: step.hint(ctx), stop: command.stop, items: r.items });
    }
    if (code === 0 && !last) return next(mine);
    const r = await checkStep(step, ctx);
    if (mine !== attempt) return;
    if (r.done) return pass(r.found);
    if (r.ask) {
      view = { ...blank("confirm"), ask: r.ask };
      return publish();
    }
    if (code !== 0) return fail(diagnose(step, command, cleanOutput(out), code, ctx));
    if (command.waitFor) {
      view = { ...view, phase: "waiting" };
      return publish();
    }
    fail({ what: `Still not done: ${r.found}`, fix: step.hint(ctx) });
  }

  /** The current step's week: where its steps end in the list. */
  const groupEnd = () => {
    const g = (meta.groups ?? []).find((x) => x.count > 0 && current >= x.start && current < x.start + x.count);
    return g ? g.start + g.count : steps.length;
  };

  /**
   * Whether "I've done all this" is offered: while nothing is checking or running, and on a step
   * that's done only when more of its week comes after it (the studio lands on done steps too).
   */
  function canCheckAll() {
    if (!["ready", "passed", "failed", "waiting"].includes(view.phase) && !(view.phase === "running" && view.waitFor === "browser")) return false;
    return view.phase !== "passed" || current + 1 < groupEnd();
  }

  /**
   * "I've done all this": every check of the current step's week (from the current step on), no
   * actions. The steps that pass are done; it lands on the first one left, or after the week.
   */
  async function checkAll() {
    const g = (meta.groups ?? []).find((x) => x.count > 0 && current >= x.start && current < x.start + x.count);
    const end = groupEnd();
    child?.kill();
    child = null;
    const mine = ++attempt;
    plan = [];
    view = { ...blank("checking"), note: `Checking every step${g ? ` of week ${g.week}` : ""}…` };
    publish();
    let first = -1;
    for (let i = current; i < end; i++) {
      const r = await checkStep(steps[i], ctx);
      if (mine !== attempt) return;
      found[i] = r.found;
      if (r.done) marks[i] = "done";
      if (first >= 0 && (r.done || steps[i].optional)) vouched.add(i);
      else if (!r.done && !steps[i].optional && first < 0) first = i;
      else if (!r.done && first < 0) marks[i] = "skipped";
    }
    if (!ctx.dryRun) ctx.save?.();
    void enter(first < 0 ? end : first);
  }

  /** @param {number} mine */
  async function next(mine) {
    view = { ...view, phase: "ready", index: view.index + 1 };
    publish();
    await advance(mine);
  }

  /** @param {number} status @param {string} error */
  const reject = (status, error) => ({ ok: false, status, error });
  const ok = { ok: true, status: 200, error: "" };

  // ── The board and the week's checks, inside the studio ────────────────────────────────
  // The board is what `npm run dev:all` runs (the bus, the components, the board's server), started
  // here from fixed commands when the student asks, shown in the studio, and stopped with it.
  /** @type {{ phase: "off" | "starting" | "on" | "failed", ours: boolean, error: string }} */
  let board = { phase: "off", ours: false, error: "" };
  /** @type {Running[]} */
  let boardRuns = [];
  let boardLog = "";
  /** @type {{ week: number, phase: "off" | "running" | "passed" | "failed", out: string }} */
  let checks = { week: 0, phase: "off", out: "" };
  /** @type {Running | null} */
  let checksRun = null;

  function stopBoard() {
    for (const r of boardRuns) r.kill();
    boardRuns = [];
    if (board.ours) board = { phase: "off", ours: false, error: "" };
  }

  async function startBoard() {
    const dir = ctx.state.repoDir;
    if (!dir) return reject(409, "The course folder isn't set up yet.");
    if (board.phase === "starting" || board.phase === "on") return ok;
    const http = ctx.httpStatus ?? (async () => 0);
    if ((await http(BOARD_URL)) === 200) {
      board = { phase: "on", ours: false, error: "" }; // already running (npm run dev:all in a terminal)
      publish();
      return ok;
    }
    if (!ctx.exists(join(dir, "node_modules", "next", "package.json"))) {
      board = { phase: "failed", ours: false, error: "The course's packages aren't installed yet: run npm install in your course folder, then try again." };
      publish();
      return ok;
    }
    board = { phase: "starting", ours: true, error: "" };
    boardLog = "";
    publish();
    const log = (/** @type {string} */ t) => (boardLog = (boardLog + t).slice(-20_000));
    const stream = /** @type {NonNullable<Context["stream"]>} */ (ctx.stream);
    const programs = stream(...boardCommands(dir).programs, log);
    if ((await programs.done) !== 0) {
      board = { phase: "failed", ours: true, error: `Building the demo programs failed:\n${boardLog.slice(-2000)}` };
      return publish();
    }
    boardRuns = boardCommands(dir).servers.map(([argv, cwd]) => stream(argv, cwd, log));
    for (const r of boardRuns)
      void r.done.then((code) => {
        if (board.phase === "starting" && board.ours) {
          stopBoard();
          board = { phase: "failed", ours: true, error: `Part of the board stopped (exit code ${code}):\n${boardLog.slice(-2000)}` };
          publish();
        }
      });
    for (let waited = 0; waited < 180 && board.phase === "starting"; waited++) {
      await new Promise((r) => setTimeout(r, 1000));
      if ((await http(BOARD_URL)) === 200 && board.phase === "starting") {
        board = { phase: "on", ours: true, error: "" };
        publish();
      }
    }
    if (board.phase === "starting") {
      stopBoard();
      board = { phase: "failed", ours: true, error: `The board didn't start within 3 minutes:\n${boardLog.slice(-2000)}` };
      publish();
    }
    return ok;
  }

  // ── Tasks written in the studio (the week's Code tab) ──
  /** @type {Record<string, { phase: "running" | "passed" | "failed" | "error", passed?: number, failed?: number, failures?: { test: string, message: string, own?: boolean }[], waiting?: string[], blocked?: number, error?: string, committed?: string, done?: boolean, rev?: string }>} */
  let code = {};
  /** @type {Running | null} */
  let codeRun = null;
  let checking = false; // buildCheck is walking the steps
  let checkQueued = false; // buildCheck waits for a test run to finish

  /** A week the student has in their work (its page, board, checks and code open). @param {number} week */
  function weekIn(week) {
    const g = (meta.groups ?? []).find((x) => x.week === week);
    return Boolean(g && (["setup", "done", "inwork", "open"].includes(g.status) || (g.status === "get" && current >= steps.length)));
  }

  /** @param {Record<string, unknown>} a */
  async function saveCode(a) {
    const dir = ctx.state.repoDir;
    const week = Number(a.week);
    if (!dir || !Number.isInteger(week) || !weekIn(week)) return reject(409, "That week isn't in your work yet.");
    if (codeRun) return reject(409, "The tests are still running for the last save.");
    const task = weekCode(ctx, dir, week).find((t) => t.id === a.id && t.file === a.file);
    if (!task) return reject(404, "That isn't one of this week's tasks.");
    const saved = writeRegion(dir, { file: a.file, id: task.id, week, rev: a.rev, body: a.body });
    if ("error" in saved) return { ...reject(409, saved.error) };
    runTaskTests(dir, week, { ...task, rev: saved.rev });
    return { ...ok, rev: saved.rev };
  }

  /** "Run its tests": the file as it is, nothing written (the student pressed it). @param {Record<string, unknown>} a */
  function testCode(a) {
    const dir = ctx.state.repoDir;
    const week = Number(a.week);
    if (!dir || !Number.isInteger(week) || !weekIn(week)) return reject(409, "That week isn't in your work yet.");
    if (codeRun) return reject(409, "The tests are still running.");
    const task = weekCode(ctx, dir, week).find((t) => t.id === a.id);
    if (!task) return reject(404, "That isn't one of this week's tasks.");
    runTaskTests(dir, week, task, a.fromAgent === true ? "agent" : "");
    return ok;
  }

  /**
   * @param {string} dir @param {number} week @param {ReturnType<typeof weekCode>[number]} task
   * @param {"" | "agent" | "sandbox" | "check"} [from]  "agent": the student pressed it in the Agent tab, say the result there.
   *   "sandbox": the end of a turn, nobody pressed anything: in Codex's sandbox, and said there too.
   *   "check": the Build view finding where the student is: in the sandbox, nothing said.
   * @param {(green: boolean) => void} [then]  called with whether it came out green
   */
  function runTaskTests(dir, week, task, from = "", then = () => {}) {
    const id = task.id;
    // "check": the Build view checking where the student is, quietly, in the sandbox (nobody pressed anything).
    const quiet = from === "check";
    const sandboxed = from === "sandbox" || quiet;
    if (from && !quiet) agent.testOfferDone(id);
    code = { ...code, [id]: { phase: "running" } };
    publish();
    const report = join(tmpdir(), `netsim-studio-${process.pid}-${id}.json`);
    const vitest = [process.execPath, join(dir, "node_modules", "vitest", "vitest.mjs"), "run", ...task.tests, "--reporter=json", `--outputFile=${report}`];
    const argv = sandboxed ? ["codex", ...CODEX_FLAGS, "-c", `sandbox_mode="${AGENT_SANDBOX_MODE}"`, "-c", "sandbox_workspace_write.writable_roots=[]", "-c", "sandbox_workspace_write.network_access=false", "sandbox", "--", ...vitest] : vitest;
    let text = "";
    codeRun = /** @type {NonNullable<Context["stream"]>} */ (ctx.stream)(argv, dir, (t) => (text = (text + t).slice(-20_000)));
    void codeRun.done.then(() => {
      codeRun = null;
      const stubs = agentTaskList(dir, week).filter((t) => t.stubbed);
      const results = taskResults(ctx.readText(report) ?? "", task, stubs, task.needs, sandboxed);
      try {
        rmSync(report, { force: true });
      } catch {
        // a leftover report in the temp folder is harmless
      }
      if (!results) {
        // The sandbox couldn't run them: leave it to the student's press, with no verdict.
        if (sandboxed) {
          code = { ...code };
          delete code[id];
          if (!quiet) agent.testOffer(week, id);
          publish();
          return then(false);
        }
        code = { ...code, [id]: { phase: "error", error: `The tests couldn't run:\n${cleanOutput(text).slice(-1500)}` } };
      } else code = { ...code, [id]: { phase: results.failed ? "failed" : "passed", rev: task.rev, ...results } };
      if (quiet) {
        publish();
        return then(Boolean(results && !results.failed && results.passed > 0));
      }
      if (from && results) {
        const todo = results.waiting.length ? ` ${results.waiting.join(", ")} still to do.` : "";
        const socket = results.blocked ? ` ${results.blocked} more open a local socket, so they need Run its tests.` : "";
        if (results.failed) agent.say("bad", `\`${id}\`: ${results.failed} of its tests fail. First: ${results.failures[0]?.test ?? ""}: ${String(results.failures[0]?.message ?? "").split("\n")[0].slice(0, 300)}`);
        else if (results.blocked && !results.passed) agent.testOffer(week, id, `\`${id}\`: its tests open a local socket, so they can't run in the sandbox.${todo}`);
        else agent.commitOffer(week, id, `\`${id}\`: ${results.passed} test${results.passed === 1 ? "" : "s"} pass.${todo}${socket}`);
      } else if (from) agent.say("bad", `The tests for \`${id}\` couldn't run.`);
      publish();
      then(Boolean(results && !results.failed));
    });
  }

  /**
   * Where the student is in the Build view: each step's own tests, in order, in the sandbox, until the
   * first that isn't green. A step already checked at the same version of its code isn't run again.
   * @param {Record<string, unknown>} a
   */
  function buildCheck(a) {
    const dir = ctx.state.repoDir;
    const week = Number(a.week);
    if (!dir || !Number.isInteger(week) || !weekIn(week)) return reject(409, "That week isn't in your work yet.");
    if (checking) return ok;
    if (codeRun) {
      // Tests already running (the agent's turn just ended): check once they finish.
      if (!checkQueued) {
        checkQueued = true;
        void codeRun.done.then(() => setTimeout(() => ((checkQueued = false), buildCheck(a)), 0));
      }
      return ok;
    }
    const tasks = agentTaskList(dir, week);
    const steps = buildSteps(ctx, dir, week, tasks).filter((st) => st.found);
    checking = true;
    const next = (/** @type {number} */ i) => {
      const st = steps[i];
      if (!st) return void (checking = false);
      if (st.committed) return next(i + 1);
      if (st.testNote) return void (checking = false); // no test checks it: the student says when it's done
      const task = tasks.find((t) => t.id === st.id && t.week === st.week) ?? tasks.find((t) => t.id === st.id);
      if (!task) return void (checking = false);
      const known = code[task.id];
      if (known?.rev === task.rev && known.phase === "passed") return next(i + 1);
      if (known?.rev === task.rev && known.phase === "failed") return void (checking = false);
      runTaskTests(dir, task.week, task, "check", (green) => (green ? next(i + 1) : void (checking = false)));
    };
    next(0);
    return ok;
  }

  /** The commit for one task, once its tests pass as the file is now: only that task's file. @param {Record<string, unknown>} a */
  function commitCode(a) {
    const dir = ctx.state.repoDir;
    const week = Number(a.week);
    if (!dir || !Number.isInteger(week) || !weekIn(week)) return reject(409, "That week isn't in your work yet.");
    const task = weekCode(ctx, dir, week).find((t) => t.id === a.id);
    // A task no test checks yet (the guide says "Test: none yet") is committed once it's written.
    const untested = Boolean(task && !task.stubbed && task.needs && !Object.values(task.needs).some((ids) => ids.includes(task.id)));
    if (!task || (code[task.id]?.phase !== "passed" && !untested)) return reject(409, "Commit a task once its tests pass.");
    if (!untested && code[task.id]?.rev !== task.rev) return reject(409, "This task changed after its tests ran: run them again first.");
    // Once is enough: a second press would commit whatever else is in the file by then, under this task's name.
    if (code[task.id]?.done && code[task.id]?.rev === task.rev) return reject(409, "This task is already committed.");
    const message = `week ${week}: ${task.id}`;
    // The commit runs nothing the folder's config names: the agent can write .git/config and
    // .gitattributes, and this runs outside the sandbox. Hooks are off (a student's commit needs none:
    // the course's only hook is the instructor copy's pre-push). A filter or fsmonitor in the folder's
    // own config (the instructor copy's solutions filter is one) means it's committed in the terminal.
    if (gitRunsPrograms(ctx, dir, { hooks: false })) return reject(409, "This folder's git settings run a program on commit (a filter in .git/config), so the studio won't commit here: commit it in the terminal with git commit.");
    const noHooks = process.platform === "win32" ? "NUL" : "/dev/null";
    const r = ctx.capture(["git", "-c", `core.hooksPath=${noHooks}`, "-c", "core.fsmonitor=false", "-c", "commit.gpgSign=false", "commit", "-q", "-m", message, "--", task.file], dir);
    const said = `${r?.stdout ?? ""}${r?.stderr ?? ""}`;
    const committed = r?.code === 0 ? `Committed: ${message}` : /nothing (added )?to commit|no changes added/i.test(said) ? "Nothing new to commit: it's already in a commit." : `The commit didn't work: ${said.trim().split("\n")[0]}`;
    code = { ...code, [task.id]: { ...(code[task.id] ?? { phase: "passed" }), rev: task.rev, committed, done: r?.code === 0 || /already in a commit/.test(committed) } };
    agent.commitDone(task.id);
    publish();
    return { ...ok, said: committed };
  }

  /**
   * A turn on a selected task ended: the studio decides green itself from the measured tests,
   * whichever command Codex happened to run. It runs them inside Codex's sandbox, because nobody has
   * pressed anything yet, so agent-written code doesn't run outside it by itself.
   * @param {{ taskId: unknown, status: string }} done
   * @param {number} week
   */
  function onAgentTurnDone({ taskId, status }, week = 0) {
    const dir = ctx.state.repoDir;
    if (!dir || status !== "completed" || !taskId || !week) return;
    const task = agentTaskList(dir, week).find((t) => t.id === taskId);
    if (!task || task.stubbed) return;
    if (codeRun || !ctx.stream) return agent.testOffer(task.week, task.id);
    runTaskTests(dir, task.week, task, "sandbox");
  }

  /** The tasks the Agent tab can work on: this week's first, then earlier weeks' (a class may reach back). @param {string} dir @param {number} week */
  const agentTaskList = (dir, week) => {
    const out = [];
    // This week's first, then earlier weeks', then later ones (a class can reach either way, and
    // later weeks' code may be in the folder already).
    const order = [week, ...Array.from({ length: week - 1 }, (_, i) => week - 1 - i), ...Array.from({ length: Math.max(0, 9 - week) }, (_, i) => week + 1 + i)];
    for (const w of order) out.push(...weekCode(ctx, dir, w).map((t) => ({ ...t, week: w })));
    return out;
  };
  const agent = createAgent(ctx, {
    ...(options.agentTransport ? { transport: options.agentTransport } : {}),
    afterTurn: (done) => onAgentTurnDone(done, done.week),
    emit: (e) => {
      for (const l of listeners) l("agent", e);
    },
    weekTasks: (dir, week) => agentTaskList(dir, week),
    weekTitle: (week) => (meta.groups ?? []).find((g) => g.week === week)?.title ?? `Week ${week}`,
  });

  /** @param {number} week */
  async function runChecks(week) {
    const dir = ctx.state.repoDir;
    const g = (meta.groups ?? []).find((x) => x.week === week);
    if (!dir || !g || !(["setup", "done", "inwork", "open"].includes(g.status) || (g.status === "get" && current >= steps.length))) return reject(409, "That week isn't in your work yet.");
    if (checksRun) return reject(409, "The checks are already running.");
    checks = { week, phase: "running", out: "" };
    publish();
    const [argv, cwd] = checkCommand(dir, week);
    checksRun = /** @type {NonNullable<Context["stream"]>} */ (ctx.stream)(argv, cwd, (t) => {
      checks.out = (checks.out + t).slice(-40_000);
      publish();
    });
    const code = await checksRun.done;
    checksRun = null;
    checks = { ...checks, phase: code === 0 ? "passed" : "failed" };
    publish();
    return ok;
  }

  /**
   * One action from the browser. Anything that isn't allowed right now is refused, with a reason.
   * @param {{ type?: unknown, stepId?: unknown, index?: unknown, typed?: unknown, values?: unknown, answer?: unknown, to?: unknown, week?: unknown, id?: unknown, file?: unknown, rev?: unknown, body?: unknown }} a
   * @returns {Promise<{ ok: boolean, status: number, error: string, rev?: string }>}
   */
  async function act(a) {
    if (a.type === "board-start") return startBoard();
    if (a.type === "board-stop") {
      stopBoard();
      publish();
      return ok;
    }
    if (a.type === "checks") return runChecks(Number(a.week));
    if (typeof a.type === "string" && a.type.startsWith("agent-")) {
      // Only for a week in the student's work, the same as its page and checks.
      if (a.type === "agent-send" && !weekIn(Number(a.week))) return reject(409, "That week isn't in your work yet.");
      return agent.act(a);
    }
    if (a.type === "code-save") return saveCode(a);
    if (a.type === "code-test") return testCode(a);
    if (a.type === "build-check") return buildCheck(a);
    if (a.type === "code-commit") return commitCode(a);
    if (typeof a.type === "string" && a.type.startsWith("account-")) return accountAct(a);
    if (acct) return reject(409, "Finish changing the GitHub account first, or close it.");
    // Going back to an earlier step works from anywhere, the finish screen included.
    if (a.type === "back") {
      const to = Number(a.to);
      if (!Number.isInteger(to) || to < 1 || to > Math.min(current, steps.length)) return reject(409, "You can only go back to an earlier step.");
      void enter(to - 1);
      return ok;
    }
    const step = steps[current];
    if (!step) return reject(409, "Setup is finished.");
    if (a.stepId !== step.id) return reject(409, "That isn't the current step. Steps go in order.");
    const action = plan[view.index];
    const mine = attempt;
    switch (a.type) {
      case "run": {
        if (view.phase !== "ready" || action?.kind !== "command" || a.index !== view.index) return reject(409, "There's no command to run right now.");
        const command = /** @type {Command} */ (commandOf(action, ctx));
        if (typeof a.typed !== "string" || normalizeCommand(a.typed) !== normalizeCommand(command.display)) return reject(400, "What was typed doesn't match the command.");
        void runCommand(command, mine);
        return ok;
      }
      case "pick-folder": {
        // The computer's own folder picker, for the folder question; the chosen path fills the box.
        if (view.phase !== "ready" || a.index !== view.index || action?.kind !== "folder") return reject(409, "There's no folder to choose right now.");
        if (!ctx.pickFolder || ctx.dryRun) return reject(409, "Type the folder's path instead.");
        const picked = await ctx.pickFolder(action.initial(ctx), action.label);
        if (mine !== attempt) return ok;
        if (picked) view = { ...view, picked, formError: "", missing: "" };
        publish();
        return ok;
      }
      case "submit": {
        if (view.phase !== "ready" || a.index !== view.index || !action) return reject(409, "There's nothing to answer right now.");
        const values = /** @type {Record<string, string>} */ (typeof a.values === "object" && a.values !== null ? a.values : {});
        if (action.kind === "form") {
          const result = action.submit(ctx, values);
          if (result.error) {
            view = { ...view, formError: result.error };
            publish();
            return ok;
          }
          for (const c of result.commands ?? []) {
            if (!ctx.dryRun) ctx.execute(c.argv, c.cwd);
            ran[current].push(c.display);
          }
          if (ctx.dryRun) {
            (ctx.state.dryDone ??= {})[step.id] = true;
            if (result.found) (ctx.state.dryFound ??= {})[step.id] = result.found;
          }
        } else if (action.kind === "folder") {
          // "Create it" only makes the very folder the studio offered to make.
          const create = view.missing && values.create === view.missing ? view.missing : "";
          const error = action.submit(ctx, String(values.folder ?? ""), { create });
          if (error && typeof error === "object") {
            view = { ...view, formError: `There's no folder at ${tildify(error.missing)}.`, missing: error.missing };
            publish();
            return ok;
          }
          if (error) {
            view = { ...view, formError: error, missing: "" };
            publish();
            return ok;
          }
          await next(mine);
          return ok;
        } else if (action.kind === "choice") {
          action.submit(ctx);
          if (ctx.dryRun) (ctx.state.dryDone ??= {})[step.id] = true;
        } else return reject(409, "There's nothing to answer right now.");
        const r = await checkStep(step, ctx);
        if (r.done) pass(r.found);
        else fail({ what: `Still not done: ${r.found}`, fix: step.hint(ctx) });
        return ok;
      }
      case "confirm": {
        if (view.phase !== "confirm" || !step.confirm) return reject(409, "There's no question right now.");
        step.confirm(ctx, a.answer === "yes");
        if (a.answer === "yes") {
          if (ctx.dryRun) (ctx.state.dryDone ??= {})[step.id] = true;
          await enter(current, true);
          return ok;
        }
        attempt++;
        plan = step.plan(planCtx);
        view = blank("ready");
        publish();
        return ok;
      }
      case "next":
        if (view.phase !== "passed") return reject(409, "This step isn't done yet.");
        void enter(current + 1);
        return ok;
      case "skip":
        if (!step.optional) return reject(409, "Only optional steps can be skipped.");
        marks[current] = "skipped";
        found[current] = "Skipped: you can do this later.";
        void enter(current + 1);
        return ok;
      case "retry":
        if (view.phase !== "failed" && view.phase !== "waiting" && !(view.phase === "running" && view.waitFor === "browser")) return reject(409, "Nothing to try again.");
        void enter(current);
        return ok;
      case "recheck": {
        if (!["waiting", "failed", "running"].includes(view.phase)) return ok;
        if (view.phase === "running" && view.waitFor !== "browser") return ok;
        const r = await checkStep(step, ctx);
        if (mine !== attempt) return ok;
        if (r.done) {
          attempt++; // the running command's own ending no longer counts
          child?.kill();
          child = null;
          pass(r.found);
          return ok;
        }
        if (view.phase !== "waiting") return ok;
        // Back from a window or a terminal (the Homebrew installer): carry on if the plan moved on.
        const fresh = step.plan(planCtx);
        const before = commandOf(plan[view.index], ctx)?.display;
        if (commandOf(fresh[0], ctx)?.display !== before) {
          // A new plan is a new attempt: the page starts a fresh command line for it.
          attempt++;
          plan = fresh;
          view = blank("ready");
        } else view = { ...view, note: `Not finished yet: ${r.found}` };
        publish();
        return ok;
      }
      case "check-all":
        if (view.phase === "checking" || (view.phase === "running" && view.waitFor !== "browser")) return reject(409, "Wait for this step to finish first.");
        void checkAll();
        return ok;
      case "change": {
        if (!step.changeable || view.phase !== "passed") return reject(409, "This step can't be changed here.");
        attempt++;
        plan = step.plan(planCtx);
        view = blank("ready");
        publish();
        return ok;
      }
      default:
        return reject(400, "Unknown action.");
    }
  }

  /**
   * "Use a different account": open it, pick one of gh's accounts (or add one), type its command,
   * run it. Afterwards every step that depends on the account is checked again.
   * @param {{ type?: unknown, choice?: unknown, typed?: unknown }} a
   */
  async function accountAct(a) {
    switch (a.type) {
      case "account-open": {
        if (acct) return ok;
        if (!canChange) return reject(409, "The account can only be changed in the step that signs you in.");
        if (child) return reject(409, "Wait for the command that's running to finish, then change the account.");
        const accounts = ctx.dryRun && ctx.fresh ? [] : ghAccounts(ctx);
        const using = accounts.find((x) => x.active);
        if (using && !ctx.dryRun) active = using.login;
        acct = { phase: "choose", accounts, choice: "", command: null, attempt: 0, error: "", code: "", url: "", before: null };
        publish();
        return ok;
      }
      case "account-close": {
        if (!acct) return ok;
        acctRun++;
        if (acct.phase === "running") {
          child?.kill();
          child = null;
        }
        acct = null;
        publish();
        return ok;
      }
      case "account-pick": {
        if (!acct || acct.phase === "running") return reject(409, "There's nothing to choose right now.");
        /** @type {Command} */
        let command;
        if (a.choice === "add") command = addAccountCommand();
        else {
          const pick = acct.accounts.find((x) => !x.active && x.login === a.choice);
          if (!pick || !isGithubUsername(pick.login)) return reject(400, "gh doesn't know that account on this laptop.");
          command = switchAccountCommand(pick.login);
        }
        acct = { ...acct, phase: "ready", choice: String(a.choice), command, attempt: acct.attempt + 1, error: "" };
        publish();
        return ok;
      }
      case "account-back": {
        if (!acct || acct.phase === "running") return reject(409, "There's nothing to go back to.");
        acct = { ...acct, phase: "choose", choice: "", command: null, error: "" };
        publish();
        return ok;
      }
      case "account-run": {
        if (!acct || acct.phase !== "ready" || !acct.command) return reject(409, "There's no command to run right now.");
        if (typeof a.typed !== "string" || normalizeCommand(a.typed) !== normalizeCommand(acct.command.display)) return reject(400, "What was typed doesn't match the command.");
        void runAccount(acct.command);
        return ok;
      }
      case "account-recheck": {
        // Back from signing in to another account in the browser: done once gh uses a new one.
        if (!acct || acct.phase !== "running" || acct.command?.waitFor !== "browser" || ctx.dryRun) return ok;
        const now = ghActiveAccount(ctx);
        if (now && now !== acct.before) {
          acctRun++;
          child?.kill();
          child = null;
          await finishAccount();
        }
        return ok;
      }
      default:
        return reject(400, "Unknown action.");
    }
  }

  /** @param {Command} command */
  async function runAccount(command) {
    if (!acct) return;
    const mine = ++acctRun;
    acct = { ...acct, phase: "running", code: "", url: "", before: active };
    out = "";
    outputId++;
    for (const l of listeners) l("output", { id: outputId, text: "", reset: true });
    publish();
    const run = /** @type {NonNullable<Context["stream"]>} */ (ctx.stream)(command.argv, command.cwd, (chunk) => {
      if (mine !== acctRun) return;
      out = (out + chunk).slice(-OUTPUT_LIMIT);
      for (const l of listeners) l("output", { id: outputId, text: chunk });
      if (command.waitFor === "browser" && acct && !acct.code) {
        const clean = cleanOutput(out);
        const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(clean)?.[1] ?? "";
        const url = /(https:\/\/\S+)/.exec(clean)?.[1] ?? "";
        if (code || url) {
          if (command.openUrl && url && /Open this URL/i.test(clean)) ctx.openUrl?.(url);
          acct = { ...acct, code, url };
          publish();
        }
      }
    });
    child = run;
    const code = await run.done;
    if (mine !== acctRun || !acct) return;
    child = null;
    if (code !== 0) {
      const said = lastLine(cleanOutput(out));
      acct = { ...acct, phase: "failed", error: `\`${command.display}\` stopped with an error (exit code ${code}).${said ? ` gh said: ${said}` : ""}` };
      return publish();
    }
    await finishAccount();
  }

  /** The switch (or sign-in) worked: use the new account, and check again what depends on it. */
  async function finishAccount() {
    const choice = acct?.choice ?? "";
    const wasUsing = acct?.before ?? active; // the account gh used before this switch
    const wasCourse = ctx.state.login ?? wasUsing; // the account the course was set up with
    acct = null;
    const now = ctx.dryRun ? (isGithubUsername(choice) ? choice : wasUsing) : ghActiveAccount(ctx);
    active = now;
    const changed = Boolean(now && (now !== wasUsing || now !== wasCourse));
    if (now) ctx.state.login = now; // the student chose this account: it's the course account now
    if (now && now !== wasCourse) delete ctx.state.doctorOk; // the doctor checks you can push: run it again
    if (!ctx.dryRun) ctx.save?.();
    // Check again every other step already done that depends on the account. This step is checked
    // again by entering it (it updates in place); the others are done again when the student gets there.
    /** @type {number[]} */
    const again = [];
    for (let i = 0; i < steps.length; i++) {
      if (i === current || marks[i] !== "done" || !ACCOUNT_STEPS.has(steps[i].id)) continue;
      const r = await checkStep(steps[i], ctx);
      found[i] = r.found;
      if (!r.done) {
        marks[i] = "pending";
        again.push(i + 1);
      }
    }
    const list = again.length > 1 ? `Steps ${again.slice(0, -1).join(", ")} and ${again.at(-1)}` : `Step ${again[0]}`;
    notice = !changed
      ? ""
      : again.length
        ? `${list} ${again.length > 1 ? "need" : "needs"} doing again for ${now}: ${found[again[0] - 1]}`
        : `You're now using ${now} on GitHub. Everything done so far still holds for ${now}.`;
    keepNotice = true;
    await enter(current);
  }

  return {
    start: () => enter(0),
    act,
    snapshot,
    /**
     * A week's page (or its guide when it has no page) from the student's folder, once that week is
     * in their work. Only docs/weeks/week-NN.html or .md, inside the course folder; null otherwise.
     * @param {number} week
     * @returns {string | null}  the page's path in the course folder
     */
    weekPage: (week) => {
      const g = (meta.groups ?? []).find((x) => x.week === week);
      const isIn = g && (["setup", "done", "inwork", "open"].includes(g.status) || (g.status === "get" && current >= steps.length));
      const dir = ctx.state.repoDir;
      if (!isIn || !dir) return null;
      for (const rel of [g.page, g.guide ?? `docs/weeks/week-${pad2(week)}.md`]) {
        if (rel && /^docs\/weeks\/week-\d{2}\.(html|md)$/.test(rel) && ctx.exists(join(dir, rel))) return rel;
      }
      return null;
    },
    /**
     * A released week's page to fetch from the course on GitHub, when this laptop doesn't have it
     * yet (week 1 during setup, before the course is downloaded). Same paths only; null otherwise.
     * @param {number} week
     * @returns {string | null}
     */
    weekPageOnline: (week) => {
      // Only before the course is on this laptop (setup): once it is, a week's page shows when the
      // week is in the student's work, as always.
      if (ctx.state.repoDir) return null;
      const g = (meta.groups ?? []).find((x) => x.week === week);
      if (!g || !["setup", "done", "inwork", "get", "open"].includes(g.status)) return null;
      for (const rel of [g.page, g.guide ?? `docs/weeks/week-${pad2(week)}.md`]) if (rel && /^docs\/weeks\/week-\d{2}\.(html|md)$/.test(rel)) return rel;
      return null;
    },
    /** The course folder, once there is one. */
    repoDir: () => ctx.state.repoDir ?? null,
    /** The file viewer's tree: the course folder's files and their git status. */
    files: () => {
      const dir = ctx.state.repoDir;
      return dir ? fileTree(ctx, dir) : { status: 409, error: "The course folder isn't set up yet." };
    },
    /** One file, read-only, for the viewer. @param {unknown} rel */
    file: (rel) => (ctx.state.repoDir ? viewFile(ctx, ctx.state.repoDir, rel) : { status: 409, error: "The course folder isn't set up yet." }),
    /** One file's uncommitted changes, for the viewer. @param {unknown} rel */
    diff: (rel) => (ctx.state.repoDir ? viewDiff(ctx, ctx.state.repoDir, rel) : { status: 409, error: "The course folder isn't set up yet." }),
    /** Tests the studio started are running (a task's save, or the week's checks). */
    busy: () => Boolean(codeRun || checksRun || agent.busy()),
    /** The picker's list in the Agent tab, once the week is in the student's work. @param {number} week */
    agentTasks: (week) => {
      const dir = ctx.state.repoDir;
      if (!dir || !weekIn(week)) return null;
      return agentTaskList(dir, week).map((t) => ({ id: t.id, week: t.week, description: t.description }));
    },
    /** The Build tab's steps for a week, from its guide, each with where its task stands. @param {number} week */
    buildSteps: (week) => {
      const dir = ctx.state.repoDir;
      if (!dir || !weekIn(week)) return null;
      return buildSteps(ctx, dir, week, agentTaskList(dir, week));
    },
    /** The Agent tab's state: a snapshot; numbered "agent" events follow it. */
    agentSnapshot: () => agent.snapshot(),
    /** Ends what the studio started and waits, boundedly, for its Codex to go. */
    shutdown: () => agent.shutdown(),
    /**
     * A week's tasks to write in the studio (its Code tab), once the week is in the student's work.
     * @param {number} week
     */
    weekCode: (week) => (ctx.state.repoDir && weekIn(week) ? weekCode(ctx, ctx.state.repoDir, week) : null),
    output: () => ({ id: outputId, text: out }),
    /** @param {(event: string, data: unknown) => void} listener */
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => {
      child?.kill();
      child = null;
      checksRun?.kill();
      stopBoard();
    },
  };
}

// ── The Agent tab: the student's own Codex, driven from the studio ──────────────────
// Node owns one `codex app-server` child (newline-delimited JSON-RPC on stdio), one thread per
// course folder and one turn at a time. The browser never sees raw RPC: it gets a snapshot plus
// numbered events, and can only ask for the few actions below. Written against the public protocol
// (generate its types with `codex app-server generate-ts`); checked on 0.166.0.

/**
 * The command for only this task's own tests: from the measured map, those that need just this task.
 * Their shared start of a name if nothing else in those files has it, else their names; without
 * measured data, the task's test files.
 * @param {{ id: string, tests: string[], needs?: Record<string, string[]> | null }} task
 */
export function focusedTestCommand(task) {
  const quote = (/** @type {string} */ t) => `"${t.replace(/[\\"$\`]/g, "\\$&")}"`;
  const regex = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entries = Object.entries(task.needs ?? {});
  const own = entries.filter(([, ids]) => ids.length === 1 && ids[0] === task.id).map(([key]) => key);
  if (!own.length) return `npx vitest run ${task.tests.join(" ")}`;
  const files = [...new Set(own.map((k) => k.split(" > ")[0]))];
  const names = own.map((k) => k.slice(k.indexOf(" > ") + 3));
  let prefix = names[0];
  for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = /^(.*\s)/.exec(prefix)?.[1] ?? (names.length === 1 ? prefix : "");
  const others = entries.map(([key]) => key).filter((k) => !own.includes(k) && files.includes(k.split(" > ")[0])).map((k) => k.slice(k.indexOf(" > ") + 3));
  if (names.length === 1) prefix = names[0];
  const pattern = prefix.length >= 4 && !others.some((n) => n.startsWith(prefix)) ? `^${regex(prefix)}` : names.map(regex).join("|");
  return pattern.length > 600 ? `npx vitest run ${files.join(" ")}` : `npx vitest run ${files.join(" ")} -t ${quote(pattern)}`;
}

/** The oldest Codex the bridge has been run against. Older ones get the update command. */
export const CODEX_MIN_VERSION = "0.166.0";
const CODEX_UPDATE = "npm install -g @openai/codex@latest";
const CODEX_INSTALL = "npm install -g @openai/codex";
/** The permissions every thread and turn asks for explicitly, never inherited from the student's config. */
export const AGENT_APPROVAL_POLICY = "on-request";
export const AGENT_SANDBOX_MODE = "workspace-write";
export const AGENT_SANDBOX_POLICY = { type: "workspaceWrite", writableRoots: [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
export const AGENT_PERMISSIONS_LINE = "Without asking, Codex can read files on your laptop and change files and run commands in your course folder. It asks here before using the internet (the course's bus tests count), changing anything else outside that folder (temporary folders aside) or making a git commit.";
/**
 * Overrides for the student's config.toml on every thread, so the line above stays true whatever it
 * says: no extra writable folders, no network, and no tools that act without a card (web search and
 * sub-agents have no approval path here).
 */
export const AGENT_CONFIG = { sandbox_workspace_write: { writable_roots: [], network_access: false }, web_search: "disabled", features: { multi_agent: false } };
/** Studio's teaching policy, as trusted instructions for the thread. The course's rules are in the repo's AGENTS.md. */
export const AGENT_POLICY = `You are working with a student inside NetSim Studio, on their own copy of the NetSim course. The repo's AGENTS.md has the course's rules. Each message may start with a <studio-context> block from the studio: the week, the selected task and its focused test command.
- The student leads. If the message already names an approach, use it; ask for their approach only when it doesn't. Also: when the <studio-context> says "Guided step", the course's prompt is the approach they chose: don't ask, go ahead.
- Before each change, say in a sentence or two what you'll change and why. Stay inside the selected task. You may write the code; they must be able to explain it, so explain it.
- After a change, run the task's focused test command and read the result with them.
- Ask before moving on to a different task. Never edit tests.
- Don't open or copy from studio/hints/: those are the course's answers for the grey hints in the app.
- A test failing with "listen EPERM" is the sandbox blocking its local socket, not their code: ask to run it again outside the sandbox and say why.`;

const RPC_TIMEOUT_MS = { initialize: 5 * 60_000, default: 60_000 };
const AGENT_MAX_ENTRIES = 400;
const AGENT_MAX_TEXT = 200_000;
const AGENT_MAX_OUTPUT = 20_000;
const AGENT_MAX_MESSAGE = 20_000;
const AGENT_MAX_LINE = 32 * 1024 * 1024;

/** @param {string} a @param {string} b  is version a older than b? */
export function versionOlder(a, b) {
  const parts = (/** @type {string} */ v) => v.split(/[.-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

/**
 * A running `codex app-server`: JSON messages in and out, and a bounded way to end it (only this
 * child and what it started).
 * @typedef {{ send: (message: object) => void, onMessage: (fn: (message: any) => void) => void, onBadLine: (fn: (line: string) => void) => void, onClose: (fn: (why: { code: number | null, signal: string | null, error?: string, stderr: string }) => void) => void, stop: (graceMs?: number) => Promise<void> }} AgentTransport
 */

/**
 * @param {Context} ctx
 * @param {string} cwd
 * @returns {AgentTransport}
 */
export function codexTransport(ctx, cwd) {
  const windows = ctx.platform === "windows";
  // Fixed arguments only: nothing the student types ever goes on this command line, so the Windows
  // shim's shell sees nothing of theirs. Their words go over stdio.
  const child = spawn("codex", [...CODEX_FLAGS, "app-server"], { cwd, env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"], shell: windows, detached: !windows, windowsHide: true });
  /** @type {(message: any) => void} */
  let message = () => {};
  /** @type {(line: string) => void} */
  let bad = () => {};
  /** @type {(why: { code: number | null, signal: string | null, error?: string, stderr: string }) => void} */
  let closed = () => {};
  let buffer = "";
  let stderr = "";
  let done = false;
  /** @type {(() => void)[]} */
  const waiters = [];
  const finish = (/** @type {number | null} */ code, /** @type {string | null} */ signal, /** @type {string | undefined} */ error) => {
    if (done) return;
    done = true;
    closed({ code, signal, ...(error ? { error } : {}), stderr });
    for (const w of waiters) w();
  };
  const signalTree = (/** @type {NodeJS.Signals} */ signal) => {
    if (child.pid === undefined) return;
    try {
      if (windows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, signal);
    } catch {
      // already gone
    }
  };
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > AGENT_MAX_LINE) {
      buffer = "";
      bad("(a message too long to read)");
      return;
    }
    for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      /** @type {unknown} */
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        bad(line);
        continue;
      }
      message(parsed);
    }
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr = (stderr + chunk).slice(-4000)));
  child.stdin.on("error", () => {}); // a write after it died: the close below says so
  child.on("error", (error) => finish(null, null, /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" ? "ENOENT" : error.message));
  child.on("close", (code, signal) => finish(code, signal));
  return {
    send: (m) => {
      if (!done) child.stdin.write(`${JSON.stringify(m)}\n`);
    },
    onMessage: (fn) => (message = fn),
    onBadLine: (fn) => (bad = fn),
    onClose: (fn) => (closed = fn),
    // End of stdin asks it to leave, and it ends the commands it started (they're in their own
    // sessions, out of reach of a signal to this group: measured on 0.166.0). Then a bounded wait,
    // then this child's group in case it hung.
    stop: (graceMs = 2500) =>
      new Promise((resolve) => {
        if (done) return resolve();
        waiters.push(resolve);
        child.stdin.end();
        const term = setTimeout(() => signalTree("SIGTERM"), graceMs * 0.8);
        const kill = setTimeout(() => {
          signalTree("SIGKILL");
          setTimeout(resolve, 200);
        }, graceMs);
        waiters.push(() => {
          clearTimeout(term);
          clearTimeout(kill);
        });
      }),
  };
}

/** What an approval is about, in a form that changes when any of it changes. @param {string} method @param {any} params @param {unknown} changes */
function approvalFingerprint(method, params, changes) {
  const rest = { ...(params ?? {}) };
  delete rest.startedAtMs;
  return createHash("sha256").update(JSON.stringify([method, rest, changes ?? null])).digest("hex").slice(0, 24);
}

/**
 * The bridge. Everything about the child, the thread, the turn and the pending approvals lives here,
 * so a browser refresh only re-reads it.
 * @param {Context} ctx
 * @param {{ transport?: (cwd: string) => AgentTransport, emit?: (event: object) => void, weekTasks?: (dir: string, week: number) => { id: string, file: string, description: string, tests: string[] }[], weekTitle?: (week: number) => string, stopWaitMs?: number, afterTurn?: (done: { week: number, taskId: unknown, status: string, commands: { command: string, exitCode: unknown, status: string, output: string }[] }) => void }} [options]
 */
export function createAgent(ctx, { transport = (cwd) => codexTransport(ctx, cwd), emit = () => {}, weekTasks = () => [], weekTitle = (week) => `Week ${week}`, stopWaitMs = 15_000, afterTurn = () => {} } = {}) {
  /** @type {"off" | "starting" | "missing" | "too-old" | "signed-out" | "signing-in" | "ready" | "failed" | "unavailable"} */
  let phase = "off";
  let seq = 0;
  let generation = 0;
  let version = "";
  /** @type {{ type: string, email?: string | null, planType?: string } | null} */
  let account = null;
  let problem = "";
  let loginUrl = "";
  /** @type {AgentTransport | null} */
  let link = null;
  let threadId = "";
  /** @type {{ id: string, status: "starting" | "running" | "stopping" } | null} */
  let turn = null;
  /** @type {{ phase: "running" | "failed", out: string, display: string } | null} */
  let fix = null;
  /** @type {{ id: string, kind: string, [key: string]: unknown }[]} */
  let entries = [];
  /**
   * The approvals waiting for the student. Each answer has to name all of this, so a card from
   * another process, turn or item, or one whose content changed, can't authorize anything.
   * @type {{ key: string, generation: number, threadId: string, turnId: string, itemId: string, approvalId: string, requestId: number | string, method: string, fingerprint: string, kind: "command" | "file", command: string, cwd: string, reason: string, grantRoot: string, changes: { path: string, kind: string, diff: string, movePath?: string }[] }[]}
   */
  let cards = [];
  let nextRpc = 1;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout, method: string }>} */
  const rpcs = new Map();
  let notedHints = false;
  let lastClientId = "";
  let noteId = 0;
  /** @type {NodeJS.Timeout | null} */
  let stopTimer = null;
  let shuttingDown = false;
  /** @type {Set<string>} commands the student's Stop ended: they read "stopped", whatever Codex reports after */
  const stoppedRows = new Set();
  let runsLater = ""; // what warnIfRunsLater last said
  let lastWeek = 0; // the week and task of the message being answered
  /** @type {unknown} */
  let lastTask = "";
  let closingOnPurpose = false; // the child is being ended because it's too old: keep saying that

  const repo = () => {
    const dir = ctx.state.repoDir;
    if (!dir) return null;
    try {
      return realpathSync(dir);
    } catch {
      return null;
    }
  };
  const fail = (/** @type {number} */ status, /** @type {string} */ error) => ({ ok: false, status, error });
  const good = { ok: true, status: 200, error: "" };

  /** The non-transcript part of the state. */
  const stateNow = () => ({
    phase,
    generation,
    version,
    minVersion: CODEX_MIN_VERSION,
    account: account && { type: account.type, ...(account.email ? { email: account.email } : {}), ...(account.planType ? { planType: account.planType } : {}) },
    problem,
    loginUrl,
    threadId,
    turn: turn && { id: turn.id, status: turn.status },
    fix,
    fixCommand: phase === "missing" ? CODEX_INSTALL : phase === "too-old" ? CODEX_UPDATE : "",
    cards: cards.map((c) => ({ key: c.key, kind: c.kind, command: c.command, cwd: c.cwd, reason: c.reason, grantRoot: c.grantRoot, changes: c.changes })),
    permissions: AGENT_PERMISSIONS_LINE,
  });
  const snapshot = () => ({ seq, ...stateNow(), entries });
  const event = (/** @type {object} */ e) => emit({ seq: ++seq, ...e });
  const publishState = () => event({ type: "state", state: stateNow() });

  /** @param {{ id: string, kind: string, [key: string]: unknown }} entry */
  function put(entry) {
    const at = entries.findIndex((x) => x.id === entry.id);
    if (at >= 0) entries[at] = { ...entries[at], ...entry };
    else {
      entries.push(entry);
      if (entries.length > AGENT_MAX_ENTRIES) entries = entries.slice(-AGENT_MAX_ENTRIES);
    }
    event({ type: "entry", entry: at >= 0 ? entries[at] : entry });
  }
  const note = (/** @type {"info" | "bad"} */ tone, /** @type {string} */ text) => put({ id: `note-${++noteId}`, kind: "note", tone, text });

  // ── RPC ──
  /** @param {string} method @param {unknown} params @returns {Promise<any>} */
  function rpc(method, params) {
    const current = link;
    if (!current) return Promise.reject(new Error("Codex isn't running."));
    const id = nextRpc++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rpcs.delete(id);
        const err = /** @type {Error & { ambiguous?: boolean }} */ (new Error(`Codex didn't answer ${method} in time.`));
        err.ambiguous = true;
        reject(err);
      }, method === "initialize" ? RPC_TIMEOUT_MS.initialize : RPC_TIMEOUT_MS.default);
      rpcs.set(id, { resolve, reject, timer, method });
      current.send({ id, method, params });
    });
  }

  /** @param {any} m */
  function onMessage(m) {
    if (m === null || typeof m !== "object") return;
    if (m.id !== undefined && m.method === undefined) {
      const waiting = typeof m.id === "number" ? rpcs.get(m.id) : undefined;
      if (!waiting) return;
      rpcs.delete(m.id);
      clearTimeout(waiting.timer);
      if (m.error) waiting.reject(new Error(String(m.error.message ?? "Codex refused that.")));
      else waiting.resolve(m.result);
      return;
    }
    if (typeof m.method !== "string") return;
    if (m.id !== undefined) return onServerRequest(m.id, m.method, m.params ?? {});
    onNotification(m.method, m.params ?? {});
  }

  // ── Approvals ──
  const cardKey = (/** @type {{ generation: number, threadId: string, turnId: string, itemId: string, approvalId: string, requestId: number | string, fingerprint: string }} */ c) =>
    [c.generation, c.threadId, c.turnId, c.itemId, c.approvalId, c.requestId, c.fingerprint].join("|");
  /** A path as the student knows it: inside the course folder, relative to it. @param {string} p */
  const shortPath = (p) => {
    const dir = repo();
    return dir && p.startsWith(`${dir}/`) ? p.slice(dir.length + 1) : p;
  };
  const fileChanges = (/** @type {unknown} */ changes) =>
    (Array.isArray(changes) ? changes : []).map((c) => ({
      path: shortPath(String(c?.path ?? "")),
      kind: String(typeof c?.kind === "object" ? (c.kind?.type ?? "update") : (c?.kind ?? "update")),
      diff: String(c?.diff ?? "").slice(0, AGENT_MAX_OUTPUT),
      ...(c?.kind?.move_path ? { movePath: String(c.kind.move_path) } : {}),
    }));

  /** @param {number | string} id @param {string} method @param {any} params */
  function onServerRequest(id, method, params) {
    const current = link;
    if (!current) return;
    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
      // Another thread's request (one this studio didn't start), or no turn of ours: no.
      if (params.threadId !== threadId || !turn || (turn.id && params.turnId !== turn.id)) {
        current.send({ id, result: { decision: "decline" } });
        return note("info", "Codex asked for an approval outside this conversation's current turn, so it was declined.");
      }
      const kind = method === "item/commandExecution/requestApproval" ? "command" : "file";
      const itemId = String(params.itemId ?? "");
      const approvalId = String(params.approvalId ?? "");
      const entry = entries.find((x) => x.id === itemId);
      const changes = kind === "file" ? (/** @type {{ path: string, kind: string, diff: string, movePath?: string }[]} */ (entry?.changes) ?? []) : [];
      // A card must show everything Approve would grant. Anything it can't: no, and say so.
      const hidden =
        kind === "command"
          ? params.kind !== undefined && params.kind !== "command"
            ? "typing into a running command"
            : params.additionalPermissions
              ? "extra permissions"
              : params.networkApprovalContext
                ? "network access to a host"
                : ""
          : changes.length === 0
            ? "a file change it didn't list"
            : "";
      if (hidden) {
        current.send({ id, result: { decision: "decline" } });
        return note("info", `Codex asked to approve ${hidden}, which the studio can't show on a card, so it was declined.`);
      }
      const fingerprint = approvalFingerprint(method, params, changes);
      // A new request for the same item replaces its card: the old one can't be answered any more.
      for (const old of cards.filter((c) => c.itemId === itemId && c.approvalId === approvalId && c.requestId !== id)) current.send({ id: old.requestId, result: { decision: "decline" } });
      cards = cards.filter((c) => !(c.itemId === itemId && c.approvalId === approvalId));
      const base = { generation, threadId, turnId: String(params.turnId ?? ""), itemId, approvalId, requestId: id, fingerprint };
      cards.push({
        ...base,
        key: cardKey(base),
        method,
        kind,
        command: String(params.command ?? entry?.command ?? ""),
        cwd: String(params.cwd ?? ""),
        reason: String(params.reason ?? ""),
        grantRoot: String(params.grantRoot ?? ""),
        changes,
      });
      return publishState();
    }
    // Everything else the studio can't show (MCP forms, extra permissions, the older approval
    // messages, questions): a clear no, so the turn doesn't hang, and the student hears about it.
    if (method === "applyPatchApproval" || method === "execCommandApproval") current.send({ id, result: { decision: "denied" } });
    else current.send({ id, error: { code: -32601, message: "NetSim Studio doesn't support this request." } });
    note("info", `Codex asked for something the studio can't show here (${method.slice(0, 80)}), so it was declined.`);
  }

  /**
   * The student's answer to one card. It must name the exact card; once answered, replaced, or from
   * an earlier process, thread or turn, it's refused and nothing reaches Codex.
   * @param {Record<string, unknown>} a
   */
  function answer(a) {
    if (a.decision !== "accept" && a.decision !== "decline") return fail(400, "That isn't an answer the studio knows.");
    const card = cards.find((c) => c.key === a.key);
    if (!card || card.generation !== generation || card.threadId !== threadId || !turn) return fail(409, "That approval is out of date: Codex isn't waiting for it any more.");
    if (turn.id && card.turnId !== turn.id) return fail(409, "That approval is from an earlier turn.");
    if (!link) return fail(409, "Codex isn't running.");
    cards = cards.filter((c) => c !== card);
    link.send({ id: card.requestId, result: { decision: a.decision } });
    publishState();
    return good;
  }

  // ── The conversation, from Codex's items ──
  /** @param {any} item @param {boolean} [finished] */
  function putItem(item, finished = false) {
    if (!item || typeof item.id !== "string") return;
    const id = item.id;
    if (item.type === "agentMessage") {
      put({ id, kind: "agent", text: String(item.text ?? (entries.find((x) => x.id === id)?.text ?? "")).slice(-AGENT_MAX_TEXT), done: finished });
    } else if (item.type === "commandExecution") {
      const output = item.aggregatedOutput ?? entries.find((x) => x.id === id)?.output ?? "";
      put({ id, kind: "command", command: String(item.command ?? ""), status: stoppedRows.has(id) ? "stopped" : String(item.status ?? ""), output: String(output).slice(-AGENT_MAX_OUTPUT), exitCode: item.exitCode ?? null });
      if (/studio[\\/]hints/.test(String(item.command ?? "")) && !notedHints) {
        notedHints = true;
        note("info", "Codex opened the course's hints file (studio/hints). The course asks it not to copy answers from there: check you can explain what it writes.");
      }
    } else if (item.type === "fileChange") {
      const changes = fileChanges(item.changes);
      put({ id, kind: "file", changes, status: String(item.status ?? "") });
    } else if (item.type === "webSearch") {
      put({ id, kind: "note", tone: "info", text: "Codex searched the web." });
    } else if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
      put({ id, kind: "note", tone: "info", text: `Codex used a tool: ${String(item.tool ?? "").slice(0, 80)}.` });
    }
  }

  /** @param {string} method @param {any} params */
  function onNotification(method, params) {
    if (method === "account/login/completed") {
      loginUrl = "";
      if (!params.success) problem = String(params.error ?? "Signing in didn't finish.");
      void readAccount();
      return;
    }
    if (method === "account/updated") {
      if (phase === "signed-out" || phase === "signing-in") void readAccount();
      return;
    }
    if (params.threadId !== undefined && params.threadId !== threadId) return;
    switch (method) {
      case "turn/started":
        if (turn && !turn.id && params.turn?.id) {
          turn.id = String(params.turn.id);
          if (turn.status === "starting") turn.status = "running";
          publishState();
        }
        return;
      case "item/started":
      case "item/completed":
        if (turn && params.turnId && turn.id && params.turnId !== turn.id) return;
        return putItem(params.item, method === "item/completed");
      case "item/agentMessage/delta": {
        const id = String(params.itemId ?? "");
        const entry = entries.find((x) => x.id === id);
        if (!entry) put({ id, kind: "agent", text: "", done: false });
        const target = /** @type {{ text: string }} */ (/** @type {unknown} */ (entries.find((x) => x.id === id)));
        target.text = (target.text + String(params.delta ?? "")).slice(-AGENT_MAX_TEXT);
        return event({ type: "delta", id, field: "text", text: String(params.delta ?? "") });
      }
      case "item/commandExecution/outputDelta": {
        const id = String(params.itemId ?? "");
        const entry = /** @type {{ output?: string } | undefined} */ (entries.find((x) => x.id === id));
        if (!entry) return;
        entry.output = `${entry.output ?? ""}${String(params.delta ?? "")}`.slice(-AGENT_MAX_OUTPUT);
        return event({ type: "delta", id, field: "output", text: String(params.delta ?? "") });
      }
      case "item/fileChange/patchUpdated": {
        const id = String(params.itemId ?? "");
        const changes = fileChanges(params.changes);
        put({ id, kind: "file", changes, status: String(entries.find((x) => x.id === id)?.status ?? "inProgress") });
        // The patch changed under a pending card: it gets a new key, so the old answer is refused.
        cards = cards.map((c) => {
          if (c.itemId !== id || c.kind !== "file") return c;
          const fingerprint = approvalFingerprint(c.method, { itemId: id, threadId: c.threadId, turnId: c.turnId, reason: c.reason, grantRoot: c.grantRoot }, changes);
          return { ...c, fingerprint, changes, key: cardKey({ ...c, fingerprint }) };
        });
        return publishState();
      }
      case "serverRequest/resolved":
        if (cards.some((c) => c.requestId === params.requestId)) {
          cards = cards.filter((c) => c.requestId !== params.requestId);
          publishState();
        }
        return;
      case "error":
        if (params.willRetry) return note("info", `Codex hit a problem and is trying again: ${String(params.error?.message ?? "").slice(0, 300)}`);
        return note("bad", planWords(params.error) ?? `Codex: ${String(params.error?.message ?? "something went wrong").slice(0, 500)}`);
      case "turn/completed":
        return onTurnDone(params.turn);
      default:
    }
  }

  /** Codex refusing for plan or usage reasons, in words a student can act on (null for anything else). @param {any} error */
  function planWords(error) {
    const info = JSON.stringify(error?.codexErrorInfo ?? "");
    const text = `${info} ${String(error?.message ?? "")}`;
    if (/usageLimit|usage limit|rate.?limit|quota/i.test(text)) return `You've reached your plan's Codex limit (${String(error?.message ?? "").slice(0, 200)}). The course uses ChatGPT Plus: upgrade to Plus at chatgpt.com, or wait until the limit resets, then send again.`;
    if (/plan|subscription|upgrade|not (available|included)|unauthori[sz]ed|401|403/i.test(text)) return `Codex refused because of your ChatGPT account: ${String(error?.message ?? "").slice(0, 300)} The course needs a paid plan with Codex: upgrade at chatgpt.com, then send again.`;
    return null;
  }

  /** @param {any} done */
  function onTurnDone(done) {
    if (!turn || (turn.id && done?.id && done.id !== turn.id)) return;
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    cards = cards.filter((c) => c.turnId !== (done?.id ?? turn?.id));
    if (done?.status === "failed") note("bad", planWords(done?.error) ?? `This turn failed: ${String(done?.error?.message ?? "Codex didn't say why.").slice(0, 500)}`);
    else if (done?.status === "interrupted") {
      note("info", "Stopped. Anything it had already changed is still in your folder.");
      // Interrupting a turn leaves a command it started still running (measured on 0.166.0): end those too.
      for (const e of entries.filter((x) => x.kind === "command" && x.status === "inProgress")) put({ ...e, status: "stopped" });
      for (const e of entries) if (e.kind === "command" && e.status === "stopped") stoppedRows.add(e.id);
      if (link && threadId) rpc("thread/backgroundTerminals/clean", { threadId }).catch(() => note("bad", "A command Codex started may still be running. It ends when the studio stops."));
    }
    // A row Codex never reported finished doesn't say "running" once the turn is over.
    for (const e of entries.filter((x) => x.kind === "command" && x.status === "inProgress")) put({ ...e, status: "finished" });
    turn = null;
    warnIfRunsLater();
    publishState();
    // What ran in this turn: the entries since the student's last message.
    const from = entries.findLastIndex((x) => x.kind === "user");
    const commands = /** @type {any[]} */ (entries.slice(from + 1).filter((x) => x.kind === "command"));
    afterTurn({ week: lastWeek, taskId: lastTask, status: String(done?.status ?? ""), commands });
  }

  /** Changes to files that later run outside the sandbox (the studio, npm scripts, tests): say so, once for each new state. */
  function warnIfRunsLater() {
    const dir = repo();
    const r = dir ? quietGit(ctx, dir, ["status", "--porcelain", "--", "setup.mjs", "package.json", "vitest.config.ts", "studio", "tests"]) : null;
    const changed = r?.refused ? "the folder's git settings (.git/config names programs to run)" : (r?.stdout ?? "").trimEnd();
    if (changed && changed !== runsLater) note("info", `These changed, and they run outside the sandbox the next time you use the studio, npm or the tests. Check them first (git diff): ${changed.split("\n").map((l) => l.slice(3)).join(", ").slice(0, 300)}`);
    runsLater = changed;
  }

  // ── Starting, signing in, the thread ──
  async function readAccount() {
    try {
      const r = await rpc("account/read", { refreshToken: false });
      account = r?.account ?? null;
      if (account) {
        problem = "";
        loginUrl = "";
        phase = "ready";
        await resumeSaved();
      } else if (r?.requiresOpenaiAuth === false) {
        phase = "ready";
        await resumeSaved();
      } else if (phase !== "signing-in" || !loginUrl) phase = "signed-out";
    } catch (error) {
      phase = "failed";
      problem = `Codex couldn't say who's signed in: ${/** @type {Error} */ (error).message}`;
    }
    publishState();
  }

  /** @param {{ code: number | null, signal: string | null, error?: string, stderr: string }} why */
  function onClosed(why) {
    const wasTurn = turn;
    const before = phase;
    link = null;
    generation++;
    for (const [, w] of rpcs) {
      clearTimeout(w.timer);
      const err = /** @type {Error & { ambiguous?: boolean }} */ (new Error("Codex stopped."));
      err.ambiguous = true;
      w.reject(err);
    }
    rpcs.clear();
    cards = [];
    turn = null;
    threadId = ""; // a new child has to resume it (the saved id is kept)
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    if (shuttingDown) return;
    if (closingOnPurpose) {
      closingOnPurpose = false;
      return;
    }
    if (why.error === "ENOENT") {
      phase = "missing";
      problem = "Codex isn't installed, or this terminal can't find it.";
    } else if (before === "starting" && /unrecognized subcommand|unexpected argument|invalid value/i.test(why.stderr)) {
      phase = "too-old";
      problem = "This Codex is too old for the studio: it has no app-server.";
    } else {
      phase = "failed";
      problem = before === "starting" ? `Codex didn't start (${why.error ?? `exit ${why.code ?? why.signal}`}). ${why.stderr.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 400)}`.trim() : "Codex stopped. Start it again to carry on with this conversation.";
    }
    // Never sent again by itself: it may already have changed files.
    if (wasTurn) note("bad", "Codex stopped during this turn, so it may have changed files before it stopped. Nothing was sent again: check your folder, then decide what to ask next.");
    publishState();
  }

  /** Start the child (a browser opening the tab, or the student pressing Start again). */
  async function open() {
    if (ctx.dryRun) {
      phase = "unavailable";
      problem = "The agent doesn't run in a dry run.";
      publishState();
      return good;
    }
    if (phase === "starting" || (link && phase !== "failed")) return good;
    if (link) {
      // Failed with the child still up (it refused the permissions): start clean.
      closingOnPurpose = true;
      await link.stop();
      link = null;
    }
    const dir = repo();
    if (!dir) return fail(409, "The course folder isn't set up yet.");
    if (!onPath(ctx, "codex")) {
      phase = "missing";
      problem = "Codex isn't installed, or this terminal can't find it.";
      publishState();
      return good;
    }
    phase = "starting";
    problem = "";
    publishState();
    const t = transport(dir);
    link = t;
    t.onMessage(onMessage);
    t.onBadLine((line) => note("bad", `Codex sent something the studio couldn't read: ${line.slice(0, 120)}`));
    t.onClose(onClosed);
    try {
      const init = await rpc("initialize", { clientInfo: { name: "netsim_studio", title: "NetSim Studio", version: String(STUDIO_VERSION) }, capabilities: { experimentalApi: true, requestAttestation: false } }); // experimental: Stop needs thread/backgroundTerminals/clean
      version = /\/(\d+\.\d+\.\d+[\w.-]*)/.exec(String(init?.userAgent ?? ""))?.[1] ?? "";
      t.send({ method: "initialized" });
      if (version && versionOlder(version, CODEX_MIN_VERSION)) {
        phase = "too-old";
        problem = `This Codex is ${version}; the studio needs ${CODEX_MIN_VERSION} or newer.`;
        closingOnPurpose = true;
        await t.stop();
        link = null;
        publishState();
        return good;
      }
      await readAccount();
    } catch (error) {
      // onClosed has said what happened if the child died.
      if (link === t) {
        phase = "failed";
        problem = /** @type {Error} */ (error).message;
        publishState();
      }
    }
    return good;
  }

  const threadParams = (/** @type {string} */ dir) => ({ cwd: dir, approvalPolicy: AGENT_APPROVAL_POLICY, approvalsReviewer: "user", sandbox: AGENT_SANDBOX_MODE, config: AGENT_CONFIG, developerInstructions: AGENT_POLICY });
  /** Whether Codex really took the permissions asked for (a managed config can override them). @param {any} r */
  const permissionsHeld = (r) => r?.approvalPolicy === AGENT_APPROVAL_POLICY && r?.sandbox?.type === AGENT_SANDBOX_POLICY.type && r?.approvalsReviewer === "user" && r?.sandbox?.networkAccess === false && Array.isArray(r?.sandbox?.writableRoots) && r.sandbox.writableRoots.length === 0;

  const savedThreads = () => /** @type {Record<string, string>} */ (ctx.state.agentThreads ??= {});

  /** Pick up this folder's saved conversation, if there is one. Nothing is sent. */
  async function resumeSaved() {
    const dir = repo();
    if (!dir || threadId) return;
    const saved = savedThreads()[dir];
    if (!saved) return;
    try {
      const r = await rpc("thread/resume", { threadId: saved, ...threadParams(dir) });
      if (realpathOr(String(r?.cwd ?? r?.thread?.cwd ?? "")) !== dir) throw new Error("That conversation belongs to another folder.");
      if (!permissionsHeld(r)) throw new Error("permissions");
      threadId = saved;
      if (!entries.length) {
        for (const past of r?.thread?.turns ?? []) {
          for (const item of past?.items ?? []) {
            if (item?.type === "userMessage") {
              const text = (item.content ?? []).filter((c) => c?.type === "text" && !String(c.text).startsWith("<studio-context>")).map((c) => c.text).join("\n");
              if (text) put({ id: String(item.id), kind: "user", text });
            } else putItem(item, true);
          }
          if (past?.status === "inProgress") note("info", "The last turn didn't finish before Codex stopped. It may have changed files; nothing was sent again.");
        }
      }
    } catch (error) {
      delete savedThreads()[dir];
      ctx.save?.();
      if (/** @type {Error} */ (error).message === "permissions") {
        phase = "failed";
        problem = permissionRefusal;
        return;
      }
      note("info", "Couldn't pick up your earlier conversation, so the next message starts a new one.");
    }
  }
  const permissionRefusal = "Codex's settings on this laptop overrode the permissions the studio asks for (workspace-write, ask on request), so the studio won't drive it. Ask Praise.";
  const realpathOr = (/** @type {string} */ p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };

  /** @param {string} dir */
  async function ensureThread(dir) {
    if (threadId) return;
    const r = await rpc("thread/start", threadParams(dir));
    if (!permissionsHeld(r)) {
      phase = "failed";
      problem = permissionRefusal;
      throw new Error(permissionRefusal);
    }
    threadId = String(r?.thread?.id ?? "");
    if (!threadId) throw new Error("Codex didn't start a conversation.");
    savedThreads()[dir] = threadId;
    ctx.save?.();
  }

  /**
   * What the studio tells the agent about where the student is: from its own list of the week's
   * tasks, never from the browser's words.
   * @param {string} dir @param {number} week @param {unknown} taskId
   */
  function turnContext(dir, week, taskId, guided = false) {
    const lines = [`${weekTitle(week)} (week ${week}).`, `Guide: docs/weeks/week-${pad2(week)}.md. Tests: tests/week-${pad2(week)}/.`];
    const task = taskId ? weekTasks(dir, week).find((t) => t.id === taskId) : undefined;
    if (task) lines.push(`Selected task: ${task.id} in ${task.file}: ${task.description}`, `Focused test command: ${focusedTestCommand(task)}`, "Tests in those files that belong to tasks not done yet don't count against this one; the studio checks that itself at the end of your turn.");
    else lines.push("No task selected: ask which one they're on if it matters.");
    if (guided) lines.push("Guided step: the student pressed Send on this step in the Build tab, so the message is the course's prompt and its approach is the one they chose. Don't ask for an approach: write it, explaining each part as you go, then run the focused test.");
    return `<studio-context>\n${lines.join("\n")}\n</studio-context>`;
  }

  /** One message from the student. At most one turn at a time; a repeated clientId is not sent twice. @param {Record<string, unknown>} a */
  async function send(a) {
    const text = typeof a.text === "string" ? a.text.trim() : "";
    const week = Number(a.week);
    const clientId = typeof a.clientId === "string" ? a.clientId.slice(0, 80) : "";
    if (!text) return fail(400, "Type a message first.");
    if (text.length > AGENT_MAX_MESSAGE) return fail(400, "That message is too long.");
    if (!Number.isInteger(week) || week < 1 || week > 20) return fail(400, "Which week is this for?");
    if (clientId && clientId === lastClientId) return good;
    if (phase !== "ready" || !link) return fail(409, "Codex isn't ready yet.");
    if (turn) return fail(409, "Codex is still working: wait for it, or press Stop.");
    const dir = repo();
    if (!dir) return fail(409, "The course folder isn't set up yet.");
    if (clientId) lastClientId = clientId;
    lastWeek = week;
    lastTask = a.task;
    turn = { id: "", status: "starting" };
    notedHints = false;
    put({ id: `user-${++noteId}`, kind: "user", text });
    publishState();
    void startTurn(dir, week, a.task, text, a.guided === true);
    return good;
  }

  /** @param {string} dir @param {number} week @param {unknown} task @param {string} text @param {boolean} [guided] */
  async function startTurn(dir, week, task, text, guided = false) {
    const mine = generation;
    try {
      await ensureThread(dir);
      const r = await rpc("turn/start", {
        threadId,
        input: [
          { type: "text", text: turnContext(dir, week, task, guided), text_elements: [] },
          { type: "text", text, text_elements: [] },
        ],
        cwd: dir,
        approvalPolicy: AGENT_APPROVAL_POLICY,
        approvalsReviewer: "user",
        sandboxPolicy: AGENT_SANDBOX_POLICY,
      });
      if (mine !== generation || !turn) return;
      const wasStopping = turn.status === "stopping";
      turn.id = String(r?.turn?.id ?? turn.id);
      if (!wasStopping) turn.status = "running";
      publishState();
      if (wasStopping) interrupt();
      if (r?.turn?.status && r.turn.status !== "inProgress") onTurnDone(r.turn);
    } catch (error) {
      if (mine !== generation || !turn) return; // the child died: onClosed has told the student
      if (stopTimer) clearTimeout(stopTimer); // a Stop pressed meanwhile mustn't fire during the next turn
      stopTimer = null;
      const ambiguous = /** @type {Error & { ambiguous?: boolean }} */ (error).ambiguous;
      turn = null;
      note("bad", ambiguous ? `${/** @type {Error} */ (error).message} It may have started anyway, so nothing was sent again: check your folder before asking again.` : `Codex didn't take that message: ${/** @type {Error} */ (error).message}`);
      publishState();
    }
  }

  function interrupt() {
    if (!turn?.id || !link) return;
    rpc("turn/interrupt", { threadId, turnId: turn.id }).catch(() => {});
  }

  /** Stop: interrupt and wait for Codex to say so; if it never does, end the child rather than hang. */
  function stopTurn() {
    if (!turn) return good;
    if (turn.status === "stopping") return good;
    turn.status = "stopping";
    publishState();
    interrupt();
    stopTimer = setTimeout(() => {
      note("bad", "Codex didn't stop in time, so the studio ended it. It may have changed files first.");
      void link?.stop();
    }, stopWaitMs);
    return good;
  }

  /** Sign in through Codex itself (its login is its own; the studio never sees a token). */
  async function login() {
    if (phase !== "signed-out" && phase !== "signing-in") return fail(409, "Codex doesn't need signing in right now.");
    try {
      const r = await rpc("account/login/start", { type: "chatgpt" });
      const url = String(r?.authUrl ?? "");
      if (!/^https:\/\//.test(url)) throw new Error("Codex didn't give a sign-in page.");
      loginUrl = url;
      phase = "signing-in";
    } catch (error) {
      problem = /** @type {Error} */ (error).message;
    }
    publishState();
    return good;
  }

  /** The one fix this state offers (install or update), typed like any step's command. @param {Record<string, unknown>} a */
  function runFix(a) {
    const display = phase === "missing" ? CODEX_INSTALL : phase === "too-old" ? CODEX_UPDATE : "";
    if (!display) return fail(409, "There's nothing to fix right now.");
    if (fix?.phase === "running") return fail(409, "It's still running.");
    if (typeof a.typed !== "string" || normalizeCommand(a.typed) !== normalizeCommand(display)) return fail(400, "What was typed doesn't match the command.");
    if (!ctx.stream) return fail(409, "The studio can't run that here.");
    fix = { phase: "running", out: "", display };
    publishState();
    const run = ctx.stream(display.split(" "), undefined, (t) => {
      if (fix) fix.out = cleanOutput(fix.out + t).slice(-4000);
      publishState();
    });
    void run.done.then((code) => {
      if (code === 0) {
        fix = null;
        phase = "off";
        problem = "";
        void open();
      } else if (fix) fix.phase = "failed";
      publishState();
    });
    return good;
  }

  return {
    snapshot,
    /** @param {Record<string, unknown>} a */
    act: async (a) => {
      switch (a.type) {
        case "agent-open":
          return open();
        case "agent-send":
          return send(a);
        case "agent-answer":
          return answer(a);
        case "agent-stop":
          return stopTurn();
        case "agent-login":
          return login();
        case "agent-recheck":
          // After upgrading the plan: ask Codex again who's signed in, and on which plan.
          if (phase !== "ready" || !link) return fail(409, "Codex isn't running.");
          await readAccount();
          return good;
        case "agent-fix":
          return runFix(a);
        default:
          return fail(400, "Unknown action.");
      }
    },
    /** Its tests pass: offer the commit right here. @param {number} week @param {string} id @param {string} [said] */
    commitOffer: (week, id, said = `The tests for \`${id}\` pass.`) => put({ id: `note-${++noteId}`, kind: "note", tone: "info", text: `${said} Read what changed, then commit it (or on its card in the Code tab). It commits the whole file, with anything else you changed in it.`, commit: { week, id } }),
    /** The studio's run outside the sandbox, for the student to press. @param {number} week @param {string} id @param {string} [said] */
    testOffer: (week, id, said = `Check \`${id}\`.`) => put({ id: `note-${++noteId}`, kind: "note", tone: "info", text: `${said} This runs its tests outside the sandbox, leaving out tests for tasks you haven't done yet.`, runTests: { week, id } }),
    /** @param {string} id */
    testOfferDone: (id) => {
      for (const e of entries.filter((x) => /** @type {any} */ (x.runTests)?.id === id)) put({ ...e, runTests: null });
    },
    /** @param {"info" | "bad"} tone @param {string} text */
    say: (tone, text) => note(tone, text),
    /** That task is committed: its button goes. @param {string} id */
    commitDone: (id) => {
      for (const e of entries.filter((x) => /** @type {any} */ (x.commit)?.id === id)) put({ ...e, commit: null });
    },
    /** A turn is running and nobody's being waited on (so a closed tab doesn't end it). */
    busy: () => Boolean(turn && !cards.length),
    /** Ends only the child this studio started: a bounded wait, then its whole tree. */
    shutdown: async () => {
      shuttingDown = true;
      if (stopTimer) clearTimeout(stopTimer);
      const t = link;
      link = null;
      if (t) await t.stop();
    },
  };
}

// ── The studio's local server ─────────────────────────────────────────────

/**
 * Is this request from the studio's own page? It must come to 127.0.0.1 (or localhost) on our
 * port, from our page (Origin), with this run's token. Returns null when it's fine.
 * @param {{ method: string, host?: string, origin?: string, token?: string | null }} req
 * @param {{ port: number, token: string }} studio
 * @returns {{ status: number, reason: string } | null}
 */
export function checkRequest(req, studio) {
  const hosts = [`127.0.0.1:${studio.port}`, `localhost:${studio.port}`];
  if (!req.host || !hosts.includes(req.host)) return { status: 403, reason: "wrong host" };
  if (req.origin !== undefined && !hosts.map((h) => `http://${h}`).includes(req.origin)) return { status: 403, reason: "wrong origin" };
  if (req.method === "POST" && req.origin === undefined) return { status: 403, reason: "no origin" };
  const given = Buffer.from(req.token ?? "");
  const wanted = Buffer.from(studio.token);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return { status: 403, reason: "wrong token" };
  return null;
}

/**
 * Markdown for the agent's replies in the chat. The text is untrusted (it comes from the model), so
 * everything is escaped before any markup is added: no HTML gets through, links are http(s) only and
 * open in a new tab with no referrer or opener, and images are never loaded (their alt text shows).
 * Fenced code gets a box with its language and a Copy button; a fence still open while the reply
 * streams shows as code until it closes. Self-contained: it also runs in the page.
 * @param {string} markdown
 * @returns {string}
 */
export function chatMarkdown(markdown) {
  const esc = (/** @type {string} */ t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  /** @param {string} escaped  the URL as it stands in escaped text @param {string} label */
  const link = (escaped, label) => {
    const url = escaped.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return /^https?:\/\/[^\s"'<>`\\]+$/i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  };
  /** Inline markup on already-escaped text: code, links, bold, italic. @param {string} raw */
  const inline = (raw) =>
    raw
      .split(/(`[^`\n]+`)/)
      .map((part, i) => {
        if (i % 2 === 1) return `<code>${esc(part.slice(1, -1))}</code>`;
        // Links become placeholders first, so emphasis can't reach into their markup or address.
        /** @type {string[]} */
        const held = [];
        const hold = (/** @type {string} */ html) => `\u0000${held.push(html) - 1}\u0000`;
        return esc(part.replace(/\u0000/g, ""))
          .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt) => `[image: ${alt}]`)
          .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => hold(link(url, label)))
          .replace(/(^|[\s(])(https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<\u0000])*[^\s<.,;:!?)&\u0000])/g, (_m, pre, url) => `${pre}${hold(link(url, url))}`)
          .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*\w])\*([^*\s][^*\n]*)\*/g, "$1<em>$2</em>")
          .replace(/(^|\W)_([^_\s][^_\n]*)_(?=\W|$)/g, "$1<em>$2</em>")
          .replace(/\u0000(\d+)\u0000/g, (_m, n) => held[Number(n)] ?? "");
      })
      .join("");
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const listMark = /^(\s*)([-*+]|\d+[.)])\s+/;
  const rule = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const cells = (/** @type {string} */ l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*```\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<div class="mdcode"><div class="mdcodebar"><span>${esc(fence[1] || "text")}</span><button class="mdcopy" type="button" data-md-copy>Copy</button></div><pre><code>${esc(body.join("\n"))}</code></pre></div>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1].length + 2);
      out.push(`<h${level}>${inline(heading[2].replace(/\s*#+\s*$/, ""))}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${chatMarkdown(body.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && rule.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="mdtable"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const mark = listMark.exec(line);
    if (mark) {
      const ordered = /\d/.test(mark[2]);
      const items = [];
      while (i < lines.length) {
        const m = listMark.exec(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        const body = [lines[i].slice(m[0].length)];
        i++;
        while (i < lines.length && lines[i].trim() && !listMark.test(lines[i]) && !/^\s*```/.test(lines[i])) body.push(lines[i++].trim());
        items.push(`<li>${inline(body.join(" "))}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>)/.test(lines[i]) && !listMark.test(lines[i]) && !(lines[i].includes("|") && rule.test(lines[i + 1] ?? ""))) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("");
}

/**
 * A command as a student reads it: without the shell wrapper Codex puts around it
 * (`/bin/zsh -lc 'npx vitest run …'` shows as `npx vitest run …`).
 * @param {string} command
 */
export function plainCommand(command) {
  const m = /^\s*(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(String(command ?? ""));
  if (!m) return /^\s*(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh\s+-l?c\s+(\S+)\s*$/.exec(String(command ?? ""))?.[1] ?? String(command ?? "");
  // The shell's ways of putting a ' inside '…': '\'' and '"'"'.
  return m[1] === "'" ? m[2].replace(/'\\''/g, "'").replace(/'"'"'/g, "'") : m[2].replace(/\\(["\\$`])/g, "$1");
}

/**
 * Markdown to HTML for the course's own documents (guides, ARCHITECTURE.md, design notes), shown
 * inside the studio: headings, paragraphs, lists (nested, with code inside), code fences, tables,
 * quotes, rules, links and images. Everything is escaped first; only safe link schemes survive.
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown, { strict = false } = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  strictLinks = strict;
  try {
    return blocks(lines);
  } finally {
    strictLinks = false;
  }
}

/** @param {string} t */
const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A link target the course's documents may use: relative, #anchor, http(s) or mailto. @param {string} url */
const safeUrl = (url) => {
  // Browsers drop control characters and whitespace inside a URL, so "\x01javascript:" is javascript:.
  const bare = url.replace(/[\x00-\x20\x7f-\x9f]/g, "");
  if (strictLinks) return /^https?:\/\/[^\s"'<>`\\]+$/i.test(bare) ? bare : "#";
  return /^(?:[a-z][a-z0-9+.-]*:)/i.test(bare) && !/^(?:https?|mailto):/i.test(bare) ? "#" : bare;
};
/** While rendering for the studio's own page (design notes): links only http(s), no images. */
let strictLinks = false;

/** @param {string} text */
function inline(text) {
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, i) => {
      if (i % 2 === 1) return `<code>${escHtml(part.replace(/^`+|`+$/g, ""))}</code>`;
      return escHtml(part)
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => (strictLinks ? `[image: ${alt}]` : `<img alt="${alt}" src="${safeUrl(url)}">`))
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => (strictLinks ? (safeUrl(url) === "#" ? label : `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`) : `<a href="${safeUrl(url)}">${label}</a>`))
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    })
    .join("");
}

const listMarker = /^(\s*)([-*+]|\d+[.)])\s+/;
const tableRule = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** @param {string} line */
const indentOf = (line) => (/^\s*/.exec(line)?.[0].length ?? 0);
/** @param {string} line */
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** @param {string[]} lines */
function blocks(lines) {
  const out = [];
  let i = 0;
  /** @param {string} line */
  const startsBlock = (line) => /^\s*(```|#{1,6}\s|>|(?:---|\*\*\*|___)\s*$)/.test(line) || listMarker.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^(\s*)```(.*)$/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++].slice(fence[1].length));
      i++;
      out.push(`<pre><code>${escHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const id = heading[2].toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
      out.push(`<h${heading[1].length} id="${escHtml(id)}">${inline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${blocks(body)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && tableRule.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    const marker = listMarker.exec(line);
    if (marker) {
      const base = marker[1].length;
      const ordered = /\d/.test(marker[2]);
      const items = [];
      while (i < lines.length) {
        const m = listMarker.exec(lines[i]);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const content = m[0].length;
        const body = [lines[i].slice(content)];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            // A blank line: the item goes on only if what follows is indented under it.
            let j = i;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && indentOf(lines[j]) >= content) {
              while (i < j) body.push(lines[i++].slice(content));
              continue;
            }
            break;
          }
          if (indentOf(next) >= content) body.push(next.slice(content));
          else if (!startsBlock(next) && body.at(-1)?.trim()) body.push(next.trim());
          else break;
          i++;
        }
        const checkbox = /^\[( |x)\]\s+/i.exec(body[0]);
        if (checkbox) body[0] = body[0].slice(checkbox[0].length);
        let html = blocks(body);
        if (!body.slice(1).some((b) => !b.trim())) html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
        items.push(`<li${checkbox ? ' class="task"' : ""}>${checkbox ? (checkbox[1] === " " ? "☐ " : "☑ ") : ""}${html}</li>`);
        while (i < lines.length && !lines[i].trim()) {
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          const again = j < lines.length ? listMarker.exec(lines[j]) : null;
          if (again && again[1].length === base) i = j;
          else break;
        }
      }
      const start = ordered ? Number(/\d+/.exec(marker[2])?.[0] ?? 1) : 1;
      out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ""}>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i])) && !(lines[i].includes("|") && i + 1 < lines.length && tableRule.test(lines[i + 1]))) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/**
 * A markdown document from the course folder as a page inside the studio, styled like the lesson pages.
 * @param {string} title
 * @param {string} markdown
 */
export function markdownPage(title, markdown) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)}</title>
<style>:root{--bg:#fff;--ink:#16201b;--muted:#56615b;--line:#dfe5e1;--code:#f3f5f4;--link:#1f7a55}@media (prefers-color-scheme:dark){:root{--bg:#0f1512;--ink:#e8efeb;--muted:#9aa8a0;--line:#26312b;--code:#151d18;--link:#6fd3a7}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif}main{max-width:900px;margin:0 auto;padding:28px 20px 60px}
h1,h2,h3{line-height:1.2}a{color:var(--link)}code,pre{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.88em}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto}pre code{background:none;padding:0}
.table{overflow-x:auto}table{border-collapse:collapse;margin:8px 0}th,td{border-bottom:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
blockquote{margin:0;padding:2px 14px;border-left:3px solid var(--line);color:var(--muted)}img{max-width:100%}li.task{list-style:none}</style>
</head><body><main>${renderMarkdown(markdown)}</main></body></html>`;
}

/**
 * A file from the student's course folder, to show inside the studio: any markdown file (rendered),
 * or an HTML page or image under docs/. Never anything outside the folder, node_modules or .git.
 * @param {string} dir  the course folder
 * @param {string} urlPath  the request's path, e.g. /docs/weeks/week-02.html
 * @returns {{ type: string, body: string | Buffer } | null}
 */
export function courseFile(dir, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!rel || rel.includes("\0") || rel.includes("\\") || rel.split("/").some((part) => part === ".." || part.startsWith("."))) return null;
  if (/^node_modules\//.test(rel)) return null;
  const ext = /\.([a-z0-9]+)$/i.exec(rel)?.[1]?.toLowerCase() ?? "";
  const types = /** @type {Record<string, string>} */ ({ html: "text/html; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" });
  if (ext !== "md" && !(rel.startsWith("docs/") && types[ext])) return null;
  try {
    const root = realpathSync(dir);
    const file = realpathSync(join(root, rel));
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) return null;
    if (ext === "md") return { type: "text/html; charset=utf-8", body: markdownPage(rel, readFileSync(file, "utf8")) };
    return { type: types[ext], body: readFileSync(file) };
  } catch {
    return null;
  }
}

/**
 * The code box's script runs in the studio's own page, and the agent can write a working-tree copy
 * without asking, so only the exact bundle this studio was released with is ever served
 * (scripts/studio/build-editor.sh keeps this hash right).
 */
export const EDITOR_SHA256 = "8a72994c389e65c2ce104ae96424e403469a701d4f050c6399cdbdcd5784e5c4";

/**
 * The code box's script, studio/editor.js: that exact bundle, from beside this studio (its course
 * folder, or saved next to a newer studio) or the course folder; else null (the page falls back
 * to a plain text box).
 * @param {string | null} dir
 * @returns {Buffer | null}
 */
export function editorBundle(dir) {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [join(here, "studio", "editor.js"), join(here, "editor.js"), dir && join(dir, "studio", "editor.js")]) {
    try {
      if (!path) continue;
      const body = readFileSync(path);
      if (createHash("sha256").update(body).digest("hex") === EDITOR_SHA256) return body;
    } catch {
      // not there: try the next place
    }
  }
  return null;
}

/**
 * Serve the studio on 127.0.0.1, on a free port. Resolves once it's listening.
 * @param {ReturnType<typeof createStudio>} studio
 * @param {{ token?: string, port?: number, onIdle?: () => void, idleMs?: number, log?: (line: string) => void }} [options]
 */
export function serveStudio(studio, { token = randomBytes(24).toString("base64url"), port = 0, onIdle, idleMs = 45_000, log = () => {} } = {}) {
  let clients = 0;
  let seen = 0; // 0 until the page first connects
  const viewToken = randomBytes(24).toString("base64url");
  const sameSecret = (/** @type {string} */ a, /** @type {string} */ b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    // A course page's own read-only address: its token opens that and nothing else.
    const view = /^\/view\/([^/]+)(\/.*)$/.exec(url.pathname);
    const viewOk = view !== null && req.method === "GET" && sameSecret(view[1], viewToken);
    // The token: in the address (the link from the terminal), the header (the page's own calls), or,
    // for pages opened inside the studio (a lesson page and its links), the studio's same-site cookie.
    const cookie = /(?:^|;\s*)netsim_studio=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const bad = checkRequest(
      {
        method: req.method ?? "GET",
        host: req.headers.host,
        origin: req.headers.origin,
        token: viewOk ? token : view ? null : (url.searchParams.get("t") ?? /** @type {string | undefined} */ (req.headers["x-studio-token"]) ?? (req.method === "GET" ? cookie : undefined) ?? null),
      },
      { port: address().port, token },
    );
    if (bad) {
      log(`refused a request (${bad.reason})`);
      res.writeHead(bad.status, { "content-type": "text/plain" }).end("Open the studio from the link in the terminal.");
      return;
    }
    const secure = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
    // A course page: scripts run (its popovers), but in an opaque origin, so whatever's in the file
    // can't reach the studio's page, its token or its Approve buttons. The sandbox comes from the
    // server, so it holds wherever the page is opened. No cookie reaches a sandboxed page, which is
    // why its links and images use the /view/ address.
    const pageCsp = () => `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src http://${req.headers.host} data:; frame-ancestors http://${req.headers.host}; base-uri 'none'; form-action 'none'`;
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        ...secure,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-src 'self' http://localhost:3005 http://127.0.0.1:3005; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        // Same-site, this address only: lets the lesson pages and their links load inside the studio.
        "set-cookie": `netsim_studio=${token}; Path=/; HttpOnly; SameSite=Strict`,
      });
      res.end(studioPage(token));
      return;
    }
    // A week's page: its lesson page (or guide) in the course folder, once the week is in.
    const weekMatch = /^\/week\/(\d{1,2})$/.exec(url.pathname);
    if (req.method === "GET" && weekMatch) {
      const week = Number(weekMatch[1]);
      const page = studio.weekPage(week);
      if (!page) {
        // Not on this laptop yet (week 1 before the course is downloaded): the course's own copy on GitHub.
        const online = studio.weekPageOnline(week);
        const text = online ? await fromCourse(week, online) : null;
        if (online && text !== null) {
          res.writeHead(200, {
            ...secure,
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": pageCsp(),
          });
          res.end(online.endsWith(".md") ? markdownPage(`Week ${week}`, text) : text);
          return;
        }
        res
          .writeHead(404, { ...secure, "content-type": "text/plain; charset=utf-8" })
          .end(online ? `Week ${week}'s page couldn't be fetched from GitHub (offline?). It shows here once the course is on this laptop (step 9).` : `Week ${week} isn't out yet.`);
        return;
      }
      res.writeHead(302, { ...secure, location: `/${page}` }).end();
      return;
    }
    // The code box (CodeMirror, bundled): from the course folder, else next to this studio.
    if (req.method === "GET" && url.pathname === "/editor.js") {
      const body = editorBundle(studio.repoDir());
      if (!body) {
        res.writeHead(404, secure).end();
        return;
      }
      res.writeHead(200, { ...secure, "content-type": "text/javascript; charset=utf-8" }).end(body);
      return;
    }
    // The Build tab's steps.
    if (req.method === "GET" && url.pathname === "/api/build") {
      const steps = studio.buildSteps(Number(url.searchParams.get("week")));
      res.writeHead(steps ? 200 : 409, { ...secure, "content-type": "application/json" }).end(JSON.stringify({ steps: steps ?? [] }));
      return;
    }
    // The tasks the Agent tab can work on.
    if (req.method === "GET" && url.pathname === "/api/agent/tasks") {
      const tasks = studio.agentTasks(Number(url.searchParams.get("week")));
      res.writeHead(tasks ? 200 : 409, { ...secure, "content-type": "application/json" }).end(JSON.stringify({ tasks: tasks ?? [] }));
      return;
    }
    // The Agent tab's state, when the page missed a numbered event.
    if (req.method === "GET" && url.pathname === "/api/agent") {
      res.writeHead(200, { ...secure, "content-type": "application/json" }).end(JSON.stringify(studio.agentSnapshot()));
      return;
    }
    // The file viewer, read-only: the folder's files, one file's text, one file's uncommitted changes.
    // All three are data (JSON), never HTML: the page escapes everything it shows.
    if (req.method === "GET" && url.pathname === "/api/file/image") {
      const dir = studio.repoDir();
      const img = dir ? viewImage(dir, url.searchParams.get("path")) : null;
      if (!img) {
        res.writeHead(404, secure).end();
        return;
      }
      // Shown in an <img> on the studio's page; opened on its own it's inert.
      res.writeHead(200, { ...secure, "content-type": img.type, "content-security-policy": "default-src 'none'; sandbox" }).end(img.body);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/files" || url.pathname === "/api/file" || url.pathname === "/api/diff")) {
      const out = url.pathname === "/api/files" ? studio.files() : url.pathname === "/api/file" ? studio.file(url.searchParams.get("path")) : studio.diff(url.searchParams.get("path"));
      const { status = 200, ...body } = out;
      res.writeHead(status, { ...secure, "content-type": "application/json" }).end(JSON.stringify(body));
      return;
    }
    // A week's tasks, for its Code tab.
    if (req.method === "GET" && url.pathname === "/api/code") {
      const tasks = studio.weekCode(Number(url.searchParams.get("week")));
      res.writeHead(tasks ? 200 : 409, { ...secure, "content-type": "application/json" }).end(JSON.stringify(tasks ? { tasks } : { error: "That week isn't in your work yet." }));
      return;
    }
    // A file from the course folder (a lesson page, a linked document, an image), shown inside the studio.
    // Those files can be written by the agent without asking, so they're only ever served sandboxed
    // (pageCsp), at a read-only path of their own: the address with the cookie just goes there.
    const dir = studio.repoDir();
    const viewing = view !== null;
    const file = req.method === "GET" && dir && (viewing || !["/events", "/api/act", "/api/code", "/api/agent", "/api/agent/tasks", "/api/build", "/api/files", "/api/file", "/api/file/image", "/api/diff", "/editor.js"].includes(url.pathname)) ? courseFile(dir, viewing ? view[2] : url.pathname) : null;
    if (file && !viewing) {
      res.writeHead(302, { ...secure, location: `/view/${viewToken}${url.pathname}` }).end();
      return;
    }
    if (file) {
      res.writeHead(200, { ...secure, "content-type": file.type, "content-security-policy": pageCsp() });
      res.end(file.body);
      return;
    }
    if (viewing) {
      res.writeHead(404, secure).end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { ...secure, "content-type": "text/event-stream", connection: "keep-alive" });
      /** @param {string} event @param {unknown} data */
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      clients++;
      seen = Date.now();
      send("state", studio.snapshot());
      send("output", { ...studio.output(), reset: true });
      send("agent", { type: "snapshot", snapshot: studio.agentSnapshot() });
      const unsubscribe = studio.subscribe(send);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clients--;
        seen = Date.now();
        clearInterval(ping);
        unsubscribe();
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/act") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 64_000) {
          res.writeHead(413).end();
          return;
        }
      }
      /** @type {Record<string, unknown>} */
      let action;
      try {
        action = JSON.parse(body);
      } catch {
        res.writeHead(400, secure).end();
        return;
      }
      seen = Date.now();
      if (action.type === "heartbeat") {
        res.writeHead(204, secure).end();
        return;
      }
      const result = await studio.act(action);
      res.writeHead(result.status, { ...secure, "content-type": "application/json" }).end(JSON.stringify(result));
      return;
    }
    res.writeHead(404, secure).end();
  });
  const address = () => /** @type {import("node:net").AddressInfo} */ (server.address());
  // The tab was closed: nothing connected and no heartbeat for a while.
  const idle = setInterval(() => {
    // Not while tests it started are still running (a save's, or the checks'): they finish first.
    if (onIdle && seen && clients === 0 && Date.now() - seen > idleMs && !studio.busy?.()) onIdle();
  }, 2_000);
  idle.unref();
  return new Promise((ready) => {
    server.listen(port, "127.0.0.1", () => {
      ready({
        port: address().port,
        token,
        url: `http://127.0.0.1:${address().port}/?t=${token}`,
        close: () => {
          clearInterval(idle);
          server.closeAllConnections();
          server.close();
        },
      });
    });
  });
}

// ── Code in the studio: a week's tasks, written in the app ──────────────────────────
// Each task is an @student region in the student's own copy. The studio shows a few read-only
// lines around it and lets the student write the body; saving writes only between the region's
// markers, then runs the tests that cover it. VS Code and the studio edit the same file.

const REGION_START = /^(\s*)(\/\/|;) @student week=(\d+|stretch) part=(class|home) id=([a-z0-9-]+) "([^"]*)"\s*$/;
const REGION_END = /^\s*(\/\/|;) @end\s*$/;
/** Any marker line: never allowed inside what the student writes. */
const REGION_MARKER = /^\s*(\/\/|;|<!--) @(student|stub|end)\b/;
/** The largest body the studio writes (a region is a function body, not a file). */
const MAX_BODY = 40_000;

/**
 * @typedef {{ id: string, week: number, part: "class" | "home", description: string, start: number, end: number, indent: string }} CodeRegion
 *   start/end: the 0-based lines of the @student and @end markers.
 */

/**
 * The @student regions of one code file (.ts, .tsx, .asm). A file whose markers don't pair up has
 * none (the studio won't write into it).
 * @param {string} text
 * @returns {CodeRegion[]}
 */
export function findCodeRegions(text) {
  /** @type {CodeRegion[]} */
  const regions = [];
  /** @type {CodeRegion | null} */
  let open = null;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const start = REGION_START.exec(line);
    if (start) {
      if (open) return [];
      open = { id: start[5], week: start[3] === "stretch" ? 9 : Number(start[3]), part: /** @type {"class" | "home"} */ (start[4]), description: start[6], start: i, end: -1, indent: start[1] };
    } else if (REGION_END.test(line)) {
      if (!open) return [];
      regions.push({ ...open, end: i });
      open = null;
    }
  }
  return open ? [] : regions;
}

/** A region's text, markers included: what a save must find unchanged. @param {string[]} lines @param {CodeRegion} r */
const regionRev = (lines, r) => createHash("sha256").update(lines.slice(r.start, r.end + 1).join("\n")).digest("hex").slice(0, 16);

/**
 * The read-only lines around a region: from the function (or block) it sits in, down to the
 * marker, and after @end to that block's closing line. Long stretches are cut with "…".
 * @param {string[]} lines
 * @param {CodeRegion} r
 */
export function regionContext(lines, r) {
  const indentOf = (/** @type {string} */ l) => /^\s*/.exec(l)?.[0].length ?? 0;
  const own = r.indent.length;
  // The nearest line above with less indent that opens a block: the signature (or the callback) the region is in.
  let top = r.start;
  for (let i = r.start - 1; i >= 0 && i >= r.start - 40; i--) {
    const l = lines[i];
    if (l.trim() && indentOf(l) < own && /[{(]\s*$/.test(l.trimEnd())) {
      top = i;
      // A signature split over lines ("export function f(\n  a,\n): T {"): start where it starts.
      while (top > 0 && indentOf(lines[top - 1]) >= indentOf(l) && lines[top - 1].trim() && !/[;{}]\s*$/.test(lines[top - 1].trimEnd()) && top > i - 6) top--;
      break;
    }
  }
  let before = lines.slice(top, r.start);
  if (before.length > 12) before = [...before.slice(0, 3), `${r.indent}…`, ...before.slice(-7)];
  let after = [];
  const opener = indentOf(lines[top] ?? "");
  for (let i = r.end + 1; i < lines.length && after.length < 8; i++) {
    after.push(lines[i]);
    if (lines[i].trim() && indentOf(lines[i]) <= opener && /^\s*[})\]]/.test(lines[i])) break;
  }
  if (after.length === 8) after = [...after.slice(0, 6), `${r.indent}…`];
  return { before: before.map((l) => l.replace(/\r$/, "")), after: after.map((l) => l.replace(/\r$/, "")) };
}

/**
 * The course's code files that hold regions (tracked by git; not tests, not node_modules).
 * @param {Context} ctx
 * @param {string} dir
 */
function regionFiles(ctx, dir) {
  // Often, by itself (each check): ls-files reads no file contents, so only the hooks/fsmonitor guard is needed.
  const listed = quietGit(ctx, dir, ["ls-files", "--", "*.ts", "*.tsx", "*.asm"], { check: false, globs: true });
  if (!listed || listed.code !== 0) return [];
  return listed.stdout.split("\n").filter((f) => f && !f.startsWith("tests/") && !f.includes("node_modules/"));
}

/**
 * A path in the course folder that the studio may write: inside the folder (after following links),
 * a code file, not under .git, tests or node_modules. The absolute path, or null.
 * @param {string} dir
 * @param {string} rel
 */
export function codeFilePath(dir, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0") || rel.includes("\\") || rel.startsWith("/")) return null;
  if (rel.split("/").some((part) => part === ".." || part === "." || part.startsWith(".")) || !/\.(tsx?|asm)$/.test(rel)) return null;
  if (/^(tests|node_modules)\//.test(rel) || rel.includes("/node_modules/")) return null;
  try {
    const root = realpathSync(dir);
    const file = realpathSync(join(root, rel));
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) return null;
    // The same rules for where it really is (a link inside the folder to tests/ or .git is no better).
    const real = file.slice(root.length + 1).split(sep).join("/");
    if (real.split("/").some((part) => part.startsWith(".")) || !/\.(tsx?|asm)$/.test(real) || /^(tests|node_modules)\//.test(real) || real.includes("/node_modules/")) return null;
    return file;
  } catch {
    return null;
  }
}

// ── The file viewer (read-only): the course folder's files, their text and their uncommitted changes ──

/** The most a file (or its diff) can be to be shown in the studio. */
export const VIEW_MAX_BYTES = 512 * 1024;

/** Git's empty tree: as the attributes source, no .gitattributes in the folder applies. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** @type {WeakMap<object, boolean>} whether this context's git has --attr-source (2.40 and newer) */
const attrSource = new WeakMap();

/**
 * Settings in the folder's own git config (which the agent can write) that make git run a program:
 * a clean/smudge filter, a hooks folder, an fsmonitor, a textconv or any *.command.
 * @param {Context} ctx
 * @param {string} dir
 * @param {{ hooks?: boolean }} [options]  hooks: false leaves out core.hooksPath (the caller turns hooks off)
 */
function gitRunsPrograms(ctx, dir, { hooks = true } = {}) {
  const r = ctx.capture(["git", "config", "--list", "--show-scope"], dir, { timeout: 5000 });
  if (!r || r.code !== 0) return true;
  return r.stdout.split("\n").some((line) => {
    const [scope, entry = ""] = line.split("\t");
    if (!hooks && /^core\.hookspath=/i.test(entry)) return false;
    return (scope === "local" || scope === "worktree") && /^(filter\.|core\.hookspath=|core\.fsmonitor=|[^=]*command=|[^=]*\.textconv=|diff\.external=)/i.test(entry);
  });
}

/**
 * Git, read-only, for what the studio runs by itself (the file viewer, the "runs later" check, the
 * task lists): with nothing configured in the folder run outside the sandbox. It refuses (no git
 * runs) when the folder's own config names a program (a filter, fsmonitor, textconv, *command…): the
 * agent can write .git/config, .git/info/attributes and any attributes file, so no attributes source
 * can be trusted with a filter defined. On top: no hooks (core.hooksPath to nothing, and
 * --no-optional-locks, so status doesn't write the index), no fsmonitor, no attributes file, and on
 * git 2.40+ attributes from the empty tree. Pathspecs are literal (":(glob)…" is just a name) unless
 * the caller asks for globs. Callers still pass --no-ext-diff and --no-textconv to diff.
 * @param {Context} ctx
 * @param {string} dir
 * @param {string[]} args
 * @param {{ check?: boolean, globs?: boolean }} [options]  check: false skips the refusal, for a
 *   command that never reads file contents (ls-files without -m/-o/-d); globs: pathspecs are patterns
 * @returns {RunResult & { refused?: boolean } | null}
 */
export function quietGit(ctx, dir, args, { check = true, globs = false } = {}) {
  if (!attrSource.has(ctx)) {
    const v = /git version (\d+)\.(\d+)/.exec(ctx.capture(["git", "--version"], dir, { timeout: 5000 })?.stdout ?? "");
    attrSource.set(ctx, Boolean(v && (Number(v[1]) > 2 || (Number(v[1]) === 2 && Number(v[2]) >= 40))));
  }
  const modern = attrSource.get(ctx);
  if (check && gitRunsPrograms(ctx, dir)) return { code: 1, stdout: "", stderr: "", refused: true };
  const none = process.platform === "win32" ? "NUL" : "/dev/null";
  const argv = ["git", ...(modern ? [`--attr-source=${EMPTY_TREE}`] : []), "--no-optional-locks", ...(globs ? [] : ["--literal-pathspecs"]), "--no-pager", "-c", `core.hooksPath=${none}`, "-c", "core.fsmonitor=false", "-c", `core.attributesFile=${none}`, "-c", "core.quotepath=off",
    // A repository inside the folder (a gitlink) has its own config and attributes: status and diff never look inside one.
    ...(args[0] === "status" || args[0] === "diff" ? [args[0], "--ignore-submodules=all", ...args.slice(1)] : args)];
  return ctx.capture(argv, dir, { timeout: 10_000 });
}

/** What the viewer says when an old git won't read a folder that asks it to run programs. */
const OLD_GIT = "This folder's git settings (.git/config) name programs for git to run, so the studio won't read it here: open it in VS Code instead.";

/**
 * A path the viewer may name: relative, "/"-separated, no "..", ".", dot-parts (so no .git, .env or
 * .codex), not under node_modules. Says nothing about whether it exists.
 * @param {unknown} rel
 * @returns {rel is string}
 */
export function viewablePath(rel) {
  if (typeof rel !== "string" || !rel || rel.length > 1024 || rel.includes("\0") || rel.includes("\\") || rel.startsWith("/")) return false;
  const parts = rel.split("/");
  // Case-insensitively: on macOS and Windows NODE_MODULES is the same folder.
  return parts.every((p) => p !== "" && p !== "." && p !== ".." && !p.startsWith(".") && p.toLowerCase() !== "node_modules");
}

/**
 * A file in the course folder the studio may show (read-only): a viewable path, a regular file whose
 * real place (after following every link) is inside the folder and is itself a viewable path. The
 * absolute path, or null.
 * @param {string} dir
 * @param {unknown} rel
 */
export function viewableFile(dir, rel) {
  if (!viewablePath(rel)) return null;
  try {
    // .native: the names as they are on disk (NODE_MODULES/x is node_modules/x on macOS).
    const root = realpathSync.native(dir);
    const file = realpathSync.native(join(root, rel));
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) return null;
    return viewablePath(file.slice(root.length + 1).split(sep).join("/")) ? file : null;
  } catch {
    return null;
  }
}

/**
 * A file's bytes, at most `cap` of them: opened without following a link (the path is already its
 * real place, so a link swapped in since is refused) and without blocking on a FIFO; the handle
 * must be a regular file. Its size, and the bytes unless it's bigger than the cap; null if it can't.
 * @param {string} file  a path from viewableFile
 * @param {number} cap
 * @returns {{ size: number, bytes: Buffer | null } | null}
 */
function readCapped(file, cap) {
  let fd;
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > cap) return { size: st.size, bytes: null };
    const bytes = Buffer.alloc(st.size);
    let got = 0;
    while (got < st.size) {
      const n = readSync(fd, bytes, got, st.size - got, got);
      if (!n) break;
      got += n;
    }
    return { size: st.size, bytes: bytes.subarray(0, got) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** The images the viewer shows in place (no SVG: it can carry script). */
const VIEW_IMAGES = /** @type {Record<string, string>} */ ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" });

/**
 * An image's bytes for the viewer, under the same rules as viewFile; null if it isn't one.
 * @param {string} dir
 * @param {unknown} rel
 */
export function viewImage(dir, rel) {
  const file = viewableFile(dir, rel);
  const type = typeof rel === "string" ? VIEW_IMAGES[/\.([a-z0-9]+)$/i.exec(rel)?.[1]?.toLowerCase() ?? ""] : undefined;
  if (!file || !type) return null;
  const read = readCapped(file, 16 * 1024 * 1024);
  return read?.bytes ? { type, body: read.bytes } : null;
}

/** The highlighter's language for a file name. @param {string} rel */
export function viewLang(rel) {
  const ext = /\.([a-z0-9]+)$/i.exec(rel)?.[1]?.toLowerCase() ?? "";
  if (VIEW_IMAGES[ext]) return "image";
  return /** @type {Record<string, string>} */ ({ ts: "ts", tsx: "tsx", js: "js", mjs: "js", cjs: "js", jsx: "tsx", json: "json", md: "md", asm: "asm" })[ext] ?? "text";
}

/**
 * Text from a file's bytes, or why it isn't shown: over the size cap, or binary (a NUL byte in its
 * first 8 KB, or not valid UTF-8).
 * @param {Buffer} bytes
 * @returns {{ text: string } | { error: string, binary?: boolean, tooBig?: boolean }}
 */
function viewText(bytes) {
  if (bytes.length > VIEW_MAX_BYTES) return { error: "This file is too big to show here: open it in VS Code.", tooBig: true };
  if (bytes.subarray(0, 8192).includes(0)) return { error: "This is a binary file: it isn't shown here.", binary: true };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { error: "This is a binary file: it isn't shown here.", binary: true };
  }
}

/**
 * What git says about each changed file: "modified", "added", "untracked", "deleted", "renamed" or
 * "conflict", by path. Paths the viewer can't name are left out.
 * @param {Context} ctx
 * @param {string} dir
 * @param {string} [only]  one path
 * @returns {Record<string, string>}
 */
function viewStatus(ctx, dir, only) {
  const r = quietGit(ctx, dir, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", ...(only ? ["--", only] : [])]);
  /** @type {Record<string, string>} */
  const out = {};
  if (!r || r.code !== 0) return out;
  for (const entry of r.stdout.split("\0")) {
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!viewablePath(path)) continue;
    out[path] = xy === "??" ? "untracked" : /U|DD|AA/.test(xy) ? "conflict" : xy.includes("D") ? "deleted" : xy.includes("A") ? "added" : xy.includes("R") ? "renamed" : "modified";
  }
  return out;
}

/**
 * The course folder's files for the viewer's tree: what git tracks plus new files it doesn't ignore
 * (so node_modules, build output and anything in .gitignore never show), minus paths it can't name,
 * each with its git status. At most 5000.
 * @param {Context} ctx
 * @param {string} dir
 */
export function fileTree(ctx, dir) {
  const r = quietGit(ctx, dir, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (r?.refused) return { status: 409, error: OLD_GIT, files: [], truncated: false };
  if (!r || r.code !== 0) return { status: 500, error: "git couldn't list this folder's files.", files: [], truncated: false };
  const status = viewStatus(ctx, dir);
  // Lines added and removed in each changed file, against the last commit (a binary file has none).
  /** @type {Record<string, [number, number]>} */
  const counts = {};
  const num = quietGit(ctx, dir, ["diff", "--numstat", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", "HEAD"]);
  if (num?.code === 0) for (const entry of num.stdout.split("\0")) {
    const m = /^(\d+)\t(\d+)\t(.+)$/s.exec(entry);
    if (m) counts[m[3]] = [Number(m[1]), Number(m[2])];
  }
  const paths = [...new Set([...r.stdout.split("\0"), ...Object.keys(status)].filter(viewablePath))].sort();
  return {
    files: paths.slice(0, 5000).map((path) => ({ path, ...(status[path] ? { status: status[path] } : {}), ...(counts[path] ? { added: counts[path][0], removed: counts[path][1] } : {}) })),
    truncated: paths.length > 5000,
  };
}

/**
 * One file for the viewer, read-only: its text (data, never HTML), its language and git status, or
 * why it can't be shown.
 * @param {Context} ctx
 * @param {string} dir
 * @param {unknown} rel
 */
export function viewFile(ctx, dir, rel) {
  const file = viewableFile(dir, rel);
  if (!file || typeof rel !== "string") return { status: 404, error: "That file can't be shown here." };
  const image = viewLang(rel) === "image";
  const read = readCapped(file, image ? 16 * 1024 * 1024 : VIEW_MAX_BYTES);
  if (!read) return { status: 404, error: "That file can't be shown here." };
  const git = viewStatus(ctx, dir, rel)[rel];
  // An image is shown from /api/file/image: here, only what it is.
  if (image) return { status: 200, path: rel, lang: "image", size: read.size, ...(git ? { git } : {}) };
  if (!read.bytes) return { status: 200, path: rel, lang: viewLang(rel), size: read.size, ...(git ? { git } : {}), error: "This file is too big to show here: open it in VS Code.", tooBig: true };
  const bytes = read.bytes;
  return { status: 200, path: rel, lang: viewLang(rel), size: bytes.length, ...(git ? { git } : {}), ...viewText(bytes) };
}

/**
 * A unified diff (git diff's output) as data: each hunk's header and lines, each line added, removed
 * or context with its old and new line numbers. Nothing in it is interpreted.
 * @param {string} text
 */
export function parseDiff(text) {
  /** @type {{ header: string, lines: { kind: "add" | "del" | "ctx", old: number | null, new: number | null, text: string }[] }[]} */
  const hunks = [];
  let oldN = 0;
  let newN = 0;
  let hunk = null;
  for (const line of text.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (h) {
      oldN = Number(h[1]);
      newN = Number(h[2]);
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue; // the file header (diff --git, index, ---, +++)
    if (line.startsWith("+")) hunk.lines.push({ kind: "add", old: null, new: newN++, text: line.slice(1) });
    else if (line.startsWith("-")) hunk.lines.push({ kind: "del", old: oldN++, new: null, text: line.slice(1) });
    else if (line.startsWith(" ")) hunk.lines.push({ kind: "ctx", old: oldN++, new: newN++, text: line.slice(1) });
    // "\ No newline at end of file", and the empty string after the last newline: not lines of the file
  }
  return hunks;
}

/**
 * A file's uncommitted changes, as data: against the last commit (staged and unstaged together); a
 * new file git doesn't track shows as all added; a deleted one as all removed.
 * @param {Context} ctx
 * @param {string} dir
 * @param {unknown} rel
 */
export function viewDiff(ctx, dir, rel) {
  if (!viewablePath(rel)) return { status: 404, error: "That file can't be shown here." };
  if (quietGit(ctx, dir, ["--version"])?.refused) return { status: 409, path: rel, error: OLD_GIT };
  const git = viewStatus(ctx, dir, rel)[rel];
  if (!git) return { status: 200, path: rel, hunks: [] }; // nothing uncommitted
  if (git === "untracked") {
    const file = viewFile(ctx, dir, rel);
    if (!("text" in file) || typeof file.text !== "string") return { status: file.status, path: rel, git, error: file.error ?? "That file can't be shown here.", ...(file.binary ? { binary: true } : {}) };
    const lines = file.text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return { status: 200, path: rel, git, hunks: [{ header: `@@ -0,0 +1,${lines.length} @@`, lines: lines.map((text, i) => ({ kind: "add", old: null, new: i + 1, text })) }] };
  }
  // Still in the folder: the same rules as reading it (a link out of the folder isn't diffed either).
  if (git !== "deleted" && !viewableFile(dir, rel)) return { status: 404, error: "That file can't be shown here." };
  const r = quietGit(ctx, dir, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "HEAD", "--", rel]);
  if (r?.refused) return { status: 409, path: rel, error: OLD_GIT };
  if (!r || r.code !== 0) return { status: 200, path: rel, git, error: "Its changes couldn't be read." };
  if (r.stdout.length > VIEW_MAX_BYTES) return { status: 200, path: rel, git, error: "The changes are too big to show here: see them with git diff.", tooBig: true };
  if (/^Binary files .* differ$/m.test(r.stdout) && !/^@@ /m.test(r.stdout)) return { status: 200, path: rel, git, binary: true, error: "A binary file changed: it isn't shown here.", hunks: [] };
  return { status: 200, path: rel, git, hunks: parseDiff(r.stdout) };
}

/**
 * Source text as highlighted HTML, for the file viewer. Escape-first: every piece of the text is
 * escaped before it's wrapped, and the only markup added is <span class="hl-…"> with fixed names,
 * so nothing in the file becomes markup. A token that spans lines is closed and reopened at each
 * newline, so the result splits into lines on "\n". Self-contained: it also runs in the page.
 * @param {string} text
 * @param {string} lang  ts, tsx, js, json, md, asm, or anything else for plain
 * @returns {string}
 */
export function highlightSource(text, lang) {
  const esc = (/** @type {string} */ t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const wrap = (/** @type {string} */ cls, /** @type {string} */ t) => (cls ? t.split("\n").map((part) => (part ? `<span class="hl-${cls}">${esc(part)}</span>` : "")).join("\n") : esc(t));
  const js = new Set("abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface keyof let namespace new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield".split(" "));
  /** @type {Record<string, [string, RegExp][]>} */
  const rules = {
    js: [
      ["", /\s+/y],
      ["comment", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
      ["string", /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?/y],
      ["number", /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b/y],
      ["word", /[A-Za-z_$][\w$]*/y],
    ],
    json: [
      ["", /\s+/y],
      ["key", /"(?:\\.|[^"\\\n])*"(?=\s*:)/y],
      ["string", /"(?:\\.|[^"\\\n])*"?/y],
      ["number", /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
      ["keyword", /\b(?:true|false|null)\b/y],
    ],
    md: [
      ["comment", /<!--[\s\S]*?(?:-->|$)/y],
      ["heading", /^#{1,6} [^\n]*/my],
      ["fence", /^ {0,3}```[^\n]*/my],
      ["code", /`[^`\n]+`/y],
      ["strong", /\*\*[^*\n]+\*\*/y],
      ["link", /\[[^\]\n]*\]\([^)\n]*\)/y],
      ["bullet", /^[ \t]*(?:[-*+]|\d+\.)(?= )/my],
      ["", /[^<#`*[\n \t\d-]+|[\s\S]/y],
    ],
    asm: [
      ["", /[ \t]+|\n/y],
      ["comment", /;[^\n]*/y],
      ["label", /^[ \t]*[A-Za-z_.][\w.]*:/my],
      ["keyword", /\.[A-Za-z]+\b/y],
      ["register", /\b[Rr]\d+\b/y],
      ["number", /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)\b/y],
      ["word", /[A-Za-z_][\w]*/y],
    ],
  };
  const set = rules[lang === "ts" || lang === "tsx" ? "js" : lang];
  if (!set || text.length > 400_000) return esc(text);
  let out = "";
  let i = 0;
  let lineStart = true; // asm: the first word on a line is its mnemonic
  while (i < text.length) {
    let hit = false;
    for (const [cls, re] of set) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m || !m[0]) continue;
      const t = m[0];
      let c = cls;
      if (c === "word") {
        if (lang === "asm") c = lineStart ? "keyword" : "";
        else c = js.has(t) ? "keyword" : /^[A-Z]/.test(t) ? "type" : "";
      }
      if (cls === "label") lineStart = true;
      else if (t.includes("\n")) lineStart = true;
      else if (cls !== "") lineStart = false;
      out += wrap(c, t);
      i += t.length;
      hit = true;
      break;
    }
    if (!hit) {
      if (text[i] === "\n") lineStart = true;
      out += esc(text[i]);
      i++;
    }
  }
  return out;
}

/**
 * What the week's guide says about a task: the paragraph (or list item) that names
 * TODO(week N, id), and the ready Codex prompt after it, if the guide has one for it.
 * @param {string} guide
 * @param {number} week
 * @param {string} id
 * @param {string} file
 */
export function guideFor(guide, week, id, file) {
  const lines = guide.split("\n");
  // A guide in the build-step format marks each task (<!-- step week=W id=ID -->): its concept and
  // prompt follow the mark. Older guides name the task's TODO in the text.
  const marked = lines.findIndex((l) => new RegExp(`^\\s*<!--\\s*step\\s+week=\\d+\\s+id=${id}\\s*-->`).test(l));
  const at = marked >= 0 ? marked : lines.findIndex((l) => l.includes(`TODO(week ${week}, ${id})`));
  if (at < 0) return { lesson: "", prompt: "", order: Infinity };
  let from = at;
  while (from > 0 && lines[from - 1].trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[from])) from--;
  let to = at + 1;
  while (to < lines.length && lines[to].trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[to]) && !/^\s*```/.test(lines[to])) to++;
  let lesson = lines.slice(from, to).map((l) => l.trim()).join(" ").replace(/^([-*]|\d+\.)\s+/, "");
  if (marked >= 0) {
    let end = marked + 1;
    while (end < lines.length && !/^\s*```/.test(lines[end]) && !/^\s*<!--\s*step\b/.test(lines[end]) && !/^#{2,3} /.test(lines[end])) end++;
    lesson = lines.slice(marked + 1, end).map((l) => l.trim()).join(" ").replace(/\s+/g, " ").trim();
  }
  let prompt = "";
  {
    // The guide's ready prompt: the first ```text block after the task, if it names this file. The
    // guide is the student's own copy, so this only ever shows a week they've been given.
    for (let i = at + 1; i < lines.length && i < at + 40; i++) {
      if (/^\s*```text\s*$/.test(lines[i])) {
        const close = lines.findIndex((l, j) => j > i && /^\s*```\s*$/.test(l));
        const block = lines.slice(i + 1, close < 0 ? undefined : close);
        const pad = Math.min(...block.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0));
        // The guide wraps its prompt at 100 columns: put each sentence back on one line (list items keep theirs).
        const text = block
          .map((l) => l.slice(pad))
          .reduce((out, l) => (out && l.trim() && !/^\s*(\d+\.|[-*])\s/.test(l) && out.at(-1)?.trim() ? [...out.slice(0, -1), `${out.at(-1)} ${l.trim()}`] : [...out, l]), /** @type {string[]} */ ([]))
          .join("\n")
          .trim();
        if (text.includes(file)) prompt = text;
        break;
      }
    }
  }
  return { lesson, prompt, order: at };
}

/**
 * A week's build steps, from its guide (docs/weeks/week-NN.md), in order. Each step is a block the
 * guide marks with <!-- step week=W id=ID -->: the "### " heading above it is its title, the text
 * between the mark and its first ```text block is the concept, that block is the prompt, then a
 * "Test: `cmd`" (or "Test: none yet: why") line, an "Ask:" line and a "Stuck?" line (the common
 * failure and what to try, shown under the step, first when its test is red). Steps under a "## " heading that
 * says take-home come after, marked so. Each carries where its task stands: still the stub, or
 * committed as it is now.
 * @param {Context} ctx @param {string} dir @param {number} week
 * @param {{ id: string, week: number, file: string, stubbed: boolean, rev: string }[]} tasks  every week's tasks
 */
export function buildSteps(ctx, dir, week, tasks) {
  const guide = ctx.readText(join(dir, `docs/weeks/week-${pad2(week)}.md`)) ?? "";
  const lines = guide.split("\n");
  /** @type {{ title: string, week: number, id: string, concept: string, prompt: string, test: string, testNote: string, ask: string, stuck: string, takeHome: boolean, component: { id: string, title: string, intro: string, works: string, check: string, board: boolean, notes: string } }[]} */
  const found = [];
  let section = "";
  let heading = "";
  /** @type {{ id: string, title: string, intro: string, works: string, check: string, board: boolean, notes: string }} */
  let component = { id: "", title: "", intro: "", works: "", check: "", board: false, notes: "" };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) section = line;
    // A component: "## Component N · title", its mark, a short intro, then "When it works:", and
    // optional "Check: `cmd`" and "Board: yes" lines. Its steps are the step blocks until the next one.
    const comp = /^\s*<!--\s*component\s+id=([a-z0-9-]+)\s*-->\s*$/.exec(line);
    if (comp) {
      const intro = [];
      let works = "";
      let check = "";
      let board = false;
      let k = i + 1;
      /** @type {string[]} */
      const notes = [];
      for (; k < lines.length && !/^#{2,3} /.test(lines[k]) && !/^\s*<!--\s*(step|component)\b/.test(lines[k]); k++) {
        // The component's reference (state table, encoding…): <!-- notes --> … <!-- /notes -->.
        if (/^\s*<!--\s*notes\s*-->\s*$/.test(lines[k])) {
          for (k++; k < lines.length && !/^\s*<!--\s*\/notes\s*-->\s*$/.test(lines[k]); k++) if (!/^####\s+Design notes\s*$/i.test(lines[k])) notes.push(lines[k]);
          continue;
        }
        const w = /^\s*When it works:\s*(.+)$/.exec(lines[k]);
        const c = /^\s*Check:\s*`([^`]+)`/.exec(lines[k]);
        if (w) {
          works = w[1].trim();
          check ||= /`([^`]+)`/.exec(works)?.[1] ?? "";
          board ||= /On the Board/i.test(works);
        }
        else if (c) check = c[1];
        else if (/^\s*Board:\s*yes\b/i.test(lines[k])) board = true;
        else intro.push(lines[k].trim());
      }
      // Its title: "### Component · title" (or "## Component N · title") just above the mark.
      const above = /^Component\b/i.test(heading) ? heading : section.replace(/^##\s+/, "");
      component = { id: comp[1], title: above.replace(/^Component\s*(\d+\s*)?·\s*/i, "").trim(), intro: intro.join(" ").replace(/\s+/g, " ").trim(), works, check, board, notes: notes.length ? renderMarkdown(notes.join("\n"), { strict: true }) : "" };
      continue;
    }
    if (/^### /.test(line)) heading = line.slice(4).trim();
    const mark = /^\s*<!--\s*step\s+week=(\d+)\s+id=([a-z0-9-]+)\s*-->\s*$/.exec(line);
    if (!mark) continue;
    let j = i + 1;
    const concept = [];
    while (j < lines.length && !/^\s*```text\s*$/.test(lines[j]) && !/^\s*<!--\s*step\b/.test(lines[j]) && !/^#{2,3} /.test(lines[j])) concept.push(lines[j++]);
    let prompt = "";
    if (/^\s*```text\s*$/.test(lines[j] ?? "")) {
      const close = lines.findIndex((l, k) => k > j && /^\s*```\s*$/.test(l));
      const block = lines.slice(j + 1, close < 0 ? undefined : close);
      const pad = Math.min(...block.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0));
      // The guide wraps at 100 columns: each sentence back on one line (list items keep theirs).
      prompt = block
        .map((l) => l.slice(Number.isFinite(pad) ? pad : 0))
        .reduce((out, l) => (out.length && l.trim() && !/^\s*(\d+\.|[-*])\s/.test(l) && out[out.length - 1].trim() ? [...out.slice(0, -1), `${out[out.length - 1]} ${l.trim()}`] : [...out, l]), /** @type {string[]} */ ([]))
        .join("\n")
        .trim();
      j = close < 0 ? lines.length : close + 1;
    }
    let test = "";
    let testNote = "";
    let ask = "";
    let stuck = "";
    for (let k = j; k < lines.length && k < j + 8 && !/^\s*<!--\s*step\b/.test(lines[k]) && !/^#{2,3} /.test(lines[k]); k++) {
      const t = /Test:\s*`([^`]+)`/.exec(lines[k]);
      if (t) test = t[1];
      else if (/^\s*Test:\s*none/i.test(lines[k])) testNote = lines[k].replace(/^\s*Test:\s*/i, "").replace(/\s*·.*$/, "").trim();
      const q = /^\s*Ask:\s*(.+)$/.exec(lines[k]);
      if (q) ask = q[1].trim();
      const h = /^\s*Stuck\?\s*(.+)$/.exec(lines[k]);
      if (h) stuck = h[1].trim();
    }
    found.push({ title: heading.replace(/^(Round|Step|Take-home)\s+\d+\s*·\s*/i, ""), week: Number(mark[1]), id: mark[2], concept: concept.map((l) => l.trim()).join(" ").replace(/\s+/g, " ").trim(), prompt, test, testNote, ask, stuck, takeHome: /take-?home/i.test(section), component });
  }
  const ordered = [...found.filter((x) => !x.takeHome), ...found.filter((x) => x.takeHome)];
  /** @type {Map<string, Map<string, string>>} */
  const committedFiles = new Map();
  const inHead = (/** @type {string} */ file, /** @type {string} */ id) => {
    if (!committedFiles.has(file)) {
      const text = output(ctx, ["git", "show", `HEAD:${file}`], dir) ?? "";
      const head = text.split("\n");
      committedFiles.set(file, new Map(findCodeRegions(text).map((r) => [r.id, head.slice(r.start + 1, r.end).map((l) => l.trim()).join("\n")])));
    }
    return committedFiles.get(file)?.get(id);
  };
  return ordered.map((step, n) => {
    const task = tasks.find((t) => t.id === step.id && t.week === step.week) ?? tasks.find((t) => t.id === step.id);
    const now = task ? (ctx.readText(join(dir, task.file)) ?? "") : "";
    const region = task ? findCodeRegions(now).find((r) => r.id === task.id) : undefined;
    const body = region ? now.split("\n").slice(region.start + 1, region.end).map((l) => l.trim()).join("\n") : "";
    const head = task && region ? inHead(task.file, task.id) : undefined;
    const committed = Boolean(task && !task.stubbed && region && head === body);
    // Its code differs from the last commit (written, not committed yet).
    const dirty = Boolean(task && region && head !== undefined && head !== body);
    return { n: n + 1, ...step, week: task?.week ?? step.week, file: task?.file ?? "", found: Boolean(task), stubbed: task?.stubbed ?? true, committed, dirty, rev: task?.rev ?? "" };
  });
}

/** A task's lines as the course released them, by week, file and task (they don't change while a studio runs). @type {Map<string, string | null>} */
const releasedRegions = new Map();

/**
 * Is this task still the stub the course gave out? Only then does its card start empty, with the
 * grey hint to type over. A TODO line isn't enough: Codex (or the student) often leaves it above
 * real code. Compared with the released week when it's here; without it, only the standard stub
 * (its TODO, comments and a todo() call) counts.
 * @param {Context} ctx @param {string} dir @param {string} file @param {CodeRegion} r @param {number} week @param {string[]} body  the task's lines, without its indent
 */
function isUntouchedStub(ctx, dir, file, r, week, body) {
  if (!/^(\/\/|;) TODO\(/.test(body[0] ?? "") || !(body[0] ?? "").includes(`, ${r.id})`)) return false;
  const key = `${dir}|${week}|${file}|${r.id}`;
  if (!releasedRegions.has(key)) {
    const text = output(ctx, ["git", "show", `upstream/week-${week}:${file}`], dir);
    const lines = text?.split("\n");
    const was = lines && findCodeRegions(text ?? "").find((x) => x.id === r.id);
    releasedRegions.set(key, lines && was ? lines.slice(was.start + 1, was.end).map((l) => l.replace(/\r$/, "").trim()).join("\n") : null);
  }
  const released = releasedRegions.get(key);
  if (released !== null && released !== undefined) return released === body.map((l) => l.trim()).join("\n");
  return body.every((l) => !l.trim() || /^\s*(\/\/|;)/.test(l) || /^return (todo|notBuilt)\(/.test(l.trim()));
}

/**
 * A week's tasks in lesson order (class tasks first, then take-home, each in the guide's order):
 * each with the read-only lines around it, its body as it is now, and what the guide says.
 * @param {Context} ctx
 * @param {string} dir
 * @param {number} week
 */
export function weekCode(ctx, dir, week) {
  const guide = ctx.readText(join(dir, `docs/weeks/week-${pad2(week)}.md`)) ?? "";
  // The grey hint text, as the week was released with it (studio/hints/week-NN.json).
  /** @type {Record<string, unknown>} */
  let hints = {};
  try {
    hints = JSON.parse(ctx.readText(join(dir, `studio/hints/week-${pad2(week)}.json`)) ?? "{}") ?? {};
  } catch {
    // no hints: the boxes start with what's in the file
  }
  /** @type {Map<string, { words: string[], members: string[] }>} */
  const names = new Map();
  // Which tasks each test needs, measured at release (null in an older hints file).
  const rawNeeds = hints.$tests;
  /** @type {Record<string, string[]> | null} */
  const needs = rawNeeds && typeof rawNeeds === "object" && !Array.isArray(rawNeeds) ? /** @type {Record<string, string[]>} */ (rawNeeds) : null;
  const tests = quietGit(ctx, dir, ["ls-files", "--", `tests/week-${pad2(week)}/`], { check: false })?.stdout.split("\n").filter((f) => /\.test\.tsx?$/.test(f)) ?? [];
  const tasks = [];
  for (const file of regionFiles(ctx, dir)) {
    const text = ctx.readText(join(dir, file));
    if (!text || !text.includes(`@student week=${week} `)) continue;
    const lines = text.split("\n");
    for (const r of findCodeRegions(text)) {
      if (r.week !== week) continue;
      const body = lines.slice(r.start + 1, r.end).map((l) => l.replace(/\r$/, "")).map((l) => (l.startsWith(r.indent) ? l.slice(r.indent.length) : l.trimStart()));
      const said = guideFor(guide, week, r.id, file);
      const prompt = said.prompt || (/^board\//.test(file) ? `In ${file} only, fill in TODO(week ${week}, ${r.id}): ${r.description}. Don't change any other file or any test, and explain each line you write.` : "");
      const modulePath = file.replace(/\.(tsx?|asm)$/, "");
      // The test files with a test that needs this task (measured at release), else the ones importing its file.
      const measured = [...new Set(Object.entries(needs ?? {}).filter(([, ids]) => ids.includes(r.id)).map(([key]) => key.split(" > ")[0]))].filter((t) => tests.includes(t));
      const covering = measured.length ? measured : tests.filter((t) => (ctx.readText(join(dir, t)) ?? "").includes(modulePath));
      // The file's names, and the ones its tasks' hints use (the stubs don't have them yet).
      if (!names.has(file)) names.set(file, fileNames(ctx, dir, file, [text, ...Object.entries(hints).filter(([k]) => k !== "$tests").map(([, h]) => hintOf(h).code)].join("\n")));
      const { code: hint, steps } = hintOf(hints[r.id]);
      const context = regionContext(lines, r);
      const signature = context.before.find((l) => !/^\s*(\/\*\*?|\*|\/\/)/.test(l)) ?? "";
      const fn = /function\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?)?\(/.exec(signature);
      tasks.push({ id: r.id, file, part: r.part, hint, steps, fn: fn?.[1] ?? fn?.[2] ?? "", endLine: r.end, .../** @type {{ words: string[], members: string[] }} */ (names.get(file)), description: r.description, ...regionContext(lines, r), indent: r.indent, body: body.join("\n"), rev: regionRev(lines, r), lesson: said.lesson, prompt, tests: covering.length ? covering : [`tests/week-${pad2(week)}`], needs, order: said.order, line: r.start + 2, stubbed: isUntouchedStub(ctx, dir, file, r, week, body) });
    }
  }
  return tasks.sort((a, b) => Number(a.part === "home") - Number(b.part === "home") || a.order - b.order);
}

/**
 * A task's hint as a release ships it: its code and what each part does (an older studio/hints
 * file holds just the code).
 * @param {unknown} hint
 * @returns {{ code: string, steps: { line: number, explain: string }[] }}
 */
export function hintOf(hint) {
  if (typeof hint === "string") return { code: hint, steps: [] };
  const h = /** @type {{ code?: unknown, steps?: unknown }} */ (hint ?? {});
  if (typeof h.code !== "string") return { code: "", steps: [] };
  const steps = Array.isArray(h.steps) ? h.steps.filter((x) => Number.isInteger(x?.line) && typeof x?.explain === "string") : [];
  return { code: h.code, steps };
}

const JS_WORDS = new Set("abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of private protected public readonly return static super switch this throw true try type typeof undefined var void while with yield".split(" "));

/**
 * Names to complete in a file's code box: the identifiers in the file and the local modules it
 * imports (after a letter), and the members used or declared there (after a dot). No type
 * checking: a short, useful list.
 * @param {Context} ctx
 * @param {string} dir
 * @param {string} file
 * @param {string} text
 */
export function fileNames(ctx, dir, file, text) {
  const texts = [text];
  for (const m of text.matchAll(/from\s+"((?:\.{1,2}\/|@\/)[^"]+)"/g)) {
    const spec = m[1].startsWith("@/") ? m[1].slice(2) : join(dirname(file), m[1]);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const other = ctx.readText(join(dir, spec + ext));
      if (other) {
        texts.push(other);
        break;
      }
    }
  }
  /** @type {Map<string, number>} */
  const words = new Map();
  /** @type {Set<string>} */
  const members = new Set();
  for (const t of texts) {
    const code = t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [w] of code.matchAll(/[A-Za-z_$][\w$]+/g)) if (!JS_WORDS.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
    for (const m of code.matchAll(/\.([A-Za-z_$][\w$]*)/g)) members.add(m[1]);
    for (const m of code.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/gm)) members.add(m[1]);
  }
  return { words: [...words.keys()].sort((a, b) => (words.get(b) ?? 0) - (words.get(a) ?? 0)).slice(0, 500), members: [...members].slice(0, 500) };
}

/**
 * Write a task's body into its region, and nothing else. Refused when the path isn't a code file
 * of the course, the region isn't found exactly once, it changed since the page loaded it (rev),
 * or the body holds a marker.
 * @param {string} dir
 * @param {{ file: unknown, id: unknown, week: number, rev: unknown, body: unknown }} change
 * @returns {{ error: string } | { file: string, rev: string }}
 */
export function writeRegion(dir, { file, id, week, rev, body }) {
  const path = codeFilePath(dir, /** @type {string} */ (file));
  if (!path) return { error: "That file isn't one of the course's code files." };
  if (typeof body !== "string" || body.length > MAX_BODY) return { error: "That's too long for one task." };
  if (!body.trim()) return { error: "The box is empty, so nothing was saved: your file is as it was. Type or paste the code first." };
  if (body.split("\n").some((l) => REGION_MARKER.test(l))) return { error: "The code can't contain @student, @stub or @end lines: those mark where the task starts and ends." };
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split("\n");
  const found = findCodeRegions(text).filter((r) => r.id === id);
  if (found.length !== 1 || found[0].week !== week) return { error: `Couldn't find the task ${String(id)} in ${String(file)} (its @student and @end lines must be there, once).` };
  const r = found[0];
  if (regionRev(lines, r) !== rev) return { error: "This task changed in the file since the card loaded it (Codex or VS Code), so nothing was saved. Reload it, then save again." };
  const cr = eol === "\r\n" ? "\r" : "";
  const written = body.replace(/\r/g, "").split("\n").map((l) => (l.trim() ? `${r.indent}${l}` : "") + cr);
  const next = [...lines.slice(0, r.start + 1), ...written, ...lines.slice(r.end)].join("\n");
  const tmp = `${path}.studio-${process.pid}`;
  writeFileSync(tmp, next);
  renameSync(tmp, path);
  const again = findCodeRegions(next).find((x) => x.id === id);
  return { file: /** @type {string} */ (file), rev: again ? regionRev(next.split("\n"), again) : "" };
}

/**
 * A test's failure in words a student can act on. vitest's JSON report says "STACK_TRACE_ERROR"
 * for a test that ran out of time, so that becomes what it means.
 * @param {string} message
 */
export function readableFailure(message) {
  if (/^Error: STACK_TRACE_ERROR\b/.test(message) || /^Error: Test timed out/.test(message))
    return "Timed out: the test waited and nothing answered in time. Usually a reply that never comes: something that should answer (a part, a handler) doesn't yet, or the code waits for the wrong message.";
  return message;
}

/**
 * The results of a vitest JSON report, for one task: what passed, what failed, and what only waits
 * for another task that's still a stub: its TODO is in the message, the error came from inside its
 * code, or the test is named after its function. This task's own failures are listed first.
 * @typedef {{ id: string, file: string, fn?: string, line?: number, endLine?: number }} TaskRef
 * @param {string} json
 * @param {string | TaskRef} task
 * @param {TaskRef[]} [stubs]  the week's other tasks that are still stubs
 * @param {Record<string, string[]> | null} [needs]  which tasks each test needs, measured when the week
 *   was released (the hints file's "$tests"): a test that doesn't need this task isn't counted; one
 *   that also needs a task still a stub waits for it. Tests it doesn't list fall back to the guesses.
 * @param {boolean} [sandboxed]  run in Codex's sandbox: a test stopped by "listen EPERM" says nothing about the code (counted as blocked)
 */
export function taskResults(json, task, stubs = [], needs = null, sandboxed = false) {
  const me = typeof task === "string" ? { id: task, file: "" } : task;
  const stubbed = new Set(stubs.map((s) => s.id));
  const id = me.id;
  const named = (/** @type {string} */ text, /** @type {string | undefined} */ fn) => Boolean(fn && fn.length > 2 && new RegExp(`\\b${fn.replace(/\$/g, "\\$")}\\b`).test(text));
  /** Where a stack frame lands: inside which stubbed task's code. @param {string} stack */
  const thrownIn = (stack) => {
    for (const m of stack.matchAll(/([\w./@-]+\.(?:tsx?|asm)):(\d+):\d+/g)) {
      const line = Number(m[2]);
      const hit = stubs.find((s) => s.line && s.endLine && m[1].endsWith(`/${s.file}`) && line >= s.line && line <= s.endLine);
      if (hit) return hit.id;
    }
    return null;
  };
  const mine = (/** @type {string} */ name, /** @type {string} */ message) => named(name, me.fn) || (me.file !== "" && message.includes(`/${me.file}:`));
  /** @type {{ testResults?: { name?: string, message?: string, status?: string, assertionResults?: { fullName?: string, title?: string, status?: string, failureMessages?: string[] }[] }[] }} */
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    return null;
  }
  let passed = 0;
  let blocked = 0;
  /** @type {Set<string>} */
  const waiting = new Set();
  /** @type {{ test: string, message: string, own?: boolean }[]} */
  const failures = [];
  /** The other task a failure waits for, or null. @param {string} m @param {string} [name] */
  const other = (m, name = "") => {
    const todo = [...m.matchAll(/TODO\(week \d+: ([a-z0-9-]+)\)/g)].map((x) => x[1]).find((x) => x !== id);
    if (todo) return todo;
    const inside = thrownIn(m);
    if (inside && inside !== id) return inside;
    if (name && !named(name, me.fn)) return stubs.find((s) => s.id !== id && named(name, s.fn))?.id ?? null;
    return null;
  };
  for (const file of report.testResults ?? []) {
    const name = (file.name ?? "").replace(/^.*?(tests\/)/, "$1");
    if (!(file.assertionResults ?? []).length && file.status === "failed") {
      const message = file.message ?? "";
      const waits = other(message);
      if (waits) waiting.add(waits);
      else failures.push({ test: name, message: message.split("\n").slice(0, 6).join("\n") });
    }
    for (const t of file.assertionResults ?? []) {
      const need = needs?.[`${name} > ${t.fullName ?? ""}`];
      if (need) {
        if (!need.includes(id)) continue; // not this task's test
        const blocked = need.filter((n) => n !== id && stubbed.has(n));
        if (blocked.length) {
          if (t.status !== "passed") for (const n of blocked) waiting.add(n);
          continue;
        }
      }
      if (t.status === "passed") passed++;
      else if (t.status === "failed") {
        const message = readableFailure((t.failureMessages ?? []).join("\n"));
        if (sandboxed && /listen EPERM/.test(message)) {
          blocked++;
          continue;
        }
        // The measured needs cover this week's tasks; an earlier week's stub still shows as its TODO.
        const waits = need ? ([...message.matchAll(/TODO\(week \d+: ([a-z0-9-]+)\)/g)].map((x) => x[1]).find((x) => x !== id) ?? null) : other(message, t.fullName ?? t.title ?? "");
        if (waits) waiting.add(waits);
        else {
          const test = t.fullName ?? t.title ?? name;
          const own = mine(test, message);
          failures.push({ test, message: message.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l) => !/^\s+at /.test(l)).slice(0, 6).join("\n"), ...(own ? { own } : {}) });
        }
      }
    }
  }
  // This task's own failures first: the test is named after its function, or the error came from its file.
  failures.sort((a, b) => Number(Boolean(b.own)) - Number(Boolean(a.own)));
  return { passed, failed: failures.length, failures: failures.slice(0, 5), waiting: [...waiting], ...(blocked ? { blocked } : {}) };
}

// ── The page (HTML, CSS and the browser code, all in this file) ────────────


// ── The machine view: a replay of the finished computer (shown when setup is done) ──

// One recorded run of the finished system (the course's reference solution): the countdown and
// blink demo programs and one button press. Only what travelled on the bus and small status
// snapshots, one entry per tick. Made by scripts/studio/record-machine.ts --write; don't edit by hand.
/** @type {MachineTrace | null} */
const MACHINE_TRACE = /* @machine-trace-begin */ {"about":"One recorded run of the finished NetSim system: countdown and blink, and one button press. Messages and status only.","parts":{"cpu":"CPU","memory":"Memory","button-1":"Button","led-1":"LED","display-1":"Display"},"ticks":[{"t":1,"e":[["mem.read","cpu","memory",0,4],["mem.read","cpu","memory",128,4],["mem.data","memory","cpu",0,4],["mem.data","memory","cpu",128,4]],"c":[["WAIT_FETCH",0,null,"countdown",0],["WAIT_FETCH",128,null,"blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":2,"e":[],"c":[["DECODE",0,null,"countdown",0],["DECODE",128,null,"blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":3,"e":[],"c":[["EXECUTE",0,"LOADI R0, 9","countdown",0],["EXECUTE",128,"LOADI R2, 4","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":4,"e":[],"c":[["FETCH",4,"LOADI R0, 9","countdown",0],["FETCH",132,"LOADI R2, 4","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":5,"e":[["mem.read","cpu","memory",4,4],["mem.read","cpu","memory",132,4],["mem.data","memory","cpu",4,4],["mem.data","memory","cpu",132,4]],"c":[["WAIT_FETCH",4,"LOADI R0, 9","countdown",0],["WAIT_FETCH",132,"LOADI R2, 4","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":6,"e":[],"c":[["DECODE",4,"LOADI R0, 9","countdown",0],["DECODE",132,"LOADI R2, 4","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":7,"e":[],"c":[["EXECUTE",4,"LOADI R1, 1","countdown",0],["EXECUTE",132,"LOADI R3, 1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":8,"e":[],"c":[["FETCH",8,"LOADI R1, 1","countdown",0],["FETCH",136,"LOADI R3, 1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":9,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",136,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",136,4]],"c":[["WAIT_FETCH",8,"LOADI R1, 1","countdown",0],["WAIT_FETCH",136,"LOADI R3, 1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":10,"e":[],"c":[["DECODE",8,"LOADI R1, 1","countdown",0],["DECODE",136,"LOADI R3, 1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":11,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",136,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":12,"e":[["mem.write","cpu","memory",1010,9],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,9]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":0},{"t":13,"e":[["mem.read","cpu","memory",140,4],["mem.data","memory","cpu",140,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":9,"b":"RELEASED","n":0},{"t":14,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":9,"b":"RELEASED","n":0},{"t":15,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":9,"b":"RELEASED","n":0},{"t":16,"e":[["mem.write","cpu","memory",1009,255],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,255]],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["WAIT_DATA",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":9,"b":"RELEASED","n":0},{"t":17,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":18,"e":[["mem.read","cpu","memory",16,4],["mem.read","cpu","memory",144,4],["mem.data","memory","cpu",16,4],["mem.data","memory","cpu",144,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":19,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["DECODE",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":20,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["EXECUTE",144,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":21,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":22,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",148,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",148,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":23,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":24,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":25,"e":[["input","you","button-1"],["mem.write","cpu","memory",1010,8],["mem.write","cpu","memory",1009,0],["mem.read","display-1","memory",1010,1],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1010],["mem.ack","memory","cpu",1009],["mem.data","memory","display-1",1010,8],["mem.data","memory","led-1",1009,0]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["WAIT_DATA",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":9,"b":"RELEASED","n":0},{"t":26,"e":[["irq","button-1","cpu",512]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":27,"e":[["mem.read","cpu","memory",512,4],["mem.read","cpu","memory",152,4],["mem.data","memory","cpu",512,4],["mem.data","memory","cpu",152,4]],"c":[["WAIT_FETCH",512,"STORE R0, 0x3F2","countdown",1],["WAIT_FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":28,"e":[],"c":[["DECODE",512,"STORE R0, 0x3F2","countdown",1],["DECODE",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":29,"e":[],"c":[["EXECUTE",512,"LOAD R0, 0x3E0","countdown",1],["EXECUTE",152,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":30,"e":[["mem.read","cpu","memory",992,1],["mem.data","memory","cpu",992,0]],"c":[["WAIT_DATA",512,"LOAD R0, 0x3E0","countdown",1],["FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":31,"e":[["mem.read","cpu","memory",156,4],["mem.data","memory","cpu",156,4]],"c":[["FETCH",516,"LOAD R0, 0x3E0","countdown",1],["WAIT_FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":32,"e":[["mem.read","cpu","memory",516,4],["mem.data","memory","cpu",516,4]],"c":[["WAIT_FETCH",516,"LOAD R0, 0x3E0","countdown",1],["DECODE",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":33,"e":[],"c":[["DECODE",516,"LOAD R0, 0x3E0","countdown",1],["EXECUTE",156,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":34,"e":[],"c":[["EXECUTE",516,"LOADI R1, 1","countdown",1],["FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":35,"e":[["mem.read","cpu","memory",136,4],["mem.data","memory","cpu",136,4]],"c":[["FETCH",520,"LOADI R1, 1","countdown",1],["WAIT_FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":36,"e":[["mem.read","cpu","memory",520,4],["mem.data","memory","cpu",520,4]],"c":[["WAIT_FETCH",520,"LOADI R1, 1","countdown",1],["DECODE",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":37,"e":[],"c":[["DECODE",520,"LOADI R1, 1","countdown",1],["EXECUTE",136,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":38,"e":[],"c":[["EXECUTE",520,"ADD R0, R1","countdown",1],["FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":39,"e":[["mem.read","cpu","memory",140,4],["mem.data","memory","cpu",140,4]],"c":[["FETCH",524,"ADD R0, R1","countdown",1],["WAIT_FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":40,"e":[["mem.read","cpu","memory",524,4],["mem.data","memory","cpu",524,4]],"c":[["WAIT_FETCH",524,"ADD R0, R1","countdown",1],["DECODE",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":41,"e":[],"c":[["DECODE",524,"ADD R0, R1","countdown",1],["EXECUTE",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":42,"e":[["mem.write","cpu","memory",1009,255],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,255]],"c":[["EXECUTE",524,"STORE R0, 0x3E0","countdown",1],["WAIT_DATA",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":43,"e":[["mem.write","cpu","memory",992,1],["mem.ack","memory","cpu",992]],"c":[["WAIT_DATA",524,"STORE R0, 0x3E0","countdown",1],["FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":44,"e":[["mem.read","cpu","memory",144,4],["mem.data","memory","cpu",144,4]],"c":[["FETCH",528,"STORE R0, 0x3E0","countdown",1],["WAIT_FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":45,"e":[["mem.read","cpu","memory",528,4],["mem.data","memory","cpu",528,4]],"c":[["WAIT_FETCH",528,"STORE R0, 0x3E0","countdown",1],["DECODE",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":46,"e":[],"c":[["DECODE",528,"STORE R0, 0x3E0","countdown",1],["EXECUTE",144,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":47,"e":[],"c":[["EXECUTE",528,"IRET","countdown",1],["FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":48,"e":[["mem.read","cpu","memory",148,4],["mem.data","memory","cpu",148,4]],"c":[["FETCH",12,"IRET","countdown",0],["WAIT_FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":49,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"IRET","countdown",0],["DECODE",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":50,"e":[],"c":[["DECODE",12,"IRET","countdown",0],["EXECUTE",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":51,"e":[["mem.write","cpu","memory",1009,0],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,0]],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["WAIT_DATA",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":8,"b":"RELEASED","n":1},{"t":52,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":53,"e":[["mem.read","cpu","memory",16,4],["mem.read","cpu","memory",152,4],["mem.data","memory","cpu",16,4],["mem.data","memory","cpu",152,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":54,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["DECODE",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":55,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["EXECUTE",152,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":56,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":57,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",156,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",156,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":58,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":59,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",156,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":60,"e":[["mem.write","cpu","memory",1010,7],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,7]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":8,"b":"RELEASED","n":1},{"t":61,"e":[["mem.read","cpu","memory",136,4],["mem.data","memory","cpu",136,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":62,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":63,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",136,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":64,"e":[],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":65,"e":[["mem.read","cpu","memory",140,4],["mem.data","memory","cpu",140,4]],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":66,"e":[["mem.read","cpu","memory",16,4],["mem.data","memory","cpu",16,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["DECODE",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":67,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["EXECUTE",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":68,"e":[["mem.write","cpu","memory",1009,255],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,255]],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["WAIT_DATA",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":7,"b":"RELEASED","n":1},{"t":69,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":7,"b":"RELEASED","n":1},{"t":70,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",144,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",144,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":7,"b":"RELEASED","n":1},{"t":71,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":7,"b":"RELEASED","n":1},{"t":72,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",144,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":7,"b":"RELEASED","n":1},{"t":73,"e":[["mem.write","cpu","memory",1010,6],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,6]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":7,"b":"RELEASED","n":1},{"t":74,"e":[["mem.read","cpu","memory",148,4],["mem.data","memory","cpu",148,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":6,"b":"RELEASED","n":1},{"t":75,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":6,"b":"RELEASED","n":1},{"t":76,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":6,"b":"RELEASED","n":1},{"t":77,"e":[["mem.write","cpu","memory",1009,0],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,0]],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["WAIT_DATA",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":6,"b":"RELEASED","n":1},{"t":78,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":79,"e":[["mem.read","cpu","memory",16,4],["mem.read","cpu","memory",152,4],["mem.data","memory","cpu",16,4],["mem.data","memory","cpu",152,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":80,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["DECODE",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":81,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["EXECUTE",152,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":82,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":83,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",156,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",156,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":84,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":85,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",156,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":86,"e":[["mem.write","cpu","memory",1010,5],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,5]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":6,"b":"RELEASED","n":1},{"t":87,"e":[["mem.read","cpu","memory",136,4],["mem.data","memory","cpu",136,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":88,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",136,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":89,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",136,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":90,"e":[],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":91,"e":[["mem.read","cpu","memory",140,4],["mem.data","memory","cpu",140,4]],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":92,"e":[["mem.read","cpu","memory",16,4],["mem.data","memory","cpu",16,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["DECODE",140,"LOADI R0, 255","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":93,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["EXECUTE",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":94,"e":[["mem.write","cpu","memory",1009,255],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,255]],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["WAIT_DATA",140,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":5,"b":"RELEASED","n":1},{"t":95,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":5,"b":"RELEASED","n":1},{"t":96,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",144,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",144,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":5,"b":"RELEASED","n":1},{"t":97,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",144,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":5,"b":"RELEASED","n":1},{"t":98,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",144,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":5,"b":"RELEASED","n":1},{"t":99,"e":[["mem.write","cpu","memory",1010,4],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,4]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":5,"b":"RELEASED","n":1},{"t":100,"e":[["mem.read","cpu","memory",148,4],["mem.data","memory","cpu",148,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":4,"b":"RELEASED","n":1},{"t":101,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",148,"LOADI R0, 0","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":4,"b":"RELEASED","n":1},{"t":102,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":4,"b":"RELEASED","n":1},{"t":103,"e":[["mem.write","cpu","memory",1009,0],["mem.read","led-1","memory",1009,1],["mem.ack","memory","cpu",1009],["mem.data","memory","led-1",1009,0]],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["WAIT_DATA",148,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":1,"d":4,"b":"RELEASED","n":1},{"t":104,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":105,"e":[["mem.read","cpu","memory",16,4],["mem.read","cpu","memory",152,4],["mem.data","memory","cpu",16,4],["mem.data","memory","cpu",152,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["WAIT_FETCH",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":106,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["DECODE",152,"STORE R0, 0x3F1","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":107,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["EXECUTE",152,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":108,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":109,"e":[["mem.read","cpu","memory",8,4],["mem.read","cpu","memory",156,4],["mem.data","memory","cpu",8,4],["mem.data","memory","cpu",156,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["WAIT_FETCH",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":110,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["DECODE",156,"SUB R2, R3","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":111,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["EXECUTE",156,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":112,"e":[["mem.write","cpu","memory",1010,3],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,3]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["FETCH",160,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":4,"b":"RELEASED","n":1},{"t":113,"e":[["mem.read","cpu","memory",160,4],["mem.data","memory","cpu",160,4]],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["WAIT_FETCH",160,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":114,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["DECODE",160,"JNZ 0x088","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":115,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["EXECUTE",160,"HALT","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":116,"e":[],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["HALTED",160,"HALT","blink",0]],"p":[["countdown","RUNNING"],["blink","RUNNING"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":117,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":118,"e":[["mem.read","cpu","memory",16,4],["mem.data","memory","cpu",16,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":119,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":120,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":121,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":122,"e":[["mem.read","cpu","memory",8,4],["mem.data","memory","cpu",8,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":123,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":124,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":125,"e":[["mem.write","cpu","memory",1010,2],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,2]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":3,"b":"RELEASED","n":1},{"t":126,"e":[],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":127,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":128,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":129,"e":[],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":130,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":131,"e":[["mem.read","cpu","memory",16,4],["mem.data","memory","cpu",16,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":132,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":133,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":134,"e":[],"c":[["FETCH",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":135,"e":[["mem.read","cpu","memory",8,4],["mem.data","memory","cpu",8,4]],"c":[["WAIT_FETCH",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":136,"e":[],"c":[["DECODE",8,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":137,"e":[],"c":[["EXECUTE",8,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":138,"e":[["mem.write","cpu","memory",1010,1],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,1]],"c":[["WAIT_DATA",8,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":2,"b":"RELEASED","n":1},{"t":139,"e":[],"c":[["FETCH",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":140,"e":[["mem.read","cpu","memory",12,4],["mem.data","memory","cpu",12,4]],"c":[["WAIT_FETCH",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":141,"e":[],"c":[["DECODE",12,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":142,"e":[],"c":[["EXECUTE",12,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":143,"e":[],"c":[["FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":144,"e":[["mem.read","cpu","memory",16,4],["mem.data","memory","cpu",16,4]],"c":[["WAIT_FETCH",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":145,"e":[],"c":[["DECODE",16,"SUB R0, R1","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":146,"e":[],"c":[["EXECUTE",16,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":147,"e":[],"c":[["FETCH",20,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":148,"e":[["mem.read","cpu","memory",20,4],["mem.data","memory","cpu",20,4]],"c":[["WAIT_FETCH",20,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":149,"e":[],"c":[["DECODE",20,"JNZ 0x008","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":150,"e":[],"c":[["EXECUTE",20,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":151,"e":[["mem.write","cpu","memory",1010,0],["mem.read","display-1","memory",1010,1],["mem.ack","memory","cpu",1010],["mem.data","memory","display-1",1010,0]],"c":[["WAIT_DATA",20,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":1,"b":"RELEASED","n":1},{"t":152,"e":[],"c":[["FETCH",24,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":153,"e":[["mem.read","cpu","memory",24,4],["mem.data","memory","cpu",24,4]],"c":[["WAIT_FETCH",24,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":154,"e":[],"c":[["DECODE",24,"STORE R0, 0x3F2","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":155,"e":[],"c":[["EXECUTE",24,"HALT","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":156,"e":[],"c":[["HALTED",24,"HALT","countdown",0],["IDLE",0,null,null,0]],"p":[["countdown","RUNNING"],["blink","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":157,"e":[],"c":[["IDLE",0,null,null,0],["IDLE",0,null,null,0]],"p":[["blink","DONE"],["countdown","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":158,"e":[],"c":[["IDLE",0,null,null,0],["IDLE",0,null,null,0]],"p":[["blink","DONE"],["countdown","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":159,"e":[],"c":[["IDLE",0,null,null,0],["IDLE",0,null,null,0]],"p":[["blink","DONE"],["countdown","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1},{"t":160,"e":[],"c":[["IDLE",0,null,null,0],["IDLE",0,null,null,0]],"p":[["blink","DONE"],["countdown","DONE"]],"q":0,"led":0,"d":0,"b":"RELEASED","n":1}]} /* @machine-trace-end */;

// Praise's sketches, shrunk (from design/assets/sketches).
const SKETCHES = /* @sketches-begin */ {"cpu": "data:image/webp;base64,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", "memory": "data:image/webp;base64,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", "button": "data:image/webp;base64,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", "led": "data:image/webp;base64,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", "clock": "data:image/webp;base64,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"} /* @sketches-end */;

/**
 * What a core is doing, in plain words.
 * @param {string} phase
 */
export function corePhase(phase) {
  const words = /** @type {Record<string, string>} */ ({
    FETCH: "about to ask Memory for its next instruction",
    WAIT_FETCH: "waiting for Memory to send the instruction",
    DECODE: "working out what the instruction means",
    EXECUTE: "carrying out the instruction",
    WAIT_DATA: "waiting for Memory to answer",
    HALTED: "stopped: its program has finished",
    IDLE: "has nothing to run",
    FAULT: "stopped by an error",
  });
  return words[phase] ?? phase.toLowerCase();
}

/**
 * The plain-language captions for one tick of the machine replay.
 * A tick: { t, e: [type, from, to, address?, value?][], c: [phase, pc, instruction, process, inHandler][], p: [name, state][], led, d, b, n }
 * @param {TraceTick} tick
 * @param {TraceTick | null} prev  the tick before (or null)
 * @returns {string[]}
 */
export function describeTick(tick, prev) {
  const hex = (/** @type {number} */ n) => `0x${n.toString(16).toUpperCase().padStart(3, "0")}`;
  const cores = tick.c ?? [];
  const coreName = (/** @type {number} */ i) => (i < 0 ? "The CPU" : `Core ${i + 1}${cores[i]?.[3] ? ` (running ${cores[i][3]})` : ""}`);
  const byPc = (/** @type {number} */ a) => cores.findIndex((c) => c[1] === a);
  const byInstruction = (/** @type {number} */ a) => cores.findIndex((c) => typeof c[2] === "string" && c[2].includes(hex(a)));
  const place = (/** @type {number} */ a) =>
    a === 0x3f1 ? "the LED's byte" : a === 0x3f2 ? "the display's byte" : a === 0x3e0 ? "the button's press counter" : a >= 0x200 && a < 0x3e0 ? "the button's handler" : "the program";
  /** @type {string[]} */
  const out = [];
  // Every message but the button's "input" carries an address; reads and writes a value too.
  for (const [type, from, to, address = 0, value = 0] of tick.e ?? []) {
    if (type === "input") out.push("You pressed the button. The button remembers the press and acts on it at the next tick.");
    else if (type === "irq")
      out.push("The button sends an interrupt to the CPU: a signal that means “something happened, deal with me”. The CPU will handle it at the next tick.");
    else if (type === "mem.read" && from === "cpu" && value === 4) {
      const inHandler = address >= 0x200 && address < 0x3e0;
      const where = !inHandler
        ? `the 4 bytes at address ${hex(address)}`
        : address % 0x20 === 0
          ? `the first instruction of the button's handler (address ${hex(address)})`
          : `the next instruction of the button's handler (address ${hex(address)})`;
      out.push(`${coreName(byPc(address))} asks Memory for its next instruction: ${where}. Memory sends it back straight away.`);
    } else if (type === "mem.read" && from === "cpu") out.push(`${coreName(byInstruction(address))} asks Memory for a number it needs: ${place(address)} at ${hex(address)}.`);
    else if (type === "mem.write" && from === "cpu") {
      const who = coreName(byInstruction(address));
      if (address === 0x3f1) out.push(`${who} writes ${value} into the LED's byte in Memory (${hex(address)}). ${value >= 128 ? "128 or more means “on”." : "Under 128 means “off”."}`);
      else if (address === 0x3f2) out.push(`${who} writes ${value} into the display's byte in Memory (${hex(address)}): the number to show.`);
      else out.push(`${who} writes ${value} into ${place(address)} (${hex(address)}).`);
    } else if (type === "mem.data" && to === "led-1")
      out.push(`The LED reads its byte from Memory (it checks every tick): ${value}. It turns ${value >= 128 ? "on" : "off"} at the next tick.`);
    else if (type === "mem.data" && to === "display-1") out.push(`The display reads its byte from Memory (it checks every tick): ${value}. It shows it from the next tick.`);
  }
  // What the devices show changes the tick after they read their byte.
  if (prev && tick.d !== prev.d) out.push(`The display now shows ${tick.d}.`);
  if (prev && tick.led !== prev.led) out.push(`The LED is now ${tick.led ? "on" : "off"}.`);
  cores.forEach((c, i) => {
    const before = prev?.c?.[i];
    if (c[4] && !before?.[4]) out.push(`Core ${i + 1} puts ${c[3] ?? "its program"} aside and runs the button's handler: a short program that runs when the button interrupts.`);
    if (!c[4] && before?.[4]) out.push(`Core ${i + 1} has finished the handler and goes back to ${c[3] ?? "its program"}, where it left off.`);
  });
  for (const [name, state] of tick.p ?? []) {
    const was = (prev?.p ?? []).find((p) => p[0] === name)?.[1];
    if (state === "DONE" && was !== "DONE") out.push(`${name} has finished: its last instruction was HALT (stop).`);
  }
  if (out.length === 0) {
    const busy = cores.filter((c) => c[0] !== "HALTED" && c[0] !== "IDLE");
    out.push(
      busy.length
        ? `Nothing on the bus this tick. Inside the CPU: ${busy.map((c) => `Core ${cores.indexOf(c) + 1} is ${corePhase(c[0])}`).join("; ")}.`
        : "Nothing on the bus: both programs have finished.",
    );
  }
  return out;
}

/**
 * The machine view in the page: parts around a bus, messages moving along it, a caption per tick,
 * and play / pause / step. It plays a recorded trace; later the same view can follow a live bus.
 * @param {MachineTrace | null} trace
 * @param {Record<string, string>} sketches
 */
function machinePlayer(trace, sketches) {
  const ticks = trace?.ticks ?? [];
  let i = 0;
  let playing = false;
  let speed = 1;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {HTMLElement | null} */
  let root = null;
  const TICK_MS = 1400;
  const esc = (/** @type {unknown} */ s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const hex = (/** @type {number} */ n) => `0x${n.toString(16).toUpperCase().padStart(3, "0")}`;
  const BUS_Y = 203;
  /** Where each part meets the bus: [x, the y of the part's edge]. */
  const stubs = /** @type {Record<string, [number, number]>} */ ({ cpu: [240, 154], memory: [605, 154], "button-1": [190, 258], "led-1": [410, 258], "display-1": [640, 258], you: [190, 400] });
  const colors = /** @type {Record<string, string>} */ ({ "mem.read": "#5fc79a", "mem.data": "#1b7650", "mem.write": "#ffcb12", "mem.ack": "#d3dbdc", irq: "#f4061e", input: "#f4061e" });
  const labels = /** @type {Record<string, string>} */ ({ "mem.read": "read", "mem.data": "data", "mem.write": "write", "mem.ack": "ok", irq: "interrupt", input: "press" });

  function part(/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ fill, /** @type {string} */ title, /** @type {string} */ sketch, /** @type {string} */ body) {
    const [sx] = stubs[id];
    const edge = y < BUS_Y ? y + h : y;
    return `<line x1="${sx}" y1="${edge}" x2="${sx}" y2="${BUS_Y}" stroke="#16201b" stroke-width="3"/>
      <rect x="${x + 5}" y="${y + 5}" width="${w}" height="${h}" rx="10" fill="${fill}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#16201b" stroke-width="2.5" data-part="${id}"/>
      ${sketch ? `<image href="${sketch}" x="${x + 8}" y="${y + 8}" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>` : ""}
      <text x="${x + (sketch ? 62 : 14)}" y="${y + 28}" font-family="Bricolage Grotesque, Inter, sans-serif" font-weight="800" font-size="17">${title}</text>
      ${body}`;
  }

  function stage() {
    return `<svg viewBox="0 0 760 410" class="machine-svg" role="img" aria-label="The CPU, Memory, a button, an LED and a display, all joined by the bus">
      <g font-family="Inter, sans-serif" font-size="12" fill="#16201b">
        <rect x="60" y="${BUS_Y - 9}" width="690" height="18" rx="9" fill="#173627"/>
        <text x="405" y="${BUS_Y + 4}" text-anchor="middle" fill="#d6ebe0" font-weight="700" font-size="11" letter-spacing="1">THE BUS · every message travels along here</text>
        <image href="${sketches.clock}" x="0" y="${BUS_Y - 44}" width="54" height="54"/>
        <text x="27" y="${BUS_Y + 28}" text-anchor="middle" font-weight="700" data-m="tick">tick 0</text>
        ${part("cpu", 100, 16, 345, 138, "#5fc79a", "CPU", sketches.cpu, `<text x="162" y="64" font-size="11.5" fill="#5b6660">runs programs: two cores, two at a time</text>
          <g data-m="cores"></g>`)}
        ${part("memory", 470, 16, 270, 138, "#d3dbdc", "Memory", sketches.memory, `<text x="532" y="64" font-size="11.5" fill="#5b6660">numbered bytes: programs, data</text>
          <text x="484" y="94" font-family="JetBrains Mono, monospace" font-size="12.5" data-m="lastread">last asked for: –</text>
          <text x="484" y="118" font-family="JetBrains Mono, monospace" font-size="12.5" data-m="lastwrite">last written: –</text>`)}
        ${part("button-1", 100, 258, 180, 126, "#f4061e", "Button", sketches.button, `<text x="162" y="304" font-size="12" data-m="presses">pressed 0 times</text><text x="114" y="340" font-size="11.5" fill="#5b6660">sends an interrupt</text><text x="114" y="356" font-size="11.5" fill="#5b6660">when pressed</text>`)}
        ${part("led-1", 320, 258, 180, 126, "#ffcb12", "LED", sketches.led, `<circle cx="455" cy="336" r="22" fill="#e9eceb" stroke="#16201b" stroke-width="2" data-m="ledlamp"/><text x="382" y="304" font-size="12" data-m="ledtext">off</text><text x="334" y="340" font-size="11.5" fill="#5b6660">on when its</text><text x="334" y="356" font-size="11.5" fill="#5b6660">byte ≥ 128</text>`)}
        ${part("display-1", 540, 258, 200, 126, "#585654", "Display", "", `<rect x="664" y="270" width="64" height="100" rx="8" fill="#173627"/><text x="696" y="350" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="72" font-weight="700" fill="#f4061e" data-m="digit">0</text>
          <text x="554" y="304" font-size="11.5" fill="#5b6660">shows the number</text><text x="554" y="320" font-size="11.5" fill="#5b6660">in its byte</text>`)}
        <g data-m="dots"></g>
      </g></svg>`;
  }

  function paint(/** @type {boolean} */ animate) {
    if (!root || !ticks.length) return;
    const tick = ticks[i];
    const prev = i > 0 ? ticks[i - 1] : null;
    const q = (/** @type {string} */ k) => /** @type {SVGElement | HTMLElement} */ (root?.querySelector(`[data-m="${k}"]`));
    q("tick").textContent = `tick ${tick.t}`;
    q("cores").innerHTML = (tick.c ?? [])
      .map((c, k) => {
        const y = 92 + k * 32;
        return `<text x="112" y="${y}" font-weight="700" font-size="12">Core ${k + 1}${c[3] ? ` · ${esc(c[3])}` : ""}${c[4] ? " · handler" : ""}</text>
          ${c[2] ? `<text x="435" y="${y}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11.5">${esc(c[2])}</text>` : ""}
          <text x="112" y="${y + 15}" font-size="11.5" fill="#5b6660">${esc(corePhase(c[0]))}</text>`;
      })
      .join("");
    // Memory's last read/write, from the messages so far.
    let read = null;
    let write = null;
    for (let k = 0; k <= i; k++)
      for (const e of ticks[k].e ?? []) {
        if (e[0] === "mem.read" && e[1] === "cpu") read = e;
        if (e[0] === "mem.write") write = e;
      }
    q("lastread").textContent = read ? `last asked for: ${hex(read[3] ?? 0)}` : "last asked for: –";
    q("lastwrite").textContent = write ? `last written: ${hex(write[3] ?? 0)} ← ${write[4] ?? 0}` : "last written: –";
    const pressed = (tick.e ?? []).some((e) => e[0] === "input");
    const presses = ticks.slice(0, i + 1).reduce((/** @type {number} */ n, /** @type {TraceTick} */ t) => n + (t.e ?? []).filter((e) => e[0] === "input").length, 0);
    q("presses").textContent = pressed ? "pressed!" : `pressed ${presses} time${presses === 1 ? "" : "s"}`;
    q("ledlamp").setAttribute("fill", tick.led ? "#f4061e" : "#e9eceb");
    q("ledlamp").setAttribute("filter", tick.led ? "drop-shadow(0 0 8px #f4061e)" : "");
    q("ledtext").textContent = tick.led ? "on" : "off";
    q("digit").textContent = String(tick.d ?? 0);
    const captions = /** @type {HTMLElement} */ (root.querySelector("[data-captions]"));
    captions.innerHTML = describeTick(tick, prev).map((c) => `<li>${esc(c)}</li>`).join("");
    /** @type {HTMLElement} */ (root.querySelector("[data-pos]")).textContent = `Tick ${tick.t} of ${ticks[ticks.length - 1].t}`;
    /** @type {HTMLInputElement} */ (root.querySelector("[data-scrub]")).value = String(i);
    /** @type {HTMLElement} */ (root.querySelector("[data-play]")).innerHTML = playing ? "Pause <kbd>↵</kbd>" : "Play <kbd>↵</kbd>";
    const dots = q("dots");
    dots.innerHTML = "";
    if (!animate) return;
    const events = (tick.e ?? []).filter((e) => stubs[e[1]] && stubs[e[2]]);
    const each = (TICK_MS / speed) * 0.8;
    events.forEach((e, k) => {
      const [x1, y1] = stubs[e[1]];
      const [x2, y2] = stubs[e[2]];
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.innerHTML = `<circle r="9" fill="${colors[e[0]] ?? "#fff"}" stroke="#16201b" stroke-width="2"/><text y="-13" text-anchor="middle" font-size="11" font-weight="700">${labels[e[0]] ?? e[0]}</text>`;
      g.style.opacity = "0";
      dots.append(g);
      const at = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ o = 1) => ({ transform: `translate(${x}px, ${y}px)`, opacity: o });
      g.animate([at(x1, y1, 0), at(x1, y1), at(x1, BUS_Y), at(x2, BUS_Y), at(x2, y2), at(x2, y2, 0)], {
        duration: each,
        delay: (k * each * 0.35) / Math.max(1, events.length - 1 || 1),
        fill: "both",
        easing: "ease-in-out",
      });
    });
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!playing) return;
    timer = setTimeout(() => {
      if (i >= ticks.length - 1) {
        playing = false;
        return paint(false);
      }
      i++;
      paint(true);
      schedule();
    }, TICK_MS / speed);
  }

  return {
    html() {
      if (!ticks.length) return `<p class="note">The recording isn't in this copy of the studio.</p>`;
      return `<div class="machine">
        <div class="stage">${stage()}</div>
        <div class="machine-side">
          <div class="row controls">
            <button class="btn primary" data-do="m-play" data-play>Play <kbd>↵</kbd></button>
            <button class="btn" data-do="m-back" title="Back one tick (←)">←</button>
            <button class="btn" data-do="m-step" title="Forward one tick (→)">Step →</button>
            <button class="btn ghost" data-do="m-restart">Start over</button>
            <label class="speed">Speed <select data-speed><option value="0.5">slow</option><option value="1" selected>normal</option><option value="2">fast</option><option value="4">very fast</option></select></label>
          </div>
          <input type="range" min="0" max="${ticks.length - 1}" value="0" data-scrub aria-label="Tick">
          <p class="pos" data-pos></p>
          <ul class="captions" data-captions aria-live="polite"></ul>
        </div>
      </div>`;
    },
    /** @param {HTMLElement} el */
    mount(el) {
      root = el;
      root.querySelector("[data-scrub]")?.addEventListener("input", (e) => {
        i = Number(/** @type {HTMLInputElement} */ (e.target).value);
        paint(false);
      });
      root.querySelector("[data-speed]")?.addEventListener("change", (e) => {
        speed = Number(/** @type {HTMLSelectElement} */ (e.target).value);
      });
      paint(false);
    },
    toggle() {
      playing = !playing;
      if (playing && i >= ticks.length - 1) i = 0;
      paint(false);
      if (playing) {
        paint(true);
        schedule();
      }
    },
    step(/** @type {number} */ by) {
      playing = false;
      schedule();
      i = Math.min(ticks.length - 1, Math.max(0, i + by));
      paint(by > 0);
    },
    restart() {
      i = 0;
      paint(false);
    },
    stop() {
      playing = false;
      schedule();
      root = null;
    },
  };
}

const STUDIO_CSS = `
:root {
  --red: #f4061e; --green: #173627; --green-2: #20483a; --green-3: #2b5a48; --mint: #5fc79a; --yellow: #ffcb12;
  --grey: #d3dbdc; --dgrey: #585654; --ink: #16201b; --muted: #5b6660; --line: #d9e0dd; --panel: #fff; --well: #f1f4f3;
  --mint-ink: #1b7650; --red-ink: #c4051a; --chrome-ink: #d6ebe0; --chrome-muted: #8fb3a1;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--well); color: var(--ink); font: 15px/1.5 "Inter", "Segoe UI", system-ui, sans-serif; display: grid; grid-template-rows: 48px minmax(0, 1fr); height: 100vh; overflow: hidden; }
h1, h2, h3 { margin: 0; font-family: "Bricolage Grotesque", "Inter", system-ui, sans-serif; line-height: 1.15; }
p { margin: 0; }
code, .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 0.92em; }
a { color: var(--mint-ink); }
.muted { color: var(--muted); }
kbd { font: 600 11px/1 "JetBrains Mono", monospace; border: 1px solid currentColor; border-bottom-width: 2px; border-radius: 4px; padding: 2px 5px; opacity: .85; }

.titlebar { display: flex; align-items: center; gap: 16px; padding: 0 16px; background: var(--green); color: var(--chrome-ink); }
.brand { display: flex; align-items: center; gap: 9px; font: 700 15px/1 "Bricolage Grotesque", sans-serif; color: #fff; }
.brand svg { width: 26px; height: 26px; }
.crumbs { color: var(--chrome-muted); font-size: 13.5px; }
.crumbs b { color: #fff; font-weight: 600; }
.titlebar .right { margin-left: auto; display: flex; gap: 12px; align-items: center; font-size: 13px; }
.titlebar .count { font-weight: 700; color: #fff; }
.tag { display: inline-flex; padding: 3px 9px; border-radius: 999px; font: 600 12px/1.4 "Inter", sans-serif; background: var(--well); color: var(--muted); text-transform: none; letter-spacing: 0; }
.tag.ok { background: #dcf3e8; color: var(--mint-ink); } .tag.bad { background: #ffe1e4; color: var(--red-ink); } .tag.now { background: #fff1c2; color: #6b5200; }
.linkbtn { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--mint-ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.accountbox { border-top: 1px dashed var(--line); padding-top: 14px; }
.accounts { display: grid; gap: 10px; }
.account { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.account .who { font: 600 15px/1.3 "JetBrains Mono", monospace; overflow-wrap: anywhere; }
.account.now { background: #e3f6ec; border-color: var(--mint); }
.account .btn { margin-left: auto; }
.pill { font: 600 11.5px/1 "Inter", sans-serif; padding: 5px 8px; border-radius: 999px; background: var(--yellow); color: var(--ink); }

.work { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 14px; padding: 14px; min-height: 0; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel > header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--line); font: 600 11.5px/1 "Inter", sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.panel > header .right { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 500; }
.panel > .body { overflow: auto; min-height: 0; flex: 1; }

.prog { display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px; }
.prog .track { flex: 1; height: 6px; background: var(--well); border-radius: 3px; overflow: hidden; }
.prog .track i { display: block; height: 100%; background: var(--mint); transition: width .4s; }
.prog b { font: 700 13px/1 "Inter", sans-serif; }
.srow { display: grid; grid-template-columns: 20px 20px minmax(0, 1fr); gap: 8px; align-items: start; padding: 7px 16px; border-left: 3px solid transparent; cursor: pointer; width: 100%; background: none; border-top: 0; border-right: 0; border-bottom: 0; text-align: left; font: inherit; color: inherit; }
.srow:hover { background: #f7f9f8; }
.sgroup { display: flex; justify-content: space-between; gap: 8px; padding: 12px 16px 4px; font: 700 11px/1.3 "JetBrains Mono", monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.sgroup em { font-style: normal; font-weight: 600; letter-spacing: 0; text-transform: none; white-space: nowrap; }
.sgroup.get em, .sgroup.inwork em { color: var(--ink); }
.sgroup.future, .sgroup.later { opacity: .55; padding-bottom: 8px; }
button.sgroup { width: 100%; background: none; border: 0; border-left: 3px solid transparent; text-align: left; cursor: pointer; }
button.sgroup:hover { background: #f7f9f8; color: var(--ink); }
button.sgroup.viewing { outline: 2px solid var(--mint); outline-offset: -2px; }
.detail .inner.week { max-width: none; min-height: 100%; display: flex; flex-direction: column; gap: 10px; }
.weekhead .q { margin: 0; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.tab { font: 600 13.5px/1 "Inter", sans-serif; padding: 9px 14px; border: 1px solid transparent; border-bottom: 0; border-radius: 8px 8px 0 0; background: none; cursor: pointer; color: var(--muted); }
.tab.on { color: var(--ink); background: var(--panel); border-color: var(--line); margin-bottom: -1px; }
.tabbody { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.framebar { display: flex; }
.bchips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 3px 10px; font: 600 12px/1.3 "JetBrains Mono", monospace; color: var(--ink); cursor: pointer; }
.chip:hover { border-color: var(--mint); }
.bdoneline { margin: 0 0 4px; font-size: 13.5px; color: var(--green); }
.wswitch { margin-bottom: 8px; }
.wpills { display: flex; flex-wrap: wrap; gap: 6px; }
.wpill { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 4px 11px; font: 600 12.5px/1.2 "Inter", sans-serif; color: var(--ink); cursor: pointer; }
.wpill.today { border-color: var(--mint); }
.wpill.on { background: var(--green); color: #fff; border-color: var(--green); }
.wpill:disabled { opacity: .4; cursor: default; }
.wselect { display: none; font: inherit; padding: 4px 6px; max-width: 100%; }
@media (max-width: 700px) { .wpills { display: none; } .wselect { display: block; } }
/* The Files tab: a read-only viewer. A tree, and the file or its uncommitted changes beside it. */
.cpane.fvpane { padding: 8px; display: flex; flex-direction: column; }
.chatui:not([data-panel="files"]) .cpane.fvpane { display: none; }
.fvhost { flex: 1; min-height: 0; display: flex; }
.fv { flex: 1; display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; min-width: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel); }
.fv.narrow { grid-template-columns: 160px minmax(0, 1fr); }
.ftree { border-right: 1px solid var(--line); background: var(--well); display: flex; flex-direction: column; min-height: 0; }
.ftree .fth { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--line); }
.ftree .fth button { flex: 1; border: 1px solid var(--line); background: var(--panel); border-radius: 7px; font: 600 12px/1.2 "Inter", sans-serif; padding: 4px 6px; color: var(--muted); cursor: pointer; white-space: nowrap; }
.ftree .fth button.on { background: var(--green); border-color: var(--green); color: #fff; }
.ftree ul { list-style: none; margin: 0; padding: 6px 0; overflow: auto; flex: 1; min-height: 0; font: 12px/1.25 "JetBrains Mono", monospace; }
.ftree li { padding: 0 8px; }
.ftree .fvrow .nm { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ftree .fvrow { display: flex; gap: 5px; align-items: center; width: 100%; padding: 3.5px 0; border: 0; background: none; font: inherit; color: var(--ink); text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; }
.ftree li.dir .fvrow { color: var(--muted); }
.ftree li.on { background: #dcf3e8; }
.ftree li.on .fvrow { color: var(--mint-ink); font-weight: 700; }
.ftree li.gone .fvrow { text-decoration: line-through; color: var(--muted); }
.ftree .cnt { margin-left: auto; font-size: 10.5px; }
.ftree .mk { width: 7px; height: 7px; border-radius: 50%; background: var(--yellow); flex: none; margin-left: auto; }
.ftree .mk.new { background: var(--mint); }
.ftree .cnt + .mk { margin-left: 4px; }
.plus { color: #1b7650; font-weight: 700; } .minus { color: #c4051a; font-weight: 700; }
.fvempty { padding: 14px; }
.fview { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; }
.fvh { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--line); font-size: 12.5px; flex-wrap: wrap; }
.fvh .path { font: 600 12.5px/1.3 "JetBrains Mono", monospace; overflow-wrap: anywhere; }
.fvh .ro { color: var(--muted); }
.fvh .sp { margin-left: auto; }
.mseg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.mseg button { border: 0; background: var(--panel); padding: 3px 9px; font: 600 12px/1.3 "Inter", sans-serif; color: var(--muted); cursor: pointer; }
.mseg button.on { background: var(--green); color: #fff; }
.btn.sm { padding: 4px 10px; font-size: 12.5px; }
.fvb { overflow: auto; min-height: 0; }
.src { margin: 0; padding: 6px 0; font: 12.5px/1.55 "JetBrains Mono", ui-monospace, monospace; white-space: pre; tab-size: 2; min-width: max-content; }
.src > span { display: block; padding-right: 12px; }
.src .ln { display: inline-block; width: 3.4em; padding-right: 10px; text-align: right; color: #9aa59f; user-select: none; }
.src .sg { display: inline-block; width: 1.4em; color: var(--muted); user-select: none; }
.src .rg { background: #fff8dc; box-shadow: inset 3px 0 0 var(--yellow); }
.src .add { background: #e3f6ec; } .src .add .sg { color: #1b7650; }
.src .del { background: #ffe9ec; } .src .del .sg { color: #c4051a; }
.src .hunk { background: var(--well); color: var(--muted); }
.hl-keyword { color: #8a3ffc; font-weight: 600; } .hl-string, .hl-code { color: #1b7650; } .hl-number { color: #c4051a; } .hl-comment { color: #7a857f; font-style: italic; }
.hl-type, .hl-key, .hl-register { color: #0b62c9; } .hl-label, .hl-heading { color: #0b62c9; font-weight: 700; } .hl-strong, .hl-bullet, .hl-fence { color: #b25e00; font-weight: 600; } .hl-link { color: var(--mint-ink); }
.imgview { padding: 14px; display: grid; place-items: center; }
.imgview img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.mdview { padding: 12px 16px; }
.fvfoot { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--line); background: #e3f6ec; font-size: 12.5px; color: var(--mint-ink); white-space: nowrap; }
.fvfoot .sub { color: inherit; opacity: .8; }
.fvfoot .btn { margin-left: auto; }
@media (max-width: 900px) { .chatui[data-panel="files"] .cpanel { max-height: none; } .fv, .fv.narrow { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 200px) minmax(360px, 1fr); } .ftree { border-right: 0; border-bottom: 1px solid var(--line); } .cpane.fvpane { min-height: 60vh; } }
.cpane[data-pane="lesson"] { display: flex; flex-direction: column; gap: 6px; }
.chatui:not([data-panel="lesson"]) .cpane[data-pane="lesson"] { display: none; }
.chatui[data-panel="lesson"] .cpane[data-pane="viz"] { display: none; }
.chatui[data-panel="lesson"] .ctab[data-cpane-tab="lesson"] { color: var(--ink); border-bottom-color: var(--green); }
.ctab.fulllesson { margin-left: auto; text-decoration: none; }
.agenttab { display: grid; gap: 12px; padding-bottom: 24px; min-width: 0; }
.chatui { display: grid; gap: 10px; }
/* The Build view takes the whole width: the course list hides while it's open. */
.work:has(.chatui) { grid-template-columns: minmax(0, 1fr) !important; }
.work:has(.chatui) .steps { display: none; }
.ctop { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: var(--green); color: #fff; border-radius: 10px; padding: 10px 14px; }
.ctop .csub { color: #cfe8dc; font-size: 13px; }
.cprog { display: grid; gap: 4px; min-width: 200px; font-size: 12.5px; text-align: right; }
.ctop .bbar { background: rgba(255,255,255,.2); }
.cgrid { --chat: 40%; display: grid; grid-template-columns: minmax(280px, var(--chat)) 10px minmax(0, 1fr); align-items: stretch; min-height: 0; }
/* The Build view fills the window: the rows above it take their own height, the chat and panel the rest
   (so the step card and Send stay on screen); only the chat and the panel scroll. */
.detail .body:has(.chatui) { padding: 14px 20px; overflow: hidden; }
.detail .inner.week:has(.chatui) { height: 100%; min-height: 0; gap: 8px; }
.inner.week:has(.chatui) .wswitch { margin-bottom: 0; }
.inner.week:has(.chatui) .weekhead .eyebrow { margin-bottom: 4px; }
.inner.week:has(.chatui) .weekhead .q { font-size: 22px; }
.detail .inner.week:has(.chatui) > .banner { display: block; flex-wrap: nowrap; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 6px 12px; font-size: 13.5px; }
.tabbody:has(> .chatui) { overflow: hidden; }
.chatui { flex: 1; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
.chatui .cpane iframe.doc, .chatui .cpane iframe.board { min-height: 0; height: 100%; }
.ccol { min-width: 0; overflow-y: auto; padding-right: 6px; display: flex; flex-direction: column; }
.ccol .agenttab { flex: 1; align-content: start; padding-bottom: 0; }
.ccol .aglog { max-height: none; overflow: visible; }
.cdiv { cursor: col-resize; display: grid; place-items: center; }
.cdiv::after { content: ""; width: 3px; height: 32px; border-radius: 3px; background: var(--line); }
.cpanel { min-width: 0; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); overflow: hidden; }
.ctabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); padding: 6px 8px 0; }
.ctab { border: 0; background: none; padding: 8px 10px; font: 600 13px/1 "Inter", sans-serif; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
.cpane { flex: 1; overflow: auto; padding: 10px 12px; min-height: 0; }
.cpane iframe.doc { min-height: 100%; }
.chatui:not([data-panel="notes"]) .cpane[data-pane="notes"], .chatui:not([data-panel="steps"]) .cpane[data-pane="steps"], .chatui:not([data-panel="files"]) .cpane[data-pane="files"], .chatui[data-panel="notes"] .cpane[data-pane="viz"], .chatui[data-panel="steps"] .cpane[data-pane="viz"], .chatui[data-panel="files"] .cpane[data-pane="viz"] { display: none; }
.chatui:not([data-panel]) .cpane:not([data-pane="viz"]) { display: none; }
.chatui[data-panel="viz"] .ctab[data-cpane-tab="viz"], .chatui:not([data-panel]) .ctab[data-cpane-tab="viz"], .chatui[data-panel="notes"] .ctab[data-cpane-tab="notes"], .chatui[data-panel="steps"] .ctab[data-cpane-tab="steps"], .chatui[data-panel="files"] .ctab[data-cpane-tab="files"] { color: var(--ink); border-bottom-color: var(--green); }
.crow { display: flex; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.crow.locked { opacity: .5; }
.crow.now { background: #e3f2ea; border-radius: 6px; }
.cpane h4 { margin: 10px 0 4px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.ccol .ag.you { display: flex; flex-direction: column; align-items: flex-end; }
.ccol .ag.you .who, .ccol .ag.bot .who { display: none; }
.ccol .ag.you .said { background: #e3f2ea; border-radius: 18px 18px 4px 18px; padding: 8px 14px; max-width: 85%; }
.ccol .ag.bot .said { padding: 2px 0; }
/* The chat column: the conversation and the step card scroll; the message box has its own row below. */
.ccol { overflow: hidden; }
.ccol .agenttab { display: flex; flex-direction: column; gap: 0; min-height: 0; }
.ccol .agscroll { flex: 1; min-height: 0; overflow-y: auto; display: grid; gap: 12px; align-content: start; padding-right: 4px; }
.ccol .agcomposer.pinned { flex: none; background: var(--panel); border: 2px solid var(--green); border-radius: 16px; padding: 8px 10px; margin-top: 10px; }
.ccol .agcomposer.pinned textarea { border: 0; padding: 4px; }
.cdisclaim { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); text-align: center; }
.build.guide .bcard { border: 1px solid var(--line); border-left: 3px solid var(--mint); box-shadow: none; border-radius: 10px; }
@media (max-width: 900px) {
  .cgrid { grid-template-columns: minmax(0, 1fr); height: auto; }
  .detail .body:has(.chatui), .tabbody:has(> .chatui) { overflow: visible; }
  .detail .inner.week:has(.chatui) { height: auto; }
  .chatui { grid-template-rows: none; }
  .chatui .cpane iframe.doc, .chatui .cpane iframe.board { min-height: 320px; height: 45vh; }
  .cdiv { display: none; }
  .cpanel { order: -1; max-height: 50vh; }
  .ccol, .ccol .agscroll { overflow: visible; }
  .ctop { flex-direction: column; align-items: stretch; }
  .cprog { text-align: left; }
}
.buildgrid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 1fr); gap: 18px; align-items: start; }
.bside { display: grid; gap: 12px; position: sticky; top: 0; min-width: 0; }
.bnotes { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; background: var(--panel); max-height: 45vh; overflow: auto; }
.bnotes summary { font-weight: 700; cursor: pointer; }
.bnotes table { border-collapse: collapse; font-size: 13px; width: 100%; }
.bnotes th, .bnotes td { border: 1px solid var(--line); padding: 3px 6px; text-align: left; }
.bnotes pre { white-space: pre-wrap; font-size: 12.5px; }
.bboard { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; background: var(--panel); min-width: 0; }
.bboard h3 { margin: 0 0 6px; font-size: 14px; }
.bboard iframe.doc { min-height: 420px; }
@media (max-width: 1100px) { .buildgrid { grid-template-columns: minmax(0, 1fr); } .bside { position: static; } }
.build { display: grid; gap: 12px; }
.bprogress { font: 600 12px/1.2 "JetBrains Mono", monospace; color: var(--muted); }
.bsteps { display: flex; flex-wrap: wrap; gap: 6px; }
.bstep { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 4px 10px; font-size: 12.5px; display: inline-flex; gap: 6px; align-items: center; }
.bstep.locked { opacity: .5; }
.bhead { display: grid; gap: 8px; }
.bhead h1 { margin: 0; }
.bcomps { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
.bcomp { padding: 2px 8px; border-radius: 6px; background: var(--well); color: var(--muted); }
.bcomp.now { background: var(--green); color: #fff; }
.bcomp.done { color: var(--green); }
.bbar { height: 8px; border-radius: 999px; background: var(--well); overflow: hidden; }
.bbar i { display: block; height: 100%; background: var(--mint); }
.bfinish h2 { color: var(--green); }
.linkish { background: none; border: 0; padding: 0; color: var(--link, #1f7a55); text-decoration: underline; cursor: pointer; justify-self: start; font: inherit; font-size: 13.5px; }
.bstep .n { font: 700 11px/1 "JetBrains Mono", monospace; color: var(--muted); }
.bstep.done { background: var(--well); color: var(--muted); }
.bstep.done .n { color: var(--green); }
.bstep.now { border-color: var(--ink); box-shadow: 2px 2px 0 var(--ink); font-weight: 600; }

.bcard { border: 2px solid var(--ink); border-radius: 12px; padding: 16px 18px; display: grid; gap: 10px; background: var(--panel); box-shadow: 4px 4px 0 var(--ink); }
.bcard h2 { margin: 0; font-size: 20px; }
.bcard .stuck.bad { margin: 0; padding: 8px 12px; border-left: 3px solid var(--red); background: var(--well); border-radius: 6px; }
.bcard .eyebrow { margin: 0; }
.bprompt pre { white-space: pre-wrap; font: 12.5px/1.5 "JetBrains Mono", monospace; background: var(--well); border-radius: 8px; padding: 10px; }
.agbar { display: flex; justify-content: flex-end; font-size: 12.5px; min-height: 16px; }
.agperms { margin: 0; padding: 8px 12px; background: var(--well); border-radius: 8px; font-size: 13px; line-height: 1.45; color: var(--muted); }
.aglog { display: grid; gap: 10px; max-height: calc(100vh - 430px); min-height: 120px; overflow-y: auto; align-content: start; }
.ag { min-width: 0; }
.ag .who { font: 700 11px/1.2 "JetBrains Mono", monospace; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }
.ag .said { white-space: pre-wrap; line-height: 1.5; overflow-wrap: anywhere; }
.ag .said.md { white-space: normal; }
.md p { margin: 0 0 8px; }
.md ul, .md ol { margin: 0 0 8px; padding-left: 22px; display: block; }
.md h3, .md h4, .md h5, .md h6 { margin: 10px 0 6px; font-size: 15px; }
.md blockquote { margin: 0 0 8px; padding: 2px 10px; border-left: 3px solid var(--line); color: var(--muted); }
.md code { font: 13px "JetBrains Mono", ui-monospace, Menlo, monospace; background: var(--well); padding: 1px 4px; border-radius: 4px; }
.mdcode { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin: 0 0 8px; }
.mdcodebar { display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; background: var(--well); font: 600 11px "JetBrains Mono", monospace; color: var(--muted); }
.mdcopy { border: 0; background: none; cursor: pointer; font: inherit; color: var(--link, #1f7a55); }
.mdcode pre { margin: 0; padding: 8px 10px; overflow-x: auto; white-space: pre; }
.mdcode pre code { background: none; padding: 0; }
.mdtable { overflow-x: auto; margin: 0 0 8px; }
.mdtable table { border-collapse: collapse; font-size: 13.5px; }
.mdtable th, .mdtable td { border: 1px solid var(--line); padding: 3px 8px; text-align: left; }
.ag.you .said { background: var(--well); border-radius: 8px; padding: 8px 12px; }
.ag.note { font-size: 13.5px; color: var(--muted); }
.ag.note.bad { color: var(--red); font-weight: 600; }
.ag.ran { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 13.5px; }
.ag.ran summary { cursor: pointer; overflow-wrap: anywhere; }
.ag.ran .what { font-weight: 600; }
.ag.ran em, .agcard em { font-style: normal; color: var(--muted); font-size: 12.5px; }
.ag pre.log, .agcard pre.log { max-height: none; overflow: visible; white-space: pre-wrap; overflow-wrap: anywhere; }
.agcard .row { margin-top: 10px; }
.agworking { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
.agenttab [hidden] { display: none !important; }
.agcomposer { display: grid; gap: 8px; }
.agcomposer select { max-width: 100%; font: inherit; padding: 3px 6px; }
.agcomposer textarea { width: 100%; box-sizing: border-box; font: inherit; line-height: 1.45; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; resize: vertical; }
.agfix { display: grid; gap: 8px; margin-top: 8px; }
.agfix input { font: 15px/1.4 "JetBrains Mono", ui-monospace, Menlo, monospace; padding: 8px 10px; border: 2px solid var(--ink); border-radius: 8px; }
.agfix .btn { justify-self: start; }
.codetab { display: grid; gap: 22px; padding-bottom: 40px; }
.task { border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: grid; gap: 12px; background: var(--panel); }
.taskhead { display: flex; gap: 12px; align-items: flex-start; }
.taskhead h3 { margin: 0; font-size: 17px; }
.taskhead .tdesc { margin: 2px 0 0; color: var(--muted); }
.tnum { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--green); color: #fff; display: grid; place-items: center; font: 700 13px/1 "JetBrains Mono", monospace; }
.tpart { margin-left: auto; flex: none; font: 600 11px/1 "JetBrains Mono", monospace; text-transform: uppercase; letter-spacing: .05em; padding: 5px 8px; border-radius: 6px; background: var(--well); color: var(--muted); }
.tpart.class { background: var(--mint); color: var(--green); }
.lesson { margin: 0; line-height: 1.55; }
.taskgrid { display: grid; gap: 14px; }
.taskgrid.withprompt { grid-template-columns: minmax(0, 1fr) minmax(220px, 34%); }
@media (max-width: 1200px) { .taskgrid.withprompt { grid-template-columns: minmax(0, 1fr); } }
.codewrap { align-self: start; background: var(--green); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); border-radius: 10px; padding: 10px 12px 12px; min-width: 0; overflow-x: auto; }
.cfile { font: 600 12px/1.4 "JetBrains Mono", monospace; color: #9cc5b2; margin-bottom: 6px; }
.codewrap pre.ctx { margin: 0; padding: 2px 0 2px 4px; color: #d7ecdf; opacity: .78; font: 14px/1.5 "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; white-space: pre; background: none; border: 0; }
.codewrap .editor { margin: 4px 0; border: 1px solid #5fc79a; border-radius: 9px; min-width: 0; }
.codewrap .cm-editor { min-height: 90px; }
textarea.plaincode { width: 100%; box-sizing: border-box; background: #173627; color: #f2f7f4; border: 0; border-radius: 9px; padding: 10px; font: 15px/1.5 "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; tab-size: 2; resize: vertical; }
.prompt { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--well); display: grid; gap: 8px; align-content: start; min-width: 0; }
.prompt h4 { margin: 0; font-size: 14px; }
.taskgrid .aside { display: grid; gap: 12px; align-content: start; min-width: 0; }
.walk ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; font-size: 14px; line-height: 1.45; }
.walk li { padding: 4px 6px; border-radius: 6px; }
.walk li.now { background: var(--mint); color: var(--green); }
.prompt pre { margin: 0; white-space: pre-wrap; font: 12.5px/1.5 "JetBrains Mono", monospace; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; max-height: 320px; overflow: auto; }
.tresult:empty { display: none; }
.failure { margin-top: 8px; }
.failure .ftest { font-weight: 600; }
/* A lesson page or the board at the panel's full width and the window's height, like opening it on its own. */
iframe.doc { flex: 1; width: 100%; min-height: calc(100vh - 250px); border: 1px solid var(--line); border-radius: 8px; background: #fff; }
iframe.board { min-height: calc(100vh - 220px); }
pre.log { background: #0f1f18; color: var(--chrome-ink); border-radius: 8px; padding: 12px 14px; font: 12.5px/1.5 "JetBrains Mono", monospace; max-height: 50vh; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; }
.banner { padding: 10px 14px; border-radius: 8px; background: var(--soft, #f3f7f4); border: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.banner.ok { border-color: var(--mint); }
.sub { font-size: 12.5px; color: var(--muted); margin: 0; }
.srow .n { font: 600 11px/20px "JetBrains Mono", monospace; color: var(--muted); text-align: right; }
.srow .t { font-weight: 600; font-size: 13.5px; line-height: 20px; }
.srow small { display: block; font-size: 12px; color: var(--muted); }
.srow .opt { font-weight: 400; color: var(--muted); font-size: 12px; }
.srow.done .t { font-weight: 500; color: var(--muted); }
.srow.now { background: #fff8dc; border-left-color: var(--yellow); }
.srow.wait .t { color: #8a948f; font-weight: 500; }
.srow.viewing { outline: 2px solid var(--mint); outline-offset: -2px; }
.st { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font: 700 11px/1 "Inter", sans-serif; }
.st.ok { background: var(--mint); color: var(--green); } .st.ok::after { content: "✓"; }
.st.skip { background: var(--grey); color: var(--dgrey); } .st.skip::after { content: "–"; }
.st.now { background: var(--yellow); } .st.now::after { content: "›"; font-size: 15px; }
.st.bad { background: var(--red); color: #fff; } .st.bad::after { content: "!"; }
.st.wait { border: 1.5px dashed #a6b0ab; }
.st.run { border: 2px solid var(--green); border-right-color: transparent; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.detail .body { padding: 26px 30px 40px; }
.detail .inner { max-width: 780px; display: grid; gap: 20px; }
.eyebrow { font: 600 12px/1 "Inter", sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 10px; }
h1.q { font-size: 32px; }
.tech { margin-top: 8px; font-size: 14px; color: var(--muted); }
.tech code { background: var(--well); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; color: var(--ink); }
.why { font-size: 16.5px; }
.block h3 { font: 600 12px/1 "Inter", sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 10px; }

.cmd { display: flex; align-items: center; gap: 0; min-height: 54px; background: var(--green); color: #fff; border-radius: 9px; padding: 10px 10px 10px 16px; font: 17px/1.4 "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; box-shadow: 4px 4px 0 var(--ink); border: 2px solid var(--ink); cursor: text; outline: none; flex-wrap: wrap; position: relative; }
.cmd:focus-within { box-shadow: 4px 4px 0 var(--mint); }
.cmd .sink { position: absolute; opacity: 0; width: 1px; height: 1px; border: 0; padding: 0; pointer-events: none; }
.cmd .cmdtext { display: block; flex: 1; min-width: 0; word-break: break-all; }
.cmd .cmdtext .p { margin-right: 10px; }
.cmd .p { color: var(--mint); margin-right: 12px; }
.cmd .typed { white-space: pre-wrap; }
.cmd .ghost { color: #6f8f80; white-space: pre-wrap; }
.cmd .wrong { background: var(--red); color: #fff; border-radius: 3px; white-space: pre; }
.cmd .caret { display: inline-block; width: 2px; height: 1.2em; background: var(--yellow); margin: 0 -1px; animation: blink 1.1s steps(1) infinite; vertical-align: text-bottom; }
.cmd:not(:focus-within) .caret { opacity: .35; animation: none; }
@keyframes blink { 50% { opacity: 0; } }
.cmd .runbtn { float: right; margin-left: 14px; }
.cmd.doneline { color: var(--chrome-ink); background: var(--green-2); box-shadow: none; border-color: var(--green-2); min-height: 0; font-size: 14px; padding: 8px 14px; }
.cmd.doneline .ok { color: var(--mint); margin-left: auto; font-family: "Inter", sans-serif; font-size: 13px; }
.cmd.preview { background: var(--well); color: #8a948f; border: 1.5px dashed #b9c3be; box-shadow: none; cursor: default; }
.cmd.preview .p { color: #a9b2ad; }
.cmdnote { font-size: 13px; color: var(--muted); margin-top: 10px; min-height: 1.3em; }
.cmdnote.warn { color: var(--red-ink); font-weight: 600; }
.what { font-size: 14.5px; margin-top: 12px; }
.words { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 10px 0 0; font-size: 13.5px; background: var(--well); border-radius: 8px; padding: 10px 14px; }
.words dt { font-family: "JetBrains Mono", monospace; font-size: 12.5px; font-weight: 600; }
.words dd { margin: 0; color: var(--muted); }
.runs { font-size: 12.5px; color: var(--muted); margin-top: 8px; }

.btn { font: 600 14.5px/1 "Inter", sans-serif; padding: 11px 16px; border-radius: 8px; border: 2px solid var(--ink); background: var(--panel); color: var(--ink); cursor: pointer; display: inline-flex; gap: 10px; align-items: center; text-decoration: none; }
.btn:hover { background: var(--well); }
.btn.primary { background: var(--yellow); box-shadow: 3px 3px 0 var(--ink); }
.btn.primary:hover { background: #ffd84a; }
.btn.run { background: var(--mint); color: var(--green); border-color: var(--ink); padding: 9px 14px; animation: pop .25s ease-out; }
@keyframes pop { from { transform: scale(.8); opacity: 0; } }
.btn.ghost { border-color: var(--line); font-weight: 500; }
.donerow { margin-top: 20px; padding-top: 14px; border-top: 1px dashed var(--line); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

.status { display: flex; gap: 12px; align-items: flex-start; border-radius: 10px; padding: 14px 16px; font-size: 15.5px; border: 2px solid var(--ink); }
.status .icon { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; }
.status.ok { background: #e3f6ec; } .status.ok .icon { background: var(--mint); color: var(--green); }
.status.bad { background: #ffe8ea; } .status.bad .icon { background: var(--red); color: #fff; }
.status.run { background: var(--well); border-color: var(--line); }
.status.wait { background: #fff8dc; }
.status .spin { width: 20px; height: 20px; margin: 3px; border: 2.5px solid var(--green); border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; flex: none; }
.status b { display: block; }
.status .sub { font-size: 14px; color: var(--muted); margin-top: 3px; }
.elapsed { font-weight: 500; color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 13px; }
.summary { font: 13.5px/1.4 "JetBrains Mono", monospace; color: var(--muted); margin-top: 4px; word-break: break-all; }
.otp { font: 700 28px/1 "JetBrains Mono", monospace; letter-spacing: .08em; background: #fff; border: 2px solid var(--ink); border-radius: 8px; padding: 10px 14px; display: inline-block; margin: 8px 0 4px; }
.failures { margin: 8px 0 8px; padding-left: 18px; display: grid; gap: 8px; font-size: 14.5px; }
.failures .sub { margin-top: 2px; }
.ranlist { font: 13px/1.6 "JetBrains Mono", monospace; background: var(--well); border-radius: 8px; padding: 10px 14px; }
.ranlist .h { font-family: "Inter", sans-serif; font-size: 12px; color: var(--muted); }
details.out summary { cursor: pointer; font-weight: 600; font-size: 13.5px; color: var(--muted); }
details.out pre { background: #0f1f18; color: var(--chrome-ink); border-radius: 8px; padding: 12px 14px; font: 12.5px/1.5 "JetBrains Mono", monospace; max-height: 340px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 8px 0 0; }

form.fields { display: grid; gap: 14px; }
form.fields label { display: grid; gap: 5px; font-weight: 600; font-size: 14.5px; }
form.fields label small { font-weight: 400; color: var(--muted); }
form.fields input { font: 16px/1.3 "Inter", sans-serif; padding: 11px 12px; border: 2px solid var(--ink); border-radius: 8px; max-width: 460px; }
form.fields input:focus { outline: 3px solid var(--mint); }
.formerror { color: var(--red-ink); font-weight: 600; font-size: 14px; }
.links { display: grid; gap: 8px; }
.links a { font-weight: 600; }
.note { font-size: 13.5px; color: var(--muted); border-left: 3px solid var(--grey); padding: 2px 0 2px 10px; }
.banner { background: var(--well); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; font-size: 14px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.diagram svg { width: 100%; height: auto; display: block; max-width: 720px; }
.finish h1 { font-size: 40px; }
.finish ol { display: grid; gap: 12px; padding-left: 22px; margin: 0; font-size: 15.5px; }
.toast { position: fixed; bottom: 16px; right: 16px; background: var(--ink); color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px; max-width: 420px; }

.machine { display: grid; gap: 16px; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); align-items: start; }
@media (max-width: 1150px) { .machine { grid-template-columns: 1fr; } }
.stage { background: var(--well); border: 2px solid var(--ink); border-radius: 12px; padding: 10px; box-shadow: 4px 4px 0 var(--ink); }
.machine-svg { width: 100%; height: auto; display: block; }
.machine-side { display: grid; gap: 10px; }
.controls .btn { padding: 9px 13px; }
.speed { font-size: 13px; color: var(--muted); display: inline-flex; gap: 6px; align-items: center; }
.speed select { font: inherit; padding: 5px; border-radius: 6px; border: 1.5px solid var(--ink); }
input[data-scrub] { width: 100%; accent-color: var(--green); }
.pos { font: 600 13px/1 "Inter", sans-serif; color: var(--muted); }
.captions { margin: 0; padding: 12px 16px 12px 32px; background: #fff8dc; border: 2px solid var(--ink); border-radius: 10px; display: grid; gap: 6px; font-size: 15px; min-height: 64px; }
.glossary { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; font-size: 13.5px; background: var(--well); border-radius: 8px; padding: 10px 14px; margin: 0; }
.glossary dt { font-weight: 700; }
.glossary dd { margin: 0; color: var(--muted); }
.detail .inner.wide { max-width: 1000px; }
@media (max-width: 860px) {
  body { height: auto; min-height: 100vh; overflow: auto; }
  .work { grid-template-columns: 1fr; }
  .detail { order: -1; }
  .steps .body { max-height: 300px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
`;

const LOGO_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="2" fill="#5fc79a" stroke="#fff" stroke-width="2"/><rect x="12" y="12" width="8" height="8" fill="#173627"/><path d="M11 3v4M16 3v4M21 3v4M11 25v4M16 25v4M21 25v4M3 11h4M3 16h4M3 21h4M25 11h4M25 16h4M25 21h4" stroke="#fff" stroke-width="2"/></svg>`;

/**
 * @typedef {ReturnType<ReturnType<typeof createStudio>["snapshot"]>} Snapshot  what the page is sent
 * @typedef {Snapshot["steps"][number]} StepView
 * @typedef {NonNullable<Snapshot["account"]["panel"]>} AccountPanel
 */

/**
 * The page's own code. It runs in the browser (it's copied into the page as text), after the
 * command-line functions above. Everything it needs from here comes in as parameters.
 * @param {string} TOKEN  this run's token
 * @param {string} WEEK1_GUIDE_URL  the week-1 guide on GitHub
 */
function studioClient(TOKEN, WEEK1_GUIDE_URL) {
  /** @type {Snapshot | null} */
  let snap = null;
  /** @type {null | number} the step being looked at (null = the current one) */
  let viewing = null;
  let line = lineStart("");
  let lineFor = "";
  let out = { id: -1, text: "" };
  let showOutput = false;
  let outputFor = -1; // the step Show full output was opened on
  let pickedShown = ""; // the last folder from the computer's picker put in the box
  let listedFor = -1; // the step the list last scrolled to
  /** @type {number | null} */
  let viewingWeek = /^#week-(\d+)/.test(location.hash) ? Number(/^#week-(\d+)/.exec(location.hash)?.[1]) : null; // a week's view is open (its page, note, board)
  let focusShown = false; // npm start -- --week N: N's view opens once, when nothing before it is left to do
  let weekTab = /^#week-\d+\/(\w+)$/.exec(location.hash)?.[1] ?? ""; // "" = the week's first tab; the week view's tab: page, note, board, checks
  let detailHtml = ""; // what the main panel shows now (re-rendered only when it changes, so pages don't reload)

  // Back and forward: each view the student moves to (a week and its tab, the machine, a step looked
  // back at) is an entry in the browser's history, with its own address (#week-2/board, #machine).
  /** @typedef {{ week: number | null, tab: string, machine: boolean, step: number | null }} Nav */
  /** @returns {Nav} */
  const navNow = () => ({ week: viewingWeek, tab: weekTab, machine: machineOpen, step: viewing });
  /** @param {Nav} n */
  const hashOf = (n) => (n.machine ? "#machine" : n.week !== null ? `#week-${n.week}${n.tab ? `/${n.tab}` : ""}` : n.step !== null ? `#step-${n.step + 1}` : "");
  /** @param {string} hash @returns {Nav} */
  const navOf = (hash) => {
    const week = /^#week-(\d+)(?:\/(\w+))?$/.exec(hash);
    const step = /^#step-(\d+)$/.exec(hash);
    return { week: week ? Number(week[1]) : null, tab: week?.[2] ?? "", machine: hash === "#machine", step: step ? Number(step[1]) - 1 : null };
  };
  /** After the student moves to another view: a new history entry, unless it's the same place. */
  function remember() {
    const hash = hashOf(navNow());
    if (hash === location.hash) return;
    history.pushState(navNow(), "", hash || location.pathname + location.search);
  }
  history.replaceState(navOf(location.hash), "", location.href);
  window.addEventListener("popstate", (e) => {
    const n = /** @type {Nav | null} */ (e.state) ?? navOf(location.hash);
    viewingWeek = n.week;
    weekTab = n.tab;
    machineOpen = n.machine;
    viewing = n.step;
    render();
  });
  let pasteNote = "";
  /** @type {Record<string, string>} */
  const formValues = {};
  const machine = machinePlayer(MACHINE_TRACE, SKETCHES);
  let machineOpen = location.hash === "#machine";
  const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
  /** The studio's state: the page only draws once the first one has arrived. */
  const present = () => {
    if (!snap) throw new Error("The studio hasn't sent its state yet.");
    return snap;
  };
  const esc = (/** @type {unknown} */ s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function act(/** @type {Record<string, unknown>} */ body) {
    try {
      const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json", "x-studio-token": TOKEN }, body: JSON.stringify(body) });
      if (!res.ok && res.status !== 204) {
        const r = await res.json().catch(() => ({ error: "Something went wrong." }));
        toast(r.error);
      }
    } catch {
      toast("The studio stopped. Run node setup.mjs again to reopen it.");
    }
  }
  /** An action whose answer the page needs (the code tab's save). @param {Record<string, unknown>} body */
  async function ask(body) {
    try {
      const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json", "x-studio-token": TOKEN }, body: JSON.stringify(body) });
      return /** @type {{ ok: boolean, error?: string, rev?: string }} */ (await res.json().catch(() => ({ ok: res.ok, error: res.ok ? "" : "Something went wrong." })));
    } catch {
      return { ok: false, error: "The studio stopped. Run npm start again to reopen it." };
    }
  }
  function toast(/** @type {string} */ text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 4000);
  }

  const events = new EventSource(`/events?t=${encodeURIComponent(TOKEN)}`);
  events.addEventListener("state", (e) => {
    snap = JSON.parse(/** @type {MessageEvent} */ (e).data);
    render();
  });
  events.addEventListener("agent", (e) => agentTab.onEvent(JSON.parse(/** @type {MessageEvent} */ (e).data)));
  events.addEventListener("output", (e) => {
    const o = JSON.parse(/** @type {MessageEvent} */ (e).data);
    if (o.reset || o.id !== out.id) out = { id: o.id, text: "" };
    out.text += o.text;
    paintOutput();
  });
  setInterval(() => act({ type: "heartbeat" }), 10_000);
  // How long the running command has taken, and the extra hint once it's slow.
  setInterval(() => {
    const v = snap?.view;
    const el = document.querySelector("[data-elapsed]");
    if (!v || v.phase !== "running" || !v.startedAt || !el) return;
    const secs = Math.max(0, Math.round((Date.now() - v.startedAt) / 1000));
    el.textContent = `· ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const slow = document.querySelector("[data-slow]");
    if (slow && v.slowNote && v.slowAfterMs && Date.now() - v.startedAt > v.slowAfterMs) slow.textContent = v.slowNote;
  }, 1000);
  // Back from the browser or another window: check again straight away.
  window.addEventListener("focus", () => {
    const panel = snap?.account.panel;
    if (panel) {
      if (panel.phase === "running" && panel.waitFor === "browser") act({ type: "account-recheck" });
      return;
    }
    const step = snap?.steps[snap.current];
    if (step && snap?.view && ["waiting", "failed", "running"].includes(snap.view.phase)) act({ type: "recheck", stepId: step.id });
  });

  function paintOutput() {
    const text = cleanOutput(out.text);
    const pre = document.querySelector("[data-output]");
    if (pre) {
      const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
      pre.textContent = text || "(no output yet)";
      if (atEnd) pre.scrollTop = pre.scrollHeight;
    }
    const sum = document.querySelector("[data-summary]");
    if (sum) sum.textContent = lastLine(text) || "starting…";
  }

  function paintLine() {
    const el = document.querySelector("[data-cmdtext]");
    if (!el) return;
    const rest = line.expected.slice(line.typed.length);
    const done = lineComplete(line);
    el.innerHTML =
      (done ? `<span class="runbtn"><button class="btn run" data-do="run" tabindex="-1">Run <kbd>↵</kbd></button></span>` : "") +
      `<span class="p">$</span><span class="typed">${esc(line.typed)}</span>` +
      (line.wrong ? `<span class="wrong">${esc(line.wrong === " " ? "␣" : line.wrong)}</span>` : "") +
      `<span class="caret"></span><span class="ghost">${esc(rest)}</span>`;
    const note = document.querySelector("[data-cmdnote]");
    if (note) {
      note.className = `cmdnote${line.wrong || pasteNote ? " warn" : ""}`;
      note.textContent = pasteNote
        ? pasteNote
        : line.wrong
          ? `That's not the next character: press Backspace, then type “${line.expected[line.typed.length] === " " ? "space" : line.expected[line.typed.length]}”.`
          : done
            ? "Press Enter to run it."
            : line.typed
              ? "Keep going…"
              : "Click the line and start typing.";
    }
  }

  function diagram(/** @type {string} */ id) {
    const snap = present();
    const login = esc(snap.login || "you");
    // The last part of the path only, so it fits in the box: "~/code/netsim" → "…/netsim".
    const full = String(snap.repoDir || "~/netsim");
    const last = full.split(/[\\/]/).filter(Boolean).pop() ?? full;
    const short = last.length > 18 ? `${last.slice(0, 17)}…` : last;
    const folder = esc(full === last ? short : `…/${short}`);
    const hot = { fork: "fork", clone: "clone", upstream: "upstream", work: "work", push: "push" }[id] ?? "";
    const stroke = (/** @type {string} */ k) => (k === hot ? "#f4061e" : "#16201b");
    const w = (/** @type {string} */ k) => (k === hot ? 3 : 1.6);
    const label = (/** @type {string} */ k) => (k === hot ? `font-weight="700" fill="#c4051a"` : `fill="#5b6660"`);
    const box = (/** @type {number} */ x, /** @type {string} */ fill, /** @type {string} */ a, /** @type {string} */ b, /** @type {string} */ cap, /** @type {boolean} */ on) =>
      `<rect x="${x}" y="40" width="190" height="66" rx="10" fill="${fill}" stroke="#16201b" stroke-width="2"/>` +
      `<rect x="${x + 5}" y="45" width="190" height="66" rx="10" fill="none" stroke="${on ? "#16201b" : "none"}" stroke-width="0" />` +
      `<text x="${x + 95}" y="68" text-anchor="middle" font-weight="600">${a}</text><text x="${x + 95}" y="88" text-anchor="middle">${b}</text>` +
      `<text x="${x + 95}" y="128" text-anchor="middle" fill="#5b6660" font-family="Inter, sans-serif" font-size="12.5">${cap}</text>`;
    return `<svg viewBox="0 0 700 200" role="img" aria-label="The course's repository, your fork on GitHub, and your folder on this laptop">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <g font-family="JetBrains Mono, monospace" font-size="12.5">
        ${box(8, "#d3dbdc", "praiseisaac/", "netsim", "the course (upstream)", false)}
        ${box(255, "#fff1c2", `${login}/`, "netsim", "your fork on GitHub (origin)", false)}
        ${box(502, "#dcf3e8", "this laptop", folder, hot === "work" || hot === "push" ? "your folder · branch work" : "your folder", false)}
        <path d="M200 64 H250" stroke="${stroke("fork")}" stroke-width="${w("fork")}" marker-end="url(#ah)"/>
        <text x="225" y="56" text-anchor="middle" ${label("fork")}>fork</text>
        <path d="M447 64 H497" stroke="${stroke("clone")}" stroke-width="${w("clone")}" marker-end="url(#ah)"/>
        <text x="472" y="56" text-anchor="middle" ${label("clone")}>clone</text>
        <path d="M497 90 H447" stroke="${stroke("push")}" stroke-width="${w("push")}" marker-end="url(#ah)"/>
        <text x="472" y="104" text-anchor="middle" ${label("push")}>push</text>
        <path d="M597 136 V170 H103 V140" fill="none" stroke="${stroke("upstream")}" stroke-width="${w("upstream")}" stroke-dasharray="6 5" marker-end="url(#ah)"/>
        <text x="350" y="188" text-anchor="middle" ${label("upstream")}>upstream: new weeks come from the course</text>
        ${hot === "work" ? `<text x="597" y="30" text-anchor="middle" font-weight="700" fill="#c4051a">branch: work</text>` : ""}
      </g></svg>`;
  }

  function words(/** @type {[string, string][]} */ list) {
    return list.length ? `<dl class="words">${list.map(([w, d]) => `<dt>${esc(w)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>` : "";
  }

  function head(/** @type {StepView} */ step, /** @type {string} */ eyebrow) {
    return `<div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h1 class="q">${esc(step.title)}</h1>
      <p class="tech"><code>${esc(step.technical)}</code> — ${esc(step.explain)}</p></div>
      <p class="why">${esc(step.why)}</p>${step.diagram ? `<div class="diagram">${diagram(step.id)}</div>` : ""}`;
  }

  function outputBlock() {
    return `<details class="out" ${showOutput ? "open" : ""} data-outbox><summary>Show full output</summary><pre data-output></pre></details>`;
  }

  /**
   * "Use a different account", inside the step that offers it: a link, which opens in place into
   * the accounts gh knows (each one a command to type) and "Add another account".
   */
  function accountInline() {
    const snap = present();
    const v = snap.view;
    const p = snap.account.panel;
    if (!v?.canChangeAccount && !p) return "";
    if (!p) return `<div class="row"><button class="linkbtn" data-do="acct-open">Use a different account</button></div>`;
    const login = snap.account.login;
    const cancel = `<button class="btn ghost" data-do="acct-close">${login ? `Keep ${esc(login)}` : "Close"}</button>`;
    const box = (/** @type {string} */ inner) => `<div class="block accountbox"><h3>Use a different account</h3>${inner}</div>`;
    if (p.phase === "choose") {
      const others = p.others.length
        ? p.others.map((o) => `<div class="account"><span class="who">${esc(o)}</span><button class="btn" data-do="acct-pick" data-choice="${esc(o)}">Use ${esc(o)}</button></div>`).join("")
        : `<p class="note">gh doesn't know any other account on this laptop yet.</p>`;
      return box(`<div class="accounts">
          ${login ? `<div class="account now"><span class="who">${esc(login)}</span><span class="muted">in use now</span></div>` : ""}
          ${others}
          <div class="account"><span>An account gh doesn't know yet</span><button class="btn ghost" data-do="acct-pick" data-choice="add">Add another account</button></div>
        </div>
        <div class="row" style="margin-top:12px">${cancel}</div>`);
    }
    const a = p.action;
    if (!a) return "";
    if (p.phase === "ready") {
      const display = a.display ?? "";
      const key = `account:${p.attempt}:${display}`;
      if (lineFor !== key) {
        lineFor = key;
        line = { ...lineStart(display), typed: display };
        pasteNote = "";
      }
      return box(`<label class="cmd" data-cmdline><input class="sink" data-sink aria-label="Type: ${esc(a.display)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><span class="cmdtext" data-cmdtext></span></label>
          <p class="cmdnote" data-cmdnote></p>
          <p class="what"><b>What this does:</b> ${esc(a.what)}</p>${words(a.words ?? [])}
          ${a.runs ? `<p class="runs">The studio runs it as <code>${esc(a.runs)}</code>.</p>` : ""}
        <div class="row" style="margin-top:12px"><button class="btn ghost" data-do="acct-back">Choose another</button>${cancel}</div>`);
    }
    if (p.phase === "running") {
      const browser = p.waitFor === "browser";
      return box(`<div class="cmd doneline"><span class="p">$</span>${esc(a.display)}<span class="ok">running…</span></div>
        ${browser
          ? `<div class="status wait"><i class="spin"></i><div><b>Sign in with the other account in the browser, then come back.</b>
              ${p.code ? `<div class="sub">Your one-time code (type it on the GitHub page):</div><div class="otp">${esc(p.code)}</div>` : ""}
              ${p.url ? `<div class="sub">The page didn't open? <a href="${esc(p.url)}" target="_blank" rel="noreferrer">Open it here</a></div>` : ""}
              <div class="sub">Signed in to GitHub with the wrong account in the browser? Sign out there first, then use the code.</div></div></div>`
          : `<div class="status run"><i class="spin"></i><div><b>Running ${esc(a.display)}</b><div class="summary" data-summary></div></div></div>`}
        <div class="row" style="margin-top:12px"><button class="btn ghost" data-do="acct-close">Stop</button></div>${outputBlock()}`);
    }
    return box(`<div class="status bad"><span class="icon">!</span><div><b>${esc(p.error)}</b><div class="sub">Nothing changed: gh still uses ${esc(login || "the same account")}.</div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-do="acct-pick" data-choice="${esc(p.choice)}">Try again</button><button class="btn ghost" data-do="acct-back">Choose another</button>${cancel}</div>${outputBlock()}`);
  }

  /** What a switch changed, in the step where it happened. */
  function noticeBlock() {
    const notice = present().account.notice;
    return notice ? `<div class="banner"><b>${esc(notice)}</b></div>` : "";
  }

  function currentView(/** @type {StepView} */ step) {
    const snap = present();
    const v = snap.view;
    if (!v) return ""; // only while a step is current (not on the finish screen)
    const a = v.actions[v.index];
    const earlier = v.actions
      .slice(0, v.phase === "passed" ? v.actions.length : v.index)
      .filter((x) => x.display)
      .map((x) => `<div class="cmd doneline"><span class="p">$</span>${esc(x.display)}<span class="ok">✓ done</span></div>`)
      .join("");
    const skip = step.optional ? `<button class="btn ghost" data-do="skip">Skip for now</button>` : "";
    let body = "";
    if (v.phase === "checking") body = `<div class="status run"><i class="spin"></i><div><b>${esc(v.note || "Checking…")}</b></div></div>`;
    else if (v.phase === "passed") {
      body = `${v.already ? "" : earlier}
        <div class="status ok"><span class="icon">✓</span><div><b>${esc(step.found)}</b>${v.already ? `<div class="sub">Already done: nothing to type.</div>` : ""}</div></div>
        ${noticeBlock()}${accountInline()}
        ${step.ran.length ? `<div class="ranlist"><div class="h">The studio ran:</div>${step.ran.map((/** @type {string} */ r) => `<div>$ ${esc(r)}</div>`).join("")}</div>` : ""}
        <div class="row"><button class="btn primary" data-do="next">${snap.current + 1 === snap.total ? "Finish" : "Next step"} <kbd>↵</kbd></button>${step.changeable ? `<button class="btn ghost" data-do="change">Change it</button>` : ""}</div>
        ${v.already ? "" : outputBlock()}`;
    } else if (v.phase === "confirm") {
      body = `<div class="status wait"><span class="icon">?</span><div><b>${esc(v.ask)}</b><div class="sub">Your fork and your work will belong to this account.</div></div></div>
        <div class="row"><button class="btn primary" data-do="yes">Yes <kbd>↵</kbd></button><button class="btn" data-do="switch">Use a different account</button></div>
        ${snap.account.panel ? accountInline() : ""}`;
    } else if (v.phase === "failed") {
      const e = v.error ?? { what: "Something went wrong.", fix: "" };
      const items = (e.items ?? [])
        .map((it) => `<li><b>${esc(it.check)}</b>: ${esc(it.found)}${it.fix ? `<div class="sub"><b style="display:inline">Fix:</b> ${esc(it.fix)}</div>` : ""}</li>`)
        .join("");
      body = `${earlier}<div class="status bad"><span class="icon">!</span><div><b>${esc(e.what)}</b>${items ? `<ul class="failures">${items}</ul>` : ""}<div class="sub">${items ? "" : `<b style="display:inline">Fix:</b> `}${esc(e.fix)}</div></div></div>
        <div class="row">${e.stop ? `<button class="btn ghost" data-do="retry">Try again</button>` : `<button class="btn primary" data-do="retry">Try again <kbd>↵</kbd></button>`}${e.back ? `<button class="btn" data-do="back" data-to="${e.back}">Go back to step ${e.back}</button>` : ""}${skip}</div>
        ${outputBlock()}`;
    } else if (v.phase === "running" || v.phase === "waiting") {
      const browser = v.waitFor === "browser";
      const where = v.waitFor === "terminal" ? "Finish in the Terminal window that just opened (it asks for your Mac password; nothing shows while you type it). When it's done, come back here." : v.waitFor === "window" ? "Finish in the window that popped up, then come back here." : "Finish signing in in the browser, then come back.";
      const waiting = browser || v.phase === "waiting";
      body = `${earlier}<div class="cmd doneline"><span class="p">$</span>${esc(a?.display)}<span class="ok">${v.phase === "running" ? "running…" : "started"}</span></div>
        ${waiting ? `<div class="status wait"><i class="spin"></i><div><b>${where}</b>
            ${v.code ? `<div class="sub">Your one-time code (type it on the GitHub page):</div><div class="otp">${esc(v.code)}</div>` : ""}
            ${v.url ? `<div class="sub">The page didn't open? <a href="${esc(v.url)}" target="_blank" rel="noreferrer">Open it here</a></div>` : ""}
            <div class="sub">${v.note ? esc(v.note) : "The studio checks again when you come back to this window."}</div></div></div>` : ""}
        ${v.phase === "running" && v.note ? `<div class="status wait"><i class="spin"></i><div><b>${esc(v.note)}</b><div class="sub" data-slow></div></div></div>` : ""}
        ${v.phase === "running" ? `<div class="status run"><i class="spin"></i><div><b>Running ${esc(a?.display)} <span class="elapsed" data-elapsed></span></b><div class="summary" data-summary></div></div></div>` : ""}
        ${v.phase === "waiting" ? `<div class="row"><button class="btn primary" data-do="recheck">Check again <kbd>↵</kbd></button>${skip}</div>` : ""}
        ${v.phase === "running" && browser ? `<div class="row"><button class="btn" data-do="retry">Start again</button><span class="muted">Closed the sign-in page, or it went wrong? This stops it so you can run it again.</span></div>` : ""}
        ${outputBlock()}`;
    } else if (v.phase === "ready" && a) {
      if (a.kind === "command") {
        const display = a.display ?? "";
        const key = `${step.id}:${v.attempt}:${v.index}:${display}`;
        if (lineFor !== key) {
          lineFor = key;
          // Click to run: the command comes typed out, so it's one press of Run (or Enter). The studio still
          // only runs the command this step planned, matched exactly (act "run").
          line = { ...lineStart(display), typed: display };
          pasteNote = "";
        }
        body = `${earlier}<div class="block"><h3>${esc(a.label || "Run this command")}</h3>
          <label class="cmd" data-cmdline><input class="sink" data-sink aria-label="Type: ${esc(a.display)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><span class="cmdtext" data-cmdtext></span></label>
          <p class="cmdnote" data-cmdnote></p>
          <p class="what"><b>What this does:</b> ${esc(a.what)}</p>${words(a.words ?? [])}
          ${a.cwd || a.runs ? `<p class="runs">${a.cwd ? `Runs in <code>${esc(a.cwd)}</code>. ` : ""}${a.runs ? `The studio runs it as <code>${esc(a.runs)}</code>.` : ""}</p>` : ""}
</div>
          ${skip ? `<div class="row">${skip}</div>` : ""}`;
      } else if (a.kind === "form" || a.kind === "folder") {
        /** @type {Field[]} */
        const fields = a.kind === "form" ? (a.fields ?? []) : [{ name: "folder", label: a.label ?? "", hint: a.hint, placeholder: a.initial }];
        if (a.kind === "folder" && formValues.folder === undefined) formValues.folder = a.initial ?? "";
        // A folder picked in the computer's picker fills the box (once per pick).
        if (a.kind === "folder" && v.picked && v.picked !== pickedShown) {
          pickedShown = v.picked;
          formValues.folder = v.picked;
        }
        body = `${earlier}<form class="fields" data-form novalidate>
          ${fields.map((f) => `<label>${esc(f.label)} ${f.hint ? `<small>${esc(f.hint)}</small>` : ""}<input name="${esc(f.name)}" type="${esc(f.type || "text")}" placeholder="${esc(f.placeholder || "")}" value="${esc(formValues[f.name] ?? "")}" autocomplete="off" spellcheck="false"></label>`).join("")}
          ${v.formError ? `<p class="formerror">${esc(v.formError)}</p>` : ""}
          ${a.kind === "folder" && v.missing ? `<div class="row"><button class="btn primary" type="button" data-do="create-folder" data-path="${esc(v.missing)}">Create ${esc(v.missing)}</button><span class="muted">or type another folder</span></div>` : ""}
          <div class="row"><button class="btn ${a.kind === "folder" && v.missing ? "ghost" : "primary"}" type="submit">${esc(a.button || "Use this folder")} <kbd>↵</kbd></button>${a.kind === "folder" && v.canPickFolder ? ` <button class="btn ghost" type="button" data-do="pick-folder">Choose…</button>` : ""}</div></form>`;
      } else if (a.kind === "choice") {
        body = `<div class="block"><h3>Do this in your browser</h3><div class="links">${(a.links ?? []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)} ↗</a>`).join("")}</div></div>
          <div class="status wait"><span class="icon">?</span><div><b>${esc(a.question)}</b><div class="sub">The studio can't check this one, so it takes your word for it.</div></div></div>
          <div class="row"><button class="btn primary" data-do="submit">${esc(a.yes)} <kbd>↵</kbd></button>${skip}</div>`;
      }
    }
    if (v.phase !== "passed" && v.phase !== "confirm" && (v.canChangeAccount || snap.account.panel)) {
      // The step where the account matters (Get week N's push, with the wrong account). While the
      // accounts are open, the step's own command waits underneath.
      const status = `<div class="status bad"><span class="icon">!</span><div><b>${esc(step.found)}</b></div></div>`;
      // Say why first: the account doesn't own the copy (step.found), then the step's own commands.
      const why = v.phase === "ready" ? `<div class="status wait"><span class="icon">!</span><div><b>${esc(step.found)}</b></div></div>` : "";
      body = snap.account.panel ? `${status}${accountInline()}` : `${noticeBlock()}${why}${body}${accountInline()}`;
    } else if (v.phase !== "passed" && v.phase !== "confirm") body = `${noticeBlock()}${body}`;
    return `${head(step, step.optional ? "Optional: you can skip this one" : "")}${body}${doneAllBlock(v)}`;
  }

  /**
   * "I've done all this": for a student who did the week's steps by hand. Runs every check left in
   * this week (nothing else) and carries on from the first thing still to do.
   * @param {{ canCheckAll?: boolean }} v
   */
  function doneAllBlock(v) {
    if (!v.canCheckAll) return "";
    const snap = present();
    const g = snap.groups.find((x) => x.count > 0 && snap.current >= x.start && snap.current < x.start + x.count);
    const what = g ? (g.status === "setup" ? "the setup" : g.update ? `week ${g.week}'s update` : `week ${g.week}`) : "these steps";
    return `<div class="row donerow"><button class="btn ghost" data-do="check-all">I've done all this — check and continue</button><span class="muted">Checks every step left in ${esc(what)} (it runs nothing else) and carries on from the first one still to do.</span></div>`;
  }

  function otherView(/** @type {StepView} */ step) {
    const snap = present();
    const cur = snap.steps[snap.current];
    const back = cur ? `<button class="btn" data-do="view" data-n="">Back to step ${cur.n}</button>` : `<button class="btn" data-do="view" data-n="">Back</button>`;
    if (step.n - 1 < snap.current) {
      return `<div class="banner">You're looking at step ${step.n}. ${back}</div>${head(step, `Step ${step.n} · ${step.mark === "skipped" ? "skipped" : "done"}`)}
        <div class="status ${step.mark === "skipped" ? "run" : "ok"}"><span class="icon">${step.mark === "skipped" ? "–" : "✓"}</span><div><b>${esc(step.found)}</b></div></div>
        ${step.ran.length ? `<div class="ranlist"><div class="h">The studio ran:</div>${step.ran.map((/** @type {string} */ r) => `<div>$ ${esc(r)}</div>`).join("")}</div>` : ""}
        <div class="row"><button class="btn ghost" data-do="back" data-to="${step.n}">${step.mark === "skipped" ? "Do it now" : `Do step ${step.n} again`}</button></div>`;
    }
    return `<div class="banner">Steps go in order: you'll do this one after step ${step.n - 1}. ${back}</div>${head(step, `Step ${step.n} of ${snap.total} · later`)}
      ${step.preview.length ? `<div class="block"><h3>You'll type</h3>${step.preview.map((/** @type {string} */ p) => `<div class="cmd preview" style="margin-bottom:8px"><span class="p">$</span>${esc(p)}</div>`).join("")}</div>` : `<p class="note">Nothing to type on this one.</p>`}`;
  }

  function weekFinishView() {
    const snap = present();
    if (!snap.published)
      return `<div class="finish"><p class="eyebrow">Get this week's work</p><h1>Week ${esc(snap.week)} isn't out yet.</h1>
        <p class="why" style="margin-top:10px">Check back before Monday's class.</p></div>
        <p class="note">You can close this tab: the studio stops when you do.</p>`;
    if (snap.inWork) {
      const home = snap.groups.find((g) => g.week === (snap.home || snap.week));
      if (snap.home && snap.home !== snap.week) return `<div class="banner ok"><b>You're up to date.</b> Today: week ${esc(snap.home)}.</div>${home ? weekView(home) : ""}`;
      return `<div class="banner"><b>Week ${esc(snap.week)} is in your work.</b> Week ${esc(snap.next)} isn't out yet.</div>${home ? weekView(home) : ""}`;
    }
    if (snap.home && snap.home !== snap.week) {
      const today = snap.groups.find((g) => g.week === snap.home);
      return `<div class="banner ok"><b>You're up to date.</b> Everything the course has released is in your folder and on GitHub. Today: week ${esc(snap.home)}.</div>${today ? weekView(today) : ""}`;
    }
    const home = snap.groups.find((g) => g.week === snap.week);
    return `<div class="banner ok"><b>Week ${esc(snap.week)} is in your work!</b> ${esc(snap.arrived || `Week ${snap.week}'s files are in your folder, and on GitHub.`)}
      </div>${home ? weekView(home) : ""}`;
  }

  function finishView() {
    const snap = present();
    if (snap.mode === "week") return weekFinishView();
    const folder = snap.repoDir || "your netsim folder";
    const week1 = snap.groups.find((g) => g.week === 1);
    if (week1 && snap.repoDir)
      return `<div class="banner ok"><b>You're set up!</b> Your laptop has everything the course needs, and your copy of the course is on GitHub and here. From now on, every class starts with <code>cd ${esc(/\s/.test(folder) ? `"${folder}"` : folder)}</code> then <code>npm start</code>. <button class="btn ghost" data-do="machine">See the computer you'll build</button></div>${weekView(week1)}`;
    return `<div class="finish"><p class="eyebrow">Week 1 · Setup</p><h1>You're set up!</h1>
      <p class="why" style="margin-top:10px">Your laptop has everything the course needs, and your own copy of the course is on GitHub and on this laptop.</p>
      ${snap.codexVersion ? `<p class="note" style="margin-top:10px">Codex version: <code>${esc(snap.codexVersion)}</code></p>` : ""}</div>
      <div class="block"><h3>What to do next</h3><ol>
        <li><b>Open the week-1 guide:</b> <a href="${WEEK1_GUIDE_URL}" target="_blank" rel="noreferrer">docs/weeks/week-01.md</a> (it's in your folder too).</li>
        <li><b>Do the take-home:</b> paste the doctor's output into <code>docs/notes/week-01.md</code>, and try Codex on a real file.</li>
        <li><b>Every class after this:</b> open a terminal in <code>${esc(folder)}</code> and run <code>npm start</code>. The studio gets that week's work for you, then shows its lesson page and the board.</li>
      </ol></div>
      <div class="row"><button class="btn primary" data-do="machine">See the computer you'll build <kbd>↵</kbd></button></div>
      <p class="note">You can close this tab: the studio stops when you do.</p>`;
  }

  function machineView() {
    return `<div><p class="eyebrow">What you'll build over the next weeks</p><h1 class="q">The computer you'll build</h1>
      <p class="why" style="margin-top:8px">This is a recording of the finished course project running: two small programs (a countdown on the display, and a blinking LED) and one press of the button. Press Play, or Step through it one tick at a time.</p></div>
      <div data-machine>${machine.html()}</div>
      <dl class="glossary">
        <dt>bus</dt><dd>the shared line every part talks over; each message says who it's from and who it's for</dd>
        <dt>tick</dt><dd>one beat of the clock; every part does one small step per tick</dd>
        <dt>CPU, core</dt><dd>the part that runs programs; it has two cores, so two programs run side by side</dd>
        <dt>Memory, address</dt><dd>a row of numbered bytes; the number of a byte is its address, like 0x3F1 (0x means the number is written in hexadecimal)</dd>
        <dt>instruction</dt><dd>one small order for the CPU, written in assembly, like <code>STORE R0, 0x3F2</code> (“write R0 into the byte at 0x3F2”)</dd>
        <dt>R0–R3</dt><dd>registers: four small number slots inside each core, where it keeps the numbers it's working on</dd>
        <dt>in this demo</dt><dd><code>LOADI</code> put a number in a register · <code>LOAD</code> read a byte from Memory · <code>STORE</code> write one to Memory · <code>ADD</code>/<code>SUB</code> add, subtract · <code>JNZ</code> jump back unless the result was zero · <code>HALT</code> stop · <code>IRET</code> end the handler and go back</dd>
        <dt>interrupt</dt><dd>a signal from a device that makes the CPU stop and deal with it</dd>
        <dt>handler</dt><dd>the short program the CPU runs when an interrupt arrives</dd>
      </dl>
      <div class="row"><button class="btn ghost" data-do="m-close">Back to the summary</button></div>`;
  }

  /** One week's heading in the list: its number, title, and where it stands. @param {{ week: number, title: string, status: string, label?: string, update?: boolean }} g */
  function weekHeading(g) {
    const note = g.update ? "get the update" : g.week === snap?.home && g.status !== "get" ? "today" : ({ setup: "", done: "done", inwork: "in your work", get: "get it now", later: "after this one", future: "not out yet", open: "open" }[g.status] ?? "");
    const inner = `<span>${g.label ? esc(g.label) : `Week ${esc(g.week)} · ${esc(g.title)}`}${g.update ? " · update" : ""}</span>${note ? `<em>${esc(note)}</em>` : ""}`;
    // A week that's in opens its home: its page, note and board.
    return weekIsIn(g) ? `<button class="sgroup ${g.status} open ${viewingWeek === g.week ? "viewing" : ""}" data-do="week" data-w="${g.week}" title="Open week ${g.week}">${inner}</button>` : `<div class="sgroup ${g.status}">${inner}</div>`;
  }

  /** In the student's work, so its page and board can open. @param {{ status: string }} g */
  function weekIsIn(g) {
    return ["setup", "done", "inwork", "open"].includes(g.status) || (g.status === "get" && !!snap && snap.current >= snap.total);
  }

  /**
   * A week in the studio: its lesson page, design note, board and checks, as tabs. The page and the
   * note are the course folder's own files, shown here (links inside them open here too). Room for
   * more tabs later (a build week's tasks, Join class).
   * @param {{ week: number, title: string, kind?: string, page?: string | null, guide?: string | null, note?: string | null, board?: boolean }} g
   */
  /**
   * The Code tab: a week's tasks in lesson order. Each is a card: what the guide says, the lines
   * around the task (read-only), an editor for the task's body, and Save, which writes the body into
   * the file and runs the task's tests. The editors are made once per week and kept while the page
   * redraws; what's typed and not saved yet survives switching tabs.
   */
  /** From a Code card to the Agent tab, with its prompt in the box. @param {string} task @param {string} prompt */
  function goToAgent(task, prompt) {
    agentTab.prefill(task, prompt);
    weekTab = "agent";
    remember();
    render();
  }
  const codeTab = (() => {
    /** @typedef {{ id: string, file: string, part: string, description: string, before: string[], after: string[], indent: string, body: string, rev: string, lesson: string, prompt: string, tests: string[], line: number, stubbed: boolean, hint: string, steps: { line: number, explain: string }[], words: string[], members: string[] }} Task */
    /** The hint text shows unless the student hid it (remembered on this laptop). */
    let hintsShown = true;
    try {
      hintsShown = localStorage.getItem("netsim-hints") !== "off";
    } catch {
      // storage blocked: hints show
    }
    /** @type {Record<string, string>} what's typed and not saved, by task */
    const drafts = {};
    /** @type {Record<string, string>} which version of the task in the file each draft was typed over */
    const draftRevs = {};
    const setDraft = (/** @type {{ id: string, rev: string }} */ t, /** @type {string} */ text) => {
      drafts[t.id] = text;
      draftRevs[t.id] = t.rev;
    };
    const dropDraft = (/** @type {string} */ id) => {
      delete drafts[id];
      delete draftRevs[id];
    };
    /** @type {{ week: number, el: HTMLElement, tasks: Task[], editors: Record<string, { value: string, focus: () => void, showHint?: (show: boolean) => void }> } | null} */
    let mounted = null;
    /** @type {Promise<void> | null} */
    let loading = null;
    const md = (/** @type {string} */ text) =>
      esc(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/\*([^*\s][^*]*)\*/g, "<i>$1</i>")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    /** CodeMirror from /editor.js, loaded once; a plain text box when it isn't there. */
    function loadEditor() {
      if (/** @type {any} */ (window).NetsimEditor || loading) return loading ?? Promise.resolve();
      loading = new Promise((done) => {
        const s = document.createElement("script");
        s.src = "/editor.js";
        s.onload = () => done();
        s.onerror = () => done();
        document.head.append(s);
      });
      return loading;
    }
    /** @param {HTMLElement} box @param {Task} t @param {() => void} save */
    function makeEditor(box, t, save) {
      // A task with a hint that's still its stub starts empty, with the hint in grey to type over.
      const doc = drafts[t.id] ?? (t.hint && t.stubbed ? "" : t.body);
      const lib = /** @type {any} */ (window).NetsimEditor; // set by /editor.js
      if (lib) {
        const ed = lib.create(box, {
          doc,
          tsx: t.file.endsWith(".tsx"),
          hint: t.hint,
          words: t.words,
          members: t.members,
          onChange: (/** @type {string} */ text) => {
            setDraft(t, text);
            markStep(t, text);
          },
          onSave: save,
        });
        markStep(t, doc);
        if (!hintsShown) ed.showHint(false);
        return ed;
      }
      const area = document.createElement("textarea");
      area.className = "plaincode";
      area.spellcheck = false;
      area.value = doc;
      if (t.hint && hintsShown) area.placeholder = t.hint;
      area.rows = Math.max(6, doc.split("\n").length + 2);
      area.addEventListener("input", () => setDraft(t, area.value));
      area.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end");
          setDraft(t, area.value);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      });
      box.append(area);
      return { get value() { return area.value; }, set value(v) { area.value = v; }, focus: () => area.focus() };
    }
    /**
     * Light the explanation of the part being typed: how far the typing has followed the hint.
     * @param {Task} t
     * @param {string} text
     */
    function markStep(t, text) {
      const lib = /** @type {any} */ (window).NetsimEditor;
      if (!mounted || !t.steps.length || !lib?.ghostRest) return;
      const rest = lib.ghostRest(text, t.hint);
      const at = rest === null ? -1 : t.hint.slice(0, t.hint.length - rest.length).split("\n").length - 1;
      let current = -1;
      t.steps.forEach((st, i) => {
        if (at >= st.line) current = i;
      });
      if (at >= 0 && current < 0) current = 0;
      for (const li of mounted.el.querySelectorAll(`[data-task="${CSS.escape(t.id)}"] [data-step]`)) li.classList.toggle("now", Number(/** @type {HTMLElement} */ (li).dataset.step) === current);
    }

    /** @param {Task} t @param {number} n */
    function card(t, n) {
      const where = `${t.file} · line ${t.line}`;
      // Coloured like the editor once /editor.js is here (plain text without it).
      const lib = /** @type {any} */ (window).NetsimEditor;
      const ctx = (/** @type {string[]} */ lines) => (lines.length ? `<pre class="ctx">${lib?.highlight ? lib.highlight(lines.join("\n"), t.file.endsWith(".tsx")) : esc(lines.join("\n"))}</pre>` : "");
      const walk = t.steps.length
        ? `<aside class="prompt walk"><h4>What this code does</h4><ol>${t.steps.map((st, i) => `<li data-step="${i}" data-line="${st.line}">${md(st.explain)}</li>`).join("")}</ol></aside>`
        : "";
      const prompt = t.prompt
        ? `<aside class="prompt"><h4>Codex prompt</h4><p class="sub">Send it to the Agent tab (add your approach first), or run <code>codex</code> in a terminal in your course folder and paste it. Read what it writes before you keep it.</p><pre>${esc(t.prompt)}</pre><div class="row"><button class="btn" data-code-agent="${esc(t.id)}">Send to the agent</button><button class="btn ghost" data-code-copy="${esc(t.id)}">Copy the prompt</button></div></aside>`
        : "";
      return `<section class="task" data-task="${esc(t.id)}">
        <div class="taskhead"><span class="tnum">${n}</span><div><h3><code>${esc(t.id)}</code></h3><p class="tdesc">${esc(t.description)}</p></div><span class="tpart ${t.part}">${t.part === "class" ? "in class" : "take-home"}</span></div>
        ${t.lesson ? `<p class="lesson">${md(t.lesson)}</p>` : ""}
        <div class="taskgrid ${prompt || walk ? "withprompt" : ""}"><div class="codewrap"><div class="cfile">${esc(where)}</div>${ctx(t.before)}<div class="editor" style="margin-left:${t.indent.length}ch" data-ed="${esc(t.id)}"></div>${ctx(t.after)}</div>${walk || prompt ? `<div class="aside">${walk}${prompt}</div>` : ""}</div>
        ${t.hint ? `<div class="row hintrow"><span class="muted" data-hint-says>${hintsShown ? "Type over the grey code, or press <kbd>Tab</kbd> for its next word; any code that passes the tests is fine." : "The hint is hidden. <kbd>Tab</kbd> after a letter or a dot lists the names that fit."}</span><button class="btn ghost" data-code-paste="${esc(t.id)}">Paste it all</button><button class="btn ghost" data-code-hints>${hintsShown ? "Hide the hint" : "Show the hint"}</button></div>` : ""}
        <div class="row"><button class="btn primary" data-code-save="${esc(t.id)}">Save and run its tests <kbd>⌘S</kbd></button><button class="btn" data-code-test="${esc(t.id)}">Run its tests</button>${t.prompt ? "" : `<button class="btn" data-code-agent="${esc(t.id)}">Ask the agent</button>`}<span class="muted">Save writes only this task into <code>${esc(t.file)}</code>, then runs <code>${esc(t.tests.join(" "))}</code>.</span></div>
        <div class="tresult" data-result="${esc(t.id)}"></div>
      </section>`;
    }
    /** @param {number} week @param {HTMLElement} el */
    async function mount(week, el) {
      mounted = { week, el, tasks: [], editors: {} };
      const mine = mounted;
      const [res] = await Promise.all([fetch(`/api/code?week=${week}`, { headers: { "x-studio-token": TOKEN } }).then((r) => r.json()).catch(() => null), loadEditor()]);
      if (mounted !== mine) return;
      if (!res?.tasks) {
        el.innerHTML = `<p class="why">${esc(res?.error ?? "The studio couldn't read this week's tasks.")}</p>`;
        return;
      }
      mine.tasks = res.tasks;
      // A card always opens on what's in the file: typing over an older version doesn't survive it.
      for (const t of mine.tasks) if (draftRevs[t.id] !== undefined && draftRevs[t.id] !== t.rev) dropDraft(t.id);
      if (!mine.tasks.length) {
        el.innerHTML = `<p class="why">There's no code to write this week: the work is in your design note.</p>`;
        return;
      }
      el.innerHTML = `<p class="why">This week's tasks, in the order of the lesson. Write each one here or in VS Code: it's the same file. <b>Save</b> writes only the task's lines and runs its tests; when they pass, commit it.</p>${mine.tasks.map((t, i) => card(t, i + 1)).join("")}`;
      for (const t of mine.tasks) {
        const box = /** @type {HTMLElement} */ (el.querySelector(`[data-ed="${CSS.escape(t.id)}"]`));
        mine.editors[t.id] = makeEditor(box, t, () => save(t.id));
      }
      update();
    }
    /** @param {string} id */
    async function save(id) {
      const m = mounted;
      const t = m?.tasks.find((x) => x.id === id);
      if (!m || !t) return;
      const body = m.editors[id].value;
      const r = await ask({ type: "code-save", week: m.week, id, file: t.file, rev: t.rev, body });
      if (!r.ok) {
        const box = m.el.querySelector(`[data-result="${CSS.escape(id)}"]`);
        if (box) box.innerHTML = `<div class="status bad"><span class="icon">!</span><div><b>${esc(r.error ?? "It didn't save.")}</b>${/changed/.test(r.error ?? "") ? `<div class="row"><button class="btn ghost" data-code-reload="${esc(id)}">Reload it from the file</button></div>` : ""}</div></div>`;
        return;
      }
      t.rev = r.rev ?? t.rev;
      t.body = body;
      t.stubbed = false;
      dropDraft(id);
    }
    /** @param {string} id */
    function reload(id) {
      dropDraft(id);
      if (mounted) {
        const { week, el } = mounted;
        mounted = null;
        void mount(week, el);
      }
    }
    /**
     * The file may have changed (the agent's turn ended, or the student came back from VS Code):
     * cards show it, unless there's unsaved typing, which then gets a Reload and is never overwritten.
     */
    async function refresh() {
      const m = mounted;
      if (!m?.tasks.length) return;
      const res = await fetch(`/api/code?week=${m.week}`, { headers: { "x-studio-token": TOKEN } }).then((r) => r.json()).catch(() => null);
      if (mounted !== m || !res?.tasks) return;
      for (const fresh of res.tasks) {
        const t = m.tasks.find((x) => x.id === fresh.id);
        const ed = m.editors[fresh.id];
        if (!t || !ed || t.rev === fresh.rev) continue;
        if (drafts[t.id] !== undefined && drafts[t.id] !== t.body) {
          const box = m.el.querySelector(`[data-result="${CSS.escape(t.id)}"]`);
          if (box) box.innerHTML = `<div class="status bad"><span class="icon">!</span><div><b>This task changed in the file (Codex or VS Code). What you typed here isn't saved.</b><div class="row"><button class="btn ghost" data-code-reload="${esc(t.id)}">Reload it from the file</button></div></div></div>`;
          continue;
        }
        Object.assign(t, fresh);
        ed.value = fresh.hint && fresh.stubbed ? "" : fresh.body;
        dropDraft(t.id);
      }
    }
    window.addEventListener("focus", () => void refresh());

    /** Results and commits, from the studio's state. */
    function update() {
      if (!mounted || !snap) return;
      for (const t of mounted.tasks) {
        const box = mounted.el.querySelector(`[data-result="${CSS.escape(t.id)}"]`);
        const r = snap.code?.[t.id];
        if (!box || !r) continue;
        const socket = r.blocked ? `<div class="sub">${esc(r.blocked)} more open a local socket, so they only run with Run its tests.</div>` : "";
        const waiting = r.blocked && !r.waiting?.length ? socket : r.waiting?.length ? `${socket}<div class="sub">${esc(r.waiting.length === 1 ? "Some tests also need" : "Some tests also need these tasks")}: ${r.waiting.map((w) => `<code>${esc(w)}</code>`).join(", ")} (not done yet, so they don't count against this one).</div>` : "";
        let html = "";
        if (r.phase === "running") html = `<div class="status run"><i class="spin"></i><div><b>Running ${esc(t.tests.join(" "))}…</b></div></div>`;
        else if (r.phase === "error") html = `<div class="status bad"><span class="icon">!</span><div><b>The tests couldn't run.</b><pre class="log">${esc(r.error)}</pre></div></div>`;
        else if (r.phase === "failed")
          html = `<div class="status bad"><span class="icon">!</span><div><b>${r.failed} test${r.failed === 1 ? "" : "s"} fail${r.failed === 1 ? "s" : ""} (${r.passed} pass).</b>${r.waiting?.length ? `<div class="sub">Tests that need unfinished tasks are left out, but one of these may still come from them.</div>` : ""}${(r.failures ?? []).map((f) => `<div class="failure"><div class="ftest">${esc(f.test)}${f.own ? ` <span class="muted">(this task)</span>` : ""}</div><pre class="log">${esc(f.message)}</pre></div>`).join("")}${waiting}</div></div>`;
        else if (r.phase === "passed") {
          const commit = `git commit -m "week ${mounted.week}: ${t.id}" -- ${t.file}`;
          const none = !r.passed;
          const said = none ? (r.waiting?.length ? "Nothing to check yet: every test of this task also needs another one (below)." : "No test checks this task: look at it on the board.") : `Its tests pass (${r.passed}).`;
          html = `<div class="status ok"><span class="icon">✓</span><div><b>${said}</b>${waiting}</div></div>
            ${r.committed ? `<div class="status ok"><span class="icon">✓</span><div><b>${esc(r.committed)}</b></div></div>` : `<div class="row"><button class="btn primary" data-code-commit="${esc(t.id)}">Commit it</button><code class="muted">${esc(commit)}</code></div><p class="muted">It commits the whole file, with anything else you changed in it.</p>`}`;
        }
        if (box.innerHTML !== html) box.innerHTML = html;
      }
    }
    /** After each render: mount the tab when it's shown, refresh its results. */
    function sync() {
      const el = /** @type {HTMLElement | null} */ (document.querySelector("[data-codetab]"));
      if (!el) {
        mounted = null;
        return;
      }
      const week = Number(el.dataset.codetab);
      if (!mounted || mounted.el !== el || mounted.week !== week) void mount(week, el);
      else update();
    }
    document.addEventListener("click", (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest("[data-code-save],[data-code-test],[data-code-commit],[data-code-copy],[data-code-agent],[data-code-reload],[data-code-paste],[data-code-hints]");
      if (!(el instanceof HTMLElement) || !mounted) return;
      if (el.dataset.codeAgent) {
        const t = mounted.tasks.find((x) => x.id === el.dataset.codeAgent);
        if (t) goToAgent(t.id, t.prompt);
      } else if (el.dataset.codeTest) void ask({ type: "code-test", week: mounted.week, id: el.dataset.codeTest }).then((/** @type {any} */ r) => r.ok || toast(r.error ?? "That didn't run."));
      else if (el.dataset.codeSave) void save(el.dataset.codeSave);
      else if (el.dataset.codePaste) {
        const t = mounted.tasks.find((x) => x.id === el.dataset.codePaste);
        const ed = t && mounted.editors[t.id];
        if (t && ed) {
          ed.value = t.hint;
          setDraft(t, t.hint);
          ed.focus();
        }
      } else if (el.dataset.codeHints !== undefined) {
        hintsShown = !hintsShown;
        try {
          localStorage.setItem("netsim-hints", hintsShown ? "on" : "off");
        } catch {
          // not remembered: fine
        }
        for (const ed of Object.values(mounted.editors)) ed.showHint?.(hintsShown);
        for (const b of mounted.el.querySelectorAll("[data-code-hints]")) b.textContent = hintsShown ? "Hide the hint" : "Show the hint";
        for (const say of mounted.el.querySelectorAll("[data-hint-says]"))
          say.innerHTML = hintsShown ? "Type over the grey code, or press <kbd>Tab</kbd> for its next word; any code that passes the tests is fine." : "The hint is hidden. <kbd>Tab</kbd> after a letter or a dot lists the names that fit.";
      }
      else if (el.dataset.codeCommit) void act({ type: "code-commit", week: mounted.week, id: el.dataset.codeCommit });
      else if (el.dataset.codeReload) reload(el.dataset.codeReload);
      else if (el.dataset.codeCopy) {
        const t = mounted.tasks.find((x) => x.id === el.dataset.codeCopy);
        if (t) void navigator.clipboard?.writeText(t.prompt).then(() => toast("Copied: paste it into Codex."), () => toast("Select the prompt and copy it."));
      }
    });
    return { sync, refresh };
  })();

  /**
   * The Agent tab: talk to the student's own Codex. Node owns everything; this draws a snapshot and
   * applies its numbered events, and if it misses one it asks for the snapshot again. Refreshing the
   * page only redraws: nothing is ever sent again from here.
   */
  // The Build view's Files tab: the course folder's files, read-only. A tree (All files / Changed),
  // and the file: highlighted code with its line numbers (the student's regions marked), Markdown
  // rendered or as source, images in place, and a file's uncommitted changes as a unified diff.
  // Everything shown is escaped (highlightSource,
  // chatMarkdown); the studio sends it as data. Editing stays in the Code tab.
  const filesTab = (() => {
    /** @type {{ el: HTMLElement } | null} */
    let mounted = null;
    /** @type {{ path: string, status?: string, added?: number, removed?: number }[]} */
    let files = [];
    let filter = "all";
    /** @type {Set<string>} */
    const openDirs = new Set();
    let selected = "";
    /** @type {any} */
    let file = null; // what /api/file said about the selected file
    /** @type {any} */
    let diff = null; // what /api/diff said
    let mode = ""; // "file" or "diff"; "" = the diff when it has changes
    let mdMode = "rendered";
    let loaded = false;
    /** The current step, from the Build view, for the "Commit it" under its diff. @type {() => any} */
    let stepNow = () => null;
    const get = (/** @type {string} */ url) => fetch(url, { headers: { "x-studio-token": TOKEN } }).then((r) => r.json()).catch(() => null);
    const changed = () => files.filter((f) => f.status);
    const LANGS = /** @type {Record<string, string>} */ ({ ts: "TypeScript", tsx: "TypeScript (TSX)", js: "JavaScript", json: "JSON", md: "Markdown", asm: "Assembly", text: "Text", image: "Image" });
    const STATUS = /** @type {Record<string, string>} */ ({ modified: "uncommitted", added: "new, staged", untracked: "new", deleted: "deleted", renamed: "renamed", conflict: "conflict" });

    async function refresh() {
      if (!mounted) return;
      const m = mounted;
      const res = await get("/api/files");
      if (mounted !== m) return;
      files = res?.files ?? [];
      loaded = true;
      // First look: open on the current step's file if it changed, else the first changed file.
      if (!selected) {
        const step = stepNow();
        const pick = files.find((f) => f.status && step?.file === f.path) ?? changed()[0];
        if (pick) selected = pick.path;
      }
      for (const f of changed()) for (const d of parents(f.path)) openDirs.add(d);
      for (const d of parents(selected)) openDirs.add(d);
      if (selected) await load(selected);
      else paint();
    }
    /** The folders a path is in, outermost first. @param {string} path */
    function parents(path) {
      const parts = path.split("/").slice(0, -1);
      return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    }
    /** @param {string} path */
    async function load(path) {
      const m = mounted;
      const entry = files.find((f) => f.path === path);
      const [f, d] = await Promise.all([entry?.status === "deleted" ? Promise.resolve(null) : get(`/api/file?path=${encodeURIComponent(path)}`), entry?.status ? get(`/api/diff?path=${encodeURIComponent(path)}`) : Promise.resolve(null)]);
      if (mounted !== m || selected !== path) return;
      file = f;
      diff = d;
      paint();
    }

    function treeHtml() {
      const shown = filter === "changed" ? changed() : files;
      /** @type {Map<string, { dirs: Set<string>, files: typeof files }>} */
      const byDir = new Map();
      const node = (/** @type {string} */ d) => byDir.get(d) ?? (byDir.set(d, { dirs: new Set(), files: [] }), /** @type {any} */ (byDir.get(d)));
      for (const f of shown) {
        const ps = parents(f.path);
        ps.forEach((p, i) => node(i ? ps[i - 1] : "").dirs.add(p));
        node(ps.at(-1) ?? "").files.push(f);
      }
      const dirty = new Set(changed().flatMap((f) => parents(f.path)));
      /** @param {string} d @param {number} depth @returns {string} */
      const walk = (d, depth) => {
        const n = byDir.get(d);
        if (!n) return "";
        const pad = `style="padding-left:${8 + depth * 13}px"`;
        const dirs = [...n.dirs].sort().map((p) => {
          const open = filter === "changed" || openDirs.has(p);
          return `<li class="dir" ${pad}><button class="fvrow" data-fv-dir="${esc(p)}" aria-expanded="${open}">${open ? "▾" : "▸"} <span class="nm">${esc(p.split("/").pop())}/</span>${dirty.has(p) ? `<span class="mk" title="changes inside"></span>` : ""}</button></li>${open ? walk(p, depth + 1) : ""}`;
        });
        const fs = n.files.map((f) => {
          const name = f.path.split("/").pop() ?? f.path;
          const counts = f.added !== undefined || f.removed !== undefined ? `<span class="cnt">${f.added ? `<span class="plus">+${esc(f.added)}</span>` : ""} ${f.removed ? `<span class="minus">−${esc(f.removed)}</span>` : ""}</span>` : "";
          return `<li class="${f.path === selected ? "on" : ""} ${f.status === "deleted" ? "gone" : ""}" ${pad}><button class="fvrow" data-fv-file="${esc(f.path)}" title="${esc(f.path)}${f.status ? ` · ${esc(STATUS[f.status] ?? f.status)}` : ""}">${/\.(png|jpe?g|gif|webp)$/i.test(name) ? "▣" : "·"} <span class="nm">${esc(name)}</span>${counts}${f.status ? `<span class="mk ${f.status === "untracked" || f.status === "added" ? "new" : ""}"></span>` : ""}</button></li>`;
        });
        return dirs.join("") + fs.join("");
      };
      const body = shown.length ? `<ul>${walk("", 0)}</ul>` : `<p class="muted fvempty">${filter === "changed" ? "Nothing uncommitted: every change is committed." : loaded ? "No files." : "Loading…"}</p>`;
      return `<aside class="ftree"><div class="fth"><button class="${filter === "all" ? "on" : ""}" data-fv-filter="all">All files</button><button class="${filter === "changed" ? "on" : ""}" data-fv-filter="changed">Changed · ${esc(changed().length)}</button></div>${body}</aside>`;
    }

    /** Line numbers beside highlighted text; the lines of a student region marked. @param {string} text @param {string} lang */
    function sourceHtml(text, lang) {
      const lines = highlightSource(text.replace(/\n$/, ""), lang).split("\n");
      const raw = text.split("\n");
      let inRegion = false;
      return `<pre class="src">${lines
        .map((l, i) => {
          if (/@student\b/.test(raw[i] ?? "")) inRegion = true;
          const row = `<span class="${inRegion ? "rg" : ""}"><span class="ln">${i + 1}</span>${l || " "}</span>`;
          if (/@end\b/.test(raw[i] ?? "")) inRegion = false;
          return row;
        })
        .join("")}</pre>`;
    }
    /** @param {string} lang */
    /** The file's uncommitted changes, unified: old and new line numbers, a sign, the line. @param {string} lang */
    function diffHtml(lang) {
      const hl = (/** @type {string} */ t) => highlightSource(t, lang) || " ";
      if (diff?.error) return `<p class="muted fvempty">${esc(diff.error)}</p>`;
      if (!diff?.hunks?.length) return `<p class="muted fvempty">No uncommitted changes in this file.</p>`;
      return `<pre class="src diff">${diff.hunks
        .map((/** @type {any} */ h) => `<span class="hunk"><span class="ln"></span><span class="ln"></span><span class="sg"></span>${esc(h.header)}</span>${h.lines.map((/** @type {any} */ x) => `<span class="${x.kind}"><span class="ln">${esc(x.old ?? "")}</span><span class="ln">${esc(x.new ?? "")}</span><span class="sg">${x.kind === "add" ? "+" : x.kind === "del" ? "−" : ""}</span>${hl(x.text)}</span>`).join("")}`)
        .join("")}</pre>`;
    }

    function viewerHtml(wide) {
      if (!selected) return `<div class="fview"><p class="muted fvempty">Pick a file on the left. Files with uncommitted changes have a yellow dot.</p></div>`;
      const entry = files.find((f) => f.path === selected);
      const lang = file?.lang ?? diff?.lang ?? "text";
      const hasDiff = Boolean(entry?.status);
      const showing = entry?.status === "deleted" ? "diff" : hasDiff ? mode || "diff" : "file";
      const seg = (/** @type {string} */ attr, /** @type {[string, string][]} */ opts, /** @type {string} */ on) => `<span class="mseg">${opts.map(([v, label]) => `<button class="${v === on ? "on" : ""}" ${attr}="${v}">${label}</button>`).join("")}</span>`;
      // A new file git doesn't track has no line counts in the tree: its diff is all added lines.
      if (entry?.status === "untracked" && entry.added === undefined && diff?.hunks) entry.added = diff.hunks.reduce((/** @type {number} */ n, /** @type {any} */ h) => n + h.lines.length, 0);
      const counts = entry && (entry.added || entry.removed) ? `${entry.added ? `<span class="plus">+${esc(entry.added)}</span>` : ""}${entry.removed ? `<span class="minus">−${esc(entry.removed)}</span>` : ""}` : "";
      const lines = typeof file?.text === "string" ? file.text.replace(/\n$/, "").split("\n").length : 0;
      const editable = /\.(tsx?|asm)$/.test(selected) && /@student\b/.test(file?.text ?? "");
      let tools = `${counts}${entry?.status ? `<span class="pill now">${esc(STATUS[entry.status] ?? entry.status)}</span>` : ""}<span class="sp"></span>`;
      if (showing === "file") tools = `<span class="ro">${esc(LANGS[lang] ?? "Text")}${lines ? ` · ${esc(lines)} line${lines === 1 ? "" : "s"}` : ""}${editable ? " · your regions are marked" : " · read only"}</span>${tools}`;
      if (hasDiff && entry?.status !== "deleted") tools += seg("data-fv-mode", [["diff", "Diff"], ["file", "File"]], showing);
      if (showing === "file" && lang === "md" && typeof file?.text === "string") tools += seg("data-fv-md", [["rendered", "Rendered"], ["source", "Source"]], mdMode);
      if (showing === "file" && editable) tools += `<button class="btn sm ghost" data-do="tab" data-tab="code">✎ Edit in the Code tab</button>`;
      let body;
      if (showing === "diff") body = diffHtml(lang);
      else if (!file) body = `<p class="muted fvempty">Loading…</p>`;
      else if (file.error) body = `<p class="muted fvempty">${esc(file.error)}</p>`;
      else if (lang === "image") body = `<div class="imgview"><img src="/api/file/image?path=${encodeURIComponent(selected)}" alt="${esc(selected)}"></div>`;
      else if (lang === "md" && mdMode === "rendered") body = `<div class="mdview md">${chatMarkdown((file.text ?? "").replace(/<!--[\s\S]*?(?:-->|$)/g, ""))}</div>`; // the guide's marks are for the studio
      else body = sourceHtml(file.text ?? "", lang);
      // The step's change, green: commit it from here.
      const step = stepNow();
      const r = step ? snap?.code?.[step.id] : null;
      const green = showing === "diff" && step && step.file === selected && r?.phase === "passed" && r.rev === step.rev && !r.done;
      const foot = green ? `<div class="fvfoot">✓ Step ${esc(step.n)} is green${wide ? `<span class="sub">· the change you commit</span>` : ""}<button class="btn primary sm" data-build-commit="${esc(step.id)}" data-w="${esc(step.week)}">✓ Commit it</button></div>` : "";
      return `<div class="fview"><div class="fvh"><span class="path">${esc(selected)}</span>${tools}</div><div class="fvb">${body}</div>${foot}</div>`;
    }

    function paint() {
      if (!mounted) return;
      const wide = mounted.el.clientWidth >= 760;
      const html = `<div class="fv ${wide ? "wide" : "narrow"}">${treeHtml()}${viewerHtml(wide)}</div>`;
      if (mounted.el.dataset.html === html) return;
      // Keep where the reader was scrolled to in the file.
      const was = /** @type {HTMLElement | null} */ (mounted.el.querySelector(".fvb"));
      const top = was?.scrollTop ?? 0;
      const tree = /** @type {HTMLElement | null} */ (mounted.el.querySelector(".ftree ul"));
      const treeTop = tree?.scrollTop ?? 0;
      mounted.el.innerHTML = html;
      mounted.el.dataset.html = html;
      const now = /** @type {HTMLElement | null} */ (mounted.el.querySelector(".fvb"));
      const at = `${selected}|${mode}|${mdMode}`;
      if (now && mounted.el.dataset.at === at) now.scrollTop = top;
      const treeNow = /** @type {HTMLElement | null} */ (mounted.el.querySelector(".ftree ul"));
      if (treeNow) treeNow.scrollTop = treeTop;
      mounted.el.dataset.at = `${selected}|${mode}|${mdMode}`;
    }

    document.addEventListener("click", (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest("[data-fv-file],[data-fv-dir],[data-fv-filter],[data-fv-mode],[data-fv-md],[data-open-file]");
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.openFile) {
        // A path in the chat: the Files tab, on that file.
        const ui = /** @type {HTMLElement | null} */ (document.querySelector("[data-chatui]"));
        if (ui) ui.dataset.panel = "files";
        open(el.dataset.openFile);
        return;
      }
      if (!mounted || !mounted.el.contains(el)) return;
      if (el.dataset.fvFile) open(el.dataset.fvFile);
      else if (el.dataset.fvDir) {
        if (openDirs.has(el.dataset.fvDir)) openDirs.delete(el.dataset.fvDir);
        else openDirs.add(el.dataset.fvDir);
        paint();
      } else if (el.dataset.fvFilter) {
        filter = el.dataset.fvFilter;
        paint();
      } else if (el.dataset.fvMode) {
        mode = el.dataset.fvMode;
        paint();
      } else if (el.dataset.fvMd) {
        mdMode = el.dataset.fvMd;
        paint();
      }
    });
    /** @param {string} path */
    function open(path) {
      if (selected !== path) {
        selected = path;
        file = null;
        diff = null;
        mode = "";
        for (const d of parents(path)) openDirs.add(d);
      }
      paint();
      void (files.some((f) => f.path === path) ? load(path) : refresh());
    }
    // Split or unified follows the panel's width as it's dragged.
    const resized = new ResizeObserver(() => paint());

    return {
      /** After each render: mount the viewer when its pane is on the page. @param {() => any} step  the Build view's current step */
      sync(step) {
        stepNow = step;
        const el = /** @type {HTMLElement | null} */ (document.querySelector("[data-bfiles]"));
        if (!el) {
          if (mounted) resized.disconnect();
          mounted = null;
          return;
        }
        if (mounted?.el === el) return paint();
        mounted = { el };
        el.dataset.html = "";
        resized.disconnect();
        resized.observe(el);
        void refresh();
      },
      /** The folder may have changed (an agent turn ended, a commit, a save): read it again. */
      refresh: () => void refresh(),
    };
  })();

  const agentTab = (() => {
    /** @type {any} */
    let state = null;
    let draft = "";
    let selected = "";
    /** @type {{ week: number, el: HTMLElement, tasks: { id: string, week: number, description: string }[] } | null} */
    let mounted = null;
    let focusBox = false;
    let chatPanel = "viz"; // the right panel's tab in the Build view
    let scrolledFor = ""; // the step the chat column last scrolled to
    let followCard = true; // the chat stays on the step card until the student scrolls it
    let actedOn = ""; // the step the student last committed or tested in the Build view
    /** @type {Set<any>} entries with deltas waiting for the next frame */
    const dirty = new Set();
    let painting = false;
    const clientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const md = (/** @type {string} */ text) => esc(text).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");

    /** @param {any} e */
    function entryHtml(e) {
      if (e.kind === "user") return `<div class="ag you" data-entry="${esc(e.id)}"><div class="who">You</div><div class="said">${md(e.text)}</div></div>`;
      if (e.kind === "agent") return `<div class="ag bot" data-entry="${esc(e.id)}"><div class="who">Codex</div><div class="said md" data-field="text">${chatMarkdown(e.text)}</div></div>`;
      if (e.kind === "note") return `<div class="ag note ${esc(e.tone)}" data-entry="${esc(e.id)}">${md(e.text)}${e.commit ? `<div class="row"><button class="btn primary" data-agent-commit="${esc(e.commit.id)}" data-w="${esc(e.commit.week)}">Commit it</button></div>` : ""}${e.runTests ? `<div class="row"><button class="btn primary" data-agent-test="${esc(e.runTests.id)}" data-w="${esc(e.runTests.week)}">Run its tests</button></div>` : ""}</div>`;
      if (e.kind === "command") {
        const status = e.status === "completed" ? (e.exitCode ? `exit ${esc(e.exitCode)}` : "done") : e.status === "inProgress" ? "running…" : esc(e.status);
        return `<details class="ag ran" data-entry="${esc(e.id)}"><summary><span class="what">Ran</span> <code>${esc(plainCommand(e.command))}</code> <em>${status}</em></summary><pre class="log" data-field="output">${esc(e.output)}</pre></details>`;
      }
      if (e.kind === "file") {
        const list = (e.changes ?? []).map((/** @type {any} */ c) => `<div><button class="linkbtn mono" data-open-file="${esc(c.path)}" title="Open it in the Files tab">${esc(c.path)}</button>${c.movePath ? ` moves to <code>${esc(c.movePath)}</code>` : ""} <em>${esc(c.kind)}</em></div>`).join("");
        const diffs = (e.changes ?? []).map((/** @type {any} */ c) => c.diff).filter(Boolean).join("\n");
        return `<details class="ag ran" data-entry="${esc(e.id)}"><summary><span class="what">${e.status === "declined" ? "Declined change" : e.status === "failed" ? "Failed change" : "Changed"}</span> ${list || "files"}</summary>${diffs ? `<pre class="log">${esc(diffs)}</pre>` : ""}</details>`;
      }
      return "";
    }

    /** @param {any} c */
    function cardHtml(c) {
      const what = c.kind === "command" ? `<b>Codex wants to run this:</b><pre class="log">${esc(plainCommand(c.command))}</pre>${c.cwd ? `<div class="sub">in <code>${esc(c.cwd)}</code></div>` : ""}` : `<b>Codex wants to change files${c.grantRoot ? ` under ${esc(c.grantRoot)}` : ""}:</b>${(c.changes ?? []).map((/** @type {any} */ f) => `<div><code>${esc(f.path)}</code>${f.movePath ? ` moves to <code>${esc(f.movePath)}</code>` : ""} <em>${esc(f.kind)}</em></div>`).join("")}${(c.changes ?? []).some((/** @type {any} */ f) => f.diff) ? `<pre class="log">${esc(c.changes.map((/** @type {any} */ f) => f.diff).join("\n"))}</pre>` : ""}`;
      return `<div class="status wait agcard"><span class="icon">?</span><div>${what}${c.reason ? `<div class="sub">Why: ${esc(c.reason)}</div>` : ""}<div class="row"><button class="btn primary" data-agent-answer="accept" data-key="${esc(c.key)}">Approve</button><button class="btn" data-agent-answer="decline" data-key="${esc(c.key)}">Decline</button></div></div></div>`;
    }

    /** What's wrong, and the fix right here. */
    function statusHtml() {
      const s = state;
      if (!s || s.phase === "off" || s.phase === "starting") return `<div class="status run"><i class="spin"></i><div><b>Starting Codex…</b><div class="sub">The first time on a Mac, macOS checks it first: this can take a few minutes.</div></div></div>`;
      if (s.phase === "missing" || s.phase === "too-old") {
        const running = s.fix?.phase === "running";
        return `<div class="status bad"><span class="icon">!</span><div><b>${esc(s.problem)}</b><div class="sub">Type this to ${s.phase === "missing" ? "install it" : "update it"}, then the studio checks again.</div></div></div>
          <form class="agfix" data-agent-fix><div class="cmd doneline"><span class="p">$</span>${esc(s.fixCommand)}</div><button class="btn primary" type="submit" ${running ? "disabled" : ""}>${running ? "Running…" : "Run it"}</button></form>
          ${s.fix?.out ? `<pre class="log">${esc(s.fix.out)}</pre>` : ""}`;
      }
      if (s.phase === "signed-out") return `<div class="status bad"><span class="icon">!</span><div><b>Codex isn't signed in.</b>${s.problem ? `<div class="sub">${esc(s.problem)}</div>` : ""}<div class="sub">It signs in with your ChatGPT account, in your browser. The studio never sees your password or token.</div></div></div><div class="row"><button class="btn primary" data-agent-login>Sign in to Codex</button></div>`;
      if (s.phase === "signing-in") return `<div class="status wait"><i class="spin"></i><div><b>Finish signing in in your browser.</b><div class="sub"><a href="${esc(s.loginUrl)}" target="_blank" rel="noopener noreferrer">Open the sign-in page</a>. This page carries on by itself once it's done.</div></div></div>`;
      if (s.phase === "ready" && s.account?.type === "chatgpt" && s.account.planType === "free")
        return `<div class="status bad"><span class="icon">!</span><div><b>Your ChatGPT account${s.account.email ? ` (${esc(s.account.email)})` : ""} is on the Free plan.</b><div class="sub">Free includes Codex only for quick tasks, so you'll most likely reach its limit partway through a step. The course uses ChatGPT Plus: upgrade to Plus at <a href="https://chatgpt.com/#pricing" target="_blank" rel="noopener noreferrer">chatgpt.com</a> with this account, then press Check again. You can still send messages below until then. Signed in with the wrong account? Run <code>codex logout</code> in a terminal, then start the studio again.</div></div></div><div class="row"><button class="btn primary" data-agent-recheck>Check again</button></div>`;
      if (s.phase === "failed") return `<div class="status bad"><span class="icon">!</span><div><b>${esc(s.problem || "Codex stopped.")}</b></div></div><div class="row"><button class="btn primary" data-agent-open>Start Codex again</button></div>`;
      if (s.phase === "unavailable") return `<div class="status bad"><span class="icon">!</span><div><b>${esc(s.problem)}</b></div></div>`;
      return "";
    }

    /** The part that changes with the state (not the composer, so typing isn't disturbed). */
    function paintState() {
      if (!mounted) return;
      const s = state;
      const top = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-status]"));
      const cards = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-cards]"));
      const focusedFix = document.activeElement instanceof HTMLInputElement && document.activeElement.name === "agentfix";
      const html = statusHtml();
      if (top.dataset.html !== html) {
        top.innerHTML = html;
        top.dataset.html = html;
        if (focusedFix) /** @type {HTMLElement | null} */ (top.querySelector("input"))?.focus();
      }
      const cardsHtml = (s?.cards ?? []).map(cardHtml).join("");
      if (cards.dataset.html !== cardsHtml) {
        cards.innerHTML = cardsHtml;
        cards.dataset.html = cardsHtml;
        if (cardsHtml) cards.scrollIntoView({ block: "nearest" });
      }
      const ready = s?.phase === "ready";
      const busy = Boolean(s?.turn);
      const composer = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-composer]"));
      // In a build week the walkthrough leads; the free-form box opens from its link.
      composer.hidden = !ready;
      /** @type {HTMLButtonElement} */ (mounted.el.querySelector("[data-agent-send]")).disabled = busy;
      const stop = /** @type {HTMLButtonElement} */ (mounted.el.querySelector("[data-agent-stop]"));
      stop.hidden = !busy;
      stop.disabled = s?.turn?.status === "stopping";
      stop.textContent = s?.turn?.status === "stopping" ? "Stopping…" : "Stop";
      const line = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-working]"));
      line.hidden = !busy;
      const who = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-who]"));
      who.textContent = ready ? `Codex ${s.version}${s.account?.email ? ` · ${s.account.email}` : ""}` : "";
      /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-perms]")).textContent = s?.permissions ?? "";
    }

    /** @param {any} entry */
    function paintEntry(entry) {
      const log = mounted?.el.querySelector("[data-agent-log]");
      if (!log) return;
      const html = entryHtml(entry);
      const old = log.querySelector(`[data-entry="${CSS.escape(entry.id)}"]`);
      if (!html) return;
      const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      if (old) {
        const open = old instanceof HTMLDetailsElement && old.open;
        old.outerHTML = html;
        if (open) log.querySelector(`[data-entry="${CSS.escape(entry.id)}"]`)?.setAttribute("open", "");
      } else log.insertAdjacentHTML("beforeend", html);
      if (nearEnd) log.scrollTop = log.scrollHeight;
    }

    function paintAll() {
      if (!mounted || !state) return;
      const log = /** @type {HTMLElement} */ (mounted.el.querySelector("[data-agent-log]"));
      log.innerHTML = (state.entries ?? []).map(entryHtml).join("");
      log.scrollTop = log.scrollHeight;
      paintState();
    }

    async function refetch() {
      try {
        const res = await fetch("/api/agent", { headers: { "x-studio-token": TOKEN } });
        if (res.ok) {
          state = await res.json();
          paintAll();
        }
      } catch {
        // the next event tries again
      }
    }

    /** One message from the studio's event stream. @param {any} e */
    function onEvent(e) {
      if (e.type === "snapshot") {
        state = e.snapshot;
        return paintAll();
      }
      if (!state) return;
      if (e.seq <= state.seq) return;
      if (e.seq !== state.seq + 1) return void refetch();
      state.seq = e.seq;
      if (e.type === "state") {
        const entries = state.entries;
        const wasWorking = Boolean(state.turn);
        state = { ...e.state, entries, seq: e.seq };
        paintState();
        if (wasWorking && !state.turn) {
          codeTab.refresh(); // the agent may have changed the file
          if (mounted) void loadBuild(mounted);
        }
        paintBuild();
      } else if (e.type === "entry") {
        const at = state.entries.findIndex((/** @type {any} */ x) => x.id === e.entry.id);
        if (at >= 0) state.entries[at] = e.entry;
        else state.entries.push(e.entry);
        paintEntry(e.entry);
      } else if (e.type === "delta") {
        const entry = state.entries.find((/** @type {any} */ x) => x.id === e.id);
        if (!entry) return;
        // Bounded, and drawn at most once a frame: a noisy command can't freeze the page (or Stop).
        entry[e.field] = `${entry[e.field] ?? ""}${e.text}`.slice(e.field === "output" ? -20000 : -200000);
        dirty.add(entry);
        if (!painting) {
          painting = true;
          requestAnimationFrame(() => {
            painting = false;
            for (const x of dirty) paintEntry(x);
            dirty.clear();
          });
        }
      }
    }

    // ── The Build list: the week's steps, one at a time (concept, one-click prompt, its result, Commit) ──
    /** @type {any[]} */
    let buildList = [];
    // Done: committed as it is, or its tests pass with nothing left to commit.
    const stepDone = (/** @type {any} */ st) => {
      const r = snap?.code?.[st.id];
      // (Its tests can pass with the region still the stub: the code went in elsewhere in the file.)
      return st.committed || Boolean(r?.done) || Boolean(r?.phase === "passed" && r.passed > 0 && r.rev === st.rev && !st.dirty);
    };
    /** @param {{ week: number, el: HTMLElement }} m */
    async function loadBuild(m) {
      const res = await fetch(`/api/build?week=${m.week}`, { headers: { "x-studio-token": TOKEN } }).then((r) => r.json()).catch(() => null);
      if (mounted !== m) return;
      buildList = res?.steps ?? [];
      filesTab.refresh(); // the folder may have changed with it
      paintBuild();
      // Steps already green (written another way, or in one go with an earlier one) are skipped.
      void act({ type: "build-check", week: m.week });
    }
    function currentBuildStep() {
      return buildList.find((st) => !stepDone(st)) ?? null;
    }
    /** The components, in order, each with its steps. */
    function components() {
      /** @type {{ c: any, steps: any[] }[]} */
      const out = [];
      for (const st of buildList) {
        const last = out[out.length - 1];
        if (last && last.c.id === st.component.id) last.steps.push(st);
        else out.push({ c: st.component, steps: [st] });
      }
      return out;
    }
    /** Finish screens already seen, on this laptop: the walkthrough then goes on to the next component. */
    const seenKey = (/** @type {string} */ id) => `netsim-built:${mounted?.week}:${id}`;
    const seen = (/** @type {string} */ id) => {
      try {
        return localStorage.getItem(seenKey(id)) === "1";
      } catch {
        return true;
      }
    };
    /** The result line for a step: from the studio's own test run of its task. @param {any} st */
    function buildResult(st) {
      const r = snap?.code?.[st.id];
      if (stepDone(st)) return `<div class="status ok"><span class="icon">✓</span><div><b>Done and committed.</b></div></div>`;
      if (!r && !st.stubbed && st.testNote) return `<p class="muted">Written. No test checks this one yet: read the change, then</p><div class="row"><button class="btn primary" data-build-commit="${esc(st.id)}" data-w="${esc(st.week)}">Commit it</button></div>`;
      if (!r) return st.stubbed ? `<p class="muted">Press Send to the agent. Read what Codex changes; the studio checks it when Codex finishes.</p>` : `<p class="muted">Written, not checked yet: press Run its tests.</p>`;
      if (r.phase === "running") return `<div class="status run"><i class="spin"></i><div><b>Checking ${esc(st.id)}…</b></div></div>`;
      if (r.phase === "error") return `<div class="status bad"><span class="icon">!</span><div><b>The tests couldn't run.</b></div></div>`;
      if (r.phase === "failed") return `<div class="status bad"><span class="icon">!</span><div><b>${esc(r.failed)} of its tests fail.</b><div class="sub">${esc(r.failures?.[0]?.test ?? "")}: ${esc(String(r.failures?.[0]?.message ?? "").split("\n")[0])}</div><div class="sub">Tell Codex what you see (Ask the agent something else, below), or press Run its tests after a change.</div></div></div>`;
      const todo = r.waiting?.length ? ` Waiting on: ${r.waiting.join(", ")}.` : "";
      return `<div class="status ok"><span class="icon">✓</span><div><b>${r.passed ? `${esc(r.passed)} test${r.passed === 1 ? "" : "s"} pass.` : "Nothing fails."}</b>${todo ? `<div class="sub">${esc(todo)}</div>` : ""}</div></div>
        <div class="row"><button class="btn primary" data-build-commit="${esc(st.id)}" data-w="${esc(st.week)}">Commit it</button><span class="muted">It commits the whole file.</span></div>`;
    }
    /** Its tests pass as the code is now (left to commit, if it isn't done): no Send. @param {any} st */
    const greenNow = (st) => snap?.code?.[st.id]?.phase === "passed" && snap.code[st.id].rev === st.rev;
    /** @param {any} st */
    function stepCard(st) {
      return `<section class="bcard">
          <p class="eyebrow">Step ${esc(st.n)} · ${esc(String(st.id).toUpperCase())}${st.week !== mounted?.week ? ` · from week ${esc(st.week)}` : ""} · <code>${esc(st.id)}</code>${st.file ? ` in <code>${esc(st.file)}</code>` : ""}</p>
          <h2>${esc(st.title || st.id)}</h2>
          ${st.concept ? `<p class="lesson">${esc(st.concept).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")}</p>` : ""}
          ${st.prompt ? `<details class="bprompt"><summary>What it sends to the agent</summary><pre>${esc(st.prompt)}</pre></details>` : ""}
          <div class="row">${st.prompt && st.found && !stepDone(st) && !greenNow(st) ? `<button class="btn primary" data-build-send="${esc(buildList.indexOf(st))}" ${state?.phase !== "ready" || state?.turn ? "disabled" : ""}>Send to the agent</button>` : ""}${st.found && !stepDone(st) ? `<button class="btn" data-build-test="${esc(st.id)}" data-w="${esc(st.week)}">Run its tests</button>` : ""}</div>
          ${st.found ? buildResult(st) : `<p class="muted">This step's code isn't in your folder yet.</p>`}
          ${st.stuck ? `<p class="${snap?.code?.[st.id]?.phase === "failed" ? "stuck bad" : "muted"}"><b>Stuck?</b> ${esc(st.stuck).replace(/`([^`\n]+)`/g, "<code>$1</code>")}</p>${snap?.code?.[st.id]?.phase === "failed" ? `<div class="row"><button class="btn" data-build-hint="${esc(buildList.indexOf(st))}" ${state?.phase !== "ready" || state?.turn ? "disabled" : ""}>➤ Send this hint</button></div>` : ""}` : ""}
          ${st.found && st.file ? `<div class="bchips"><button class="chip" data-open-file="${esc(st.file)}" title="Open it in the Files tab">✎ ${esc(st.file)}</button></div>` : ""}
          ${st.ask ? `<p class="muted"><b>Ask yourself:</b> ${esc(st.ask).replace(/`([^`\n]+)`/g, "<code>$1</code>")}</p>` : ""}
        </section>`;
    }
    function paintBuild() {
      const box = /** @type {HTMLElement | null} */ (mounted?.el.querySelector("[data-build]") ?? null);
      if (!box || !buildList.length) return;
      const all = components();
      // The component being built: the first with a step left, unless the student just finished one here
      // (committed or tested its last step in this view) and hasn't seen its finish screen yet. A part
      // finished earlier, or found green by the studio's own check, opens straight on the next step.
      const finished = all.find((x) => x.c.id && x.steps.every(stepDone) && !seen(x.c.id) && x.steps.some((y) => y.id === actedOn));
      const building = all.find((x) => x.steps.some((st) => !stepDone(st)));
      const now = finished ?? building ?? all[all.length - 1];
      const st = finished ? null : currentBuildStep();
      // The free-form box works on the current step's task too.
      if (st && selected !== st.id) selected = st.id;
      const done = now.steps.filter(stepDone).length;
      const pct = Math.round((done / now.steps.length) * 100);
      const others = all.map((x) => `<span class="bcomp ${x === now ? "now" : x.steps.every(stepDone) ? "done" : "locked"}">${x.steps.every(stepDone) ? "✓ " : ""}${esc(x.c.title || "This week's build")}</span>`).join("");
      const rows = now.steps
        .map((x) => `<div class="bstep ${stepDone(x) ? "done" : x === st ? "now" : "locked"}"><span class="n">${stepDone(x) ? "✓" : x === st ? "▸" : "🔒"}</span>${esc(x.title || x.id)}</div>`)
        .join("");
      const head = `<div class="bhead"><div class="bcomps">${others}</div>
        <h1 class="q">${esc(now.c.title || "This week's build")}</h1>
        ${now.c.intro ? `<p class="lesson">${esc(now.c.intro)}</p>` : ""}
        ${now.c.works ? `<p class="muted"><b>When it works:</b> ${esc(now.c.works).replace(/`([^`\n]+)`/g, "<code>$1</code>")}</p>` : ""}
        <div class="bbar" role="progressbar" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        <div class="bprogress">${esc(done)} of ${esc(now.steps.length)} steps</div></div>`;
      let card;
      if (finished) {
        const next = all[all.indexOf(finished) + 1];
        card = `<section class="bcard bfinish"><h2>✓ ${esc(finished.c.title)} works.</h2>
          ${finished.c.works ? `<p class="lesson">${esc(finished.c.works)}</p>` : ""}
          <div class="row">${finished.steps[0]?.found ? `<button class="btn" data-build-test="${esc(finished.steps[finished.steps.length - 1].id)}" data-w="${esc(finished.steps[finished.steps.length - 1].week)}">Run its tests again</button>` : ""}${finished.c.board ? `<button class="btn" data-do="tab" data-tab="board">See it on the board</button>` : ""}<button class="btn primary" data-build-seen="${esc(finished.c.id)}">${next ? `Next: ${esc(next.c.title || "the next part")}` : "Done"}</button></div></section>`;
      } else if (!st) card = `<section class="bcard bfinish"><h2>✓ Everything this week is built.</h2><p class="lesson">Push your work with <code>git push</code> (or run npm start again: it pushes for you).</p></section>`;
      else card = `${now.steps.filter(stepDone).map((x) => `<p class="bdoneline">✓ ${esc(x.title || x.id)}, done</p>`).join("")}${stepCard(st)}`;
      const notes = /** @type {HTMLElement | null} */ (document.querySelector("[data-bnotes]"));
      // Notes HTML is rendered by the studio from the student's own guide (escaped markdown).
      const notesHtml = now.c.notes || `<p class="muted">No notes for this part.</p>`;
      if (notes && notes.dataset.html !== notesHtml) {
        notes.innerHTML = notesHtml;
        notes.dataset.html = notesHtml;
      }
      const ui = /** @type {HTMLElement | null} */ (document.querySelector("[data-chatui]"));
      if (ui) {
        const ci = all.indexOf(now);
        const totalDone = buildList.filter(stepDone).length;
        const set = (/** @type {string} */ sel, /** @type {string} */ text) => {
          const x = /** @type {HTMLElement | null} */ (ui.querySelector(sel));
          if (x && x.textContent !== text) x.textContent = text;
        };
        set("[data-ctitle]", now.c.title || "This week's build");
        set("[data-csub]", ` · Component ${ci + 1} of ${all.length}${st ? ` · step ${now.steps.indexOf(st) + 1} of ${now.steps.length}` : ""}`);
        set("[data-cpct]", `${pct}% of steps done · ${totalDone} of ${buildList.length}`);
        const bar = /** @type {HTMLElement | null} */ (ui.querySelector("[data-cbar]"));
        if (bar) bar.style.width = `${pct}%`;
        set('[data-ccount="steps"]', ` (${buildList.length})`);
        const list = /** @type {HTMLElement | null} */ (ui.querySelector("[data-bsteplist]"));
        const listHtml = all
          .map((x) => `<h4>${esc(x.c.title || "This week's build")}</h4>${x.steps.map((y) => `<div class="crow ${stepDone(y) ? "done" : y === st ? "now" : "locked"}"><span>${stepDone(y) ? "✓" : y === st ? "▸" : "🔒"}</span><div><b>${esc(y.n)}. ${esc(y.title || y.id)}</b><div class="muted">${esc(y.test || y.testNote || "")}</div></div></div>`).join("")}`)
          .join("");
        if (list && list.dataset.html !== listHtml) {
          list.innerHTML = listHtml;
          list.dataset.html = listHtml;
        }
        ui.dataset.panel ||= chatPanel;
      }
      const html = ui ? `<div class="build guide">${card}</div>` : `<div class="build">${head}<div class="bsteps">${rows}</div>${card}</div>`;
      if (box.dataset.html !== html) {
        box.innerHTML = html;
        box.dataset.html = html;
      }
      // The chat opens on the current step card, and moves to the next one when the step changes.
      const at = `${mounted?.week}|${finished ? `finished:${finished.c.id}` : (st?.id ?? "all")}`;
      if (scrolledFor !== at) {
        scrolledFor = at;
        followCard = true;
      }
      toCard();
    }
    /** Keep the step card in view as the chat above it loads and grows, until the student scrolls the chat themselves. */
    function toCard() {
      const scroller = /** @type {HTMLElement | null} */ (mounted?.el.querySelector("[data-agscroll]") ?? null);
      const cardEl = scroller?.querySelector("[data-build] .bcard");
      if (!scroller || !cardEl || !followCard) return;
      scroller.scrollTop += cardEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    }

    /** @param {number} week @param {HTMLElement} el */
    async function mount(week, el) {
      buildList = [];
      mounted = { week, el, tasks: [] };
      const mine = mounted;
      const chat = week >= 4;
      el.innerHTML = `${chat ? `<div class="agscroll" data-agscroll>` : `<div data-build></div>`}<div class="agbar"><span class="muted" data-agent-who></span></div>
        <p class="agperms" data-agent-perms></p>
        <div data-agent-status></div>
        <div class="aglog" data-agent-log></div>
        <div data-agent-cards></div>
        <div class="agworking muted" data-agent-working hidden><i class="spin"></i> Codex is working…</div>
        ${chat ? `<div data-build></div></div>` : ""}
        <form class="agcomposer${chat ? " pinned" : ""}" data-agent-composer hidden>
          <label class="sub" ${week >= 4 ? "hidden" : ""}>Working on <select name="agenttask" data-agent-task><option value="">no particular task</option></select></label>
          <textarea name="agentmessage" rows="${week >= 4 ? 2 : 4}" placeholder="${week >= 4 ? "Ask the agent about this step…" : "Say how you want to approach it, then what you'd like Codex to do."}" spellcheck="true">${esc(draft)}</textarea>
          <div class="row"><button class="btn primary" type="submit" data-agent-send>Send <kbd>⌘↵</kbd></button><button class="btn" type="button" data-agent-stop hidden>Stop</button></div>
          ${week >= 4 ? `<p class="cdisclaim">The agent can make mistakes. Check its work with the tests.</p>` : ""}
        </form>`;
      const scroller = /** @type {HTMLElement | null} */ (el.querySelector("[data-agscroll]"));
      if (scroller) {
        // The student's own scroll (wheel, touch, keys, the scrollbar) stops the follow until the step changes.
        for (const ev of ["wheel", "touchmove", "keydown", "mousedown"]) scroller.addEventListener(ev, () => (followCard = false), { passive: true });
        const grow = new ResizeObserver(() => toCard());
        for (const child of scroller.children) grow.observe(child);
        grow.observe(scroller);
      }
      paintAll();
      paintState();
      void act({ type: "agent-open" });
      if (week >= 4) void loadBuild(mine);
      const res = await fetch(`/api/agent/tasks?week=${week}`, { headers: { "x-studio-token": TOKEN } }).then((r) => r.json()).catch(() => null);
      if (mounted !== mine) return;
      mine.tasks = res?.tasks ?? [];
      const select = /** @type {HTMLSelectElement} */ (el.querySelector("[data-agent-task]"));
      select.innerHTML = `<option value="">no particular task</option>${mine.tasks.map((t) => `<option value="${esc(t.id)}">${t.week === week ? "" : `week ${esc(t.week)} · `}${esc(t.id)}: ${esc(t.description)}</option>`).join("")}`;
      select.value = selected;
      // From a Code card: the box in view, with "My approach: (your words…)" selected to type over.
      if (focusBox) {
        focusBox = false;
        const box = /** @type {HTMLTextAreaElement | null} */ (el.querySelector("textarea[name=agentmessage]"));
        if (box && !box.closest("[hidden]")) {
          box.scrollIntoView({ block: "center" });
          box.focus();
          const end = box.value.indexOf("\n");
          if (/^My approach:/.test(box.value)) box.setSelectionRange("My approach: ".length, end < 0 ? box.value.length : end);
        }
      }
    }

    async function submit() {
      if (!mounted) return;
      const box = /** @type {HTMLTextAreaElement} */ (mounted.el.querySelector("textarea[name=agentmessage]"));
      const text = box.value.trim();
      if (!text) return;
      const r = await ask({ type: "agent-send", week: mounted.week, task: selected, text, clientId: clientId() });
      if (!r.ok) return toast(r.error ?? "It didn't send.");
      box.value = "";
      draft = "";
    }

    // The divider between the chat and the panel: drag to resize (remembered while the page is open).
    let chatWidth = 0;
    document.addEventListener("pointerdown", (e) => {
      const div = /** @type {HTMLElement} */ (e.target).closest?.("[data-cdiv]");
      const grid = /** @type {HTMLElement | null} */ (div?.closest("[data-cgrid]") ?? null);
      if (!div || !grid) return;
      e.preventDefault();
      const move = (/** @type {PointerEvent} */ m) => {
        const box = grid.getBoundingClientRect();
        chatWidth = Math.max(25, Math.min(75, ((m.clientX - box.left) / box.width) * 100));
        grid.style.setProperty("--chat", `${chatWidth}%`);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    document.addEventListener("submit", (e) => {
      const form = /** @type {HTMLElement} */ (e.target);
      if (form.matches?.("[data-agent-composer]")) {
        e.preventDefault();
        void submit();
      } else if (form.matches?.("[data-agent-fix]")) {
        e.preventDefault();
        void act({ type: "agent-fix", typed: state?.fixCommand ?? "" });
      }
    });
    document.addEventListener("input", (e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (el.name === "agentmessage") draft = el.value;
    });
    document.addEventListener("change", (e) => {
      const el = /** @type {HTMLSelectElement} */ (e.target);
      if (el.matches?.("[data-week-select]")) {
        const w = document.createElement("button");
        w.dataset.w = el.value;
        doAction("week", w);
        return;
      }
      if (el.name === "agenttask") selected = el.value;
    });
    document.addEventListener("keydown", (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (/** @type {HTMLTextAreaElement} */ (el).name === "agentmessage" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void submit();
      }
    });
    document.addEventListener("click", (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest("[data-cpane-tab],[data-md-copy],[data-agent-answer],[data-agent-stop],[data-agent-login],[data-agent-open],[data-agent-recheck],[data-agent-commit],[data-agent-test],[data-build-send],[data-build-hint],[data-build-test],[data-build-commit],[data-build-seen],[data-agent-more]");
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.mdCopy !== undefined) {
        const code = el.closest(".mdcode")?.querySelector("code")?.textContent ?? "";
        void navigator.clipboard?.writeText(code).then(() => toast("Copied."), () => toast("Select the code and copy it."));
        return;
      }
      if (el.dataset.agentAnswer) {
        // Off at once: a second click can't answer twice, and the studio refuses a stale card anyway.
        for (const b of el.parentElement?.querySelectorAll("button") ?? []) b.disabled = true;
        void ask({ type: "agent-answer", key: el.dataset.key, decision: el.dataset.agentAnswer }).then((r) => {
          if (!r.ok) {
            toast(r.error ?? "That didn't go through.");
            void refetch();
          }
        });
      } else if (el.dataset.agentRecheck !== undefined) {
        void act({ type: "agent-recheck" });
      } else if (el.dataset.buildHint !== undefined) {
        // The step's Stuck? line, to the agent, for the same task.
        const st = buildList[Number(el.dataset.buildHint)];
        if (!st || !mounted) return;
        /** @type {HTMLButtonElement} */ (el).disabled = true;
        void ask({ type: "agent-send", week: mounted.week, task: st.id, text: `The step's tests fail. The guide's hint: ${st.stuck}\nFix it in the same region only, then run the step's tests again.`, guided: true, clientId: clientId() }).then((/** @type {any} */ r) => r.ok || toast(r.error ?? "It didn't send."));
      } else if (el.dataset.buildSend !== undefined) {
        const st = buildList[Number(el.dataset.buildSend)];
        if (!st || !mounted) return;
        /** @type {HTMLButtonElement} */ (el).disabled = true;
        void ask({ type: "agent-send", week: mounted.week, task: st.id, text: st.prompt, guided: true, clientId: clientId() }).then((/** @type {any} */ r) => {
          if (!r.ok) toast(r.error ?? "It didn't send.");
          mounted?.el.querySelector("[data-agent-log]")?.scrollIntoView({ block: "start" });
        });
      } else if (el.dataset.buildTest) {
        actedOn = el.dataset.buildTest;
        void ask({ type: "code-test", week: Number(el.dataset.w), id: el.dataset.buildTest }).then((/** @type {any} */ r) => r.ok || toast(r.error ?? "That didn't run."));
      } else if (el.dataset.buildCommit) {
        actedOn = el.dataset.buildCommit;
        /** @type {HTMLButtonElement} */ (el).disabled = true;
        void ask({ type: "code-commit", week: Number(el.dataset.w), id: el.dataset.buildCommit }).then((/** @type {any} */ r) => {
          toast(r.ok ? (r.said ?? "Committed.") : (r.error ?? "That didn't go through."));
          if (r.ok && mounted) void loadBuild(mounted); // on to the next step
          // The board reruns with the new code.
          const frame = /** @type {HTMLIFrameElement | null} */ (document.querySelector("iframe.board"));
          if (r.ok && frame) frame.src = frame.src;
        });
      } else if (el.dataset.buildSeen) {
        try {
          localStorage.setItem(seenKey(el.dataset.buildSeen), "1");
        } catch {
          // not remembered: it shows once more next time
        }
        paintBuild();
      } else if (el.dataset.agentMore !== undefined) {
        const form = /** @type {HTMLElement | null} */ (mounted?.el.querySelector("[data-agent-composer]") ?? null);
        if (form) {
          form.dataset.open = form.dataset.open ? "" : "1";
          paintState();
          if (form.dataset.open) /** @type {HTMLElement | null} */ (form.querySelector("textarea"))?.focus();
        }
      } else if (el.dataset.cpaneTab) {
        chatPanel = el.dataset.cpaneTab;
        const ui = /** @type {HTMLElement | null} */ (document.querySelector("[data-chatui]"));
        if (ui) ui.dataset.panel = chatPanel;
      } else if (el.dataset.agentTest) {
        void ask({ type: "code-test", week: Number(el.dataset.w), id: el.dataset.agentTest, fromAgent: true }).then((/** @type {any} */ r) => r.ok || toast(r.error ?? "That didn't run."));
      } else if (el.dataset.agentCommit) {
        /** @type {HTMLButtonElement} */ (el).disabled = true;
        void ask({ type: "code-commit", week: Number(el.dataset.w), id: el.dataset.agentCommit }).then((/** @type {any} */ r) => toast(r.ok ? (r.said ?? "Committed.") : (r.error ?? "That didn't go through.")));
      } else if (el.dataset.agentStop !== undefined) void act({ type: "agent-stop" });
      else if (el.dataset.agentLogin !== undefined) void act({ type: "agent-login" });
      else if (el.dataset.agentOpen !== undefined) void act({ type: "agent-open" });
    });

    return {
      onEvent,
      /** The Build view's current step (its file, its id, its rev), or null. */
      currentStep: () => (mounted && buildList.length ? currentBuildStep() : null),
      /** After each render: mount the tab when it's shown. */
      sync() {
        const el = /** @type {HTMLElement | null} */ (document.querySelector("[data-agenttab]"));
        if (!el) {
          mounted = null;
          return;
        }
        const week = Number(el.dataset.agenttab);
          if (!mounted || mounted.el !== el || mounted.week !== week) void mount(week, el);
        else paintBuild();
        const grid = /** @type {HTMLElement | null} */ (document.querySelector("[data-cgrid]"));
        if (grid && chatWidth) grid.style.setProperty("--chat", `${chatWidth}%`);
      },
      /** The Code tab's "Send to the agent": the prompt in the box, the task selected; the student adds their approach and sends. @param {string} task @param {string} text */
      prefill(task, text) {
        selected = task;
        draft = text;
        focusBox = true;
        mounted = null;
      },
    };
  })();

  /**
   * Every week, one click away, above a week's view (the Build view hides the course list): weeks
   * that are in open their page or Build view; the rest are greyed out. The agent's conversation is
   * the studio's, so switching weeks doesn't lose it. @param {number} shown
   */
  function weekSwitcher(shown) {
    const weeks = [...(snap?.groups ?? [])].filter((x) => x.week >= 1).sort((a, b) => a.week - b.week).filter((x, i, all) => all.findIndex((y) => y.week === x.week) === i);
    const pills = weeks
      .map((x) => {
        const open = weekIsIn(x);
        const label = `Week ${x.week}`;
        const tip = `${label} · ${x.title}${x.week === snap?.home ? " (today)" : ""}`;
        return open
          ? `<button class="wpill ${x.week === shown ? "on" : ""} ${x.week === snap?.home ? "today" : ""}" data-do="week" data-w="${esc(x.week)}" title="${esc(tip)}" ${x.week === shown ? 'aria-current="page"' : ""}>${esc(label)}</button>`
          : `<button class="wpill" disabled title="${esc(`${label}: not in your work yet`)}">${esc(label)}</button>`;
      })
      .join("");
    const options = weeks.map((x) => `<option value="${esc(x.week)}" ${x.week === shown ? "selected" : ""} ${weekIsIn(x) ? "" : "disabled"}>Week ${esc(x.week)} · ${esc(x.title)}</option>`).join("");
    return `<nav class="wswitch" aria-label="Weeks"><div class="wpills">${pills}</div><select class="wselect" data-week-select aria-label="Go to a week">${options}</select></nav>`;
  }

  function weekView(g) {
    const nn = String(g.week).padStart(2, "0");
    // From week 4 the class is building: the Build tab (the agent, step by step) comes first.
    const building = g.kind !== "setup" && g.week >= 4;
    // Build weeks have no Lesson page tab: the Build view holds the concept, notes and steps, and the
    // full page opens in its own browser tab from the panel ("Full lesson").
    const tabs = [...(building ? [["agent", "Build"]] : []), ...(building ? [] : [["page", g.page ? "Lesson page" : "Guide"]]), ...(g.kind !== "setup" ? [["code", "Code"], ...(building ? [] : [["agent", "Agent"]])] : []), ...(g.note ? [["note", g.kind === "setup" ? "Your notes" : "Design note"]] : []), ["board", "Board"], ["checks", "Checks"]];
    const tab = tabs.some(([id]) => id === weekTab) ? weekTab : tabs[0][0];
    const bar = `<div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" class="tab ${id === tab ? "on" : ""}" data-do="tab" data-tab="${id}" aria-selected="${id === tab}">${esc(label)}</button>`).join("")}</div>`;
    /** @type {string} */
    let body;
    // A page in a frame: links inside it move the frame, so "Back to the lesson" (outside it) brings it home.
    const framed = (/** @type {string} */ src, /** @type {string} */ title, /** @type {string} */ label) =>
      `<div class="framebar"><button class="btn ghost" data-do="frame-back">← Back to ${esc(label)}</button></div><iframe class="doc" title="${esc(title)}" src="${esc(src)}" data-home="${esc(src)}"></iframe>`;
    if (tab === "page") body = framed(`/week/${g.week}`, `Week ${g.week} lesson page`, g.page ? "the lesson" : "the guide");
    else if (tab === "note")
      body = `<p class="sub">Your ${g.kind === "setup" ? "notes" : "design note"}, <code>${esc(g.note ?? "")}</code>. Write it in VS Code (<code>code ${esc(g.note ?? "")}</code>); open this tab again to see what you saved.</p>${framed(`/${g.note ?? ""}`, `Week ${g.week} note`, g.kind === "setup" ? "your notes" : "your note")}`;
    else if (tab === "board") body = boardPanel();
    // The tasks are drawn by codeTab (their editors outlive the page's re-renders).
    else if (tab === "code") body = `<div class="codetab" data-codetab="${esc(g.week)}"><p class="why">Loading this week's tasks…</p></div>`;
    // Drawn by agentTab, from the studio's state (its conversation outlives the page's re-renders).
    // A build week's Build tab is one screen: the guided step and the agent on the left; the board and
    // the component's design notes beside it.
    // The chat on the left, and a panel on the right (Visualizer, Design notes, Steps, Files) whose
    // tabs only show and hide its panes, so the chat never moves.
    else if (tab === "agent" && building)
      body = `<div class="chatui" data-chatui>
        <div class="ctop"><div><b data-ctitle>This week's build</b><span class="csub" data-csub></span></div><div class="cprog"><span data-cpct></span><div class="bbar"><i data-cbar style="width:0%"></i></div></div></div>
        <div class="cgrid" data-cgrid>
          <div class="ccol"><div class="agenttab" data-agenttab="${esc(g.week)}"></div></div>
          <div class="cdiv" data-cdiv title="Drag to resize"></div>
          <aside class="cpanel" data-cpanel>
            <div class="ctabs">${[["viz", "Visualizer"], ...(g.page ? [["lesson", "Lesson"]] : []), ["notes", "Design notes"], ["steps", "Steps"], ["files", "Files"]].map(([id, label]) => `<button class="ctab" data-cpane-tab="${id}">${label}<span data-ccount="${id}"></span></button>`).join("")}${g.page ? `<a class="ctab fulllesson" href="/week/${esc(g.week)}" target="_blank" rel="noopener noreferrer">Full lesson ↗</a>` : ""}</div>
            <div class="cpane" data-pane="viz">${boardPanel()}</div>
            <div class="cpane md" data-pane="notes"><div data-bnotes><p class="muted">The notes for the part you're building show here.</p></div></div>
            <div class="cpane" data-pane="steps"><div data-bsteplist></div></div>
            ${g.page ? `<div class="cpane" data-pane="lesson">${framed(`/week/${g.week}`, `Week ${g.week} lesson page`, "the lesson")}</div>` : ""}
            <div class="cpane fvpane" data-pane="files"><div class="fvhost" data-bfiles></div></div>
          </aside>
        </div></div>`;
    else if (tab === "agent") body = `<div class="agenttab" data-agenttab="${esc(g.week)}"></div>`;
    else body = checksPanel(g.week, g.kind === "setup" ? "npm run doctor" : `npx vitest run tests/week-${nn}`);
    return `${weekSwitcher(g.week)}<div class="weekhead"><p class="eyebrow">Week ${esc(g.week)}${g.kind ? ` · ${esc(g.kind)}` : ""}</p><h1 class="q">${esc(g.title)}</h1></div>${bar}<div class="tabbody">${body}</div>`;
  }

  /** The board, run by the studio: start it, watch it here, stop it (it stops with the studio too). */
  function boardPanel() {
    const b = snap?.board ?? { phase: "off", error: "", url: "" };
    if (b.phase === "on")
      return `<div class="row"><button class="btn ghost" data-do="board-stop">Stop the board</button> <a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">Open it in a new tab</a></div><iframe class="doc board" title="The board" src="${esc(b.url)}"></iframe>`;
    if (b.phase === "starting") return `<p class="why">Starting the bus, the parts and the board… The first time takes a minute.</p>`;
    const failed = b.phase === "failed" ? `<div class="status bad"><span class="icon">!</span><div><b>The board didn't start.</b><pre class="log">${esc(b.error)}</pre></div></div>` : "";
    return `${failed}<p class="why">The board shows your computer running: the bus, memory, the CPU and the devices, tick by tick. The studio starts everything it needs (what <code>npm run dev:all</code> does) and stops it when you close the studio.</p>
      <div class="row"><button class="btn primary" data-do="board-start">${b.phase === "failed" ? "Try again" : "Start the board"}</button></div>`;
  }

  /** A week's checks: run them here and read the result. @param {number} week @param {string} command */
  function checksPanel(week, command) {
    const c = snap?.checks ?? { week: 0, phase: "off", out: "" };
    const mine = c.week === week;
    const state = !mine || c.phase === "off" ? "" : c.phase === "running" ? `<p class="why">Running…</p>` : `<div class="status ${c.phase === "passed" ? "ok" : "bad"}"><span class="icon">${c.phase === "passed" ? "✓" : "!"}</span><div><b>${c.phase === "passed" ? "All checks pass." : "Some checks don't pass yet."}</b></div></div>`;
    return `<p class="why">The checks for this week: <code>${esc(command)}</code>.</p>
      <div class="row"><button class="btn primary" data-do="checks" data-w="${week}" ${mine && c.phase === "running" ? "disabled" : ""}>Run the checks</button></div>
      ${state}${mine && c.out ? `<pre class="log">${esc(c.out)}</pre>` : ""}`;
  }

  /** A week picked in the list. @param {number} week */
  function weekHomeView(week) {
    const g = snap?.groups.find((x) => x.week === week);
    return g ? weekView(g) : "";
  }

  function render() {
    if (!snap) return;
    if (snap.current !== outputFor) {
      outputFor = snap.current;
      showOutput = false;
    }
    const weekMode = snap.mode === "week";
    $("[data-crumb]").innerHTML = weekMode ? `Week ${esc(snap.week)} · <b>${snap.inWork ? "In your work" : snap.update ? "Get the update" : "Get this week's work"}</b>` : "Week 1 · <b>Setup</b>";
    document.title = weekMode ? `NetSim Studio · Get week ${snap.week}` : "NetSim Studio · Setup";
    // The list is the whole course when there are week groups; the header says so.
    $("[data-panel]").textContent = snap.groups.length ? "Your course" : weekMode ? (snap.inWork ? `Week ${snap.week}` : `Get week ${snap.week}`) : "Setup";
    const total = snap.total;
    const doneCount = snap.steps.filter((s) => s.mark !== "pending").length;
    const finished = snap.current >= total;
    $("[data-count]").textContent = total === 0 ? "" : finished ? "All done" : `${snap.current + 1} of ${total}`;
    $("[data-dry]").hidden = !snap.dryRun;
    // Nothing to do (week N isn't out yet): no steps, no progress, just the message.
    const empty = total === 0;
    /** @type {HTMLElement} */ (document.querySelector(".steps")).style.display = empty ? "none" : "";
    /** @type {HTMLElement} */ (document.querySelector(".work")).style.gridTemplateColumns = empty ? "minmax(0, 1fr)" : "";
    $("[data-progress]").textContent = `${doneCount} of ${total} done`;
    $("[data-bar]").style.width = `${total ? (doneCount / total) * 100 : 100}%`;
    $("[data-prog]").textContent = `${doneCount}/${total}`;

    const { current, view } = snap;
    $("[data-steps]").innerHTML = snap.steps
      .map((s, i) => {
        const cls = i < current ? "done" : i === current ? "now" : "wait";
        const marked = s.mark === "skipped" ? "skip" : s.mark === "done" ? "ok" : "wait";
        const st = cls === "done" ? (s.mark === "skipped" ? "skip" : "ok") : cls === "wait" ? marked : cls === "now" ? (view?.phase === "running" ? "run" : view?.phase === "failed" ? "bad" : view?.phase === "passed" ? "ok" : "now") : "wait";
        const sub = cls === "now" && !s.optional ? `<small>${esc(s.technical)}</small>` : "";
        const group = snap.groups
          .filter((g) => g.count > 0 && g.start === i)
          .map((g) => weekHeading(g))
          .join("");
        return `${group}<button class="srow ${cls} ${viewing === i ? "viewing" : ""}" data-do="view" data-n="${i}"><span class="n">${s.n}</span><span class="st ${st}"></span><span><span class="t">${esc(s.title)}${s.optional ? ' <span class="opt">optional</span>' : ""}</span>${sub}</span></button>`;
      })
      .join("") + snap.groups.filter((g) => g.count === 0).map((g) => weekHeading(g)).join("");
    // With every week in the list the current step can be far down: keep it in view when it changes.
    if (listedFor !== current) {
      listedFor = current;
      const list = document.querySelector(".steps .body");
      const row = list?.querySelector(".srow.now");
      if (list && row) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - 48;
    }

    const focused = document.activeElement instanceof HTMLInputElement && !document.activeElement.dataset.sink ? document.activeElement.name : "";
    const shown = viewing !== null && viewing !== snap.current ? viewing : null;
    const showMachine = machineOpen && shown === null;
    // node setup-week N: once N's own steps are done, its home opens (once; the list still shows what's next).
    const focusGroup = snap.focus ? snap.groups.find((g) => g.week === snap.focus) : undefined;
    if (!focusShown && focusGroup && weekIsIn(focusGroup) && snap.current >= focusGroup.start + focusGroup.count) {
      focusShown = true;
      if (!finished) viewingWeek = focusGroup.week;
    }
    const showWeek = viewingWeek !== null && shown === null && !showMachine;
    $("[data-label]").textContent = showMachine
      ? "The computer you'll build"
      : showWeek
        ? `Week ${viewingWeek}`
      : finished && shown === null
        ? weekMode ? (snap.published ? `Week ${snap.week} is in` : `Week ${snap.week}`) : "Setup complete"
        : `Step ${(shown ?? snap.current) + 1} of ${total}`;
    const phase = snap.view?.phase ?? "done";
    const tags = { ready: ["now", "your turn"], checking: ["", "checking"], running: ["", "running"], waiting: ["now", "waiting for you"], passed: ["ok", "done"], failed: ["bad", "needs a fix"], confirm: ["now", "your turn"], done: ["ok", "all done"] };
    const [tagClass, tagText] = showWeek ? ["ok", "this week"] : shown === null ? /** @type {Record<string, string[]>} */ (tags)[phase] : ["", "looking back"];
    $("[data-tag]").className = `tag ${tagClass}`;
    $("[data-tag]").textContent = tagText;
    $("[data-tag]").style.display = total === 0 ? "none" : "";
    if (showMachine) {
      // The panel no longer shows what detailHtml remembers: "Back to the summary" must redraw it.
      detailHtml = "";
      // Leave a playing replay alone when the setup state changes underneath it.
      if (!document.querySelector("[data-machine]")) {
        $("[data-detail]").innerHTML = `<div class="inner wide">${machineView()}</div>`;
        machine.mount(/** @type {HTMLElement} */ (document.querySelector("[data-machine]")));
      }
      return;
    }
    machine.stop();
    const wide = showWeek || (finished && shown === null && snap.groups.length > 0);
    const html = `<div class="inner${wide ? " week" : ""}">${shown !== null ? otherView(snap.steps[shown]) : showWeek ? weekHomeView(/** @type {number} */ (viewingWeek)) : finished ? finishView() : currentView(snap.steps[snap.current])}</div>`;
    // A week's pages and the board are frames: re-render them only when something they show changed.
    if (!wide || html !== detailHtml) $("[data-detail]").innerHTML = html;
    detailHtml = wide ? html : "";
    paintLine();
    paintOutput();
    codeTab.sync();
    agentTab.sync();
    filesTab.sync(() => agentTab.currentStep());
    const input = focused ? /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${focused}"]`)) : null;
    if (input) {
      // Put the cursor back at the end (email fields have no setSelectionRange, so reset the value instead).
      const value = input.value;
      input.focus();
      input.value = "";
      input.value = value;
    } else if (shown === null) (/** @type {HTMLElement | null} */ (document.querySelector("[data-sink]")) ?? /** @type {HTMLElement | null} */ (document.querySelector("form[data-form] input")))?.focus();
  }

  function currentStep() {
    return snap && snap.current < snap.total ? snap.steps[snap.current] : null;
  }

  /** Which of the current step's actions is waiting for the student. */
  function actionIndex() {
    return snap?.view?.index ?? 0;
  }

  function run() {
    const panel = snap?.account.panel;
    if (panel) {
      if (panel.phase === "ready" && lineComplete(line)) act({ type: "account-run", typed: line.typed });
      return;
    }
    const step = currentStep();
    if (!step || !lineComplete(line)) return;
    act({ type: "run", stepId: step.id, index: actionIndex(), typed: line.typed });
  }

  function doAction(/** @type {string | null} */ what, /** @type {HTMLElement | null} */ el) {
    const step = currentStep();
    if (what === "view") {
      const n = el?.dataset.n;
      viewing = n === "" || n === undefined || Number(n) === snap?.current ? null : Number(n);
      machineOpen = false;
      viewingWeek = null;
      remember();
      return render();
    }
    if (what === "tab") {
      weekTab = el?.dataset.tab ?? "page";
      // On the finish screen the week shown is the current one: a tab picks it, so Back returns here.
      if (viewingWeek === null && snap) viewingWeek = snap.week;
      remember();
      return render();
    }
    if (what === "frame-back") {
      const frame = /** @type {HTMLIFrameElement | null} */ ((el?.closest(".cpane") ?? el?.closest(".tabbody"))?.querySelector("iframe[data-home]") ?? null);
      if (frame?.dataset.home) frame.src = frame.dataset.home;
      return;
    }
    if (what === "board-start" || what === "board-stop") return act({ type: what });
    if (what === "checks") return act({ type: "checks", week: Number(el?.dataset.w) });
    if (what === "week") {
      if (viewingWeek !== Number(el?.dataset.w)) weekTab = "";
      viewingWeek = Number(el?.dataset.w);
      viewing = null;
      machineOpen = false;
      remember();
      return render();
    }
    if (what === "machine" || what === "m-close") {
      machineOpen = what === "machine";
      viewing = null;
      viewingWeek = null;
      remember();
      return render();
    }
    if (what === "m-play") return machine.toggle();
    if (what === "m-step") return machine.step(1);
    if (what === "m-back") return machine.step(-1);
    if (what === "m-restart") return machine.restart();
    if (what === "back") {
      viewing = null;
      return act({ type: "back", to: Number(el?.dataset.to) });
    }
    if (what === "acct-open") {
      viewing = null;
      machineOpen = false;
      return act({ type: "account-open" });
    }
    if (what === "acct-close" || what === "acct-back") return act({ type: what === "acct-close" ? "account-close" : "account-back" });
    if (what === "acct-pick") return act({ type: "account-pick", choice: el?.dataset.choice ?? "" });
    if (what === "run" && snap?.account.panel) return run();
    if (!step || !what) return;
    viewing = null;
    if (what === "run") return run();
    if (what === "yes") return act({ type: "confirm", stepId: step.id, answer: "yes" });
    if (what === "switch") return act({ type: "account-open" }); // the accounts gh knows, or add one
    if (what === "submit") return act({ type: "submit", stepId: step.id, index: actionIndex(), values: {} });
    if (what === "pick-folder") return act({ type: "pick-folder", stepId: step.id, index: actionIndex() });
    if (what === "create-folder") return act({ type: "submit", stepId: step.id, index: actionIndex(), values: { folder: formValues.folder ?? "", create: el?.dataset.path ?? "" } });
    act({ type: what, stepId: step.id });
  }

  document.addEventListener("click", (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest("[data-do]");
    if (el) doAction(/** @type {HTMLElement} */ (el).dataset.do ?? null, /** @type {HTMLElement} */ (el));
  });
  document.addEventListener("toggle", (e) => {
    if (/** @type {HTMLElement} */ (e.target).matches?.("[data-outbox]")) showOutput = /** @type {HTMLDetailsElement} */ (e.target).open;
  }, true);
  document.addEventListener("input", (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.dataset.sink !== undefined) {
      // Text that arrives without a keypress (an input method, dictation): type it one character at a time.
      for (const ch of input.value) line = lineKey(line, ch);
      input.value = "";
      pasteNote = "";
      return paintLine();
    }
    if (input.name) formValues[input.name] = input.value;
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (/** @type {HTMLElement} */ (e.target).matches?.("[data-agent-composer],[data-agent-fix]")) return; // agentTab's
    const step = currentStep();
    if (!step) return;
    const values = Object.fromEntries(new FormData(/** @type {HTMLFormElement} */ (e.target)).entries());
    act({ type: "submit", stepId: step.id, index: actionIndex(), values });
  });
  document.addEventListener("paste", (e) => {
    if (/** @type {HTMLElement} */ (e.target).dataset?.sink === undefined) return;
    e.preventDefault();
    const r = linePaste(line, e.clipboardData?.getData("text") ?? "");
    pasteNote = r.blocked ? "No pasting here: type it yourself. It's short, and typing it is how you learn it." : "";
    line = r.line;
    paintLine();
  });
  document.addEventListener("keydown", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.dataset?.sink !== undefined) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return; // shortcuts (and paste) pass through
      if (e.key === "Enter") {
        e.preventDefault();
        return run();
      }
      if (e.key === "Backspace" || e.key.length === 1) {
        e.preventDefault();
        pasteNote = "";
        line = lineKey(line, e.key);
        paintLine();
      }
      return;
    }
    if (e.key === "Enter" && target instanceof HTMLInputElement && target.form?.dataset.form !== undefined) {
      e.preventDefault();
      return target.form?.requestSubmit();
    }
    if (machineOpen && viewing === null && !(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      const keys = /** @type {Record<string, string>} */ ({ Enter: "m-play", " ": "m-play", ArrowRight: "m-step", ArrowLeft: "m-back" });
      if (keys[e.key] && !(target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " "))) {
        e.preventDefault();
        doAction(keys[e.key], null);
      }
      return;
    }
    if (e.key !== "Enter" || e.repeat || target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
    if (viewing !== null || snap?.account.panel) return;
    if (snap && snap.current >= snap.total) {
      if (snap.mode === "week") return;
      e.preventDefault();
      return doAction("machine", null);
    }
    const v = snap?.view;
    const a = v?.actions?.[v.index];
    const what = v ? enterAction(v.phase, a?.kind ?? "", lineComplete(line)) : null;
    if (!what || what === "submit" && a?.kind !== "choice") return;
    if (what === "retry" && v?.error?.stop) return; // stopping here is the point: Try again is a click, not Enter
    e.preventDefault();
    doAction(what, null);
  });
}

/**
 * The whole page: markup, styles, the command-line functions and the page's code, with this run's token.
 * @param {string} token
 */
export function studioPage(token) {
  const shared = [pasteAllowed, lineStart, lineKey, linePaste, lineComplete, enterAction, cleanOutput, lastLine, corePhase, describeTick, machinePlayer, chatMarkdown, plainCommand, highlightSource].map((f) => f.toString()).join("\n");
  // JSON inside a <script>: escape < so no string in it can close the script tag.
  const js = (/** @type {unknown} */ value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const data = `const MACHINE_TRACE = ${js(MACHINE_TRACE)};\nconst SKETCHES = ${js(SKETCHES)};`;
  const script = `${shared}\n${data}\n(${studioClient.toString()})(${js(token)}, ${js(WEEK1_GUIDE)});`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>NetSim Studio</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap">
<style>${STUDIO_CSS}</style>
</head>
<body>
<header class="titlebar">
  <span class="brand">${LOGO_SVG}NetSim Studio</span>
  <span class="crumbs" data-crumb>Week 1 · <b>Setup</b></span>
  <span class="right"><span class="pill" data-dry hidden>dry run: nothing really runs</span><span class="count" data-count></span></span>
</header>
<main class="work">
  <section class="panel steps" aria-label="Steps">
    <header><span data-panel>Setup</span> <span class="right" data-progress></span></header>
    <div class="prog"><div class="track"><i data-bar style="width:0"></i></div><b data-prog></b></div>
    <div class="body" data-steps></div>
  </section>
  <section class="panel detail" aria-live="polite">
    <header><span data-label>Starting…</span><span class="right"><span class="tag" data-tag></span></span></header>
    <div class="body" data-detail><div class="inner"><p class="muted">Connecting to the studio…</p></div></div>
  </section>
</main>
<script>${script}</script>
</body>
</html>`;
}

// ── Running for real ───────────────────────────────────────────────────────

// On Windows, npm, npx, codex and code are .cmd files, which need a shell to start. Nothing typed by
// the student (a name, an email, a folder) is ever passed to one of these.
const WINDOWS_SHIMS = new Set(["npm", "npx", "codex", "code"]);

/**
 * Programs installed a moment ago aren't on this process's PATH yet: add the usual places.
 * @param {Platform} platform
 */
function widenPath(platform) {
  const extra =
    platform === "mac"
      ? ["/opt/homebrew/bin", "/usr/local/bin", dirname(process.execPath)]
      : platform === "windows"
        ? [
            join(process.env.APPDATA ?? "", "npm"),
            "C:\\Program Files\\Git\\cmd",
            "C:\\Program Files\\GitHub CLI",
            join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "bin"),
            dirname(process.execPath),
          ]
        : [dirname(process.execPath)];
  const parts = (process.env.PATH ?? "").split(delimiter);
  process.env.PATH = [...parts, ...extra.filter((p) => p && !parts.includes(p))].join(delimiter);
}

// NETSIM_HOME moves it (the week sandbox and test runs keep theirs out of your home folder).
const STATE_FILE = join(process.env.NETSIM_HOME ?? join(homedir(), ".netsim"), "setup-state.json");

/**
 * @param {{ dryRun?: boolean, fresh?: boolean, interactive?: boolean }} [options]
 * @returns {Context & { close: () => void }}
 */
export function realContext({ dryRun = false, fresh = false, interactive = true } = {}) {
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  widenPath(platform);
  /** @param {string[]} argv */
  const shell = (argv) => platform === "windows" && WINDOWS_SHIMS.has(argv[0]);
  // Ctrl+C, Ctrl+D or the end of piped input: leave cleanly, with a word on how to pick up again.
  /** @param {number} code */
  const leave = (code) => {
    console.log(`\n\n${QUIT_MESSAGE}`);
    process.exit(code);
  };
  const reader = interactive ? lineReader(process.stdin, process.stdout, () => leave(0)) : null;
  if (reader) {
    reader.rl.on("SIGINT", () => leave(130));
    process.on("SIGINT", () => leave(130));
  }
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  /** @type {Context["state"]} */
  let state = {};
  if (!dryRun) {
    try {
      state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    } catch {
      state = {};
    }
  }
  // GIT_MERGE_AUTOEDIT: a merge never opens an editor for its message (there's no terminal to type in).
  const env = { ...process.env, NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1", GIT_TERMINAL_PROMPT: "0", GIT_MERGE_AUTOEDIT: "no", HOMEBREW_NO_ENV_HINTS: "1" };
  /** @param {string} program @param {string[]} args */
  const detached = (program, args) => {
    try {
      spawn(program, args, { stdio: "ignore", detached: true }).unref();
    } catch {
      // No browser opener: the terminal shows the link.
    }
  };
  return {
    platform,
    cwd: process.cwd(),
    dryRun,
    fresh,
    color,
    style: makeStyle(color),
    capture: (argv, cwd, options = {}) => {
      // stdin closed: a program that waits for input (codex does, without a terminal) mustn't hang the check.
      const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8", shell: shell(argv), timeout: options.timeout ?? 30_000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === "ENOENT") return null;
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    execute: (argv, cwd) => spawnSync(argv[0], argv.slice(1), { cwd, env: { ...env, NO_COLOR: process.env.NO_COLOR ?? "" }, stdio: "inherit", shell: shell(argv) }).status ?? 1,
    stream: (argv, cwd, onData) => {
      if (dryRun) return dryRunStream(argv, cwd, onData);
      const child = spawn(argv[0], argv.slice(1), { cwd, shell: shell(argv), env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.setEncoding("utf8").on("data", onData);
      child.stderr.setEncoding("utf8").on("data", onData);
      return {
        done: new Promise((done) => {
          child.on("error", (error) => {
            onData(`${argv[0]}: ${/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" ? "command not found" : error.message}\n`);
            done(127);
          });
          child.on("close", (code) => done(code ?? 1));
        }),
        kill: () => child.kill(),
      };
    },
    // The computer's own folder picker (only when the student clicks Choose…; never in a sandbox).
    pickFolder: (initial, prompt) =>
      new Promise((done) => {
        if (process.env.NETSIM_STUDIO_NO_OPEN === "1") return done(null);
        const [command, args] = pickFolderCommand(platform, initial, prompt);
        let out = "";
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
        child.stdout.setEncoding("utf8").on("data", (d) => (out += d));
        child.on("error", () => done(null));
        child.on("close", () => done(out.trim().replace(/(.)\/$/, "$1") || null));
      }),
    httpStatus: async (url) => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(2000) })).status;
      } catch {
        return 0;
      }
    },
    // NETSIM_STUDIO_NO_OPEN=1 (the test sandbox sets it): never open anything on the screen. The
    // page still shows every link ("Open it here"), so nothing is lost.
    openUrl: (url) => {
      if (process.env.NETSIM_STUDIO_NO_OPEN === "1") return;
      if (platform === "mac") detached("open", [url]);
      else if (platform === "windows") detached("rundll32", ["url.dll,FileProtocolHandler", url]);
      else detached("xdg-open", [url]);
    },
    openTerminal: (command) => {
      // Only the Homebrew installer uses this: it asks for the Mac password, which needs a real terminal.
      if (platform !== "mac" || process.env.NETSIM_STUDIO_NO_OPEN === "1") return;
      const script = command.display.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      detached("osascript", ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate']);
    },
    ask: reader ? reader.ask : async () => "",
    print: (line) => console.log(line),
    exists: (path) => existsSync(path),
    rename: (from, to) => renameSync(from, to),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    isDir: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    mtime: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
    readText: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    save: () => {
      if (dryRun) return;
      try {
        mkdirSync(dirname(STATE_FILE), { recursive: true });
        // doctorOk too: the doctor passing can't be checked again without running it, so the next
        // run (and the next week) needs it.
        const { login, parent, repoDir, chatgpt, codexVersion, doctorOk, agentThreads } = state;
        writeFileSync(STATE_FILE, JSON.stringify({ login, parent, repoDir, chatgpt, codexVersion, doctorOk, agentThreads }, null, 2));
      } catch {
        // Remembering is a convenience; the checks find everything again anyway.
      }
    },
    get state() {
      return state;
    },
    set state(value) {
      state = value;
    },
    close: () => reader?.close(),
  };
}

/**
 * A dry run's "command": prints what would run, a line at a time, and changes nothing.
 * NETSIM_DRY_FAIL=<the command's first word> makes it fail once (to see the failed state).
 * @param {string[]} argv
 * @param {string | undefined} cwd
 * @param {(text: string) => void} onData
 * @returns {Running}
 */
function dryRunStream(argv, cwd, onData) {
  const lines = [`(dry run) would run: ${argv.join(" ")}`, ...(cwd ? [`(dry run) in: ${tildify(cwd)}`] : []), "(dry run) working...", "(dry run) nothing was changed."];
  const failing = process.env.NETSIM_DRY_FAIL && argv.join(" ").includes(process.env.NETSIM_DRY_FAIL);
  if (failing) process.env.NETSIM_DRY_FAIL = "";
  /** @type {NodeJS.Timeout[]} */
  const timers = [];
  /** @type {(code: number) => void} */
  let finish = () => {};
  const done = new Promise((resolve) => (finish = resolve));
  lines.forEach((l, i) => timers.push(setTimeout(() => onData(`${l}\n`), 400 * (i + 1))));
  timers.push(
    setTimeout(() => {
      if (failing) onData("fatal: (dry run) pretend this failed\n");
      finish(failing ? 1 : 0);
    }, 400 * (lines.length + 1)),
  );
  return { done, kill: () => (timers.forEach(clearTimeout), finish(130)) };
}

/**
 * @typedef {CourseWeek & { status: "setup" | "done" | "inwork" | "get" | "later" | "future" | "open", start: number, count: number, update?: boolean, label?: string }} WeekGroup
 *   One week in the studio's list. start/count: its steps in the flow (count 0: a heading only).
 *   setup: week 1, re-checked. done: in work, a later week too. inwork: the newest week in work.
 *   get: the week to get now. later: published, after the one to get. future: not out yet.
 */

/**
 * Setup (week 1), or, once setup is done, getting the next week: which one this run is.
 * withSetup (what `node setup.mjs` uses): one list of every week of the course (weekList),
 * meta.groups. Week 1's setup is re-checked; weeks already in work are done (their steps can be
 * looked at again); the newest week in work keeps its push, install, doctor and guide checks; the
 * week to get comes next; weeks not out yet are greyed out. Steps already done tick themselves off
 * (meta.autoSteps), so the student lands on the first thing left to do.
 * @param {Context} ctx
 * @param {{ forceSetup?: boolean, withSetup?: boolean, weekList?: CourseWeek[], today?: number }} [options]
 *   today: the week the class is on (weeks.json's "current"); later weeks may be out already, but the
 *   studio opens on today's, and weeks from today on aren't shown as done (nobody has done them yet).
 * @returns {{ steps: Step[], meta: { mode: "setup" | "week", week?: number, published?: boolean, setupSteps?: number, autoSteps?: number, inWork?: boolean, next?: number, groups?: WeekGroup[], update?: boolean, home?: number } }}
 */
export function chooseFlow(ctx, { forceSetup = false, withSetup = false, weekList = COURSE_WEEKS, today = 0 } = {}) {
  // A folder remembered from last time that isn't a copy of this course (an old netsim-starter copy,
  // or one that's gone) is forgotten, with what was checked in it: its pages and its doctor result
  // aren't this course's. Setup makes the new copy.
  if (ctx.state.repoDir && (!ctx.exists(join(ctx.state.repoDir, ".git")) || notACourseCopy(ctx, ctx.state.repoDir))) {
    delete ctx.state.repoDir;
    delete ctx.state.doctorOk;
  }
  const dir = forceSetup || ctx.fresh ? null : findClone(ctx);
  const titled = (/** @type {number} */ n) => weekList.find((w) => w.week === n)?.title ?? `Week ${n}`;
  /** A week from the list (its resources: page, note, board…), or just its number and title. @param {number} n */
  const entry = (n) => ({ ...(weekList.find((w) => w.week === n) ?? {}), week: n, title: titled(n) });
  const later = (/** @type {number} */ from) => weekList.filter((w) => w.week >= from);
  if (!dir || !setupComplete(ctx, dir)) {
    if (!withSetup) return { steps: courseSteps(), meta: { mode: "setup" } };
    const steps = courseSteps();
    /** @type {WeekGroup[]} */
    const groups = [{ ...entry(1), status: "setup", start: 0, count: steps.length }, ...later(2).map((w) => ({ ...w, status: /** @type {const} */ ("future"), start: steps.length, count: 0 }))];
    return { steps, meta: { mode: "setup", groups } };
  }
  ctx.state.repoDir = dir;
  if (!withSetup) {
    const { week, published } = findWeek(ctx, dir);
    if (!published) return { steps: [], meta: { mode: "week", week, published: false } };
    const onWork = output(ctx, ["git", "branch", "--show-current"], dir) === "work";
    return { steps: weekSteps(week, { onWork }), meta: { mode: "week", week, published: true } };
  }
  const { published, merged, tips } = weekStates(ctx, dir);
  const newest = Math.max(1, ...merged);
  // Week N had been in work before (an older version of it): getting it again is an update.
  const hadBefore = (/** @type {number} */ n) => n === 1 || n <= newest || ctx.capture(["git", "cat-file", "-e", `work:docs/weeks/week-${String(n).padStart(2, "0")}.md`], dir)?.code === 0;
  const waiting = published.filter((n) => !merged.includes(n));
  const toGet = newestHolding(ctx, dir, waiting, tips);
  const getting = toGet;
  const brought = getting === null ? [] : waiting.filter((m) => m < getting);
  /** @type {Step[]} */
  const steps = [];
  /** @type {WeekGroup[]} */
  const groups = [];
  /** @param {number} week @param {WeekGroup["status"]} status @param {Step[]} list */
  const add = (week, status, list) => {
    groups.push({ ...entry(week), status, start: steps.length, count: list.length });
    steps.push(...list);
  };
  add(1, "setup", courseSteps());
  // Weeks from today's on that are (or are about to be) in the folder: open to look at and build in,
  // with no steps of their own, so nothing is ticked off that the student hasn't done.
  const ahead = (/** @type {number} */ n) => today > 0 && n >= today && n !== (toGet ?? newest);
  for (const n of [...new Set([...merged, ...brought])].filter((m) => m > 1).sort((a, b) => a - b)) {
    if (ahead(n)) groups.push({ ...entry(n), status: "open", start: 0, count: 0 });
    else if (brought.includes(n)) add(n, "done", doneWeekSteps(n, hadBefore(n) ? `Week ${n}'s update comes with week ${toGet}.` : `Week ${n} comes with week ${toGet}.`));
    else add(n, n === newest && toGet === null ? "inwork" : "done", n === newest && toGet === null ? inWorkSteps(n) : doneWeekSteps(n));
  }
  const autoSteps = steps.length;
  if (toGet !== null) {
    add(toGet, "get", weekSteps(toGet, { onWork: output(ctx, ["git", "branch", "--show-current"], dir) === "work" }));
    // An earlier week changed after a later one came in (a fix Praise published): an update, not a second week 1.
    if (hadBefore(toGet)) groups[groups.length - 1].update = true;
  }
  // One tag can hold several weeks (Praise publishes week 8 with 4-7 inside): a week below the one
  // being got (or the newest in work) comes with it, so it's open, not "not out yet".
  const top = toGet ?? newest;
  for (const w of later(2)) {
    if (groups.some((g) => g.week === w.week)) continue;
    groups.push({ ...w, status: today > 0 && w.week < top ? "open" : published.includes(w.week) ? "later" : "future", start: steps.length, count: 0 });
  }
  // Headings with no steps sit after the steps (their start is the end).
  for (const g of groups) if (g.count === 0) g.start = steps.length;
  // The newest week's own steps are getting (or keeping up) the course's work: when that week is
  // ahead of the class, they're labelled as that, not as the week.
  const topGroup = groups.find((g) => g.week === top && g.count > 0 && g.status !== "setup");
  if (topGroup && today > 0 && topGroup.week > today) topGroup.label = topGroup.status === "get" ? "Get this week's work" : "Your work";
  const home = today > 0 && groups.some((g) => g.week === today && g.status !== "future" && g.status !== "later") ? { home: today } : {};
  const setupSteps = groups[0].count;
  if (toGet !== null) return { steps, meta: { mode: "week", week: toGet, published: true, setupSteps, autoSteps, groups, ...home, ...(groups.some((g) => g.update) ? { update: true } : {}) } };
  if (newest > 1) return { steps, meta: { mode: "week", week: newest, published: true, setupSteps, autoSteps, inWork: true, next: newest + 1, groups, ...home } };
  return { steps, meta: { mode: "week", week: 2, published: false, setupSteps, autoSteps, groups } };
}

/**
 * Which weeks are published on upstream (GitHub, else what was fetched before) and which of those
 * are in work already, in week order.
 * @param {Context} ctx
 * @param {string} dir
 */
export function weekStates(ctx, dir) {
  /** @type {Map<number, string>} */
  const tips = new Map();
  const local = output(ctx, ["git", "for-each-ref", "--format=%(objectname) %(refname:short)", "refs/remotes/upstream/"], dir) ?? "";
  for (const m of local.matchAll(/^([0-9a-f]{40}) upstream\/week-(\d+)$/gm)) tips.set(Number(m[2]), m[1]);
  for (const [n, sha] of remoteWeeks(ctx, dir)) tips.set(n, sha);
  const published = [...tips.keys()].sort((a, b) => a - b);
  const merged = published.filter((n) => ctx.capture(["git", "merge-base", "--is-ancestor", /** @type {string} */ (tips.get(n)), "work"], dir)?.code === 0);
  return { published, merged, tips };
}

/**
 * Week N's steps once a later week is in work too (or coming with the week to get): all done (they
 * can still be looked at).
 * @param {number} week
 * @param {string} [found]
 * @returns {Step[]}
 */
export function doneWeekSteps(week, found = `Done: week ${week} is in your work.`) {
  return weekSteps(week).map((step) => ({ ...step, check: async () => ({ done: true, found }) }));
}

/**
 * Week N's steps once week N is already in work: getting it (save, fetch, merge) is done, so those
 * tick off; pushing, installing, the doctor and opening the guide are still checked for real.
 * @param {number} week
 * @returns {Step[]}
 */
export function inWorkSteps(week) {
  const inAlready = new Set(["half-merged", "on-work", "saved", "fetch", "merge"]);
  return weekSteps(week).map((step) => {
    if (inAlready.has(step.id)) return { ...step, check: async () => ({ done: true, found: `Done: week ${week} is in your work.` }) };
    if (step.id === "doctor-week")
      return { ...step, check: async (/** @type {Context} */ ctx) => ({ done: ctx.state.doctorOk === true, found: ctx.state.doctorOk ? "doctor: all 8 checks passed" : "The doctor hasn't passed yet." }) };
    return step;
  });
}

/**
 * The studio: start the server, open the browser, stop when the tab closes or on Ctrl+C.
 * @param {Context & { close: () => void }} ctx
 * @param {{ open?: boolean, port?: number, forceSetup?: boolean, weekList?: CourseWeek[], focus?: number }} options
 */
async function runStudio(ctx, { open = true, port = 0, forceSetup = false, weekList = COURSE_WEEKS, focus = 0, today = 0 }) {
  const { steps, meta } = chooseFlow(ctx, { forceSetup, withSetup: true, weekList, today });
  if (focus) Object.assign(meta, { focus });
  const studio = createStudio(ctx, steps, meta);
  /** @type {Awaited<ReturnType<typeof serveStudio>> | null} */
  let server = null;
  /** @param {string} why @param {number} code */
  const stop = async (why, code) => {
    studio.stop();
    server?.close();
    console.log(`\n${why}\n${QUIT_MESSAGE}`);
    // Its Codex goes with it: a bounded wait, then only that child's tree.
    await Promise.race([studio.shutdown(), new Promise((resolve) => setTimeout(resolve, 3500))]);
    process.exit(code);
  };

  process.on("SIGINT", () => stop("Stopped.", 130));
  process.on("SIGTERM", () => stop("Stopped.", 143));
  server = await serveStudio(studio, { port, onIdle: () => stop("The studio tab was closed, so the studio stopped.", 0), log: (l) => process.env.NETSIM_STUDIO_DEBUG && console.log(l) });
  void studio.start();
  console.log(ctx.style.bold("NetSim Studio is running."));
  console.log(`Open this in your browser (it should open by itself):\n\n  ${server.url}\n`);
  console.log("Keep this window open while you work. Ctrl+C stops the studio.");
  if (open) ctx.openUrl?.(server.url);
}

/**
 * The newest week published on the course's repository (GitHub), or null offline / without git.
 * @param {Context} ctx
 */
export function newestPublishedWeek(ctx) {
  const tags = output(ctx, ["git", "ls-remote", "--tags", STARTER_URL, "week-*"]) ?? "";
  const weeks = [...tags.matchAll(/refs\/tags\/week-(\d+)$/gm)].map((m) => Number(m[1]));
  return weeks.length ? Math.max(...weeks) : null;
}

/**
 * A text file from the newest published week, straight from GitHub; null when it can't be had
 * quickly (offline, slow network): the studio then carries on with what it has.
 * @param {number} week
 * @param {string} file
 */
async function fromCourse(week, file) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${STARTER}/week-${week}/${file}`, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * The list of weeks: weeks.json from the newest published week on GitHub, else the course folder's
 * copy, else the one built in here.
 * @param {Context} ctx
 * @param {number | null} newest
 * @returns {Promise<CourseWeek[]>}
 */
/**
 * The week the class is on (weeks.json's "current", which Praise moves each Monday): the studio
 * opens on it, even when later weeks are already out. From the newest published week on GitHub,
 * else the course folder's copy; null when neither says.
 * @param {Context} ctx
 * @param {number | null} newest
 * @returns {Promise<number | null>}
 */
export async function loadCurrentWeek(ctx, newest) {
  const local = ctx.readText(join(ctx.cwd, "weeks.json"));
  for (const text of [newest ? await fromCourse(newest, "weeks.json") : null, local]) {
    try {
      const current = text ? JSON.parse(text).current : null;
      if (Number.isInteger(current) && current >= 1) return current;
    } catch {
      // not usable: try the next one
    }
  }
  return null;
}

export async function loadWeekList(ctx, newest) {
  const local = ctx.readText(join(ctx.cwd, "weeks.json"));
  for (const text of [newest ? await fromCourse(newest, "weeks.json") : null, local]) {
    try {
      const weeks = text ? JSON.parse(text).weeks : null;
      if (Array.isArray(weeks) && weeks.every((w) => Number.isInteger(w?.week) && typeof w?.title === "string")) return weeks;
    } catch {
      // not a usable list: try the next one
    }
  }
  return COURSE_WEEKS;
}

/**
 * A newer studio than this one, from the newest published week: saved next to the studio's state,
 * and its path returned (null when this one is the newest, or GitHub can't be reached).
 * @param {number | null} newest
 * @param {string} [dir]  where to save it (the studio's state folder)
 */
export async function newerStudio(newest, dir = dirname(STATE_FILE)) {
  if (!newest) return null;
  const text = await fromCourse(newest, "setup.mjs");
  const version = Number(/^export const STUDIO_VERSION = (\d+);$/m.exec(text ?? "")?.[1] ?? 0);
  if (!text || version <= STUDIO_VERSION) return null;
  const path = join(dir, `studio-v${version}.mjs`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, text);
  // Its code box comes with it (a course folder from an earlier week doesn't have one yet).
  const editor = await fromCourse(newest, "studio/editor.js");
  if (editor) writeFileSync(join(dir, "editor.js"), editor); // the new studio checks it against its own hash
  return path;
}

/**
 * A week's home in the terminal: where its page, note and board are.
 * @param {WeekGroup} g
 */
export function weekHomeLines(g) {
  const nn = pad2(g.week);
  return [
    `\nWeek ${g.week} · ${g.title}`,
    `  The ${g.page ? "page" : "guide"}: ${g.page ?? g.guide ?? `docs/weeks/week-${nn}.md`} (open it from your folder${g.page ? ": double-click it" : ""})`,
    ...(g.note ? [`  Your ${g.kind === "setup" ? "notes" : "design note"}: ${g.note}`] : []),
    ...(g.board ? ["  The board: npm run dev:all, then open http://localhost:3005/board"] : []),
    g.kind === "setup" ? "  Your setup check: npm run doctor" : `  Your checks: npx vitest run tests/week-${nn}`,
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const terminal = args.includes("--terminal");
  const portArg = args.indexOf("--port");
  const ctx = realContext({ dryRun, fresh: args.includes("--fresh"), interactive: terminal });
  if (ctx.platform === "windows") ctx.print("(Windows support is untested on a real Windows machine so far. Tell Praise how it goes.)");
  if (ctx.dryRun) ctx.print("(dry run: commands are shown and typed, but not run)");
  const forceSetup = args.includes("--setup");
  // node setup-week N (or --week N): the studio for week N's class. Its home opens once it's in.
  const weekArg = args.indexOf("--week");
  const focus = weekArg === -1 ? 0 : Number(args[weekArg + 1]);
  if (weekArg !== -1 && !(Number.isInteger(focus) && focus >= 1)) {
    console.log("Which week? For example: node setup-week 2");
    process.exitCode = 2;
    return;
  }
  // One studio for everyone: a newer one on the newest published week runs instead of this copy.
  // Not in a dry run, a sandbox or a test run (they use the studio they were given), and only once.
  const newest = ctx.dryRun || process.env.NETSIM_SANDBOX ? null : newestPublishedWeek(ctx);
  if (newest && !process.env.NETSIM_STUDIO_UPDATED && !process.env.NETSIM_NO_UPDATE) {
    const newer = await newerStudio(newest);
    if (newer) {
      ctx.print(`(a newer NetSim Studio is out with week ${newest}: using it)`);
      const child = spawnSync(process.execPath, [newer, ...args], { stdio: "inherit", env: { ...process.env, NETSIM_STUDIO_UPDATED: "1" } });
      process.exit(child.status ?? 1);
    }
  }
  const weekList = await loadWeekList(ctx, newest);
  const today = await loadCurrentWeek(ctx, newest);
  if (!terminal) return runStudio(ctx, { open: !args.includes("--no-open"), port: portArg === -1 ? 0 : Number(args[portArg + 1]), forceSetup, weekList, focus, today: today ?? 0 });
  const { steps, meta } = chooseFlow(ctx, { forceSetup, withSetup: true, weekList, today: today ?? 0 });
  const week = meta.mode === "week" ? meta.week : undefined;
  const { quit } = await runSteps(steps, ctx, { week, setupSteps: meta.setupSteps ?? 0, autoSteps: meta.autoSteps, published: meta.published !== false, nextWeek: meta.next ?? 0, groups: meta.groups ?? [] });
  const home = (meta.groups ?? []).find((g) => g.week === (focus || week));
  if (!quit && home && ["setup", "done", "inwork", "get"].includes(home.status)) for (const line of weekHomeLines(home)) ctx.print(line);
  ctx.close();
  process.exitCode = quit ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
