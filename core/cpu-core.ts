// One CPU core as a finite state machine. Every clock tick moves it one step:
//   FETCH -> WAIT_FETCH -> DECODE -> EXECUTE (-> WAIT_DATA) -> FETCH ...
// The core never touches memory itself. It asks for bytes with an effect, and the answer comes
// back as `reply` on a later tick. See "CPU core" in docs/ARCHITECTURE.md.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import { INSTRUCTION_SIZE, decode, instructionSchema, type Instruction } from "@/core/isa";
import { MEMORY_SIZE, hex } from "@/protocol/memory-map";
import { todo } from "@/core/todo";

export const PHASES = ["IDLE", "FETCH", "WAIT_FETCH", "DECODE", "EXECUTE", "WAIT_DATA", "HALTED", "FAULT"] as const;
export type Phase = (typeof PHASES)[number];

export const coreFsm = defineFsm<Phase>("CPU core", PHASES, "IDLE", [
  { from: "IDLE", to: "FETCH", on: "program assigned / interrupt" },
  { from: "FETCH", to: "FETCH", on: "interrupt taken: PC = vector" },
  { from: "FETCH", to: "WAIT_FETCH", on: "read(PC, 4)" },
  { from: "WAIT_FETCH", to: "WAIT_FETCH", on: "no bytes yet (stall)" },
  { from: "WAIT_FETCH", to: "DECODE", on: "bytes arrived" },
  { from: "DECODE", to: "EXECUTE", on: "valid instruction" },
  { from: "EXECUTE", to: "FETCH", on: "ALU / jump / IRET" },
  { from: "EXECUTE", to: "WAIT_DATA", on: "LOAD / STORE" },
  { from: "WAIT_DATA", to: "FETCH", on: "reply" },
  { from: "EXECUTE", to: "HALTED", on: "HALT" },
  { from: "EXECUTE", to: "IDLE", on: "IRET to an idle core" },
  { from: ["FETCH", "WAIT_FETCH", "DECODE", "EXECUTE", "WAIT_DATA"], to: "FAULT", on: "fault" },
  { from: ["FETCH", "HALTED", "FAULT"], to: "IDLE", on: "scheduler takes the program off" },
]);

const byte = z.number().int().min(0).max(0xff);
const flagsSchema = z.object({ zero: z.boolean(), carry: z.boolean() });
const contextSchema = z.object({
  registers: z.tuple([byte, byte, byte, byte]),
  pc: z.number().int().min(0).max(MEMORY_SIZE),
  flags: flagsSchema,
});
/**
 * What an interrupt saves so IRET can put everything back, including `retired`, so the
 * handler's instructions don't use up the interrupted program's turn.
 */
const frameSchema = contextSchema.extend({ retired: z.number().int().min(0), resume: z.enum(["IDLE", "FETCH"]) });

export const coreSchema = contextSchema.extend({
  id: z.number().int().min(0),
  phase: z.enum(PHASES),
  /** The instruction register: the 4 bytes being decoded/executed. */
  ir: z.array(byte),
  instruction: instructionSchema.nullable(),
  /** Interrupt frames. At most one: a handler is never interrupted. */
  stack: z.array(frameSchema).max(1),
  fault: z.string().nullable(),
  /** Instructions finished since the scheduler last put a program on this core. */
  retired: z.number().int().min(0),
  /** Ticks spent waiting for memory. */
  stalls: z.number().int().min(0),
});

export type Flags = z.infer<typeof flagsSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Core = z.infer<typeof coreSchema>;

/** A memory answer, delivered on the tick after it arrived. */
export const memReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("memData"), bytes: z.array(byte) }),
  z.object({ type: z.literal("memAck") }),
  z.object({ type: z.literal("memFault"), message: z.string() }),
]);
export type MemReply = z.infer<typeof memReplySchema>;

export type CoreEffect =
  | { kind: "read"; address: number; length: number }
  | { kind: "write"; address: number; bytes: number[] };

export type StepResult = { core: Core; effects: CoreEffect[] };

export function createCore(id: number): Core {
  return {
    id,
    phase: "IDLE",
    registers: [0, 0, 0, 0],
    pc: 0,
    flags: { zero: false, carry: false },
    ir: [],
    instruction: null,
    stack: [],
    fault: null,
    retired: 0,
    stalls: 0,
  };
}

export function inHandler(core: Core): boolean {
  return core.stack.length > 0;
}

// ── Small helpers used by every step ────────────────────────────────────────

function moveTo(core: Core, phase: Phase, changes: Partial<Core> = {}): Core {
  return { ...core, ...changes, phase: coreFsm.go(core.phase, phase) };
}

function faultWith(core: Core, message: string): StepResult {
  return { core: moveTo(core, "FAULT", { fault: message }), effects: [] };
}

/** An instruction is done: count it and go fetch the next one. */
function finish(core: Core, changes: Partial<Core> = {}): Core {
  return moveTo(core, "FETCH", { pc: core.pc + INSTRUCTION_SIZE, retired: core.retired + 1, ...changes });
}

function setRegister(core: Core, reg: number, value: number): Core["registers"] {
  const registers: Core["registers"] = [...core.registers];
  registers[reg] = value;
  return registers;
}

// ── One tick ────────────────────────────────────────────────────────────────

