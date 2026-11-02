import { describe, expect, it } from "vitest";
import { envelope, type Message, type MessageType, type PayloadOf } from "@/protocol/messages";
import { drawnComponents, initialSystem, isHot, LOG_LIMIT, reduce, type SystemState } from "@/app/_lib/system-state";
import { defaultPosition, edgesFor, freePlace } from "@/app/_components/canvas-layout";

let nextId = 1;
function msg<T extends MessageType>(type: T, from: string, to: string, payload: PayloadOf<T>, tick = 1): Message {
  return envelope(type, from, to, payload, { id: `m-${nextId++}`, tick });
}

function run(...messages: Message[]): SystemState {
  return messages.reduce(reduce, initialSystem);
}

const welcome = msg("welcome", "bus", "dash", {
  running: false,
  speedMs: 250,
  components: [
    { id: "cpu", role: "cpu", label: "CPU" },
    { id: "memory", role: "memory", label: "Memory" },
    { id: "host", role: "host", label: "Host" },
  ],
}, 7);

describe("dashboard state", () => {
  it("starts from welcome: tick, speed and who is connected", () => {
    const state = run(welcome);
    expect(state.tick).toBe(7);
    expect(state.speedMs).toBe(250);
    expect(Object.keys(state.components)).toEqual(["cpu", "memory", "host"]);
  });

  it("draws cpu, memory and peripherals but not the host", () => {
    const state = run(welcome, msg("joined", "bus", "*", { id: "button-1", role: "peripheral", kind: "button", label: "Button" }));
    expect(drawnComponents(state).map((c) => c.info.id)).toEqual(["cpu", "memory", "button-1"]);
  });

  it("keeps the latest status per component and forgets components that leave", () => {
    const status = { state: "FETCH", label: "CPU", data: {} };
    let state = run(welcome, msg("status", "cpu", "*", status));
    expect(state.components.cpu.status).toEqual(status);
    state = reduce(state, msg("left", "bus", "*", { id: "cpu" }));
    expect(state.components.cpu).toBeUndefined();
  });

  it("follows the bus's own status for the clock", () => {
    const state = run(welcome, msg("status", "bus", "*", { state: "RUNNING", label: "Bus", data: { tick: 12, speedMs: 100, running: true, stalled: ["memory"] } }));
    expect(state).toMatchObject({ tick: 12, speedMs: 100, running: true, stalled: ["memory"] });
  });

  it("links two drawn components when a message passes between them, and it is hot for a tick", () => {
    const state = run(welcome, msg("mem.read", "cpu", "memory", { address: 0, length: 4 }, 8));
    const link = state.links["cpu>memory"];
    expect(link).toMatchObject({ lastType: "mem.read", count: 1 });
    expect(isHot(link, 8)).toBe(true);
    expect(isHot(link, 10)).toBe(false);
  });

  it("ignores traffic to the bus and to everyone when drawing links", () => {
    const state = run(welcome, msg("tick.done", "cpu", "bus", {}), msg("tick", "bus", "*", {}));
    expect(state.links).toEqual({});
  });

  it("logs every message, in order", () => {
    const state = run(welcome, msg("tick", "bus", "*", {}, 8));
    expect(state.log.map((e) => e.message.type)).toEqual(["welcome", "tick"]);
  });

  it("keeps only the newest LOG_LIMIT messages", () => {
    const ticks = Array.from({ length: LOG_LIMIT + 5 }, (_, i) => msg("tick", "bus", "*", {}, i + 1));
    const state = run(welcome, ...ticks);
    expect(state.log).toHaveLength(LOG_LIMIT);
    expect(state.log.at(-1)?.message.tick).toBe(LOG_LIMIT + 5);
    expect(state.log[0].message.tick).toBe(6);
  });

  it("starts fresh on a second welcome (the bus restarted): no old links, statuses or stalls", () => {
    const before = run(
      welcome,
      msg("status", "cpu", "*", { state: "FETCH", label: "CPU", data: {} }),
      msg("status", "bus", "*", { state: "STOPPED", label: "Bus", data: { tick: 500, stalled: ["memory"] } }),
      msg("mem.read", "cpu", "memory", { address: 0, length: 4 }, 500),
    );
    const after = reduce(before, { ...welcome, tick: 0 });
    expect(after.links).toEqual({});
    expect(after.stalled).toEqual([]);
    expect(after.components.cpu.status).toBeNull();
    expect(edgesFor(after.links, { cpu: "cpu", memory: "memory" }, 0)).toEqual([]);
  });

  it("draws one edge per pair, peripheral first", () => {
    const state = run(
      welcome,
      msg("joined", "bus", "*", { id: "button-1", role: "peripheral", kind: "button", label: "Button" }),
      msg("irq", "button-1", "cpu", { vector: 0x200, priority: 0 }, 8),
      msg("mem.read", "cpu", "memory", { address: 0, length: 4 }, 8),
      msg("mem.data", "memory", "cpu", { address: 0, bytes: [0, 0, 0, 0] }, 8),
    );
    const roles = Object.fromEntries(Object.values(state.components).map((c) => [c.info.id, c.info.role]));
    const edges = edgesFor(state.links, roles, 8);
    expect(edges.map((e) => [e.source, e.target, e.label, e.animated])).toEqual([
      ["button-1", "cpu", "irq", true],
      ["cpu", "memory", "mem.data", true],
    ]);
  });

  it("gives a newcomer the first free spot in its lane, so two outputs never share one", () => {
    expect(freePlace([])).toBe(0);
    expect(freePlace([0, 1])).toBe(2);
    expect(freePlace([0, 2])).toBe(1); // the one in spot 1 left
    const led = { info: { id: "led-1", role: "peripheral" as const, kind: "led", label: "LED" }, status: null };
    const display = { info: { id: "display-1", role: "peripheral" as const, kind: "seven-segment", label: "7-seg" }, status: null };
    expect(defaultPosition(led, "output", 0)).not.toEqual(defaultPosition(display, "output", 1));
  });
});
