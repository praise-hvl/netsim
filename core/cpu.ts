// The whole CPU in one pure function: N cores (1 to 8, 2 by default), the scheduler and the
// interrupt queue. Every core is the same FSM; adding cores just means more of them take turns
// on the same queues. components/cpu.ts connects this to the bus; tests can run it directly.
import { z } from "zod";
import { disassemble } from "@/core/isa";
import {
  canTakeInterrupt,
  coreSchema,
  createCore,
  enterInterrupt,
  inHandler,
  restoreCore,
  snapshotCore,
  stepCore,
  type Core,
  type CoreEffect,
  memReplySchema,
  type MemReply,
} from "@/core/cpu-core";
import { enqueue, irqSchema, takeNext } from "@/core/interrupts";
import { addProcess, createScheduler, restoreScheduler, schedule, schedulerSchema, snapshotScheduler } from "@/core/scheduler";
import type { CpuStatusData } from "@/protocol/messages";

const raisedIrqSchema = irqSchema.omit({ seq: true });
export type RaisedIrq = z.infer<typeof raisedIrqSchema>;

/**
 * Everything that arrived since the last tick, waiting to be used on the next one. Like the
 * input flip-flops of a real chip, it is part of the state, so a save made between two ticks
 * doesn't lose a memory answer that is already on its way into a core.
 */
const inboxSchema = z.object({
  replies: z.array(z.object({ core: z.number().int(), reply: memReplySchema })),
  irqs: z.array(raisedIrqSchema),
});

export const MIN_CORES = 1;
export const MAX_CORES = 8;
export const DEFAULT_CORES = 2;

export const cpuSchema = z.object({
  cores: z.array(coreSchema).min(MIN_CORES).max(MAX_CORES),
  scheduler: schedulerSchema,
  irqs: z.array(irqSchema),
  nextIrqSeq: z.number().int().min(0),
  inbox: inboxSchema,
});
export type Cpu = z.infer<typeof cpuSchema>;

export type CpuEffect = CoreEffect & { core: number };

export function checkCoreCount(count: number): number {
  if (!Number.isInteger(count) || count < MIN_CORES || count > MAX_CORES) {
    throw new RangeError(`a CPU has ${MIN_CORES} to ${MAX_CORES} cores, not ${count}`);
  }
  return count;
}

export function createCpu(options: { cores?: number; quantum?: number } = {}): Cpu {
  const count = checkCoreCount(options.cores ?? DEFAULT_CORES);
  const cores = Array.from({ length: count }, (_, id) => createCore(id));
  return { cores, scheduler: createScheduler(options.quantum), irqs: [], nextIrqSeq: 0, inbox: { replies: [], irqs: [] } };
}

/**
 * Change the number of cores. New cores start IDLE. A core can only be taken away while it's
 * IDLE (no program, no interrupt handler), so nothing is ever cut off halfway through.
 */
export function resizeCpu(cpu: Cpu, count: number): Cpu {
  checkCoreCount(count);
  if (count >= cpu.cores.length) {
    const added = Array.from({ length: count - cpu.cores.length }, (_, i) => createCore(cpu.cores.length + i));
    return { ...cpu, cores: [...cpu.cores, ...added] };
  }
  const busy = cpu.cores.slice(count).find((core) => core.phase !== "IDLE" || inHandler(core));
  if (busy) throw new Error(`core ${busy.id} is busy (${busy.phase}); wait until it's idle, or reset, before removing it`);
  return { ...cpu, cores: cpu.cores.slice(0, count) };
}

/** Latch a memory answer for `core`; it is used on the next tick. */
export function receiveReply(cpu: Cpu, core: number, reply: MemReply): Cpu {
  return { ...cpu, inbox: { ...cpu.inbox, replies: [...cpu.inbox.replies, { core, reply }] } };
}

/** Latch an interrupt request; it joins the queue on the next tick. */
export function receiveIrq(cpu: Cpu, irq: RaisedIrq): Cpu {
  return { ...cpu, inbox: { ...cpu.inbox, irqs: [...cpu.inbox.irqs, irq] } };
}

