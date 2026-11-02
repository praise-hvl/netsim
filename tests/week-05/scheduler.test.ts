// The scheduler's queue order in week 5: programs take the cores in the order they were added.
// (Preempting a program after its quantum comes in week 7.)
import { describe, expect, it } from "vitest";
import { addProcess, createScheduler, pickNext } from "@/core/scheduler";
import { runCpu } from "@/tests/helpers";

function queue(...names: string[]) {
  let scheduler = createScheduler();
  names.forEach((name, i) => (scheduler = addProcess(scheduler, name, i * 0x40).scheduler));
  return scheduler;
}

describe("queue order", () => {
  it("pickNext returns the first READY process, not any READY one", () => {
    expect(pickNext(queue("a", "b", "c"))?.name).toBe("a");
    const aRunning = queue("a", "b", "c");
    aRunning.processes[0] = { ...aRunning.processes[0], state: "RUNNING", core: 0 };
    expect(pickNext(aRunning)?.name).toBe("b");
    expect(pickNext(createScheduler())).toBeUndefined();
  });

  it("on one core, programs run one after another in the order they were added", () => {
    const program = "LOADI R0, 1\nHALT";
    const started: string[] = [];
    runCpu(
      [
        { name: "first", address: 0x000, program },
        { name: "second", address: 0x040, program },
        { name: "third", address: 0x080, program },
      ],
      {
        ticks: 60,
        cores: 1,
        onTick: (cpu) => {
          const running = cpu.scheduler.processes.find((p) => p.state === "RUNNING");
          if (running && started.at(-1) !== running.name) started.push(running.name);
        },
      },
    ).cpu.scheduler.processes.forEach((p) => expect(p.state).toBe("DONE"));
    expect(started).toEqual(["first", "second", "third"]);
  });
});
