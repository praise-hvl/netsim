# Week 6 · BUILD: Taking turns and interrupts

These steps give your computer the heart of an operating system: programs take turns on the cores,
and interrupts wait in a queue, most urgent first (week 7 lets a core take them). Do them at home, in order, after week 5's steps
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

## When the steps are done

Run the week's checks (the Checks tab, or `npx vitest run tests/week-06`): the interrupt queue and
round robin's rule are green. Week 7 builds on them: a core takes an interrupt between two instructions.

**Explain it back** before the next check-in, no notes or AI: a 5-minute slot with me, or a 3-minute video
answering two of the Ask questions above, which I post in the class chat.

If the Build tab won't start: press **Copy the prompt** on the step, run `codex` in a terminal in
your course folder, and paste it.