/** Move the core one step. `reply` is the memory answer that arrived since the last tick. */
export function stepCore(core: Core, reply: MemReply | null): StepResult {
  switch (core.phase) {
    case "IDLE":
    case "HALTED":
    case "FAULT":
      return { core, effects: [] };
    case "FETCH":
      return fetch(core);
    case "WAIT_FETCH":
      return awaitInstruction(core, reply);
    case "DECODE":
      return decodeStep(core);
    case "EXECUTE":
      return execute(core, core.instruction!);
    case "WAIT_DATA":
      return awaitData(core, reply);
  }
}

function fetch(core: Core): StepResult {
  // @student week=5 part=class id=fetch "Ask memory for the 4 bytes at PC and wait for them (fault if PC is too close to the end)"
  // TODO(week 5, fetch): Ask memory for the 4 bytes at PC and wait for them (fault if PC is too close to the end)
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: fetch", core);
  // @end
}

function awaitInstruction(core: Core, reply: MemReply | null): StepResult {
  // @student week=5 part=class id=await-instruction "Bytes arrived -> DECODE with them in IR; fault -> FAULT; nothing yet -> count a stall"
  // TODO(week 5, await-instruction): Bytes arrived -> DECODE with them in IR; fault -> FAULT; nothing yet -> count a stall
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: await-instruction", core, reply);
  // @end
}

function decodeStep(core: Core): StepResult {
  // @student week=5 part=class id=decode-step "Decode IR; a valid instruction goes to EXECUTE, anything else is a FAULT"
  // TODO(week 5, decode-step): Decode IR; a valid instruction goes to EXECUTE, anything else is a FAULT
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: decode-step", core);
  // @end
}

function execute(core: Core, instruction: Instruction): StepResult {
  const [r0, r1, r2, r3] = core.registers;
  const regs = [r0, r1, r2, r3];
  switch (instruction.op) {
    // @student week=5 part=home id=execute-core "Execute LOAD (ask memory), ADD (with zero and carry flags) and HALT"
    // TODO(week 5, execute-core): Execute LOAD (ask memory), ADD (with zero and carry flags) and HALT
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    case "LOAD":
    case "ADD":
    case "HALT":
      return todo("week 3: execute-core", core, instruction, regs);
    // @end

    // @student week=5 part=home id=execute-rest "Execute STORE, SUB, LOADI, JMP, JZ and JNZ"
    // TODO(week 5, execute-rest): Execute STORE, SUB, LOADI, JMP, JZ and JNZ
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    case "STORE":
    case "SUB":
    case "LOADI":
    case "JMP":
    case "JZ":
    case "JNZ":
      return todo("week 3: execute-rest", core, instruction, regs);
    // @end

    case "NOP":
      return { core: finish(core), effects: [] };
    case "IRET":
      return returnFromInterrupt(core);
  }
}

function awaitData(core: Core, reply: MemReply | null): StepResult {
  // @student week=5 part=home id=await-data "LOAD: put the byte in the register (and set zero). STORE: the ack means done. Then fetch the next instruction"
  // TODO(week 5, await-data): LOAD: put the byte in the register (and set zero). STORE: the ack means done. Then fetch the next instruction
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: await-data", core, reply);
  // @end
}

// ── Interrupts ──────────────────────────────────────────────────────────────

/** Interrupts are only taken between instructions, and never inside another handler. */
export function canTakeInterrupt(core: Core): boolean {
  // @student week=7 part=class id=can-take-interrupt "True only between instructions (IDLE or FETCH) and when not already in a handler"
  // TODO(week 7, can-take-interrupt): True only between instructions (IDLE or FETCH) and when not already in a handler
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  // Until week 7 no core takes interrupts; they wait in the queue.
  return false;
  // @end
}

/** Save everything IRET will need, then jump to the handler. */
export function enterInterrupt(core: Core, vector: number): Core {
  // @student week=7 part=class id=enter-interrupt "Push a frame (registers, pc, flags, retired, and whether we were IDLE or FETCH), jump to vector"
  // TODO(week 7, enter-interrupt): Push a frame (registers, pc, flags, retired, and whether we were IDLE or FETCH), jump to vector
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: enter-interrupt", core, vector);
  // @end
}

function returnFromInterrupt(core: Core): StepResult {
  // @student week=7 part=class id=iret "Pop the frame and put registers, pc, flags, retired and phase back exactly as they were"
  // TODO(week 7, iret): Pop the frame and put registers, pc, flags, retired and phase back exactly as they were
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: iret", core);
  // @end
}

// ── Used by the scheduler ──────────────────────────────────────────────────

export function loadContext(core: Core, context: Context): Core {
  return { ...moveTo(core, "FETCH"), ...context, ir: [], instruction: null, retired: 0, fault: null };
}

export function saveContext(core: Core): Context {
  return { registers: core.registers, pc: core.pc, flags: core.flags };
}

/** Take the program off this core and leave it empty. */
export function clearCore(core: Core): Core {
  return { ...createCore(core.id), phase: coreFsm.go(core.phase, "IDLE"), stalls: core.stalls };
}

// ── Saving ──────────────────────────────────────────────────────────────────

export function snapshotCore(core: Core): Core {
  // @student week=stretch part=class id=core-snapshot "Return what should go in a save file for this core"
  // TODO(stretch, core-snapshot): Return what should go in a save file for this core
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: core-snapshot", core);
  // @end
}

/** Check saved data really is a core before trusting it. Throws if it isn't. */
export function restoreCore(data: unknown): Core {
  // @student week=stretch part=class id=core-restore "Validate the saved data with coreSchema and return it"
  // TODO(stretch, core-restore): Validate the saved data with coreSchema and return it
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: core-restore", data);
  // @end
}
