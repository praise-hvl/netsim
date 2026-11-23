// What the dashboard says when it can't reach the bus, in words a student can act on. The dashboard
// connects through the student's own bus client (components/client.ts, week 3): while that's still a
// TODO stub, connecting throws "TODO(week 3: handshake) is not implemented yet", and "no bus" would
// send them looking for a bus that's running fine.

/** Week N's guide in the course repo (the studio shows the same page in NetSim Studio). */
export function weekGuideUrl(week: number): string {
  return `https://github.com/praiseisaac/netsim/blob/HEAD/docs/weeks/week-${String(week).padStart(2, "0")}.md`;
}

export type ConnectionProblem = {
  /** Beside the dot in the controls bar. */
  short: string;
  /** The whole story, under the bar. */
  detail: string;
  /** The week whose task is missing, and its guide. */
  week?: number;
  href?: string;
};

/**
 * Why the dashboard isn't connected, from the error connecting gave. A part of the student's own code
 * that isn't written yet (a `todo(...)` stub) is named, with its week; anything else is "no bus".
 */
export function connectionProblem(error: string): ConnectionProblem {
  const stub = /TODO\(week (\d+): ([\w-]+)\)/.exec(error);
  if (stub) {
    const week = Number(stub[1]);
    const task = stub[2];
    return {
      short: `bus client not built yet (week ${week})`,
      detail: `Your bus client isn't built yet: ${task} in components/client.ts is still a TODO from week ${week}. The dashboard connects through your own client, so it can't reach the bus until you write it. Do week ${week}'s ${task} (in NetSim Studio: Week ${week}, Code), and this page connects by itself.`,
      week,
      href: weekGuideUrl(week),
    };
  }
  return { short: "no bus", detail: `Can't reach the bus: ${error || "it isn't running"}. Start it with npm run dev:all (NetSim Studio's Start the board does the same).` };
}
