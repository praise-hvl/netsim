// Shared test setup: a bus on a free port, and everything started during a test is closed after it.
import { afterEach } from "vitest";
import type { Bus } from "@/bus/server";
import { startBus, type BusOptions } from "@/bus/ws-server";
import { startInPageBus } from "@/bus/in-page";
import { connect, type BusClient, type ClientOptions } from "@/components/client";
import type { Json, Message } from "@/protocol/messages";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";
import { assemble } from "@/core/asm";
import { createCore, loadContext, stepCore, type Core, type MemReply, type Phase } from "@/core/cpu-core";
import { createMemory, read, write, type Memory } from "@/core/memory";
import { startCpu } from "@/components/cpu";
import { startHost } from "@/components/host";
import { startMemory } from "@/components/memory";
import { addProgram, createCpu, receiveIrq, receiveReply, tickCpu, type Cpu } from "@/core/cpu";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export function onCleanup(cleanup: () => Promise<void>): void {
  cleanups.push(cleanup);
}

export type Transport = "ws" | "inpage";
export const TRANSPORTS: readonly Transport[] = ["ws", "inpage"];

let inPageBuses = 0;

/**
 * A bus for one test: over WebSockets (the default), or inside this process (`inpage`, like a
 * web page runs it). NETSIM_TRANSPORT=inpage changes the default for a whole run.
 */
export async function testBus(options: BusOptions & { transport?: Transport } = {}): Promise<Bus> {
  const transport = options.transport ?? (process.env.NETSIM_TRANSPORT === "inpage" ? "inpage" : "ws");
  const bus =
    transport === "inpage"
      ? startInPageBus({ tickTimeoutMs: 1000, ...options, name: `test-${++inPageBuses}` })
      : await startBus({ port: 0, tickTimeoutMs: 1000, ...options });
  onCleanup(() => bus.close());
  return bus;
}

export async function testClient(bus: Bus, options: Omit<ClientOptions, "url">): Promise<BusClient> {
  const client = await connect({ ...options, url: bus.url });
  onCleanup(() => client.close());
  return client;
}

export type Recorder = {
  client: BusClient;
  messages: Message[];
  /** Step the bus and wait until this recorder has seen everything from that tick. */
  step(): Promise<number>;
  steps(count: number): Promise<void>;
};

/**
 * A dashboard that records every message it sees. The bus sends its own `status` as the last
 * message of every tick, so once the recorder sees it the whole tick has arrived.
 */
export async function recorder(bus: Bus, id = "dash"): Promise<Recorder> {
  const client = await testClient(bus, { id, role: "dashboard", label: "Recorder" });
  const messages: Message[] = [];
  client.onAny((m) => messages.push(m));
  const step = async () => {
    const endOfTick = nextMessage(client, (m) => m.type === "status" && m.from === "bus" && m.payload.data.tick === bus.tick() && m.payload.state !== "TICKING", 8000);
    const tick = await bus.step();
    await endOfTick;
    return tick;
  };
  return {
    client,
    messages,
    step,
    async steps(count) {
      for (let i = 0; i < count; i++) await step();
    },
  };
}

/** Resolve on the next message matching `predicate`. */
export function nextMessage(client: BusClient, predicate: (m: Message) => boolean, timeoutMs = 2000): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error("timed out waiting for a message"));
    }, timeoutMs);
    const stop = client.onAny((m) => {
      if (!predicate(m)) return;
      clearTimeout(timer);
      stop();
      resolve(m);
    });
  });
}

// ── Running a program on one core, without the bus ─────────────────────────

export type RunOptions = {
  /** Stop after this many ticks even if the program hasn't halted. Default 1000. */
  ticks?: number;
  /** Extra bytes to put in memory first, as { address: value }. */
  memory?: Record<number, number>;
  /** Where the program is loaded and starts. Default 0. */
  origin?: number;
};

export type RunResult = { core: Core; memory: Memory; ticks: number; trace: Phase[] };

/**
 * Run a program on a single core until it halts or faults. Memory answers on the next tick,
 * exactly like over the bus. Accepts raw bytes or assembly source.
 */
export function runProgram(program: readonly number[] | string, options: RunOptions = {}): RunResult {
  const origin = options.origin ?? 0;
  const bytes = typeof program === "string" ? assemble(program, { origin }) : [...program];
  let memory = mustWrite(createMemory(), origin, bytes);
  for (const [address, value] of Object.entries(options.memory ?? {})) memory = mustWrite(memory, Number(address), [value]);

  let core = loadContext(createCore(0), { registers: [0, 0, 0, 0], pc: origin, flags: { zero: false, carry: false } });
  let reply: MemReply | null = null;
  const trace: Phase[] = [];
  let ticks = 0;
  while (ticks < (options.ticks ?? 1000) && core.phase !== "HALTED" && core.phase !== "FAULT") {
    ticks++;
    const step = stepCore(core, reply);
    core = step.core;
    reply = null;
    for (const effect of step.effects) {
      if (effect.kind === "read") {
        const result = read(memory, effect.address, effect.length);
        reply = result.ok ? { type: "memData", bytes: result.value } : { type: "memFault", message: result.fault };
      } else {
        const result = write(memory, effect.address, effect.bytes);
        if (result.ok) memory = result.value;
        reply = result.ok ? { type: "memAck" } : { type: "memFault", message: result.fault };
      }
    }
    trace.push(core.phase);
  }
  return { core, memory, ticks, trace };
}

