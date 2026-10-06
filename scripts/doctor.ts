// `npm run doctor`: is this machine and this clone ready for the course?
// Every failed check says how to fix it. Exits non-zero while a required check fails.
// You paste its output into docs/notes/week-01.md, and tests/week-01/setup.test.ts checks it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The course's starter repo on GitHub. Your fork is a copy of it under your own account. */
export const STARTER_REPO = "praiseisaac/netsim";

export type Status = "pass" | "fail" | "warn";

export type Check = {
  name: string;
  status: Status;
  /** Required checks count towards "all N checks passed"; optional ones only ever warn. */
  required: boolean;
  /** What was found, e.g. "v22.11.0". */
  detail: string;
  /** How to fix it, shown when the check doesn't pass. */
  fix: string;
};

/** The last line when everything required passes. */
export const REQUIRED_CHECKS = 8;
export const ALL_GOOD = `doctor: all ${REQUIRED_CHECKS} checks passed`;

// ── Running commands ───────────────────────────────────────────────────────

export type RunResult = { code: number; stdout: string; stderr: string };
/** Runs a command; returns null if the program isn't installed. Tests pass a fake one. */
export type Runner = (command: string, args: string[], env?: Record<string, string>) => RunResult | null;

export function commandRunner(cwd: string): Runner {
  return (command, args, env = {}) => {
    const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 20_000, env: { ...process.env, ...env } });
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { code: result.status ?? 1, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
  };
}

/** What `remote.upstream.fetch` is when upstream brings every branch (every week). */
/** The course tags each released week (week-1, week-2, …); they arrive as upstream/week-N. Same as setup.mjs. */
export const UPSTREAM_WEEKS = "+refs/tags/week-*:refs/remotes/upstream/week-*";

/** The output of a command that should succeed, or null. */
function outputOf(run: Runner, command: string, args: string[]): string | null {
  const result = run(command, args);
  return result && result.code === 0 ? result.stdout : null;
}

// ── Reading remote URLs ────────────────────────────────────────────────────

export type Remote = {
  /** How git reaches it: over SSH or HTTPS. */
  protocol: "ssh" | "https";
  /** What to pass to `ssh` for an SSH remote: "git@github.com", or a host alias like "github-ada". */
  sshTarget: string;
  sshPort?: string;
  /** For HTTPS remotes: the host git signs in to, e.g. "github.com". */
  host: string;
  owner: string;
  repo: string;
};

/**
 * Pull OWNER/REPO out of any form of GitHub URL:
 *   https://github.com/ada/netsim.git   git@github.com:ada/netsim.git
 *   ssh://git@github.com/ada/netsim     github-ada:ada/netsim.git  (an alias from ~/.ssh/config)
 * Returns null for anything else (a local folder, say).
 */
export function parseRemote(url: string): Remote | null {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (https) return { protocol: "https", sshTarget: "", host: https[1], owner: https[2], repo: https[3] };
  const sshUrl = /^ssh:\/\/((?:[^@/]+@)?([^/:]+))(?::(\d+))?\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshUrl) return { protocol: "ssh", sshTarget: sshUrl[1], sshPort: sshUrl[3], host: sshUrl[2], owner: sshUrl[4], repo: sshUrl[5] };
  // scp-like form: [user@]host:owner/repo. The host may be an alias; a Windows path like C:\ isn't.
  const scp = /^((?:[^@/:]+@)?[^/:\\]{2,}):([^/]+)\/([^/]+)$/.exec(trimmed);
  if (scp) return { protocol: "ssh", sshTarget: scp[1], host: scp[1].replace(/^[^@]+@/, ""), owner: scp[2], repo: scp[3] };
  return null;
}

function sameRepo(a: Remote, b: { owner: string; repo: string }): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}

// ── Who will git push as? ──────────────────────────────────────────────────

const OFFLINE = /could not resolve|name or service not known|nodename nor servname|timed out|network is unreachable|connection refused|failed to connect|no route to host/i;
const AUTH_FAILED = /permission denied|authentication failed|could not read username|403|access denied|invalid username or password/i;

export type PushIdentity =
  | { kind: "account"; login: string; via: "ssh" | "gh" } // we know which GitHub account git uses
  | { kind: "no-helper" } // HTTPS, but git has nothing to sign in with
  | { kind: "can-push" } // a dry-run push worked, so the account is right
  | { kind: "denied"; why: string } // GitHub refused
  | { kind: "offline"; why: string } // couldn't reach GitHub
  | { kind: "unknown"; why: string };

/** GitHub greets a working SSH key with "Hi <user>! You've successfully authenticated…". */
export function sshGreetingUser(text: string): string | null {
  return /Hi ([A-Za-z0-9-]+)!/.exec(text)?.[1] ?? null;
}

const firstLine = (text: string) => text.split("\n")[0];

