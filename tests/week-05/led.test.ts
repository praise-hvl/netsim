import { describe, expect, it } from "vitest";
import { led } from "@/components/peripherals/led";
import { startPeripheral } from "@/components/peripherals/peripheral";
import { statusPayload } from "@/protocol/messages";
import { wiringForSlot } from "@/protocol/memory-map";
import { onCleanup, recorder, testBus } from "@/tests/helpers";
import { fakeMemory } from "@/tests/fake-memory";

const start = () => led.init({ color: "#ef4444" });
const tick = (register: number | null) => ({ tick: 1, register });

describe("led", () => {
  it("starts OFF and asks for its register before it knows anything", () => {
    const { state, effects } = led.onTick(start(), tick(null));
    expect(state).toEqual(start());
    expect(effects).toEqual([{ kind: "read" }]);
  });

  it("is ON at 128 and above, OFF below", () => {
    expect(led.onTick(start(), tick(127)).state.fsm).toBe("OFF");
    expect(led.onTick(start(), tick(128)).state.fsm).toBe("ON");
    expect(led.onTick(start(), tick(255)).state.fsm).toBe("ON");
  });

  it("follows the register back down and keeps reading every tick", () => {
    const on = led.onTick(start(), tick(200)).state;
    const off = led.onTick(on, tick(0));
    expect(off.state).toEqual({ fsm: "OFF", color: "#ef4444", value: 0 });
    expect(off.effects).toEqual([{ kind: "read" }]);
  });

  it("describes itself for the dashboard", () => {
    const view = led.view({ fsm: "ON", color: "#22c55e", value: 200 });
    expect(view).toEqual({ state: "ON", data: { value: 200, color: "#22c55e" } });
    expect(statusPayload.safeParse({ ...view, label: "LED" }).success).toBe(true);
  });

  it("only moves along its transition table", () => {
    expect(led.fsm.canGo("OFF", "ON")).toBe(true);
    expect(led.fsm.canGo("ON", "OFF")).toBe(true);
  });

  it("lights up over the bus when a program stores to its register", async () => {
    const bus = await testBus();
    const rec = await recorder(bus);
    const memory = await fakeMemory(bus);
    const wiring = wiringForSlot(2, 0);
    const light = await startPeripheral(led, { id: "led-1", wiring, url: bus.url });
    onCleanup(() => light.close());

    await rec.step(); // read sent, reply arrives
    memory[wiring.register] = 255; // what `STORE R0, 0x3F2` would do
    await rec.steps(2); // read the new byte, then act on it

    expect(light.state()).toMatchObject({ fsm: "ON", value: 255 });
    const statuses = rec.messages.filter((m) => m.type === "status" && m.from === "led-1");
    expect(statuses.at(-1)?.payload).toMatchObject({ state: "ON", data: { value: 255, register: "0x3F2" } });
  });
});
