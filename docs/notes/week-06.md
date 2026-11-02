# Week 6 design note: The OS heart: scheduling and interrupts

Sharing the cores in turns, and letting devices interrupt.

Write in your own words: this note is your design, you'll explain it without notes or AI, and in
the build session you hand it to your agent as the brief. Short is fine. Tables and bullet points
are fine. A sentence that says *why* is worth more than a paragraph that says *what*.

`npx vitest run tests/week-06` checks that every section is filled in and the sketch is there.

## 1. The goal

One or two sentences: what this part of the machine does, and what someone watching the board
should understand after 30 seconds.

<!-- @student week=6 part=home id=design-06-goal "Say what this part does and what a viewer should get in 30 seconds" -->
<!-- TODO(week 6, design-06-goal): Say what this part does and what a viewer should get in 30 seconds -->

<!-- @end -->

## 2. Parts and their jobs

<!-- @student week=6 part=home id=design-06-parts "Fill in the table: each part, its job and what it knows" -->
<!-- TODO(week 6, design-06-parts): Fill in the table: each part, its job and what it knows -->
| Part | Its job, in a few words | What it knows (its state) |
|---|---|---|
| | | |

<!-- @end -->

## 3. Messages

Everything that crosses the bus for this part. One row per message type.

<!-- @student week=6 part=home id=design-06-messages "Fill in the table: every message for this part, who sends it, what it carries, what happens" -->
<!-- TODO(week 6, design-06-messages): Fill in the table: every message for this part, who sends it, what it carries, what happens -->
| Message | From → to | What it carries | What the receiver does with it |
|---|---|---|---|
| | | | |

<!-- @end -->

## 4. States and rules

The states each part can be in and what moves it between them (a table is enough; a diagram is a
bonus). Add any rule that must always hold, for example "a reply is used on the tick after the one
it arrives in".

<!-- @student week=6 part=home id=design-06-states "List the states, what moves between them, and any rule that must always hold" -->
<!-- TODO(week 6, design-06-states): List the states, what moves between them, and any rule that must always hold -->

<!-- @end -->

## 5. One scenario, step by step

Pick one thing the machine does (for example, the CPU reads one byte) and tell it tick by tick:
who sends what, who waits, what changes.

<!-- @student week=6 part=home id=design-06-scenario "Tell one thing the machine does, tick by tick, and what the board shows" -->
<!-- TODO(week 6, design-06-scenario): Tell one thing the machine does, tick by tick, and what the board shows -->
| Tick | What happens | What the board shows |
|---|---|---|
| | | |

<!-- @end -->

## 6. The board

What this part looks like on screen: where it sits, what lights up or moves, and what colour
means what. Draw it on paper, photograph it, and commit the photo next to this note
(`docs/notes/week-06-board.jpg` or `.png`) and keep the link below pointing at it.

<!-- @student week=6 part=home id=design-06-board "Photograph your board sketch, commit it as week-06-board.jpg or .png, and describe it" -->
<!-- TODO(week 6, design-06-board): Photograph your board sketch, commit it as week-06-board.jpg or .png, and describe it -->
![My board sketch](week-06-board.jpg)

<!-- @end -->

## 7. Decisions

At least two choices you made, each with the option you didn't pick and why.

<!-- @student week=6 part=home id=design-06-decisions "Fill in the table: at least two choices, each with the option you didn't pick and why" -->
<!-- TODO(week 6, design-06-decisions): Fill in the table: at least two choices, each with the option you didn't pick and why -->
| Decision | What I chose | What I didn't, and why |
|---|---|---|
| | | |

<!-- @end -->

## 8. Questions I still have

Anything you're unsure about. It's fine to have some; bring them to the build session.

<!-- @student week=6 part=home id=design-06-questions "Write what you're still unsure about (one line is fine)" -->
<!-- TODO(week 6, design-06-questions): Write what you're still unsure about (one line is fine) -->

<!-- @end -->

## 9. Agent brief

What you'll hand your agent in the build session, so it builds **your** design. Fill in each
line. Whatever you write, the agent doesn't change the core-code `TODO(week N, …)` regions in
this task, and never changes the tests.

<!-- @student week=6 part=home id=design-06-brief "Fill in each line of the brief you'll hand your agent" -->
<!-- TODO(week 6, design-06-brief): Fill in each line of the brief you'll hand your agent -->
- **Build:**
- **Use:**
- **Check:**
- **Ask me before:**

<!-- @end -->
