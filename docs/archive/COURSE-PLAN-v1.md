# NetSim Course Plan

Eight weeks, one 1-hour session each. Every week has an **in-class build** (done together, live) and a
**take-home portion** (done alone or in pairs). Students use an AI coding assistant (Codex) that
may write code for them, but **the student guides the design**: they choose the approach and the
structure, and must be able to explain every line. Each week's work is checked in an
**explain-it-back** conversation at the next session, without AI or notes: understanding of the
hardware idea and of the code is what is graded, not only the green tests.

System architecture, protocol, ISA and FSMs: see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Repository model

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

## Which regions belong to which week

Region ids as they appear in the code (`file: id`). `npm run weeks` prints this list from the
code itself, so treat that output as the source of truth.

| Week | In class (`part=class`) | Take-home (`part=home`) |
|---|---|---|
| 1 | – (setup; see week 1) | `docs/notes/week-01.md`: `setup-doctor`, `setup-codex-summary`, `setup-codex-check` |
| 2 | `components/client.ts`: `handshake`, `client-request` | `client.ts`: `handle-tick`; `protocol/messages.ts`: `is-mem-read`, `parse-message` (stubbed as a trusting cast until then); `core/memory.ts`: `memory-read`, `memory-write`; `components/memory.ts`: `memory-handler`; `scripts/hello.ts`: `hello-script` |
| 3 | `core/isa.ts`: `decode`; `core/cpu-core.ts`: `fetch`, `await-instruction`, `decode-step` | `isa.ts`: `encode`; `cpu-core.ts`: `execute-core` (LOAD/ADD/HALT), `await-data`, `execute-rest` (STORE/SUB/LOADI/JMP/JZ/JNZ) |
| 4 | `components/cpu.ts`: `cpu-send-effects`, `cpu-latch-reply`; `bus/server.ts`: `tick-barrier` (stubbed as "tick.done only" until then) | `core/scheduler.ts`: `pick-next`, `should-preempt`, `switch-out`; read `tests/week-04/order.test.ts` and add one assertion |
| 5 | `components/peripherals/button.ts`: `button-view`; `app/_components/nodes/core-card.tsx`: `core-node` | `components/peripherals/led.ts`: `led-tick`, `led-view`; `app/_components/nodes/peripherals/led.tsx`: `led-node`; `app/_components/nodes/memory-access.ts`: `memory-node` |
| 6 | `core/interrupts.ts`: `irq-enqueue`, `irq-take-next`; `cpu-core.ts`: `can-take-interrupt`, `enter-interrupt`, `iret` | `components/peripherals/timer.ts`: `timer-input`, `timer-tick`; `bus/server.ts`: `watchdog` (stubbed as "don't mark stalled" until then); the chosen peripheral and its `programs/isr-<kind>.asm` |
| 7 | `core/memory.ts`: `memory-snapshot`, `memory-restore`; `cpu-core.ts`: `core-snapshot`, `core-restore` | `core/fsm.ts`: `fsm-mermaid`; `core/scheduler.ts`: `scheduler-snapshot`, `scheduler-restore`; the chosen peripheral's `snapshot`/`restore` hooks |
| 8 | – | – (Seven-segment and Screen are the stretch options for the final demo) |

Regions in `.asm` files use `; @student …` / `; @end`, and their default stub is a handler that
only does `IRET`. The student notes in `docs/notes/*.md` (and no other Markdown) use HTML comments,
`<!-- @student … -->` / `<!-- @end -->`; their stub is a `<!-- TODO(week N, id): … -->` comment
under the heading.

The bus routing, the client plumbing, the peripheral shell (`startPeripheral`), the Button apart
from its `button-view` region, the host, the logger, `npm run doctor`, the dashboard apart from
its `*-node` regions, `todo` and the test helpers are infrastructure: never stubbed. The Timer is *not* infrastructure: its
`timer-input` and `timer-tick` regions are part of week 6's take-home.

## Week by week

