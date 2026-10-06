// portfolio/history.json's shape, and portfolio/HISTORY.md made from it. Pure.
import { describeChange, taskOf, TOPICS, type Week } from "./history";
import type { Note } from "./notes";

export type WeekTests = {
  week: number;
  /** "none": no tests for this week in the repo (not merged in yet). */
  status: "pass" | "fail" | "none";
  passed: number;
  failed: number;
  /** The first of your commits where this week's tests all passed. */
  firstGreen?: { short: string; date: string };
};

export type PortfolioHistory = {
  exportedAt: string;
  branch: string;
  head: string;
  repo: string;
  pagesUrl: string | null;
  weeks: Week[];
  notes: Note[];
  tests: WeekTests[];
  /** Whether "first green" was looked for (it runs the tests at old commits). */
  timeline: boolean;
  /** Board screenshots and GIFs, repo-relative. */
  screenshots: string[];
  /** Test results at old commits, `probes[hash][week]`, so the next export doesn't run them again. */
  probes: Record<string, Record<string, boolean>>;
};

export type VitestReport = { testResults: Array<{ name: string; status?: string; assertionResults: Array<{ status: string }> }> };

/** Pass/fail per week from a Vitest JSON report; files outside tests/week-NN/ don't count. */
export function weekResults(report: VitestReport): Map<number, { passed: number; failed: number }> {
  const weeks = new Map<number, { passed: number; failed: number }>();
  for (const file of report.testResults) {
    const match = /tests\/week-(\d+)\//.exec(file.name.replaceAll("\\", "/"));
    if (!match) continue;
    const week = Number(match[1]);
    const counts = weeks.get(week) ?? { passed: 0, failed: 0 };
    for (const test of file.assertionResults) {
      if (test.status === "passed") counts.passed++;
      else if (test.status === "failed") counts.failed++;
    }
    // A file that failed to load has no assertions but still failed.
    if (file.assertionResults.length === 0 && file.status === "failed") counts.failed++;
    weeks.set(week, counts);
  }
  return weeks;
}

/**
 * The first item where `passes` is true, by binary search (about log2(n) test runs instead of n).
 * It assumes a week, once green, stays green; HISTORY.md says so.
 */
export async function firstPassing<T>(items: readonly T[], passes: (item: T) => Promise<boolean>): Promise<T | undefined> {
  if (items.length === 0 || !(await passes(items[items.length - 1]))) return undefined;
  let lo = 0;
  let hi = items.length - 1; // items[hi] passes
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await passes(items[mid])) hi = mid;
    else lo = mid + 1;
  }
  return items[hi];
}

const day = (iso: string) => iso.slice(0, 10);
const statusText = (t: WeekTests | undefined) =>
  !t || t.status === "none" ? "–" : t.status === "pass" ? `✅ ${t.passed} passing` : `❌ ${t.failed} failing, ${t.passed} passing`;

/** portfolio/HISTORY.md: what you did, week by week. Links are relative to portfolio/. */
export function renderHistory(h: PortfolioHistory): string {
  const own = h.weeks.flatMap((w) => w.commits);
  const dates = own.map((c) => c.date).sort();
  const out: string[] = [
    "# My NetSim history",
    "",
    `Exported by \`npm run portfolio\` on ${day(h.exportedAt)} from \`${h.branch}\` at \`${h.head}\`.`,
    own.length
      ? `${own.length} commits of my own over ${h.weeks.length} weeks, ${day(dates[0])} to ${day(dates[dates.length - 1])}.`
      : "No commits of my own yet.",
    "",
    "## Tests",
    "",
    "| Week | Topic | Tests now | First green |",
    "|---|---|---|---|",
  ];
  const weekNumbers = [...new Set([...h.weeks.map((w) => w.week), ...h.tests.map((t) => t.week)])].sort((a, b) => a - b);
  for (const n of weekNumbers) {
    const t = h.tests.find((x) => x.week === n);
    const green = t?.firstGreen ? `\`${t.firstGreen.short}\` ${day(t.firstGreen.date)}` : h.timeline ? "–" : "not checked";
    out.push(`| ${n} | ${TOPICS[n] ?? ""} | ${statusText(t)} | ${green} |`);
  }
  out.push(
    "",
    h.timeline
      ? "_First green_: the first of my commits where that week's tests all pass (assuming they stayed green after)."
      : "_First green_ wasn't checked (`--no-timeline`).",
  );

  for (const w of h.weeks) {
    out.push("", `## Week ${w.week} · ${w.topic}`, "");
    if (w.start) out.push(`Started ${day(w.start.date)} (merged week ${w.week} in \`${w.start.short}\`).`, "");
    if (w.commits.length === 0) out.push("No commits of my own this week.");
    for (const c of w.commits) {
      const task = taskOf(c.subject)?.task;
      out.push(`- \`${c.short}\` ${day(c.date)} · ${task ? `**${task}**` : c.subject} (${describeChange(c)})`);
    }
    const note = h.notes.find((n) => n.week === w.week);
    if (note) out.push("", ...renderNote(note));
  }

  const orphanNotes = h.notes.filter((n) => !h.weeks.some((w) => w.week === n.week));
  for (const note of orphanNotes) out.push("", `## Week ${note.week} · ${TOPICS[note.week] ?? ""}`, "", ...renderNote(note));

  if (h.screenshots.length) {
    out.push("", "## Screenshots", "");
    for (const s of h.screenshots) out.push(`![${s}](../${s})`, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

function renderNote(note: Note): string[] {
  const out = [`### ${note.title} ([${note.file}](../${note.file}))`];
  for (const s of note.sections) out.push("", `#### ${s.heading}`, "", s.text);
  if (note.sketch && !note.sections.some((s) => s.text.includes(note.sketch!))) {
    out.push("", `![Board sketch](../docs/notes/${note.sketch})`);
  }
  // Images inside the note are relative to docs/notes/.
  return out.map((line) => line.replace(/(!\[[^\]]*\]\()(?!https?:|\/|\.\.\/)([^)]+\))/g, "$1../docs/notes/$2"));
}
