import { expect, it } from "vitest";
import { COUNTER_BASE } from "@/protocol/memory-map";
import { testSystem } from "@/tests/helpers";

// Week 5 put the button on the bus; with week 6's interrupts its presses finally get counted.
it("a press becomes an interrupt, and its handler counts it", async () => {
  const system = await testSystem({ host: true });
  const { client } = system.rec;
  await client.request("host.spawn", "host", { kind: "button", id: "button-1", config: {}, slot: 0 });
  await system.rec.step();

  for (let press = 0; press < 3; press++) {
    client.send("input", "button-1", { action: "press" });
    // A round trip through the bus: once it's back, the bus has already passed the press on.
    await client.request("mem.read", "memory", { address: 0, length: 1 });
    await system.rec.steps(30);
  }

  expect(system.memoryByte(COUNTER_BASE)).toBe(3);
  const irqs = system.rec.messages.filter((m) => m.type === "irq");
  expect(irqs.map((m) => [m.from, m.to])).toEqual([["button-1", "cpu"], ["button-1", "cpu"], ["button-1", "cpu"]]);
});
