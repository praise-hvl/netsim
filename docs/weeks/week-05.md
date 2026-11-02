# Week 5 · DESIGN + BUILD: A CPU that runs programs

Today is one class made of two weeks: week 4's design, then the build. You design the CPU core
quickly, then you start talking to the agent in the app and build it. You guide the design, Codex
may write the code, and you have to be able to explain every line it keeps. By the end of the
take-home, the count-down and blink programs run on your board, with each core's fetch, decode and
execute lighting up as it happens.

Week 4's page stays in the app as reference, but you don't need to have done it: everything from
week 4 that matters is on this page.

## Goals

- **Hardware idea:** the **fetch–decode–execute** cycle. A **program counter** (PC) says where
  the next instruction is; **registers** hold the values being worked on; **flags** remember facts
  about the last result (was it zero? did it overflow?). Instructions are 4 bytes with an agreed
  **encoding**. Memory is slow: a `LOAD` takes a tick more than an `ADD`.
- **Design idea:** a state machine is easiest to design as a **table** (from, event, to, what it
  does).
- **Software idea:** a **finite state machine** written as a **pure function**:
  `stepCore(core, reply)` returns the new core and the *effects* it wants (a memory read or
  write); a thin **shell** turns effects into bus messages and **latches** replies until the next
  tick.
- **Working with an agent:** you say your approach first, you read every change, and the tests
  decide when a task is done.

## In class (1 hour, on Zoom)

Class is on Zoom, camera on, and you work **on your own** in your own repo. Stuck? Raise your Zoom
hand or send me a private message with the first line of the failing test.

| Time | What |
|---|---|
| 3 min | Open the app |
| 15 min | Design: tick table, state table, agent brief |
| 5 min | Watch me work with the agent |
| 35 min | Build with the agent, on your own, as far as you get |
| 2 min | Push |

### Design (15 min)

1. **Open the app (3 min).** In your course folder, run `npm start`. The app gets week 5 ready
   (saves your work, brings the week in, installs, checks), then shows this page. If the app won't start, the same by hand:

   ```bash
   git fetch upstream && git merge upstream/week-5
   npm install
   ```

   Then open your design note, `docs/notes/week-04.md`: it's on Week 5's **Design note** tab. You'll
   write in it today, and you can write the tick table on paper.

2. **The tick table (5 min, together).** I share this program and its bytes, and we fill in one row
   per tick (columns: tick, state, PC, IR, R0, what travels the bus):

   ```asm
   LOAD  R0, 0x020    ; memory 0x020 holds 21
   ADD   R0, R0
   HALT
   ```

   The rules: the core only acts on a tick; to get bytes it sends the bus a request and waits; the
   bytes it gets during a tick are used on the **next** tick. In the chat: why does `LOAD` take one
   tick more than `ADD`?

3. **The core's state table (8 min).** Fill in section 4 of your note as a table (from, event,
   condition, to, what it does), starting from your tick table. It must cover three cases: the
   bytes **haven't arrived yet**, the instruction is **invalid**, and memory answers with a
   **fault**. Short on time? Start from this and change anything you like:

   <details><summary>Starting design for the core</summary>

   | From | Event (on a tick) | Condition | To | What it does |
   |---|---|---|---|---|
   | IDLE | tick | a program is assigned | FETCH | loads the program's PC |
   | FETCH | tick | | WAIT_FETCH | sends `mem.read` for the 4 bytes at PC |
   | WAIT_FETCH | tick | no bytes yet | WAIT_FETCH | stalls |
   | WAIT_FETCH | tick | the bytes arrived | DECODE | puts them in the instruction register |
   | WAIT_FETCH or WAIT_DATA | tick | a `fault` arrived | FAULT | stops, shows why |
   | DECODE | tick | a valid instruction | EXECUTE | |
   | DECODE | tick | an unknown opcode or register | FAULT | stops, shows the bytes |
   | EXECUTE | tick | ALU op or jump | FETCH | changes registers, flags or PC |
   | EXECUTE | tick | LOAD or STORE | WAIT_DATA | sends `mem.read` or `mem.write` |
   | EXECUTE | tick | HALT | HALTED | stops |
   | WAIT_DATA | tick | the reply arrived | FETCH | LOAD: the byte goes in the register |

   </details>

4. **The agent brief, in two lines (2 min).** At the top of section 9: what each core should look
   like on your board, and what a waiting core looks like. That's what you'll tell the agent when
   you reach the board.

### Working with the agent (5 min: watch me first)

In the app, open Week 5's **Agent** tab. I show this once on my screen, then you do it for yourself:

