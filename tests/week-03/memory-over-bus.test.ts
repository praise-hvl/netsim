import { describe, expect, it } from "vitest";
import { startMemory } from "@/components/memory";
import { onCleanup, testBus, testClient } from "@/tests/helpers";

describe("memory over the bus", () => {
  async function setup() {
    const bus = await testBus();
    const memory = await startMemory({ url: bus.url });
    onCleanup(() => memory.close());
    const client = await testClient(bus, { id: "tester", role: "dashboard", label: "Tester" });
    return { client };
  }

  it("reads back what it wrote, and the reply points at the request", async () => {
    const { client } = await setup();
    const ack = await client.request("mem.write", "memory", { address: 0x300, bytes: [1, 2, 3] });
    expect(ack.type).toBe("mem.ack");
    expect(ack.payload).toEqual({ address: 0x300, length: 3 });

    const data = await client.request("mem.read", "memory", { address: 0x300, length: 3 });
    expect(data.type).toBe("mem.data");
    expect(data.payload).toEqual({ address: 0x300, bytes: [1, 2, 3] });
    expect(data.from).toBe("memory");
    expect(data.replyTo).toBeDefined();
  });

  it("answers a read outside memory with a fault", async () => {
    const { client } = await setup();
    await expect(client.request("mem.read", "memory", { address: 0x3fe, length: 4 })).rejects.toThrow(/fault from memory: .*outside memory/);
  });

  it("gets an error, not silence, when talking to someone who isn't there", async () => {
    const { client } = await setup();
    await expect(client.request("mem.read", "nobody", { address: 0, length: 1 })).rejects.toThrow(/nobody called "nobody"/);
  });

  it("the bus refuses a message that doesn't match the protocol", async () => {
    const bus = await testBus();
    const socket = new WebSocket(bus.url);
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    const reply = new Promise<string>((resolve) => socket.addEventListener("message", (e) => resolve(String(e.data)), { once: true }));
    socket.send(JSON.stringify({ type: "hello", from: "Bad Id!", to: "bus", id: "1", tick: 0, payload: {} }));
    expect(JSON.parse(await reply)).toMatchObject({ type: "error", payload: { message: expect.stringContaining("invalid message") } });
    socket.close();
  });
});
