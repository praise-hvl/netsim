// The dashboard's actions against a real bus: every button is a message, every request gets
// its reply, and the dashboard's tap rebuilds the system state.
import { describe, expect, it } from "vitest";
import type { Message } from "@/protocol/messages";
import { connectDashboard, dashboardActions, welcomeMessage } from "@/app/_lib/bus-connection";
import { initialSystem, reduce } from "@/app/_lib/system-state";
import { cpuStatusData, memoryStatusData } from "@/protocol/messages";
import { nextMessage, onCleanup, testBus, testClient, testSystem } from "@/tests/helpers";

async function dashboard(url: string) {
  const client = await connectDashboard(url);
  onCleanup(() => client.close());
  const sent: Message[] = [];
  const seen: Message[] = [welcomeMessage(client)];
  client.onAny((m) => seen.push(m));
  return { client, sent, seen, actions: dashboardActions(client, (m) => sent.push(m)) };
}

describe("dashboard over the bus", () => {
  it("joining late, it sees every component's current status without waiting for a tick", async () => {
    const system = await testSystem();
    await system.run("count", 0x000, "LOADI R0, 3\nHALT");
    const { client, seen } = await dashboard(system.bus.url);
    // Let the replay burst arrive; no control message is sent, so the clock never moves.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = seen.reduce(reduce, initialSystem);
    expect(cpuStatusData.parse(state.components.cpu?.status?.data).processes.map((p) => p.name)).toEqual(["count"]);
    expect(memoryStatusData.parse(state.components.memory?.status?.data).bytes.slice(0, 4)).toEqual([0x06, 0x00, 0x00, 0x03]); // LOADI R0, 3
    expect(seen.some((m) => m.type === "tick")).toBe(false);
    expect(client.tick).toBe(0);
  });

  it("steps the clock and follows the bus's status", async () => {
    const bus = await testBus();
    const { client, seen, actions } = await dashboard(bus.url);
    const endOfTick = nextMessage(client, (m) => m.type === "status" && m.from === "bus" && m.payload.data.tick === 1 && m.payload.state === "STOPPED");
    await actions.control("step");
    await endOfTick;
    const state = seen.reduce(reduce, initialSystem);
    expect(state.tick).toBe(1);
    expect(state.running).toBe(false);
  });

  it("loads a program: program.load waits for Memory's ack, then process.add waits for the CPU's ok", async () => {
    const bus = await testBus();
    const memory = await testClient(bus, { id: "memory", role: "memory", label: "Memory" });
    const cpu = await testClient(bus, { id: "cpu", role: "cpu", label: "CPU" });
    memory.on("program.load", (m) => memory.reply(m, "mem.ack", { address: m.payload.address, length: m.payload.bytes.length }));
    cpu.on("process.add", (m) => cpu.reply(m, "ok", {}));
    const processAdd = nextMessage(cpu, (m) => m.type === "process.add");

    const { sent, actions } = await dashboard(bus.url);
    await actions.loadProgram("countdown", 0x000, [0x06, 0x00, 0x00, 0x09]);

    expect(await processAdd).toMatchObject({ payload: { name: "countdown", start: 0 } });
    expect(sent.map((m) => m.type)).toEqual(["program.load", "process.add"]);
  });

  it("rejects with the bus's reason when a request is refused", async () => {
    const bus = await testBus();
    const { actions } = await dashboard(bus.url);
    await actions.control("start");
    await expect(actions.save("while-running")).rejects.toThrow(/stop the clock/);
    await actions.control("stop");
  });

  it("sends input straight to a peripheral", async () => {
    const bus = await testBus();
    const button = await testClient(bus, { id: "button-1", role: "peripheral", kind: "button", label: "Button" });
    const input = nextMessage(button, (m) => m.type === "input");
    const { actions } = await dashboard(bus.url);
    actions.input("button-1", { action: "press" });
    expect(await input).toMatchObject({ payload: { action: "press" } });
  });
});
