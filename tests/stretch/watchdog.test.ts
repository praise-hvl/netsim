import { describe, expect, it } from "vitest";
import { nextMessage, onCleanup, recorder, testBus } from "@/tests/helpers";

describe("bus watchdog", () => {
  it("marks a component that never finishes its tick as stalled, and carries on", async () => {
    const timeout = 2000;
    const bus = await testBus({ tickTimeoutMs: timeout });
    const rec = await recorder(bus);

    // A broken client: it connects as a clocked component but never answers ticks.
    const socket = new WebSocket(bus.url);
    onCleanup(async () => socket.close());
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    socket.send(JSON.stringify({ type: "hello", from: "sleepy", to: "bus", id: "sleepy-1", tick: 0, payload: { role: "peripheral", label: "Sleepy" } }));
    await nextMessage(rec.client, (m) => m.type === "joined");

    const started = Date.now();
    await rec.step();
    expect(Date.now() - started).toBeGreaterThanOrEqual(timeout - 20);
    const status = rec.messages.findLast((m) => m.type === "status" && m.from === "bus");
    expect(status?.type === "status" && status.payload.data.stalled).toEqual(["sleepy"]);

    // Once stalled, it no longer holds up the clock: three ticks take less than one timeout.
    const again = Date.now();
    await rec.steps(3);
    expect(Date.now() - again).toBeLessThan(timeout);
  });

  it("un-stalls a component as soon as it answers a tick again", async () => {
    const bus = await testBus({ tickTimeoutMs: 100 });
    const rec = await recorder(bus);

    // A client that ignores tick 1 but answers every tick after that.
    const socket = new WebSocket(bus.url);
    onCleanup(async () => socket.close());
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; tick: number };
      if (message.type === "tick" && message.tick >= 2) {
        socket.send(JSON.stringify({ type: "tick.done", from: "flaky", to: "bus", id: `flaky-${message.tick}`, tick: message.tick, payload: {} }));
      }
    });
    socket.send(JSON.stringify({ type: "hello", from: "flaky", to: "bus", id: "flaky-0", tick: 0, payload: { role: "peripheral", label: "Flaky" } }));
    await nextMessage(rec.client, (m) => m.type === "joined");

    const stalledAfter = async () => {
      await rec.step();
      const status = rec.messages.findLast((m) => m.type === "status" && m.from === "bus");
      return status?.type === "status" ? status.payload.data.stalled : undefined;
    };
    expect(await stalledAfter()).toEqual(["flaky"]); // missed tick 1
    // Tick 2 goes out without waiting for flaky; flaky's answer clears the stall.
    const answered = nextMessage(rec.client, (m) => m.type === "tick.done" && m.from === "flaky");
    await rec.step();
    await answered;
    expect(await stalledAfter()).toEqual([]);
  });
});

describe("npm run stall-demo", () => {
  it("joins as a peripheral that never answers, so the watchdog marks it stalled", async () => {
    const { startSilentPeripheral } = await import("@/scripts/stall-demo");
    const bus = await testBus({ tickTimeoutMs: 150 });
    const rec = await recorder(bus);
    const joined = nextMessage(rec.client, (m) => m.type === "joined" && m.payload.id === "silent");
    const silent = await startSilentPeripheral(bus.url);
    onCleanup(async () => silent.close());
    expect((await joined).payload).toMatchObject({ id: "silent", role: "peripheral", kind: "silent" });

    await rec.step();
    const status = rec.messages.findLast((m) => m.type === "status" && m.from === "bus");
    expect(status?.type === "status" && status.payload.data.stalled).toEqual(["silent"]);
  });
});
