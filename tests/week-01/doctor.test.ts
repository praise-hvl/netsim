// npm run doctor's checks, driven by a fake command runner so no network or GitHub account is
// needed. The first test is the real bug: doctor passed, then `git push` was refused.
import { describe, expect, it } from "vitest";
import { hasCredentialHelper, parseRemote, pushCheck, pushIdentity, runChecks, sshGreetingUser, summary, type RunResult, type Runner } from "@/scripts/doctor";

const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });
const failed = (stderr: string): RunResult => ({ code: 1, stdout: "", stderr });

/** A pretend laptop: answers each command from a table; unknown programs aren't installed. */
function laptop(answers: Record<string, RunResult | null>): Runner {
  return (command, args) => {
    const key = [command, ...args].join(" ");
    const found = Object.keys(answers).find((pattern) => key.startsWith(pattern));
    return found === undefined ? null : answers[found];
  };
}

const setUp = {
  "git --version": ok("git version 2.47.0"),
  "git config user.name": ok("Ada"),
  "git config user.email": ok("ada@example.com"),
  "git branch --show-current": ok("work"),
  "git remote get-url upstream": ok("https://github.com/praiseisaac/netsim.git"),
  "codex --version": ok("codex-cli 0.40.0"),
};

/** git can sign in over HTTPS (macOS keychain). */
const keychain = { "git config --get-all credential.helper": ok("osxkeychain") };

const check = (checks: ReturnType<typeof runChecks>, name: string) => checks.find((c) => c.name === name)!;

describe("the upstream check", () => {
  it("fails when upstream only fetches one branch (how gh repo clone links a fork), so later weeks would never arrive", () => {
    const run = laptop({ ...setUp, "git config --get-all remote.upstream.fetch": ok("+refs/heads/main:refs/remotes/upstream/main\n") });
    const upstream = check(runChecks(process.cwd(), run), "'upstream' remote set");
    expect(upstream.status).toBe("fail");
    expect(upstream.fix).toContain("git config --replace-all remote.upstream.fetch");
  });

  it("passes when upstream fetches every branch", () => {
    const run = laptop({ ...setUp, "git config --get-all remote.upstream.fetch": ok("+refs/tags/week-*:refs/remotes/upstream/week-*\n") });
    expect(check(runChecks(process.cwd(), run), "'upstream' remote set").status).toBe("pass");
  });
});

