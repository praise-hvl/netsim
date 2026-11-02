import { describe, expect, it } from "vitest";
import { nextMessage, testSystem } from "@/tests/helpers";

describe("the button on a running system", () => {
  it("reports its state to the dashboard", async () => {
    const system = await testSystem({ host: true });
    const { client } = system.rec;
    const first = nextMessage(client, (m) => m.type === "status" && m.from === "button-1");
    await client.request("host.spawn", "host", { kind: "button", id: "button-1", label: "Power", config: {} });
    expect((await first).payload).toMatchObject({ state: "RELEASED", label: "Power", data: { presses: 0, register: "0x3F0", vector: "0x200" } });
  });

  it("the host refuses kinds it doesn't know", async () => {
    const system = await testSystem({ host: true });
    await expect(system.rec.client.request("host.spawn", "host", { kind: "toaster", id: "t", config: {} })).rejects.toThrow(/no peripheral kind "toaster"/);
  });
});
