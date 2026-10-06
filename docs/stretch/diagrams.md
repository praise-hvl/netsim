# Stretch: diagrams from your code

**The idea:** documentation that can't go stale. Every state machine in the project is a
transition table declared with `defineFsm` (`core/fsm.ts`); turn the table into a mermaid diagram
instead of drawing it by hand.

**Where the code is:** `toMermaid()` in `core/fsm.ts` (region `fsm-mermaid`): a `[*] --> initial`
line, then one `from --> to: on` line per move, **including** self-transitions like the core's
`FETCH --> FETCH` (taking an interrupt) and `WAIT_FETCH --> WAIT_FETCH` (a stall).

**Run it:** `npm run fsm:export` writes `docs/diagrams/<name>.md` for every state machine.
Check: `fsm-export.test.ts`.

**For your portfolio:** paste your core's diagram into your README next to a screenshot of the
same states lighting up on your board.