export function addProgram(cpu: Cpu, name: string, start: number): { cpu: Cpu; pid: number } {
  const { scheduler, pid } = addProcess(cpu.scheduler, name, start);
  return { cpu: { ...cpu, scheduler }, pid };
}

/** One clock tick: queue new interrupts, schedule, hand out interrupts, then step every core. */
export function tickCpu(cpu: Cpu): { cpu: Cpu; effects: CpuEffect[] } {
  // 1. Queue interrupts that arrived since the last tick.
  let irqs = cpu.irqs;
  let seq = cpu.nextIrqSeq;
  for (const irq of cpu.inbox.irqs) irqs = enqueue(irqs, { ...irq, seq: seq++ });

  // 2. Let the scheduler finish, swap and start programs.
  const scheduled = schedule(cpu.scheduler, cpu.cores);
  const cores = scheduled.cores;

  // 3. Hand interrupts to cores that are between instructions, never to one already in a
  //    handler. A free (idle) core first, so programs aren't disturbed; otherwise a core running
  //    a program, which an interrupt outranks. Each core takes at most one per tick, so with N
  //    cores up to N interrupts start at once, most urgent first.
  while (irqs.length > 0) {
    const target = cores.find((c) => c.phase === "IDLE" && canTakeInterrupt(c)) ?? cores.find((c) => canTakeInterrupt(c));
    if (!target) break;
    const next = takeNext(irqs);
    irqs = next.queue;
    if (next.irq) cores[target.id] = enterInterrupt(target, next.irq.vector);
  }

  // 4. Step every core with whatever memory said to it.
  const effects: CpuEffect[] = [];
  const stepped = cores.map((core) => {
    const reply = cpu.inbox.replies.find((r) => r.core === core.id)?.reply ?? null;
    const result = stepCore(core, reply);
    for (const effect of result.effects) effects.push({ ...effect, core: core.id });
    return result.core;
  });

  const next: Cpu = { cores: stepped, scheduler: scheduled.scheduler, irqs, nextIrqSeq: seq, inbox: { replies: [], irqs: [] } };
  return { cpu: next, effects };
}

/** The data the dashboard's CPU node draws. */
export function cpuView(cpu: Cpu): CpuStatusData {
  const pidOn = (core: Core) => cpu.scheduler.processes.find((p) => p.core === core.id && p.state === "RUNNING")?.pid ?? null;
  return {
    cores: cpu.cores.map((core) => ({
      id: core.id,
      state: core.phase,
      pc: core.pc,
      ir: core.ir,
      instruction: core.instruction ? disassemble(core.instruction) : null,
      registers: [...core.registers],
      flags: core.flags,
      pid: pidOn(core),
      inHandler: inHandler(core),
    })),
    processes: cpu.scheduler.processes.map((p) => {
      const core = p.core === null ? undefined : cpu.cores[p.core];
      return { pid: p.pid, name: p.name, state: p.state, start: p.start, instructions: p.instructions + (core?.retired ?? 0) };
    }),
    pendingIrqs: cpu.irqs.length,
  };
}

export function snapshotCpu(cpu: Cpu): Cpu {
  return { ...structuredClone(cpu), cores: cpu.cores.map(snapshotCore), scheduler: snapshotScheduler(cpu.scheduler) };
}

export function restoreCpu(data: unknown): Cpu {
  const shape = cpuSchema.extend({ cores: z.array(z.unknown()).min(MIN_CORES).max(MAX_CORES), scheduler: z.unknown() });
  const raw = shape.parse(data);
  const cores = raw.cores.map(restoreCore);
  // Core ids are their positions: 0, 1, 2... The scheduler and the inbox find cores by id.
  cores.forEach((core, i) => {
    if (core.id !== i) throw new Error(`core ${i} in the save says it is core ${core.id}`);
  });
  return { ...raw, cores, scheduler: restoreScheduler(raw.scheduler) };
}
