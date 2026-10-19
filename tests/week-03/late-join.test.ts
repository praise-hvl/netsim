import { expect, it } from "vitest";
import { connect } from "@/components/client";
import type { Message } from "@/protocol/messages";
import { nextMessage, onCleanup, recorder, testBus, testClient } from "@/tests/helpers";

it("a dashboard that joins late still gets everyone's latest status", async () => {
  const bus = await testBus();
  const rec = await recorder(bus);
  for (const id of ["ada", "grace"]) {
    const client = await testClient(bus, { id, role: "peripheral", label: id });
    const arrived = nextMessage(rec.client, (m) => m.type === "status" && m.from === id);
    client.send("status", "*", { state: "AWAKE", label: id, data: {} });
    await arrived;
  }

  const late = await connect({ id: "late", role: "dashboard", label: "Late", url: bus.url });
  onCleanup(() => late.close());
  const seen: Message[] = [];
  late.onAny((m) => seen.push(m));

  // Everything the bus sent on join comes before the next tick, on the same socket.
  const tickSeen = nextMessage(late, (m) => m.type === "tick");
  await rec.step();
  await tickSeen;
  const statusFrom = new Set(seen.filter((m) => m.type === "status").map((m) => m.from));
  expect(statusFrom).toEqual(new Set(["ada", "grace", "bus"]));
  expect(seen.some((m) => m.type === "welcome")).toBe(false);
});
