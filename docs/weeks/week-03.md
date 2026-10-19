# Week 3 · BUILD: Bus + memory on screen

Last week you designed the bus and memory in your note. Today you build them: the handshake every
part uses to join the bus, checking every message that arrives, asking memory a question and
getting *your* answer back. And your board starts: memory cells that light up as requests cross
the bus.

## Goals

- **Hardware idea:** a memory access is a **request** and a **reply** across a shared **bus**,
  in step with the **clock**. Memory is byte-addressable (`0x000`–`0x3FF`), and an address outside
  it is a **fault**. The clock only moves on when every request of the tick has its reply.
- **Software idea:** two programs talking over a **WebSocket** with **JSON messages**; a
  **handshake** (`hello` → `welcome`); **validating at the boundary** with a schema;
  **request/response correlation** (`id` and `replyTo`); a pure function (memory) behind a thin
  shell.
- **On the board:** the memory grid with cells lighting up on a read and a write, and packets
  travelling the bus wires: questions first, then answers. Your design from week 2, running.

## In class (1 hour, on Zoom)

Class is on Zoom, camera on, and you work **on your own** in your own repo. When a step says
"together", I share my editor and code it live while you type along. At each checkpoint I
ask two or three of you to share your screen.

**Stuck?** Raise your Zoom hand or send me a private message with the first line of the
failing test.

You'll work in `components/client.ts` and `protocol/messages.ts`, then on the board in
`board/student/memory-bus.tsx`. Commit each time a task's checks go green (see "The commit
rhythm" below).

