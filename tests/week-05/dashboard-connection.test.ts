import { describe, expect, it } from "vitest";
import { connectionProblem, weekGuideUrl } from "@/app/_lib/connection-words";
import { todo } from "@/core/todo";

const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

describe("the dashboard's words when it can't reach the bus", () => {
  it("a bus client that's still a TODO is named, with its week and the week's guide, not 'no bus'", () => {
    const p = connectionProblem(thrown(() => todo("week 3: handshake")));
    expect(p.short).toBe("bus client not built yet (week 3)");
    expect(p.detail).toContain("Your bus client isn't built yet: handshake in components/client.ts is still a TODO from week 3.");
    expect(p).toMatchObject({ week: 3, href: "https://github.com/praiseisaac/netsim/blob/HEAD/docs/weeks/week-03.md" });
  });
  it("anything else is still 'no bus', with how to start it", () => {
    const p = connectionProblem("connect ECONNREFUSED 127.0.0.1:3006");
    expect(p).toMatchObject({ short: "no bus" });
    expect(p.week).toBeUndefined();
    expect(p.detail).toContain("npm run dev:all");
    expect(connectionProblem("").detail).toContain("it isn't running");
  });
  it("week guides by number", () => {
    expect(weekGuideUrl(5)).toMatch(/week-05\.md$/);
  });
});
