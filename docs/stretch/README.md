# Stretch modules

Stretch is **optional and portfolio only**: it earns no extra credit. Pick something that makes
your board more impressive or that you're curious about, once your week's work is done.

Each page says what the idea is, where the code lives, and how to check it. Stretch regions are
marked `TODO(stretch, …)` in your copy; the same rule as always applies: Codex can help with the
writing, you guide the design and can explain every line.

**Turning stretch on:** stretch tests live in `tests/stretch/` and are left out by default, so they
never fail your weeks. To work on a stretch module, set `"stretch": true` in `course.json` (below
the `note` line), then run `npx vitest tests/stretch` (or one file, e.g.
`npx vitest run tests/stretch/persistence.test.ts`). Set it back to `false` whenever you like.

| Page | What you'd add |
|---|---|
| [persistence.md](./persistence.md) | Save the whole machine mid-run and restore it, all or nothing |
| [peripherals.md](./peripherals.md) | A temperature sensor, proximity sensor or potentiometer with its interrupt handler; a seven-segment display or a screen |
| [diagrams.md](./diagrams.md) | State-machine diagrams generated from your code |
| [bus-up-close.md](./bus-up-close.md) | The watchdog, bus arbitration, a hand-written validator, joining the class bus |
| [deeper-modules.md](./deeper-modules.md) | Design-only to start: paging and swap, caches, a tiny RTOS kernel, DMA |
