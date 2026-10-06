// Turns bus messages into frames: one picture of the whole machine per clock tick.
// Pure functions only (no React, no sockets), so a recorded trace and a live bus go through the
// same code, and tests can check every step.
import { cpuStatusData, memoryStatusData, type ComponentInfo, type Json, type Message, type MessageType } from "@/protocol/messages";
import { MEMORY_SIZE } from "@/protocol/memory-map";

/** Every drawn part has an id. "you" stands for everything outside the board: the dashboard, the host. */
export const OUTSIDE = "you";

/** The message types the board draws as packets. Everything else is bookkeeping. */
export const PACKET_TYPES = ["mem.read", "mem.data", "mem.write", "mem.ack", "irq", "input", "program.load"] as const;
export type PacketType = (typeof PACKET_TYPES)[number];

export type Packet = {
  /** Position in the tick, from 0. */
  seq: number;
  type: PacketType;
  from: string;
  to: string;
  /** The memory address it is about, or the handler address for an irq. */
  address: number | null;
  /** How many bytes it asks for or carries. */
  length: number;
  /** The single byte it carries (writes, one-byte answers), if there is one. */
  value: number | null;
  /** The CPU core it belongs to, worked out from the CPU's status (see attributeCore). */
  core: number | null;
};

export type CoreFrame = {
  id: number;
  phase: string;
  pc: number;
  instruction: string | null;
  registers: number[];
  flags: { zero: boolean; carry: boolean };
  /** The program running on it, or null when idle. */
  process: string | null;
  inHandler: boolean;
};

export type ProcessFrame = { pid: number; name: string; state: string; instructions: number; core: number | null };

export type PartFrame = { id: string; role: ComponentInfo["role"]; kind: string; label: string; state: string; data: Record<string, Json> };

/** A memory access this tick, for lighting up RAM cells. */
export type Access = { address: number; length: number; kind: "read" | "write"; by: string; core: number | null };

export type Frame = {
  tick: number;
  packets: Packet[];
  accesses: Access[];
  cores: CoreFrame[];
  processes: ProcessFrame[];
  memory: number[];
  /** Which program's bytes each cell holds (from program.load), or null. */
  owners: (string | null)[];
  parts: Record<string, PartFrame>;
  pendingIrqs: number;
};

export function emptyFrame(components: readonly ComponentInfo[] = []): Frame {
  const parts: Record<string, PartFrame> = {};
  for (const info of components) parts[info.id] = partFor(info);
  return {
    tick: 0,
    packets: [],
    accesses: [],
    cores: [],
    processes: [],
    memory: new Array<number>(MEMORY_SIZE).fill(0),
    owners: new Array<string | null>(MEMORY_SIZE).fill(null),
    parts,
    pendingIrqs: 0,
  };
}

function partFor(info: ComponentInfo): PartFrame {
  return { id: info.id, role: info.role, kind: info.kind ?? info.role, label: info.label, state: "", data: {} };
}

/** Group messages by tick, in order. A tick with no messages still gets an (empty) group. */
export function groupByTick(messages: readonly Message[]): { tick: number; messages: Message[] }[] {
  if (messages.length === 0) return [];
  const first = messages[0].tick;
  const last = messages.reduce((max, m) => Math.max(max, m.tick), first);
  const groups = Array.from({ length: last - first + 1 }, (_, i) => ({ tick: first + i, messages: [] as Message[] }));
  for (const m of messages) groups[m.tick - first].messages.push(m);
  return groups;
}

/** Every frame of a recorded run, one per tick. */
export function buildFrames(components: readonly ComponentInfo[], messages: readonly Message[]): Frame[] {
  const frames: Frame[] = [];
  let frame = emptyFrame(components);
  for (const group of groupByTick(messages)) {
    frame = nextFrame(frame, group.tick, group.messages);
    frames.push(frame);
  }
  return frames;
}