Each week lists: what gets built, the tests that gate it, and the explain-it-back check. The
explain-it-back is a 5-minute conversation (or a short recorded video) at the start of the next
session. Pass = the student can answer without notes or AI, pointing at their own code.

### Week 1 — Setup & System Roles

**Hardware idea:** the roles of CPU, memory and I/O; what a bus and a clock are for.
**Software idea:** the toolchain (Node, npm, git, VS Code), forks and remotes, and working with an
AI assistant: you decide the design, it can write the code, and you check what it says.

Some students arrive with nothing installed, so this week gets everyone to a working setup. There
is no `@student` code this week.

- **In class:**
  - Accounts: GitHub (with GitHub Education), and ChatGPT with the student offer claimed
    (chatgpt.com/students; Codex credits: chatgpt.com/codex/students). GitHub Copilot Student is
    the fallback.
  - Install Node 22+. Then the guided setup script does the rest, one step at a time:
    - macOS: `curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -o setup.mjs && node setup.mjs`
    - Windows (PowerShell): `irm https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -OutFile setup.mjs; node setup.mjs`
      (untested on a real Windows machine so far)

    It shows a checklist of 15 steps, then for each one: WHY, STATUS, and, if it isn't done, the
    command in grey for the student to type (it runs only when typed correctly; after 3 misses it
    offers to run it). Done steps show ✓ and wait for Enter. The steps: Node 22 or newer; git
    installed; git knows who you are; GitHub CLI (gh); signed in to GitHub (and it's the right
    account); git signs in with that account (`gh auth setup-git`); ChatGPT account and the student
    offer (optional); your fork of the starter repo; your fork on this laptop (clone); upstream
    remote; the work branch, on GitHub (`git push -u origin work`); VS Code with the `code` command
    (optional); Codex CLI, signed in; course dependencies (`npm install`); `npm run doctor`. It's
    safe to rerun (`npm run setup` inside the repo): it re-checks from the top. The Codex VS Code
    extension is installed by hand, from VS Code's Extensions view.
  - The setup ends with `npm run doctor`, which must end with
    `doctor: all 8 checks passed`. Its 8 required checks: Node 22+, git knows who you are, on the
    `work` branch, `upstream` set, origin is your fork (compared by owner/repo, whatever the URL
    form), you can push to your fork (the account git pushes as, via `ssh -T` or `gh`, must own
    the fork), dependencies installed, and the Codex CLI. VS Code's `code` command only warns;
    without a network the push check warns and asks you to run it again.
  - The unplugged system-roles activity: students act out CPU, memory, bus and a button, passing
    paper messages on a clock.
  - Watch Praise's live system on the projected dashboard.
- **Take-home:** finish the setup. Fill in `docs/notes/week-01.md`:
  - `setup-doctor`: paste the `npm run doctor` output.
  - `setup-codex-summary`: ask Codex to explain `bus/server.ts`, close it, and write what the file
    does in your own words (60+ words).
  - `setup-codex-check`: one thing Codex claimed that you checked in the code yourself.

  Commit on `work` and push it to your fork.
- **Tests (`tests/week-01/`):** `setup.test.ts` checks Node 22+ and that the notes are really
  filled in: `doctor: all 8 checks passed` with no failures, 60+ words of summary, and the check
  section. `doctor.test.ts` checks the doctor itself with a pretend laptop (no network needed),
  including the push-as-the-wrong-account case.
- **Explain it back:** Draw the system on paper and name each part's job. What did Codex get right
  about `bus/server.ts`, and how do you know? What are `origin` and `upstream`, and why do you need
  both?

### Week 2 — Connecting & Message Protocols

**Hardware idea:** address bus vs. data bus; byte-addressable memory; bounds and bus faults.
**Software idea:** WebSockets and a handshake; schemas, discriminated unions and validating at the
boundary; request/response correlation.