describe("the push check", () => {
  it("fails when git would push as a different account than the fork's owner", () => {
    const checks = runChecks(
      process.cwd(),
      laptop({ ...setUp, ...keychain, "git remote get-url origin": ok("https://github.com/ada/netsim.git"), "gh api user": ok("bob-old-account") }),
    );
    const push = check(checks, "you can push to your fork");
    expect(push.status).toBe("fail");
    expect(push.fix).toContain("git would push as bob-old-account but your fork belongs to ada");
    expect(push.fix).toContain("gh auth switch --user ada");
    expect(summary(checks).ok).toBe(false);
  });

  it("passes when the SSH key belongs to the fork's owner, through a host alias", () => {
    const run = laptop({
      ...setUp,
      "git remote get-url origin": ok("github-ada:ada/netsim.git"),
      "ssh -T -o BatchMode=yes -o ConnectTimeout=8 github-ada": failed("Hi ada! You've successfully authenticated, but GitHub does not provide shell access."),
    });
    expect(check(runChecks(process.cwd(), run), "you can push to your fork")).toMatchObject({ status: "pass", detail: "as ada" });
  });

  it("fails when GitHub doesn't know the SSH key", () => {
    const origin = parseRemote("git@github.com:ada/netsim.git")!;
    const identity = pushIdentity(origin, laptop({ ssh: failed("git@github.com: Permission denied (publickey).") }));
    expect(identity.kind).toBe("denied");
    expect(pushCheck(origin, identity).status).toBe("fail");
  });

  it("falls back to a dry-run push over HTTPS when gh isn't installed", () => {
    const origin = parseRemote("https://github.com/ada/netsim")!;
    expect(pushIdentity(origin, laptop({ ...keychain, "git push --dry-run": ok() }))).toEqual({ kind: "can-push" });
    const refused = pushIdentity(origin, laptop({ ...keychain, "git push --dry-run": failed("remote: Permission to ada/netsim.git denied to bob.\nfatal: ... 403") }));
    expect(pushCheck(origin, refused).status).toBe("fail");
  });

  it("fails over HTTPS when git has no credential helper, even though gh is logged in", () => {
    // What happened on a real Mac: git asked for a password, and GitHub rejected it.
    const checks = runChecks(
      process.cwd(),
      laptop({ ...setUp, "git remote get-url origin": ok("https://github.com/ada/netsim.git"), "gh api user": ok("ada") }),
    );
    const push = check(checks, "you can push to your fork");
    expect(push.status).toBe("fail");
    expect(push.fix).toBe(
      "git has no way to sign in to GitHub and would ask for a password, which GitHub rejects: run `gh auth setup-git` (after `gh auth login`).",
    );
  });

  it("accepts a credential helper set just for github.com (what gh auth setup-git writes)", () => {
    const run = laptop({ "git config --get-all credential.https://github.com.helper": ok("\n!/opt/homebrew/bin/gh auth git-credential") });
    expect(hasCredentialHelper("github.com", run)).toBe(true);
    expect(hasCredentialHelper("github.com", laptop({}))).toBe(false);
    const checks = runChecks(
      process.cwd(),
      laptop({
        ...setUp,
        "git config --get-all credential.https://github.com.helper": ok("!/opt/homebrew/bin/gh auth git-credential"),
        "git remote get-url origin": ok("https://github.com/ada/netsim.git"),
        "gh api user": ok("ada"),
      }),
    );
    expect(check(checks, "you can push to your fork")).toMatchObject({ status: "pass", detail: "as ada" });
  });

  it("doesn't need a credential helper over SSH", () => {
    const origin = parseRemote("git@github.com:ada/netsim.git")!;
    expect(pushIdentity(origin, laptop({ ssh: failed("Hi ada! You've successfully authenticated, but GitHub does not provide shell access.") }))).toEqual({
      kind: "account",
      login: "ada",
      via: "ssh",
    });
  });

  it("only warns when there's no network, and says to run it again", () => {
    const checks = runChecks(
      process.cwd(),
      laptop({ ...setUp, "git remote get-url origin": ok("git@github.com:ada/netsim.git"), ssh: failed("ssh: Could not resolve hostname github.com") }),
    );
    expect(check(checks, "you can push to your fork").status).toBe("warn");
    const { line } = summary(checks.map((c) => (c.name === "you can push to your fork" ? c : { ...c, status: "pass" as const })));
    expect(line).toBe("doctor: 7 of 8 checks passed; 1 couldn't run without a network, run it again when you're online");
  });
});

describe("origin is your fork", () => {
  it.each([
    ["the same https URL", "https://github.com/praiseisaac/netsim.git"],
    ["the starter over SSH", "git@github.com:praiseisaac/netsim.git"],
    ["the starter with different case and no .git", "https://github.com/PraiseIsaac/NetSim"],
  ])("fails for %s", (_name, url) => {
    const checks = runChecks(process.cwd(), laptop({ ...setUp, "git remote get-url origin": ok(url) }));
    expect(check(checks, "origin is your fork").status).toBe("fail");
    expect(check(checks, "you can push to your fork").status).toBe("fail");
  });

  it("fails when origin is the same repo as upstream, even if that isn't the course starter", () => {
    const run = laptop({
      ...setUp,
      "git remote get-url upstream": ok("https://github.com/someone/copy.git"),
      "git remote get-url origin": ok("git@github.com:someone/copy.git"),
    });
    expect(check(runChecks(process.cwd(), run), "origin is your fork").status).toBe("fail");
  });
});

describe("reading remote URLs", () => {
  it.each([
    ["https://github.com/ada/netsim.git", { protocol: "https", owner: "ada", repo: "netsim" }],
    ["https://ada@github.com/ada/netsim/", { protocol: "https", owner: "ada", repo: "netsim" }],
    ["git@github.com:ada/netsim.git", { protocol: "ssh", sshTarget: "git@github.com", owner: "ada", repo: "netsim" }],
    ["ssh://git@github.com:22/ada/netsim.git", { protocol: "ssh", sshTarget: "git@github.com", sshPort: "22", owner: "ada", repo: "netsim" }],
    ["github-ada:ada/netsim", { protocol: "ssh", sshTarget: "github-ada", owner: "ada", repo: "netsim" }],
  ])("%s", (url, expected) => {
    expect(parseRemote(url)).toMatchObject(expected);
  });

  it("gives up on things that aren't GitHub repos", () => {
    expect(parseRemote("../starter.git")).toBeNull();
    expect(parseRemote("/home/ada/netsim")).toBeNull();
  });

  it("reads the account from GitHub's SSH greeting", () => {
    expect(sshGreetingUser("Hi ada-l! You've successfully authenticated, but GitHub does not provide shell access.")).toBe("ada-l");
    expect(sshGreetingUser("Permission denied (publickey).")).toBeNull();
  });
});

