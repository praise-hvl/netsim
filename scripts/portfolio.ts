// `npm run portfolio`: turn your course work into a portfolio README, in three steps.
//   1. Export your history: your commits by week, your design notes, which week tests pass and when
//      each first went green → portfolio/HISTORY.md and portfolio/history.json.
//   2. Interview: about 8 questions about YOUR work, answered in your own words, no AI →
//      portfolio/answers.md. Stop any time; run it again to carry on.
//   3. Draft portfolio/README.draft.md from your answers and history, and offer to copy it to README.md.
//
//   --history        only step 1
//   --no-timeline    don't look for when each week first went green (it reruns tests at old commits)
//   --redo           ask every question again ('skip' keeps your previous answer)
//   --new-questions  pick the questions again from your latest history (answers you gave are kept)
//   --copy           copy the draft to README.md without asking
//   --zip            also bundle the repo, its git history and portfolio/ into portfolio/<repo>-portfolio.zip
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { collect, findFirstGreen, git, testsNow } from "./portfolio/collect";
import { copyDraftToReadme } from "./portfolio/copy";
import { mergeQuestions, parseAnswers, renderAnswers, selectQuestions, type Answered } from "./portfolio/questions";
import { buildReadme } from "./portfolio/readme";
import { renderHistory, type PortfolioHistory } from "./portfolio/report";

const flags = new Set(process.argv.slice(2));
const known = ["--history", "--no-timeline", "--redo", "--new-questions", "--copy", "--zip"];
for (const flag of flags) {
  if (!known.includes(flag)) {
    console.error(`unknown option ${flag}. Options: ${known.join(" ")}`);
    process.exit(1);
  }
}

const root = git(process.cwd(), "rev-parse", "--show-toplevel");
const out = join(root, "portfolio");
const file = (name: string) => join(out, name);
mkdirSync(out, { recursive: true });
writeFileSync(file(".gitignore"), "# made by --zip; too big for git\n*.zip\n");

/** One line from the terminal at a time; null when input ends (Ctrl-D, or the end of piped input). */
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const readLine = async (): Promise<string | null> => {
  const next = await lines.next();
  return next.done ? null : next.value;
};

// ── 1. History ──────────────────────────────────────────────────────────────

const previous = existsSync(file("history.json")) ? (JSON.parse(readFileSync(file("history.json"), "utf8")) as PortfolioHistory) : null;
const { history, commits } = collect(root, previous?.probes ?? {});
const own = history.weeks.reduce((sum, w) => sum + w.commits.length, 0);
console.log(`Your history: ${own} commits of your own over ${history.weeks.length} weeks, ${history.notes.length} notes.`);

console.log("Running your week tests (a minute or two)...");
const now = testsNow(root);
if (now === null) console.log("  couldn't run the tests (is `npm install` done?), so HISTORY.md leaves them out.");
history.tests = now ?? [];
if (now && !flags.has("--no-timeline")) {
  console.log("Finding when each week first went green (re-runs that week's tests at a few old commits)...");
  // With nothing uncommitted, the last commit's results are the ones just run.
  if (git(root, "status", "--porcelain", "--", ".", ":(exclude)portfolio") === "") {
    history.probes[git(root, "rev-parse", "HEAD")] = Object.fromEntries(now.map((t) => [t.week, t.status === "pass"]));
  }
  await findFirstGreen(root, history, commits, (text) => console.log(text));
  history.timeline = true;
}
writeFileSync(file("history.json"), `${JSON.stringify(history, null, 2)}\n`);
writeFileSync(file("HISTORY.md"), renderHistory(history));
console.log("Wrote portfolio/HISTORY.md and portfolio/history.json.\n");

// ── 2. Interview ────────────────────────────────────────────────────────────

let questions: Answered[] = [];
if (!flags.has("--history")) {
  const saved = existsSync(file("answers.md")) ? parseAnswers(readFileSync(file("answers.md"), "utf8")) : [];
  questions = mergeQuestions(saved, selectQuestions(history.weeks, history.notes), flags.has("--new-questions"));
  writeFileSync(file("answers.md"), renderAnswers(questions));
  await interview(questions, flags.has("--redo"));
}

