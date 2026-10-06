# Week 2 · DESIGN: The machine and its bus

Today you design the first part of your computer: the **bus** that connects everything, and the
**memory** that stores bytes. No code today. The goal for today's class is to create a design note
and sketch of what the board will look like. Next week, we'll work on the rendering of the memory
cells as the requests pass through the bus.

## Goals

- **Hardware idea:** a computer is a few parts with different jobs (the CPU runs instructions,
  memory stores bytes, devices connect to the world). They share a **bus** and move in step with a
  **clock**. A memory access is a **request** and a **reply** across the bus. Memory is
  **byte-addressable**: 1 KB here, addresses `0x000` to `0x3FF`, and an address outside it is a
  **fault**, not a silent zero.
- **OS idea:** the clock tick is the system's heartbeat, and the bus is a shared resource that many
  parts want at the same time.
- **Design idea:** before you build, decide the parts, what they say to each other, and what it
  looks like. That's the design note, and it's what you will use when building with your coding
  assistant next week.

## In class (1 hour, on Zoom)

Class is on Zoom, camera on. You work **on your own** all hour, and we all stay in the one call.
Keep Zoom's **chat** open: I post the time for each block there.

- **Stuck?** Raise your Zoom hand or send me a private message. I'll answer with a question.
- **Sharing:** at the end of each block I ask two or three of you to share your screen for a
  minute or two. Everyone shares at least once over the design weeks. While someone shares,
  answer in the chat: what did you write differently?

Fill in your own design note: open `docs/notes/week-02.md` (it arrives with this week's merge,
with the nine headings from [the design-note template](../notes/design-note-template.md) and a
comment under each saying what goes there). If it isn't there, copy the template to that path.

