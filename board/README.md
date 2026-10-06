# Your board

A live picture of the machine you are building: memory, the bus with messages moving on it,
the CPU's cores, and the devices. You draw it yourself, your way. Open it at
**http://localhost:3005/board** while `npm run dev:all` is running.

The page lets you watch a **recording** (a finished machine's run, so you can draw before your own
machine works) or your **live bus**.

## What you get, finished

| Folder | What it is |
|---|---|
| `feed/` | Turns what travels on the bus (or a recording) into one **frame** per clock tick: every core's phase and PC, the programs, all 1024 bytes of memory, which cells were read or written, and the messages (packets) of that tick. Read `feed/frames.ts` first: the `Frame` type is the contract. |
| `parts/` | Small drawing pieces to build with, each a short readable example: `Box` and `Label`, `Lane`, `MemoryGrid`, `Wire` and `PacketOnWire`, plus `geometry.ts` (board units to SVG pixels) and the course colours. Use them, change them or ignore them. |
| `shell/` | The page around your board: recording or live, play, pause, step one tick, scrub; and `Layer`, which holds one layer of your board. |
| `recordings/` | The recorded runs (2 cores and 8 cores). |

## What you build

Everything in `student/` is yours. `student/places.ts` says where things sit and
`student/board.tsx` stacks your layers; change both freely. The `TODO` blocks are the weekly work,
written with your agent from your design note:

| Week | File | You build |
|---|---|---|
| 3 | `student/memory-bus.tsx` | memory as cells that light up when read or written, and the bus with packets travelling between the parts |
| 5 | `student/core.tsx` | a CPU core and which step it is on: fetch, decode or execute |
| 7 | `student/cores.tsx` | one lane per core, the scheduler moving programs between cores, and interrupts arriving |

A layer you haven't built yet shows "You build this in week N" (that's what its
`return notBuilt(...)` line does). Replace that line with your drawing. If a drawing throws, the
error shows in that layer's box and the rest of the board keeps working.

The tests (`tests/week-03/board-*`, `week-05/board-*`, `week-07/board-*`) only check what your
functions say about a tick, like "a read lights the addressed cells" or "N lanes for N cores".
They never check how anything looks: the look is your design.
