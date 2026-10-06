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
  // @student week=5 part=class id=decode "Turn 4 bytes into an Instruction (bad opcode, register or address -> error)"
  // TODO(week 5, decode): Turn 4 bytes into an Instruction (bad opcode, register or address -> error)
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: decode", bytes);
  // @end
}

/** Turn an Instruction back into its 4 bytes. `decode(encode(i))` gives back `i`. */
export function encode(instruction: Instruction): Bytes4 {
  // @student week=5 part=home id=encode "Turn an Instruction into its 4 bytes (the opposite of decode)"
  // TODO(week 5, encode): Turn an Instruction into its 4 bytes (the opposite of decode)
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: encode", instruction);
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
