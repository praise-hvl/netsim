// Week 6: round robin. A program gets its quantum of instructions, then goes to the back of the
// queue if someone is waiting (shouldPreempt). Interrupts come in week 7.
import { describe, expect, it } from "vitest";
import { createCore, loadContext } from "@/core/cpu-core";
import { addProcess, createScheduler, shouldPreempt } from "@/core/scheduler";
import { runCpu } from "@/tests/helpers";

// Each program adds 1 to its own counter forever.
const counter = (address: number) => `
        LOADI R1, 1
loop:   LOAD  R0, ${address}
        ADD   R0, R1
        STORE R0, ${address}
        JMP   loop`;

function threeProcesses() {
  let scheduler = createScheduler(4);
  for (const [name, start] of [["a", 0x000], ["b", 0x040], ["c", 0x080]] as const) {
    scheduler = addProcess(scheduler, name, start).scheduler;
  }
  return scheduler;
}

describe("shouldPreempt", () => {
  it("only preempts between instructions, after a full quantum, when someone is waiting", () => {
    const scheduler = threeProcesses();
    const running = { ...loadContext(createCore(0), { registers: [0, 0, 0, 0], pc: 0, flags: { zero: false, carry: false } }), retired: 4 };
    expect(shouldPreempt(scheduler, running)).toBe(true);
    expect(shouldPreempt(scheduler, { ...running, retired: 3 })).toBe(false);
    expect(shouldPreempt(scheduler, { ...running, phase: "WAIT_DATA" })).toBe(false);
    expect(shouldPreempt(createScheduler(4), running)).toBe(false); // nobody waiting
    // In an interrupt handler (a frame on its stack): never. Week 7 builds the handlers themselves.
    const frame = { registers: [0, 0, 0, 0] as [number, number, number, number], pc: 0x10, flags: { zero: false, carry: false }, retired: 0, resume: "FETCH" as const };
    expect(shouldPreempt(scheduler, { ...running, stack: [frame] })).toBe(false);
  });
});

describe("round robin on two cores", () => {
  it("shares two cores fairly between three programs", () => {
    const { memory, cpu } = runCpu(
      [
        { name: "a", address: 0x000, program: counter(0x300) },
        { name: "b", address: 0x040, program: counter(0x301) },
        { name: "c", address: 0x080, program: counter(0x302) },
      ],
      { ticks: 600 },
    );
    const counts = [memory.bytes[0x300], memory.bytes[0x301], memory.bytes[0x302]];
    for (const count of counts) expect(count).toBeGreaterThan(10);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    expect(cpu.scheduler.processes.every((p) => p.instructions > 0)).toBe(true);
  });

  it("never switches a program out while it waits for memory", () => {
    const phasesAtSwitch: string[] = [];
    let lastPid: (number | null)[] = [null, null];
    runCpu([{ name: "a", address: 0, program: counter(0x300) }, { name: "b", address: 0x40, program: counter(0x301) }, { name: "c", address: 0x80, program: counter(0x302) }], {
      ticks: 300,
      onTick: (cpu) => {
        const pids = cpu.cores.map((core) => cpu.scheduler.processes.find((p) => p.core === core.id)?.pid ?? null);
        pids.forEach((pid, i) => {
          if (pid !== lastPid[i] && lastPid[i] !== null) phasesAtSwitch.push(cpu.cores[i].phase);
        });
        lastPid = pids;
      },
    });
    expect(phasesAtSwitch.length).toBeGreaterThan(5);
    // A freshly switched-in program has just issued its first fetch.
    expect(new Set(phasesAtSwitch)).toEqual(new Set(["WAIT_FETCH"]));
  });
});
