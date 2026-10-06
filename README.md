# NetSim: build a computer out of messages

## Start here

**First time** (install [Node.js 22+](https://nodejs.org) first), in a terminal:

```bash
# macOS
curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -o setup.mjs && node setup.mjs
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -OutFile setup.mjs; node setup.mjs
```

Setup puts the course in a folder called `netsim`, inside the folder you choose in step 9 (the
studio shows the exact path when it's done). **Every class after**, go into that folder, then start
the studio:

```bash
cd ~/netsim      # your course folder: <the folder you chose>/netsim
npm start
```

## What this is

NetSim is a small simulated computer (an 8-bit CPU with 1 to 8 cores, 2 by default, 1 KB of memory, and devices like
buttons, timers, LEDs and sensors) where every part is a separate program talking over a
WebSocket **bus** in step with a shared **clock**. A live dashboard draws every part and every
message as it happens.

It is also an 8-week course. Each week you build one piece of it, and each piece runs on the
pieces you built before. By week 8 the computer on the screen is one you wrote.

`npm start` opens **NetSim Studio**, the whole course in one app: it gets you set up, brings in
each new week, and shows each week's lesson page, your design note, the board and the week's
checks. Its sidebar lists every week (the ones not out yet are greyed).

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Vitest](https://img.shields.io/badge/tests-Vitest-yellow)

## The course

The course meets on Mondays, 1 hour per session. After the setup week, sessions alternate: in a **design** session you learn an idea and design that part of the
machine on paper (your design note and a sketch of the board); in the next **build** session you
build it, writing the core mechanisms yourself and working with your AI agent on the board. By the
end you have a portfolio piece: **a multi-core computer you designed and built, with a bus,
memory, a CPU, a scheduler and interrupts, running live in the browser.**

| Week | Session | Topic | You make |
|---|---|---|---|
| 1 | Setup | [Setup & System Roles](docs/weeks/week-01.md) | Your accounts, tools and copy of the code |
| 2 | Design | [The machine and its bus](docs/weeks/week-02.md) | A design note: parts, messages, one read tick by tick, a sketch of the board |
| 3 | Build | [Bus + memory on screen](docs/weeks/week-03.md)
| 4 | Design | [The CPU](docs/weeks/week-04.md)
| 5 | Build | [A CPU that runs programs](docs/weeks/week-05.md)
| 6 | Design | [The OS heart: scheduling + interrupts](docs/weeks/week-06.md)
| 7 | Build | [Configurable cores, scheduler, interrupts](docs/weeks/week-07.md)
| 8 | Demo | [Ship it](docs/weeks/week-08.md)

Each guide has the goals, the in-class steps (the first is always getting the week), the
take-home with its acceptance criteria, the exact commands that work that week, and the
explain-it-back questions you'll answer before the next session. There's nothing to do before
class. In NetSim Studio each week's guide is its lesson page, with the diagrams.

Optional extras for your portfolio (no extra credit) are in [docs/stretch/](docs/stretch/README.md).

**Prerequisites:** loops and functions, basic Node.js and TypeScript, git basics (clone,
commit, push), and a rough idea of what a CPU, memory and I/O are for.

### Using AI: Codex

The course's AI tool is **Codex** (from ChatGPT); GitHub Copilot is the fallback. US college
students can get ChatGPT Plus, which includes Codex, free for 4 months: week 1 shows how to
claim it (by October 31, 2026).

Codex may write code with you, including in the `TODO(week N, …)` regions, but **you guide the
design**: you decide the approach and the structure, and Codex does the typing. Your copy of the
course has an `AGENTS.md` that makes Codex ask how you want to approach something (or offer two
options) before it writes, follow your design, explain what it wrote, and never edit the tests.
What's graded is whether you understand the hardware idea and your own code: each week's work is
checked in a short **explain-it-back** before the next session, **without notes or AI**: a booked
5-minute slot, or a 3-minute video (your face and your screen) answering two questions posted
after class. You walk through what you built and why. A good rule: if you can't explain a
line, you don't have it yet.

## How the code is laid out

```
core/         Pure logic: ISA, assembler, CPU core FSM, scheduler, interrupts, memory
protocol/     Every message on the wire (zod schemas + types), the memory map
bus/          The bus server: routing, clock, tick barrier; save/restore
components/   The programs that join the bus: client, CPU, memory, peripherals
programs/     Demo programs in assembly (*.asm)
app/          The dashboard and the board (Next.js)
tests/        week-01 … week-08, one folder per week
docs/         ARCHITECTURE.md, COURSE-PLAN.md, weeks/
```

Places you'll write code are marked with `TODO(week N, …)` comments. Each one names the test
that checks it and the week guide that explains it.

## Running it

Which of these work depends on the week: parts that later weeks build throw a clear `todo`
error until you get there. Your week guide lists exactly what works.

```bash
npm start                            # NetSim Studio: setup, this week, its page, note, board and checks
npm start -- --week 2                # the studio, opened on an earlier week
npm run setup                        # the guided setup only (rerun any time)
npm run doctor                       # week 1: check your setup
npm run bus                          # just the bus
npm run hello                        # week 2: say hello to the bus (HELLO_ID=you)
npm run component -- memory cpu host # components (memory: week 2+, cpu: week 4+; LOG=1 prints all traffic)
npm run dev:all                      # bus + memory + cpu + host + dashboard at http://localhost:3005 (week 4+)
npm run demo                         # load the demo programs and peripherals, start the clock
npm run asm -- programs/countdown.asm            # assemble and print a listing (week 3+)
npx vitest                           # tests in watch mode (only weeks up to course.json's week)
npx vitest run tests/week-03         # one week's tests, once
npm run fsm:export                   # write docs/diagrams/*.md from the transition tables (week 7)
npm run course:catch-up -- 3         # copy the published week-3 solution into your regions
```

## Read more

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the map of the whole system: the message
  protocol, a clock tick step by step, the instruction set, every state machine
- [docs/COURSE-PLAN.md](docs/COURSE-PLAN.md): how the weeks fit together and how the week
  branches are made
- [docs/weeks/](docs/weeks/): one guide per week

## More

**What the first-time setup does.** Week 1 is all setup, and [its guide](docs/weeks/week-01.md)
walks through it. You make a GitHub account and a ChatGPT account (and claim the student offer)
and install Node.js 22+ by hand; the studio does the rest with you, one step at a time, with you
typing each command: it installs git, the GitHub CLI, VS Code and Codex, signs you in, forks the
course, clones your fork into a `netsim` folder, makes your `work` branch from the course's
current week, installs the packages, and ends with `npm run doctor`.

**Your work branch.** All your work for the whole course goes on `work`. Each week the studio
merges the new week into it; you never switch branches.

**If the studio won't start**, get the week by hand, on your `work` branch, then open
`docs/weeks/week-NN.html` (or `.md`) in your folder:

```bash
git fetch upstream && git merge upstream/week-N   # N = this week's number
git push && npm install
```

## License

MIT
