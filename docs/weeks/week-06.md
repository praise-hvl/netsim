# Week 6 · BUILD: Taking turns and interrupts

These steps give your computer the heart of an operating system: programs take turns on the cores,
and a device can cut in between two instructions. Do them at home, in order, after week 5's steps
(the Build tab lists anything still open from week 5 first). Monday 9 Nov is a check-in: bring
what's stuck, show where you are, and I introduce interrupts.

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

Due: every step on this page before the check-in on Monday 16 Nov.

## Component 1 · The interrupt queue
<!-- component id=irq-queue -->

Devices raise interrupts, and they wait in a queue, most urgent first. When it's done, the CPU always knows which interrupt to handle next.

When it works: the interrupt queue tests go green.
Check: `npx vitest run tests/week-06/interrupts.test.ts`

<!-- notes -->
#### Design notes

| Device | Priority (lower = more urgent) |
|---|---|
| Button | 0 |
| Timer | 2 |

- An interrupt carries a vector (its handler's address) and a priority.
- The queue keeps the most urgent first; equal priorities keep their arrival order.
- Both functions return a new queue and leave the one they were given alone.
<!-- /notes -->

### Step 1 · The interrupt queue
<!-- step week=6 id=irq-enqueue -->

Interrupts wait in a queue, the most urgent first: a lower number means more urgent, and equal ones
keep the order they arrived in. Return a new queue; don't change the one you were given.

```text
Use this approach: copy the queue and insert the irq just before the first entry with a larger
priority number, so equal priorities keep their arrival order.

In core/interrupts.ts only, fill in TODO(week 6, irq-enqueue) in enqueue. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run:
npx vitest run tests/week-06/interrupts.test.ts -t "keeps|does not change"
```

Test: `npx vitest run tests/week-06/interrupts.test.ts -t "keeps|does not change"` · Commit: `week 6: irq-enqueue`
Ask: the timer (priority 2) is waiting and the button (priority 0) arrives. Who's first, and why?
Stuck? If equal priorities come out in the wrong order, the newer one has to go after the older ones.

### Step 2 · Take the next interrupt
<!-- step week=6 id=irq-take-next -->

The next interrupt is the one at the front. Give back it and the queue without it; an empty queue
gives `null`.

```text
Use this approach: return the first entry and a copy of the rest, or irq null and an empty queue
when it's empty.

In core/interrupts.ts only, fill in TODO(week 6, irq-take-next) in takeNext. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run: npx vitest run tests/week-06/interrupts.test.ts
```

Test: `npx vitest run tests/week-06/interrupts.test.ts` · Commit: `week 6: irq-take-next`
Ask: why return a new queue instead of removing the first item from the old one?
Stuck? If the test says the queue changed, the code removed the first item from the queue it was given: build a new one.

## Component 2 · Taking turns
<!-- component id=taking-turns -->

Round robin: each program gets a few instructions on a core, then goes to the back of the queue. When it's done, every program gets its fair share of the cores.

When it works: three programs share two cores fairly.
Check: `npx vitest run tests/week-06/scheduler.test.ts`

<!-- notes -->
#### Design notes

| A program is… | When… | It becomes… |
|---|---|---|
| `READY` | a core is free and it's first in the queue | `RUNNING` |
| `RUNNING` | its quantum is used up and someone is waiting | `READY`, at the back of the queue |
| `RUNNING` | its core halts / faults | `DONE` / `FAILED` |

A core switches its program out only when **all** of these hold:

| Condition | Why |
|---|---|
| quantum used up | everyone gets a fair turn |
| core in `FETCH` | only between instructions, never while waiting for memory |
| not in a handler | a handler finishes first |
| someone is waiting | otherwise there's no one to switch to |

The quantum counts finished instructions, not ticks.
<!-- /notes -->

### Step 3 · Round robin's rule
<!-- step week=6 id=should-preempt -->

Each program gets a turn of a few instructions (the quantum). A core switches its program out only
when the quantum is used up, the core is between instructions (`FETCH`), it isn't in a handler, and
someone is waiting.

```text
Use this approach: return one boolean that ANDs the four conditions: quantum used up, core in FETCH,
not in a handler, and a READY process waiting.

In core/scheduler.ts only, fill in TODO(week 6, should-preempt) in shouldPreempt. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run: npx vitest run tests/week-06/scheduler.test.ts
```

Test: `npx vitest run tests/week-06/scheduler.test.ts` · Commit: `week 6: should-preempt`
Ask: why never switch a program out while it's in `WAIT_DATA`?
Stuck? If the error names `TODO(week 5: pick-next)`, week 5's steps aren't done: do those first.

## Component 3 · Interrupts on the core
<!-- component id=interrupts-on-core -->

A core stops between two instructions, saves everything, runs the handler and puts everything back. When it's done, a button press is handled without disturbing the running program.

When it works: the interrupt tests go green: a core saves, runs the handler, and `IRET` puts everything back exactly.
Check: `npx vitest run tests/week-07/cpu-core-irq.test.ts -t "only happens between|saves the registers|IRET"`

<!-- notes -->
#### Design notes

| Step | What happens |
|---|---|
| A core may take one | only in `IDLE` or `FETCH` (between instructions), and not already in a handler |
| Enter | push a frame, set `PC = vector`, go to `FETCH` |
| The handler runs | its own instructions, ending in `IRET` |
| `IRET` | pop the frame and put everything back; back to `IDLE` if the core was idle |
| `IRET` outside a handler | `FAULT` |

The frame: registers, PC, flags, the count of instructions so far, and whether the core was idle.

Pressing the button during a `LOAD`: the `LOAD` finishes, then at the next `FETCH` the core takes
the interrupt, runs the handler, and `IRET` puts the program back as if nothing happened.
<!-- /notes -->

### Step 4 · When a core may take an interrupt
<!-- step week=7 id=can-take-interrupt -->

A core takes an interrupt only between instructions (`IDLE` or `FETCH`), and never while it's already
running a handler.

```text
Use this approach: return true only when the phase is IDLE or FETCH and the core isn't already in a
handler.

In core/cpu-core.ts only, fill in TODO(week 7, can-take-interrupt) in canTakeInterrupt. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Its test also needs the next step, so don't try to make it pass yet.
```

Test: none yet: the next step's test covers it · Commit: `week 7: can-take-interrupt`
Ask: what would go wrong if a core took an interrupt in the middle of a `LOAD`?
Stuck? Nothing to test yet: the next step's test covers both. An error naming `TODO(week 7: enter-interrupt)` is expected.

### Step 5 · Enter the handler
<!-- step week=7 id=enter-interrupt -->

Taking an interrupt saves everything the program needs to carry on (registers, PC, flags, the count
of instructions so far, and whether it was idle) as a frame, then jumps to the handler's address,
the vector.

```text
Use this approach: push one frame with the registers, pc, flags, retired count and whether the core
was IDLE, then set pc to the vector and go to FETCH.

In core/cpu-core.ts only, fill in TODO(week 7, enter-interrupt) in enterInterrupt. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run:
npx vitest run tests/week-07/cpu-core-irq.test.ts -t "only happens between|saves the registers"
```

Test: `npx vitest run tests/week-07/cpu-core-irq.test.ts -t "only happens between|saves the registers"` · Commit: `week 7: enter-interrupt`
Ask: what's in the frame, and why does each part need saving?
Stuck? If the test sees changed registers later, the frame holds the same object, not a copy.

### Step 6 · Return from the handler
<!-- step week=7 id=iret -->

`IRET` pops the frame and puts everything back exactly as it was, so the program carries on as if
nothing happened. `IRET` outside a handler is a fault.

```text
Use this approach: if there's no frame, go to FAULT; otherwise pop it and put the registers, pc,
flags and retired count back, going to IDLE if the core was idle and FETCH otherwise.

In core/cpu-core.ts only, fill in TODO(week 7, iret) in returnFromInterrupt. Don't change anything
outside that region, or any test. Tell me what you'll change before you change it, and explain each
line you write. Then run: npx vitest run tests/week-07/cpu-core-irq.test.ts -t "IRET"
```

Test: `npx vitest run tests/week-07/cpu-core-irq.test.ts -t "IRET"` · Commit: `week 7: iret`
Ask: what would break if `IRET` forgot to put the flags back? Name a program.
Stuck? If the test says the phase is wrong after `IRET`, the frame's "was it idle" part isn't being used to go back to `IDLE` or `FETCH`.

## Component 4 · The timer
<!-- component id=the-timer -->

The timer is a device that raises an interrupt every few ticks. When it's done, your computer has a clock that cuts in on its own.

When it works: the timer tests go green, and on the Board, **Load demo** then **Start**: a core takes the timer's interrupts while the programs carry on.
Check: `npx vitest run tests/week-07/timer.test.ts -t "raises an irq|fires every|does nothing|counts the|starts and stops"`
Board: yes

<!-- notes -->
#### Design notes

| From | When… | To | What it does |
|---|---|---|---|
| `STOPPED` | the dashboard sends start | `COUNTING` | |
| `COUNTING` | `interval` ticks have gone by | `COUNTING` | raises one interrupt, starts counting again |
| `COUNTING` | the dashboard sends stop | `STOPPED` | forgets the ticks counted so far |

With interval 3, it raises an interrupt on ticks 3, 6, 9… Its priority (2) is lower than the
button's (0).
<!-- /notes -->

### Step 7 · The timer ticks
<!-- step week=7 id=timer-tick -->

The timer is a device that raises one interrupt every `interval` ticks while it's `COUNTING`. It
does nothing while `STOPPED`.

```text
Use this approach: while COUNTING, add 1 to elapsed; when it reaches interval, set it back to 0, add
1 to count and return one irq effect.

In components/peripherals/timer.ts only, fill in TODO(week 7, timer-tick) in onTick. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run:
npx vitest run tests/week-07/timer.test.ts -t "raises an irq|fires every|does nothing|counts the"
```

Test: `npx vitest run tests/week-07/timer.test.ts -t "raises an irq|fires every|does nothing|counts the"` · Commit: `week 7: timer-tick`
Ask: with interval 3, on which ticks does it raise an interrupt?
Stuck? If it fires on tick 1, it's raising before `interval` ticks have gone by.

### Step 8 · Start and stop the timer
<!-- step week=7 id=timer-input -->

The dashboard starts and stops the timer. Stopping forgets the ticks counted so far, so the next
start counts a full interval.

```text
Use this approach: start goes to COUNTING; stop goes to STOPPED and sets elapsed back to 0.

In components/peripherals/timer.ts only, fill in TODO(week 7, timer-input) in onInput. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run: npx vitest run tests/week-07/timer.test.ts -t "starts and stops"
```

Test: `npx vitest run tests/week-07/timer.test.ts -t "starts and stops"` · Commit: `week 7: timer-input`
Ask: why reset the count when it stops?
Stuck? If a restart fires at once, stopping didn't reset the count.

## When the steps are done

In the Board tab, press **Load demo**, then **Start**, then the button: a core runs the handler and the program carries on.

**Explain it back** before the next check-in, no notes or AI: a 5-minute slot with me, or a 3-minute video
answering two of the Ask questions above, which I post in the class chat.

If the Build tab won't start: press **Copy the prompt** on the step, run `codex` in a terminal in
your course folder, and paste it.
