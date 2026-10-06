// The portfolio interview: which questions to ask (some grounded in the student's own commits and
// design notes, some fixed), and portfolio/answers.md, which holds the questions and the answers so
// an interview can be stopped and picked up again. Pure: no terminal, no files.
import { describeChange, notableCommits, type Week } from "./history";
import { decisions, openQuestions, type Note } from "./notes";

/** Where an answer goes in the README. */
export type Use = "summary" | "how" | "decision" | "learned" | "next";

export type Question = {
  id: string;
  prompt: string;
  /** What the question is grounded in (a commit, a line of a design note), shown under it. */
  evidence?: string;
  use: Use;
};

export type Answered = Question & { answer: string };

const FIXED = {
  summary: {
    id: "summary",
    use: "summary",
    prompt: "In two or three sentences, for someone who has never seen this course: what did you build, and what can it do?",
  },
  hardestBug: {
    id: "hardest-bug",
    use: "learned",
    prompt: "What was the hardest bug you hit? What did you see, how did you track it down, and what was the fix?",
  },
  interrupt: {
    id: "interrupt",
    use: "how",
    prompt: "In your own words: how does an interrupt reach a core? Start at the device and end when the program carries on.",
  },
  change: {
    id: "change-decision",
    use: "decision",
    prompt: "Pick one design decision you would make differently now. What did you choose, what would you choose instead, and why?",
  },
  next: {
    id: "next",
    use: "next",
    prompt: "If you had another month, what would you build next, and why that?",
  },
  // Used when the history is too thin for grounded questions.
  proud: {
    id: "proud",
    use: "how",
    prompt: "Which part of your code are you proudest of? Where is it, and what does it do?",
  },
  tick: {
    id: "tick",
    use: "how",
    prompt: "Pick one tick of your machine while a program runs. What does each part do in that tick, and what does the board show?",
  },
  board: {
    id: "board",
    use: "how",
    prompt: "What does someone see on your board in the first 30 seconds, and what is one thing you asked your agent to change about it?",
  },
} satisfies Record<string, Question>;

/** How many questions an interview has. */
export const INTERVIEW_LENGTH = 8;

/**
 * About eight questions: what you built first, then up to three grounded in your own history (your
 * biggest commits, a decision and an open question from your design notes), then the fixed ones.
 * Deterministic: the same history always gives the same questions.
 */
export function selectQuestions(weeks: readonly Week[], notes: readonly Note[]): Question[] {
  const commits: Question[] = notableCommits(weeks, 2).map(({ week, commit }) => ({
    id: `commit-${commit.short}`,
    use: "decision",
    prompt: `In week ${week} you committed ${commit.short} "${commit.subject}". What does that change do, and why did you write it that way?`,
    evidence: `${commit.short} · ${commit.date.slice(0, 10)} · ${describeChange(commit)}: ${commit.files.map((f) => f.path).slice(0, 4).join(", ")}`,
  }));

  const choice = notes.flatMap((note) => decisions(note).map((d) => ({ note, d })))[0];
  const decision: Question | undefined = choice && {
    id: `note-${choice.note.week}-decision`,
    use: "decision",
    prompt: `In your week ${choice.note.week} design note you decided "${choice.d.decision}": you chose ${choice.d.chose}. Now that it's built, was that the right call? What did it make easier or harder?`,
    evidence: `${choice.note.file}, Decisions: "${choice.d.chose}" over "${choice.d.didnt}"`,
  };

  const open = notes.flatMap((note) => openQuestions(note).map((q) => ({ note, q })))[0];
  const question: Question | undefined = open && {
    id: `note-${open.note.week}-question`,
    use: "learned",
    prompt: `In week ${open.note.week} you still had this question: "${open.q}". What is the answer, now that you've built it?`,
    evidence: `${open.note.file}, Questions I still have`,
  };

  // One of each kind before a second commit, so a long history doesn't crowd out the notes.
  const grounded = [commits[0], decision, question, commits[1]].filter((q): q is Question => q !== undefined);

  const fixed = [FIXED.hardestBug, FIXED.interrupt, FIXED.change, FIXED.next];
  const room = INTERVIEW_LENGTH - 1 - fixed.length;
  const fillers = [FIXED.proud, FIXED.tick, FIXED.board];
  const middle = [...grounded.slice(0, room), ...fillers].slice(0, room);
  return [FIXED.summary, ...middle, ...fixed];
}

/**
 * The saved questions, as they were. With `reselect`, a fresh selection instead, keeping the answer
 * of any question that is still in it, and every answered question that isn't (no answer is lost).
 */
export function mergeQuestions(saved: readonly Answered[], fresh: readonly Question[], reselect: boolean): Answered[] {
  if (saved.length > 0 && !reselect) return [...saved];
  const old = new Map(saved.map((q) => [q.id, q.answer]));
  const kept = saved.filter((q) => q.answer !== "" && !fresh.some((f) => f.id === q.id));
  return [...fresh.map((q) => ({ ...q, answer: old.get(q.id) ?? "" })), ...kept];
}

const HEADER = `# Portfolio interview

Your answers, in your own words. \`npm run portfolio\` asks these questions and saves each answer
here as you go; run it again to pick up where you stopped (\`--redo\` asks them all again). You can
also edit an answer right here: change only the text under its question.

Your README draft is built from these answers. No AI: you'll be asked about anything you write.
`;

/** portfolio/answers.md: readable on GitHub, and parsed back by parseAnswers. */
export function renderAnswers(questions: readonly Answered[]): string {
  const blocks = questions.map((q, i) => {
    const evidence = q.evidence ? `\n> From your history: ${q.evidence}\n` : "";
    return `<!-- q id=${q.id} use=${q.use} -->
## ${i + 1}. ${q.prompt}
${evidence}
<!-- answer -->
${q.answer.trim() || "_(not answered yet)_"}
<!-- /q -->`;
  });
  return `${HEADER}\n${blocks.join("\n\n")}\n`;
}

/** The questions and answers saved in answers.md (an unanswered question has answer ""). */
export function parseAnswers(markdown: string): Answered[] {
  const blocks = markdown.matchAll(/<!-- q id=(\S+) use=(\S+) -->\n([\s\S]*?)<!-- \/q -->/g);
  return [...blocks].map(([, id, use, body]) => {
    const [head, answer = ""] = body.split("<!-- answer -->");
    const prompt = /^## \d+\.\s+(.*)$/m.exec(head)?.[1].trim() ?? "";
    const evidence = /^> From your history: (.*)$/m.exec(head)?.[1].trim();
    const text = answer.trim() === "_(not answered yet)_" ? "" : answer.trim();
    return { id, use: use as Use, prompt, ...(evidence ? { evidence } : {}), answer: text };
  });
}
