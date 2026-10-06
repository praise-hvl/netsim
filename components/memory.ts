// The Memory component: answers mem.read / mem.write / program.load from anyone on the bus.
import { createMemory, read, restoreMemory, snapshotMemory, write, type Memory } from "@/core/memory";
import { connect, type BusClient } from "@/components/client";
import type { Message, MemoryStatusData } from "@/protocol/messages";
import { todo } from "@/core/todo";

export type RunningMemory = { client: BusClient; memory(): Memory; close(): Promise<void> };

type Access = { address: number; length: number } | null;

export async function startMemory(options: { url?: string; id?: string } = {}): Promise<RunningMemory> {
  const client = await connect({ id: options.id ?? "memory", role: "memory", label: "Memory", url: options.url });
  let memory = createMemory();
  let lastRead: Access = null;
  let lastWrite: Access = null;
  let changed = true;

  /** Handle one request and send exactly one reply. */
  function answer(message: Message): void {
    // @student week=3 part=home id=memory-handler "Reply mem.data to mem.read, mem.ack to mem.write/program.load, fault when out of range"
    // TODO(week 3, memory-handler): Reply mem.data to mem.read, mem.ack to mem.write/program.load, fault when out of range
    // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
    return todo("week 3: memory-handler", message);
    // @end
  }

  for (const type of ["mem.read", "mem.write", "program.load"] as const) {
    client.on(type, (message) => {
      answer(message);
      changed = true;
      // Loading a program isn't part of a tick, so show it now rather than on the next Step.
      if (type === "program.load") publishStatus();
    });
  }

  function publishStatus(): void {
    if (!changed) return;
    changed = false;
    const data: MemoryStatusData = { bytes: memory.bytes, lastRead, lastWrite };
    const state = lastWrite ? "WRITING" : lastRead ? "READING" : "READY";
    client.send("status", "*", { state, label: "Memory", data });
    lastRead = null;
    lastWrite = null;
  }

  client.onTick(publishStatus);
  client.on("reset", () => {
    memory = createMemory();
    changed = true;
    publishStatus();
  });
  client.on("snapshot.get", (message) => {
    // Saving is a stretch module: until snapshotMemory is built it throws, and the save says so.
    try {
      client.reply(message, "snapshot", { data: snapshotMemory(memory) });
    } catch (error) {
      client.reply(message, "error", { message: `memory can't be saved yet (persistence is a stretch module): ${(error as Error).message}` });
    }
  });
  client.on("snapshot.check", (message) => {
    try {
      restoreMemory(message.payload.data); // only checking: the result is thrown away
      client.reply(message, "ok", {});
    } catch (error) {
      client.reply(message, "error", { message: `bad memory snapshot: ${(error as Error).message}` });
    }
  });
  client.on("snapshot.set", (message) => {
    try {
      memory = restoreMemory(message.payload.data);
      changed = true;
      publishStatus();
      client.reply(message, "ok", {});
    } catch (error) {
      client.reply(message, "error", { message: `bad memory snapshot: ${(error as Error).message}` });
    }
  });

  publishStatus();
  return { client, memory: () => memory, close: () => client.close() };
}
