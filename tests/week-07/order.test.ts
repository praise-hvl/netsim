// Reads a whole run's message trace and checks the ordering rules the tick barrier promises.
// Week 4 take-home: read this, explain each rule, and add one assertion of your own.
import { describe, expect, it } from "vitest";
import type { Message } from "@/protocol/messages";
import { testSystem } from "@/tests/helpers";

describe("message order", () => {
  it("every reply arrives after its request and before the next tick", async () => {
    const system = await testSystem();
    await system.run("count", 0x000, "LOADI R0, 3\nLOADI R1, 1\nloop: STORE R0, 0x300\nSUB R0, R1\nJNZ loop\nHALT");
    await system.rec.steps(60);
    const trace = system.rec.messages;

    const position = new Map<string, number>(trace.map((m, i) => [m.id, i]));
    const ticks = trace.flatMap((m, i) => (m.type === "tick" ? [{ tick: m.tick, index: i }] : []));
    const nextTickAfter = (index: number) => ticks.find((t) => t.index > index)?.index ?? Infinity;

    const requests = trace.filter((m) => m.type === "mem.read" || m.type === "mem.write");
    expect(requests.length).toBe(15); // 12 instruction fetches + 3 STOREs

    for (const request of requests) {
      const reply = trace.find((m): m is Message => m.replyTo === request.id);
      expect(reply, `no reply to ${request.id}`).toBeDefined();
      const replyIndex = position.get(reply!.id)!;
      // Rule 1: a reply comes after its request.
      expect(replyIndex).toBeGreaterThan(position.get(request.id)!);
      // Rule 2: it comes before the next tick, so the CPU always has it when it needs it.
      expect(replyIndex).toBeLessThan(nextTickAfter(position.get(request.id)!));
      // Rule 3: it is stamped with the same tick as the request.
      expect(reply!.tick).toBe(request.tick);
    }
  });

  it("every clocked component finishes each tick exactly once, before the next tick starts", async () => {
    const system = await testSystem();
    await system.rec.steps(5);
    const trace = system.rec.messages;
    for (let tick = 1; tick <= 5; tick++) {
      const done = trace.filter((m) => m.type === "tick.done" && m.tick === tick).map((m) => m.from).sort();
      expect(done).toEqual(["cpu", "memory"]);
      const lastDone = trace.findLastIndex((m) => m.type === "tick.done" && m.tick === tick);
      const nextTick = trace.findIndex((m) => m.type === "tick" && m.tick === tick + 1);
      if (nextTick !== -1) expect(lastDone).toBeLessThan(nextTick);
    }
  });
});
