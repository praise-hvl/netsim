# Week 1: Setup & System Roles

> Prefer a web page? Open [week-01.html](./week-01.html) in your browser (download it or open it from your clone): the same setup steps, with pictures and diagrams.

This week is about getting ready. By the end of it you'll have every tool installed, your own
copy of the course code on your laptop, an AI coding assistant that knows the course rules, and a picture
in your head of the computer you're going to build. By week 8, the finished computer on the
screen will be one you built yourself.

No code to write this week. If you already have everything installed, the setup goes fast and
you can help a neighbour.

## Goals

- **Hardware idea:** a computer is a few parts with different jobs. The **CPU** runs
  instructions, **memory** stores bytes, **I/O devices** (buttons, LEDs, timers) connect it to
  the world. They talk over shared wires, the **bus**, and they move in step with a **clock**.
- **Software idea:** a working setup is part of the job: a runtime (**Node.js**), version
  control (**git** + **GitHub**), an editor (**VS Code**), and a project you can install and
  check with one command (`npm install`, `npm run doctor`). And an AI tool you use to *learn*,
  not to hand in work you can't explain.

## Before class

Do as much of the setup below as you can at home, on the laptop you'll bring every week.
Anything you get stuck on, we finish in class. At minimum, before you arrive:

1. Create your **GitHub account** (Setup, 1a) and send me your username so I can find your work.
2. Create your **ChatGPT account** (Setup, 1b). Install **Node.js 22** (Setup, 2), and if
   you can, run the setup tool (Setup, 3). Claiming the student offer can take a day if
   verification needs documents, so start early.
3. Charge your laptop and make sure you have ~5 GB free disk space.

## Setup

Three parts: accounts and Node you do by hand, then a setup tool walks you through the rest.

### 1. Accounts (by hand)

