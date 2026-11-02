# Week 5 · BUILD: A CPU that runs programs

From today you build at home, at your own pace, with your agent. Each step is the same short loop,
and this page has everything you need for it, including what to try when it fails. By the last
step, your board runs real programs on its cores. Today's class gets you set up and does step 1
together.

## In class today (1 hour)

1. **ChatGPT Plus.** That's the plan the course needs: Codex comes with it. The free plan has
   Codex only for quick tasks, which isn't enough to build the computer. OpenAI's page on plans with
   Codex: https://learn.chatgpt.com/docs/pricing. Sign in at chatgpt.com and check your plan first.
2. **Open the app.** In your course folder, run `npm start`. It brings in everything you're missing
   from earlier weeks by itself.
3. **Codex installed and signed in.** In the app, press **Run** on "Install and sign in to Codex",
   then sign in with that ChatGPT account in the browser window it opens. Week 5's **Build** tab says
   when Codex is ready.
4. **Step 1 together,** at the same time, so everyone has done the loop once.

## How each step works

The steps are grouped into components, the parts of your computer. Each one starts with what it is
and what it will do, and ends by showing it working. The Build tab walks you through them in order.

1. Read the idea (2-3 lines).
2. Press **Send to the agent**, then read what it changed in the diff. Keep only what you can
   explain.
3. When the tab says the step's tests pass, press **Commit it**, then **Next step**.
4. Check you can answer the step's **Ask** in your own words: I use those questions in
   explain-it-back.

If a step fails, read its **Stuck?** line first. Push from the app whenever you stop. The Build tab
remembers where you are: open it again and it shows your next step.

## Getting help between classes

Post in the class chat: the step's number, and the first line of the failing test (or what the agent
said). I answer there, and anyone who's past that step can help too. Mondays are check-ins: bring
what's stuck.

Due: every step on this page before the check-in on Monday 9 Nov.

## Component 1 · The instruction decoder
<!-- component id=the-decoder -->

The decoder turns 4 bytes into an instruction the CPU understands, and the encoder turns an instruction back into its 4 bytes. When it's done, the assembler can turn a program you write into bytes.

When it works: the decoder and encoder tests go green, and `npm run asm -- programs/countdown.asm` prints the count-down's bytes.
Check: `npx vitest run tests/week-04/isa.test.ts`

<!-- notes -->
#### Design notes

| Hex | Instruction | Bytes | What it does |
|---|---|---|---|
| `00` | `NOP` | `00 00 00 00` | nothing |
| `01` | `LOAD Rd, addr` | `01 d hi lo` | `Rd = mem[addr]` |
| `02` | `STORE Rs, addr` | `02 s hi lo` | `mem[addr] = Rs` |
| `03` | `ADD Rd, Rs` | `03 d s 00` | `Rd = Rd + Rs` |
| `04` | `SUB Rd, Rs` | `04 d s 00` | `Rd = Rd - Rs` |
| `05` | `JMP addr` | `05 00 hi lo` | `PC = addr` |
| `06` | `LOADI Rd, imm` | `06 d 00 imm` | `Rd = imm` |
| `07` | `JZ addr` | `07 00 hi lo` | if `zero`: `PC = addr` |
| `08` | `JNZ addr` | `08 00 hi lo` | if not `zero`: `PC = addr` |
| `FE` | `IRET` | `FE 00 00 00` | return from a handler |
| `FF` | `HALT` | `FF 00 00 00` | stop |

- An address is `hi << 8 | lo`, high byte first, and must be below `0x400`.
- Registers are `R0`–`R3`. An unknown opcode, a register above 3 or an address out of range is an
  error, not a crash.

| Instruction | Its 4 bytes |
|---|---|
| `LOADI R0, 9` | `06 00 00 09` |
| `STORE R0, 0x3F2` | `02 00 03 F2` |
| `JNZ 0x008` | `08 00 00 08` |
<!-- /notes -->

### Step 1 · Decode an instruction
<!-- step week=4 id=decode -->

