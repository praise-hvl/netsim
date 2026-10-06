// npm run portfolio's pure parts: grouping the history by week, reading design notes, choosing the
// interview questions, answers.md, and assembling the README without changing the student's words.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyDraftToReadme, draftToRoot } from "@/scripts/portfolio/copy";
import { groupByWeek, LOG_FORMAT, mergedWeek, notableCommits, ownCommits, pagesUrl, parseLog, taskOf, type Commit } from "@/scripts/portfolio/history";
import { decisions, openQuestions, parseNote, tableRows } from "@/scripts/portfolio/notes";
import { INTERVIEW_LENGTH, mergeQuestions, parseAnswers, renderAnswers, selectQuestions, type Answered } from "@/scripts/portfolio/questions";
import { buildReadme } from "@/scripts/portfolio/readme";
import { firstPassing, renderHistory, weekResults, type PortfolioHistory } from "@/scripts/portfolio/report";

let n = 0;
function commit(subject: string, opts: Partial<Commit> = {}): Commit {
  n++;
  return {
    hash: String(n).padStart(40, "0"),
    short: `c${String(n).padStart(6, "0")}`,
    date: `2026-09-${String(n).padStart(2, "0")}T10:00:00+00:00`,
    author: "Ada",
    email: "ada@example.com",
    parents: ["p"],
    subject,
    body: "",
    files: [{ path: "core/cpu-core.ts", added: 10, removed: 1 }],
    ...opts,
  };
}
const merge = (week: number) =>
  commit(`Merge remote-tracking branch 'upstream/week-${week}-start' into work`, { parents: ["p", `tip${week}`], files: [] });

// The region markers are spelled out at run time: written literally, the week-branch generator
// would take them for real regions in this file.
const NOTE = `# Week 2 design note: The machine and its bus

Write in your own words: this is the course's instruction text.

## 1. The goal

One or two sentences: the course's prompt.

<!-- STUDENT week=2 part=home id=design-02-goal "Say what this part does" -->
<!-- TODO(week 2, design-02-goal): Say what this part does -->
The bus is how every part talks, one tick at a time.
<!-- END -->

## 6. The board

<!-- STUDENT week=2 part=home id=design-02-board "Photograph your sketch" -->
<!-- @stub ![My board sketch](week-02-board.jpg) -->
![My board sketch](week-02-board.png)

The bus is a lane across the middle.
<!-- END -->

## 7. Decisions

<!-- STUDENT week=2 part=home id=design-02-decisions "Fill in the table" -->
| Decision | What I chose | What I didn't, and why |
|---|---|---|
| Memory layout | a 32 × 32 grid | one long row: it won't fit |
| | | |
<!-- END -->

## 8. Questions I still have

<!-- STUDENT week=2 part=home id=design-02-questions "What are you unsure about" -->
- What should the board show when a request faults?
<!-- END -->

## 9. Agent brief

<!-- STUDENT week=2 part=home id=design-02-brief "Fill in the brief" -->
| Line | Text |
|---|---|
| | |
<!-- END -->
`.replaceAll("STUDENT", "@student").replaceAll("<!-- END -->", "<!-- @end -->");

