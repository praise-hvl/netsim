# NetSim Course Plan

Approved by Praise on 2026-10-04. The previous course shape (eight weekly topics without
design/build pairs) is kept in [archive/COURSE-PLAN-v1.md](./archive/COURSE-PLAN-v1.md).

System architecture, protocol, ISA and FSMs: see [ARCHITECTURE.md](./ARCHITECTURE.md).

## The shape

Eight Mondays, **one hour each**. After the setup week, sessions alternate:

- **DESIGN** sessions are conceptual. You learn the hardware or OS idea, then design that part of
  the machine on paper: its parts, messages, states, and what it looks like on screen. The output
  is a **design note**.
- **BUILD** sessions turn the last design note into working code. You write the core mechanisms
  yourself (they're the `@student` regions, checked by tests); your AI agent builds the visual
  layer from your design note. Each build adds to **one portfolio piece**.

**The showpiece** at the end: *a multi-core computer I designed and built, with a bus, memory, a
CPU, a scheduler and interrupts, running live in the browser.* It's a 2.5D board (SVG or Canvas,
based on Praise's sketches) where parts light up as messages cross the bus, deployed to GitHub
Pages, with a 30-second video.

**What stays the same:** the concepts; `@student` regions plus tests for the core mechanisms (bus,
CPU FSM, scheduler, interrupts); "Codex may help with the writing, you guide the design"; and the
no-AI explain-it-back, now also covering your design notes. **What changes:** the visual layer and
polish are the agent's job (no React Flow node regions), the scope is bigger, and the extras
become stretch.

| Mon | Session | Topic | Output |
|---|---|---|---|
| 1 | SETUP | Setup & system roles (done) | `npm run doctor` green; week-1 notes |
| 2 | DESIGN | The machine and its bus | Design note: parts, messages, one tick, a sketch of the board |
| 3 | BUILD | Bus + memory on screen | Memory cells light up as requests cross the bus |
| 4 | DESIGN | The CPU | Design note: core FSM, instructions, how a step animates |
| 5 | BUILD | A CPU that runs programs | Countdown and blink, animated on the board |
| 6 | DESIGN | The OS heart: scheduling + interrupts | Design note: processes, round robin, interrupt entry/exit |
| 7 | BUILD | Configurable cores, scheduler, interrupts | 1–8 cores (lessons at 2), round robin, interrupts flying in, live |
| 8 | DEMO | Ship it | Deployed to GitHub Pages, 30-second video, final explain-it-back |

### How a design/build pair works

1. **Design (Monday N):** a short concept talk or unplugged activity, then you design on paper in
   pairs, filling in the design note in class. Finish it at home (`docs/notes/week-NN.md`, from
   `docs/notes/design-note-template.md`), including a photo of your board sketch.
2. **Explain-it-back on the note** before the build session: a 5-minute slot or a 3-minute video,
   no AI. You present your design and defend one decision.
3. **Build (Monday N+1):** you write the `@student` regions live and in class, with tests as the
   checkpoint; the take-home is the rest of the regions plus the board work. For the board, you
   hand your design note to Codex as the brief ("the agent brief" section of the note), review
   what it builds, and keep only what you can explain.
4. **Explain-it-back on the build:** your code, the hardware idea, and one thing on the board you
   asked the agent to change and why.

### The board kit (decided)

Students start from a **stripped-down board kit**, not a blank canvas. VIZ built it in
netsim-studio (PR #12, `praise/board-kit`); the names below are from that PR:

- **Finished for them:** the data feed (the bus tap, turned into what the board draws) and a
  library of parts (memory cells, bus lanes, packets, core panels, devices).
- **An empty board** in `board/student/`, with `@student` regions per build week, viewed at
  `/board` (`npm run dev:all`, then http://localhost:3005/board):

  | Week | File | In class | Take-home |
  |---|---|---|---|
  | 3 | `board/student/memory-bus.tsx` | `board-cell-activity`, `board-draw-memory` | `board-packet-progress`, `board-draw-bus` |
  | 5 | `board/student/core.tsx` | `board-cycle-step`, `board-draw-core` | `board-fetch-address` |
  | 7 | `board/student/cores.tsx` | `board-lane-rects`, `board-interrupt-markers` | `board-scheduler-moves`, `board-draw-cores` |

- **Light behaviour checks:** `tests/week-03/board-memory-bus.test.ts`,
  `tests/week-05/board-core.test.ts` and `tests/week-07/board-cores.test.ts` (for example "a read
  lights the cell it read"), so the board is gated like the core code, not by how it looks.
- **Instructor-only:** the reference board's guided lessons, explain mode and glossary don't ship.

Each build week's **agent brief** (section 9 of the design note) points the agent at that week's
board regions: the student's design note and sketch say *what* to draw, the kit says *where* the
code goes, and the behaviour checks say when it's done.

### Grading, sketched

Design notes join the weekly explain-it-back (they're how "you guide the design" becomes a
habit). Tests gate the build weeks, as now. The final demo is graded on the deployed board, the
live in-class demo and the final explain-it-back. Stretch work earns no extra credit (portfolio
only). Weights to be set in `teacher/grading.md` once the shape is
approved.

## Mon 1: Setup & system roles (unchanged)

As on `netsim`: accounts, Node, the setup tool, `npm run doctor`, the week-1 notes (`setup-doctor`,
`setup-codex-summary`, `setup-codex-check`), `tests/week-01/`. The "Map the system" drawing from
the take-home becomes the starting point of Mon 2's design note.

## Mon 2: DESIGN · The machine and its bus

- **Hardware idea:** a computer is parts with jobs (CPU runs instructions, memory stores bytes,
  devices connect to the world) that share a **bus** and move in step with a **clock**. A memory
  access is a **request and a reply** across the bus; memory is **byte-addressable** with a fixed
  size, and an address outside it is a **fault**.
- **RTOS idea:** the clock tick as the system's heartbeat; a shared resource (the bus) that many
  parts want at once.
- **In class:** the system-roles + mailroom unplugged opener; then in pairs: parts and jobs, the
  messages a memory read and write need (compared with ARCHITECTURE.md's table), one memory read
  told tick by tick, and a paper sketch of the board.
- **Design note:** sections 1–7 of the template, focused on the bus and memory (see
  `docs/weeks/week-02.md`).
- **Explain-it-back:** walk through your note: what each part does, one message and its reply,
  why the reply waits for the next tick, and why you placed things where you did on the board.
- **Stretch:** a sketch of what changes with two memories, or a DMA device that copies memory
  without the CPU.

## Mon 3: BUILD · Bus + memory on screen

- **You write (regions, gated by tests):** from today's week 2:
  - `handshake`, `handle-tick` (joining the bus, answering the clock);
  - `parse-message` (validation at the boundary);
  - `client-request` (request/reply correlation);
  - `memory-read`, `memory-write`, `memory-handler` (memory and its fault rule);
  - from today's week 4: `tick-barrier` (the tick ends only when every request has its reply).
- **Tests:** today's `tests/week-02/` (handshake, ticks, messages, memory, memory-over-bus,
  memory-status, who-may-send, late-join, logger) plus the barrier part of `order.test.ts`, moved
  to `tests/week-03/`.
- **The board (with your agent, from your Mon-2 note and sketch):** `board/student/memory-bus.tsx`:
  `board-cell-activity` and `board-draw-memory` (cells light up on a read in one colour, a write in
  another), `board-packet-progress` and `board-draw-bus` (packets move along the bus wires,
  questions first, then answers), driven by the kit's data feed. Gated by
  `tests/week-03/board-memory-bus.test.ts`.
- **Explain-it-back:** your `handshake` and `request()`; what the barrier waits for; one thing on
  the board you asked the agent to change.
- **Stretch:** `is-mem-read` (hand-written validator, to feel what the schema does for you); the
  `hello` script joining the class bus; the watchdog.

## Mon 4: DESIGN · The CPU

- **Hardware idea:** fetch–decode–execute; registers, PC and flags; a 4-byte instruction encoding;
  memory latency (a `LOAD` takes a tick more than an `ADD`).
- **RTOS idea:** the CPU as a finite state machine that only acts on the clock edge (latching).
- **In class:** the paper CPU (one short program, tick by tick); then in pairs: the core's FSM
  (states, events, transitions) as a table, three instructions encoded by hand, and a storyboard
  of how one instruction animates on the board (what lights up in each phase).
- **Design note:** FSM table, instruction table, the storyboard, the countdown program traced for
  its first 10 ticks, and the agent brief for Mon 5.
- **Explain-it-back:** your FSM: why `WAIT_FETCH` exists; the 4 bytes of one instruction; what the
  board shows during `DECODE`.
- **Stretch:** design a `CALL`/`RET` pair (what the core would need that it doesn't have).

## Mon 5: BUILD · A CPU that runs programs

- **You write:**
  - the ISA: `decode`, `encode`;
  - the core FSM, today's week 3: `fetch`, `await-instruction`, `decode-step`, `execute-core`,
    `await-data`, `execute-rest`;
  - the CPU shell, today's week 4: `cpu-send-effects`, `cpu-latch-reply`;
  - **from the scheduler, the non-preemptive half:** `pick-next` and `switch-out`, so programs go
    to free cores and leave when they halt.
- **Tests:** today's `tests/week-03/` (isa, asm, cpu-core, fsm, programs), plus the parts of
  `integration.test.ts` that don't need preemption, moved to `tests/week-05/`.
- **The board (with your agent, from your Mon-4 note and storyboard):** `board/student/core.tsx`:
  `board-cycle-step` (map each core phase to fetch, decode, execute or idle), `board-draw-core`
  (one core with the current step lit, its program and PC) and `board-fetch-address` (find the
  core's instruction fetch among the tick's packets). The run controls and parts come from the
  kit. Countdown and blink run, animated. Gated by `tests/week-05/board-core.test.ts`.
- **Explain-it-back:** one instruction, tick by tick, pointing at your code and the board; why
  replies are latched to the next tick.
- **Stretch:** the trace view (disassembled instruction per tick); `fsm-mermaid` and
  `npm run fsm:export` (diagrams generated from your FSM).
- **For CORE:** the LED and Button logic ship complete (they're the demo's I/O), so today's
  `led-tick`, `led-view` and `button-view` stop being regions. Two programs on two cores need
  `pick-next` and `switch-out` before preemption exists; `should-preempt` stays for Mon 7.

## Mon 6: DESIGN · The OS heart: scheduling + interrupts

- **Hardware/OS ideas:**
  - processes and their saved **context** (registers, PC, flags);
  - **round robin** with a quantum counted in instructions; preemption only *between*
    instructions;
  - **interrupts**: vectors, priority, entry and `IRET`, handled by idle cores first;
  - with N cores, who takes the next process and who takes an interrupt.
- **RTOS idea:** this is the heart of a real-time OS: a tick, a scheduler, ISRs with priorities,
  and **critical sections** (the timer handler race, if two cores run the same handler).
- **In class:** a human round robin (students as processes, chairs as cores); interrupts as
  "tap on the shoulder, finish your instruction first"; then in pairs: the process FSM, the
  context, the interrupt entry/exit storyboard, a device priority table, and a decision on how the
  design behaves at 1, 2 and 8 cores.
- **Design note:** process FSM, context, interrupt storyboard, priority table, the multi-core
  decision with its trade-off, and the agent brief for Mon 7.
- **Explain-it-back:** what's saved in a context switch and why not mid-`WAIT_DATA`; why the timer
  is lower priority than the button; what changes at 8 cores.
- **Stretch:** a semaphore for the timer race; priority inversion, explained with your board.

## Mon 7: BUILD · Configurable cores, scheduler, interrupts

- **You write:**
  - round robin: `should-preempt` (today's week 4);
  - interrupts, today's week 6: `irq-enqueue`, `irq-take-next`, `can-take-interrupt`,
    `enter-interrupt`, `iret`;
  - the Timer: `timer-input`, `timer-tick` (a periodic interrupt source).
- **Tests:** today's `scheduler`, `order`, `same-tick`, `reset` (week 4) and `interrupts`,
  `cpu-core-irq`, `button-irq`, `timer` (week 6), moved to `tests/week-07/`, plus a new test that
  the same programs give the same final memory with 1, 2 and 8 cores.
- **The board (with your agent, from your Mon-6 note):** `board/student/cores.tsx`:
  `board-lane-rects` (one lane per core, for 1–8 cores; lessons and the default at 2),
  `board-interrupt-markers` (a marker when an interrupt is raised on the bus, and another when a
  core takes it a tick or more later), `board-scheduler-moves` (which programs moved between cores since the last tick) and
  `board-draw-cores` (the lanes, the scheduler's moves and arriving interrupts). Gated by
  `tests/week-07/board-cores.test.ts`.
- **Explain-it-back:** your `should-preempt`; interrupt entry and `IRET`, on the board; what you saw
  change between 2 and 8 cores, and why.
- **Stretch:** the watchdog (`stalled` components); bus arbitration reading (`arbitrate()`); a
  sensor, proximity or potentiometer peripheral with its ISR; the timer race and a fix.
- **For CORE:** configurable cores (1–8) in the CPU and its status, and the multi-core test.

## Mon 8: DEMO · Ship it

- **Ship:** the board deployed to **GitHub Pages** from your fork, with the link in your README.
  That deployed page is what students link to in their portfolio.
- **Demo, live in class:** 3 minutes, from the deployed page: one program running, an interrupt,
  the core count changing. **The portfolio recording is captured during this in-class demo** (a
  screen recording of the board while they present), not a separate take-home video. Then the
  **final explain-it-back** (2 minutes, live): one moment in the trace, explained at both levels.
- **For CORE/DASHBOARD (dependency):** GitHub Pages is static hosting, so "running live in the
  browser" needs the bus and components to run **in the page** (an in-memory transport instead of a
  WebSocket server), plus a static build and a Pages workflow in the starter. This is the largest
  new piece of infrastructure in v2.

## Stretch (not required, portfolio only)

Stretch earns **no extra credit**: it's for the portfolio. Each gets a short page in `docs/stretch/` pointing at the code and tests that already exist:

- **Persistence:** save/restore with all-or-nothing `snapshot.check` (today's week 7:
  `memory-snapshot`/`-restore`, `core-snapshot`/`-restore`, `scheduler-snapshot`/`-restore`,
  `<kind>-snapshot`/`-restore`; `persistence.test.ts`, `peripheral-snapshot.test.ts`).
- **More peripherals:** sensor, proximity, potentiometer (with ISRs), seven-segment, screen
  (today's week 6 and week 8 tests).
- **Diagrams from code:** `fsm-mermaid` and `npm run fsm:export`.
- **The bus up close:** watchdog, arbitration, the class bus with `hello`.
- **Deeper modules (new, design-only to start):** paging and swap, caches, a tiny RTOS kernel
  with semaphores and priority inversion, DMA.

## What moves, merges or becomes stretch

| Today (`netsim`) | v2 | Note |
|---|---|---|
| Wk 1 `setup-*` regions, `tests/week-01/` | Mon 1 | unchanged |
| Wk 2 `handshake`, `handle-tick`, `parse-message`, `client-request`, `memory-read`/`-write`/`-handler` | Mon 3 build | |
| Wk 2 `is-mem-read` | stretch | the schema lesson stays in `parse-message` |
| Wk 2 `hello-script` | stretch | the class-bus join is optional |
| Wk 2 `logger` (infrastructure) | infrastructure | `LOG=1` from Mon 3 on |
| Wk 3 `decode`, `encode`, `fetch` … `execute-rest` | Mon 5 build | |
| Wk 4 `cpu-send-effects`, `cpu-latch-reply` | Mon 5 build | |
| Wk 4 `tick-barrier` | Mon 3 build | it's about memory replies, which exist from Mon 3 |
| Wk 4 `pick-next`, `switch-out` | Mon 5 build | needed to run two programs at all |
| Wk 4 `should-preempt` | Mon 7 build | round robin proper |
| Wk 4 reading `arbitrate()` | stretch | |
| Wk 5 `button-view`, `led-tick`, `led-view` | infrastructure | LED and Button ship complete |
| Wk 5 `core-node`, `memory-node`, `led-node` (React Flow) | retired | the agent builds the board instead |
| Wk 6 `irq-*`, `can-take-interrupt`, `enter-interrupt`, `iret` | Mon 7 build | |
| Wk 6 `timer-input`, `timer-tick` | Mon 7 build | the periodic interrupt source |
| Wk 6 sensor / proximity / potentiometer regions, `isr-<kind>` | stretch | |
| Wk 6 `watchdog` | stretch | stays stubbed as "never stall" |
| Wk 7 all snapshot/restore regions | stretch | |
| Wk 7 `fsm-mermaid` | stretch | |
| Wk 8 seven-segment, screen tests | stretch | |
| `tests/week-NN/` folders | renumbered to the build week that unlocks them | design weeks get a notes test each |

**New pieces for CORE/DASHBOARD:**
1. Design-note regions in `docs/notes/week-02.md`, `week-04.md` and `week-06.md`. These are like
   week 1's: headings ship, the student fills them in, and a small test checks each section is
   really filled in and the sketch file exists.
2. Configurable cores (1–8) and a multi-core test.
3. The in-browser bus for GitHub Pages, and a Pages workflow in the starter.
4. The **board kit** (VIZ, netsim-studio PR #12; see "The board kit" above): the data feed and
   parts library, `board/student/` with the week-3/5/7 regions, and the behaviour checks. The full
   reference board with guided lessons, explain mode and glossary stays instructor-only.
5. Moving tests into the new week folders, and renaming the generator's week mapping.

## Decisions

Praise's answers to the plan's open questions (2026-10-04):

1. **A design session with nothing to run is fine:** week 1's setup and live demo already show
   the machine.
2. **The board:** students start from a stripped-down board kit (see "The board kit").
3. **Stretch:** portfolio only, no extra credit (the old 10% stretch bonus is gone).
4. **The demo video:** captured live during the in-class demo, not a separate take-home video.
5. **Codex in build weeks:** the studio's **Ask Codex panel** is the default (you write your
   approach first; Codex edits only your snippet, applied when you confirm), plus a **Codex
   terminal tab** for students who want plain Codex.
6. **Commits in build weeks:** commit each time a task's checks go green (`week N: <task>`), and
   push at the end of the session.

## Repository model

> Carried over from the v1 plan; the week-specific examples still use v1 week numbers until the
> regions are regrouped.

- **`netsim`** (instructor repo) is the complete reference solution. Every piece of code a
  student will write is wrapped in an `@student` region. (`main` still holds the old,
  pre-course code as a fallback; nothing below uses it.)
- **`scripts/make-week-branches.ts`** generates `week-1-start` … `week-8-start` from `netsim`
  and pushes them to a separate public **starter repo**. Students fork the starter repo, never
  the instructor repo, so solutions are not one `git checkout` away. The starter repo has only
  the week branches.
- In their fork, students make one working branch, `git switch -c work upstream/week-1-start`,
  and do all their work there. Each week they run
  `git fetch upstream && git merge upstream/week-N-start` on `work`. That merge only adds that
  week's tests, docs and scaffolding, so it never conflicts with code they wrote (see "Why
  merges don't conflict" below).
- Optional, at Praise's choice: after a week's deadline, publish `week-N-solution` so a
  student who fell behind can run `npm run course:catch-up -- 3` to replace their week-3 regions
  with the reference and keep going.

### The `@student` marker

```ts
export function decode(bytes: Bytes4): DecodeResult {
  // @student week=3 part=class id=decode "Turn 4 bytes into an Instruction"
  const [op, a, b, c] = bytes;
  switch (op) {
    ...
  }
  // @end
}
```

- `week` – the week that unlocks the region (1–8).
- `part` – `class` (built together in the session) or `home` (take-home).
- `id` – short unique name, used in the stub message and the catch-up script.
- The quoted text becomes the TODO the student sees.
- A region is always a **whole function body** (or a whole `case` block), so the stub is valid
  TypeScript on its own.

In a generated branch the markers stay (they show students exactly where to write, and let
`course:catch-up` find the region later) and the body becomes a stub:

```ts
export function decode(bytes: Bytes4): DecodeResult {
  // @student week=3 part=class id=decode "Turn 4 bytes into an Instruction"
  // TODO(week 3, decode): Turn 4 bytes into an Instruction
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: decode", bytes);
  // @end
}
```

`todo(label, ...args): never` lives in `core/todo.ts`. It throws a clear error, and passing the
parameters to it keeps strict TypeScript and the "unused variable" lint rule happy without any
`eslint-disable`. The generator finds the parameter names with the TypeScript compiler and adds
the `todo` import when a file needs it.

A region that earlier weeks' code runs through, or that isn't a whole function body, gives its
own stub with `@stub` lines. For example, the week-1 handshake parses messages before week 2
teaches validation, so `parseMessage` ships as a trusting cast:

```ts
// @student week=2 part=home id=parse-message "Parse JSON, then validate it with messageSchema"
// @stub // Until week 2 this trusts whatever arrives. Week 2 replaces the cast with real validation.
// @stub return { ok: true, message: JSON.parse(raw) as Message };
...solution...
// @end
```

### How the generator works

`npm run weeks -- [--from <ref>] [--week N] [--solution N] [--verify [--typecheck]] [--push <remote>]`

1. Read every tracked `.ts`, `.tsx`, `.asm` and `docs/notes/*.md` file on `netsim` (or `--from <ref>`; `--verify`
   checks `HEAD`, the code you have checked out) and find the `@student … @end`
   regions. Fail loudly on a missing `@end`, a nested region, or a duplicate `id`.
2. Build **one stubbed tree**: every region, of every week, replaced by its stub. Infrastructure
   (bus server, client shell, dashboard, test helpers) is never stubbed, so it is there from
   week 1.
3. Commit a linear chain with git plumbing (your working tree is never touched):
   - `week-1-start` = stubbed tree + `tests/week-01/` + `docs/weeks/week-01.md` + `course.json { "week": 1 }`
   - `week-N-start` = `week-(N-1)-start` + `tests/week-NN/` + `docs/weeks/week-NN.md` + `course.json { "week": N }`

   Other fields in `course.json` (such as `peripheral`, the student's week-6 choice) are kept.

   Every branch also gets an `AGENTS.md` (from `course/AGENTS.student.md`), which Codex reads:
   before writing code it asks how the student wants to approach it (or offers two options),
   follows the student's design, explains what it wrote, and never edits tests to make them
   pass. Instructor-only files never ship:
   `course/`, `.github/`, the generator itself, and the studio's own tests and tools
   (`tests/studio/`, `scripts/studio/`).
4. `vitest.config.ts` reads `course.json` and only includes `tests/week-01` … `tests/week-NN`,
   plus `tests/studio/` (which only exists on `netsim`). On `netsim`, `course.json` says 8, so
   everything runs.
5. `--verify` checks every week N in a temporary copy, twice:
   - weeks `< N` filled in, week N stubbed: **no test outside week N fails**, and some week-N
     test does fail (so every week with regions is actually gated);
   - weeks `≤ N` filled in: **every test passes**. This catches earlier-week code that depends
     on a later week's stub.

   With `--typecheck` it also runs `tsc` on every tree. CI runs `--verify --typecheck` on every
   PR.
6. `--solution N` also builds `week-N-solution` (weeks `≤ N` filled in, on top of
   `week-N-start`). Students who fell behind run `npm run course:catch-up -- N`, which copies
   only that week's regions from it into their own files.
7. `--week N` rebuilds weeks N–8 after a fix on `netsim` mid-course. Each branch that already
   exists only moves forward: the new `week-N-start` commit sits on top of the existing
   `week-N-start` (and, from week N+1 on, also on the rebuilt previous week), and a week whose
   content didn't change is left alone. So the push is a fast-forward and students get the fix
   as an ordinary merge.
8. `--push <remote>` pushes every branch the run covered that the remote doesn't already have at
   the same commit, and says `nothing to push` when it is up to date. It never force-pushes.

Generate once at the start of a course run, check the branches, then push them to the
**starter** repo yourself: `npm run weeks -- --push <starter-remote>`.

**Why merges don't conflict:** all stubs already exist in `week-1-start`. Going from week N to
N+1 only adds new files and changes the one line in `course.json`, and students never edit
those, so `git merge upstream/week-(N+1)-start` is always clean. The code a student wrote in
week 3 is the code their week-4 CPU runs on. That is the point of the course: by week 8 the
simulated computer on screen is *theirs*.

**Consequence:** in early weeks, parts of the system that depend on later weeks throw `todo`
errors if you start them. `npm run dev:all` becomes useful from week 4; weeks 1–3 run single
components and tests. Each week's doc says exactly which commands work.

## Tests: Vitest

The current `scripts/test-*.ts` files print ✅/❌ and set an exit code. They are replaced by
Vitest because it gives students watch mode, readable diffs and one command to run, and because
per-week folders are how branches are gated.

- `tests/week-NN/*.test.ts`, one folder per week. Tests import from `core/`, `protocol/`,
  `components/` and `bus/`. A week's folder holds only tests that gate student work (plus
  week 1's `doctor.test.ts`, a pure check of the doctor students run).
- `tests/studio/*.test.ts`: the studio and `setup.mjs` themselves (the command line, the local
  server, the 15 setup steps, "Get this week's work", the machine replay). Instructor-only: never
  in a week branch, not part of `--verify`'s per-week results; CI runs them on `netsim`.
- Pure logic is tested directly: no sockets, no timers.
- Integration tests call `startBus({ port: 0 })` and the component `start…` functions in the same
  process, drive ticks with `control step`, and close everything in `afterEach`. No test depends
  on wall-clock time.
- `tests/helpers.ts`:
  - `runProgram(bytes | asmSource, { ticks, memory, origin })` runs one core against in-process
    memory, with no bus, and returns `{ core, memory, ticks, trace }`. `trace` is the core's phase
    after every tick. It accepts raw bytes so week 3's in-class tests work before `encode` exists.
  - `testBus()`, `testClient(bus, …)`, and `recorder(bus)`: a dashboard whose `rec.messages` holds
    every message, and whose `rec.step()` / `rec.steps(n)` advance the clock and wait until the
    whole tick has arrived. Everything they start is closed after each test.
- `vitest.config.ts` includes weeks `1..course.json.week` and uses the `@/` path alias.

## How to check the setup works

1. On `netsim`: `npx vitest run` passes (all 8 weeks).
2. `npx tsx scripts/make-week-branches.ts --verify` passes: on each `week-N-start` with earlier
   weeks filled in, only week N's tests fail.
3. `npm run dev:all`, open http://localhost:3005, press **Load demo** and **Start**: the two demo
   programs share the two cores, the button's interrupt increments its counter, and the LED
   blinks.
