import { describe, expect, it } from "vitest";
import { decode, disassemble, encode, type Bytes4, type Instruction } from "@/core/isa";

describe("decode", () => {
  it.each<[string, Bytes4, Instruction]>([
    ["NOP", [0x00, 0, 0, 0], { op: "NOP" }],
    ["LOAD R2, 0x3F1", [0x01, 2, 0x03, 0xf1], { op: "LOAD", reg: 2, address: 0x3f1 }],
    ["STORE R0, 0x010", [0x02, 0, 0x00, 0x10], { op: "STORE", reg: 0, address: 0x010 }],
    ["ADD R0, R1", [0x03, 0, 1, 0], { op: "ADD", reg: 0, src: 1 }],
    ["SUB R3, R2", [0x04, 3, 2, 0], { op: "SUB", reg: 3, src: 2 }],
    ["JMP 0x100", [0x05, 0, 0x01, 0x00], { op: "JMP", address: 0x100 }],
    ["LOADI R1, 200", [0x06, 1, 0, 200], { op: "LOADI", reg: 1, value: 200 }],
    ["JZ 0x008", [0x07, 0, 0, 0x08], { op: "JZ", address: 0x008 }],
    ["JNZ 0x010", [0x08, 0, 0, 0x10], { op: "JNZ", address: 0x010 }],
    ["IRET", [0xfe, 0, 0, 0], { op: "IRET" }],
    ["HALT", [0xff, 0, 0, 0], { op: "HALT" }],
  ])("%s", (_name, bytes, instruction) => {
    expect(decode(bytes)).toEqual({ ok: true, instruction });
  });

  it.each<[string, Bytes4, RegExp]>([
    ["an unknown opcode", [0xab, 0, 0, 0], /unknown opcode 0xAB/],
    ["a register above R3", [0x01, 4, 0, 0], /R4 is not a register/],
    ["a second register above R3", [0x03, 0, 9, 0], /R9 is not a register/],
    ["an address outside memory", [0x05, 0, 0x04, 0x00], /outside memory/],
  ])("rejects %s", (_name, bytes, error) => {
    const result = decode(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });
});

describe("encode", () => {
  const all: Instruction[] = [
    { op: "NOP" },
    { op: "LOAD", reg: 1, address: 0x3ff },
    { op: "STORE", reg: 3, address: 0x200 },
    { op: "ADD", reg: 0, src: 3 },
    { op: "SUB", reg: 2, src: 1 },
    { op: "JMP", address: 0x0c4 },
    { op: "LOADI", reg: 0, value: 255 },
    { op: "JZ", address: 4 },
    { op: "JNZ", address: 0x104 },
    { op: "IRET" },
    { op: "HALT" },
  ];

  it("is the exact opposite of decode", () => {
    for (const instruction of all) expect(decode(encode(instruction))).toEqual({ ok: true, instruction });
  });

  it("puts 16-bit addresses high byte first", () => {
    expect(encode({ op: "JMP", address: 0x1a4 })).toEqual([0x05, 0, 0x01, 0xa4]);
  });
});

describe("disassemble", () => {
  it("reads like the assembly you'd write", () => {
    expect(disassemble({ op: "LOAD", reg: 0, address: 0x3f0 })).toBe("LOAD R0, 0x3F0");
    expect(disassemble({ op: "ADD", reg: 2, src: 3 })).toBe("ADD R2, R3");
    expect(disassemble({ op: "LOADI", reg: 1, value: 5 })).toBe("LOADI R1, 5");
    expect(disassemble({ op: "HALT" })).toBe("HALT");
  });
});
