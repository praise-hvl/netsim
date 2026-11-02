// The CPU works the same with 1 to 8 cores: every core is the same FSM, and one round-robin
// scheduler shares them fairly.
import { describe, expect, it } from "vitest";
import { createCpu, resizeCpu, MAX_CORES } from "@/core/cpu";
import { createCore, loadContext } from "@/core/cpu-core";
import { runCpu, testSystem } from "@/tests/helpers";

/** A program that adds 1 to its own byte at 0x300 + n, forever. */
const counter = (n: number) => `
        LOADI R1, 1
loop:   LOAD  R0, ${0x300 + n}
        ADD   R0, R1
        STORE R0, ${0x300 + n}
        JMP   loop`;

describe("round robin across N cores", () => {
  it.each([1, 2, 4, 8])("shares %i core(s) fairly between one more program than there are cores", (cores) => {
    const programs = Array.from({ length: cores + 1 }, (_, n) => ({ name: `p${n}`, address: n * 0x20, program: counter(n) }));
    const { memory, cpu } = runCpu(programs, { ticks: 1200, cores });
    const counts = programs.map((_, n) => memory.bytes[0x300 + n]);
    for (const count of counts) expect(count).toBeGreaterThan(5);
    expect(Math.max(...counts) - Math.min(...counts), `counts: ${counts.join(", ")}`).toBeLessThanOrEqual(3);
    expect(cpu.cores).toHaveLength(cores);
    // Every core did some work.
    expect(new Set(cpu.scheduler.processes.flatMap((p) => (p.core === null ? [] : [p.core]))).size).toBe(cores);
  });

  it("with as many cores as programs, nobody waits", () => {
    const programs = Array.from({ length: 4 }, (_, n) => ({ name: `p${n}`, address: n * 0x20, program: counter(n) }));
    const { cpu } = runCpu(programs, { ticks: 50, cores: 4 });
    expect(cpu.scheduler.processes.every((p) => p.state === "RUNNING")).toBe(true);
  });
});

describe("how many cores", () => {
  it("is 2 by default and 1 to 8 otherwise", () => {
    expect(createCpu().cores).toHaveLength(2);
    expect(createCpu({ cores: 1 }).cores).toHaveLength(1);
    expect(createCpu({ cores: MAX_CORES }).cores.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(() => createCpu({ cores: 0 })).toThrow(/1 to 8 cores/);
    expect(() => createCpu({ cores: 9 })).toThrow(/1 to 8 cores/);
  });

  it("can grow, and shrink only by idle cores", () => {
    const four = resizeCpu(createCpu(), 4);
    expect(four.cores.map((c) => [c.id, c.phase])).toEqual([[0, "IDLE"], [1, "IDLE"], [2, "IDLE"], [3, "IDLE"]]);
    expect(resizeCpu(four, 1).cores).toHaveLength(1);

    const busy = { ...four, cores: four.cores.map((c) => (c.id === 3 ? loadContext(createCore(3), { registers: [0, 0, 0, 0], pc: 0, flags: { zero: false, carry: false } }) : c)) };
    expect(() => resizeCpu(busy, 2)).toThrow(/core 3 is busy/);
    expect(resizeCpu(busy, 4).cores).toHaveLength(4);
  });

  it("can be changed live over the bus, and a reset keeps the new count", async () => {
    const system = await testSystem();
    await system.rec.client.request("cpu.cores", "cpu", { count: 6 });
    expect(system.cpu().cores).toHaveLength(6);
    await system.rec.client.request("control", "bus", { action: "reset" });
    await system.rec.step();
    expect(system.cpu().cores).toHaveLength(6);
    await expect(system.rec.client.request("cpu.cores", "cpu", { count: 9 })).rejects.toThrow();
  });
});

describe("the same programs on 1, 2 and 8 cores", () => {
  // Three programs that each write only their own bytes, then halt.
  const programs = [
    { name: "countdown", address: 0x000, program: "LOADI R0, 9\nLOADI R1, 1\nloop: STORE R0, 0x3F2\nSUB R0, R1\nJNZ loop\nSTORE R0, 0x3F2\nHALT" },
    { name: "sum", address: 0x040, program: "LOADI R0, 0\nLOADI R1, 7\nLOADI R2, 1\nloop: ADD R0, R1\nSUB R1, R2\nJNZ loop\nSTORE R0, 0x300\nHALT" },
    { name: "blink", address: 0x080, program: "LOADI R2, 4\nLOADI R3, 1\nagain: LOADI R0, 255\nSTORE R0, 0x3F1\nLOADI R0, 0\nSTORE R0, 0x3F1\nSUB R2, R3\nJNZ again\nHALT" },
  ];

  it("end with the same memory, and every program done", () => {
    const results = [1, 2, 8].map((cores) => runCpu(programs, { ticks: 3000, cores }));
    for (const { cpu } of results) expect(cpu.scheduler.processes.map((p) => p.state)).toEqual(["DONE", "DONE", "DONE"]);
    const [one, two, eight] = results.map((r) => r.memory.bytes);
    expect(two).toEqual(one);
    expect(eight).toEqual(one);
    expect([one[0x3f2], one[0x300], one[0x3f1]]).toEqual([0, 28, 0]); // 7+6+...+1 = 28
  });
});