1. Pick the task in the **Working on** list. This week's tasks come first, then earlier weeks'
   (`decode` is listed as `week 4 · decode`).
2. **Say your approach first,** in a sentence or two, in your own words, then add the task's prompt and
   press **Send**. The prompt is on this page, and on the task's card in the Code tab: **Send to the
   agent** puts it in the box for you.
3. **Read the diff.** Edits in your course folder don't ask, so the diff is where you review them.
   Keep only what you can explain. Want something different? Tell it what, and why.
4. **Press Commit it.** When the turn ends, the tab runs the task's tests itself and says, for example,
   `decode: 15 tests pass. encode still to do`, with **Commit it** right there. Read the diff first, then
   press it: one commit per task.

Codex works in a **sandbox**, with the network off and `.git` read-only. Cards only appear for things
outside the sandbox: read the card, then **Approve** or **Decline**.

- If a test needs a local socket, press **Run its tests** when it appears. `listen EPERM` means the
  same thing: that's the sandbox, not your code.
- Other ways to commit: **Save and run its tests** on the task's card in the Code tab, then **Commit
  it**, or a commit in a terminal. If Codex runs `git commit` itself, that asks you too.

**Agent tab missing, or it won't start?** On the task's card in the Code tab, press **Copy the prompt**
(or copy it from this page), run `codex` in a terminal in your course folder, and paste it. Commit from the
Code tab or a terminal. Everything else is the same.

### Build with the agent (35 min, on your own)

Go in this order and get as far as you can. What you don't finish goes home. Codex is quick, about a
minute a task in our rehearsal, so most of your time goes on reading the diff and being sure you can
explain it. Each commit below is what **Commit it** writes for you. At each ✅ I ask two or three of you to share your screen and show **one thing you told the agent to change, and why**.

5. **`decode` (about 10 min).** In `core/isa.ts`, turn 4 bytes into an instruction. Every way the
   input can be wrong is an answer, not a crash: that's the FAULT row of your section 4. Its card
   is in Week 4's **Code** tab; in the Agent tab, pick `week 4 · decode`.

   ```text
   My approach: (your words: how you split the 4 bytes, and what counts as wrong)

   In core/isa.ts only, fill in TODO(week 4, decode) in decode(bytes). Don't change anything
   outside that region, or any test. Tell me what you'll change before you change it, and explain
   each line you write. Then run: npx vitest run tests/week-04/isa.test.ts -t "^decode "
   ```

   ✅ The `decode` tests pass. Commit: `week 4: decode`. **Be able to explain:** which byte is the
   opcode, how two bytes become one address, and why a bad register returns an error instead of
   throwing.