An instruction is 4 bytes: the opcode, then `a`, `b` and `c`. An address takes two of them, high
byte first: `(b << 8) | c`. Anything wrong (an unknown opcode, a register above R3, an address
outside memory) is an answer, not a crash.

```text
Use this approach: a switch on the opcode, one case per instruction; in each case check the register
and address are in range, and return { ok: false, error } when they aren't.

In core/isa.ts only, fill in TODO(week 4, decode) in decode(bytes). Don't change anything outside
that region, or any test. Tell me what you'll change before you change it, and explain each line
you write. Then run: npx vitest run tests/week-04/isa.test.ts -t "^decode "
```

Test: `npx vitest run tests/week-04/isa.test.ts -t "^decode "` · Commit: `week 4: decode`
Ask: `0x01, 0x10`: what address is that, and which line of your code makes it?
Stuck? If addresses come out 256 times too big or too small, the two address bytes are swapped: tell the agent `b` is the high byte.

### Step 2 · Encode
<!-- step week=4 id=encode -->

`encode` is `decode` backwards: an instruction back into its 4 bytes. The assembler uses it, so the
programs need it.

```text
Use this approach: a switch on instruction.op that builds the 4 bytes, splitting an address into its
high byte (address >> 8) and low byte (address & 0xff).

In core/isa.ts only, fill in TODO(week 4, encode) in encode. Don't change anything outside that
region, or any test. Tell me what you'll change before you change it, and explain each line you
write. Then run: npx vitest run tests/week-04/isa.test.ts
```

Test: `npx vitest run tests/week-04/isa.test.ts` · Commit: `week 4: encode`
Ask: why does `encode(decode(b))` give back `b`?
Stuck? If addresses come out swapped, the high byte goes in byte 3 and the low byte in byte 4.

## Component 2 · The CPU core
<!-- component id=cpu-core -->

The core is a state machine that fetches an instruction, decodes it and executes it, one clock tick at a time. When it's done, it runs a whole program to `HALT`.

When it works: every core test goes green, and the count-down program ends with `R0 = 0` and memory `0x3F2` holding 0.
Check: `npx vitest run tests/week-05/cpu-core.test.ts`

<!-- notes -->
#### Design notes

| From | On a tick, when… | To | What it does |
|---|---|---|---|
| `FETCH` | always | `WAIT_FETCH` | asks for 4 bytes at PC |
| `FETCH` | 4 bytes don't fit before the end of memory | `FAULT` | |
| `WAIT_FETCH` | the bytes arrived | `DECODE` | `ir = bytes` |
| `WAIT_FETCH` | nothing yet | `WAIT_FETCH` | counts a stall |
| `DECODE` | valid instruction | `EXECUTE` | |
| `DECODE` | invalid | `FAULT` | |
| `EXECUTE` | ADD, SUB, LOADI, jump | `FETCH` | registers, flags, PC |
| `EXECUTE` | `LOAD` or `STORE` | `WAIT_DATA` | asks memory to read 1 byte or write |
| `EXECUTE` | `HALT` | `HALTED` | |
| `WAIT_DATA` | the reply arrived | `FETCH` | `LOAD`: sets the register; PC + 4 |
| any waiting state | a `fault` reply | `FAULT` | |

`LOAD R0, 0x020` / `ADD R0, R0` / `HALT`, with 21 at `0x020`, tick by tick:

| Tick | State | What happens |
|---|---|---|
| 1 | `FETCH` | asks for 4 bytes at `0x000` |
| 2 | `WAIT_FETCH` | bytes arrive |
| 3 | `DECODE` | `LOAD R0, 0x020` |
| 4 | `EXECUTE` | asks for 1 byte at `0x020` |
| 5 | `WAIT_DATA` | `R0 = 21`, PC → `0x004` |
| 6–9 | `FETCH` … `EXECUTE` | `ADD`: `R0 = 42`, PC → `0x008` |
| 10–13 | `FETCH` … `EXECUTE` | `HALT` → `HALTED` |

