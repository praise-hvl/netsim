// The tick barrier: a tick ends only when every component has said tick.done AND every memory
// request sent during it has had its reply. So a reply always arrives before the next tick.
// (tests/week-07/order.test.ts checks the same rules with the CPU and the scheduler running.)
import { expect, it } from "vitest";
import { startMemory } from "@/components/memory";
import type { Message } from "@/protocol/messages";
import { onCleanup, recorder, testBus, testClient } from "@/tests/helpers";

it("every memory reply arrives before the next tick starts", async () => {
  const bus = await testBus();
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const rec = await recorder(bus);

  // A pretend CPU: on every tick it asks memory for a byte, then says it's done with the tick.
  const reader = await testClient(bus, { id: "reader", role: "peripheral", label: "Reader" });
  const arrived: Array<{ tick: number; reply: Message | null }> = [];
  reader.onTick((tick) => {
    const id = reader.send("mem.read", "memory", { address: tick, length: 1 });
    arrived.push({ tick, reply: null });
    const stop = reader.onAny((m) => {
      if (m.replyTo !== id) return;
      arrived[arrived.length - 1].reply = m;
      stop();
    });
  });
  // Each time a new tick starts, the previous tick's reply must already be in.
  const late: number[] = [];
  reader.on("tick", (m) => {
    const previous = arrived.find((a) => a.tick === m.tick - 1);
    if (previous && previous.reply === null) late.push(previous.tick);
  });

  // One extra tick: by the time tick 11 starts, tick 10's reply must be in.
  await rec.steps(11);
  expect(late, "replies that arrived after the next tick had started").toEqual([]);
  expect(arrived.slice(0, 10).filter((a) => a.reply?.type === "mem.data")).toHaveLength(10);
});