6. **`fetch` (about 4 min).** `TODO(week 5, fetch)` in `core/cpu-core.ts`. Go to `WAIT_FETCH` and
   return the effect `{ kind: "read", address: core.pc, length: 4 }`. You don't read memory: you
   *ask*. (If the PC is so close to the end that 4 bytes don't fit, go to `FAULT` instead.)

   ```text
   My approach: (your words: what the core asks for, and when it can't ask)

   In core/cpu-core.ts only, fill in TODO(week 5, fetch) in fetch. Don't change anything outside
   that region, or any test. Tell me what you'll change before you change it, and explain each line
   you write. Then run: npx vitest run tests/week-05/cpu-core.test.ts -t "FETCH asks memory"
   ```

   ✅ That test passes. Commit: `week 5: fetch`.

7. **`awaitInstruction` (about 4 min).** `TODO(week 5, await-instruction)`. `reply` is whatever
   memory answered since the last tick. `memData`: keep the bytes in `ir` and go to `DECODE`.
   `memFault`: go to `FAULT`. Nothing yet (`null`): stay and count a stall.

   ```text
   My approach: (your words: what happens for bytes, for a fault, and for nothing yet)

   In core/cpu-core.ts only, fill in TODO(week 5, await-instruction) in awaitInstruction. Don't
   change anything outside that region, or any test. Tell me what you'll change before you change
   it, and explain each line you write. Then run:
   npx vitest run tests/week-05/cpu-core.test.ts -t "WAIT_FETCH waits"
   ```

   ✅ That test passes. Commit: `week 5: await-instruction`.

8. **`decodeStep` (about 3 min).** `TODO(week 5, decode-step)`. Call your `decode` on `ir`. Valid:
   keep the instruction and go to `EXECUTE`. Invalid: `FAULT`.

   ```text
   My approach: (your words: what decodeStep does with a good answer and with a bad one)

   In core/cpu-core.ts only, fill in TODO(week 5, decode-step) in decodeStep. Don't change anything
   outside that region, or any test. Tell me what you'll change before you change it, and explain
   each line you write. Then run: npx vitest run tests/week-05/cpu-core.test.ts -t "DECODE turns IR"
   ```

   ✅ That test passes. Commit: `week 5: decode-step`. **Be able to explain:** why the core returns
   a read effect instead of calling memory, why `WAIT_FETCH` exists, and how your code matches your
   state table. Where does your table differ from `coreFsm` at the top of the file?

9. **The CPU shell (about 7 min).** In `components/cpu.ts`, the plumbing between your pure core and
   the bus. No test can check the shell yet: `integration.test.ts` needs your take-home tasks. So
   your check today is reading the diff with your state table beside you.

   - `sendEffects` (`TODO(week 5, cpu-send-effects)`): for each `read` effect, `client.send` a
     `mem.read` to `memory`; for `write`, a `mem.write`. Keep `id → core` in the `waiting` map.

     ```text
     My approach: (your words: what gets sent, and how you'll know later which core asked)

     In components/cpu.ts only, fill in TODO(week 5, cpu-send-effects) in sendEffects. Don't change
     anything outside that region, or any test. Tell me what you'll change before you change it,
     and explain each line you write. Its test, tests/week-05/integration.test.ts, can't pass until
     my take-home tasks are done, so don't try to fix that test's failures now.
     ```

   - `latchReply` (`TODO(week 5, cpu-latch-reply)`): when `mem.data`, `mem.ack`, `fault` or `error`
     comes back, find the core from `replyTo`, turn it into a `MemReply`, and hand it over with
     `receiveReply(cpu, core, reply)`. Don't step the core here: it gets the reply **on the next
     tick**.

     ```text
     My approach: (your words: how you find the core, and why the reply waits for the next tick)

     In components/cpu.ts only, fill in TODO(week 5, cpu-latch-reply) in latchReply. Don't change
     anything outside that region, or any test. Tell me what you'll change before you change it,
     and explain each line you write. Its test, tests/week-05/integration.test.ts, can't pass until
     my take-home tasks are done, so don't try to fix that test's failures now.
     ```

   ✅ You've read both diffs and can explain them. Commit each: `week 5: cpu-send-effects`,
   `week 5: cpu-latch-reply`. **Be able to explain:** why the reply waits for the next tick, and
   what the `waiting` map is for.

10. **Your board: the core lights up (about 7 min).** In the app, open Week 5's **Board** tab and
    press **Start the board** (without the app: `npm run dev:all`, then
    http://localhost:3005/board). Then press **play** (scroll down if you don't see the controls): the board sits at tick 0 until you
    do. It plays a recording of the finished computer, so it runs even before your `execute` exists. The
    core panel stays empty (`You build this in week 5`) until you write `CoreView`. Tell the agent what your two lines in
    section 9 say.

    - `TODO(week 5, board-cycle-step)` in `cycleStep(phase)`: map each core phase (`FETCH`,
      `WAIT_FETCH`, `DECODE`, …) to the step the board lights up (fetch, decode, execute, or idle).

      ```text
      My approach: (your words: which phase lights which step, and why)

      In board/student/core.tsx only, fill in TODO(week 5, board-cycle-step) in cycleStep. Don't
      change anything outside that region, or any test. Tell me what you'll change before you change
      it, and explain each line you write. Then run:
      npx vitest run tests/week-05/board-core.test.ts -t "cycleStep"
      ```

    - `TODO(week 5, board-draw-core)` in `CoreView`: draw one core with its current step lit, its
      program and its PC.

      ```text
      My approach: (your words: the two lines from section 9 of your design note)

      In board/student/core.tsx only, fill in TODO(week 5, board-draw-core) in CoreView. Don't change
      anything outside that region, or any test. Tell me what you'll change before you change it, and
      explain each line you write. No test checks this one: I'll check it on the board.
      ```

    ✅ The `cycleStep` tests pass. Commit: `week 5: board-cycle-step`. Once `CoreView` exists, the panel
    fills and each core's step lights up as the recording plays. Commit: `week 5: board-draw-core`. **Be able to explain:**
    which phase lights which step, and one thing on the board you told the agent to change.

11. **Push (2 min).** Stop wherever you are, even halfway through a task: `git push`.

### What "pure" buys you

```ts
const { core, effects } = stepCore(ready(0x010), null);
expect(core.phase).toBe("WAIT_FETCH");
expect(effects).toEqual([{ kind: "read", address: 0x010, length: 4 }]);
```

No socket, no timers, no waiting. Every row of the transition table is a three-line test. The
CPU shell is what turns that `read` effect into a real `mem.read` on your bus.

## Take-home

Due before next session. It's a lot, so do it in this order: each step is what the next one needs.
The agent can do the writing, the same way as in class: your approach first, one task at a time,
read the diff, press **Commit it**, one commit per task. Your design note stays in your own words, and
explain-it-back has no AI at all.

1. **Finish what class didn't reach,** in the same order as in class.
2. **`encode()`,** the opposite of `decode()`: `TODO(week 4, encode)` in `core/isa.ts` (its card is in
   Week 4's Code tab). The assembler and the programs need it. First do by hand, in section 3 of
   your note, 4 bytes each: `LOADI R0, 9`, `STORE R0, 0x3F2` and `JNZ 0x008`. The address goes in
   bytes 3 and 4, high byte first. ✅ The `encode` tests in `tests/week-04/isa.test.ts` pass. Commit:
   `week 4: encode`.
3. **Finish your design note,** `docs/notes/week-04.md`, all nine sections, and your storyboard:
   - **Section 5, the count-down traced:** the first 10 ticks of `programs/countdown.asm`: for each
     tick, the core's state, the PC, `R0`, and what the board shows. Check your bytes with
     `npm run asm -- programs/countdown.asm`.
   - **Section 7, decisions:** at least two, with the option you didn't pick.
   - **Section 9, agent brief:** what your agent builds in `board/student/core.tsx`.
   - **Storyboard:** one instruction (`LOAD R0, 0x020`), tick by tick, as your board shows it. Commit
     it as `docs/notes/week-04-board.jpg` (or `.png`) and link it in section 6.
4. **`execute` for `LOAD`, `ADD`, `HALT`** (`TODO(week 5, execute-core)`) and **`awaitData`**
   (`TODO(week 5, await-data)`). `ADD` updates the register, the `zero` and `carry` flags, and moves
   the PC on by 4 (the `finish` helper does that and goes back to `FETCH`). `LOAD` returns a 1-byte
   `read` effect and goes to `WAIT_DATA`; there, the `memData` reply sets the register and the `zero`
   flag. `HALT` goes to `HALTED`.
5. **Read a trace.** Run a 3-instruction program through your core with `runProgram` from
   `tests/helpers.ts`, which gives the core memory that answers on the next tick, like the bus will:

   ```ts
   const program = [0x01, 0, 0x00, 0x20,  0x03, 0, 0, 0,  0xff, 0, 0, 0]; // LOAD R0,0x020; ADD R0,R0; HALT
   const { core, trace, ticks } = runProgram(program, { memory: { 0x020: 21 } });
   console.log(ticks, trace, core.registers);
   ```

   `trace` is the phase after every tick. Compare it with your tick table from class. Where did they
   differ, and who was right?
6. **`execute` for `STORE`, `SUB`, `LOADI`, `JMP`, `JZ`, `JNZ`** (`TODO(week 5, execute-rest)`).
   `SUB` wraps below 0 and sets `carry` on a borrow; `ADD`, `SUB` and `LOADI` set `zero`; jumps set
   `PC = addr` when taken and move on by 4 when not; `STORE` returns a `write` effect and waits in
   `WAIT_DATA` for the `memAck`.
7. **Programs onto cores** (`core/scheduler.ts`, the first half of the scheduler):
   - `pickNext` (`TODO(week 5, pick-next)`): the first `READY` process in queue order.
   - `switchOut` (`TODO(week 5, switch-out)`): when a core halts or faults, save its context into
     its process, mark it `DONE` or `FAILED`, and clear the core.

   Programs go to free cores and leave when they halt. Nobody is switched out early yet: taking
   turns (preemption) is week 6. Now `tests/week-05/integration.test.ts` can run your shell for
   real. It opens local sockets, so in the agent it's the `listen EPERM` card from class.
8. **The board** (`board/student/core.tsx`): finish `board-draw-core` if you didn't in class, and
   `board-fetch-address` (`TODO(week 5, board-fetch-address)`: find this core's instruction fetch, a
   4-byte read, among the tick's packets). The LED, the Button and the run controls come finished in
   the kit. Hand the agent section 9 of your note and your storyboard. It works only in the `board-…`
   regions of that file, and you check the scenario in section 5 of your note on the board.

### Acceptance criteria

- [ ] `npx vitest run tests/week-04 tests/week-05` passes, and so does every earlier week
      (`npx vitest run`).
- [ ] Every section of your note is filled in, with the storyboard there. Section 4 covers bytes not
      arrived yet, an invalid instruction, and a fault reply. Section 3 has your three hand-encoded
      instructions.
- [ ] Every row of the CPU core's transition table has a test that passes.
- [ ] The count-down program ends `HALTED` with `R0 = 0`, the `zero` flag set, and memory
      `0x3F2` holding `0`.
- [ ] `core/` still imports nothing from `components/`, `bus/` or `app/`.
- [ ] With `npm run dev:all`, **Load demo** and **Start**, count-down and blink run on two cores,
      animated on `/board`: each core's step lights up, its fetches travel the bus, the LED
      blinks.
- [ ] One commit per task (`week 5: …`, and `week 4: decode`, `week 4: encode`), and `work` is pushed.

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npm start` | the app: this week, its page, the agent, the board and the checks | ✅ |
| `npx vitest tests/week-05` | this week's tests in watch mode | ✅ |
| `npx vitest run` | every week so far, once | ✅ |
| `npm run asm -- <file.asm>` | assemble a program and print its bytes | ✅ after `encode` |
| `npm run component -- cpu` | the CPU on the bus (`CPU_CORES=4` for 4 cores, 1–8) | ✅ after the shell |
| `npm run dev:all` | bus, memory, CPU, devices, and the board at http://localhost:3005/board | ✅ |
| `npm run demo` | load the demo programs and start the clock (`-- --cores 4` for 4 cores) | ✅ after the take-home |

Tests that gate this week:

- `tests/week-04/isa.test.ts`: `decode` and `encode`.
- `tests/week-04/design-note.test.ts`: your note is filled in, with the storyboard there.
- `tests/week-05/asm.test.ts`: the assembler turns text into the right bytes (needs `encode`).
- `tests/week-05/fsm.test.ts`: the `defineFsm` helper your core uses (already passes: read it).
- `tests/week-05/programs.test.ts`: every program in `programs/` assembles.
- `tests/week-05/cpu-core.test.ts`: each transition in the table; an illegal transition throws; the
  count-down program ends with the right registers, flags and memory.
- `tests/week-05/integration.test.ts`: the CPU and Memory over the bus run two programs on two cores
  to the right answer, with the same message trace every run.
- `tests/week-05/board-core.test.ts`: the board's behaviour checks (each phase maps to the right
  step; the core's fetch is found among the tick's packets).

## Explain it back

Before next session, explain your work to me without notes or AI: book a 5-minute slot with me, or
record a 3-minute video (your face and your screen, no notes) answering the two questions I post
after class. Be ready to:

1. **Walk through your state table:** why does a waiting state exist at all? What happens if the
   bytes haven't arrived yet?
2. **Walk one instruction tick by tick,** `JNZ 0x010` (`08 00 00 10`), from `FETCH` to the next
   `FETCH`, pointing at your code *and* at what the board shows on each tick.
3. **Why does `LOAD` take one more tick than `ADD`?**
4. **Why is a reply latched to the next tick** instead of used the moment it arrives? (Think of a flip-flop.)
5. **Show one thing you told the agent to change,** and why.

## Using Codex this week

Codex may write the code; you guide the design. Say your approach first in a sentence or two, name
the one task it may change, and don't keep a line you can't explain. Your design note is yours:
Codex can argue with it, but it shouldn't write it.

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "Here's my state table. Which case did I miss?" | Every row of your state table |
| "My `awaitInstruction`: bytes → DECODE, fault → FAULT, nothing → stay and count a stall. Write it that way and explain it." | What the PC, IR and flags hold at any tick of a trace |
| "`encode` is decode backwards: here's my plan. Write it and explain it." | The 4 bytes of each instruction you encoded |
| "Explain two's complement wrap-around at 8 bits." | Why `carry` is set after `SUB 3, 5` |
| "Here's my storyboard: `FETCH` and `WAIT_FETCH` light *fetch*. Write `board-cycle-step` that way." | Which phase lights which step on your board, and why |
| "This test fails with this error. What's it telling me?" | Every transition your phase functions make |

## Stretch

Stretch is for your portfolio, not extra credit.

- A trace view on the board: for each tick, the phase and `disassemble(core.instruction)` (from
  `core/isa.ts`), so each line shows the instruction as text.
- Diagrams from your code: `fsm-mermaid` and `npm run fsm:export` (see
  [docs/stretch/diagrams.md](../stretch/diagrams.md)).
- Write a program that multiplies R0 by R1 with a loop, and a test for it.
- Design a `CALL`/`RET` pair. What would the core need that it doesn't have yet?
