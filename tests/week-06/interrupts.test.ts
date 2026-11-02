import { describe, expect, it } from "vitest";
import { enqueue, takeNext, type Irq } from "@/core/interrupts";

const irq = (priority: number, seq: number): Irq => ({ vector: 0x200, priority, source: `p${seq}`, seq });

describe("interrupt queue", () => {
  it("keeps the most urgent (lowest number) first", () => {
    let queue: Irq[] = [];
    for (const i of [irq(3, 0), irq(0, 1), irq(2, 2)]) queue = enqueue(queue, i);
    expect(queue.map((i) => i.priority)).toEqual([0, 2, 3]);
  });

  it("keeps arrival order between equal priorities", () => {
    let queue: Irq[] = [];
    for (const i of [irq(1, 0), irq(1, 1), irq(0, 2), irq(1, 3)]) queue = enqueue(queue, i);
    expect(queue.map((i) => i.seq)).toEqual([2, 0, 1, 3]);
  });

  it("does not change the queue it was given", () => {
    const queue = [irq(1, 0)];
    enqueue(queue, irq(0, 1));
    expect(queue).toHaveLength(1);
  });

  it("takes from the front, and gives null when empty", () => {
    const { irq: first, queue } = takeNext([irq(0, 0), irq(1, 1)]);
    expect(first?.seq).toBe(0);
    expect(queue.map((i) => i.seq)).toEqual([1]);
    expect(takeNext([])).toEqual({ irq: null, queue: [] });
  });
});
