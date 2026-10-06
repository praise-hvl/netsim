// The CPU component: runs core/cpu.ts on the bus. Effects become mem.* requests; replies and
// interrupts are latched and handed to the CPU on the next tick.
import { addProgram, createCpu, cpuView, receiveIrq, receiveReply, resizeCpu, restoreCpu, snapshotCpu, tickCpu, type Cpu, type CpuEffect } from "@/core/cpu";
import { connect, type BusClient } from "@/components/client";
import type { Message } from "@/protocol/messages";
import { todo } from "@/core/todo";

/** `cores`: 1-8, default 2. Can be changed later with a `cpu.cores` message. */
export type CpuOptions = { url?: string; id?: string; cores?: number; quantum?: number };
export type RunningCpu = { client: BusClient; cpu(): Cpu; close(): Promise<void> };

export async function startCpu(options: CpuOptions = {}): Promise<RunningCpu> {
  const client = await connect({ id: options.id ?? "cpu", role: "cpu", label: "CPU", url: options.url });
  let cpu: Cpu = createCpu({ cores: options.cores, quantum: options.quantum });
  // A reset keeps the current number of cores, even if it was changed since the start.
  const fresh = () => createCpu({ cores: cpu.cores.length, quantum: options.quantum });

  /** Which core is waiting for which request id. */
  const waiting = new Map<string, number>();

  function latchReply(message: Message): void {
    // @student week=5 part=class id=cpu-latch-reply "Find which core asked, turn the reply into a MemReply and keep it for the next tick"
    // TODO(week 5, cpu-latch-reply): Find which core asked, turn the reply into a MemReply and keep it for the next tick
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    return todo("week 5: cpu-latch-reply", message);
    // @end
  }

  function sendEffects(effects: readonly CpuEffect[]): void {
    // @student week=5 part=class id=cpu-send-effects "Send each read/write effect to memory and remember which core is waiting for the reply"
    // TODO(week 5, cpu-send-effects): Send each read/write effect to memory and remember which core is waiting for the reply
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    return todo("week 5: cpu-send-effects", effects);
    // @end
  }

  for (const type of ["mem.data", "mem.ack", "fault", "error"] as const) client.on(type, latchReply);
  client.on("irq", (message) => {
    cpu = receiveIrq(cpu, { ...message.payload, source: message.from });
  });
  client.on("process.add", (message) => {
    cpu = addProgram(cpu, message.payload.name, message.payload.start).cpu;
    publishStatus();
    client.reply(message, "ok", {});
  });

  client.on("cpu.cores", (message) => {
    try {
      cpu = resizeCpu(cpu, message.payload.count);
      publishStatus();
      client.reply(message, "ok", {});
    } catch (error) {
      client.reply(message, "error", { message: (error as Error).message });
    }
  });

  let lastStatus = "";
  function publishStatus(): void {
    const data = cpuView(cpu);
    const text = JSON.stringify(data);
    if (text === lastStatus) return;
    lastStatus = text;
    const busy = data.cores.filter((c) => c.state !== "IDLE").length;
    client.send("status", "*", { state: busy > 0 ? "RUNNING" : "IDLE", label: "CPU", data });
  }

  client.onTick(() => {
    const result = tickCpu(cpu);
    cpu = result.cpu;
    sendEffects(result.effects);
    publishStatus();
  });

  client.on("reset", () => {
    cpu = fresh();
    waiting.clear();
    publishStatus();
  });
  client.on("snapshot.get", (message) => {
    // Saving is a stretch module: until the snapshot functions are built they throw, and the save says so.
    try {
      client.reply(message, "snapshot", { data: snapshotCpu(cpu) });
    } catch (error) {
      client.reply(message, "error", { message: `the CPU can't be saved yet (persistence is a stretch module): ${(error as Error).message}` });
    }
  });
  client.on("snapshot.check", (message) => {
    try {
      restoreCpu(message.payload.data); // only checking: the result is thrown away
      client.reply(message, "ok", {});
    } catch (error) {
      client.reply(message, "error", { message: `bad cpu snapshot: ${(error as Error).message}` });
    }
  });
  client.on("snapshot.set", (message) => {
    try {
      cpu = restoreCpu(message.payload.data);
      waiting.clear();
      publishStatus();
      client.reply(message, "ok", {});
    } catch (error) {
      client.reply(message, "error", { message: `bad cpu snapshot: ${(error as Error).message}` });
    }
  });

  publishStatus();
  return { client, cpu: () => cpu, close: () => client.close() };
}
