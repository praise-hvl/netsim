// Pending interrupts, most urgent first. Lower priority number = more urgent; two interrupts
// with the same priority are handled in the order they arrived.
import { z } from "zod";
import { todo } from "@/core/todo";

export const irqSchema = z.object({
  vector: z.number().int().min(0),
  priority: z.number().int().min(0),
  /** Who raised it (a component id). */
  source: z.string(),
  /** Arrival order, for breaking ties fairly. */
  seq: z.number().int().min(0),
});
export type Irq = z.infer<typeof irqSchema>;

/** Returns a new queue with `irq` in its place. */
export function enqueue(queue: readonly Irq[], irq: Irq): Irq[] {
  // @student week=7 part=class id=irq-enqueue "Insert irq so the queue stays sorted: priority first, then arrival order"
  // TODO(week 7, irq-enqueue): Insert irq so the queue stays sorted: priority first, then arrival order
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  // Until week 7 interrupts are ignored: the queue stays as it was.
  return [...queue];
  // @end
}

/** Take the most urgent interrupt off the front. */
export function takeNext(queue: readonly Irq[]): { irq: Irq | null; queue: Irq[] } {
  // @student week=7 part=class id=irq-take-next "Return the first interrupt and the queue without it (irq is null when empty)"
  // TODO(week 7, irq-take-next): Return the first interrupt and the queue without it (irq is null when empty)
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: irq-take-next", queue);
  // @end
}