/** Ask each question that still needs an answer, saving answers.md after every one. */
async function interview(all: Answered[], redo: boolean): Promise<void> {
  const todo = all.filter((q) => redo || q.answer === "");
  if (todo.length === 0) {
    console.log(`All ${all.length} questions are answered (portfolio/answers.md). --redo asks them again.\n`);
    return;
  }
  console.log(`Interview: ${todo.length} of ${all.length} questions. Answer in your own words, no AI: this becomes your README,`);
  console.log("and you may be asked about anything in it. Several lines are fine; an empty line ends an answer.");
  console.log("Type 'skip' to leave a question as it is (come back to it later), or 'stop' to save and stop.\n");
  for (const q of todo) {
    console.log(`── Question ${all.indexOf(q) + 1} of ${all.length} ──`);
    console.log(q.prompt);
    if (q.evidence) console.log(`   (from your history: ${q.evidence})`);
    if (q.answer) console.log(`   Your answer so far: ${q.answer}\n   ('skip' keeps it.)`);
    const typed: string[] = [];
    for (;;) {
      const line = await readLine();
      if (line === null || (typed.length === 0 && line.trim() === "stop")) {
        console.log("Saved. Run `npm run portfolio` again to carry on.\n");
        return;
      }
      if (typed.length === 0 && line.trim() === "skip") break;
      if (line.trim() === "") {
        if (typed.length > 0) break;
        continue; // blank lines before an answer starts don't count
      }
      typed.push(line);
    }
    if (typed.length) q.answer = typed.join("\n").trim();
    writeFileSync(file("answers.md"), renderAnswers(all));
    console.log("");
  }
  console.log("Interview done: portfolio/answers.md.\n");
}

// ── 3. README draft ─────────────────────────────────────────────────────────

if (!flags.has("--history")) {
  writeFileSync(file("README.draft.md"), buildReadme(history, questions, "../"));
  const missing = questions.filter((q) => q.answer === "").length;
  console.log(`Wrote portfolio/README.draft.md${missing ? ` (${missing} unanswered: ${missing === 1 ? "it's a TODO" : "they're TODOs"} in the draft)` : ""}.`);
  console.log('Every sentence from your answers or notes is marked <!-- your words … -->; "generated" marks what came from your history.');
  let copy = flags.has("--copy");
  if (!copy) {
    console.log("Copy it to README.md, the page people see first on GitHub? The course's README.md is kept as portfolio/README.before.md. [y/N]");
    copy = /^y(es)?$/i.test((await readLine())?.trim() ?? "");
  }
  if (copy) {
    copyDraftToReadme(root);
    console.log("Copied to README.md. Read it through, change anything, then commit and push.");
  }
}

// ── --zip ───────────────────────────────────────────────────────────────────

if (flags.has("--zip")) {
  if (git(root, "status", "--porcelain", "--", ".", ":(exclude)portfolio")) console.log("Note: uncommitted changes are not in the zip. Commit them first if they should be.");
  const zip = file(`${history.repo}-portfolio.zip`);
  const work = join(tmpdir(), `netsim-bundle-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    // repo.bundle is the whole git history: `git clone repo.bundle` gets it back.
    git(root, "bundle", "create", join(work, "repo.bundle"), "HEAD", "--branches");
    const portfolioFiles = ["HISTORY.md", "history.json", "answers.md", "README.draft.md"].filter((f) => existsSync(file(f)));
    git(
      root,
      "archive",
      "--format=zip",
      `--output=${zip}`,
      `--prefix=${history.repo}/portfolio/`,
      ...portfolioFiles.map((f) => `--add-file=${file(f)}`),
      `--add-file=${join(work, "repo.bundle")}`,
      `--prefix=${history.repo}/`,
      "HEAD",
      "--",
      ".",
      ":(exclude)portfolio",
    );
    console.log(`Wrote portfolio/${history.repo}-portfolio.zip (your code at ${history.head}, its git history as portfolio/repo.bundle, and portfolio/).`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

process.exit(0);