Flags: `zero` means the last result was 0; `carry` means an `ADD` wrapped past 255 or a `SUB`
borrowed below 0. Registers are 8 bits.
<!-- /notes -->

### Step 3 · Fetch
<!-- step week=5 id=fetch -->

The core never reads memory itself. It returns a request for the 4 bytes at the PC and waits in
`WAIT_FETCH`. If 4 bytes don't fit before the end of memory, it goes to `FAULT`.

```text
Use this approach: if the 4 bytes at pc don't fit before the end of memory, go to FAULT; otherwise
go to WAIT_FETCH and return one read effect for 4 bytes at pc.

In core/cpu-core.ts only, fill in TODO(week 5, fetch) in fetch. Don't change anything outside that
region, or any test. Tell me what you'll change before you change it, and explain each line you
write. Then run: npx vitest run tests/week-05/cpu-core.test.ts -t "FETCH asks memory"
```

Test: `npx vitest run tests/week-05/cpu-core.test.ts -t "FETCH asks memory"` · Commit: `week 5: fetch`
Ask: why does the core return a request instead of calling memory?
Stuck? If the test finds the core in `DECODE`, it skipped the wait: tell the agent `fetch` goes to `WAIT_FETCH`, because memory hasn't answered yet.

### Step 4 · Wait for the instruction
<!-- step week=5 id=await-instruction -->

Memory answers during a tick, and the core uses the answer on the next one. Bytes arrived: put them
in `ir` and go to `DECODE`. A fault: `FAULT`. Nothing yet: stay, and count a stall.

```text
Use this approach: check the reply: memData puts its bytes in ir and goes to DECODE; memFault goes
to FAULT; no reply stays in WAIT_FETCH and adds 1 to stalls.

In core/cpu-core.ts only, fill in TODO(week 5, await-instruction) in awaitInstruction. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run:
npx vitest run tests/week-05/cpu-core.test.ts -t "WAIT_FETCH waits"
```

Test: `npx vitest run tests/week-05/cpu-core.test.ts -t "WAIT_FETCH waits"` · Commit: `week 5: await-instruction`
Ask: memory is late this tick. What does the core do?
Stuck? If it never leaves `WAIT_FETCH`, the bytes aren't reaching `ir` or the phase isn't moving to `DECODE`: ask the agent to show you both lines.

### Step 5 · Decode inside the core
<!-- step week=5 id=decode-step -->

The core runs your `decode` on `ir`. A valid instruction is kept and the core goes to `EXECUTE`. A
bad one goes to `FAULT`, with the reason.

```text
Use this approach: call decode on ir; if it's ok, keep the instruction and go to EXECUTE, otherwise
go to FAULT with its error.

In core/cpu-core.ts only, fill in TODO(week 5, decode-step) in decodeStep. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run: npx vitest run tests/week-05/cpu-core.test.ts -t "DECODE turns IR"
```

Test: `npx vitest run tests/week-05/cpu-core.test.ts -t "DECODE turns IR"` · Commit: `week 5: decode-step`
Ask: where does an unknown opcode end up, and how do you see why?
Stuck? If the error names `TODO(week 4: decode)`, step 1 isn't done: do it first.

### Step 6 · ADD, LOAD and HALT
<!-- step week=5 id=execute-core -->

Registers are 8 bits, so `ADD` wraps past 255 (`& 0xff`): `carry` says it wrapped, `zero` says the
result is 0. Then `finish` moves the PC on by 4. `LOAD` asks memory for 1 byte and waits in
`WAIT_DATA`. `HALT` stops.

```text
Use this approach: one case each for LOAD, ADD and HALT in the existing switch; ADD keeps 8 bits
with & 0xff, sets carry and zero, and moves on with finish; LOAD returns a 1-byte read effect and
goes to WAIT_DATA.

In core/cpu-core.ts only, fill in TODO(week 5, execute-core) in execute. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Its tests also need the next step (a LOAD can't finish without it), so don't try
to make them pass yet.
```