**1a. GitHub.** Sign up at [github.com](https://github.com) (free). Use a username you're happy
to show on a CV. Then:

- Turn on two-factor authentication (Settings → Password and authentication). GitHub requires
  it for most accounts anyway.
- Send me your username so I can find your work.
- Optional, recommended: apply for the [GitHub Student Developer Pack](https://education.github.com/pack)
  with your school email. It includes GitHub Copilot for free, which is the course's fallback AI
  tool (see 1b).

✅ **Check:** you can sign in, and you can open the course starter repo,
[github.com/praiseisaac/netsim](https://github.com/praiseisaac/netsim).

**1b. ChatGPT and the student offer.** The course's AI tool is **Codex**, which comes with a
ChatGPT account.

1. Sign up at [chatgpt.com](https://chatgpt.com) (free), ideally with your school email.
2. If you're a student at a US college or university, claim the student offer at
   [chatgpt.com/students](https://chatgpt.com/students): **4 months of ChatGPT Plus free**,
   which includes Codex. You verify you're a student through **SheerID** (school sign-in,
   enrollment record, or an uploaded document). **Claim it by October 31, 2026**; after that
   the offer closes.
3. There's also a separate **Codex for university students** credit offer at
   [chatgpt.com/codex/students](https://chatgpt.com/codex/students). Claim it too if you're
   eligible.
4. After the 4 free months, Plus renews as a paid subscription unless you cancel (Settings →
   Account → Manage subscription). Put a reminder in your calendar now.

**If SheerID verification fails:** try the school sign-in option first; if that doesn't work,
upload a document that shows your name, your school and the current term (a class schedule or
enrollment letter works; a student ID without a date often doesn't). You can retry. If it still
fails, tell me, and I'll make sure you get Codex access. In the meantime use the fallback:
**GitHub Copilot**, free with the GitHub Student Developer Pack (1a), which also works in VS Code. Everything in this course works with
the free ChatGPT plan or Copilot; the offer just gives you more Codex use.

✅ **Check:** you can sign in at chatgpt.com.

### 2. Node.js 22 (by hand)

Node runs all of this course's code, and the setup tool itself, so it's the one thing you
install by hand.

- **macOS:** download the **LTS** installer (22 or newer) from
  [nodejs.org](https://nodejs.org) and run it. (If you already use Homebrew: `brew install node`.)
- **Windows:** download the **LTS** Windows installer (`.msi`) from
  [nodejs.org](https://nodejs.org) and run it with the defaults. Leave "Automatically install
  the necessary tools" unticked; you don't need it.

Close and reopen your terminal (macOS: **Terminal**; Windows: **PowerShell**), then:

```bash
node --version   # v22.x or higher
npm --version
```

### 3. The setup tool

Everything else (git, the GitHub CLI and signing in, your fork, the clone, the `work` branch,
VS Code, Codex, the course's packages) is done by a guided setup tool. In **Terminal** (macOS)
or **PowerShell** (Windows), go to the folder where you keep projects and run:

```bash
# macOS
curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -o setup.mjs && node setup.mjs
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/praiseisaac/netsim/HEAD/setup.mjs -OutFile setup.mjs; node setup.mjs
```

(The Windows path hasn't been tried on a real Windows machine yet. If something goes wrong,
tell me what it printed, and use "If the setup tool doesn't work for you" below.)

**How it works:** it opens **NetSim Studio** in your browser (keep the terminal window open;
Ctrl+C there stops it). The studio goes through the 15 steps **one at a time**:

- Each step says in plain words what it's for, explains every technical word, and **checks
  first** whether it's already done. Done steps get a ✓ and you press Enter to move on.
- If a step isn't done, the command is shown **greyed out** and **you type it yourself**, right
  in the studio: each correct character turns white, a wrong one turns red until you press
  Backspace. When it's all typed, **Run ↵** appears: press Enter and the studio runs it and shows
  what happened (**Show full output** for everything it printed).
- Nothing moves on by itself: every step ends with you pressing Enter. Optional steps have
  **Skip**. If something fails, the studio says what went wrong and how to fix it.
- **Rerun it any time** and it checks everything again from the top. Once the course is cloned,
  rerun it from inside the course folder with `npm start`. Prefer the terminal? `npm start --
  --terminal` walks the same steps there.
- **It's the whole course in one app.** Every class starts with `npm start` in your course folder:
  the studio gets the week, then shows its lesson page, your note, the board and the checks.

**The steps**, exactly as the studio shows them:

1. Is Node installed?
2. Is git installed?
3. Who should your work be signed by?
4. Install the GitHub tool
5. Sign in to GitHub
6. Let git use that sign-in
7. ChatGPT and the student offer (optional)
8. Make your own copy of the course
9. Download it to this laptop
10. Connect it to the course
11. Make your work branch
12. Put your branch on GitHub
13. Install VS Code (optional)
14. Install and sign in to Codex
15. Get the course's packages, then check everything

It asks you which folder the course should go in (step 9) and clones your fork into a `netsim`
folder there. Step 5 makes sure you're signed in as **your** GitHub account; if the laptop is
signed in as someone else, it tells you.

One thing it can't do: the **Codex extension for VS Code**. Install it by hand: in VS Code,
**Extensions** (the squares icon) → search **Codex** → install **Codex** by OpenAI (id
`openai.chatgpt`), open it from the side bar and choose **Sign in with ChatGPT**.

**The last step, `npm run doctor`,** checks your whole setup in one go and prints one line per
check: ✓ passed, ✗ failed (with a `→` hint underneath saying how to fix it), or ! a warning you
can ignore. You can run it yourself any time from the course folder. The eight checks are:

1. Node 22 or newer
2. git knows who you are
3. on the 'work' branch
4. 'upstream' remote set
5. origin is your fork
6. you can push to your fork: checks that the GitHub account git pushes as (your SSH key or gh
   login) is the one that owns your fork
7. dependencies installed
8. Codex CLI installed

plus a warning-only check for VS Code's `code` command. Fix whatever is ✗ (usually by rerunning the setup tool)
and run it again until the last line says:

```
doctor: all 8 checks passed
```

✅ **Check:** the last line is `doctor: all 8 checks passed`. Open the project in VS Code:
`code .`

## If the setup tool doesn't work for you

Do the same setup by hand. You've already done the accounts (1) and Node (2).

**M1. git.**

- **macOS:** run `git --version`. If git isn't installed, macOS offers to install the
  "command line developer tools": say **Install**, wait, then run it again.
- **Windows:** download **Git for Windows** from [git-scm.com](https://git-scm.com) and install
  it with the defaults. It includes **Git Credential Manager**, which handles signing in to
  GitHub for you.

Then tell git who you are (use the email of your GitHub account):

```bash
git config --global user.name "Ada Lovelace"
git config --global user.email "you@example.com"
```

✅ **Check:** `git --version` prints a version; `git config user.name` prints your name.

**M2. Signing in to GitHub from the terminal.** You'll push your work to your fork, so git
needs to know it's you. Pick **one** way; either works for the whole course. If you're not sure,
use HTTPS.

**HTTPS (simplest).** Install the **GitHub CLI** ([cli.github.com](https://cli.github.com);
macOS `brew install gh`, Windows the `.msi` installer), then:

```bash
gh auth login      # GitHub.com → HTTPS → Login with a web browser
gh auth setup-git  # make git use that login when it pushes
```

When `gh auth login` asks **"Authenticate Git with your GitHub credentials?"**, answer **Yes**.
(Windows alternative: skip `gh`; your first `git push` opens a GitHub sign-in window.)

> **If git ever asks for your password, don't type it** (GitHub rejects passwords): run
> `gh auth login`, then `gh auth setup-git`.
>
> **Signed in to `gh` with another account** (a work or old account)? Switch with
> `gh auth switch --user <you>`.

**SSH.** Make a key (press Enter to accept the defaults):

```bash
ssh-keygen -t ed25519 -C "you@example.com"
```

Add the **public** key to GitHub: Settings → SSH and GPG keys → **New SSH key**, and paste the
output of:

```bash
cat ~/.ssh/id_ed25519.pub         # macOS
type $HOME\.ssh\id_ed25519.pub    # Windows (PowerShell)
```

(Or, with the GitHub CLI: `gh ssh-key add ~/.ssh/id_ed25519.pub`.)

✅ **Check:** HTTPS: `gh auth status` says you're logged in, as *your* account. SSH:
`ssh -T git@github.com` says "Hi *your-username*! You've successfully authenticated" (type `yes`
the first time it asks about the host).

**M3. VS Code.** Download from [code.visualstudio.com](https://code.visualstudio.com) and
install.

- **macOS:** drag it into Applications. Then open VS Code, press **Cmd+Shift+P**, run **Shell
  Command: Install 'code' command in PATH**, so `code .` opens a folder from the terminal.
- **Windows:** keep **"Add to PATH"** ticked in the installer.

✅ **Check:** `code --version` prints a version (restart the terminal first).

**M4. Codex.** Two parts: the command-line tool and the VS Code extension. Both sign in with
your ChatGPT account.

```bash
npm install -g @openai/codex
codex --version
```

On macOS, if `npm install -g` fails with a permission error, run it again with the standalone
installer from the [Codex CLI docs](https://learn.chatgpt.com/docs/codex/cli) instead. On
Windows, if the npm install fails or `codex` isn't found afterwards, use the Windows install
option on the same page. Don't spend more than 10 minutes on it: the VS Code extension is
enough to do this week's exercise.

Then in VS Code: **Extensions** (the squares icon) → search **Codex** → install **Codex**
by OpenAI (id `openai.chatgpt`). Open it from the side bar and choose **Sign in with ChatGPT**.

Run `codex` once in any folder and choose **Sign in with ChatGPT** there too. Press Ctrl+C to
quit.

✅ **Check:** `codex --version` prints a version, and the Codex panel in VS Code answers a
question like "what is a WebSocket?".

**M5. Fork the starter repo.** On GitHub, open the course starter repo,
[github.com/praiseisaac/netsim](https://github.com/praiseisaac/netsim), click
**Fork**, and create the fork under your own account (the defaults are fine).

Your fork is **public**, like the starter repo: anyone, including your classmates, can see what
you push. That's normal on GitHub, and a public repo can go on your CV. It also means copying is
easy, which is why every week's grade depends on explaining your own work without notes or AI.

**M6. Clone your fork, connect it to the course, and make your `work` branch.** In the terminal,
go to the folder where you keep projects. Clone your fork with the kind of URL that matches how
you signed in (M2); everything after the clone is the same:

```bash
# HTTPS
git clone https://github.com/<you>/netsim.git netsim
# or SSH
git clone git@github.com:<you>/netsim.git netsim
```

Then connect it to the course and make your branch. The course repo is public, so `upstream`
can stay HTTPS either way:

```bash
cd netsim
git remote add upstream https://github.com/praiseisaac/netsim.git
git config --replace-all remote.upstream.fetch "+refs/tags/week-*:refs/remotes/upstream/week-*"
git fetch upstream
git switch -c work upstream/week-N   # your branch for the whole course (N = the course's current week)
git push -u origin work
```

- `origin` is **your fork**: where you push your work, and what gets graded.
- `upstream` is **the course repo**: where each new week comes from.
- `work` is **the one branch you'll use all course**. Every week you merge the new week into
  it; you never switch branches.

Already cloned with HTTPS and want SSH (or the other way)?
`git remote set-url origin git@github.com:<you>/netsim.git` (or the `https://` URL).

✅ **Check:** `git remote -v` shows both `origin` (your fork) and `upstream` (the course), and
`git branch --show-current` prints `work`.

**M7. Install and run the doctor.**

```bash
npm install
npm run doctor
```

`npm run doctor` then checks your setup the same way the tool's last step does (see above).

## In class (1 hour: setup)

The whole session is a **setup clinic**: everyone runs the setup tool (Setup, part 3), in pairs,
with me and your classmates helping. If you did it at home, help your neighbour. When you're green, help the pair next
to you. Put a green sticky note on your laptop when `npm run doctor` passes, a pink one if
you're stuck.

If there's time at the end, I'll run the finished computer on the projector: the bus,
the CPU with two cores, memory, a button, an LED, and the dashboard drawing every message live.

## Take-home

Due before next session.

1. **Finish setup.** `npm run doctor` all green on the laptop you'll bring every week.
2. **Map the system.** Open [ARCHITECTURE.md](../ARCHITECTURE.md) and read "The big picture"
   and "File layout". On paper, draw the computer you're going to build: the bus, the clock,
   the CPU, memory, a button, an LED, and the dashboard. Label each one with its job in a few
   words. Then find each part in the file tree: which folder is the bus? Where will the CPU's
   logic live? Where does the dashboard live? Keep the drawing: you'll use it in your
   explain-it-back. Think about:
   - Who owns time? Why not let every part keep its own clock?
   - What does the bus know about CPUs? (Look at `bus/server.ts`.)
   - If a button is pressed in the middle of a tick, when does the CPU find out?
3. **First Codex session, with the rules on.** Open the Codex panel and ask:
   *"What is this project, and what am I supposed to do in week 1?"* It answers from the course
   files, including `AGENTS.md` (see "Using Codex in this course" below). Then ask it to
   "write the handshake in components/client.ts" (that's week 3's work; don't keep what it
   writes). Notice that it asks you how you want to approach it, or offers you two options,
   before it writes anything. That's the course's rule: **you decide the design, Codex can do
   the typing.**
4. **Write your week-1 notes** in `docs/notes/week-01.md`. The file is there with three
   headings, each with a `<!-- TODO(week 1, …) -->` comment under it. Write under each heading
   (you can delete the comment; comments don't count toward anything):
   - **`## npm run doctor output`:** paste everything it prints inside a ```` ```text ````
     block, ending with `doctor: all 8 checks passed`.
   - **`## Codex: what bus/server.ts does`:** ask Codex to explain `bus/server.ts` to you (ask
     follow-up questions too). Then close the chat and write, **in your own words**, what the
     bus does: who connects to it, what it does on each tick, and why it waits before starting
     the next tick. At least 60 words.
   - **`## One thing I checked myself`:** pick one thing Codex told you and check it by
     reading the code yourself. Say what the claim was, where in `bus/server.ts` you found the
     answer (a function name or line), and whether Codex was right.
5. **Commit and push your `work` branch.**

   ```bash
   git add -A
   git commit -m "week 1: setup and notes"
   git push
   ```

### Acceptance criteria

- [ ] `npm run doctor` ends with `doctor: all 8 checks passed` on your laptop.
- [ ] `npx vitest run tests/week-01` passes. `setup.test.ts` checks your notes are really
      filled in: the doctor output, your own summary, and the thing you checked.
- [ ] Your summary is in your own words: you could say the same thing out loud, without notes.
- [ ] `work` is pushed to your fork (check on GitHub that your commit is there).

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `node setup.mjs` / `npm run setup` | the guided setup tool (the second once you're in the course folder) | ✅ |
| `npm start` | NetSim Studio: setup, then every class (its page, note, board and checks) | ✅ |
| `npm install` | installs the project's packages | ✅ |
| `npm run doctor` | checks your setup: 8 checks, one line each, `→` hints for failures | ✅ |
| `npx vitest run tests/week-01` | this week's test (your notes) | ✅ once your notes are written |
| `npm run bus` | starts the bus on port 3006 (Ctrl+C to stop) | ✅ it runs; nothing connects yet |
| `npm run component -- …`, `npm run dev:all` | the parts you build later | ❌ from week 3 onwards (`npm run hello` is a stretch module) |

Tests that gate this week (`tests/week-01/`):

- `setup.test.ts`, four tests. It fails on a fresh copy of the course until you've done the
  setup and written your notes:
  - *runs on Node 22 or newer*
  - *has the npm run doctor output pasted in, with every check passing*
  - *explains bus/server.ts in your own words (60+ words)*
  - *says one thing you checked yourself*

## Explain it back

Before next session, explain your work to me without notes or AI: book a 5-minute slot with
me, or record a 3-minute video (your face and your screen, no notes) answering the two
questions I post after class. I may also ask one or two people live at the start of class. Be
ready to:

1. **Show your drawing of the system** (from the take-home): bus, clock, CPU, memory, a couple
   of devices, the dashboard. Say what each one's job is.
2. **Why does the bus hold the clock** instead of each component keeping its own time?
3. **Explain `bus/server.ts` in your own words**, the way you wrote it in your notes. Then
   answer one follow-up question about it.
4. **Show your setup:** `origin` vs `upstream` vs `work`. Where do new weeks come from, and
   where does your work go?

## Using Codex in this course

You're allowed, and encouraged, to use Codex, including to write code for the `TODO(week N, …)`
regions. The rule is: **Codex can help with the writing, but you guide the design.** You decide
what to build, how it's structured and which approach to take; Codex types it and explains it;
you make sure you understand every line before you keep it.

**What `AGENTS.md` makes it do.** Your copy of the course has an `AGENTS.md` file at the top.
Codex reads it automatically and follows it:

- Before writing code, it **asks how you want to approach it**, or offers two short options with
  the trade-off, and lets you choose. It doesn't pick for you.
- It **follows your design**, even if it would have done it differently. If it sees a real
  problem, it says so and you decide.
- It **explains what it wrote**, including the hardware idea behind it, and asks you to run the
  tests.
- It **never edits the tests** to make them pass.
- It leaves the **own-words sections of your notes** (like "Codex: what bus/server.ts does") to
  you: those check *your* understanding.

**Good ways to use Codex:**

- "I want to do this with a Map from id to callback. Write it that way and explain each line."
- "Give me two ways to structure this, with the trade-off, and I'll pick."
- "This test fails with this error. What is it telling me?"
- "Walk me through what you just wrote, line by line. Why this and not that?"
- "Quiz me on this week's ideas before my explain-it-back."

**What you must do yourself:** make the design decisions (the approach, the structure, what
goes where), and be able to explain every line you keep: what it does, why it's there, and the
hardware idea behind it. If Codex writes something you can't explain yet, don't keep it until
you can: ask it to walk you through it, or rewrite it your way.

**Why explain-it-back is no-AI.** Each week's work is checked in a short explain-it-back with me
before the next session (a 5-minute slot or a 3-minute video), without notes or AI, where you
explain your code and the design choices you made.
That's what's graded, together with the tests. Codex can write code with you; it can't
understand it *for* you. A good rule: if you can't explain a line, you don't have it yet.

| Fine to ask Codex this week | You must be able to explain yourself |
|---|---|
| "How do I install Node 22 on Windows?" | What `origin`, `upstream` and `work` are for |
| "Explain what `bus/server.ts` does" | What the bus does, in your own words |
| "What does this `npm run doctor` error mean?" | Why the bus owns the clock |
| "What is a WebSocket?" | What each part of the system is for |

## Stretch

- Open `docs/notes/design-note-template.md`: next week you design the bus and memory on paper with
  it, and in week 3 you build what you designed.
- Read ARCHITECTURE.md's "A clock tick, step by step" diagram and follow one `mem.read` from
  the CPU to Memory and back.
- Ask Codex to quiz you with five questions about the big picture. Answer them without looking.
