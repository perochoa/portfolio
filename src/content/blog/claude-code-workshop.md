---
title: "Beyond Autocomplete: Building a Claude Code Workshop"
description: "How I designed a hands-on workshop that teaches students to give an AI agent context and guardrails, what a dry run taught me about hooks, and what running it for 20 people taught me about setup."
pubDate: "Oct 19 2026"
updatedDate: "Nov 03 2026"
---

As VP of Western's Computer Science Undergraduate Society, I run our technical workshops. This term I built one myself: **Beyond Autocomplete: Building an AI-Native Dev Workflow with Claude Code**. It's hands-on, about two hours of modules, and aimed at second-year students and up who know Python, Git, and a terminal. I've since run it, and how that went is near the end.

Most students I talk to use AI as a smarter autocomplete, or as a chat window they paste errors into. That's fine, but it misses most of what these tools can do once you set them up for a codebase. The pitch for the workshop is one sentence:

> The AI is only as good as the context and guardrails you give it.

Every module adds one layer, and the goal is for students to _see_ the output get better as the layers stack up.

Attendees use two public repos: [csus-event-hub](https://github.com/perochoa/csus-event-hub), the app they work on, and [csus-event-hub-handouts](https://github.com/perochoa/csus-event-hub-handouts), the module handouts. More on why they're separate below.

## One app, deliberately messy

Toy examples don't show why context matters, because a toy fits in the model's head anyway. So everything runs on one sample repo, **CSUS Event Hub**: a small FastAPI and SQLite API for club events, members, and RSVPs. It's the kind of thing a club exec would hack together in a semester. It's messy on purpose. It has real bugs, missing tests, and a function nobody wants to touch.

That gives every module something real to do. Everyone works in the Code tab of the Claude desktop app rather than the CLI, so the setup is the same on every laptop. The modules are:

| Module                 | Layer                           | What students practise                             |
| ---------------------- | ------------------------------- | -------------------------------------------------- |
| Install and first task | The agent itself                | Onboarding to an unfamiliar codebase               |
| Project instructions   | `CLAUDE.md`                     | Building a feature the way the repo wants it built |
| Giving useful context  | `@` files, `/context`, `/clear` | Debugging                                          |
| Skills                 | `SKILL.md`                      | Writing tests with a repeatable procedure          |
| Custom agents          | `.claude/agents/`               | Code review                                        |
| Hooks                  | `settings.json`                 | Guardrails                                         |
| MCP servers            | External tools                  | Pulling data in from a Google Sheet                |

The first version ended with a capstone where students picked a ticket and ran the whole loop. I cut it: the modules before it were where the learning happened, and they needed the time more.

The cheat sheet in the handout boils the layers down to one line each:

- **Instructions** are what the AI should know.
- **Skills** are how to do a task.
- **Agents** are who does it.
- **Hooks** are what always happens, no matter what the AI decides.
- **MCP** is what it can reach outside the repo.

## Measuring context instead of preaching it

The module I'm happiest with is the one on context. Instead of telling people to write better prompts, students run an experiment: the same bug, two prompts. The bug is that deleting an event leaves its RSVPs behind, and because SQLite reuses the id, the next event you create already has "ghost" RSVPs nobody made. Run A is the lazy prompt:

> RSVPs are broken, fix it.

Then they throw the change away, `/clear`, and send run B:

> In @app/services/events.py, after I delete the newest event and create a new one, the new event already has the deleted event's RSVPs (`GET /rsvps?event_id=<new id>` isn't empty). Reproduce it with a failing test first, explain the root cause, then fix it. Don't change unrelated code.

After each run they go through the same checklist: did it fix the ghost RSVPs, did it only touch `app/services/events.py`, and did it add a test that reproduces the bug. The first version had partners fill in a shared yes/no table, which doesn't work when everyone has their own copy of the handout; a checklist per run, then "what did B get that A didn't?", keeps the comparison without the table.

The repo also has a decoy: an off-by-one in the RSVP capacity check, sitting right where a lazy prompt goes looking. Fixing the wrong bug confidently is a very convincing demo of what a vague prompt costs.

## Three repos, so the agent can't read the answers

The first version was one repo: the app, the handouts, and a chain of checkpoint branches (one per module) so anyone who fell behind could `git switch` back in. It had a problem I didn't see until I thought about it from the agent's side. An agent working in that repo could read the handouts, the branch names, and the commit messages, and all of them described the exercises. A lazy prompt doesn't look so lazy when the agent can find the bug report in a Markdown file next door.

So the workshop is now three repos:

