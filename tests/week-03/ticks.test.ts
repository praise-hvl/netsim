import { describe, expect, it } from "vitest";
import { recorder, testBus, testClient } from "@/tests/helpers";

describe("ticks", () => {
  it("answers every tick with tick.done for the same tick", async () => {
    const bus = await testBus();
    const rec = await recorder(bus);
    const client = await testClient(bus, { id: "ada", role: "peripheral", label: "Ada" });
    const seen: number[] = [];
    client.onTick((tick) => seen.push(tick));

    expect(await rec.step()).toBe(1);
    expect(await rec.step()).toBe(2);
    expect(await rec.step()).toBe(3);

    expect(seen).toEqual([1, 2, 3]);
    expect(client.tick).toBe(3);
    const done = rec.messages.filter((m) => m.type === "tick.done" && m.from === "ada").map((m) => m.tick);
    expect(done).toEqual([1, 2, 3]);
  });

  it("stamps messages with the tick they were sent in", async () => {
    const bus = await testBus();
    const rec = await recorder(bus);
    const client = await testClient(bus, { id: "ada", role: "peripheral", label: "Ada" });
    client.onTick(() => client.send("status", "*", { state: "AWAKE", label: "Ada", data: {} }));

    await rec.steps(2);
    const stamps = rec.messages.filter((m) => m.type === "status" && m.from === "ada").map((m) => m.tick);
    expect(stamps).toEqual([1, 2]);
  });
});
