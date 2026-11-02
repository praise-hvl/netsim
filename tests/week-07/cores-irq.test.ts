// Interrupts with N cores: a free core takes one if there is one; otherwise a core running a
// program does (an interrupt outranks a program), never a core already in a handler.
import { describe, expect, it } from "vitest";
import type { Cpu } from "@/core/cpu";
import { runCpu } from "@/tests/helpers";

const HANDLER = `
        LOAD  R0, COUNTER
        LOADI R1, 1
        ADD   R0, R1
        STORE R0, COUNTER
        IRET`;
const SPIN = "loop: JMP loop";

/** Which cores are in a handler, tick by tick. */
function handlerCores(cpu: Cpu): number[] {
  return cpu.cores.filter((c) => c.stack.length > 0).map((c) => c.id);
}

describe("interrupts on N cores", () => {
  it("go to a free core, not the one running the program", () => {
    const seen = new Set<number>();
    runCpu(
      [
        { name: "main", address: 0x000, program: SPIN },
        { name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } },
      ],
      { ticks: 80, cores: 4, irqs: [10, 40].map((tick) => ({ tick, vector: 0x200, priority: 0 })), onTick: (cpu) => handlerCores(cpu).forEach((c) => seen.add(c)) },
    );
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.has(0)).toBe(false); // core 0 runs "main"
  });

  it("go to a core running a program when every core is busy", () => {
    const programs = Array.from({ length: 4 }, (_, n) => ({ name: `p${n}`, address: n * 0x20, program: SPIN }));
    const { memory } = runCpu([...programs, { name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } }], {
      ticks: 120,
      cores: 4,
      irqs: [20, 60].map((tick) => ({ tick, vector: 0x200, priority: 0 })),
    });
    expect(memory.bytes[0x3e0]).toBe(2);
  });

  it("start on different cores in the same tick, at most one per core", () => {
    let mostAtOnce = 0;
    let neverTwice = true;
    runCpu(
      [{ name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e0 } }],
      {
        ticks: 60,
        cores: 4,
        irqs: [0, 1, 2].map((priority) => ({ tick: 5, vector: 0x200, priority })),
        onTick: (cpu) => {
          mostAtOnce = Math.max(mostAtOnce, handlerCores(cpu).length);
          if (cpu.cores.some((c) => c.stack.length > 1)) neverTwice = false;
        },
      },
    );
    expect(mostAtOnce).toBe(3);
    expect(neverTwice).toBe(true);
  });

  it("with one core, wait their turn and are all handled", () => {
    const { memory } = runCpu(
      [{ name: "isr", address: 0x200, program: HANDLER, symbols: { COUNTER: 0x3e1 } }],
      { ticks: 120, cores: 1, irqs: [0, 1, 2].map((priority) => ({ tick: 5, vector: 0x200, priority })) },
    );
    expect(memory.bytes[0x3e1]).toBe(3);
  });
});
