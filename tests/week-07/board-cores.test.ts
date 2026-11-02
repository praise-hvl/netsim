// Week 7, your board: every core, the scheduler's choices, and interrupts arriving.
import { describe, expect, it } from "vitest";
import { interruptMarkers, laneRects, schedulerMoves } from "@/board/student/cores";
import { recordedFrames } from "../board";

describe("laneRects: one lane per core", () => {
  const area = { x: 10, y: 20, w: 80, h: 60 };

  it("gives N lanes for N cores, inside the area, never overlapping", () => {
    for (let n = 1; n <= 8; n++) {
      const lanes = laneRects(n, area);
      expect(lanes).toHaveLength(n);
      for (const [i, lane] of lanes.entries()) {
        expect(lane.w > 0 && lane.h > 0).toBe(true);
        expect(lane.x >= area.x && lane.y >= area.y && lane.x + lane.w <= area.x + area.w + 1e-9 && lane.y + lane.h <= area.y + area.h + 1e-9).toBe(true);
        for (const other of lanes.slice(i + 1)) {
          const apart = lane.x + lane.w <= other.x || other.x + other.w <= lane.x || lane.y + lane.h <= other.y || other.y + other.h <= lane.y;
          expect(apart).toBe(true);
        }
      }
    }
  });
});

describe("schedulerMoves: the scheduler's choices", () => {
  it("lists a move for every program whose core changed, and nothing else", () => {
    for (const name of ["2-cores", "8-cores"] as const) {
      const frames = recordedFrames(name);
      for (let i = 1; i < frames.length; i++) {
        const moves = schedulerMoves(frames[i - 1], frames[i]);
        const changed = frames[i].processes.filter((p) => (frames[i - 1].processes.find((q) => q.pid === p.pid)?.core ?? null) !== p.core);
        expect(moves.map((m) => m.program).sort()).toEqual(changed.map((p) => p.name).sort());
        for (const m of moves) {
          const now = frames[i].processes.find((p) => p.name === m.program)!;
          expect(m.to).toBe(now.core);
        }
      }
    }
  });

  it("sees the first program land on a core", () => {
    const frames = recordedFrames("2-cores");
    const all = frames.slice(1).flatMap((f, i) => schedulerMoves(frames[i], f));
    expect(all).toContainEqual({ program: "countdown", from: null, to: 0 });
  });
});

describe("interruptMarkers: interrupts arriving", () => {
  // A device raises an irq on the bus in one tick; a core takes it (starts its handler) a tick or
  // more later, never in the same tick.
  for (const name of ["2-cores", "8-cores"] as const) {
    const frames = recordedFrames(name);
    const markersAt = (i: number) => interruptMarkers(i > 0 ? frames[i - 1] : null, frames[i]);

    it(`${name}: an irq on the bus is "raised", naming who raised it and its handler`, () => {
      const i = frames.findIndex((f) => f.packets.some((p) => p.type === "irq" && p.from === "button-1"));
      expect(markersAt(i)).toContainEqual({ kind: "raised", from: "button-1", vector: 0x200 });
    });

    it(`${name}: one "raised" per irq packet, and no other`, () => {
      frames.forEach((f, i) => {
        const raised = markersAt(i).filter((m) => m.kind === "raised");
        expect(raised).toHaveLength(f.packets.filter((p) => p.type === "irq").length);
      });
    });

    it(`${name}: every raised interrupt is "taken" by a core a few ticks later, with the same handler`, () => {
      let checked = 0;
      frames.forEach((_, i) => {
        for (const raised of markersAt(i).filter((m) => m.kind === "raised")) {
          let j = i + 1;
          while (j < frames.length && !markersAt(j).some((m) => m.kind === "taken" && m.vector === raised.vector)) j++;
          expect(j < frames.length, `the irq at tick ${frames[i].tick} is never taken`).toBe(true);
          expect(j - i).toBeLessThanOrEqual(10);
          checked++;
        }
      });
      expect(checked).toBeGreaterThanOrEqual(5);
    });

    it(`${name}: "taken" names a core that is in its handler now and wasn't a tick ago`, () => {
      frames.forEach((f, i) => {
        for (const m of markersAt(i)) {
          if (m.kind !== "taken") continue;
          expect(f.cores.find((c) => c.id === m.core)?.inHandler).toBe(true);
          expect(i > 0 && frames[i - 1].cores.find((c) => c.id === m.core)?.inHandler).toBe(false);
        }
      });
    });

    it(`${name}: a quiet tick (no irq, no core starting a handler) gives none`, () => {
      let quiet = 0;
      frames.forEach((f, i) => {
        const starting = f.cores.some((c) => c.inHandler && !(i > 0 && frames[i - 1].cores.find((q) => q.id === c.id)?.inHandler));
        if (f.packets.some((p) => p.type === "irq") || starting) return;
        expect(markersAt(i)).toEqual([]);
        quiet++;
      });
      expect(quiet).toBeGreaterThan(10);
    });
  }
});