/** The machine after one tick: `previous` plus everything that happened in `messages`. */
export function nextFrame(previous: Frame, tick: number, messages: readonly Message[]): Frame {
  const parts = { ...previous.parts };
  const outside = (id: string) => (parts[id] && isDrawn(parts[id].role) ? id : OUTSIDE);

  // Membership first, so packets from a part that joined this tick land on it.
  for (const m of messages) {
    if (m.type === "welcome") for (const info of m.payload.components) parts[info.id] ??= partFor(info);
    if (m.type === "joined") parts[m.payload.id] = partFor(m.payload);
    if (m.type === "left") delete parts[m.payload.id];
  }

  let cores = previous.cores;
  let processes = previous.processes;
  let pendingIrqs = previous.pendingIrqs;
  let memory = previous.memory;
  let owners = previous.owners;
  let reset = false;

  // Status reports describe the state at the end of the tick.
  for (const m of messages) {
    if (m.type === "reset") reset = true;
    if (m.type !== "status") continue;
    if (m.from === "cpu") {
      const parsed = cpuStatusData.safeParse(m.payload.data);
      if (!parsed.success) continue;
      const names = new Map(parsed.data.processes.map((p) => [p.pid, p.name]));
      cores = parsed.data.cores.map((c) => ({
        id: c.id,
        phase: c.state,
        pc: c.pc,
        instruction: c.instruction,
        registers: c.registers,
        flags: c.flags,
        process: c.pid === null ? null : (names.get(c.pid) ?? null),
        inHandler: c.inHandler,
      }));
      processes = parsed.data.processes.map((p) => ({
        pid: p.pid,
        name: p.name,
        state: p.state,
        instructions: p.instructions,
        core: p.state === "RUNNING" ? (parsed.data.cores.find((c) => c.pid === p.pid)?.id ?? null) : null,
      }));
      pendingIrqs = parsed.data.pendingIrqs;
    }
    const part = parts[m.from];
    if (part) parts[m.from] = { ...part, state: m.payload.state, data: m.payload.data };
  }
  if (reset) owners = new Array<string | null>(MEMORY_SIZE).fill(null);

  const requestCore = new Map<string, number>();
  const claimed = new Set<number>();
  const packets: Packet[] = [];
  const accesses: Access[] = [];
  const loads: { address: number; length: number }[] = [];

  for (const m of messages) {
    // Memory's own picture of itself wins over what we worked out so far, in message order.
    if (m.type === "status" && m.from === "memory") {
      const parsed = memoryStatusData.safeParse(m.payload.data);
      if (parsed.success && parsed.data.bytes.length === MEMORY_SIZE) memory = parsed.data.bytes;
    }
    if (!isPacketType(m.type)) continue;
    const from = outside(m.from);
    const to = outside(m.to);
    let core: number | null = null;
    if (m.type === "mem.read" || m.type === "mem.write") {
      if (from === "cpu") {
        core = attributeCore(m, cores, claimed);
        if (core !== null) {
          claimed.add(core);
          requestCore.set(m.id, core);
        }
      }
    } else if ((m.type === "mem.data" || m.type === "mem.ack") && m.replyTo !== undefined) {
      core = requestCore.get(m.replyTo) ?? null;
    }

    const packet = toPacket(m, packets.length, from, to, core);
    if (!packet) continue;
    packets.push(packet);

    if (m.type === "mem.read" && packet.address !== null) accesses.push({ address: packet.address, length: packet.length, kind: "read", by: from, core });
    if ((m.type === "mem.write" || m.type === "program.load") && packet.address !== null) {
      accesses.push({ address: packet.address, length: packet.length, kind: "write", by: from, core });
      memory = writeBytes(memory, m.payload.address, m.payload.bytes);
      if (m.type === "program.load") loads.push({ address: m.payload.address, length: m.payload.bytes.length });
    }
  }

  // A program.load is followed by process.add naming the program that starts there.
  for (const load of loads) {
    const named = messages.find((m) => m.type === "process.add" && m.payload.start === load.address);
    const name = named?.type === "process.add" ? named.payload.name : null;
    owners = owners.slice();
    for (let i = load.address; i < Math.min(MEMORY_SIZE, load.address + load.length); i++) owners[i] = name;
  }

  return { tick, packets, accesses, cores, processes, memory, owners, parts, pendingIrqs };
}

function isPacketType(type: MessageType): type is PacketType {
  return (PACKET_TYPES as readonly string[]).includes(type);
}

function isDrawn(role: ComponentInfo["role"]): boolean {
  return role === "cpu" || role === "memory" || role === "peripheral";
}

function toPacket(m: Message, seq: number, from: string, to: string, core: number | null): Packet | null {
  const base = { seq, from, to, core };
  switch (m.type) {
    case "mem.read":
      return { ...base, type: m.type, address: m.payload.address, length: m.payload.length, value: null };
    case "mem.data":
      return { ...base, type: m.type, address: m.payload.address, length: m.payload.bytes.length, value: m.payload.bytes.length === 1 ? m.payload.bytes[0] : null };
    case "mem.write":
    case "program.load":
      return { ...base, type: m.type, address: m.payload.address, length: m.payload.bytes.length, value: m.payload.bytes.length === 1 ? m.payload.bytes[0] : null };
    case "mem.ack":
      return { ...base, type: m.type, address: m.payload.address, length: m.payload.length, value: null };
    case "irq":
      return { ...base, type: m.type, address: m.payload.vector, length: 0, value: null };
    case "input":
      return { ...base, type: m.type, address: null, length: 0, value: null };
    default:
      return null;
  }
}

function writeBytes(memory: number[], address: number, bytes: readonly number[]): number[] {
  if (address < 0 || address + bytes.length > MEMORY_SIZE) return memory; // memory faults it; nothing changes
  const copy = memory.slice();
  bytes.forEach((b, i) => (copy[address + i] = b));
  return copy;
}

/**
 * Which core sent a CPU memory request? The wire doesn't say (the CPU is one bus client), but
 * the CPU's status for the same tick does: a core that just asked for its next instruction is
 * in WAIT_FETCH with PC = the address, and one that asked for data is in WAIT_DATA running a
 * LOAD or STORE of that address. `claimed` holds cores already matched this tick.
 */
export function attributeCore(request: Message, cores: readonly CoreFrame[], claimed: ReadonlySet<number>): number | null {
  if (request.type !== "mem.read" && request.type !== "mem.write") return null;
  const { address } = request.payload;
  const free = cores.filter((c) => !claimed.has(c.id));
  const fetch = request.type === "mem.read" && request.payload.length === 4;
  const match = fetch
    ? free.find((c) => c.phase === "WAIT_FETCH" && c.pc === address)
    : free.find((c) => c.phase === "WAIT_DATA" && instructionAddress(c.instruction) === address);
  return match?.id ?? null;
}

/** The address in "LOAD R0, 0x3F1" or "STORE R2, 0x1E0", or null. */
export function instructionAddress(instruction: string | null): number | null {
  const found = instruction ? /^(?:LOAD|STORE) R\d, 0x([0-9A-F]+)$/i.exec(instruction) : null;
  return found ? parseInt(found[1], 16) : null;
}