function mustWrite(memory: Memory, address: number, bytes: number[]): Memory {
  const result = write(memory, address, bytes);
  if (!result.ok) throw new Error(result.fault);
  return result.value;
}

// ── Running the whole CPU (two cores + scheduler + interrupts), without the bus ─

export type CpuRunOptions = {
  ticks: number;
  memory?: Record<number, number>;
  cores?: number;
  quantum?: number;
  /** Interrupts to raise: they arrive during `tick` and are seen on the next one, like over the bus. */
  irqs?: ReadonlyArray<{ tick: number; vector: number; priority: number; source?: string }>;
  /** Called after every tick, e.g. to record who ran where. */
  onTick?: (cpu: Cpu, tick: number) => void;
};

export type Loadable = { name: string; address: number; program: readonly number[] | string; symbols?: Record<string, number> };

/** Load programs (and handlers) into memory, add the named ones as processes, and run. */
export function runCpu(programs: readonly Loadable[], options: CpuRunOptions & { processes?: readonly string[] }): { cpu: Cpu; memory: Memory } {
  let memory = createMemory();
  let cpu = createCpu({ cores: options.cores, quantum: options.quantum });
  for (const p of programs) {
    const bytes = typeof p.program === "string" ? assemble(p.program, { origin: p.address, symbols: p.symbols }) : [...p.program];
    memory = mustWrite(memory, p.address, bytes);
    if (!options.processes || options.processes.includes(p.name)) {
      if (!p.name.startsWith("isr")) cpu = addProgram(cpu, p.name, p.address).cpu;
    }
  }
  for (const [address, value] of Object.entries(options.memory ?? {})) memory = mustWrite(memory, Number(address), [value]);

  for (let tick = 1; tick <= options.ticks; tick++) {
    const result = tickCpu(cpu);
    cpu = result.cpu;
    // Everything below "arrives" during this tick and is used on the next one.
    for (const effect of result.effects) {
      let reply: MemReply;
      if (effect.kind === "read") {
        const r = read(memory, effect.address, effect.length);
        reply = r.ok ? { type: "memData", bytes: r.value } : { type: "memFault", message: r.fault };
      } else {
        const w = write(memory, effect.address, effect.bytes);
        if (w.ok) memory = w.value;
        reply = w.ok ? { type: "memAck" } : { type: "memFault", message: w.fault };
      }
      cpu = receiveReply(cpu, effect.core, reply);
    }
    for (const irq of (options.irqs ?? []).filter((i) => i.tick === tick)) {
      cpu = receiveIrq(cpu, { vector: irq.vector, priority: irq.priority, source: irq.source ?? "test" });
    }
    options.onTick?.(cpu, tick);
  }
  return { cpu, memory };
}

// ── A whole system on one bus, in this process ─────────────────────────────

export type TestSystem = {
  bus: Bus;
  rec: Recorder;
  /** Load a program and add it as a process. */
  run(name: string, address: number, program: readonly number[] | string): Promise<void>;
  memoryByte(address: number): number;
  cpu(): Cpu;
};

/** Bus + Memory + CPU (+ host when asked), and a recording dashboard to drive them. */
export async function testSystem(options: { host?: boolean; busOptions?: BusOptions & { transport?: Transport } } = {}): Promise<TestSystem> {
  const bus = await testBus(options.busOptions);
  const memory = await startMemory({ url: bus.url });
  onCleanup(() => memory.close());
  const cpu = await startCpu({ url: bus.url });
  onCleanup(() => cpu.close());
  if (options.host) {
    const host = await startHost({ url: bus.url });
    onCleanup(() => host.close());
  }
  const rec = await recorder(bus);
  return {
    bus,
    rec,
    async run(name, address, program) {
      const bytes = typeof program === "string" ? assemble(program, { origin: address }) : [...program];
      await rec.client.request("program.load", "memory", { address, bytes });
      await rec.client.request("process.add", "cpu", { name, start: address });
    },
    memoryByte: (address) => memory.memory().bytes[address],
    cpu: () => cpu.cpu(),
  };
}

// ── Peripherals ────────────────────────────────────────────────────────────

/** The status a freshly started peripheral would send, with its default config. */
export function firstStatus<S extends Json, I, C>(definition: PeripheralDefinition<S, I, C>) {
  const view = definition.view(definition.init(definition.configSchema.parse({})));
  return { ...view, label: definition.label };
}
