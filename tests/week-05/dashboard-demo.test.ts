// "Load demo" against the real CPU, Memory and host: devices first, then the programs, and a
// second press doesn't queue the programs again.
import { describe, expect, it } from "vitest";
import { PERIPHERALS } from "@/components/peripherals";
import { PROGRAMS } from "@/programs/index";
import type { Message } from "@/protocol/messages";
import { cpuStatusData } from "@/protocol/messages";
import { connectDashboard, dashboardActions, welcomeMessage } from "@/app/_lib/bus-connection";
import { loadDemo } from "@/app/_lib/demo";
import { initialSystem, reduce } from "@/app/_lib/system-state";
import { onCleanup, testSystem } from "@/tests/helpers";

async function until(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Load demo", () => {
  it("adds the demo devices the host knows, then loads each program once", async () => {
    const system = await testSystem({ host: true });
    // The dashboard joins a system that is already running, like opening the page late.
    const client = await connectDashboard(system.bus.url);
    onCleanup(() => client.close());
    const seen: Message[] = [welcomeMessage(client)];
    client.onAny((m) => seen.push(m));
    const actions = dashboardActions(client, () => {});
    const state = () => seen.reduce(reduce, initialSystem);
    await until(() => state().components.cpu?.status != null && state().components.host !== undefined);

    const problems = await loadDemo(actions, state());
    const known = new Set(PERIPHERALS.map((p) => p.kind));
    for (const problem of problems) expect(problem).toMatch(/^no "(button|led|seven-segment)" peripheral yet$/);
    expect(problems.length).toBe(["button", "led", "seven-segment"].filter((k) => !known.has(k)).length);
    await until(() => state().components["button-1"] !== undefined);

    const loaded = PROGRAMS.filter((p) => p.address !== null).map((p) => p.name);
    const processes = () => cpuStatusData.parse(state().components.cpu?.status?.data).processes.map((p) => p.name);
    await until(() => processes().length === loaded.length);

    await loadDemo(actions, state()); // pressed again: nothing new is queued
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(processes().sort()).toEqual([...loaded].sort());
  });
});
