# Week 7 · BUILD: Many cores on the board

Your computer runs programs, takes turns and handles interrupts. These steps put all of it on the
board, on 1 to 8 cores: one lane per core, the scheduler's moves, and interrupts arriving. Do them at
home after weeks 5 and 6 (the Build tab lists anything still open first). Monday 16 Nov is a
check-in: bring what's stuck, show where you are, and I introduce many cores.

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

Due: every step on this page, and everything still open, before the demo on Monday 23 Nov.

## Component 1 · Many cores on the board
<!-- component id=cores-on-board -->

The board shows every core: one lane each, the scheduler moving programs between them, and interrupts arriving. When it's done, you can watch your computer on 1 to 8 cores.

When it works: on the Board, press play on 2 cores and then 8: one lane per core, with moves and interrupts shown.
Check: `npx vitest run tests/week-07/board-cores.test.ts`
Board: yes

<!-- notes -->
#### Design notes

| Part | What it shows |
|---|---|
| Lanes | one per core, top to bottom, inside the CPU area, never overlapping |
| A core's lane | your core view: its steps, program and PC |
| Moves | a program whose core changed since the last tick: landed, left or switched |
| "raised" | an interrupt packet on the bus this tick, from its device |
| "taken" | a core that started a handler this tick (it wasn't in one a tick ago) |

On 2 cores and on 8 cores, the programs end with the same memory: a program's result doesn't
depend on which core ran it.
<!-- /notes -->

### Step 1 · One lane per core
<!-- step week=7 id=board-lane-rects -->

The CPU area is split into one lane per core, top to bottom: every lane inside the area, none
overlapping, for any count from 1 to 8.

```text
Use this approach: split the area's height evenly by the count, one rect per core from top to
bottom, with a small gap between lanes.

In board/student/cores.tsx only, fill in TODO(week 7, board-lane-rects) in laneRects. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. Then run: npx vitest run tests/week-07/board-cores.test.ts -t "laneRects"
```

Test: `npx vitest run tests/week-07/board-cores.test.ts -t "laneRects"` · Commit: `week 7: board-lane-rects`
Ask: 8 cores in an area 160 high: how tall is each lane?
Stuck? If lanes overlap or spill out, add up their heights and gaps: they have to fit in the area.

### Step 2 · The scheduler's moves
<!-- step week=7 id=board-scheduler-moves -->

Compare which core each program is on between the last tick and this one. Every program whose core
changed is a move: it landed, left, or switched.

```text
Use this approach: for each process in this frame, compare its core with that process's core in the
previous frame, and list it when they differ.

In board/student/cores.tsx only, fill in TODO(week 7, board-scheduler-moves) in schedulerMoves.
Don't change anything outside that region, or any test. Tell me what you'll change before you change
it, and explain each line you write. Then run:
npx vitest run tests/week-07/board-cores.test.ts -t "schedulerMoves"
```

Test: `npx vitest run tests/week-07/board-cores.test.ts -t "schedulerMoves"` · Commit: `week 7: board-scheduler-moves`
Ask: a program stays on core 1 for ten ticks. How many moves is that?
Stuck? If every program shows up every tick, compare with the previous tick: only a change of core is a move.

### Step 3 · Interrupts arriving
<!-- step week=7 id=board-interrupt-markers -->

Two kinds of marker: "raised" for each interrupt packet on the bus this tick, and "taken" for each
core that started a handler this tick (it wasn't in one a tick ago).

```text
Use this approach: a raised marker for each irq packet this tick, and a taken marker for each core
in a handler now that wasn't in one in the previous frame.

In board/student/cores.tsx only, fill in TODO(week 7, board-interrupt-markers) in interruptMarkers.
Don't change anything outside that region, or any test. Tell me what you'll change before you change
it, and explain each line you write. Then run:
npx vitest run tests/week-07/board-cores.test.ts -t "interruptMarkers"
```

Test: `npx vitest run tests/week-07/board-cores.test.ts -t "interruptMarkers"` · Commit: `week 7: board-interrupt-markers`
Ask: why can "taken" come a few ticks after "raised"?
Stuck? If "taken" shows every tick a core is in a handler, check it wasn't already in one a tick ago.

### Step 4 · Draw every core
<!-- step week=7 id=board-draw-cores -->

Put it together: a lane for each core with your `CoreView` in it, the scheduler's moves, and the
interrupt markers. Open the **Board** tab and press **play** (scroll down if you don't see the
controls), on 2 cores and then on 8.

```text
Use this approach: laneRects for the lanes, your CoreView in each lane, and the moves and markers
from schedulerMoves and interruptMarkers.

In board/student/cores.tsx only, fill in TODO(week 7, board-draw-cores) in CoresView. Don't change
anything outside that region, or any test. Tell me what you'll change before you change it, and
explain each line you write. No test checks this one: I'll check it on the board.
```

Test: none yet: check it on the board, on 2 cores and on 8 · Commit: `week 7: board-draw-cores`
Ask: what's one thing you told the agent to change on the board, and why?
Stuck? If the board sits at tick 0, press play (scroll down to the controls).

## When the steps are done

Go back to the Build tab's list: anything not green yet, from any week, in order. When everything is
green, run the demo on 2 cores and then on 8. Be ready to say what changed on the board, what didn't,
and why the final memory is the same: it's part of your demo.

## Get ready to demo

Before the demo on 23 Nov, do the steps on Week 8's page, "Get ready to demo" (your board
on the web, your portfolio README, and one rehearsal).

**Explain it back** before the demo, no notes or AI: a 5-minute slot with me, or a 3-minute video
answering two of the Ask questions above, which I post in the class chat.

If the Build tab won't start: press **Copy the prompt** on the step, run `codex` in a terminal in
your course folder, and paste it.
