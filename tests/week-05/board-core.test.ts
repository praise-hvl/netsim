// Week 5, your board: one CPU core and its fetch / decode / execute step.
import { describe, expect, it } from "vitest";
import { cycleStep, fetchAddress } from "@/board/student/core";
import { recordedFrames } from "../board";

describe("cycleStep: which step a core is on", () => {
  it("names the step of each phase", () => {
    expect(cycleStep("FETCH")).toBe("fetch");
    expect(cycleStep("DECODE")).toBe("decode");
    expect(cycleStep("EXECUTE")).toBe("execute");
    expect(cycleStep("IDLE")).toBe("idle");
    expect(cycleStep("HALTED")).toBe("idle");
  });

  it("counts waiting for memory as part of the step that asked", () => {
    expect(cycleStep("WAIT_FETCH")).toBe("fetch");
    expect(cycleStep("WAIT_DATA")).toBe("execute");
  });

  it("walks fetch -> decode -> execute for every instruction in a recorded run", () => {
    const frames = recordedFrames("2-cores");
    const steps = frames.map((f) => cycleStep(f.cores[0]?.phase ?? "IDLE"));
    const order = { fetch: 0, decode: 1, execute: 2 } as const;
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1], steps[i]];
      if (a === "idle" || b === "idle" || a === b) continue;
      // The next step, or back to fetch for the next instruction. Never skips decode.
      expect(order[b] === order[a] + 1 || b === "fetch", `${a} -> ${b} at tick ${frames[i].tick}`).toBe(true);
    }
  });
});

describe("fetchAddress: where the instruction comes from", () => {
  const frames = recordedFrames("2-cores");

  it("is the core's PC whenever it fetches", () => {
    let checked = 0;
    for (const frame of frames) {
      for (const core of frame.cores) {
        const address = fetchAddress(frame, core.id);
        if (address === null) continue;
        expect(address).toBe(core.pc);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("is null on a tick the core didn't fetch, and doesn't pick up another core's fetch", () => {
    const frame = frames.find((f) => f.packets.some((p) => p.type === "mem.read" && p.length === 4 && p.core === 1) && !f.packets.some((p) => p.type === "mem.read" && p.length === 4 && p.core === 0))!;
    expect(fetchAddress(frame, 0)).toBeNull();
    expect(fetchAddress(frame, 1)).not.toBeNull();
  });
});
