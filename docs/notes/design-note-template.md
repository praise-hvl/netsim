# Design note template

Copy this into `docs/notes/week-NN.md` for a design week and fill it in. Write in your own words:
this note is your design, you'll explain it without notes or AI, and in the build session you hand
it to your agent as the brief. Short is fine. Tables and bullet points are fine. A sentence that
says *why* is worth more than a paragraph that says *what*.

## 1. The goal

One or two sentences: what this part of the machine does, and what someone watching the board
should understand after 30 seconds.

## 2. Parts and their jobs

| Part | Its job, in a few words | What it knows (its state) |
|---|---|---|
| | | |

## 3. Messages

Everything that crosses the bus for this part. One row per message type.

| Message | From → to | What it carries | What the receiver does with it |
|---|---|---|---|
| | | | |

## 4. States and rules

The states each part can be in and what moves it between them (a table is enough; a diagram is a
bonus). Add any rule that must always hold, for example "a reply is used on the tick after the one
it arrives in".

## 5. One scenario, step by step

Pick one thing the machine does (for example, the CPU reads one byte) and tell it tick by tick:
who sends what, who waits, what changes.

| Tick | What happens | What the board shows |
|---|---|---|
| | | |

## 6. The board

What this part looks like on screen: where it sits, what lights up or moves, and what colour
means what. Draw it on paper, photograph it, and commit the photo next to this note
(`docs/notes/week-NN-board.jpg` or `.png`). Link it here:

![My board sketch](week-NN-board.jpg)

## 7. Decisions

At least two choices you made, each with the option you didn't pick and why.

| Decision | What I chose | What I didn't, and why |
|---|---|---|
| | | |

## 8. Questions I still have

Anything you're unsure about. It's fine to have some; bring them to the build session.

## 9. Agent brief

What you'll hand your agent in the build session, so it builds **your** design:

- **Build:** the board pieces from section 6, in the board kit's regions for this build week
  (the `TODO(week N, board-…)` regions in `board/student/`), nothing else.
- **Use:** the kit's data feed and parts library, the messages and states in sections 3 and 4,
  and my sketch.
- **Don't change, in this task:** the core-code `TODO(week N, …)` regions (bus, memory, CPU,
  scheduler, interrupts). I design those and we work on them separately, step by step. And never
  change the tests.
- **Check:** these tests pass (`tests/week-NN/`, including the board's behaviour checks), and
  the scenario in section 5 plays out on the board the way the table says.
- **Ask me before:** changing the layout, adding parts, or picking colours that aren't in my sketch.