Test: none yet: the next step's test covers it, because `LOAD` needs `awaitData` to finish · Commit: `week 5: execute-core`
Ask: `200 + 100`: what's in the register, and which flags are set?
Stuck? An error naming `TODO(week 5: await-data)` is expected until the next step. Commit and go on.

### Step 7 · Wait for the data
<!-- step week=5 id=await-data -->

`LOAD`'s byte arrives a tick later: put it in the register, set `zero`, and move on. A `STORE`'s ack
just means done. That extra wait is why `LOAD` takes 5 ticks and `ADD` takes 4.

```text
Use this approach: if the reply is memData, put its byte in the instruction's register and set zero;
a memAck just means the store is done; then move on with finish.

In core/cpu-core.ts only, fill in TODO(week 5, await-data) in awaitData. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run:
npx vitest run tests/week-05/cpu-core.test.ts -t "takes 4 ticks|adds two numbers|sets carry and zero|LOAD sets the zero|last byte"
```

Test: `npx vitest run tests/week-05/cpu-core.test.ts -t "takes 4 ticks|adds two numbers|sets carry and zero|LOAD sets the zero|last byte"` · Commit: `week 5: await-data`
Ask: why does `LOAD` take one more tick than `ADD`?
Stuck? If the register is unchanged after a `LOAD`, it's being set in `EXECUTE`, before the byte exists: it belongs here.

### Step 8 · The rest of the instructions
<!-- step week=5 id=execute-rest -->

`STORE` asks memory to write and waits for the ack. `SUB` wraps below 0 and sets `carry` when it
borrows. A jump that's taken sets `PC = address`; one that isn't moves on by 4, like everything else.

```text
Use this approach: one case per instruction in the existing switch; SUB keeps 8 bits and sets carry
when it borrows; STORE returns a write effect and goes to WAIT_DATA; a taken jump sets the PC to the
address and goes to FETCH without adding 4.

In core/cpu-core.ts only, fill in TODO(week 5, execute-rest) in execute. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run:
npx vitest run tests/week-05/cpu-core.test.ts -t "one step at a time|STORE|SUB|JMP|JZ|JNZ|taken jump|count-down"
```

Test: `npx vitest run tests/week-05/cpu-core.test.ts -t "one step at a time|STORE|SUB|JMP|JZ|JNZ|taken jump|count-down"` · Commit: `week 5: execute-rest`
Ask: `JNZ 0x010` with `zero` set: where does the PC go?
Stuck? If a jump skips its target, the PC gets `+ 4` on top of the jump. If `carry` is wrong after `SUB`, it should mean "borrowed" (like `3 - 5`), not "bigger".

## Component 3 · The core on the board
<!-- component id=core-on-board -->

The board draws each core with its fetch, decode and execute steps, lighting the one it's on. When it's done, you can watch a program move through the cycle.

When it works: on the Board, press play: each core's step lights up as the recording plays.
Check: `npx vitest run tests/week-05/board-core.test.ts`
Board: yes

<!-- notes -->
#### Design notes

| Core phase | The step the board lights |
|---|---|
| `FETCH`, `WAIT_FETCH` | fetch |
| `DECODE` | decode |
| `EXECUTE`, `WAIT_DATA` | execute |
| `IDLE`, `HALTED`, `FAULT` | idle (nothing lit) |

One core on the board shows: the three steps with the current one lit, the core's number, its
program (or idle), and its PC. Its fetch is the 4-byte read at its PC among the tick's packets;
a `LOAD`'s read is 1 byte.
<!-- /notes -->

### Step 9 · Light the board's steps
<!-- step week=5 id=board-cycle-step -->

The board lights fetch, decode or execute. Waiting counts as the step that asked: `WAIT_FETCH` lights
fetch, and `WAIT_DATA` lights execute. Idle, halted and faulted cores light nothing.

```text
Use this approach: a switch on the phase: FETCH and WAIT_FETCH light fetch, DECODE lights decode,
EXECUTE and WAIT_DATA light execute, anything else is idle.

In board/student/core.tsx only, fill in TODO(week 5, board-cycle-step) in cycleStep. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run: npx vitest run tests/week-05/board-core.test.ts -t "cycleStep"
```

