// Two components touch the same address in the same tick: one writes it, one reads it.
// Whatever order their messages happen to reach the bus in, the result must be the same:
// the bus holds a tick's memory requests and hands them on in arbitration order.
import { expect, it } from "vitest";
import { arbitrate } from "@/bus/server";
import { startMemory } from "@/components/memory";
import { envelope } from "@/protocol/messages";
import { nextMessage, onCleanup, recorder, testBus } from "@/tests/helpers";

type Raw = { socket: WebSocket; id: string };

async function rawClient(url: string, id: string): Promise<Raw> {
  const socket = new WebSocket(url);
  onCleanup(async () => socket.close());
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.send(JSON.stringify({ type: "hello", from: id, to: "bus", id: `${id}-0`, tick: 0, payload: { role: "peripheral", label: id } }));
  return { socket, id };
}

/** On tick 1, wait `delayMs`, send `request`, then finish the tick. */
function onFirstTick(client: Raw, delayMs: number, type: string, payload: object) {
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; tick: number };
    if (message.type !== "tick") return;
    const send = (m: object) => client.socket.send(JSON.stringify(m));
    setTimeout(() => {
      if (message.tick === 1) send({ type, from: client.id, to: "memory", id: `${client.id}-req`, tick: 1, payload });
      send({ type: "tick.done", from: client.id, to: "bus", id: `${client.id}-done-${message.tick}`, tick: message.tick, payload: {} });
    }, delayMs);
  });
}

async function readSeen(writerDelay: number, readerDelay: number): Promise<number[]> {
  const bus = await testBus();
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const rec = await recorder(bus);
  const writer = await rawClient(bus.url, "sensor");
  const reader = await rawClient(bus.url, "cpu");
  await nextMessage(rec.client, (m) => m.type === "joined" && m.payload.id === "cpu");

  onFirstTick(writer, writerDelay, "mem.write", { address: 0x3f0, bytes: [7] });
  onFirstTick(reader, readerDelay, "mem.read", { address: 0x3f0, length: 1 });
  await rec.step();
  const reply = rec.messages.find((m) => m.type === "mem.data" && m.replyTo === "cpu-req");
  return reply?.type === "mem.data" ? reply.payload.bytes : [];
}

it("a read and a write of the same address in one tick give the same answer in any arrival order", async () => {
  const writeArrivesFirst = await readSeen(0, 40);
  const readArrivesFirst = await readSeen(40, 0);
  expect(readArrivesFirst).toEqual(writeArrivesFirst);
});

it("arbitration orders by sender id and keeps each sender's own order", () => {
  const request = (from: string, id: string) => ({ message: envelope("mem.read", from, "memory", { address: 0, length: 1 }, { id, tick: 1 }) });
  const arrived = [request("sensor", "s-1"), request("cpu", "c-1"), request("sensor", "s-2"), request("button", "b-1"), request("cpu", "c-2")];
  expect(arbitrate(arrived).map((r) => r.message.id)).toEqual(["b-1", "c-1", "c-2", "s-1", "s-2"]);
});
