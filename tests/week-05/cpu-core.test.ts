import { describe, expect, it } from "vitest";
import { IllegalTransitionError } from "@/core/fsm";
import { coreFsm, createCore, loadContext, stepCore, type Core } from "@/core/cpu-core";
import { runProgram } from "@/tests/helpers";

// Programs are raw bytes here, so these tests work before the assembler's `encode` exists.
const LOADI = (reg: number, value: number) => [0x06, reg, 0, value];
const LOAD = (reg: number, address: number) => [0x01, reg, address >> 8, address & 0xff];
const STORE = (reg: number, address: number) => [0x02, reg, address >> 8, address & 0xff];
const ADD = (reg: number, src: number) => [0x03, reg, src, 0];
const SUB = (reg: number, src: number) => [0x04, reg, src, 0];
const JMP = (address: number) => [0x05, 0, address >> 8, address & 0xff];
const JZ = (address: number) => [0x07, 0, address >> 8, address & 0xff];
const JNZ = (address: number) => [0x08, 0, address >> 8, address & 0xff];
const HALT = [0xff, 0, 0, 0];

function ready(pc = 0): Core {
  return loadContext(createCore(0), { registers: [0, 0, 0, 0], pc, flags: { zero: false, carry: false } });
}

describe("one step at a time: fetch, decode, LOAD, ADD, HALT", () => {
  it("FETCH asks memory for the 4 bytes at PC", () => {
    const { core, effects } = stepCore(ready(0x010), null);
    expect(core.phase).toBe("WAIT_FETCH");
    expect(effects).toEqual([{ kind: "read", address: 0x010, length: 4 }]);
  });

  it("WAIT_FETCH waits (and counts a stall) until the bytes arrive", () => {
    const waiting = stepCore(ready(), null).core;
    const stalled = stepCore(waiting, null).core;
    expect(stalled.phase).toBe("WAIT_FETCH");
    expect(stalled.stalls).toBe(1);

    const decoding = stepCore(stalled, { type: "memData", bytes: ADD(0, 1) }).core;
    expect(decoding.phase).toBe("DECODE");
    expect(decoding.ir).toEqual(ADD(0, 1));
  });

  it("DECODE turns IR into an instruction, or FAULTs", () => {
    const waiting = stepCore(ready(), null).core;
    const good = stepCore(stepCore(waiting, { type: "memData", bytes: ADD(0, 1) }).core, null).core;
    expect(good.phase).toBe("EXECUTE");
    expect(good.instruction).toEqual({ op: "ADD", reg: 0, src: 1 });

    const bad = stepCore(stepCore(waiting, { type: "memData", bytes: [0xab, 0, 0, 0] }).core, null).core;
    expect(bad.phase).toBe("FAULT");
    expect(bad.fault).toMatch(/unknown opcode/);
  });

  it("takes 4 ticks for ADD and 5 for LOAD", () => {
    const add = runProgram([...ADD(0, 1), ...HALT]);
    expect(add.trace.slice(0, 4)).toEqual(["WAIT_FETCH", "DECODE", "EXECUTE", "FETCH"]);

    const load = runProgram([...LOAD(0, 0x300), ...HALT]);
    expect(load.trace.slice(0, 5)).toEqual(["WAIT_FETCH", "DECODE", "EXECUTE", "WAIT_DATA", "FETCH"]);
  });

  it("adds two numbers from memory", () => {
    const { core } = runProgram([...LOAD(0, 0x300), ...LOAD(1, 0x301), ...ADD(0, 1), ...HALT], { memory: { 0x300: 7, 0x301: 3 } });
    expect(core.phase).toBe("HALTED");
    expect(core.registers).toEqual([10, 3, 0, 0]);
    expect(core.flags).toEqual({ zero: false, carry: false });
  });

  it("sets carry and zero when ADD wraps past 255", () => {
    const { core } = runProgram([...LOAD(0, 0x300), ...LOAD(1, 0x301), ...ADD(0, 1), ...HALT], { memory: { 0x300: 200, 0x301: 56 } });
    expect(core.registers[0]).toBe(0);
    expect(core.flags).toEqual({ zero: true, carry: true });
  });

  it("LOAD sets the zero flag from the loaded value", () => {
    expect(runProgram([...LOAD(2, 0x300), ...HALT]).core.flags.zero).toBe(true);
  });

  it("can read the last byte of memory", () => {
    const { core } = runProgram([...LOAD(0, 0x3ff), ...HALT], { memory: { 0x3ff: 9 } });
    expect(core.registers[0]).toBe(9);
  });

  it("FAULTs instead of fetching past the end of memory", () => {
    const { core } = runProgram(JMP(0x3fe));
    expect(core.phase).toBe("FAULT");
    expect(core.fault).toMatch(/ran off the end/);
  });

  it("FAULTs on an address that doesn't fit in memory", () => {
    const { core } = runProgram([0x01, 0, 0x04, 0x00]); // LOAD R0, 0x400
    expect(core.phase).toBe("FAULT");
    expect(core.fault).toMatch(/outside memory/);
  });

  it("refuses to jump between phases that aren't connected", () => {
    expect(() => coreFsm.go("IDLE", "EXECUTE")).toThrow(IllegalTransitionError);
    expect(coreFsm.canGo("WAIT_DATA", "FETCH")).toBe(true);
  });
});

