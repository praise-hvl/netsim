// The README draft: the student's answers and notes, assembled and given structure. Nothing here
// writes a sentence for them. Their words are copied unchanged and marked `<!-- your words … -->`;
// everything built from the history (timeline, links, commands) is marked `<!-- generated … -->`;
// an unanswered question leaves a TODO, never filler. Pure.
import { TOPICS } from "./history";
import { decisions, sectionText } from "./notes";
import type { Answered, Use } from "./questions";
import type { PortfolioHistory } from "./report";

const GENERATED = "<!-- generated from your history: check it, change it or delete it -->";
const yours = (source: string) => `<!-- your words: ${source} -->`;

/** A bold label for an answer, from its question: the label is structure, the answer is theirs. */
function label(q: Answered): string {
  const commit = /^commit-(\w+)$/.exec(q.id);
  const subject = /committed \w+ "(.*)"\./.exec(q.prompt)?.[1];
  if (commit) return `**Commit \`${commit[1]}\`${subject ? ` (${subject})` : ""}.** `;
  if (/^note-\d+-decision$/.test(q.id)) return "**A decision from my design notes.** ";
  if (/^note-\d+-question$/.test(q.id)) return "**A question I answered by building it.** ";
  const labels: Record<string, string> = {
    "hardest-bug": "The hardest bug.",
    interrupt: "How an interrupt reaches a core.",
    "change-decision": "What I'd do differently.",
    proud: "The part I'm proudest of.",
    tick: "One tick, step by step.",
    board: "The board.",
  };
  return labels[q.id] ? `**${labels[q.id]}** ` : "";
}

/** The answers that go in one part of the README, each marked with the question it answers. */
function answers(all: readonly Answered[], use: Use): string[] {
  return all.flatMap((q, i) => {
    if (q.use !== use) return [];
    if (!q.answer.trim()) return [`<!-- TODO: answer question ${i + 1} ("${q.prompt}") with npm run portfolio -->`, ""];
    return [yours(`answers.md, question ${i + 1}`), `${label(q)}${q.answer.trim()}`, ""];
  });
}

/**
 * README.md for the portfolio. `base` is the path from the README to the repo root: "../" for
 * portfolio/README.draft.md, "" for the README.md at the root.
 */
export function buildReadme(h: PortfolioHistory, all: readonly Answered[], base: string): string {
  const out: string[] = [
    `<!-- README draft from npm run portfolio, ${h.exportedAt.slice(0, 10)}. "your words" marks text copied unchanged`,
    `     from portfolio/answers.md or your design notes; "generated" marks what was built from your git`,
    `     history; TODO marks what is still missing. Edit anything. The markers don't show on GitHub. -->`,
    "",
    `# ${h.repo}`,
    "",
    GENERATED,
    "A multi-core computer simulated in TypeScript (a bus, memory, CPUs, a scheduler and interrupts) on a live 2D board.",
    "",
  ];

  out.push("<!-- placeholder: check this link once the board is deployed to GitHub Pages (week 8) -->");
  out.push(h.pagesUrl ? `**[Open the live board](${h.pagesUrl})**` : "**[Open the live board](https://YOUR-NAME.github.io/YOUR-REPO/)**", "");
  const shot = h.screenshots.find((s) => /\.gif$/i.test(s)) ?? h.screenshots[0];
  if (shot) out.push(GENERATED, `![The board running](${base}${shot})`, "");
  else out.push("<!-- TODO: add a screenshot or GIF of your board as docs/screenshots/board.gif (or .png) and run npm run portfolio again -->", "");

  out.push("## What I built", "", ...answers(all, "summary"));

  out.push("## How it works", "", ...answers(all, "how"));
  const designNotes = h.notes.filter((n) => n.sections.length > 0 && n.week !== 1);
  if (designNotes.length) {
    out.push("### From my design notes", "");
    for (const note of designNotes) {
      const goal = sectionText(note, /goal/i);
      out.push(`**Week ${note.week}: ${TOPICS[note.week]?.replace(/^Design: /, "") ?? note.title}** ([note](${base}${note.file}))`, "");
      if (goal) out.push(yours(`${note.file}, The goal`), goal, "");
      if (note.sketch) out.push(`![Week ${note.week} board sketch](${base}docs/notes/${note.sketch})`, "");
    }
  }

  out.push("## Design decisions", "", ...answers(all, "decision"));
  const rows = h.notes.flatMap((note) => decisions(note).map((d) => ({ week: note.week, file: note.file, ...d })));
  if (rows.length) {
    out.push(yours(`the Decisions tables in ${[...new Set(rows.map((r) => r.file))].join(", ")}`));
    out.push("| Week | Decision | What I chose | What I didn't, and why |", "|---|---|---|---|");
    for (const r of rows) out.push(`| ${r.week} | ${r.decision} | ${r.chose} | ${r.didnt} |`);
    out.push("");
  }

  out.push("## What I learned", "", ...answers(all, "learned"));
  out.push("## What's next", "", ...answers(all, "next"));

  out.push("## Timeline", "", GENERATED, "| Week | What | Commits | Tests |", "|---|---|---|---|");
  for (const w of h.weeks) {
    const t = h.tests.find((x) => x.week === w.week);
    const tests = !t || t.status === "none" ? "–" : t.status === "pass" ? `passing${t.firstGreen ? ` since ${t.firstGreen.date.slice(0, 10)}` : ""}` : "not all passing";
    out.push(`| ${w.week} | ${w.topic} | ${w.commits.length} | ${tests} |`);
  }
  out.push("", `The full history, week by week, is in [portfolio/HISTORY.md](${base}portfolio/HISTORY.md).`, "");

  out.push(
    "## Run it yourself",
    "",
    GENERATED,
    "```sh",
    "npm install",
    "npm test            # every week's tests",
    "npm run dev:all     # the bus, memory, CPU and dashboard, then open http://localhost:3005",
    "```",
    "",
  );
  return `${out.join("\n").trimEnd()}\n`;
}
