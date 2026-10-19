import { describe, expect, it } from "vitest";
import { connect } from "@/components/client";
import { nextMessage, testBus, testClient } from "@/tests/helpers";

describe("handshake", () => {
  it("gets a welcome listing who is already connected", async () => {
    const bus = await testBus();
    await testClient(bus, { id: "memory", role: "memory", label: "Memory" });
    const client = await testClient(bus, { id: "ada", role: "peripheral", kind: "hello", label: "Ada's client" });

    expect(client.id).toBe("ada");
    expect(client.tick).toBe(0);
    expect(client.welcome.running).toBe(false);
    expect(client.welcome.components).toEqual([{ id: "memory", role: "memory", label: "Memory" }]);
  });

  it("tells everyone else when someone joins and leaves", async () => {
    const bus = await testBus();
    const watcher = await testClient(bus, { id: "watcher", role: "dashboard", label: "Watcher" });

    const joined = nextMessage(watcher, (m) => m.type === "joined");
    const other = await connect({ id: "grace", role: "peripheral", label: "Grace", url: bus.url });
    expect((await joined).payload).toEqual({ id: "grace", role: "peripheral", label: "Grace" });

    const left = nextMessage(watcher, (m) => m.type === "left");
    await other.close();
    expect((await left).payload).toEqual({ id: "grace" });
  });

  it("refuses a second component with the same id", async () => {
    const bus = await testBus();
    await testClient(bus, { id: "cpu", role: "cpu", label: "CPU" });
    await expect(connect({ id: "cpu", role: "cpu", label: "Impostor", url: bus.url })).rejects.toThrow(/already taken/);
  });

  it("fails clearly when there is no bus", async () => {
    await expect(connect({ id: "lost", role: "peripheral", label: "Lost", url: "ws://127.0.0.1:1" })).rejects.toThrow(/could not reach the bus/);
  });
});