- **In class:**
  - Build `connect()`'s handshake together: open the socket, send `hello`, wait for `welcome`.
  - Build `client.request()`: send with an `id`, resolve when a message with that `replyTo`
    arrives, reject on `fault`. Reply correlation is this week's core idea.
  - Everyone connects to Praise's live bus and appears on the projected dashboard.
  - From now on, `LOG=1` shows every message on the bus (the logger is already built).
- **Take-home:**
  - `handle-tick`: remember the tick, run the handlers, reply `tick.done`.
  - Write one type guard by hand (`isMemRead`) and feel the pain. Then write `parseMessage` with
    the zod schema, which does the same for every message type.
  - `core/memory.ts`: `read`, and `write` with bounds → `fault`.
  - The Memory shell that answers `mem.read` and `mem.write`.
  - `scripts/hello.ts` (`npm run hello`): join the class bus and print who is there, who comes and
    goes, and every 10th tick.
- **Tests (`tests/week-02/`):**
  - `handshake.test.ts`, `ticks.test.ts`, `hello.test.ts` and `late-join.test.ts` (moved from week
    1).
  - `messages.test.ts`: valid messages parse; wrong types, missing fields and unknown `type` are
    rejected with a useful error.
  - `memory.test.ts` (pure), `memory-over-bus.test.ts`, `memory-status.test.ts`,
    `who-may-send.test.ts` and `logger.test.ts`.
- **Explain it back:** Show a message your validator rejects and why letting it through would
  break something later. How does a reply find its way back to the right request? What happens if
  your client never sends `tick.done`? Why is the address 16 bits when memory is only 1 KB?

### Week 3 — Component FSM Logic

**Hardware idea:** fetch–decode–execute; registers, program counter, flags; instruction encoding.
**Software idea:** finite state machines; pure functions; `(state, event) → { state, effects }`.

- **In class:** decode 4 bytes into an `Instruction`. Build the first steps of the core FSM,
  `FETCH` → `WAIT_FETCH` → `DECODE`, testing each transition with a fake memory (no network yet).
- **Take-home:** `EXECUTE` and `WAIT_DATA`: `LOAD`, `ADD` and `HALT` first (`execute-core`,
  `await-data`), then `SUB`, `JMP`, `LOADI`, `JZ`, `JNZ` and `STORE` with correct flags
  (`execute-rest`); `encode` so the assembler works. Run a 3-instruction program step by step in
  a test and read the trace. Hand-assemble the count-down program on paper, then check it with
  `asm`.
- **Tests:** `isa.test.ts`, `cpu-core.test.ts` (each transition in the table; illegal transition
  throws; count-down program ends with the right memory and flags).
- **Explain it back:** Walk through the 4 bytes of `JNZ 0x010` and what the core does with them,
  tick by tick. Why does `LOAD` take one more tick than `ADD`? What flag does `JNZ` read and who
  set it?

### Week 4 — System Integration

**Hardware idea:** a shared bus, clock edges and latching; bus arbitration; multi-core; context
switching.
**Software idea:** effects to messages; deterministic concurrency; ordering guarantees.

- **In class:** the CPU shell (effects become `mem.*` requests, replies become events latched for
  the next tick). Add the bus's tick barrier. Run CPU + Memory over the bus; watch the count-down
  program finish; then remove the barrier and watch it become flaky, then put it back. Read
  `arbitrate()` together: why the bus holds a tick's memory requests and sorts them by sender.
- **Take-home:** round-robin scheduler across two cores (quantum = 4 instructions, switch only
  between instructions). Read `tests/week-04/order.test.ts` (it ships complete), explain each
  ordering rule it checks, and add one assertion of your own.
- **Tests:** `scheduler.test.ts` (pure: 3 programs on 2 cores rotate fairly; halted programs
  leave), `integration.test.ts` (bus + CPU + Memory in-process, two programs, final memory is
  correct and identical across 5 runs), `order.test.ts`, `same-tick.test.ts` (a read and a
  write of one address in the same tick give the same answer in any arrival order), and
  `reset.test.ts`.