export function pushIdentity(origin: Remote, run: Runner): PushIdentity {
  if (origin.protocol === "ssh") {
    const port = origin.sshPort ? ["-p", origin.sshPort] : [];
    const ssh = run("ssh", ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", ...port, origin.sshTarget]);
    if (!ssh) return { kind: "unknown", why: "ssh isn't installed" };
    const said = `${ssh.stdout}\n${ssh.stderr}`.trim();
    const login = sshGreetingUser(said);
    if (login) return { kind: "account", login, via: "ssh" };
    if (OFFLINE.test(said)) return { kind: "offline", why: firstLine(said) };
    return { kind: "denied", why: firstLine(said) || "GitHub didn't accept this laptop's SSH key" };
  }

  // HTTPS: git needs a credential helper to sign in. Without one it asks for a password, and
  // GitHub stopped accepting passwords in 2021, so the push fails even if gh is logged in.
  if (!hasCredentialHelper(origin.host, run)) return { kind: "no-helper" };

  // Ask the GitHub CLI who is logged in, if it's installed and logged in...
  const gh = run("gh", ["api", "user", "--jq", ".login"]);
  if (gh && gh.code === 0 && gh.stdout) return { kind: "account", login: gh.stdout, via: "gh" };
  if (gh && OFFLINE.test(gh.stderr)) return { kind: "offline", why: firstLine(gh.stderr) };

  // ...otherwise try a push that doesn't change anything, without ever prompting for a password.
  const dryRun = run("git", ["push", "--dry-run", "origin", "HEAD:refs/heads/work"], { GIT_TERMINAL_PROMPT: "0" });
  if (!dryRun) return { kind: "unknown", why: "git isn't installed" };
  if (dryRun.code === 0) return { kind: "can-push" };
  if (OFFLINE.test(dryRun.stderr)) return { kind: "offline", why: firstLine(dryRun.stderr) };
  if (AUTH_FAILED.test(dryRun.stderr)) return { kind: "denied", why: firstLine(dryRun.stderr) };
  return { kind: "unknown", why: firstLine(dryRun.stderr) || "git push --dry-run failed" };
}

/**
 * Does git have a credential helper for this host? (gh, osxkeychain, manager, manager-core,
 * store...) Either one set just for the host, or a general `credential.helper`.
 */
export function hasCredentialHelper(host: string, run: Runner): boolean {
  const helpers = (key: string) =>
    (run("git", ["config", "--get-all", key])?.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return helpers(`credential.https://${host}.helper`).length > 0 || helpers("credential.helper").length > 0;
}

/** Turn "who git pushes as" into the check's result. */
export function pushCheck(origin: Remote | null, identity: PushIdentity | null): Pick<Check, "status" | "detail" | "fix"> {
  if (!origin || !identity) {
    return { status: "fail", detail: "no fork to check yet", fix: "Fix 'origin is your fork' first." };
  }
  const owner = origin.owner;
  const howToFix = `run \`gh auth login\` as ${owner}, or add this laptop's SSH key to ${owner} (github.com/settings/keys)`;
  switch (identity.kind) {
    case "account":
      return identity.login.toLowerCase() === owner.toLowerCase()
        ? { status: "pass", detail: `as ${identity.login}`, fix: "" }
        : {
            status: "fail",
            detail: `git pushes as ${identity.login}, not ${owner}`,
            fix:
              identity.via === "gh"
                ? `git would push as ${identity.login} but your fork belongs to ${owner}: run \`gh auth switch --user ${owner}\` (or \`gh auth login\` as ${owner} if it isn't signed in yet).`
                : `git would push as ${identity.login} but your fork belongs to ${owner}: ${howToFix}.`,
          };
    case "no-helper":
      return {
        status: "fail",
        detail: "git has no credential helper for GitHub",
        fix: "git has no way to sign in to GitHub and would ask for a password, which GitHub rejects: run `gh auth setup-git` (after `gh auth login`).",
      };
    case "can-push":
      return { status: "pass", detail: "a dry-run push worked", fix: "" };
    case "denied":
      return { status: "fail", detail: identity.why, fix: `GitHub won't let this laptop push to ${owner}/${origin.repo}: ${howToFix}.` };
    case "offline":
      return { status: "warn", detail: `couldn't reach GitHub (${identity.why})`, fix: "Connect to the internet and run `npm run doctor` again." };
    case "unknown":
      return { status: "fail", detail: identity.why, fix: "Ask Praise to look at this with you." };
  }
}

// ── The checks ─────────────────────────────────────────────────────────────

export function runChecks(root: string = process.cwd(), run: Runner = commandRunner(root)): Check[] {
  const checks: Check[] = [];
  const add = (name: string, passed: boolean, detail: string, fix: string, required = true) =>
    checks.push({ name, status: passed ? "pass" : required ? "fail" : "warn", required, detail, fix });

  const [major] = process.versions.node.split(".").map(Number);
  add("Node 22 or newer", major >= 22, `v${process.versions.node}`, "Install Node 22 LTS or newer from https://nodejs.org, then open a new terminal.");

  const git = outputOf(run, "git", ["--version"]);
  const name = outputOf(run, "git", ["config", "user.name"]);
  const email = outputOf(run, "git", ["config", "user.email"]);
  add(
    "git knows who you are",
    Boolean(git && name && email),
    !git ? "git not found" : name && email ? `${name} <${email}>` : "user.name or user.email not set",
    !git
      ? "Install git from https://git-scm.com/downloads (on macOS, `xcode-select --install` also works)."
      : 'Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` (your GitHub email).',
  );

  const branch = outputOf(run, "git", ["branch", "--show-current"]);
  add(
    "on the 'work' branch",
    branch === "work",
    branch ? `on '${branch}'` : "not in a git clone",
    "`cd` into your clone of the course, then `git switch work` (the first time: `git switch -c work upstream/week-1`).",
  );

  const upstreamUrl = outputOf(run, "git", ["remote", "get-url", "upstream"]);
  // `gh repo clone` of a fork can link upstream for one branch only; then later weeks never arrive.
  const upstreamFetch = upstreamUrl === null ? null : outputOf(run, "git", ["config", "--get-all", "remote.upstream.fetch"]);
  const allWeeks = upstreamFetch === null || upstreamFetch.split("\n").some((line) => line.trim() === UPSTREAM_WEEKS);
  add(
    "'upstream' remote set",
    upstreamUrl !== null && allWeeks,
    upstreamUrl === null ? "no remote called upstream" : allWeeks ? upstreamUrl : `${upstreamUrl}, but it doesn't bring the course's weeks`,
    upstreamUrl === null
      ? "Run `git remote add upstream https://github.com/praiseisaac/netsim.git`, then `git fetch upstream`."
      : `Run \`git config --replace-all remote.upstream.fetch "${UPSTREAM_WEEKS}"\`, then \`git fetch upstream\`, so every week comes down (or run npm start: the studio does it).`,
  );

  // Compare repos, not URL text: https://… and git@… can point at the same repo.
  const originUrl = outputOf(run, "git", ["remote", "get-url", "origin"]);
  const origin = originUrl === null ? null : parseRemote(originUrl);
  const upstream = upstreamUrl === null ? null : parseRemote(upstreamUrl);
  const [starterOwner, starterRepo] = STARTER_REPO.split("/");
  const isStarter = origin !== null && (sameRepo(origin, { owner: starterOwner, repo: starterRepo }) || (upstream !== null && sameRepo(origin, upstream)));
  const originDetail =
    originUrl === null
      ? "no remote called origin"
      : origin === null
        ? `not a GitHub repo: ${originUrl}`
        : isStarter
          ? `origin is the starter repo (${origin.owner}/${origin.repo}), not your fork`
          : `${origin.owner}/${origin.repo}`;
  add(
    "origin is your fork",
    origin !== null && !isStarter,
    originDetail,
    "Fork the starter repo on GitHub, then point origin at your fork: `git remote set-url origin <your fork's URL>`.",
  );

  const fork = origin !== null && !isStarter ? origin : null;
  checks.push({ name: "you can push to your fork", required: true, ...pushCheck(fork, fork ? pushIdentity(fork, run) : null) });

  const installed = existsSync(join(root, "node_modules", "zod", "package.json")) && existsSync(join(root, "node_modules", "vitest", "package.json"));
  add("dependencies installed", installed, installed ? "node_modules present" : "node_modules missing", "Run `npm install` in the course folder.");

  const codex = outputOf(run, "codex", ["--version"]);
  add("Codex CLI installed", codex !== null, codex ?? "not found", "Run `npm install -g @openai/codex`, then run `codex` once and sign in with your ChatGPT account.");

  const code = outputOf(run, "code", ["--version"]);
  add(
    "VS Code 'code' command",
    code !== null,
    code?.split("\n")[0] ?? "not found",
    "Optional. In VS Code, open the command palette and run \"Shell Command: Install 'code' command in PATH\".",
    false,
  );

  return checks;
}

/** The last line of the report, and whether doctor should exit happily. */
export function summary(checks: readonly Check[]): { line: string; ok: boolean } {
  const required = checks.filter((c) => c.required);
  const failed = required.filter((c) => c.status === "fail").length;
  const skipped = required.filter((c) => c.status === "warn").length;
  if (failed > 0) return { line: `doctor: ${failed} of ${required.length} checks failed; fix the ✗ lines above and run it again`, ok: false };
  if (skipped > 0) {
    return {
      line: `doctor: ${required.length - skipped} of ${required.length} checks passed; ${skipped} couldn't run without a network, run it again when you're online`,
      ok: true,
    };
  }
  return { line: `doctor: all ${required.length} checks passed`, ok: true };
}

function main(): void {
  const checks = runChecks();
  const marks: Record<Status, string> = { pass: "✓", fail: "✗", warn: "!" };
  for (const check of checks) {
    console.log(`${marks[check.status]} ${check.name.padEnd(27)} ${check.detail}`);
    if (check.status !== "pass") console.log(`    → ${check.fix}`);
  }
  const { line, ok } = summary(checks);
  console.log(`\n${line}`);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
