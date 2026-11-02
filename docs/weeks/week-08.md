# Week 8 · DEMO: Ship it

This is the week your computer goes public. After week 7's class, as your last take-home, you put
your board on the web, write the story of how you built it, and rehearse. In class you demo it live, and the recording of that demo
is your portfolio video.

Your showpiece: **a multi-core computer I designed and built, with a bus, memory, a CPU, a
scheduler and interrupts, running live in the browser.**

## Goals

- **Ship:** your board deployed to **GitHub Pages** from your fork, linked from your README.
- **Tell the story:** a portfolio README in your own words: what you built, how, and what you
  decided, grounded in your commits.
- **Show it:** a 3-minute live demo in class, recorded, then a 2-minute final explain-it-back.

## Get ready to demo (take-home after week 7's class)

There's no time for this in the demo class, so it's week 7's take-home. Start once your week-7
work is pushed.

1. **Push your work.** Run `npm start`: the app has everything in already. With every step of
   weeks 5 to 7 green, push from the app (or `git push`). Week 8 brings the workflow that publishes
   your board (`.github/workflows/pages.yml`), so it has to be on GitHub before the next step.

2. **Deploy your board to GitHub Pages.** With week 8 merged and pushed, in your course folder:

   ```bash
   npm run pages:enable
   ```

   The first time, it prints:

   ```
   ✓ signed in to GitHub as <you>, who owns <you>/netsim
   ✓ made work the default branch (was main)
   ✓ turned on GitHub Actions for your fork
   ✓ turned Pages on, built by GitHub Actions
   Your board will be at https://<you>.github.io/netsim/board/
   It's published each time you push work (the first time takes a minute or two: watch the Actions tab).
   ```

   (Forks start with GitHub Actions switched off; that line turns them on so your board can be
   built.) Running it again is safe: it says "already" (for example "✓ GitHub Actions is already
   on for your fork") and changes nothing. If something's wrong, it
   prints one ✗ line with the fix:

   | It says | Do this |
   |---|---|
   | `gh` isn't signed in | `gh auth login --web -h github.com -p https`, then run it again |
   | signed in as someone else | `gh auth switch --user <you>`, then run it again |
   | `work` isn't on GitHub | `git push -u origin work`, then run it again |
   | `The GitHub CLI (gh) isn't installed.` | run `node setup.mjs` (it installs it), or install it from https://cli.github.com |
   | `Your work branch doesn't have .github/workflows/pages.yml yet.` | you skipped step 1: `npm start`, push, then run it again |
   | `couldn't turn on GitHub Actions for <you>/netsim` | on GitHub, open your fork's **Actions** tab and click **"I understand my workflows, go ahead and enable them"**, then run it again |
   | GitHub refused to turn Pages on | do it by hand: your fork → **Settings** → **Pages** → Source: **GitHub Actions** (the ✗ line gives the exact path) |

   Then push `work` once more (`git push`). On your fork's **Actions** tab you'll see
   **Deploy the board to GitHub Pages** run; when it's green, open
   `https://<you>.github.io/netsim/board/`. Your board runs there, live in the browser,
   with nothing installed. Put that link at the top of your README.

3. **Write your portfolio README** with `npm run portfolio`. It works in three steps:

   ```bash
   npm run portfolio
   ```

   - **Your history.** It writes **`portfolio/HISTORY.md`** (and `history.json`): your commits
     week by week, your design notes, and when each week's tests first went green.
   - **The interview.** It asks you about **8 questions** about *your* work: what you designed,
     what you decided, what went wrong. Answer **in your own words, without AI**; short is fine.
     Your answers are saved in **`portfolio/answers.md`**. You can stop any time (type `stop`) and
     run it again to carry on; `skip` skips a question. `npm run portfolio -- --redo` asks every
     question again, and `--new-questions` picks fresh questions from your latest history.
   - **The draft.** It writes **`portfolio/README.draft.md`**: your answers word for word between
     "your words" markers, the generated parts marked as generated, and a `TODO` wherever you
     skipped a question. Edit it until it sounds like you, fill in the TODOs, and add your
     **GitHub Pages link** (and, after class, your **in-class demo recording**).
   - **Make it your README.** `npm run portfolio -- --copy` copies the draft to `README.md` (links
     fixed up); the course's README is kept as `portfolio/README.before.md`. Want a single file to share?
     `--zip` bundles your repo, its history and `portfolio/` into one zip.
   - Commit and push:

     ```bash
     git add -A && git commit -m "week 8: portfolio README" && git push
     ```

4. **Check your portfolio README covers** everything in "What your portfolio README must say"
   (below).
5. **Rehearse your 3 minutes** out loud, with a timer, once, from your deployed page. On GitHub
   Pages, `/board` runs your machine live in the browser on 2 cores, so the Button works. For the
   8-core part of your demo, open `…/board/?source=machine&cores=8`. (If the page header says it's
   playing a paused recording instead, your machine couldn't start yet: the header says why. Fix
   that before the demo. Locally, `npm run dev:all` shows the recording unless you add
   `?source=machine`.)

## In class: live demos (1 hour, on Zoom)

About ten demos fit in the hour. Each is **3 minutes**, then a **2-minute** final explain-it-back.
When it's your turn, camera on, share your screen with your deployed page, and nothing else open.
I record your demo (a recording of the Zoom call while you share): that recording is your
portfolio video, and I'll share it with you after class.

**Your 3 minutes**, from your deployed page (the live machine; `?source=machine&cores=8` for 8
cores):

1. **What it is** (about 20 s): one sentence, your showpiece line in your own words.
2. **A program running** (about 60 s): countdown or blink (or your own), with the board showing
   the bus, memory and the CPU at work. Say what we're looking at as it happens.
3. **An interrupt** (about 40 s): press the button (or let the Timer fire) and show the core that
   takes it, the handler running, and the program carrying on.
4. **Change the core count** (about 40 s): from 2 to 8 (or the other way). Show what changes on
   the board, and say why the answer stays the same.
5. **One decision** (about 20 s): one thing in your design you chose on purpose, and why.

## Final explain-it-back (graded, live)

Right after your demo. I'll pause the clock and name **one moment** on the board or in the
message trace, for example a fetch just before a context switch, or an interrupt arriving while a
core waits on memory. You explain it at **both levels**:

- **The hardware:** what each part is doing and why (the core is between instructions, so it takes
  the interrupt; the scheduler moves a program because its quantum is used up).
- **Your code:** which function did it (`shouldPreempt`, `enterInterrupt`, `request()`…), and what
  it checked.

No notes and no AI. It's two minutes and one moment.

## What your portfolio README must say

It's your reflection too, in your own words (the interview helps you get there). Make sure it
has:

1. **What I built:** one paragraph, as if to a friend who knows code but not this course.
2. **What surprised me:** about hardware, and about software.
3. **One bug:** what went wrong, **how you found it** (a test? the board? the trace?), how you
   fixed it. Link the commit.
4. **How I worked with AI:** what you designed and what Codex wrote; one time it was wrong or you
   changed its code; how you made sure you understood what you kept.
5. **What I'd change:** one design decision you'd make differently, and why.

## Acceptance criteria

- [ ] Your board runs on GitHub Pages, and the link is at the top of your README.
- [ ] `npx vitest run` passes on `work`.
- [ ] Your portfolio README (from `portfolio/README.draft.md`, copied to `README.md`) is in your
      own words, has no `TODO`s left, matches `portfolio/HISTORY.md`, and has your Pages link (and the demo recording, once I've shared
      it).
- [ ] Demo done live in class, and the final explain-it-back passed.

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npx vitest run` | every test, all weeks | ✅ |
| `npm run dev:all` | the whole system locally; the board at http://localhost:3005/board | ✅ |
| `npm run demo -- --cores N` | the demo programs and peripherals on N cores (1–8) | ✅ |
| `npm run portfolio` | your work history, the interview (resumable), and the README draft; `-- --copy` makes it your README, `-- --zip` bundles everything | ✅ |
| `npm run pages:enable` | turns on GitHub Pages for your fork (once); then every push of `work` publishes your board at `https://<you>.github.io/netsim/board/` | ✅ |

## Using Codex this week

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "Why did *Deploy the board to GitHub Pages* fail? Here's the log." | Any moment on your board, at both levels |
| "Tighten this README paragraph; keep my words where you can." | Every decision your README claims you made |
| "Quiz me: pick a moment in my trace and ask me what's happening." | Which function in your code handles each message |
| "Proofread my portfolio README." | The bug story in your README |

Codex can polish your README, but the interview answers and the decisions in them
are yours. Asking Codex to quiz you is a great way to prepare; it can't take the explain-it-back
for you.

## Stretch

Portfolio only, no extra credit. Anything from `docs/stretch/` you finished (save and restore, a
new peripheral, the timer race fix, diagrams from your FSMs, a design for paging, caches, DMA or
a tiny RTOS kernel) can go in your portfolio README with a short "what I added" section.