1. **Open the app and watch the tests fail (5 min).** In your course folder, run `npm start`. The
   app is where every class starts: it gets week 3 ready (saves your work, brings the week in,
   installs, checks), then shows this page, your design note, the board and the week's checks. If
   the app won't start, the same by hand:

   ```bash
   git fetch upstream && git merge upstream/week-3
   npm install
   ```

   **Not set up on the course's new home yet** (you missed week 2's setup)? Do it now, in a new,
   empty folder: the one-liner from [the README](../../README.md#start-here). It takes about 5
   minutes (most steps are already done from week 1) and brings week 3 straight in. Stuck on a
   step at 0:10? Send me which one: I'll get you unstuck during the tick barrier, so you're building
   by `request()`.

   ✅ `course.json` says `"week": 3`. If git reports a conflict, ask me before resolving it. Open
   your design note, `docs/notes/week-02.md` (Week 2's **Design note** tab in the app): sections 3
   (messages), 5 (one read, tick by tick) and 9 (agent brief) are what you'll use today. Then run
   the week's tests and watch them fail:

   ```bash
   npx vitest tests/week-03
   ```

   ✅ Tests fail with errors that start `week 3:`. That's the `todo()` stub telling you where to
   work. Leave Vitest running; it re-runs every time you save. (Week 3's **Checks** tab in the app
   runs the same tests once.)

   **No week-2 design note (or only part of one)?** You can still build everything today: the
   code doesn't need it, and for the board use this starting design (change anything you like):

   > Memory is a grid of cells, one per byte. A cell read this tick lights **green**; a cell
   > written this tick lights **yellow**; a cell read *and* written in the same tick shows the
   > write (yellow). Each tick, the questions (`mem.read`, `mem.write`) travel the bus first, then
   > the answers (`mem.data`, `mem.ack`, `fault`).

   Paste it at the top of section 9 of `docs/notes/week-02.md` (copy
   `docs/notes/design-note-template.md` there if the file is missing). It's your agent brief for
   today; finish the rest of the note at home.

2. **The handshake (15 min, together).** In `components/client.ts`, `TODO(week 3, handshake)`
   inside `handshake(socket, options)`. Every part of the computer joins the bus through
   `connect()`, and the first thing `connect()` does is this:
   - When the socket's `open` event fires, send `hello`. `envelope(type, from, to, payload,
     { id, tick })` in `protocol/messages.ts` builds it (tick 0, `to` is `"bus"`, payload is your
     `role` and `label`).
   - Parse each message that arrives with `parseMessage`; **resolve** with the `welcome`;
     **reject** if the bus answers `error`, or if the socket errors.

   ✅ `handshake.test.ts` passes. Commit: `week 3: handshake`.

3. **The tick barrier (8 min).** In `bus/server.ts`, `TODO(week 3, tick-barrier)`. Until now
   the bus ended a tick as soon as everyone said `tick.done`. Make it wait for both:
   - every clocked component has sent `tick.done` for this tick, **and**
   - every request sent during the tick has had its reply (the ledger of open request ids is
     empty).

   That second half is section 5 of your design note: a reply that misses the end of its tick
   would land in the next one.

   ✅ Check it: does your condition have both halves? `order.test.ts` can't
   run yet (it needs the memory and the tick handler you write at home); it goes green once your
   take-home is done. Commit: `week 3: tick-barrier`.

4. **Ask and get your answer back (15 min, together).** `TODO(week 3, client-request)`. Read
   `settle()` first: when a message with a `replyTo` arrives, it looks that id up in the `pending`
   map and resolves (or rejects, on `fault`/`error`). Your half: send with a fresh `id`, and put
   this request's `resolve` and `reject` in `pending` under the id `send` returned. That's the
   ticket number from the week-2 activity.

   ✅ The `request()` tests pass. Commit: `week 3: client-request`.

5. **Your board: memory lights up (15 min).** In the app, open Week 3's **Board** tab and press
   **Start the board** (it runs the bus, the components and the board's server for you; without
   the app: `npm run dev:all`, then http://localhost:3005/board). The board plays a **recording**
   of the finished computer, so it has memory traffic to show right now, even before your memory
   answers. The memory area says "you build this in week 3": that's yours. The board kit gives you
   the feed (each tick's packets and memory accesses) and the parts; you fill in two functions in
   `board/student/memory-bus.tsx`:
   - `TODO(week 3, board-cell-activity)` in `cellActivity()`: turn this tick's memory accesses into
     one entry per cell touched (read or write).
   - `TODO(week 3, board-draw-memory)` in `MemoryLayer`: draw memory as cells and light the ones
     read or written this tick.

   Run `codex` in a terminal in your course folder and paste this (change the colours or the rule
   to match your design note):

   ```text
   In board/student/memory-bus.tsx only, fill in two functions. Don't change any other file or
   any test, and explain each line you write.
   1. cellActivity(frame): one entry per byte touched by frame.accesses (an access covers
      address .. address + length - 1, below MEMORY_SIZE), keeping kind, core and by. If a cell
      is both read and written in this tick, it counts as written.
   2. MemoryLayer({ frame }): draw a MemoryGrid in MEMORY_AREA with MEMORY_COLUMNS and
      MEMORY_SIZE cells, using cellActivity(frame): a cell read this tick is INK.mint, a cell
      written this tick is INK.yellow, any other cell has no colour (null).
   ```

   Read what it changed and keep only what you can explain. Still stuck at 0:53? Use the snippet
   below, line by line, and say each line out loud as you type it.

   <details><summary>Fallback snippet (only if you're stuck)</summary>

   ```tsx
   // cellActivity
   const cells = new Map<number, CellActivity>();
   for (const access of frame.accesses) {
     for (let address = access.address; address < access.address + access.length && address < MEMORY_SIZE; address++) {
       if (cells.get(address)?.kind === "write") continue; // a write wins
       cells.set(address, { kind: access.kind, core: access.core, by: access.by });
     }
   }
   return cells;

   // MemoryLayer
   const activity = cellActivity(frame);
   return (
     <MemoryGrid
       rect={MEMORY_AREA}
       size={MEMORY_SIZE}
       columns={MEMORY_COLUMNS}
       colourOf={(address) => {
         const cell = activity.get(address);
         if (!cell) return null;
         return cell.kind === "write" ? INK.yellow : INK.mint;
       }}
     />
   );
   ```

   </details>

   ✅ The `cellActivity` checks in `tests/week-03/board-memory-bus.test.ts` pass, **and** on the
   board your memory cells light up as the recording plays (press play; slow it down to see each
   tick). That's yours, running. Commit: `week 3: board memory`.

6. **Push (1 min).**

   ```bash
   git push
   ```

### The commit rhythm

Each time a task's checks go green, commit just that task: `git add -A && git commit -m
"week 3: <task>"` (for example `week 3: memory-read`). Push at the end of the session. A history
of small green steps is easy to explain, and easy to go back to.

### What the code looks like (shape only)

```ts
return new Promise((resolve, reject) => {
  socket.addEventListener("open", () => socket.send(JSON.stringify(hello)), { once: true });
  socket.addEventListener("message", onMessage);  // resolve(welcome) or reject(error)
  socket.addEventListener("error", () => reject(new Error("could not reach the bus")));
});
```

A promise lets the caller write `const welcome = await handshake(...)` and read the sequence top
to bottom. And why a `Map` for `request()`? Two requests can be in flight at once, and replies can
come back in any order. The `id` is the ticket; `replyTo` is the ticket stapled to the answer.

## Take-home

Due before next session. Commit each task when its checks go green; push at the end.

1. **Answer the clock**: `handleTick` in `components/client.ts` (`TODO(week 3, handle-tick)`).
   Remember the tick number, run every handler registered with `client.onTick(...)`, then send
   `tick.done` to the bus. Messages you send are stamped with the tick you remembered, so
   `tick.done` carries **the same tick number** as the tick it answers.
2. **Memory, pure**: in `core/memory.ts`:
   - `read(memory, address, length)` (`TODO(week 3, memory-read)`) returns
     `{ ok: true, value: bytes }`, or `{ ok: false, fault }` if any byte is outside
     `0x000`–`0x3FF`.
   - `write(memory, address, bytes)` (`TODO(week 3, memory-write)`) returns a **new** memory, or a
     fault on the same rule. Use your design note's rule for a write that's partly out of range
     (the tests expect: it faults and changes nothing).
3. **The Memory component**: `answer()` in `components/memory.ts`
   (`TODO(week 3, memory-handler)`). `mem.read` → `mem.data`; `mem.write` or `program.load` →
   `mem.ack`; a bad address → `fault` with code `OUT_OF_RANGE`. `client.reply(request, type,
   payload)` sets `replyTo` for you.
4. **Validate at the boundary**: `TODO(week 3, parse-message)` in `protocol/messages.ts`. Until now
   `parseMessage` trusts everything: it `JSON.parse`s and *casts* to `Message`. Your handshake ran
   on that trust. Make it real: `JSON.parse` in a `try`/`catch` (bad text → `{ ok: false, error:
   "not valid JSON" }`), then `messageSchema.safeParse`. On failure, say **which field** was wrong
   (from `error.issues`). Compare `messageSchema`'s `mem.*` lines with section 3 of your design
   note. (zod's docs, zod.dev, say what `safeParse` returns.) ✅ The `parseMessage` tests in
   `messages.test.ts` pass. Commit:
   `week 3: parse-message`.
   Once memory and `handleTick` work, `order.test.ts` checks your tick barrier from class too.
5. **The rest of the board**, with your agent: `board-packet-progress` (decide when each packet
   of the tick travels: questions first, then answers) and `board-draw-bus` (draw the bus and the
   parts on it, and move each packet along its wire) in `board/student/memory-bus.tsx`.

   **Agent brief:** hand Codex section 9 of your design note and your sketch
   (`docs/notes/week-02-board.jpg`), or the starting design from step 1 if you don't have a note.
   - Codex works only in `board/student/memory-bus.tsx`.
   - It doesn't change the core-code regions (bus, memory, client) or any test.
   - You check that `tests/week-03/board-memory-bus.test.ts` passes, and that your section-5
     scenario (one read at `0x010`) plays out on the board (Week 3's Board tab, or
     http://localhost:3005/board) the way your table says.
   - If it draws something you didn't design, ask it why, then keep it or change it, your call.
6. **Watch it with the logger.** The bus logger is a tool you're given: it prints every message,
   pairing each reply with its request and timing it.

   ```bash
   npm run bus                          # terminal 1
   LOG=1 npm run component -- memory    # terminal 2
   ```

   Send a few reads and writes from the board, and watch the same messages go past in the log
   and across the board.

### Acceptance criteria

- [ ] `npx vitest run tests/week-03` passes, and so does every earlier week (`npx vitest run`).
- [ ] Your `tick.done` always carries the tick number of the `tick` it answers.
- [ ] Reads return exactly what was written; `0x000` and `0x3FF` work; `0x400` and "starts in
      range, ends out of range" both fault and change nothing; `core/memory.ts` imports nothing
      from `components/`, `bus/` or `app/`.
- [ ] On http://localhost:3005/board, a read and a write light the right cells in the colours from
      your design note, and packets travel the bus questions-first.
- [ ] One commit per task (`week 3: …`), and `work` is pushed to your fork.

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npx vitest tests/week-03` | this week's tests in watch mode | ✅ |
| `npx vitest run` | everything unlocked so far, once (what grading uses) | ✅ |
| `npm run dev:all` | bus + components + the dashboard, with the board at `/board` | ✅ (the CPU arrives in week 5) |
| `npm run bus` | just the bus | ✅ |
| `LOG=1 npm run component -- memory` | your Memory component, with every message printed | ✅ after the take-home |
| `npm run component -- cpu` | the CPU | ❌ `todo` until week 5 |

Tests that gate this week (`tests/week-03/`):

- `handshake.test.ts`, `late-join.test.ts`: joining the bus, and a late joiner still gets
  everyone's status.
- `messages.test.ts`: `parseMessage` (valid, bad JSON, unknown type, wrong field) and `request()`.
- `ticks.test.ts`: every `tick` answered with `tick.done` for the same tick number.
- `memory.test.ts`, `memory-over-bus.test.ts`, `memory-status.test.ts`: pure memory, memory on the
  bus, and what it reports.
- `who-may-send.test.ts`: the bus refuses messages a component isn't allowed to send.
- `order.test.ts`: every reply arrives after its request and before the next tick (the barrier).
- `board-memory-bus.test.ts`: the board's behaviour checks (cells lit, packets in order).
- `logger.test.ts`: the logger tool (already passes).

## Explain it back

Before next session, explain your work to me without notes or AI: book a 5-minute slot with me, or
record a 3-minute video (your face and your screen, no notes) answering the two questions I post
after class. Be ready to:

1. **Walk through your `handshake()`** line by line: when does the promise resolve, and what
   happens if `welcome` never comes?
2. **How does a reply find its way back** to the right `request()` call? Point at the line.
3. **What does the tick barrier wait for**, and what goes wrong without its second half?
4. **One thing on the board you asked the agent to change**, and why.

## Using Codex this week

Codex may help with the writing, but you guide the design. Run `codex` in a terminal in your
course folder (or use the Codex extension in VS Code), and:

- **Say your approach first,** in a sentence or two (for `request()`: "store resolve/reject under
  the id `send` returns; `settle()` does the rest"), and name the one function it may change.
- **Read the change before you keep it.** Keep only what you can explain; your `AGENTS.md` already
  tells Codex to explain what it wrote and never to edit a test.

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "How do I wrap a WebSocket `open` event in a Promise?" | Why `connect()` waits for `welcome` |
| "How do I read the `issues` in a zod `safeParse` error?" | Why validation happens once, at the socket |
| "Here's my rule for a partly-out-of-range write. Write `write()` that way and explain it." | Why a faulted write must change nothing |
| "Draw the cells in my two colours and explain the drawing code." | Every line you kept in `memory-bus.tsx` |

## Stretch

Portfolio only, no extra credit. See [docs/stretch/bus-up-close.md](../stretch/bus-up-close.md):

- Write `isMemRead` by hand (a validator without zod), to feel what the schema does for you.
- Join the class bus with the `hello` script: your name on my dashboard.
- The bus watchdog: mark a component `stalled` when it misses a tick.
