// The instruction set: every instruction is 4 bytes, [opcode, a, b, c].
// See "Instruction set" in docs/ARCHITECTURE.md.
import { z } from "zod";
import { MEMORY_SIZE, hex } from "@/protocol/memory-map";
import { todo } from "@/core/todo";

export const OPCODES = {
  NOP: 0x00,
  LOAD: 0x01,
  STORE: 0x02,
  ADD: 0x03,
  SUB: 0x04,
  JMP: 0x05,
  LOADI: 0x06,
  JZ: 0x07,
  JNZ: 0x08,
  IRET: 0xfe,
  HALT: 0xff,
} as const;

export type Mnemonic = keyof typeof OPCODES;

export const INSTRUCTION_SIZE = 4;

const register = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type Register = z.infer<typeof register>;

const address = z.number().int().min(0).max(MEMORY_SIZE - 1);
const byte = z.number().int().min(0).max(0xff);

export const instructionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["NOP", "IRET", "HALT"]) }),
  z.object({ op: z.enum(["LOAD", "STORE"]), reg: register, address }),
  z.object({ op: z.enum(["ADD", "SUB"]), reg: register, src: register }),
  z.object({ op: z.enum(["JMP", "JZ", "JNZ"]), address }),
  z.object({ op: z.literal("LOADI"), reg: register, value: byte }),
]);
export type Instruction = z.infer<typeof instructionSchema>;

export type Bytes4 = readonly [number, number, number, number];

export type DecodeResult = { ok: true; instruction: Instruction } | { ok: false; error: string };

function isRegister(n: number): n is Register {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

/** Turn 4 bytes into an Instruction, or explain why they aren't one. */
export function decode(bytes: Bytes4): DecodeResult {
  // @student week=4 part=class id=decode "Turn 4 bytes into an Instruction (bad opcode, register or address -> error)"
  // TODO(week 4, decode): Turn 4 bytes into an Instruction (bad opcode, register or address -> error)
  // Tests: tests/week-04/   Guide: docs/weeks/week-04.md
  if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
    return { ok: false, error: "Instruction bytes must be integers from 0 to 255" };
  }
  const [opcode, a, b, c] = bytes;
  const address = (b << 8) | c;

  switch (opcode) {
    case OPCODES.NOP:
      return { ok: true, instruction: { op: "NOP" } };
    case OPCODES.LOAD:
      if (!isRegister(a)) return { ok: false, error: `R${a} is not a register` };
      if (address >= MEMORY_SIZE) return { ok: false, error: `${hex(address)} is outside memory` };
      return { ok: true, instruction: { op: "LOAD", reg: a, address } };
    case OPCODES.STORE:
      if (!isRegister(a)) return { ok: false, error: `R${a} is not a register` };
      if (address >= MEMORY_SIZE) return { ok: false, error: `${hex(address)} is outside memory` };
      return { ok: true, instruction: { op: "STORE", reg: a, address } };
    case OPCODES.ADD:
      if (!isRegister(a)) return { ok: false, error: `R${a} is not a register` };
      if (!isRegister(b)) return { ok: false, error: `R${b} is not a register` };
      return { ok: true, instruction: { op: "ADD", reg: a, src: b } };
    case OPCODES.SUB:
      if (!isRegister(a)) return { ok: false, error: `R${a} is not a register` };
      if (!isRegister(b)) return { ok: false, error: `R${b} is not a register` };
      return { ok: true, instruction: { op: "SUB", reg: a, src: b } };
    case OPCODES.JMP:
      if (address >= MEMORY_SIZE) return { ok: false, error: `${hex(address)} is outside memory` };
      return { ok: true, instruction: { op: "JMP", address } };
    case OPCODES.LOADI:
      if (!isRegister(a)) return { ok: false, error: `R${a} is not a register` };
      return { ok: true, instruction: { op: "LOADI", reg: a, value: c } };
    case OPCODES.JZ:
      if (address >= MEMORY_SIZE) return { ok: false, error: `${hex(address)} is outside memory` };
      return { ok: true, instruction: { op: "JZ", address } };
    case OPCODES.JNZ:
      if (address >= MEMORY_SIZE) return { ok: false, error: `${hex(address)} is outside memory` };
      return { ok: true, instruction: { op: "JNZ", address } };
    case OPCODES.IRET:
      return { ok: true, instruction: { op: "IRET" } };
    case OPCODES.HALT:
      return { ok: true, instruction: { op: "HALT" } };
    default:
      return { ok: false, error: `unknown opcode ${hex(opcode, 2)}` };
  }
  // @end
}

/** Turn an Instruction back into its 4 bytes. `decode(encode(i))` gives back `i`. */
export function encode(instruction: Instruction): Bytes4 {
  // @student week=4 part=home id=encode "Turn an Instruction into its 4 bytes (the opposite of decode)"
  // TODO(week 4, encode): Turn an Instruction into its 4 bytes (the opposite of decode)
  // Tests: tests/week-04/   Guide: docs/weeks/week-04.md
  switch (instruction.op) {
    case "NOP":
    case "IRET":
    case "HALT":
      return [OPCODES[instruction.op], 0, 0, 0];
    case "LOAD":
    case "STORE":
      return [OPCODES[instruction.op], instruction.reg, instruction.address >> 8, instruction.address & 0xff];
    case "ADD":
    case "SUB":
      return [OPCODES[instruction.op], instruction.reg, instruction.src, 0];
    case "JMP":
    case "JZ":
    case "JNZ":
      return [OPCODES[instruction.op], 0, instruction.address >> 8, instruction.address & 0xff];
    case "LOADI":
      return [OPCODES[instruction.op], instruction.reg, 0, instruction.value];
  }
  // @end
}

/** Human-readable form, e.g. "LOAD R0, 0x3F0". */
export function disassemble(instruction: Instruction): string {
  switch (instruction.op) {
    case "NOP":
    case "IRET":
    case "HALT":
      return instruction.op;
    case "LOAD":
    case "STORE":
      return `${instruction.op} R${instruction.reg}, ${hex(instruction.address)}`;
    case "ADD":
    case "SUB":
      return `${instruction.op} R${instruction.reg}, R${instruction.src}`;
    case "JMP":
    case "JZ":
    case "JNZ":
      return `${instruction.op} ${hex(instruction.address)}`;
    case "LOADI":
      return `LOADI R${instruction.reg}, ${instruction.value}`;
  }
}
