# Stretch: the bus up close

- **The watchdog** (`bus/server.ts`, region `watchdog`): when a component misses a tick by
  `tickTimeoutMs`, mark it `stalled`, forget its open requests and carry on. Try it with
  `npm run stall-demo` (a component that joins as `silent` and never answers a tick). Check:
  `watchdog.test.ts`.
- **Arbitration** (`arbitrate()` in `bus/server.ts`, already written): the bus holds a tick's
  memory requests and hands them to Memory sorted by sender id, so the same program gives the same
  answer every run. Read it and `same-tick.test.ts`; then answer: a core and a sensor touch the
  same address in one tick; who goes first, and why must it be the same every time?
- **Validating by hand** (`isMemRead` in `protocol/messages.ts`, region `is-mem-read`): write the
  type guard for one message with `typeof` checks, then compare it with the one-line zod schema.
  Check: `tests/stretch/is-mem-read.test.ts`.
- **Joining the class bus** (`hello()` in `scripts/hello.ts`, region `hello-script`): connect, list
  who's there, print joins, leaves and every 10th tick.
  `BUS_URL=ws://<address>:3006 HELLO_ID=<you> npm run hello`. Check: `hello.test.ts`.
