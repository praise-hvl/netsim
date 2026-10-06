// The pure half of `npm run portfolio`'s history: git log text in, commits grouped by course week out.
// Nothing here runs git or touches files (collect.ts does), so it is tested directly.

/** What each Monday is about (course plan v2). */
export const TOPICS: Record<number, string> = {
  1: "Setup & system roles",
  2: "Design: the machine and its bus",
  3: "Build: bus + memory on screen",
  4: "Design: the CPU",
  5: "Build: a CPU that runs programs",
  6: "Design: scheduling + interrupts",
  7: "Build: cores, scheduler, interrupts",
  8: "Demo: ship it",
};

export type FileChange = { path: string; added: number; removed: number };

export type Commit = {
  hash: string;
  short: string;
  /** ISO 8601, the author date. */
  date: string;
  author: string;
  email: string;
  parents: string[];
  subject: string;
  body: string;
  files: FileChange[];
};

/** One week of work: the merge that brought the week in (if any), then the student's own commits. */
export type Week = {
  week: number;
  topic: string;
  /** The merge of week N (`upstream/week-N`) into `work`. */
  start?: Commit;
  commits: Commit[];
};

/** Fields the log is asked for, in this order (see LOG_FORMAT). */
const FIELDS = 8;
/** `git log --numstat --format=<this>`: one record per commit, starting with \x1e. */
export const LOG_FORMAT = "%x1e%H%x1f%h%x1f%aI%x1f%an%x1f%ae%x1f%P%x1f%s%x1f%b%x1f";

/** Parse `git log --numstat --format=LOG_FORMAT` output. */
export function parseLog(raw: string): Commit[] {
  return raw
    .split("\x1e")
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const parts = record.split("\x1f");
      const [hash, short, date, author, email, parents, subject, body] = parts;
      const numstat = parts.slice(FIELDS).join("\x1f");
      return {
        hash,
        short,
        date,
        author,
        email,
        parents: parents.split(" ").filter(Boolean),
        subject,
        body: body.trim(),
        files: numstat
          .split("\n")
          .map((line) => /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line))
          .filter((m): m is RegExpExecArray => m !== null)
          .map(([, added, removed, path]) => ({ path, added: Number(added) || 0, removed: Number(removed) || 0 })),
      };
    });
}

/**
 * The week a merge brought in, from git's message: "Merge remote-tracking branch 'upstream/week-3'
 * into work" (the course's week-3 tag), or 'upstream/week-3-start' from before the course became one repo.
 */
export function mergedWeek(commit: Commit): number | null {
  if (commit.parents.length < 2) return null;
  const match = /\bweek-(\d+)(?:-start)?\b/.exec(commit.subject);
  return match ? Number(match[1]) : null;
}

/** "week 5: execute-rest" → { week: 5, task: "execute-rest" }; "week 3" → { week: 3 }. */
export function taskOf(subject: string): { week: number; task?: string } | null {
  const match = /^week\s*(\d+)\b\s*(?:[:\-–—]\s*(.*))?$/i.exec(subject.trim());
  if (!match) return null;
  const task = match[2]?.trim();
  return { week: Number(match[1]), ...(task ? { task } : {}) };
}

/**
 * Group commits (oldest first) by course week. A commit belongs to the week its message names
 * ("week N: …"); otherwise to the week most recently merged in before it; before any merge, to
 * `firstWeek` (the week the work branch was made from). Other merges (pulls between laptops) are
 * left out: they hold no work of their own.
 */
export function groupByWeek(commits: readonly Commit[], firstWeek = 1): Week[] {
  const weeks = new Map<number, Week>();
  const weekOf = (n: number) => {
    if (!weeks.has(n)) weeks.set(n, { week: n, topic: TOPICS[n] ?? `Week ${n}`, commits: [] });
    return weeks.get(n)!;
  };
  let current = firstWeek;
  for (const commit of commits) {
    const merged = mergedWeek(commit);
    if (merged !== null) {
      current = merged;
      weekOf(merged).start = commit;
      continue;
    }
    if (commit.parents.length > 1) continue;
    weekOf(taskOf(commit.subject)?.week ?? current).commits.push(commit);
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week);
}

/** The course's own commits (anyone who authored a released week's commit) are not the student's work. */
export function ownCommits(commits: readonly Commit[], starterEmails: ReadonlySet<string>): Commit[] {
  return commits.filter((c) => !starterEmails.has(c.email) || mergedWeek(c) !== null);
}

/** Lines changed, for picking the biggest pieces of work. */
export function size(commit: Commit): number {
  return commit.files.reduce((sum, f) => sum + f.added + f.removed, 0);
}

/** "3 files, +40 −2". */
export function describeChange(commit: Commit): string {
  const added = commit.files.reduce((sum, f) => sum + f.added, 0);
  const removed = commit.files.reduce((sum, f) => sum + f.removed, 0);
  const n = commit.files.length;
  return `${n} file${n === 1 ? "" : "s"}, +${added} −${removed}`;
}

/** The commits worth asking about: code, not notes or config, biggest first, one per week. */
export function notableCommits(weeks: readonly Week[], limit: number): Array<{ week: number; commit: Commit }> {
  const code = (f: FileChange) => /\.(ts|tsx|asm)$/.test(f.path) && !f.path.startsWith("tests/");
  const best = weeks
    .map((w) => ({ week: w.week, commit: [...w.commits].filter((c) => c.files.some(code)).sort((a, b) => size(b) - size(a))[0] }))
    .filter((pick): pick is { week: number; commit: Commit } => pick.commit !== undefined)
    .sort((a, b) => size(b.commit) - size(a.commit));
  return best.slice(0, limit).sort((a, b) => a.week - b.week);
}

/** https://github.com/ada/netsim(.git) or git@github.com:ada/netsim.git → its Pages URL. */
export function pagesUrl(remote: string): string | null {
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match ? `https://${match[1].toLowerCase()}.github.io/${match[2]}/` : null;
}
