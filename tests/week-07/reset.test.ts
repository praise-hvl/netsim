import { expect, it } from "vitest";
import { startMemory } from "@/components/memory";
import { nextMessage, onCleanup, recorder, testBus, testClient } from "@/tests/helpers";

it("reset in the middle of a tick stops the clock at once, without stalling anyone", async () => {
  const bus = await testBus({ tickTimeoutMs: 5000 });
  const rec = await recorder(bus);

  // A component that never finishes its tick, so the bus is stuck in TICKING.
  const socket = new WebSocket(bus.url);
  onCleanup(async () => socket.close());
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.send(JSON.stringify({ type: "hello", from: "stuck", to: "bus", id: "stuck-1", tick: 0, payload: { role: "peripheral", label: "Stuck" } }));
  await nextMessage(rec.client, (m) => m.type === "joined");

  const ticking = nextMessage(rec.client, (m) => m.type === "tick");
  void rec.client.request("control", "bus", { action: "step" });
  await ticking;

  const stopped = nextMessage(rec.client, (m) => m.type === "status" && m.from === "bus" && m.payload.state === "STOPPED", 1000);
  await rec.client.request("control", "bus", { action: "reset" });
  const status = await stopped;
  expect(status.type === "status" && status.payload.data).toMatchObject({ tick: 0, stalled: [], waitingFor: [], openRequests: 0 });
  expect(bus.tick()).toBe(0);

  // The clock works again straight away (the stuck component is gone by now).
  socket.close();
  await nextMessage(rec.client, (m) => m.type === "left");
  expect(await rec.step()).toBe(1);
});

it("a write from a tick abandoned by reset never reaches the freshly reset memory", async () => {
  const bus = await testBus({ tickTimeoutMs: 5000 });
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const rec = await recorder(bus);

  // A slow sensor: on tick 1 it writes its register 60 ms late, after the reset has happened.
  const socket = new WebSocket(bus.url);
  onCleanup(async () => socket.close());
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; tick: number };
    if (message.type !== "tick" || message.tick !== 1) return;
    setTimeout(() => {
      socket.send(JSON.stringify({ type: "mem.write", from: "sensor", to: "memory", id: "sensor-w", tick: 1, payload: { address: 0x3f0, bytes: [7] } }));
      socket.send(JSON.stringify({ type: "tick.done", from: "sensor", to: "bus", id: "sensor-d", tick: 1, payload: {} }));
    }, 60);
  });
  socket.send(JSON.stringify({ type: "hello", from: "sensor", to: "bus", id: "sensor-0", tick: 0, payload: { role: "peripheral", label: "Sensor" } }));
  await nextMessage(rec.client, (m) => m.type === "joined" && m.payload.id === "sensor");

  const ticking = nextMessage(rec.client, (m) => m.type === "tick");
  void rec.client.request("control", "bus", { action: "step" });
  await ticking;
  await rec.client.request("control", "bus", { action: "reset" });
  await new Promise((resolve) => setTimeout(resolve, 150)); // the late write has been sent by now

  expect(memory.memory().bytes[0x3f0]).toBe(0);
});

it("components that acknowledge the reset carry on as normal", async () => {
  const bus = await testBus();
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const rec = await recorder(bus);
  const sensor = await testClient(bus, { id: "sensor", role: "peripheral", label: "Sensor" });

  const heard = nextMessage(sensor, (m) => m.type === "reset");
  await rec.client.request("control", "bus", { action: "reset" });
  await heard; // connect() has already acknowledged it for us
  const ack = await sensor.request("mem.write", "memory", { address: 0x3f0, bytes: [9] });
  expect(ack.type).toBe("mem.ack");
  expect(memory.memory().bytes[0x3f0]).toBe(9);
  expect(await rec.step()).toBe(1);
});
