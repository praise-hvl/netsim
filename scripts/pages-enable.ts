// `npm run pages:enable`: get your fork ready for GitHub Pages (week 8), once.
//   1. makes `work` your fork's default branch (Pages deploys only from the default branch)
//   2. turns GitHub Actions on (a new fork has them off, so pages.yml would never run)
//   3. turns Pages on, built by GitHub Actions (.github/workflows/pages.yml)
// Safe to run again: anything already done is just reported as done.
import { pathToFileURL } from "node:url";
import { commandRunner, parseRemote, type Runner } from "@/scripts/doctor";

export type Step = { ok: boolean; text: string };
export type Result = { ok: boolean; steps: Step[]; url: string | null };

/** The output of a command that should succeed, or null. */
function output(run: Runner, command: string, args: string[]): string | null {
  const result = run(command, args);
  return result && result.code === 0 ? result.stdout.trim() : null;
}

export function enablePages(run: Runner): Result {
  const steps: Step[] = [];
  const fail = (text: string): Result => ({ ok: false, steps: [...steps, { ok: false, text }], url: null });

  // Whose fork is this?
  const originUrl = output(run, "git", ["remote", "get-url", "origin"]);
  const origin = originUrl === null ? null : parseRemote(originUrl);
  if (!origin) return fail("origin isn't a GitHub repo. Run this inside your clone of your fork (npm run doctor checks that).");
  const repo = `${origin.owner}/${origin.repo}`;

  // gh must be signed in as the fork's owner: only they can change its settings.
  if (run("gh", ["--version"]) === null) return fail("The GitHub CLI (gh) isn't installed. Run node setup.mjs, or install it from https://cli.github.com.");
  const login = output(run, "gh", ["api", "user", "--jq", ".login"]);
  if (!login) return fail("gh isn't signed in. Run: gh auth login --web -h github.com -p https");
  if (login.toLowerCase() !== origin.owner.toLowerCase()) {
    return fail(`gh is signed in as ${login}, but your fork belongs to ${origin.owner}. Run: gh auth switch --user ${origin.owner}`);
  }
  steps.push({ ok: true, text: `signed in to GitHub as ${login}, who owns ${repo}` });

  // `work` must be on GitHub before it can be the default branch.
  const pushed = output(run, "git", ["ls-remote", "--heads", "origin", "work"]);
  if (!pushed) return fail("Your work branch isn't on GitHub yet. Run: git push -u origin work");

  const defaultBranch = output(run, "gh", ["repo", "view", repo, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
  if (defaultBranch === "work") steps.push({ ok: true, text: "work is already the default branch" });
  else {
    if (output(run, "gh", ["repo", "edit", repo, "--default-branch", "work"]) === null) return fail(`couldn't make work the default branch of ${repo} (Settings > General > Default branch does the same)`);
    steps.push({ ok: true, text: `made work the default branch (was ${defaultBranch ?? "unknown"})` });
  }

  // GitHub turns Actions off in a new fork ("Workflows aren't being run on this forked repository"),
  // so pages.yml would never run. Turn them on for the repo, then the Pages workflow itself.
  const actionsOn = output(run, "gh", ["api", `repos/${repo}/actions/permissions`, "--jq", ".enabled"]);
  const workflow = output(run, "gh", ["api", `repos/${repo}/actions/workflows/pages.yml`, "--jq", ".state"]);
  if (workflow === null) return fail("Your work branch doesn't have .github/workflows/pages.yml yet. Merge this week's starter into work (git fetch upstream && git merge upstream/week-8), push, then run this again.");
  if (actionsOn === "true" && workflow === "active") steps.push({ ok: true, text: "GitHub Actions is already on for your fork" });
  else {
    const byHand = "(on GitHub: your fork's Actions tab > \"I understand my workflows, go ahead and enable them\")";
    if (actionsOn !== "true" && output(run, "gh", ["api", "-X", "PUT", `repos/${repo}/actions/permissions`, "-F", "enabled=true"]) === null) {
      return fail(`couldn't turn on GitHub Actions for ${repo} ${byHand}`);
    }
    if (workflow !== "active" && output(run, "gh", ["api", "-X", "PUT", `repos/${repo}/actions/workflows/pages.yml/enable`]) === null) {
      return fail(`couldn't turn on the Pages workflow for ${repo} ${byHand}`);
    }
    steps.push({ ok: true, text: "turned on GitHub Actions for your fork" });
  }

  // Pages, built by GitHub Actions.
  const buildType = output(run, "gh", ["api", `repos/${repo}/pages`, "--jq", ".build_type"]);
  if (buildType === "workflow") steps.push({ ok: true, text: "Pages is already on, built by GitHub Actions" });
  else {
    const method = buildType === null ? "POST" : "PUT"; // turn it on, or switch how it's built
    if (output(run, "gh", ["api", "-X", method, `repos/${repo}/pages`, "-f", "build_type=workflow"]) === null) {
      return fail(`couldn't turn on Pages for ${repo} (Settings > Pages > Source: GitHub Actions does the same)`);
    }
    steps.push({ ok: true, text: buildType === null ? "turned Pages on, built by GitHub Actions" : `switched Pages to build with GitHub Actions (was ${buildType})` });
  }

  const site = output(run, "gh", ["api", `repos/${repo}/pages`, "--jq", ".html_url"]) ?? `https://${origin.owner.toLowerCase()}.github.io/${origin.repo}/`;
  return { ok: true, steps, url: `${site.replace(/\/?$/, "/")}board/` };
}

function main(): void {
  const result = enablePages(commandRunner(process.cwd()));
  for (const step of result.steps) console.log(`${step.ok ? "✓" : "✗"} ${step.text}`);
  if (!result.ok || !result.url) {
    process.exitCode = 1;
    return;
  }
  console.log(`\nYour board will be at ${result.url}`);
  console.log("It's published each time you push work (the first time takes a minute or two: watch the Actions tab).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