Test: `npx vitest run tests/week-05/board-core.test.ts -t "cycleStep"` · Commit: `week 5: board-cycle-step`
Ask: why does `WAIT_DATA` light execute and not fetch?
Stuck? If `WAIT_DATA` lights fetch: the core asked for that byte while executing, so it lights execute.

### Step 10 · Find the core's fetch
<!-- step week=5 id=board-fetch-address -->

Among this tick's packets, find this core's instruction fetch: a 4-byte read. The board uses it to
show where the instruction came from.

```text
Use this approach: find the packet in frame.packets that is a mem.read from the cpu for this core
with length 4, and return its address, or null if there isn't one.

In board/student/core.tsx only, fill in TODO(week 5, board-fetch-address) in fetchAddress. Don't
change anything outside that region, or any test. Tell me what you'll change before you change it,
and explain each line you write. Then run:
npx vitest run tests/week-05/board-core.test.ts -t "fetchAddress"
```

Test: `npx vitest run tests/week-05/board-core.test.ts -t "fetchAddress"` · Commit: `week 5: board-fetch-address`
Ask: what makes a fetch different from a `LOAD`'s read?
Stuck? If it picks a `LOAD`'s read, a fetch is the 4-byte read at this core's PC.

### Step 11 · Draw the core
<!-- step week=5 id=board-draw-core -->