describe("the push check, for the account NetSim Studio uses", () => {
  const origin = parseRemote("https://github.com/ada/netsim.git")!;
  /** gh knows ada and bob, with bob its own in use; records each command and the env it got. */
  function twoAccounts(tokens: Record<string, string> = { ada: "gho_ADAtoken1" }) {
    const calls: { line: string; env?: Record<string, string> }[] = [];
    const run: Runner = (command, args, env) => {
      const line = [command, ...args].join(" ");
      calls.push({ line, env });
      if (line === "git config --get-all credential.https://github.com.helper") return ok("!gh auth git-credential");
      if (line === "gh config get -h github.com user") return ok("bob");
      if (line === "gh auth token -h github.com --user ada") return tokens.ada ? ok(tokens.ada) : failed("no oauth token found for github.com account ada");
      if (line === "gh api user --jq .login") return ok(env?.GH_TOKEN === tokens.ada ? "ada" : "bob");
      return null;
    };
    return { run, calls };
  }

  it("checks the studio's account (ada), not gh's own (bob), with ada's token on that one gh command only", () => {
    const { run, calls } = twoAccounts();
    expect(pushIdentity(origin, run, "ada")).toEqual({ kind: "account", login: "ada", via: "studio" });
    const withToken = calls.filter((c) => c.env?.GH_TOKEN);
    expect(withToken.map((c) => c.line)).toEqual(["gh api user --jq .login"]);
    expect(calls.every((c) => !c.line.includes("gho_ADAtoken1"))).toBe(true); // never on a command line
    expect(pushCheck(origin, pushIdentity(origin, run, "ada"))).toMatchObject({ status: "pass", detail: "as ada" });
  });

  it("the studio's account isn't the fork's owner: says to pick the owner in the studio, not gh auth switch", () => {
    const { run } = twoAccounts({ ada: "gho_ADAtoken1", carol: "gho_C" });
    const other = parseRemote("https://github.com/carol/netsim.git")!;
    const push = pushCheck(other, pushIdentity(other, run, "ada"));
    expect(push.status).toBe("fail");
    expect(push.fix).toContain('pick carol with "Use a different account"');
    expect(push.fix).not.toContain("gh auth switch");
  });

  it("the studio's account was signed out of gh: says so, and how to sign back in", () => {
    const { run } = twoAccounts({});
    expect(pushIdentity(origin, run, "ada")).toEqual({ kind: "signed-out", login: "ada" });
    expect(pushCheck(origin, pushIdentity(origin, run, "ada"))).toMatchObject({ status: "fail", detail: "ada isn't signed in to gh on this laptop" });
  });

  it("a terminal token's account that isn't gh's own (from=token): the doctor takes the studio's word, and passes", () => {
    const { run, calls } = twoAccounts();
    expect(pushIdentity(origin, run, "ada", "token")).toEqual({ kind: "account", login: "ada", via: "studio" });
    expect(pushCheck(origin, pushIdentity(origin, run, "ada", "token"))).toMatchObject({ status: "pass", detail: "as ada" });
    expect(calls.filter((c) => c.line.startsWith("gh "))).toEqual([]); // it asked gh nothing: the token is the terminal's, not gh's
  });

  it("run by the studio, a mismatch never says gh auth switch: it points at step 5", () => {
    const { run } = twoAccounts();
    const other = parseRemote("https://github.com/carol/netsim.git")!;
    for (const [account, from] of [["bob", undefined], ["ada", "token"]] as const) {
      const push = pushCheck(other, pushIdentity(other, run, account, from));
      expect(push.status).toBe("fail");
      expect(push.fix).not.toContain("gh auth switch");
      expect(push.fix).toContain("step 5");
    }
  });

  it("the studio's account is gh's own: gh's answer, as the studio's; none given: exactly as before", () => {
    const { run, calls } = twoAccounts();
    expect(pushIdentity(origin, run, "bob")).toEqual({ kind: "account", login: "bob", via: "studio" });
    expect(pushIdentity(origin, run)).toEqual({ kind: "account", login: "bob", via: "gh" });
    expect(pushIdentity(origin, run, "not a login;rm")).toEqual({ kind: "account", login: "bob", via: "gh" });
    expect(calls.some((c) => c.env?.GH_TOKEN)).toBe(false);
    expect(calls.some((c) => c.line.startsWith("gh auth token"))).toBe(false);
  });
});
