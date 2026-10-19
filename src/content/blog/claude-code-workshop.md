---
title: "Beyond Autocomplete: Building a Claude Code Workshop"
description: "How I designed a hands-on, 150-minute workshop that teaches students to give an AI agent context and guardrails, and what a dry run taught me about hooks."
pubDate: "Oct 19 2026"
---

As VP of Western's Computer Science Undergraduate Society, I run our technical workshops. This term I built one myself: **Beyond Autocomplete: Building an AI-Native Dev Workflow with Claude Code**. It's 150 minutes, hands-on, and aimed at second-year students and up who know Python, Git, and a terminal.

Most students I talk to use AI as a smarter autocomplete, or as a chat window they paste errors into. That's fine, but it misses most of what these tools can do once you set them up for a codebase. The pitch for the workshop is one sentence:

> The AI is only as good as the context and guardrails you give it.

Every module adds one layer, and the goal is for students to *see* the output get better as the layers stack up.

The attendee repo is public: [CSUS_Claude_Code_Workshop_2026](https://github.com/perochoa/CSUS_Claude_Code_Workshop_2026).

## One app, deliberately messy

Toy examples don't show why context matters, because a toy fits in the model's head anyway. So everything runs on one sample repo, **CSUS Event Hub**: a small FastAPI and SQLite API for club events, members, and RSVPs. It's the kind of thing a club exec would hack together in a semester. It's messy on purpose. It has real bugs, missing tests, and a function nobody wants to touch.

That gives every module something real to do. The modules are:

| Module | Layer | What students practise |
| --- | --- | --- |
| Install and first task | The agent itself | Onboarding to an unfamiliar codebase |
| Project instructions | `CLAUDE.md` | Building a feature the way the repo wants it built |
| Giving useful context | `@` files, errors, plan mode | Debugging |
| Skills | `SKILL.md` | Writing tests with a repeatable procedure |
| Custom agents | `.claude/agents/` | Code review |
| Hooks | `settings.json` | Guardrails |
| MCP servers | External tools | Pulling data in from Google Drive |
| Capstone | All of it | Pick a ticket and run the full loop |

The cheat sheet in the handout boils the layers down to one line each:

- **Instructions** are what the AI should know.
- **Skills** are how to do a task.
- **Agents** are who does it.
- **Hooks** are what always happens, no matter what the AI decides.
- **MCP** is what it can reach outside the repo.

## Measuring context instead of preaching it

The module I'm happiest with is the one on context. Instead of telling people to write better prompts, students pair up and run an experiment on the same bug. Partner A sends:

> RSVPs are broken, fix it.

Partner B sends:

> In @app/routes/rsvps.py, an event with capacity 50 accepts a 51st RSVP. Reproduce it with a failing test first, explain the root cause, then fix it. Don't change any other app code.

Then they fill in a scorecard together: did it fix the right bug, how many files changed, did it add a regression test, does that test fail without the fix, and how many follow-ups it needed. The difference is usually obvious, and students believe it more because they measured it themselves.

## Checkpoint branches, so nobody gets left behind

In a live-coded workshop, the student who falls behind in module two is lost for the rest of the evening. So the repo has a chain of checkpoint branches, one per module:

```text
main ─ 01-setup ─ 02-instructions ─ 03-context ─ 04-skills ─ 05-agents ─ 06-hooks ─ 07-capstone ─ solutions
```

Each branch adds exactly that module's config: the `CLAUDE.md` files, the skill, the reviewer agent, the hooks. Anyone who's stuck can commit their work and `git switch checkpoint/05-agents` to rejoin the room. I wrote scripts to rebuild the chain whenever `main` changes and to check every branch from a fresh clone. Keeping eight stacked branches consistent by hand is exactly the kind of chore that goes wrong the night before.

The code-review module also has a separate "teammate" branch with one new feature commit, so students can point their review agent at someone else's diff.

## What the dry run taught me about hooks

We did a dry run before the real thing, and the hooks module changed the most. The handout's idea is that **instructions are suggestions and hooks are guarantees**. A hook is a command Claude Code runs at a fixed point, such as before a tool call, and it can block that call. Students add two: one that auto-formats code after every edit, and one that blocks the agent from reading `.env` files.

Three things came out of the dry run:

**A crashing guard is the same as no guard.** By default, if a hook command fails to run (say `python` isn't on the `PATH`), Claude Code treats that as "no objection" and the tool call goes ahead. A guard that silently stops guarding is worse than no guard, because you think you're protected. The fix is `"onFailure": "block"`, which fails closed: a broken guard stops everything, and you notice.

**`@` mentions skip tool hooks.** The `.env` guard is a `PreToolUse` hook, so it runs before the agent calls Read, Grep, Bash, and so on. But typing `@.env` in your own prompt pastes the file in directly, without a tool call, so the hook never sees it. A `permissions.deny` rule on `Read(./.env)` covers that path. Now the module has students try both, and see which lock stops which attempt.

**Hooks are a guardrail, not a sandbox.** Our guard looks for `.env` in the command text. It won't catch `grep -r PASSWORD .`. The debrief asks students to try that and think about it, because the real fix for secrets is not keeping them where an agent can reach them.

The dry run also turned up a pile of smaller, very practical fixes: a running session doesn't notice a brand-new `.claude/skills/` or `.claude/agents/` folder until you reload or restart, and `git stash` leaves new untracked files behind, which breaks a branch switch.

## Running it on Windows, too

Plenty of students run Windows, and a setup problem there can eat half a module. So the plan has a Windows section, and the repo was changed to match it, rather than leaving Windows users to fix things during the session:

- No `Makefile` as the main interface. The README lists plain commands for each OS.
- Hooks use `command` plus `args` instead of a shell string, so the same `settings.json` works on macOS, Linux, WSL, and PowerShell, with or without Git Bash.
- Hooks call `python`, not `python3`, and students launch Claude Code from their activated virtual environment so `python` and `ruff` resolve everywhere.
- A `.gitattributes` file so line endings don't break scripts after cloning.
- WSL users clone into their Linux home folder, not under `/mnt/c/`, which is much slower.

## Responsible use is part of the workshop, not a disclaimer

The workshop ends with a section that I think matters more than any of the tricks:

- **Academic integrity comes first.** AI policies differ by course and sometimes by assignment. This workflow is for personal projects, hackathons, internships, and courses that allow it.
- **You own every line you commit.** If you couldn't explain a diff in a code review or an interview, don't merge it.
- **Don't skip the fundamentals you'll be tested on.** Use agents to go faster on what you already understand, and to explain what you don't.
- **Protect secrets, and watch for prompt injection.** A shared doc, an issue, or a README can carry instructions aimed at your agent. The MCP module includes a harmless planted one, so students see it happen once in a safe place.

## What I took from building it

Writing the workshop forced me to make my own habits explicit. I'd been using most of these layers at work and in [my dotfiles](https://github.com/perochoa/dotfiles), but explaining *why* a rule belongs in a hook rather than in `CLAUDE.md` to a room of people seeing it for the first time is a much higher bar than just doing it. The dry run was humbling in a useful way: almost every fix was something I had never noticed, because my own setup had quietly worked around it.