describe("history", () => {
  it("parses git log --numstat output, bodies and binary files included", () => {
    const raw = [
      "\x1eaaaa1111\x1faaaa111\x1f2026-09-08T10:00:00-05:00\x1fAda\x1fada@example.com\x1fparent1\x1fweek 1\x1fbody line\nsecond\x1f\n",
      "3\t1\tdocs/notes/week-01.md\n-\t-\tdocs/notes/week-02-board.png\n",
      "\x1ebbbb2222\x1fbbbb222\x1f2026-09-15T10:00:00-05:00\x1fAda\x1fada@example.com\x1fparent2 tip2\x1fMerge branch 'week-2-start'\x1f\x1f\n",
    ].join("");
    expect(LOG_FORMAT).toContain("%x1e");
    const [first, second] = parseLog(raw);
    expect(first).toMatchObject({ short: "aaaa111", subject: "week 1", body: "body line\nsecond", parents: ["parent1"] });
    expect(first.files).toEqual([
      { path: "docs/notes/week-01.md", added: 3, removed: 1 },
      { path: "docs/notes/week-02-board.png", added: 0, removed: 0 },
    ]);
    expect(second.parents).toEqual(["parent2", "tip2"]);
    expect(mergedWeek(second)).toBe(2);
  });

  it("reads the week and task from commit messages", () => {
    expect(taskOf("week 5: execute-rest")).toEqual({ week: 5, task: "execute-rest" });
    expect(taskOf("Week 3 - decode")).toEqual({ week: 3, task: "decode" });
    expect(taskOf("week 2")).toEqual({ week: 2 });
    expect(taskOf("weekend fixes")).toBeNull();
    expect(mergedWeek(commit("week 3: decode"))).toBeNull();
  });

  it("groups commits by the week merged in before them, unless the message names a week", () => {
    const w1 = commit("week 1");
    const m2 = merge(2);
    const note = commit("design note draft");
    const m3 = merge(3);
    const late = commit("week 2: finish the sketch");
    const decode = commit("week 3: decode");
    const pull = commit("Merge branch 'work' of github.com:ada/netsim-starter", { parents: ["p", "q"] });
    const weeks = groupByWeek([w1, m2, note, m3, late, decode, pull]);
    expect(weeks.map((w) => [w.week, w.start?.short, w.commits.map((c) => c.subject)])).toEqual([
      [1, undefined, ["week 1"]],
      [2, m2.short, ["design note draft", "week 2: finish the sketch"]],
      [3, m3.short, ["week 3: decode"]],
    ]);
    expect(weeks[2].topic).toMatch(/bus \+ memory/);
  });

  it("starts at the week the work branch was made from", () => {
    expect(groupByWeek([commit("first try")], 3).map((w) => w.week)).toEqual([3]);
  });

  it("leaves out the course's own commits but keeps the week merges", () => {
    const starter = commit("week-1-start", { email: "praise@example.com" });
    const m2 = merge(2);
    const mine = commit("week 2");
    expect(ownCommits([starter, m2, mine], new Set(["praise@example.com"]))).toEqual([m2, mine]);
  });

  it("picks the biggest code commit of each week to ask about, tests and notes don't count", () => {
    const small = commit("week 3: decode", { files: [{ path: "core/isa.ts", added: 5, removed: 0 }] });
    const big = commit("week 3: fetch", { files: [{ path: "core/cpu-core.ts", added: 50, removed: 2 }] });
    const notes = commit("week 2", { files: [{ path: "docs/notes/week-02.md", added: 300, removed: 0 }] });
    const tests = commit("week 5: my assertion", { files: [{ path: "tests/week-05/x.test.ts", added: 400, removed: 0 }] });
    const weeks = groupByWeek([notes, small, big, tests]);
    expect(notableCommits(weeks, 2).map((p) => p.commit.subject)).toEqual(["week 3: fetch"]);
  });

  it("turns the fork's remote into its GitHub Pages address", () => {
    expect(pagesUrl("https://github.com/Ada/netsim-starter.git")).toBe("https://ada.github.io/netsim-starter/");
    expect(pagesUrl("git@github.com:ada/netsim-starter.git")).toBe("https://ada.github.io/netsim-starter/");
    expect(pagesUrl("/tmp/some/local/repo")).toBeNull();
  });
});

describe("notes", () => {
  const note = parseNote(2, "docs/notes/week-02.md", NOTE);

  it("keeps only the student's words: region bodies, no instructions, comments or empty tables", () => {
    expect(note.title).toBe("Week 2 design note: The machine and its bus");
    expect(note.sections.map((s) => s.heading)).toEqual(["1. The goal", "6. The board", "7. Decisions", "8. Questions I still have"]);
    expect(note.sections[0].text).toBe("The bus is how every part talks, one tick at a time.");
    expect(note.sketch).toBe("week-02-board.png");
  });

  it("reads the decisions table and the open questions", () => {
    expect(decisions(note)).toEqual([{ decision: "Memory layout", chose: "a 32 × 32 grid", didnt: "one long row: it won't fit" }]);
    expect(openQuestions(note)).toEqual(["What should the board show when a request faults?"]);
    expect(tableRows("| a | b |\n|---|---|\n| | |\n| 1 | 2 |")).toEqual([["1", "2"]]);
  });

  it("reads a note without regions whole", () => {
    expect(parseNote(7, "docs/notes/week-07.md", "# Reflection\n\n## What surprised me\n\nThe barrier.\n").sections).toEqual([
      { heading: "What surprised me", text: "The barrier." },
    ]);
  });
});

