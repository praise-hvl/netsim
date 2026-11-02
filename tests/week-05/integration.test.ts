import { describe, expect, it } from "vitest";
import { testSystem } from "@/tests/helpers";

const COUNTER = `
        LOADI R1, 1
        LOADI R2, 12
loop:   LOAD  R0, 0x300
        ADD   R0, R1
        STORE R0, 0x300
        SUB   R2, R1
        JNZ   loop
        HALT`;

async function runOnce(): Promise<{ bytes: number[]; trace: string[] }> {
  const system = await testSystem();
  await system.run("a", 0x000, COUNTER);
  await system.run("b", 0x040, COUNTER.replaceAll("0x300", "0x301"));
  await system.rec.steps(300);
  const trace = system.rec.messages.filter((m) => m.type.startsWith("mem.")).map((m) => `${m.tick} ${m.from}>${m.to} ${m.type} ${JSON.stringify(m.payload)}`);
  return { bytes: [system.memoryByte(0x300), system.memoryByte(0x301)], trace };
}

describe("CPU and Memory over the bus", () => {
  it("runs two programs on two cores to the right answer", async () => {
    const { bytes } = await runOnce();
    expect(bytes).toEqual([12, 12]);
  });

  it("produces exactly the same message trace every time", async () => {
    const first = await runOnce();
    for (let i = 0; i < 4; i++) expect((await runOnce()).trace).toEqual(first.trace);
  });

  it("finishes both processes and frees the cores", async () => {
    const system = await testSystem();
    await system.run("short", 0x000, "LOADI R0, 1\nHALT");
    await system.rec.steps(15);
    expect(system.cpu().scheduler.processes[0].state).toBe("DONE");
    expect(system.cpu().cores.map((c) => c.phase)).toEqual(["IDLE", "IDLE"]);
  });

  it("a fetch fault (running off the end of memory) stops only the program that caused it", async () => {
    const system = await testSystem();
    await system.run("bad", 0x000, [0x05, 0, 0x03, 0xfe]); // JMP 0x3FE: the next fetch runs off the end
    await system.run("good", 0x040, "LOADI R0, 5\nSTORE R0, 0x300\nHALT");
    await system.rec.steps(30);
    const states = Object.fromEntries(system.cpu().scheduler.processes.map((p) => [p.name, p.state]));
    expect(states).toEqual({ bad: "FAILED", good: "DONE" });
    expect(system.memoryByte(0x300)).toBe(5);
  });
});