- **Explain it back:** Why are messages latched instead of acted on immediately? What goes wrong
  without the barrier (show it)? A sensor and a core touch the same address in one tick: who
  goes first, and why does it have to be the same every time? What exactly is saved in a context
  switch, and why can't you switch in the middle of `WAIT_DATA`?

### Week 5 — React Flow Visualization

**Hardware idea:** input vs. output devices; memory-mapped I/O.
**Software idea:** observers; emitting UI metadata; React Flow custom nodes; derived state.

- **In class:** the Button (reference peripheral) end to end: FSM, `view()`, `status`
  messages, its dashboard node, and the edge flash when its `irq` goes past. Build the CPU core
  node (state, PC, registers, current instruction) together.
- **Take-home:** the LED peripheral: FSM (`OFF`/`ON` from its register), `view`, dashboard node,
  a program that blinks it. Improve the Memory node to highlight the last read/write.
- **Tests:** `button.test.ts`, `led.test.ts` (pure FSMs); `status.test.ts` (the Button's, LED's,
  Timer's, seven-segment's and Screen's `view` output is a valid `status` payload, and the CPU's
  view matches what the CPU node reads); `button-over-bus.test.ts`, `host.test.ts`,
  `config-fields.test.ts` and the `dashboard-*.test.ts` files.
- **Explain it back:** Trace what happens, message by message, from clicking the LED program's
  "run" to the LED lighting up. How does the dashboard know where to draw your node? Why doesn't
  the dashboard ask components for their state?

### Week 6 — Timing & Interrupt Simulation

**Hardware idea:** interrupts, interrupt vectors and priority, ISRs, `IRET`; timers; faults and
watchdogs.
**Software idea:** priority queues; saving and restoring context; timeouts.

- **In class:** the interrupt queue; core interrupt entry at instruction boundaries and `IRET`.
- **Take-home:** the Timer peripheral (`timer-input`, `timer-tick`); watch a timer ISR increment
  its counter on the dashboard while two programs run. Then pick one of Sensor, Proximity or
  Potentiometer: FSM, register writes, IRQ rule, and its ISR in `programs/`. Add the bus
  watchdog: a component that misses `tickTimeoutMs` is reported `stalled`. See it with
  `npm run stall-demo`, a peripheral that joins and never answers a tick (stopping a component
  with Ctrl-C closes its connection instead, so the bus reports `left`, not `stalled`).
  Demonstrate a fault on the dashboard with `JMP 0x3FE`: the next fetch would run off the end of
  memory, so the core goes to `FAULT` and only that program fails. (An address outside memory
  can't even be assembled or decoded; Memory's own out-of-range fault only answers requests from
  other components, which `tests/week-02/memory-over-bus.test.ts` shows.)
- **Tests:** `interrupts.test.ts`, `cpu-core-irq.test.ts` (taken only between instructions;
  registers identical after `IRET`), `timer.test.ts`, one test file per optional peripheral
  (only the one the student chose, set as `peripheral` in `course.json`, needs to pass),
  `status.test.ts` (that peripheral's view is a valid `status` payload), and `watchdog.test.ts`
  (including `npm run stall-demo`).
- **Explain it back:** Press the button while a program is mid-`LOAD`: what happens and when?
  Why is the Timer's interrupt lower priority than the Button's? What would break if `IRET`
  forgot to restore the flags?

### Week 7 — Polish & Documentation

**Hardware idea:** state is just bytes; what "saving the machine" means (snapshots,
hibernation).
**Software idea:** serialization, versioned formats, schema validation on load; documentation as
code (diagrams from transition tables).

- **In class:** `snapshot`/`restore` for memory and the core; save mid-run, restart everything,
  restore, and finish the program with the same result.
- **Take-home:** `fsm-mermaid`, so `npm run fsm:export` turns transition tables into mermaid
  diagrams; `snapshot`/`restore` for the scheduler and your week-6 peripheral; clean-up pass
  (names, dead code, small functions); README section for your peripheral with its exported FSM
  diagram; a one-page reflection (what surprised you, one bug you fixed and how you found it).
- **Tests:** `persistence.test.ts` (round trip of every component; saving and restoring halfway
  through gives the same final memory as an uninterrupted run; a corrupt save file is rejected).
- **Explain it back:** What is in a save file and what isn't (and why the dashboard isn't in it)?
  Why does the file have a `version`?

