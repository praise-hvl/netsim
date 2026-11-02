import { describe, expect, it } from "vitest";
import { createCore, enterInterrupt, loadContext } from "@/core/cpu-core";
import { addProcess, createScheduler, pickNext, schedule, shouldPreempt, switchOut } from "@/core/scheduler";
import { runCpu } from "@/tests/helpers";

function threeProcesses() {
  let scheduler = createScheduler(4);
  for (const [name, start] of [["a", 0x000], ["b", 0x040], ["c", 0x080]] as const) {
    scheduler = addProcess(scheduler, name, start).scheduler;
  }
  return scheduler;
}

describe("scheduler pieces", () => {
  it("picks the first READY process in the queue", () => {
    expect(pickNext(threeProcesses())?.name).toBe("a");
    expect(pickNext(createScheduler())).toBeUndefined();
  });

  it("gives each idle core the next program", () => {
    const { scheduler, cores } = schedule(threeProcesses(), [createCore(0), createCore(1)]);
    expect(cores.map((c) => [c.phase, c.pc])).toEqual([["FETCH", 0x000], ["FETCH", 0x040]]);
    expect(scheduler.processes.map((p) => [p.name, p.state, p.core])).toEqual([
      ["a", "RUNNING", 0],
      ["b", "RUNNING", 1],
      ["c", "READY", null],
    ]);
  });

  it("doesn't preempt a core that's in an interrupt handler", () => {
    const scheduler = threeProcesses();
    const running = { ...loadContext(createCore(0), { registers: [0, 0, 0, 0], pc: 0, flags: { zero: false, carry: false } }), retired: 4 };
    // In a handler: what's on the core now is the handler, not the program.
    const inHandler = { ...enterInterrupt(running, 0x200), retired: 4 };
    expect(shouldPreempt(scheduler, inHandler)).toBe(false);
  });

  it("never switches a program out in the middle of an interrupt handler", () => {
    // One core, three programs and a quantum of 2, so the quantum runs out during the handler. If
    // the core were switched out there, the handler's state would be saved as the program's, and
    // its IRET would later run outside a handler: a FAULT.
    const handler = `
        LOAD  R0, 0x3E0
        LOADI R1, 1
        ADD   R0, R1
        ADD   R0, R1
        ADD   R0, R1
        STORE R0, 0x3E0
        IRET`;
    const program = (address: number) => `
        LOADI R0, 4
        LOADI R1, 1
loop:   SUB   R0, R1
        JNZ   ${address + 8}
        HALT`;
    const { cpu, memory } = runCpu(
      [
        { name: "a", address: 0x000, program: program(0x000) },
        { name: "b", address: 0x040, program: program(0x040) },
        { name: "c", address: 0x080, program: program(0x080) },
        { name: "isr", address: 0x200, program: handler },
      ],
      { ticks: 400, cores: 1, quantum: 2, irqs: [5, 30, 60, 90].map((tick) => ({ tick, vector: 0x200, priority: 0 })) },
    );
    expect(cpu.scheduler.processes.map((p) => [p.name, p.state])).toEqual([
      ["a", "DONE"],
      ["b", "DONE"],
      ["c", "DONE"],
    ]);
    expect(memory.bytes[0x3e0]).toBe(12); // all four handlers ran to their IRET
  });

  it("switching out saves the context and sends the process to the back", () => {
    const started = schedule(threeProcesses(), [createCore(0)]);
    const core = { ...started.cores[0], registers: [9, 8, 7, 6] as [number, number, number, number], pc: 0x010, retired: 4 };
    const { scheduler, core: cleared } = switchOut(started.scheduler, core);
    expect(cleared.phase).toBe("IDLE");
    const a = scheduler.processes.at(-1)!;
    expect(a).toMatchObject({ name: "a", state: "READY", core: null, instructions: 4, context: { registers: [9, 8, 7, 6], pc: 0x010 } });
    expect(scheduler.processes.map((p) => p.name)).toEqual(["b", "c", "a"]);
  });
});

describe("round robin on two cores", () => {
  it("marks programs DONE when they halt and FAILED when they fault", () => {
    const { cpu } = runCpu(
      [
        { name: "ok", address: 0x000, program: "LOADI R0, 1\nHALT" },
        { name: "bad", address: 0x040, program: [0xab, 0, 0, 0] },
      ],
      { ticks: 20 },
    );
    const states = Object.fromEntries(cpu.scheduler.processes.map((p) => [p.name, p.state]));
    expect(states).toEqual({ ok: "DONE", bad: "FAILED" });
    expect(cpu.cores.map((c) => c.phase)).toEqual(["IDLE", "IDLE"]);
  });

  it("runs the count-down and blink demos side by side", () => {
    const { memory, cpu } = runCpu(
      [
        { name: "countdown", address: 0x000, program: "LOADI R0, 3\nLOADI R1, 1\nloop: STORE R0, 0x3F2\nSUB R0, R1\nJNZ loop\nSTORE R0, 0x3F2\nHALT" },
        { name: "blink", address: 0x080, program: "LOADI R0, 255\nSTORE R0, 0x3F1\nHALT" },
      ],
      { ticks: 100 },
    );
    expect(cpu.scheduler.processes.every((p) => p.state === "DONE")).toBe(true);
    expect(memory.bytes[0x3f2]).toBe(0);
    expect(memory.bytes[0x3f1]).toBe(255);
  });
});
