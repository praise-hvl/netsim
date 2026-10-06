// Round-robin scheduling of programs ("processes") onto cores. Each program gets `quantum`
// instructions, then goes to the back of the queue if someone else is waiting. Programs are
// only switched between instructions, never while waiting for memory.
// See "Scheduler" in docs/ARCHITECTURE.md.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import { clearCore, coreSchema, inHandler, loadContext, saveContext, type Core } from "@/core/cpu-core";
import { todo } from "@/core/todo";

export const PROCESS_STATES = ["READY", "RUNNING", "DONE", "FAILED"] as const;
export type ProcessState = (typeof PROCESS_STATES)[number];

export const processFsm = defineFsm<ProcessState>("Process", PROCESS_STATES, "READY", [
  { from: "READY", to: "RUNNING", on: "core free, front of queue" },
  { from: "RUNNING", to: "READY", on: "quantum expired" },
  { from: "RUNNING", to: "DONE", on: "HALT" },
  { from: "RUNNING", to: "FAILED", on: "FAULT" },
]);

const contextSchema = coreSchema.pick({ registers: true, pc: true, flags: true });

export const processSchema = z.object({
  pid: z.number().int().min(1),
  name: z.string(),
  start: z.number().int().min(0),
  state: z.enum(PROCESS_STATES),
  /** Registers, PC and flags while the process is off a core. */
  context: contextSchema,
  core: z.number().int().nullable(),
  /** Instructions finished in earlier turns on a core. */
  instructions: z.number().int().min(0),
});
export type Process = z.infer<typeof processSchema>;

export const schedulerSchema = z.object({
  /** In queue order: the first READY process runs next. */
  processes: z.array(processSchema),
  nextPid: z.number().int().min(1),
  quantum: z.number().int().min(1),
});
export type Scheduler = z.infer<typeof schedulerSchema>;

export function createScheduler(quantum = 4): Scheduler {
  return { processes: [], nextPid: 1, quantum };
}

export function addProcess(scheduler: Scheduler, name: string, start: number): { scheduler: Scheduler; pid: number } {
  const pid = scheduler.nextPid;
  const process: Process = {
    pid,
    name,
    start,
    state: "READY",
    context: { registers: [0, 0, 0, 0], pc: start, flags: { zero: false, carry: false } },
    core: null,
    instructions: 0,
  };
  return { scheduler: { ...scheduler, processes: [...scheduler.processes, process], nextPid: pid + 1 }, pid };
}

/** The process that should run next: the first READY one in the queue. */
export function pickNext(scheduler: Scheduler): Process | undefined {
  // @student week=5 part=home id=pick-next "Return the first READY process in queue order"
  // TODO(week 5, pick-next): Return the first READY process in queue order
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: pick-next", scheduler);
  // @end
}

/** Has this core's program had its turn, and is it safe and useful to switch now? */
export function shouldPreempt(scheduler: Scheduler, core: Core): boolean {
  // @student week=7 part=home id=should-preempt "True when the quantum is used up, the core is between instructions (FETCH), not in a handler, and someone is waiting"
  // TODO(week 7, should-preempt): True when the quantum is used up, the core is between instructions (FETCH), not in a handler, and someone is waiting
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  // Until week 7 nobody is preempted: a program keeps its core until it halts.
  return false;
  // @end
}

/** Save the core's program back into its process and send the process to the back of the queue. */
export function switchOut(scheduler: Scheduler, core: Core, state: ProcessState = "READY"): { scheduler: Scheduler; core: Core } {
  // @student week=5 part=home id=switch-out "Save the context into the process, set its state, move it to the back of the queue, and clear the core"
  // TODO(week 5, switch-out): Save the context into the process, set its state, move it to the back of the queue, and clear the core
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: switch-out", scheduler, core, state);
  // @end
}

/** Runs at the start of every CPU tick, before the cores step. */
export function schedule(scheduler: Scheduler, cores: readonly Core[]): { scheduler: Scheduler; cores: Core[] } {
  let next = scheduler;
  const result: Core[] = [];

  // 1. Take programs off cores that finished, failed, or used up their turn.
  for (const core of cores) {
    let current = core;
    if (core.phase === "HALTED" || core.phase === "FAULT") {
      ({ scheduler: next, core: current } = switchOut(next, core, core.phase === "HALTED" ? "DONE" : "FAILED"));
    } else if (shouldPreempt(next, core)) {
      ({ scheduler: next, core: current } = switchOut(next, core));
    }
    result.push(current);
  }

  // 2. Give every empty core the next program in the queue.
  for (const [i, core] of result.entries()) {
    if (core.phase !== "IDLE" || inHandler(core)) continue;
    const process = pickNext(next);
    if (!process) break;
    const running: Process = { ...process, state: processFsm.go(process.state, "RUNNING"), core: core.id };
    next = { ...next, processes: next.processes.map((p) => (p.pid === process.pid ? running : p)) };
    result[i] = loadContext(core, process.context);
  }

  return { scheduler: next, cores: result };
}

export function snapshotScheduler(scheduler: Scheduler): Scheduler {
  // @student week=stretch part=home id=scheduler-snapshot "Return what should go in a save file for the scheduler"
  // TODO(stretch, scheduler-snapshot): Return what should go in a save file for the scheduler
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: scheduler-snapshot", scheduler);
  // @end
}

export function restoreScheduler(data: unknown): Scheduler {
  // @student week=stretch part=home id=scheduler-restore "Validate saved scheduler data and return it (throw if it's bad)"
  // TODO(stretch, scheduler-restore): Validate saved scheduler data and return it (throw if it's bad)
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: scheduler-restore", data);
  // @end
}
