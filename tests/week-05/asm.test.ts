import { describe, expect, it } from "vitest";
import { AsmError, assemble } from "@/core/asm";

describe("assembler", () => {
  it("turns instructions into 4 bytes each", () => {
    expect(assemble("LOADI R0, 5\nHALT")).toEqual([0x06, 0, 0, 5, 0xff, 0, 0, 0]);
  });

  it("resolves labels, including ones defined later", () => {
    const bytes = assemble(`
      start: JMP end    ; forward reference
             NOP
      end:   JNZ start
    `);
    expect(bytes).toEqual([0x05, 0, 0, 8, 0x00, 0, 0, 0, 0x08, 0, 0, 0]);
  });

  it("counts labels from the origin", () => {
    expect(assemble("here: JMP here", { origin: 0x080 })).toEqual([0x05, 0, 0x00, 0x80]);
  });

  it("supports .equ constants and symbols passed in", () => {
    const source = ".equ ONE 1\nLOADI R1, ONE\nSTORE R1, COUNTER";
    expect(assemble(source, { symbols: { COUNTER: 0x3e2 } })).toEqual([0x06, 1, 0, 1, 0x02, 1, 0x03, 0xe2]);
  });

  it("supports raw .byte data", () => {
    expect(assemble(".byte 1, 0x10, 255")).toEqual([1, 16, 255]);
  });

  it.each([
    ["an unknown instruction", "FLY R0", /line 1: unknown instruction "FLY"/],
    ["a bad register", "LOADI R7, 1", /expected a register/],
    ["an unknown name", "\nJMP nowhere", /line 2: unknown name "nowhere"/],
    ["a value too big for a byte", "LOADI R0, 300", /out of range/],
    ["a label defined twice", "a: NOP\na: NOP", /defined twice/],
    ["too few operands", "ADD R0", /takes 2 operand/],
  ])("explains %s", (_name, source, message) => {
    expect(() => assemble(source)).toThrow(AsmError);
    expect(() => assemble(source)).toThrow(message);
  });
});