### Week 8 — Final Demo & Reflection

- **Demo (5–7 min each):** run the whole system from a fresh clone of your fork; run a program of
  your own that loops and uses at least one input and one output peripheral; trigger an interrupt
  live; save and restore. Stretch: add the Seven-segment display or the Screen, or a new
  peripheral of your own design.
- **Final explain-it-back (graded):** Praise picks one moment in the live trace and the
  student explains every message around it, at both levels: what the "hardware" is doing and
  which function in their code did it.
- **Reflection:** submitted as `docs/REFLECTION.md` in the fork.

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

## What is deleted or merged, and why

| Current | Becomes | Why |
|---|---|---|
| `services/cpu/CPU.service.ts` (409 lines) | `components/cpu.ts` (shell) + `core/cpu-core.ts` | Separate logic from plumbing; the CPU is now a bus client |
| `services/cpu/Core.service.ts` | `core/cpu-core.ts` | Rewritten as an explicit FSM that waits for memory; callbacks replaced by `status` messages |
| `services/cpu/InstructionDecoder.service.ts` | `core/isa.ts` (+ `encode`) and `core/asm.ts` | One file per idea; programs written as text, not byte arrays |
| `services/cpu/Scheduler.service.ts` (537 lines, 3 algorithms) | `core/scheduler.ts` (round robin only) | Scope decision: one algorithm, taught well |
| `services/cpu/InterruptController.service.ts` | `core/interrupts.ts` | Listener system dropped; it's a small sorted queue |
| `services/Memory.service.ts` | `core/memory.ts` + `components/memory.ts` | Access log and listeners dropped: the bus tap already shows every access |
| `services/PeripheralManager.service.ts` | deleted | Peripherals are separate bus clients now; the bus is the registry |
| `services/Persistence.service.ts`, `types/persistence.types.ts` | `bus/saves.ts` + per-module `snapshot/restore` | Each component owns its own state format |
| `types/*.types.ts` | `protocol/messages.ts` + types next to their code | Wire types are derived from zod schemas |
| `server/ws.ts` (one big `switch`, CPU inside the server) | `bus/server.ts` | The server only routes and keeps time |
| ISR byte arrays generated in `server/ws.ts` | `programs/isr-counter.asm` | Readable assembly |
| `peripherals/*.peripheral.ts`, `peripherals/registry.ts` | `components/peripherals/*.ts`, `index.ts` | Same eight devices, each a small FSM using one contract |
| `app/_modules/SimulationProvider.module.tsx` | `app/_lib/bus-connection.ts` + a smaller provider | Uses the shared message types instead of `Record<string, unknown>` |
| `app/visualizer/_components/AddPeripheralPanel.component.tsx` | deleted | Unused duplicate |
| `*.service.ts`, `*.component.tsx`, `*.module.tsx`, `SevenSegmenetDisplay` | plain file names | Easier to guess; fixes the typo |
| `scripts/test-*.ts` | `tests/week-NN/*.test.ts` | Vitest |
| `plans/`, `Initial plan.md`, `notes/`, folder `README.md`s | deleted (kept in git history) | Old AI prompt plans and notes would confuse students; `docs/` replaces them |
| Big `/** @module */` JSDoc banners and `// ─── Section ───` rulers | short comments only where the *why* isn't obvious | Less to scroll past; the code should read on its own |

## How to check the setup works

1. On `netsim`: `npx vitest run` passes (all 8 weeks).
2. `npx tsx scripts/make-week-branches.ts --verify` passes: on each `week-N-start` with earlier
   weeks filled in, only week N's tests fail.
3. `npm run dev:all`, open http://localhost:3005, press **Load demo** and **Start**: the two demo
   programs share the two cores, the button's interrupt increments its counter, and the LED
   blinks.