describe("interview questions", () => {
  const weeks = groupByWeek([commit("week 1", { files: [{ path: "docs/notes/week-01.md", added: 9, removed: 0 }] }), merge(3), commit("week 3: fetch"), merge(5), commit("week 5: execute-rest")]);
  const notes = [parseNote(2, "docs/notes/week-02.md", NOTE)];

  it("asks about 8 questions: what you built, then your own commits and notes, then the fixed ones", () => {
    const qs = selectQuestions(weeks, notes);
    expect(qs).toHaveLength(INTERVIEW_LENGTH);
    expect(qs[0].id).toBe("summary");
    expect(qs.slice(-4).map((q) => q.id)).toEqual(["hardest-bug", "interrupt", "change-decision", "next"]);
    const grounded = qs.slice(1, 4);
    expect(grounded[0].prompt).toMatch(/^In week \d you committed \w+ "week \d: [\w-]+"/);
    expect(grounded[0].evidence).toMatch(/core\/cpu-core\.ts/);
    expect(grounded[1]).toMatchObject({ id: "note-2-decision", use: "decision" });
    expect(grounded[1].prompt).toContain("a 32 × 32 grid");
    expect(grounded[2].prompt).toContain("What should the board show when a request faults?");
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it("is the same every time for the same history", () => {
    expect(selectQuestions(weeks, notes)).toEqual(selectQuestions(weeks, notes));
  });

  it("falls back to general questions when there's little history", () => {
    const qs = selectQuestions([], []);
    expect(qs).toHaveLength(INTERVIEW_LENGTH);
    expect(qs.map((q) => q.id)).toContain("proud");
  });

  it("answers.md round-trips, multi-line answers and unanswered questions included", () => {
    const qs: Answered[] = selectQuestions(weeks, notes).map((q, i) => ({ ...q, answer: i === 1 ? "" : `Answer ${i}.\n\nSecond paragraph, with **bold** and \`code\`.` }));
    expect(parseAnswers(renderAnswers(qs))).toEqual(qs);
    expect(renderAnswers(qs)).toContain("_(not answered yet)_");
  });

  it("keeps the saved questions on a rerun; reselecting keeps every answer", () => {
    const saved: Answered[] = [
      { id: "summary", use: "summary", prompt: "old wording", answer: "A computer." },
      { id: "commit-gone", use: "decision", prompt: "about a commit", answer: "It was the scheduler." },
      { id: "commit-unanswered", use: "decision", prompt: "about another", answer: "" },
    ];
    const fresh = selectQuestions(weeks, notes);
    expect(mergeQuestions(saved, fresh, false)).toEqual(saved);
    const reselected = mergeQuestions(saved, fresh, true);
    expect(reselected.find((q) => q.id === "summary")).toMatchObject({ prompt: fresh[0].prompt, answer: "A computer." });
    expect(reselected.find((q) => q.id === "commit-gone")?.answer).toBe("It was the scheduler.");
    expect(reselected.some((q) => q.id === "commit-unanswered")).toBe(false);
    expect(mergeQuestions([], fresh, false).every((q) => q.answer === "")).toBe(true);
  });
});

describe("tests and timeline", () => {
  it("counts passes and failures per week; files outside the week folders don't count", () => {
    const results = weekResults({
      testResults: [
        { name: "/r/tests/week-03/a.test.ts", assertionResults: [{ status: "passed" }, { status: "passed" }] },
        { name: "/r/tests/week-03/b.test.ts", assertionResults: [{ status: "failed" }, { status: "skipped" }] },
        { name: "/r/tests/week-05/broken.test.ts", status: "failed", assertionResults: [] },
        { name: "/r/tests/tools/portfolio.test.ts", assertionResults: [{ status: "failed" }] },
      ],
    });
    expect([...results]).toEqual([
      [3, { passed: 2, failed: 1 }],
      [5, { passed: 0, failed: 1 }],
    ]);
  });

  it("finds the first passing commit with few test runs", async () => {
    const green = [false, false, false, true, true, true, true, true];
    const tried: number[] = [];
    const first = await firstPassing([0, 1, 2, 3, 4, 5, 6, 7], async (i) => (tried.push(i), green[i]));
    expect(first).toBe(3);
    expect(tried.length).toBeLessThanOrEqual(4);
    expect(await firstPassing([0, 1], async () => false)).toBeUndefined();
    expect(await firstPassing([], async () => true)).toBeUndefined();
  });
});

describe("HISTORY.md and the README draft", () => {
  const w1 = commit("week 1", { files: [{ path: "docs/notes/week-01.md", added: 20, removed: 0 }] });
  const m3 = merge(3);
  const fetch = commit("week 3: fetch");
  const history: PortfolioHistory = {
    exportedAt: "2026-11-02T12:00:00.000Z",
    branch: "work",
    head: "abc1234",
    repo: "netsim-starter",
    pagesUrl: "https://ada.github.io/netsim-starter/",
    weeks: groupByWeek([w1, m3, fetch]),
    notes: [parseNote(2, "docs/notes/week-02.md", NOTE)],
    tests: [
      { week: 1, status: "pass", passed: 4, failed: 0, firstGreen: { short: w1.short, date: w1.date } },
      { week: 3, status: "fail", passed: 10, failed: 2 },
    ],
    timeline: true,
    screenshots: ["docs/screenshots/board.gif"],
    probes: {},
  };
  const answers: Answered[] = selectQuestions(history.weeks, history.notes).map((q) => ({ ...q, answer: "" }));
  answers[0].answer = "i built a tiny computer.  It has 2 cores and a bus,\nand you can watch it run";
  answers.find((q) => q.id === "hardest-bug")!.answer = "The tick never ended because memory forgot tick.done.";
  answers.find((q) => q.id.startsWith("commit-"))!.answer = "Fetch asks memory for 4 bytes.";

  it("HISTORY.md shows tests, weeks, commits and the notes, with links that work from portfolio/", () => {
    const md = renderHistory(history);
    expect(md).toContain("| 1 | Setup & system roles | ✅ 4 passing |");
    expect(md).toContain("| 3 | Build: bus + memory on screen | ❌ 2 failing, 10 passing | – |");
    expect(md).toContain("## Week 3 · Build: bus + memory on screen");
    expect(md).toContain(`merged week 3 in \`${m3.short}\``);
    expect(md).toContain(`- \`${fetch.short}\` 2026-09-`);
    expect(md).toContain("**fetch**");
    expect(md).toContain("## Week 2 · Design: the machine and its bus");
    expect(md).toContain("![My board sketch](../docs/notes/week-02-board.png)");
    expect(md).toContain("![docs/screenshots/board.gif](../docs/screenshots/board.gif)");
  });

  it("copies answers word for word and marks where every part came from", () => {
    const md = buildReadme(history, answers, "../");
    expect(md).toContain("<!-- your words: answers.md, question 1 -->\ni built a tiny computer.  It has 2 cores and a bus,\nand you can watch it run\n");
    expect(md).toContain("**The hardest bug.** The tick never ended because memory forgot tick.done.");
    expect(md).toContain(`**Commit \`${fetch.short}\` (week 3: fetch).** Fetch asks memory for 4 bytes.`);
    expect(md).toContain("<!-- your words: docs/notes/week-02.md, The goal -->\nThe bus is how every part talks, one tick at a time.");
    expect(md).toContain("| 2 | Memory layout | a 32 × 32 grid | one long row: it won't fit |");
    expect(md).toContain("[Open the live board](https://ada.github.io/netsim-starter/)");
    expect(md).toContain("![The board running](../docs/screenshots/board.gif)");
    expect(md).toMatch(/<!-- generated from your history[^>]*-->\n\| Week \| What \| Commits \| Tests \|/);
  });

  it("leaves a TODO for every unanswered question instead of writing one", () => {
    const md = buildReadme(history, answers, "../");
    const unanswered = answers.filter((q) => q.answer === "");
    for (const q of unanswered) expect(md).toContain(`("${q.prompt}") with npm run portfolio -->`);
    expect(md.match(/<!-- TODO: answer question/g)).toHaveLength(unanswered.length);
  });

  it("copying the draft to README.md rewrites its links for the repo root, edits included", () => {
    const root = mkdtempSync(join(tmpdir(), "portfolio-copy-"));
    try {
      mkdirSync(join(root, "portfolio"));
      writeFileSync(join(root, "README.md"), "# The course README\n");
      const draft = buildReadme(history, answers, "../");
      expect(draft).toContain("](../docs/");
      // A student's own edit to the draft, an HTML image, and links that must stay as they are.
      const edited = `${draft}\n<img src="../docs/screenshots/board.gif" width="400">\n[site](https://example.com/../x) ![root](docs/a.png)\n`;
      writeFileSync(join(root, "portfolio", "README.draft.md"), edited);

      copyDraftToReadme(root);
      const readme = readFileSync(join(root, "README.md"), "utf8");
      expect(readme).not.toMatch(/\]\(\.\.\/|="\.\.\//);
      expect(readme).toContain("![The board running](docs/screenshots/board.gif)");
      expect(readme).toContain("![Week 2 board sketch](docs/notes/week-02-board.png)");
      expect(readme).toContain("[portfolio/HISTORY.md](portfolio/HISTORY.md)");
      expect(readme).toContain('<img src="docs/screenshots/board.gif" width="400">');
      expect(readme).toContain("[site](https://example.com/../x) ![root](docs/a.png)");
      // Every link it points at is a real path from the root.
      for (const [, target] of readme.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (!/^https?:/.test(target)) expect(target, target).toMatch(/^(docs|portfolio)\//);
      }
      expect(readFileSync(join(root, "portfolio", "README.before.md"), "utf8")).toBe("# The course README\n");

      // Copying again keeps the course README as the backup, not the portfolio one.
      copyDraftToReadme(root);
      expect(readFileSync(join(root, "portfolio", "README.before.md"), "utf8")).toBe("# The course README\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(existsSync(root)).toBe(false);
  });

  it("a copied draft is exactly the README built for the root", () => {
    expect(draftToRoot(buildReadme(history, answers, "../"))).toBe(buildReadme(history, answers, ""));
  });

  it("links from the repo root when it becomes README.md", () => {
    const md = buildReadme(history, answers, "");
    expect(md).toContain("![The board running](docs/screenshots/board.gif)");
    expect(md).toContain("[portfolio/HISTORY.md](portfolio/HISTORY.md)");
    expect(md).not.toContain("](../");
  });
});