| Repo                                                                             | What's in it                                           | Who sees it                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| [`csus-event-hub`](https://github.com/perochoa/csus-event-hub)                   | The app, its tests, and a plain README                 | Attendees clone it                           |
| [`csus-event-hub-handouts`](https://github.com/perochoa/csus-event-hub-handouts) | The module handouts                                    | Attendees clone it, _outside_ the app folder |
| `csus-event-hub-organizers`                                                      | Handouts, answer key, floater guide, module end states | Private, for organizers                      |

The app repo is built to give the agent **no** workshop context. `main` is a single commit (`chore/initial-import: import the event hub api`), so there's no history to mine. It has no `CLAUDE.md` or `.claude/` folder, because students write those during the modules. Nothing in its files, branches, or commit messages mentions the workshop, modules, or that it's messy on purpose. Its only other branch, `feat/event-search`, is one "teammate" commit that adds a search endpoint (with a SQL injection in it), so the code-review module has someone else's diff to review.

The private repo is the source of truth for the handouts. The public handouts repo is only ever regenerated by an export script, which strips each module's debrief and the floater guide and fails if any are left, so the two can't drift apart.

I also dropped the checkpoint branches. Students build every config file themselves, and each module only depends on the files the handouts tell them to create. For example, the instructions module has students paste a provided `CLAUDE.md` instead of running `/init`, so everyone ends up with the same file, and none of them accidentally includes a note about the bug that the context module needs the agent to find on its own.

## What the dry run taught me about hooks

We did a dry run before the real thing, and the hooks module changed the most. The handout's idea is that **instructions are suggestions and hooks are guarantees**. A hook is a command Claude Code runs at a fixed point, such as before a tool call, and it can block that call. Students add two: one that auto-formats code after every edit, and one that blocks the agent from reading `.env` files.

Three things came out of the dry run:

**A crashing guard is the same as no guard.** By default, if a hook command fails to run (say `python` isn't on the `PATH`), Claude Code treats that as "no objection" and the tool call goes ahead. A guard that silently stops guarding is worse than no guard, because you think you're protected. The fix is `"onFailure": "block"`, which fails closed: a broken guard stops everything, and you notice.

**`@` mentions skip tool hooks.** The `.env` guard is a `PreToolUse` hook, so it runs before the agent calls Read, Grep, Bash, and so on. But typing `@.env` in your own prompt pastes the file in directly, without a tool call, so the hook never sees it. A `permissions.deny` rule on `Read(./.env)` covers that path. Now the module has students try both, and see which lock stops which attempt.

**Hooks are a guardrail, not a sandbox.** Our guard looks for `.env` in the command text. It won't catch `grep -r PASSWORD .`. The debrief asks students to try that and think about it, because the real fix for secrets is not keeping them where an agent can reach them.

The dry run also turned up smaller, very practical fixes. The big one: a running session doesn't notice a brand-new agent, settings file, or connector, so the handouts tell students to `/clear` and start a fresh conversation after adding one, rather than wondering why nothing changed.

## Running it on Windows, too

Plenty of students run Windows, and a setup problem there can eat half a module. So the plan has a Windows section, and the repo was changed to match it, rather than leaving Windows users to fix things during the session:

- No `Makefile` as the main interface. The README has a table with the Mac/Linux and Windows command side by side.
- The virtual environment is never activated. Every command calls its Python by path (`.venv/bin/python`, or `.venv/Scripts/python` on Windows), so nothing depends on which shell is open or what's on the `PATH`.
- Hooks use `command` plus `args` instead of a shell string, and point at `${CLAUDE_PROJECT_DIR}/.venv/bin/python`, so the same hook works whatever folder Claude's shell is in. Windows users change that one path, and keep the forward slashes, because a backslash breaks the JSON.
- The `.env` guard splits paths on `/` or `\`, and also watches PowerShell commands, not just Bash.
- A `.gitattributes` file so line endings don't break scripts after cloning.

## Responsible use is part of the workshop, not a disclaimer

The workshop ends with a section that I think matters more than any of the tricks:

- **Academic integrity comes first.** AI policies differ by course and sometimes by assignment. This workflow is for personal projects, hackathons, internships, and courses that allow it.
- **You own every line you commit.** If you couldn't explain a diff in a code review or an interview, don't merge it.
- **Don't skip the fundamentals you'll be tested on.** Use agents to go faster on what you already understand, and to explain what you don't.
- **Protect secrets, and watch for prompt injection.** A shared doc, an issue, or a README can carry instructions aimed at your agent.

The first version of the MCP module planted a harmless injection in the Google Sheet students connect to, so they'd see one happen in a safe place. I took it out: in every dry run, Claude never followed it, so the "reveal" was a note nobody had noticed. The MCP module now sticks to connecting a tool and asking when you don't need one, and the injection warning stays as general advice.

## How it went

Mixed. Turnout was good, around 20 people, with a mix of macOS and Windows laptops. Which one you brought decided most of your session.

The macOS users breezed through it. Looking back, that was expected: every test and dry run happened on my own machines, which are macOS and Linux. They were set up in a few minutes and spent the session on the actual content, so I got to teach them the concepts behind Claude Code and agentic AI instead of debugging installers. They found it useful.

The Windows users had a much harder time. Everything in the Windows section above made the _repo_ work on Windows. None of it helps when the tools the repo needs aren't installed, or are installed but not on the `PATH`, and that's where most of the problems were. Some of the people who came also weren't developers, so they didn't have any of the requirements to begin with. We spent a good while getting basic commands to run.

Eventually the macOS users were so far ahead that the workshop turned into a self-paced one. That only worked because the handouts are hands-on and straightforward enough to follow on your own. The people whose setup worked kept going without me, and I spent most of my time with the Windows users, fixing their machines.

The lesson I'm taking away: **strict requirements, met before the workshop starts, matter as much as the content.** Every minute spent setting someone up comes out of the time for the thing they came to learn.

## What I took from it

Writing the workshop forced me to make my own habits explicit. I'd been using most of these layers at work and in [my dotfiles](https://github.com/perochoa/dotfiles), but explaining _why_ a rule belongs in a hook rather than in `CLAUDE.md` to a room of people seeing it for the first time is a much higher bar than just doing it. The dry run was humbling in a useful way: almost every fix was something I had never noticed, because my own setup had quietly worked around it. The repo split was the same lesson from a different angle: I'd built the workshop for students to read, and forgot that the agent would be reading it too.

Running it for real taught me that lesson one more time. My dry runs worked because they ran on my laptop, and a lot of the room wasn't on anything like it.