describe("the rest of the instruction set", () => {
  it("STORE writes a register to memory", () => {
    const { memory } = runProgram([...LOADI(3, 42), ...STORE(3, 0x3f1), ...HALT]);
    expect(memory.bytes[0x3f1]).toBe(42);
  });

  it("SUB borrows below zero and sets carry", () => {
    const { core } = runProgram([...LOADI(0, 3), ...LOADI(1, 5), ...SUB(0, 1), ...HALT]);
    expect(core.registers[0]).toBe(254);
    expect(core.flags).toEqual({ zero: false, carry: true });
  });

  it("SUB sets zero when the result is 0", () => {
    const { core } = runProgram([...LOADI(0, 5), ...LOADI(1, 5), ...SUB(0, 1), ...HALT]);
    expect(core.flags).toEqual({ zero: true, carry: false });
  });

  // Each jump program puts a LOADI R2 at the target, so a jump that lands anywhere else (past the
  // target, say) leaves R2 at 0. The LOADI R1 before it runs only when the jump isn't taken.
  it("JMP lands exactly on its target", () => {
    const { core } = runProgram([...JMP(8), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT]);
    expect(core.registers.slice(1, 3)).toEqual([0, 7]);
    expect(core.pc).toBe(12); // stopped on the HALT
  });

  it("JZ jumps only when zero is set, and lands exactly on its target", () => {
    // 0x00 LOADI R0  0x04 JZ 12  0x08 LOADI R1, 9  0x0C LOADI R2, 7 (target)  0x10 HALT
    const taken = runProgram([...LOADI(0, 0), ...JZ(12), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT]);
    expect(taken.core.registers.slice(1, 3)).toEqual([0, 7]);
    const notTaken = runProgram([...LOADI(0, 1), ...JZ(12), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT]);
    expect(notTaken.core.registers.slice(1, 3)).toEqual([9, 7]);
  });

  it("JNZ jumps only when zero isn't set, and lands exactly on its target", () => {
    const taken = runProgram([...LOADI(0, 1), ...JNZ(12), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT]);
    expect(taken.core.registers.slice(1, 3)).toEqual([0, 7]);
    const notTaken = runProgram([...LOADI(0, 0), ...JNZ(12), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT]);
    expect(notTaken.core.registers.slice(1, 3)).toEqual([9, 7]);
  });

  it("a taken jump's next fetch is at the target", () => {
    // Step until the core asks memory for its second instruction: that read is the jump's target.
    const fetches: number[] = [];
    let core = ready(0);
    let reply: Parameters<typeof stepCore>[1] = null;
    const program = [...JMP(8), ...LOADI(1, 9), ...LOADI(2, 7), ...HALT];
    for (let tick = 0; tick < 20 && fetches.length < 2; tick++) {
      const step = stepCore(core, reply);
      core = step.core;
      reply = null;
      for (const effect of step.effects) {
        if (effect.kind !== "read") continue;
        if (effect.length === 4) fetches.push(effect.address);
        reply = { type: "memData", bytes: program.slice(effect.address, effect.address + effect.length) };
      }
    }
    expect(fetches).toEqual([0, 8]);
  });

  it("runs the count-down loop", () => {
    // R0 = 5; loop: mem[0x300] += 1 ... until R0 hits 0
    const program = [
      ...LOADI(0, 5), //         0x00
      ...LOADI(1, 1), //         0x04
      ...LOAD(2, 0x300), //      0x08  loop:
      ...ADD(2, 1), //           0x0C
      ...STORE(2, 0x300), //     0x10
      ...SUB(0, 1), //           0x14
      ...JNZ(0x08), //           0x18
      ...HALT, //                0x1C
    ];
    const { core, memory } = runProgram(program);
    expect(core.phase).toBe("HALTED");
    expect(memory.bytes[0x300]).toBe(5);
    expect(core.registers[0]).toBe(0);
    expect(core.flags.zero).toBe(true);
  });

  it("runs programs written in assembly, too", async () => {
    const source = (await import("node:fs")).readFileSync("programs/countdown.asm", "utf8");
    const { core, memory } = runProgram(source);
    expect(core.phase).toBe("HALTED");
    expect(memory.bytes[0x3f2]).toBe(0);
  });
});
