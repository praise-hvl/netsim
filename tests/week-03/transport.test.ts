// The bus works the same over WebSockets (npm run bus) and inside a page (inpage://, used by the
// deployed board): connect() picks the transport from the address, and nothing else changes.
import { describe, expect, it } from "vitest";
import { connect } from "@/components/client";
import { startMemory } from "@/components/memory";
import { nextMessage, onCleanup, testBus, testClient, TRANSPORTS } from "@/tests/helpers";

describe.each(TRANSPORTS)("over %s", (transport) => {
  it("joins, sees others join and leave", async () => {
    const bus = await testBus({ transport });
    const watcher = await testClient(bus, { id: "watcher", role: "dashboard", label: "Watcher" });
    expect(watcher.welcome.components).toEqual([]);
    const joined = nextMessage(watcher, (m) => m.type === "joined");
    const ada = await connect({ id: "ada", role: "peripheral", label: "Ada", url: bus.url });
    expect((await joined).payload).toMatchObject({ id: "ada" });
    const left = nextMessage(watcher, (m) => m.type === "left");
    await ada.close();
    expect((await left).payload).toEqual({ id: "ada" });
  });

  it("reads, writes and faults through memory", async () => {
    const bus = await testBus({ transport });
    const memory = await startMemory({ url: bus.url });
    onCleanup(() => memory.close());
    const client = await testClient(bus, { id: "tester", role: "dashboard", label: "Tester" });
    await client.request("mem.write", "memory", { address: 0x300, bytes: [7, 8] });
    expect((await client.request("mem.read", "memory", { address: 0x300, length: 2 })).payload).toEqual({ address: 0x300, bytes: [7, 8] });
    await expect(client.request("mem.read", "memory", { address: 0x3ff, length: 2 })).rejects.toThrow(/outside memory/);
  });

  it("refuses a second component with the same id", async () => {
    const bus = await testBus({ transport });
    await testClient(bus, { id: "cpu", role: "cpu", label: "CPU" });
    await expect(connect({ id: "cpu", role: "cpu", label: "Impostor", url: bus.url })).rejects.toThrow(/already taken/);
  });
});

it("fails clearly when there's no in-page bus with that name", async () => {
  await expect(connect({ id: "lost", role: "peripheral", label: "Lost", url: "inpage://nowhere" })).rejects.toThrow(/could not reach the bus at inpage:\/\/nowhere/);
});
