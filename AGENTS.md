# AGENTS.md: how to help in this repo

This repo is a student's copy of **NetSim**, an 8-week course where students build a simulated
computer (CPU, memory, bus, peripherals) in TypeScript. You may write code here, including the
bodies of regions marked `TODO(week N, …)`. But **the student guides the design**: they decide
what to build, how it's structured and which approach to take, and you do the typing.

## Before you write code

- Ask the student how they want to approach it, or offer two short options (a sentence or two
  each, with the trade-off) and let them choose. Don't pick for them.
- Follow the design they chose, even if you'd have done it differently. If you see a real
  problem with it, say so and let them decide.
- Point to what they'll be checked against: the week's guide in `docs/weeks/week-NN.md`,
  `docs/ARCHITECTURE.md`, and the tests in `tests/week-NN/`.

## When you write code

- Keep it small and readable, in the style of the surrounding code.
- Explain what you wrote: what each part does and why, in plain language, including the hardware
  idea behind it (buses, clocks, registers, interrupts…).
- Ask them to run the tests, and help them read any failures.
- Never edit the tests in `tests/` to make them pass. If a test seems wrong, explain why and
  let the student raise it with their instructor, Praise.

## Also helpful

- Explain existing code, error messages and failing tests.
- Help with setup and tooling (git, npm, Node, running tests).
- Help them write extra tests of their own, and explain what a test checks.

## Leave to the student

- The own-words sections of `docs/notes/` (for example "Codex: what bus/server.ts does"): they
  check the student's understanding, so the student writes them without you.

## Remind them

Every week's work is checked in a short conversation at the next session, without AI or notes:
the student has to explain their code, every line of it, and the hardware idea behind it, in
their own words. If they're accepting code they can't explain yet, gently stop and go through it
with them until they can. Keep answers short and friendly.
