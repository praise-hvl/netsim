import { describe, expect, it } from "vitest";
import type { BusClient } from "@/components/client";
import { nextMessage, testSystem } from "@/tests/helpers";

/**
 * Wait for the first status from each of `ids`. Start waiting before the spawn: a peripheral's
 * status comes over its own connection, so it can arrive after the host's reply to the spawn.
 */
function firstStatuses(client: BusClient, ids: readonly string[]): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const registers = new Map<string, string>();
    const stop = client.onAny((m) => {
      if (m.type !== "status" || !ids.includes(m.from) || registers.has(m.from)) return;
      registers.set(m.from, String(m.payload.data.register));
      if (registers.size === ids.length) {
        stop();
        resolve(registers);
      }
    });
  });
}

describe("peripheral host", () => {
  it("gives peripherals spawned at the same time different slots", async () => {
    const system = await testSystem({ host: true });
    const { client } = system.rec;
    const spawn = (id: string) => client.request("host.spawn", "host", { kind: "button", id, config: {} });

    const statuses = firstStatuses(client, ["button-a", "button-b", "button-c"]);
    await Promise.all([spawn("button-a"), spawn("button-b"), spawn("button-c")]);

    const registers = await statuses;
    expect(registers.size).toBe(3);
    expect(new Set(registers.values()).size).toBe(3);
  });

  it("frees the slot again when a spawn fails", async () => {
    const system = await testSystem({ host: true });
    const { client } = system.rec;
    await client.request("host.spawn", "host", { kind: "button", id: "button-a", config: {} });
    // Same id twice: the bus refuses the second connection, so the spawn fails after reserving a slot.
    await expect(client.request("host.spawn", "host", { kind: "button", id: "button-a", config: {} })).rejects.toThrow(/already taken/);
    const status = nextMessage(client, (m) => m.type === "status" && m.from === "button-b");
    await client.request("host.spawn", "host", { kind: "button", id: "button-b", config: {} });
    const seen = await status;
    expect(seen.type === "status" && seen.payload.data.register).toBe("0x3F1");
  });

  it("refuses a slot that is already taken", async () => {
    const system = await testSystem({ host: true });
    const { client } = system.rec;
    await client.request("host.spawn", "host", { kind: "button", id: "button-a", config: {}, slot: 4 });
    await expect(client.request("host.spawn", "host", { kind: "button", id: "button-b", config: {}, slot: 4 })).rejects.toThrow(/slot 4 is already used by button-a/);
  });
});
