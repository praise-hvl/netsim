// A tiny two-pass assembler: text like "LOADI R0, 5" in, bytes out.
//
//   ; comments start with a semicolon
//   .equ LED 0x3F1          ; a named constant
//   loop:  SUB R0, R1       ; a label is the address of the next instruction
//          JNZ loop
//   .byte 1, 2, 0xFF        ; raw data bytes
//
// Numbers are decimal or 0x-hex. Names can be labels, .equ constants, or symbols passed in
// (the host passes VECTOR, COUNTER and REGISTER when it loads a peripheral's handler).
import { INSTRUCTION_SIZE, encode, type Instruction, type Mnemonic, type Register } from "@/core/isa";
import { MEMORY_SIZE } from "@/protocol/memory-map";

export class AsmError extends Error {
  constructor(line: number, message: string) {
    super(`line ${line}: ${message}`);
  }
}

export type AsmOptions = {
  /** Address the first byte will be loaded at. Labels are counted from here. Default 0. */
  origin?: number;
  symbols?: Record<string, number>;
};

type Line = { number: number; label?: string; op?: string; args: string[] };

function parseLines(source: string): Line[] {
  return source.split("\n").map((text, i) => {
    const line: Line = { number: i + 1, args: [] };
    let rest = text.replace(/;.*/, "").trim();
    const label = /^([A-Za-z_]\w*):/.exec(rest);
    if (label) {
      line.label = label[1];
      rest = rest.slice(label[0].length).trim();
    }
    if (rest) {
      const [op, ...args] = rest.split(/[\s,]+/).filter(Boolean);
      line.op = op;
      line.args = args;
    }
    return line;
  });
}

function sizeOf(line: Line): number {
  if (!line.op || line.op === ".equ") return 0;
  if (line.op === ".byte") return line.args.length;
  return INSTRUCTION_SIZE;
}

export function assemble(source: string, options: AsmOptions = {}): number[] {
  const origin = options.origin ?? 0;
  const symbols = new Map<string, number>(Object.entries(options.symbols ?? {}));
  const lines = parseLines(source);

  function value(text: string | undefined, line: Line): number {
    if (text === undefined) throw new AsmError(line.number, `${line.op} needs more operands`);
    if (/^0x[0-9a-f]+$/i.test(text)) return parseInt(text, 16);
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    const known = symbols.get(text);
    if (known === undefined) throw new AsmError(line.number, `unknown name "${text}"`);
    return known;
  }

  // Pass 1: find where every label lands, and collect .equ constants.
  let address = origin;
  for (const line of lines) {
    if (line.label) {
      if (symbols.has(line.label)) throw new AsmError(line.number, `"${line.label}" is defined twice`);
      symbols.set(line.label, address);
    }
    if (line.op === ".equ") {
      const [name, text] = line.args;
      if (!name || symbols.has(name)) throw new AsmError(line.number, `.equ needs a new name and a value`);
      symbols.set(name, value(text, line));
    }
    address += sizeOf(line);
  }

  // Pass 2: now every name is known, turn each line into bytes.
  const bytes: number[] = [];
  for (const line of lines) {
    if (!line.op || line.op === ".equ") continue;
    if (line.op === ".byte") {
      for (const arg of line.args) bytes.push(checkRange(value(arg, line), 0xff, line));
      continue;
    }
    bytes.push(...encode(parseInstruction(line, value)));
  }
  return bytes;
}

function checkRange(n: number, max: number, line: Line): number {
  if (n < 0 || n > max) throw new AsmError(line.number, `${n} is out of range (0-${max})`);
  return n;
}

function parseInstruction(line: Line, value: (text: string | undefined, line: Line) => number): Instruction {
  const op = line.op!.toUpperCase();
  const reg = (text: string | undefined): Register => {
    const match = /^R([0-3])$/i.exec(text ?? "");
    if (!match) throw new AsmError(line.number, `expected a register R0-R3, got "${text ?? ""}"`);
    return Number(match[1]) as Register;
  };
  const addr = (text: string | undefined) => checkRange(value(text, line), MEMORY_SIZE - 1, line);
  const expect = (count: number) => {
    if (line.args.length !== count) throw new AsmError(line.number, `${op} takes ${count} operand(s)`);
  };

  switch (op as Mnemonic) {
    case "NOP":
    case "IRET":
    case "HALT":
      expect(0);
      return { op: op as "NOP" | "IRET" | "HALT" };
    case "LOAD":
    case "STORE":
      expect(2);
      return { op: op as "LOAD" | "STORE", reg: reg(line.args[0]), address: addr(line.args[1]) };
    case "ADD":
    case "SUB":
      expect(2);
      return { op: op as "ADD" | "SUB", reg: reg(line.args[0]), src: reg(line.args[1]) };
    case "JMP":
    case "JZ":
    case "JNZ":
      expect(1);
      return { op: op as "JMP" | "JZ" | "JNZ", address: addr(line.args[0]) };
    case "LOADI":
      expect(2);
      return { op: "LOADI", reg: reg(line.args[0]), value: checkRange(value(line.args[1], line), 0xff, line) };
    default:
      throw new AsmError(line.number, `unknown instruction "${line.op}"`);
  }
}
