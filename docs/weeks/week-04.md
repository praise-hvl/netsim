# Week 4 · DESIGN + BUILD: The CPU

**This class moved into week 5.** We do the design and `decode()` together with the build, in one
class: go to Week 5's page for the class and the take-home. This page stays as reference, and
`decode` and `encode` keep their cards in this week's Code tab.

Your bus and memory work. Today you design the part that uses them: a **CPU core** that fetches an
instruction from memory, decodes it, and executes it, one clock tick at a time. The first half
of class is the design; in the second half you build the core's first piece, `decode()`, which
turns 4 bytes into an instruction. Next week you build the rest: a CPU that runs real programs, on
screen.

## Goals

- **Hardware idea:** **fetch–decode–execute**. A **program counter** (PC) says where the next
  instruction is; **registers** (`R0`–`R3`, one byte each) hold the values being worked on;
  **flags** (`zero`, `carry`) remember facts about the last result. Every instruction is exactly
  **4 bytes** with an agreed **encoding**. Memory has **latency**: a fetch costs a tick of waiting,
  so a `LOAD` takes one tick more than an `ADD`.
- **OS idea:** the core is a **finite state machine** that only changes on the clock edge. Replies
  that arrive during a tick are **latched** and used on the next one, like a flip-flop.
- **Design idea:** a state machine is easiest to design as a **table** (from, event, to, what it
  does), and easiest to explain as a **storyboard** (what you'd see on each tick).
- **Software idea:** decoding is a pure function: bytes in, an instruction (or an error) out. Every
  way the input can be wrong is an answer, never a crash.

## In class (1 hour, on Zoom)

Class is on Zoom, camera on. You work **on your own** all hour, and we all stay in the one call.
Keep Zoom's **chat** open: I post the time for each block there.

- **Stuck?** Raise your Zoom hand or send me a private message. I'll answer with a question.
- **Sharing:** at the end of each block I ask two or three of you to share your screen for a
  minute or two. While someone shares, answer in the chat: what did you write differently?

The hour has two halves. **Design (30 min):** the parts of the note next week's build needs.
**Build (30 min):** your first piece of the CPU, `decode()`, coded together.

Fill in your own design note: `docs/notes/week-04.md` (the app shows it on Week 4's **Design note**
tab), with the nine headings from [the design-note template](../notes/design-note-template.md). If
it isn't there, copy the template to that path.

**Short on time, or stuck?** Use this starting design and build on it (change anything you like):

<details><summary>Starting design for the core</summary>

Section 4, the core's states:

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

Section 9, agent brief: "Draw each core as a card with four lights (fetch, decode, execute, idle);
light the one for its state; show its program's name and PC; a waiting core is dimmed."
</details>

### Design (30 min)

1. **Open the app (3 min).** In your course folder, run `npm start`: it gets week 4 ready, then
   shows this page and your design note. If the app won't start: `git fetch upstream && git merge
   upstream/week-4`, then `npm install`.

2. **The tick table (8 min).** I share this program, its bytes and the instruction table. Make your
   own table (columns: tick, state, PC, IR, R0, what travels the bus) and fill it in, one row per
   tick:

   ```asm
   LOAD  R0, 0x020    ; memory 0x020 holds 21
   ADD   R0, R0
   HALT
   ```

   The rules: the core only acts on a tick; to get bytes it sends the bus a request and waits; the
   bytes it gets during a tick are used on the **next** tick. Then in the chat: why does `LOAD`
   take one tick more than `ADD`?

3. **The core's state machine (12 min).** Fill in section 4 as a table (from, event, condition, to,
   what it does), starting from your tick table. Include what happens when the bytes **haven't
   arrived yet**, when the instruction is **invalid**, and when memory answers with a **fault**.
   Compare with the starting design above when I share it.

4. **Instructions as bytes (5 min).** In section 3, encode by hand, 4 bytes each, from the
   instruction table: `LOADI R0, 9`, `STORE R0, 0x3F2` and `JNZ 0x008`. The address goes in bytes
   3 and 4, high byte first. You've just done by hand what `decode()` does in reverse.

5. **The agent brief, in two lines (2 min).** At the top of section 9: what each core should look
   like on next week's board, and what a waiting core looks like.

### Build (30 min)

6. **`decode()` (with the agent, in week 5's class).** In `core/isa.ts`, `TODO(week 4, decode)` inside
   `decode(bytes)`. Run the tests first and watch them fail:

   ```bash
   npx vitest tests/week-04
   ```

   ✅ The `decode` tests fail with errors that start `week 4:`. Then, together:
   - Split the 4 bytes: `const [opcode, a, b, c] = bytes;` and the address `(b << 8) | c`.
   - A `switch` on the opcode (`OPCODES` at the top of the file), one `case` per instruction,
     returning `{ ok: true, instruction: { op, ... } }`.
   - Every way it can be wrong is an answer, not a crash: an unknown opcode, a register outside
     R0-R3, an address outside memory each return `{ ok: false, error }`. That's the FAULT row of
     your section 4.

   With the agent (Week 5's page has how), say your approach first, then this:

   ```text
   My approach: (your words: how you split the 4 bytes, and what counts as wrong)

   In core/isa.ts only, fill in TODO(week 4, decode) in decode(bytes). Don't change anything
   outside that region, or any test. Tell me what you'll change before you change it, and explain
   each line you write. Then run: npx vitest run tests/week-04/isa.test.ts -t "^decode "
   ```

   ✅ The `decode` tests in `tests/week-04/isa.test.ts` pass. Commit: `week 4: decode`.

7. **Push (3 min).** `git push`. What's left goes home.

## Take-home

Due before next session.

1. **`encode()`**, the opposite of `decode()`: `TODO(week 4, encode)` in `core/isa.ts`. It turns an
   instruction back into its 4 bytes; the assembler (`npm run asm`) uses it. ✅ The `encode` tests
   in `tests/week-04/isa.test.ts` pass, including "is the exact opposite of decode". Commit:
   `week 4: encode`.
2. **Finish your design note** in `docs/notes/week-04.md`, all nine sections. In particular:
   - **Section 5, the count-down traced:** the first 10 ticks of the count-down program
     (`programs/countdown.asm`): for each tick, the core's state, the PC, `R0`, and what the board
     shows. Check your bytes with `npm run asm -- programs/countdown.asm` once `encode()` works.
   - **Section 7, decisions:** at least two, with the option you didn't pick (how the board shows
     a **waiting** core; bytes, text or both for the current instruction).
   - **Section 9, agent brief:** what your agent builds next week in `board/student/core.tsx`:
     `board-cycle-step` (each core state to fetch, decode, execute or idle), `board-draw-core` (one
     core with the current step lit, its program and PC), `board-fetch-address` (this core's
     fetch among the tick's packets).
3. **Your storyboard:** one instruction (`LOAD R0, 0x020`), tick by tick, as your board shows it.
   Commit it as `docs/notes/week-04-board.jpg` (or `.png`) and link it in section 6.
4. **Commit and push** your `work` branch.

### Acceptance criteria

- [ ] `npx vitest run tests/week-04` passes: `decode` and `encode`, and every section of your note
      filled in with the storyboard there.
- [ ] Section 4 is a state table that covers bytes not arrived yet, an invalid instruction, and a
      fault reply.
- [ ] Section 3 has your three hand-encoded instructions, 4 bytes each.
- [ ] Section 5 traces the count-down's first 10 ticks, and says why `LOAD` takes a tick more than
      `ADD`.
- [ ] One commit per task (`week 4: …`), and `work` is pushed to your fork.

## Using Codex this week

The design is yours: Codex shouldn't write your note. Codex is good to argue with, and can write
`decode()` and `encode()` once you've said your approach:

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "Here's my state table. Which case did I miss?" | Every row of your state table |
| "How does a real CPU's fetch–decode–execute cycle work?" | Why the core waits in `WAIT_FETCH` |
| "Quiz me on encoding `JNZ 0x008`." | The 4 bytes of each instruction you encoded |
| "Critique my storyboard: what would confuse someone seeing it for the first time?" | What the board shows on each tick of a `LOAD`, and why |
| "`encode` is decode backwards: here's my plan. Write it and explain it." | Why `encode(decode(b))` gives back `b` |

## Explain it back

Before next session, explain your design note to me without notes or AI: book a 5-minute slot with
me, or record a 3-minute video (your face and your sketch, no notes) answering the two questions I
post after class. Be ready to:

1. **Walk through your state machine:** why does a waiting state exist at all? What happens if the
   bytes haven't arrived yet?
2. **The 4 bytes of one instruction** you encoded, and the line of your `decode()` that reads each.
3. **Why does `LOAD` take one tick more than `ADD`?**
4. **Walk through your storyboard:** what the board shows during decode, and one decision you made
   about it, with the alternative.

## Stretch

- Design a `CALL`/`RET` pair. What would the core need that it doesn't have yet? (A stack? Where
  does it live?)
- Design how the board shows a **fault** (an invalid instruction, or a fetch that runs off the end
  of memory) so someone watching sees exactly which instruction caused it.
- Read the rest of ARCHITECTURE.md's instruction table. Which instruction lets a program loop?
  Which flag does it read, and who sets it?
