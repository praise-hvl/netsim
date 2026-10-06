// Every message that travels over the bus. One zod schema per message type; the TypeScript
// types are derived from the schemas so the two can never disagree.
// See "The message protocol" in docs/ARCHITECTURE.md.
import { z } from "zod";
import { todo } from "@/core/todo";

// ── Building blocks ─────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const json: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]),
);

export const byte = z.number().int().min(0).max(0xff);
/** 16 bits on the wire. Whether it is inside the 1 KB of memory is Memory's call. */
export const address = z.number().int().min(0).max(0xffff);
export const componentId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "lowercase letters, digits and dashes");

export const ROLES = ["cpu", "memory", "peripheral", "host", "dashboard"] as const;
export type Role = (typeof ROLES)[number];

/** Roles the bus waits for at the end of every tick. */
export const CLOCKED_ROLES: readonly Role[] = ["cpu", "memory", "peripheral"];

export const componentInfo = z.object({
  id: componentId,
  role: z.enum(ROLES),
  kind: z.string().optional(),
  label: z.string(),
});
export type ComponentInfo = z.infer<typeof componentInfo>;

/** What a component asks the dashboard to draw. */
export const statusPayload = z.object({
  state: z.string(),
  label: z.string(),
  data: z.record(z.string(), json),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type StatusPayload = z.infer<typeof statusPayload>;

// Every message has the same envelope; only `type` and `payload` vary.
function message<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    type: z.literal(type),
    from: z.union([componentId, z.literal("bus")]),
    to: z.union([componentId, z.literal("bus"), z.literal("*")]),
    id: z.string().min(1),
    replyTo: z.string().optional(),
    tick: z.number().int().min(0),
    payload,
  });
}

const empty = z.object({});

// ── Message types ───────────────────────────────────────────────────────────

export const messageSchema = z.discriminatedUnion("type", [
  // Handshake and membership
  message("hello", z.object({ role: z.enum(ROLES), kind: z.string().optional(), label: z.string() })),
  message("welcome", z.object({ running: z.boolean(), speedMs: z.number(), components: z.array(componentInfo) })),
  message("joined", componentInfo),
  message("left", z.object({ id: componentId })),

  // Clock
  message("tick", empty),
  message("tick.done", empty),
  message("reset", empty),

  // Memory
  message("mem.read", z.object({ address, length: z.number().int().min(1).max(64) })),
  message("mem.data", z.object({ address, bytes: z.array(byte) })),
  message("mem.write", z.object({ address, bytes: z.array(byte).min(1).max(64) })),
  message("mem.ack", z.object({ address, length: z.number().int().min(0) })),
  message("program.load", z.object({ address, bytes: z.array(byte).min(1).max(1024) })),

  // Interrupts and devices
  message("irq", z.object({ vector: address, priority: z.number().int().min(0).max(15) })),
  message("input", z.record(z.string(), json)),
  message("status", statusPayload),

  // Dashboard → system
  message("control", z.object({
    action: z.enum(["start", "stop", "step", "reset", "speed"]),
    ms: z.number().int().min(10).max(10_000).optional(),
  })),
  message("process.add", z.object({ name: z.string().min(1), start: address })),
  /** Change how many cores the CPU has (1-8). Only idle cores can be taken away. */
  message("cpu.cores", z.object({ count: z.number().int().min(1).max(8) })),
  message("host.spawn", z.object({
    kind: z.string(),
    id: componentId,
    label: z.string().optional(),
    config: z.record(z.string(), json),
    /** Only set when restoring a save, so the peripheral gets its old addresses back. */
    slot: z.number().int().min(0).optional(),
  })),
  message("host.remove", z.object({ id: componentId })),

  // Persistence
  message("save", z.object({ name: z.string().regex(/^[\w-]+$/) })),
  message("restore", z.object({ name: z.string().regex(/^[\w-]+$/) })),
  message("snapshot.get", empty),
  message("snapshot", z.object({ data: json })),
  message("snapshot.set", z.object({ data: json })),
  /** "Could you restore from this?" Answered with ok or error; nothing changes yet. */
  message("snapshot.check", z.object({ data: json })),

  // Replies that aren't data
  message("ok", empty),
  message("fault", z.object({ code: z.enum(["OUT_OF_RANGE", "BAD_REQUEST", "NOT_ALLOWED"]), message: z.string() })),
  message("error", z.object({ message: z.string() })),
]);

export type Message = z.infer<typeof messageSchema>;
export type MessageType = Message["type"];
export type MessageOf<T extends MessageType> = Extract<Message, { type: T }>;
export type PayloadOf<T extends MessageType> = MessageOf<T>["payload"];

/** Build a message with the standard envelope around a payload. */
export function envelope<T extends MessageType>(
  type: T,
  from: string,
  to: string,
  payload: PayloadOf<T>,
  meta: { id: string; tick: number; replyTo?: string },
): MessageOf<T> {
  const { id, tick, replyTo } = meta;
  // The cast is safe: the signature ties `type` to its `payload`; TypeScript just can't see
  // through the generic to prove it.
  return { type, from, to, id, tick, payload, ...(replyTo !== undefined && { replyTo }) } as MessageOf<T>;
}

/** Requests the bus waits on before it closes a tick (see "tick barrier"). */
export const TICK_REQUESTS: readonly MessageType[] = ["mem.read", "mem.write"];

// ── Validation at the boundary ─────────────────────────────────────────────

export type ParseResult = { ok: true; message: Message } | { ok: false; error: string };

/** Turn raw socket text into a typed message, or explain why it isn't one. */
export function parseMessage(raw: string): ParseResult {
  // @student week=3 part=home id=parse-message "Parse JSON, then validate it with messageSchema"
  // TODO(week 3, parse-message): Parse JSON, then validate it with messageSchema
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  // Until week 3 this trusts whatever arrives. Week 3 replaces the cast with real validation.
  return { ok: true, message: JSON.parse(raw) as Message };
  // @end
}

/**
 * The hand-written version of what zod does for us, for one message type.
 * Written once in week 2 so the zod schemas above aren't magic.
 */
export function isMemRead(value: unknown): value is MessageOf<"mem.read"> {
  // @student week=stretch part=home id=is-mem-read "Check every field of a mem.read by hand"
  // TODO(stretch, is-mem-read): Check every field of a mem.read by hand
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: is-mem-read", value);
  // @end
}

// ── Status data for the built-in components ────────────────────────────────
// The dashboard parses these with safeParse to draw the CPU and Memory nodes.

export const coreView = z.object({
  id: z.number().int(),
  state: z.string(),
  pc: z.number().int(),
  ir: z.array(byte),
  instruction: z.string().nullable(),
  registers: z.array(byte).length(4),
  flags: z.object({ zero: z.boolean(), carry: z.boolean() }),
  pid: z.number().int().nullable(),
  inHandler: z.boolean(),
});

export const processView = z.object({
  pid: z.number().int(),
  name: z.string(),
  state: z.enum(["READY", "RUNNING", "DONE", "FAILED"]),
  start: z.number().int(),
  instructions: z.number().int(),
});

export const cpuStatusData = z.object({
  cores: z.array(coreView),
  processes: z.array(processView),
  pendingIrqs: z.number().int(),
});
export type CpuStatusData = z.infer<typeof cpuStatusData>;

export const memoryStatusData = z.object({
  bytes: z.array(byte),
  lastRead: z.object({ address: z.number().int(), length: z.number().int() }).nullable(),
  lastWrite: z.object({ address: z.number().int(), length: z.number().int() }).nullable(),
});
export type MemoryStatusData = z.infer<typeof memoryStatusData>;
