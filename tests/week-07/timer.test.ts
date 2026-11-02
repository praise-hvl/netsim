import { describe, expect, it } from "vitest";
import { timer } from "@/components/peripherals/timer";
import { startPeripheral } from "@/components/peripherals/peripheral";
import { statusPayload } from "@/protocol/messages";
import { wiringForSlot } from "@/protocol/memory-map";
import { nextMessage, onCleanup, recorder, testBus, testClient } from "@/tests/helpers";

const ctx = { tick: 1, register: null };

/** Run `count` ticks and return the tick numbers (1-based) that raised an irq. */
function irqTicks(state: ReturnType<typeof timer.init>, count: number): number[] {
  const fired: number[] = [];
  for (let t = 1; t <= count; t++) {
    const result = timer.onTick(state, ctx);
    state = result.state;
    if (result.effects.some((e) => e.kind === "irq")) fired.push(t);
  }
  return fired;
}

describe("timer", () => {
  it("raises an irq every `interval` ticks", () => {
    expect(irqTicks(timer.init({ interval: 3, running: true }), 10)).toEqual([3, 6, 9]);
  });

  it("fires every tick with interval 1", () => {
    expect(irqTicks(timer.init({ interval: 1, running: true }), 3)).toEqual([1, 2, 3]);
  });

  it("does nothing while STOPPED", () => {
    const stopped = timer.init({ interval: 2, running: false });
    expect(stopped.fsm).toBe("STOPPED");
    expect(irqTicks(stopped, 10)).toEqual([]);
  });

  it("starts and stops from the dashboard, and stopping resets the count-down", () => {
    const counting = timer.onInput(timer.init({ interval: 3, running: false }), { action: "start" });
    expect(counting.fsm).toBe("COUNTING");

    const partWay = timer.onTick(timer.onTick(counting, ctx).state, ctx).state;
    expect(partWay.elapsed).toBe(2);

    const stopped = timer.onInput(partWay, { action: "stop" });
    expect(stopped).toMatchObject({ fsm: "STOPPED", elapsed: 0 });
    expect(irqTicks(timer.onInput(stopped, { action: "start" }), 3)).toEqual([3]);
  });

  it("counts the interrupts it raised", () => {
    let state = timer.init({ interval: 2, running: true });
    for (let t = 0; t < 5; t++) state = timer.onTick(state, ctx).state;
    expect(state.count).toBe(2);
  });

  it("describes itself for the dashboard", () => {
    const view = timer.view({ fsm: "COUNTING", interval: 10, elapsed: 4, count: 7 });
    expect(view).toEqual({ state: "COUNTING", data: { interval: 10, count: 7, elapsed: 4 } });
    expect(statusPayload.safeParse({ ...view, label: "Timer" }).success).toBe(true);
  });

  it("is less urgent than the button", () => {
    expect(timer.defaultPriority).toBeGreaterThan(0);
  });

  it("sends irq messages to the CPU with its slot's vector and priority", async () => {
    const bus = await testBus();
    const rec = await recorder(bus);
    await testClient(bus, { id: "cpu", role: "cpu", label: "CPU" }); // irqs are refused if nobody is "cpu"
    const wiring = wiringForSlot(1, timer.defaultPriority);
    const running = await startPeripheral(timer, { id: "tmr-1", wiring, config: { interval: 2 }, url: bus.url });
    onCleanup(() => running.close());

    await rec.steps(4);

    const irqs = rec.messages.filter((m) => m.type === "irq" && m.from === "tmr-1");
    expect(irqs.map((m) => m.tick)).toEqual([2, 4]);
    expect(irqs[0]).toMatchObject({ to: "cpu", payload: { vector: 0x220, priority: 2 } });
  });

  it("starts over from its config when the bus resets", async () => {
    const bus = await testBus();
    const rec = await recorder(bus);
    await testClient(bus, { id: "cpu", role: "cpu", label: "CPU" });
    const running = await startPeripheral(timer, { id: "tmr-1", wiring: wiringForSlot(1, 2), config: { interval: 2 }, url: bus.url });
    onCleanup(() => running.close());

    await rec.steps(3);
    expect(running.state()).toMatchObject({ count: 1, elapsed: 1 });

    const fresh = nextMessage(rec.client, (m) => m.type === "status" && m.from === "tmr-1" && m.payload.data.count === 0);
    rec.client.send("control", "bus", { action: "reset" });
    await fresh;
    expect(running.state()).toEqual(timer.init({ interval: 2, running: true }));
  });
});
