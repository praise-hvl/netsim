// Snapshot/restore for the week-6 take-home peripherals. Only the one named in course.json must pass.
import { describe, expect, it } from "vitest";
import { sensor } from "@/components/peripherals/sensor";
import { proximity } from "@/components/peripherals/proximity";
import { potentiometer } from "@/components/peripherals/potentiometer";
import { startPeripheral } from "@/components/peripherals/peripheral";
import { wiringForSlot } from "@/protocol/memory-map";
import { onCleanup, testBus, testClient } from "@/tests/helpers";
import { notChosen } from "@/tests/course";

const ctx = { tick: 1, register: null };

/** What goes through a save file: JSON text, not live objects. */
const throughFile = (data: unknown): unknown => JSON.parse(JSON.stringify(data));

describe.skipIf(notChosen("sensor"))("sensor snapshot", () => {
  it("round trips, leaving out the register bookkeeping", () => {
    const hot = sensor.onTick(sensor.onInput(sensor.init({ threshold: 75 }), { value: 90 }), ctx).state;
    const saved = sensor.snapshot!(hot);
    expect(saved).not.toHaveProperty("pendingWrite");
    expect(sensor.restore!(throughFile(saved))).toEqual(hot);
  });

  it("rejects a corrupt save", () => {
    expect(() => sensor.restore!({ fsm: "ABOVE", threshold: 75, value: 999, alarms: 1 })).toThrow();
    expect(() => sensor.restore!({ fsm: "MELTING", threshold: 75, value: 90, alarms: 1 })).toThrow();
  });
});

describe.skipIf(notChosen("proximity"))("proximity snapshot", () => {
  it("round trips, leaving out the register bookkeeping", () => {
    const near = proximity.onTick(proximity.onInput(proximity.init({ radius: 100 }), { distance: 30 }), ctx).state;
    const saved = proximity.snapshot!(near);
    expect(saved).not.toHaveProperty("pendingWrite");
    expect(proximity.restore!(throughFile(saved))).toEqual(near);
  });

  it("rejects a corrupt save", () => {
    expect(() => proximity.restore!({ fsm: "NEAR", radius: 0, distance: 30, approaches: 1 })).toThrow();
    expect(() => proximity.restore!(null)).toThrow();
  });
});

describe.skipIf(notChosen("potentiometer"))("potentiometer snapshot", () => {
  it("round trips mid-settle and still fires on time after restore", () => {
    const settling = potentiometer.onTick(potentiometer.onInput(potentiometer.init({ settleTicks: 3 }), { value: 99 }), ctx).state;
    const saved = potentiometer.snapshot!(settling);
    expect(saved).not.toHaveProperty("pendingWrite");
    const restored = potentiometer.restore!(throughFile(saved));
    expect(restored).toEqual(settling);

    const second = potentiometer.onTick(restored, ctx);
    expect(second.effects).toEqual([]);
    expect(potentiometer.onTick(second.state, ctx).effects).toEqual([{ kind: "write", value: 99 }, { kind: "irq" }]);
  });

  it("rejects a corrupt save", () => {
    expect(() => potentiometer.restore!({ fsm: "STABLE", settleTicks: 3, value: 300, quietTicks: 0, settles: 0 })).toThrow();
  });
});

describe.skipIf(notChosen("sensor"))("snapshots over the bus", () => {
  it("the shell saves with snapshot() and restores with restore()", async () => {
    const bus = await testBus();
    const saver = await testClient(bus, { id: "saver", role: "dashboard", label: "Saver" });
    const running = await startPeripheral(sensor, { id: "sns-1", wiring: wiringForSlot(3, 3), url: bus.url });
    onCleanup(() => running.close());

    const reply = await saver.request("snapshot.get", "sns-1", {});
    const data = reply.type === "snapshot" ? reply.payload.data : null;
    expect(data).toMatchObject({ kind: "sensor", slot: 3, state: { fsm: "BELOW", value: 0 } });
    expect(data).not.toHaveProperty("state.pendingWrite");

    await saver.request("snapshot.set", "sns-1", { data: { state: { fsm: "ABOVE", threshold: 75, value: 88, alarms: 4 } } });
    expect(running.state()).toEqual({ fsm: "ABOVE", threshold: 75, value: 88, alarms: 4, pendingWrite: false });

    await expect(saver.request("snapshot.set", "sns-1", { data: { state: { value: 999 } } })).rejects.toThrow();
  });
});