1. **Open the app (5 min).** In your course folder, run `npm start`. (This first time, your week-1
   folder doesn't have it yet: run `node setup.mjs` instead, which brings it in.) The app is where
   every class starts: it gets week 2 ready (saves your work, brings the week in, checks), then
   shows this page, your design note and the board. If the app won't start, the same by hand:

   ```bash
   git fetch upstream && git merge upstream/week-2
   ```

   ✅ The studio's checks are green (or `npm run doctor` ends with `doctor: all 8 checks passed`).
   Then open this page (`docs/weeks/week-02.html`) and your design note, `docs/notes/week-02.md`.

2. **Act it out in the chat (10 min).** Four of you get roles and rename yourselves when I ask
   (Participants → your name → More → Rename): `CPU-1`, `CPU-2`, `MEMORY` and `BUTTON`. I'm the
   **bus** and the **clock**. I send `MEMORY` four numbers privately: the bytes at addresses 0
   to 3. Everyone else watches the chat and notes what goes wrong. The rules:
   - Nobody acts between ticks: you only type after I post `— tick 3 —` in the chat.
   - Nobody talks to anyone but the bus. Send every message **to me, privately** (in the chat, pick
     my name instead of "Everyone"), and I deliver it.
   - When you've done your part for the tick, send me `done`. The next tick starts only when
     everyone has.

   **Round 1** (no names): CPUs send me `read 2`; `MEMORY` answers me with just the number,
   e.g. `42`. I post the answers to everyone. Who gets which number?

   **Round 2** (ticket numbers): every message gets an `id`, and every reply says which `id` it
   answers:

   ```
   CPU-1  → bus:  id=c1-1 to=memory mem.read 2
   MEMORY → bus:  id=m-1 replyTo=c1-1 mem.data 42
   CPU-2  → bus:  id=c2-1 to=memory mem.read 9
   MEMORY → bus:  id=m-2 replyTo=c2-1 fault OUT_OF_RANGE
   BUTTON → bus:  id=b-1 to=cpu-1 irq
   ```

   (Number your own ids: `c1-1`, `c1-2`, …) Someone will ask for address 9; `MEMORY` only has 0
   to 3. And `BUTTON` will press in the middle of a tick: `CPU-1`, when do you react?

   Then answer in the chat: who owns time? What does the bus know about CPUs? What should happen
   at address 9?

3. **Parts and their jobs (8 min).** Fill in sections 1 and 2 of your note for the bus, the
   clock, memory, and "a component that asks memory for something" (it'll be the CPU later). For
   each part: its job in a few words, and what it knows. (Hint: does the bus know what's in
   memory? Does memory know who's asking?)

4. **Messages (15 min).** Fill in section 3: every message a memory **read** and a memory
   **write** need, including what happens when the address is bad. For each: who sends it, to
   whom, what it carries, and what the receiver does. When I share ARCHITECTURE.md's envelope and
   the `mem.*` and `fault` rows of its message table, compare: what did you name differently? What did you
   miss? Keep your own names if you like them; note the difference in section 7.

5. **One read, tick by tick (10 min).** Fill in section 5 for this scenario: *a component reads
   the byte at `0x010`.* Who sends what on which tick, who waits, and when the reply is used. Ask
   yourself: why does the reply get **used** on the next tick, not the moment it arrives? (Think
   of round 1 of the activity.) After the shares, I put the tick timeline on screen.

6. **Sketch the board (9 min).** Draw what this will look like on screen: where the bus and
   memory sit, how a request and its reply travel, how a memory cell shows it was just read or
   written, and what a fault looks like. **On paper** (then photograph it) **or digitally**:
   Excalidraw (excalidraw.com), tldraw (tldraw.com), or anything that saves a PNG or JPEG. Don't
   worry about drawing well. Arrows and labels beat art.

7. **Wrap up (3 min).** What's left goes home. Next week you'll hand section 9 of this note to
   your agent, so it builds *your* design.

## Take-home

Due before next session.

1. **Finish your design note** in `docs/notes/week-02.md`, all nine sections. In particular:
   - **Section 4, states and rules:** memory's rule for a read or write that is partly outside
     `0x000`–`0x3FF`. (Does a write that starts inside and ends outside change anything? Decide,
     and say why.)
   - **Section 7, decisions:** at least two, with the option you didn't pick. Good candidates: the
     colours for read, write and fault on the board; whether the bus shows every message or only
     memory traffic; how long a cell stays lit.
   - **Section 9, agent brief:** what your agent should build next week in the board kit's
     week-3 regions: only the bus and memory on the board, and a small panel to send a read or a
     write by hand, since there's no CPU yet.
2. **Commit your sketch** as `docs/notes/week-02-board.jpg` (or `.png`) and link it in section 6.
   A phone photo or a digital export both work, as long as it's a real PNG or JPEG image (the check
   looks for one, bigger than 2 KB). From Excalidraw or tldraw: **Export → PNG**.
3. **Commit and push** your `work` branch.

### Acceptance criteria

- [ ] `docs/notes/week-02.md` has all nine sections filled in, in your own words.
- [ ] `npx vitest run tests/week-02` passes: it checks every section of your note is really
      filled in and your sketch file is there.
- [ ] Section 3 covers a read, a write, and the bad-address case, each with from → to, payload,
      and what the receiver does.
- [ ] Section 5 tells the `0x010` read tick by tick, and says why the reply is used on the next
      tick.
- [ ] Your board sketch is committed and linked from section 6.
- [ ] Section 7 has at least two decisions, each with an alternative and a reason.
- [ ] `work` is pushed to your fork.

## Using Codex this week

Today the design is the work, so it's yours: Codex shouldn't write your note. It's good to
argue with, though. Use it like this:

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "Here's my message table. What case did I miss?" | Every row of your message table |
| "What does a real memory controller do with an out-of-range address?" | Your rule for a partly-out-of-range write, and why |
| "Quiz me on why the reply is used on the next tick." | Why the bus holds the clock |
| "Critique my board sketch: what would confuse someone seeing it for the first time?" | Why you placed things where you did |

## Explain it back

Before next session, explain your design note to me without notes or AI: book a 5-minute slot with
me (on Zoom: camera on, share your screen with your note and sketch, nothing else open), or record
a 3-minute video (your face and your sketch, no notes) answering the two questions I post after
class. Be ready to:

1. **Walk through your sketch:** what each part on it is, and what moves or lights up during one
   memory read.
2. **Pick one message from your table** and explain it end to end: who sends it, what it
   carries, what the receiver does, and what the reply is.
3. **Why does the reply get used on the next tick,** not the moment it arrives?
4. **Defend one decision** from section 7: what you chose, the alternative, and why.

## Stretch

- Design a second memory (or a ROM that can't be written). What changes in your messages and on
  the board?
- Design a device that copies a block of memory without the CPU (that's DMA). Which messages does
  it send, and what does the board show while it runs?
- Read the rest of ARCHITECTURE.md's message table. Which messages will you need in week 4, when
  the CPU arrives?
