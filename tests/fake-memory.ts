// A stand-in Memory for peripheral tests over the bus: answers mem.read and mem.write from a
// plain array, so these tests don't depend on the Memory component.
import { MEMORY_SIZE } from "@/protocol/memory-map";
import { testClient } from "@/tests/helpers";
import type { Bus } from "@/bus/server";

export async function fakeMemory(bus: Bus): Promise<number[]> {
  const bytes = new Array<number>(MEMORY_SIZE).fill(0);
  const memory = await testClient(bus, { id: "memory", role: "memory", label: "Memory" });
  memory.on("mem.read", (m) => {
    const { address, length } = m.payload;
    memory.reply(m, "mem.data", { address, bytes: bytes.slice(address, address + length) });
  });
  memory.on("mem.write", (m) => {
    const { address, bytes: written } = m.payload;
    bytes.splice(address, written.length, ...written);
    memory.reply(m, "mem.ack", { address, length: written.length });
  });
  return bytes;
}
