import { describe, expect, it } from "vitest";
import { canTakeInterrupt, createCore, enterInterrupt, loadContext, stepCore, type Core } from "@/core/cpu-core";
import { runCpu } from "@/tests/helpers";

const HANDLER = `
        LOAD  R0, COUNTER
        LOADI R1, 1
        ADD   R0, R1
        STORE R0, COUNTER
        IRET`;

function running(): Core {
  return loadContext(createCore(0), { registers: [1, 2, 3, 4], pc: 0x010, flags: { zero: true, carry: false } });
}

describe("taking an interrupt", () => {
  it("only happens between instructions and outside a handler", () => {
    expect(canTakeInterrupt(createCore(0))).toBe(true); // IDLE
    expect(canTakeInterrupt(running())).toBe(true); // FETCH
    expect(canTakeInterrupt(stepCore(running(), null).core)).toBe(false); // WAIT_FETCH
    expect(canTakeInterrupt(enterInterrupt(running(), 0x200))).toBe(false); // already in a handler
  });

  it("saves the registers, PC and flags, and jumps to the vector", () => {
    const core = enterInterrupt(running(), 0x200);
    expect(core.pc).toBe(0x200);
    expect(core.phase).toBe("FETCH");
    expect(core.stack).toEqual([{ registers: [1, 2, 3, 4], pc: 0x010, flags: { zero: true, carry: false }, retired: 0, resume: "FETCH" }]);
  });

  it("IRET puts everything back exactly", () => {
    const { cpu } = runCpu(
      [
        { name: "main", address: 0x000, program: "LOADI R0, 7\nLOADI R1, 0\nloop: JMP loop" },
        { name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } },
      ],
      { ticks: 60, cores: 1, irqs: [{ tick: 20, vector: 0x200, priority: 0 }] },
    );
    const core = cpu.cores[0];
    expect(core.stack).toEqual([]);
    expect(core.registers[0]).toBe(7); // the handler used R0 and R1, but they were restored
    expect(core.registers[1]).toBe(0);
    expect(core.flags.zero).toBe(true); // set by LOADI R1, 0 before the interrupt
  });

  it("doesn't charge the handler's instructions to the interrupted program", () => {
    let before: number | null = null;
    let after: number | null = null;
    let wasInHandler = false;
    runCpu(
      [
        { name: "main", address: 0x000, program: "loop: JMP loop" },
        { name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } },
      ],
      {
        ticks: 60,
        cores: 1,
        quantum: 1000,
        irqs: [{ tick: 20, vector: 0x200, priority: 0 }],
        onTick: (cpu) => {
          const core = cpu.cores[0];
          const inHandler = core.stack.length > 0;
          if (inHandler && !wasInHandler) before = core.stack[0].retired;
          if (!inHandler && wasInHandler) after = core.retired;
          wasInHandler = inHandler;
        },
      },
    );
    expect(before).not.toBeNull();
    expect(after).toBe(before); // the 5 handler instructions didn't count
  });

  it("IRET outside a handler is a fault", () => {
    const { cpu } = runCpu([{ name: "main", address: 0, program: "IRET" }], { ticks: 10, cores: 1 });
    expect(cpu.scheduler.processes[0].state).toBe("FAILED");
  });
});

describe("interrupts on the whole CPU", () => {
  it("counts every interrupt, handled on an idle core without disturbing the program", () => {
    const { memory, cpu } = runCpu(
      [
        { name: "main", address: 0x000, program: "LOADI R1, 1\nloop: LOAD R0, 0x300\nADD R0, R1\nSTORE R0, 0x300\nJMP loop" },
        { name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } },
      ],
      { ticks: 200, irqs: [5, 40, 80].map((tick) => ({ tick, vector: 0x200, priority: 0 })) },
    );
    expect(memory.bytes[0x3e0]).toBe(3);
    expect(cpu.cores[1].phase).toBe("IDLE"); // the idle core took them and went back to idle
    expect(cpu.scheduler.processes[0].core).toBe(0);
  });

  it("handles the more urgent of two waiting interrupts first", () => {
    const handlersEntered: number[] = [];
    let wasInHandler = false;
    runCpu(
      [
        { name: "isr-a", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } },
        { name: "isr-b", address: 0x220, program: HANDLER, symbols: { COUNTER: 0x3e1 } },
      ],
      {
        ticks: 60,
        cores: 1,
        irqs: [
          { tick: 1, vector: 0x220, priority: 3 },
          { tick: 1, vector: 0x200, priority: 0 },
        ],
        onTick: (cpu) => {
          const core = cpu.cores[0];
          const inHandlerNow = core.stack.length > 0;
          // On the tick a handler starts, the core has just asked for the handler's first instruction.
          if (inHandlerNow && !wasInHandler) handlersEntered.push(core.pc);
          wasInHandler = inHandlerNow;
        },
      },
    );
    expect(handlersEntered).toEqual([0x200, 0x220]);
  });
});