One core on the board: its three steps with the current one lit, its name, its program and its PC.
Open the **Board** tab and press **play** (scroll down if you don't see the controls). The core
panel says `You build this in week 5` until this step is done.

```text
Use this approach: use cycleStep and fetchAddress with the kit's Box and Label parts: three boxes
for fetch, decode and execute, the current one filled with the core's colour, and a title with the
core, its program and its PC.

In board/student/core.tsx only, fill in TODO(week 5, board-draw-core) in CoreView. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. No test checks this one: I'll check it on the board.
```

Test: none yet: check it on the board, where each core's step lights up as the recording plays · Commit: `week 5: board-draw-core`
Ask: what's one thing you told the agent to change on the board, and why?
Stuck? If the board sits at tick 0, press play (scroll down to the controls). If the panel still says `You build this in week 5`, `CoreView` isn't saved yet.

## Component 4 · Programs onto cores
<!-- component id=programs-onto-cores -->

The first half of the scheduler: a free core takes the next waiting program, and a program that halts gives its core back. When it's done, programs run one after another.

When it works: the scheduler tests go green: on one core, programs run in the order they were added.
Check: `npx vitest run tests/week-05/scheduler.test.ts`

<!-- notes -->
#### Design notes

| A program is… | When… | It becomes… |
|---|---|---|
| `READY` | a core is free and it's first in the queue | `RUNNING` (its registers, PC and flags go onto the core) |
| `RUNNING` | its core halts | `DONE` |
| `RUNNING` | its core faults | `FAILED` |

What's saved when a program leaves a core: `R0`–`R3`, the PC and the flags. A copy, never the same
object.
<!-- /notes -->

### Step 12 · Pick the next program
<!-- step week=5 id=pick-next -->

Programs wait in a queue. A free core takes the first one that's `READY`, in queue order.

```text
Use this approach: go through the queue in order and return the first process whose state is READY.

In core/scheduler.ts only, fill in TODO(week 5, pick-next) in pickNext. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run: npx vitest run tests/week-05/scheduler.test.ts -t "pickNext"
```

Test: `npx vitest run tests/week-05/scheduler.test.ts -t "pickNext"` · Commit: `week 5: pick-next`
Ask: why the first `READY` one, and not any `READY` one?
Stuck? If it picks a program that isn't `READY`, check the state before taking the first one in queue order.

### Step 13 · Switch a program out
<!-- step week=5 id=switch-out -->

When a core halts or faults, save its registers, PC and flags into its process, mark it `DONE` or
`FAILED`, and clear the core for the next one.

```text
Use this approach: copy the core's registers, PC and flags into the process, mark it DONE if the
core halted or FAILED if it faulted, move it to the back of the queue, and clear the core.

In core/scheduler.ts only, fill in TODO(week 5, switch-out) in switchOut. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run: npx vitest run tests/week-05/scheduler.test.ts
```

Test: `npx vitest run tests/week-05/scheduler.test.ts` · Commit: `week 5: switch-out`
Ask: is the saved context a copy, or the same object? Why does it matter?
Stuck? If a program's registers change after it leaves its core, the saved context is the same object: save a copy.

## Component 5 · Wire the CPU to the bus
<!-- component id=cpu-on-bus -->

The CPU shell carries the core's requests to memory over the bus, and hands each reply back on the next tick. When it's done, your whole computer runs.

When it works: two programs run on two cores over the bus to the right answer, and on the Board, **Load demo** then **Start** runs count-down and blink on your own cores.
Check: `npx vitest run tests/week-05/integration.test.ts`
Board: yes

<!-- notes -->
#### Design notes

```text
tick N:   core returns  { kind: "read", address, length }
          shell sends   mem.read  (id 42) ──bus──> memory
          shell keeps   waiting[42] = core 0
          memory sends  mem.data  (replyTo 42) ──bus──> shell
          shell keeps the reply for core 0
tick N+1: core 0 gets the reply in stepCore(core, reply)
```

| The core asks | Shell sends | Memory answers |
|---|---|---|
| read | `mem.read` | `mem.data`, or `fault` |
| write | `mem.write` | `mem.ack`, or `fault` |

A reply is never used in the tick it arrives: the core gets it on the next tick, so the same
program always gives the same run.
<!-- /notes -->

### Step 14 · Send the core's requests
<!-- step week=5 id=cpu-send-effects -->

The CPU shell carries the core's requests onto the bus: a `mem.read` or `mem.write` to memory for
each one. It remembers which core asked, by the message id.

```text
Use this approach: a loop over the effects: send a mem.read for a read and a mem.write for a write,
to memory, and remember the message id with this core in the waiting map.

In components/cpu.ts only, fill in TODO(week 5, cpu-send-effects) in sendEffects. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Its test needs the next step too, so don't try to make it pass yet.
```

Test: none yet: `tests/week-05/integration.test.ts` needs the next step too · Commit: `week 5: cpu-send-effects`
Ask: how does the shell know later which core asked?
Stuck? Nothing to test yet: the next step's test covers both.

### Step 15 · Hand the reply to the core
<!-- step week=5 id=cpu-latch-reply -->

When the reply comes back, find the core from `replyTo` and keep the reply for it. The core uses it
on the next tick, never straight away, so every run gives the same answer.

```text
Use this approach: find the core with the reply's replyTo in the waiting map and remove that entry,
turn the message into a MemReply, and hand it over with receiveReply.

In components/cpu.ts only, fill in TODO(week 5, cpu-latch-reply) in latchReply. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run: npx vitest run tests/week-05/integration.test.ts
```

Test: `npx vitest run tests/week-05/integration.test.ts` (it opens a local socket: press **Run its tests**) · Commit: `week 5: cpu-latch-reply`
Ask: why is the reply kept for the next tick instead of used now?
Stuck? If it fails with `listen EPERM`, press **Run its tests**. If `LOAD` takes an extra tick or the final memory is off, the core is being stepped when the reply arrives: keep the reply for the next tick.

## When the steps are done

**Done when** `npx vitest run tests/week-04/isa.test.ts tests/week-05` passes and your work is
pushed. Then, in the Board tab, **Load demo** and **Start**: count-down and blink run on your cores.

**Explain it back** before the 9 Nov check-in, no notes or AI: a 5-minute slot with me, or a 3-minute video
answering two of the Ask questions above, which I post in the class chat.

If the Build tab won't start: press **Copy the prompt** on the step, run `codex` in a terminal in
your course folder, and paste it.
