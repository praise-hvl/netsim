// Week 3, your board: memory and the bus. These check what your functions say about a tick,
// never how you draw it.
import { describe, expect, it } from "vitest";
import { cellActivity, packetProgress } from "@/board/student/memory-bus";
import type { Frame, Packet } from "@/board/feed/frames";
import { recordedFrames } from "../board";

const frames = recordedFrames("2-cores");
const withAccesses = (accesses: Frame["accesses"]) => ({ accesses });

describe("cellActivity: which cells light up", () => {
  it("a read lights exactly the addressed cells", () => {
    const cells = cellActivity(withAccesses([{ address: 0x010, length: 4, kind: "read", by: "cpu", core: 1 }]));
    expect([...cells.keys()].sort((a, b) => a - b)).toEqual([0x010, 0x011, 0x012, 0x013]);
    expect(cells.get(0x012)).toEqual({ kind: "read", core: 1, by: "cpu" });
  });

  it("a write is marked as a write, and wins over a read of the same cell", () => {
    const cells = cellActivity(withAccesses([
      { address: 0x3f2, length: 1, kind: "write", by: "cpu", core: 0 },
      { address: 0x3f2, length: 1, kind: "read", by: "display-1", core: null },
    ]));
    expect(cells.get(0x3f2)?.kind).toBe("write");
  });

  it("nothing is lit on a tick without memory traffic", () => {
    expect(cellActivity(withAccesses([])).size).toBe(0);
  });

  it("in a recorded run, every fetch lights the 4 bytes at the core's PC", () => {
    let checked = 0;
    for (const frame of frames) {
      for (const p of frame.packets) {
        if (p.type !== "mem.read" || p.from !== "cpu" || p.length !== 4 || p.address === null) continue;
        const cells = cellActivity(frame);
        for (let a = p.address; a < p.address + 4; a++) expect(cells.get(a)?.kind).toBeDefined();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("packetProgress: packets travel during their tick", () => {
  const busy = frames.find((f) => f.packets.some((p) => p.type === "mem.data") && f.packets.some((p) => p.type === "mem.read"))!;
  const sample = Array.from({ length: 101 }, (_, i) => i / 100);

  it("is either off the wire (null) or between 0 (sent) and 1 (arrived)", () => {
    for (const p of busy.packets) for (const at of sample) {
      const t = packetProgress(p, busy.packets, at);
      if (t !== null) expect(t >= 0 && t <= 1).toBe(true);
    }
  });

  it("every packet is on the wire at some point in the tick", () => {
    for (const p of busy.packets) expect(sample.some((at) => packetProgress(p, busy.packets, at) !== null), p.type).toBe(true);
  });

  it("an answer is never further along than the question it answers", () => {
    const question = busy.packets.find((p) => p.type === "mem.read")!;
    const answer: Packet = { ...question, seq: 99, type: "mem.data", from: question.to, to: question.from };
    const packets = [question, answer];
    for (const at of sample) {
      const q = packetProgress(question, packets, at);
      const a = packetProgress(answer, packets, at);
      if (a !== null && a > 0) expect(q === null || q >= a).toBe(true);
    }
  });
});
