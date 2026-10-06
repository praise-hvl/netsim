// npm run pages:enable, against a pretend git and gh: what it changes, and what it says when it can't.
import { describe, expect, it } from "vitest";
import type { Runner } from "@/scripts/doctor";
import { enablePages } from "@/scripts/pages-enable";

type Fork = {
  origin?: string;
  gh?: boolean;
  login?: string | null;
  workPushed?: boolean;
  defaultBranch?: string;
  /** Actions for the whole repo, and the Pages workflow's state. A new fork: false, "disabled_fork". */
  actions?: boolean;
  workflow?: string | null;
  pages?: string | null;
  refuse?: boolean;
};

/** A pretend fork; `calls` records every command that changed something. */
function fake(fork: Fork = {}) {
  const state = {
    defaultBranch: fork.defaultBranch ?? "main",
    actions: fork.actions ?? false,
    workflow: fork.workflow === undefined ? "disabled_fork" : fork.workflow,
    pages: fork.pages === undefined ? null : fork.pages,
  };
  const calls: string[] = [];
  const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
  const no = { code: 1, stdout: "", stderr: "nope" };
  const run: Runner = (command, args) => {
    const line = [command, ...args].join(" ");
    if (line === "git remote get-url origin") return ok(fork.origin ?? "https://github.com/ada/netsim-starter.git");
    if (line === "git ls-remote --heads origin work") return ok(fork.workPushed === false ? "" : "abc123\trefs/heads/work");
    if (command !== "gh") return no;
    if (fork.gh === false) return null;
    if (line === "gh --version") return ok("gh version 2.60.0");
    if (line === "gh api user --jq .login") return fork.login === null ? no : ok(fork.login ?? "ada");
    if (line.startsWith("gh repo view")) return ok(state.defaultBranch);
    if (line.startsWith("gh repo edit")) {
      calls.push(line);
      if (fork.refuse) return no;
      state.defaultBranch = "work";
      return ok();
    }
    if (line.endsWith("actions/permissions --jq .enabled")) return ok(String(state.actions));
    if (line.endsWith("actions/workflows/pages.yml --jq .state")) return state.workflow === null ? no : ok(state.workflow);
    if (line.includes("-X PUT") && line.includes("/actions/")) {
      calls.push(line);
      if (fork.refuse) return no;
      if (line.includes("permissions")) state.actions = true;
      else state.workflow = "active";
      return ok();
    }
    if (line.endsWith("--jq .build_type")) return state.pages === null ? no : ok(state.pages);
    if (line.endsWith("--jq .html_url")) return state.pages === null ? no : ok("https://ada.github.io/netsim-starter/");
    if (line.startsWith("gh api -X")) {
      calls.push(line);
      if (fork.refuse) return no;
      state.pages = "workflow";
      return ok();
    }
    return no;
  };
  return { run, calls };
}

describe("npm run pages:enable", () => {
  it("makes work the default branch, turns Actions and Pages on, and prints the board's address", () => {
    const { run, calls } = fake();
    const result = enablePages(run);
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://ada.github.io/netsim-starter/board/");
    expect(calls).toEqual([
      "gh repo edit ada/netsim-starter --default-branch work",
      "gh api -X PUT repos/ada/netsim-starter/actions/permissions -F enabled=true",
      "gh api -X PUT repos/ada/netsim-starter/actions/workflows/pages.yml/enable",
      "gh api -X POST repos/ada/netsim-starter/pages -f build_type=workflow",
    ]);
    expect(result.steps.map((s) => s.text)).toEqual([
      "signed in to GitHub as ada, who owns ada/netsim-starter",
      "made work the default branch (was main)",
      "turned on GitHub Actions for your fork",
      "turned Pages on, built by GitHub Actions",
    ]);
  });

  it("changes nothing the second time", () => {
    const { run, calls } = fake({ defaultBranch: "work", actions: true, workflow: "active", pages: "workflow" });
    const result = enablePages(run);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
    expect(result.steps.map((s) => s.text)).toContain("GitHub Actions is already on for your fork");
    expect(result.steps.map((s) => s.text)).toContain("Pages is already on, built by GitHub Actions");
  });

  it("switches Pages that was publishing from a branch", () => {
    const { run, calls } = fake({ pages: "legacy" });
    expect(enablePages(run).ok).toBe(true);
    expect(calls).toContain("gh api -X PUT repos/ada/netsim-starter/pages -f build_type=workflow");
  });

  it.each<[string, Fork, RegExp]>([
    ["gh isn't installed", { gh: false }, /isn't installed/],
    ["gh isn't signed in", { login: null }, /gh auth login --web/],
    ["the fork isn't theirs", { login: "someone-else" }, /signed in as someone-else, but your fork belongs to ada\. Run: gh auth switch --user ada/],
    ["origin isn't GitHub", { origin: "/some/folder" }, /origin isn't a GitHub repo/],
    ["work isn't pushed", { workPushed: false }, /git push -u origin work/],
    ["GitHub refuses", { refuse: true }, /Settings > General > Default branch/],
    ["GitHub refuses Actions", { defaultBranch: "work", refuse: true }, /Actions tab > "I understand my workflows, go ahead and enable them"/],
    ["work has no pages.yml yet", { workflow: null }, /git merge upstream\/week-8/],
  ])("stops with a fix when %s", (_, fork, fix) => {
    const { run } = fake(fork);
    const result = enablePages(run);
    expect(result.ok).toBe(false);
    expect(result.url).toBeNull();
    expect(result.steps.at(-1)).toEqual({ ok: false, text: expect.stringMatching(fix) });
  });

  it("turns on only the Pages workflow when Actions is already on for the repo", () => {
    const { run, calls } = fake({ defaultBranch: "work", actions: true, pages: "workflow" });
    expect(enablePages(run).ok).toBe(true);
    expect(calls).toEqual(["gh api -X PUT repos/ada/netsim-starter/actions/workflows/pages.yml/enable"]);
  });

  it("accepts an SSH origin and a differently-cased owner", () => {
    const { run } = fake({ origin: "git@github.com:Ada/netsim-starter.git" });
    expect(enablePages(run).ok).toBe(true);
  });
});
