import { describe, expect, it } from "vitest";
import type { Message } from "@/protocol/messages";
import { nextMessage, recorder, testBus, testClient } from "@/tests/helpers";

describe("who may send what", () => {
  it.each(["tick", "reset", "welcome", "joined", "left"] as const)("only the bus may send %s", async (type) => {
    const bus = await testBus();
    const rec = await recorder(bus);
    const victim = await testClient(bus, { id: "victim", role: "peripheral", label: "Victim" });
    const sneaky = await testClient(bus, { id: "sneaky", role: "peripheral", label: "Sneaky" });
    const got: Message[] = [];
    victim.onAny((m) => got.push(m));

    const attempts = {
      tick: () => sneaky.send("tick", "*", {}),
      reset: () => sneaky.send("reset", "*", {}),
      welcome: () => sneaky.send("welcome", "victim", { running: false, speedMs: 1, components: [] }),
      joined: () => sneaky.send("joined", "*", { id: "ghost", role: "cpu", label: "Ghost" }),
      left: () => sneaky.send("left", "*", { id: "cpu" }),
    };
    const refused = nextMessage(sneaky, (m) => m.type === "error");
    attempts[type]();
    const error = await refused;
    expect(error.type === "error" && error.payload.message).toBe(`only the bus may send ${type}`);

    await rec.step();
    expect(got.filter((m) => m.from === "sneaky")).toEqual([]);
  });

  it("only the bus or a dashboard may ask for or set a snapshot", async () => {
    const bus = await testBus();
    await testClient(bus, { id: "memory", role: "memory", label: "Memory" });
    const sneaky = await testClient(bus, { id: "sneaky", role: "peripheral", label: "Sneaky" });
    await expect(sneaky.request("snapshot.set", "memory", { data: {} })).rejects.toThrow("only the bus or a dashboard may send snapshot.set");
    await expect(sneaky.request("snapshot.get", "memory", {})).rejects.toThrow("only the bus or a dashboard may send snapshot.get");
  });
});

it("a message that breaks the protocol still gets an answer, so a request doesn't hang", async () => {
  const bus = await testBus();
  const client = await testClient(bus, { id: "dash", role: "dashboard", label: "Dash" });
  await expect(client.request("cpu.cores", "bus", { count: 99 })).rejects.toThrow(/invalid message/);
});
