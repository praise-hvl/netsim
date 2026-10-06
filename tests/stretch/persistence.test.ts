import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCore, restoreCore, snapshotCore } from "@/core/cpu-core";
import { createMemory, restoreMemory, snapshotMemory, write } from "@/core/memory";
import { addProcess, createScheduler, restoreScheduler, snapshotScheduler } from "@/core/scheduler";
import { COUNTER_BASE } from "@/protocol/memory-map";
import { testSystem } from "@/tests/helpers";

const PROGRAM = `
        LOADI R1, 1
        LOADI R2, 20
loop:   LOAD  R0, 0x300
        ADD   R0, R1
        STORE R0, 0x300
        SUB   R2, R1
        JNZ   loop
        HALT`;

describe("snapshots of the pure parts", () => {
  it("memory round-trips, and a bad one is refused", () => {
    const result = write(createMemory(), 0x123, [42]);
    if (!result.ok) throw new Error(result.fault);
    const saved = JSON.parse(JSON.stringify(snapshotMemory(result.value)));
    expect(restoreMemory(saved).bytes[0x123]).toBe(42);
    expect(() => restoreMemory({ bytes: [1, 2, 3] })).toThrow();
  });

  it("a core round-trips, and a bad one is refused", () => {
    const core = { ...createCore(1), registers: [1, 2, 3, 4] as [number, number, number, number], pc: 0x44 };
    expect(restoreCore(JSON.parse(JSON.stringify(snapshotCore(core))))).toEqual(core);
    expect(() => restoreCore({ ...core, phase: "DANCING" })).toThrow();
  });

  it("the scheduler round-trips, and a bad one is refused", () => {
    const scheduler = addProcess(createScheduler(4), "a", 0x40).scheduler;
    expect(restoreScheduler(JSON.parse(JSON.stringify(snapshotScheduler(scheduler))))).toEqual(scheduler);
    expect(() => restoreScheduler({ ...scheduler, quantum: 0 })).toThrow();
  });
});

describe("saving and restoring the whole system", () => {
  async function system(savesDir: string) {
    const s = await testSystem({ host: true, busOptions: { savesDir } });
    await s.rec.client.request("host.spawn", "host", { kind: "button", id: "button-1", config: {}, slot: 0 });
    return s;
  }

  it("gives the same answer as an uninterrupted run", async () => {
    const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));

    const straight = await system(savesDir);
    await straight.run("count", 0x000, PROGRAM);
    await straight.rec.steps(500);
    const expected = straight.memoryByte(0x300);
    expect(expected).toBe(20);

    const first = await system(savesDir);
    await first.run("count", 0x000, PROGRAM);
    await first.rec.steps(137); // stop somewhere in the middle, possibly mid-instruction
    await first.rec.client.request("save", "bus", { name: "halfway" });
    expect(first.memoryByte(0x300)).toBeLessThan(20);

    // A completely fresh system, with no button yet: restore must bring everything back.
    const second = await testSystem({ host: true, busOptions: { savesDir } });
    await second.rec.client.request("restore", "bus", { name: "halfway" });
    expect(second.bus.tick()).toBe(137);
    expect(second.memoryByte(0x300)).toBe(first.memoryByte(0x300));
    await second.rec.steps(400);
    expect(second.memoryByte(0x300)).toBe(expected);
    expect(second.cpu().scheduler.processes[0].state).toBe("DONE");
  });

  it("refuses to save while the clock is running", async () => {
    const s = await system(mkdtempSync(join(tmpdir(), "netsim-")));
    await s.rec.client.request("control", "bus", { action: "start" });
    await expect(s.rec.client.request("save", "bus", { name: "nope" })).rejects.toThrow(/stop the clock/);
    await s.rec.client.request("control", "bus", { action: "stop" });
  });

  it("refuses a damaged save file", async () => {
    const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));
    writeFileSync(join(savesDir, "broken.json"), JSON.stringify({ version: 2, tick: "soon" }));
    const s = await system(savesDir);
    await expect(s.rec.client.request("restore", "bus", { name: "broken" })).rejects.toThrow(/damaged/);
    await expect(s.rec.client.request("restore", "bus", { name: "missing" })).rejects.toThrow(/no save called/);
  });
});

