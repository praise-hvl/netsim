# Stretch: save and restore the whole machine

**The idea:** a computer's state is just bytes. Stop the clock, ask every part for its state,
write it to a file; later, check every part *before* changing anything, then put it all back.
That's hibernation, and it's how you'd checkpoint a long simulation.

**Where the code is:**

- `core/memory.ts`: `snapshotMemory`, `restoreMemory` (regions `memory-snapshot`, `memory-restore`)
- `core/cpu-core.ts`: `snapshotCore`, `restoreCore` (`core-snapshot`, `core-restore`)
- `core/scheduler.ts`: `snapshotScheduler`, `restoreScheduler` (`scheduler-snapshot`,
  `scheduler-restore`)
- a peripheral's `snapshot`/`restore` (`<kind>-snapshot`, `<kind>-restore`)
- `bus/saves.ts`: how the bus saves to `saves/<name>.json` and restores **all or nothing**: it sends
  every component `snapshot.check` (each runs its real `restore` without applying it) and only
  sends `snapshot.set` if every part passes.

**The one rule:** a `restore` only checks and rebuilds. It validates the data (with the part's zod
schema) and returns the state, or throws, without changing anything on the way.

**Check it:** `tests/stretch/persistence.test.ts` and `peripheral-snapshot.test.ts`; then with the
whole system running locally (`npm run dev:all`, then the dashboard at http://localhost:3005), stop
the clock, **Save**, restart everything, **Restore**, and the programs finish with the same memory
as a run you never interrupted. (Save and restore are dashboard-only: the in-page machine on
`/board` and on GitHub Pages can't save.)

**For your portfolio:** a short screen recording of the dashboard saving mid-run and waking up in
the restored state (the board on GitHub Pages runs the in-page machine, which can't save).
