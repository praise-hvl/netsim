import { expect, it } from "vitest";
import { startMemory } from "@/components/memory";
import { memoryStatusData } from "@/protocol/messages";
import { nextMessage, onCleanup, recorder, testBus } from "@/tests/helpers";

it("shows a loaded program right away, without waiting for a tick", async () => {
  const bus = await testBus();
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const rec = await recorder(bus);

  const status = nextMessage(rec.client, (m) => m.type === "status" && m.from === "memory" && m.payload.state === "WRITING");
  await rec.client.request("program.load", "memory", { address: 0x040, bytes: [0x06, 1, 0, 7] });
  const message = await status;

  expect(bus.tick()).toBe(0); // the clock never moved
  if (message.type !== "status") throw new Error("expected a status");
  const data = memoryStatusData.parse(message.payload.data);
  expect(data.bytes.slice(0x040, 0x044)).toEqual([0x06, 1, 0, 7]);
  expect(data.lastWrite).toEqual({ address: 0x040, length: 4 });
});