describe("restoring is all or nothing", () => {
  /** Save `name`, then write a copy of it as `bad` with the CPU's first core in a made-up phase. */
  function corruptCpu(savesDir: string, name: string) {
    const save = JSON.parse(readFileSync(join(savesDir, `${name}.json`), "utf8")) as {
      components: { cpu: { data: { cores: Array<{ phase: string }> } } };
    };
    save.components.cpu.data.cores[0].phase = "DANCING";
    writeFileSync(join(savesDir, "bad.json"), JSON.stringify(save));
  }

  it("a bad CPU part changes nothing: memory, CPU and tick all stay as they were", async () => {
    const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));
    const s = await testSystem({ host: true, busOptions: { savesDir } });
    await s.run("count", 0x000, PROGRAM);
    await s.rec.steps(60);
    await s.rec.client.request("save", "bus", { name: "early" });
    corruptCpu(savesDir, "early");
    await s.rec.steps(140);

    const before = { byte: s.memoryByte(0x300), tick: s.bus.tick(), cpu: JSON.stringify(s.cpu()) };
    expect(before.byte).toBeGreaterThan(0);
    await expect(s.rec.client.request("restore", "bus", { name: "bad" })).rejects.toThrow(/cpu refused its snapshot[\s\S]*nothing was restored/);

    // Memory comes before the CPU in the file, and it must not have been rewound.
    expect({ byte: s.memoryByte(0x300), tick: s.bus.tick(), cpu: JSON.stringify(s.cpu()) }).toEqual(before);
  });

  it("peripherals started just for a failed restore are removed again", async () => {
    const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));
    const s = await testSystem({ host: true, busOptions: { savesDir } });
    await s.rec.client.request("host.spawn", "host", { kind: "button", id: "button-1", config: {}, slot: 0 });
    await s.rec.client.request("save", "bus", { name: "with-button" });
    corruptCpu(savesDir, "with-button");
    await s.rec.client.request("host.remove", "host", { id: "button-1" });

    await expect(s.rec.client.request("restore", "bus", { name: "bad" })).rejects.toThrow(/nothing was restored/);
    // Spawning it again works, so its slot and its id on the bus were both freed.
    await s.rec.client.request("host.spawn", "host", { kind: "button", id: "button-1", config: {}, slot: 0 });
  });
});

describe("a peripheral's waiting input is saved too", () => {
  it("a button pressed while the clock is stopped still interrupts after a restore", async () => {
    const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));
    const first = await testSystem({ host: true, busOptions: { savesDir } });
    await first.rec.client.request("host.spawn", "host", { kind: "button", id: "button-1", config: {}, slot: 0 });
    await first.rec.step();
    first.rec.client.send("input", "button-1", { action: "press" });
    // A round trip through the bus: once it's back, the press has reached the button.
    await first.rec.client.request("mem.read", "memory", { address: 0, length: 1 });
    await first.rec.client.request("save", "bus", { name: "pressed" });

    // A fresh system with no button: the restore starts one, with the press still waiting.
    const second = await testSystem({ host: true, busOptions: { savesDir } });
    await second.rec.client.request("restore", "bus", { name: "pressed" });
    await second.rec.steps(30);
    expect(second.memoryByte(COUNTER_BASE)).toBe(1);
    expect(second.rec.messages.filter((m) => m.type === "irq")).toHaveLength(1);
  });
});

it("a save keeps the number of cores", async () => {
  const savesDir = mkdtempSync(join(tmpdir(), "netsim-"));
  const four = await testSystem({ busOptions: { savesDir } });
  await four.rec.client.request("cpu.cores", "cpu", { count: 4 });
  await four.run("count", 0x000, PROGRAM);
  await four.rec.steps(40);
  await four.rec.client.request("save", "bus", { name: "four-cores" });

  const fresh = await testSystem({ busOptions: { savesDir } });
  expect(fresh.cpu().cores).toHaveLength(2);
  await fresh.rec.client.request("restore", "bus", { name: "four-cores" });
  expect(fresh.cpu().cores).toHaveLength(4);
});
