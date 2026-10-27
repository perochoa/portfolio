---
title: "Teaching My AI Coding Assistants to Stop Repeating Mistakes"
description: "One instructions file shared by every assistant, a corrections log that turns repeated feedback into rules, and hooks for the rules that keep getting broken."
pubDate: "Oct 19 2026"
---

I use AI coding assistants every day, mostly Claude Code and sometimes GitHub Copilot's CLI. For a while, the most annoying part wasn't wrong code. It was repeating myself. I'd tell an assistant not to commit to `main`, or that my Python environments are pyenv virtualenvs and not `.venv` folders, and the next session it had forgotten.

So I moved my assistant setup into [my dotfiles](https://github.com/perochoa/dotfiles), next to my shell and Neovim config, and built it around one idea: **every correction should only have to happen twice.** The first time, it gets written down. The second time, it becomes a rule or a check.

## One instructions file for every assistant

Each tool has its own file for global instructions: `~/.claude/CLAUDE.md` for Claude Code, `~/.copilot/copilot-instructions.md` for Copilot. Rather than keeping two copies in sync, I write one file, `ai/AGENTS.md`, and my bootstrap script symlinks it to both places. Skills (packaged procedures in `SKILL.md` files) work the same way: one `ai/skills/` folder, linked into each tool's skills directory.

`AGENTS.md` holds my preferences, organized by topic:

- **Python:** use pyenv virtualenvs and pin them with `pyenv local`, and never install into the system Python.
- **Git:** never commit, push, merge, or rebase on `main`. Branches are named `<type>/<short-description>`. Commit messages are short, lowercase, and prefixed with the branch name. Never credit an AI as an author.
- **Session handoffs:** keep a per-branch notes file so the next session can pick up where this one left off (more on that below).
- **Learning from corrections:** the loop described in the next section.

Anything specific to one tool, like Claude Code's `settings.json`, lives in its own `ai/<tool>/` folder.

## A log of corrections

The part I'm proudest of is the simplest. When I correct how an assistant works (not a one-off detail of the task, but a preference about *how* it should behave), it appends a line to a log file:

```text
- 2026-10-19 | global | <the correction, one line> | seen
```

Before logging, the assistant checks the log and the existing rules for something with the same meaning, even if it was worded differently. If it finds one, that's the second time, and it has to **ask me** whether to codify it, suggesting where:

- a global rule in `AGENTS.md`,
- a project rule in that repo's `CLAUDE.md` or `AGENTS.md`,
- or a hook, if a written rule already exists and was broken anyway, or the behaviour is mechanical enough to check automatically.

The status column then records what happened: `codified: <where>`, or `declined`, which means don't ask about it again. The log is machine-local and not committed, because it's a scratchpad, not documentation.

Assistants are bad at noticing that something *was* a correction, so a small hook helps. Before every prompt is sent, `correction-check.py` looks for phrases like "don't", "from now on", "I told you", or "I'd like". If it finds one, it adds the recent log entries to the context with a reminder to follow the process. It never blocks anything. False positives are cheap, because the assistant just ignores the note when the prompt wasn't really a correction.

## Rules that can't be skipped

Written rules are suggestions. A model will usually follow them and occasionally won't, especially deep into a long task. For the rules I really care about, a hook enforces them.

`git-guard.py` runs before every shell command Claude Code executes. It splits the command into its parts (so `git add . && git commit -m "..."` gets checked too), reads the commit message (even from a heredoc), and refuses the command if it would:

- change `main` or `master` directly,
- create a branch that doesn't match the naming pattern (a repo can override that pattern with `git config ai.branchPattern`),
- force-push without `--force-with-lease`,
- or commit a message that has uppercase letters, a missing branch prefix, a subject over 72 characters, or AI attribution.

When it blocks a command, it explains why on stderr, which goes back to the assistant, so it can fix the problem and try again.

It isn't perfect. While writing this site, it rejected a commit with the message "add claude code workshop post", because "claude code" matches the attribution pattern. That's a false positive, and rewording the message was the right fix. I'd rather have a guard that's occasionally too strict on a commit message than one that occasionally lets a `Co-Authored-By` line through.

One design choice is deliberate: **the git guard fails open.** If it can't parse a command, it lets it through. That's the opposite of what I teach for secrets in [my Claude Code workshop](../claude-code-workshop/), where a broken guard should block everything. The difference is the stakes. A git rule slipping through costs me a reworded commit. A leaked secret can't be taken back. How a guard should fail is a decision to make on purpose for each one, not a default to accept.

## Handoffs between sessions

I clear sessions often: new feature, new component, or a session that's simply run long. Each fresh session used to start by asking me things I'd already explained.

Now every repo keeps a handoff doc per branch: `.handoff/<branch>.md`, with sections for the goal, status, decisions (with the reason for each), gotchas, key files, and open questions. It's rewritten as the work goes, not appended to, so it stays short and true. A `SessionStart` hook reads the doc for the current branch and puts it in the new session's context, so it begins already knowing the state of the work.

There's one wrinkle. In a repo that already has a `CLAUDE.md` or `AGENTS.md`, the handoff docs are committed with the feature, like any other project notes. In a repo that doesn't, I don't want assistant config showing up in it, so the hook keeps the docs local and adds `/.handoff/` to that repo's `.git/info/exclude`, never to `.gitignore`.

## Subagents with a leash

The most elaborate piece is a pair of subagents. An `architecture-auditor` reviews a repo against best practices for its stack and writes a report with a numbered simplification roadmap. An `architecture-implementer` applies steps from that roadmap, and nothing else.

A hook enforces the "nothing else":

- It records each finished audit report under an ID.
- The implementer's prompt must be exactly `audit: <id>` and `steps: <which ones>`, naming a recorded audit for the current repo. The hook replaces the prompt with the actual report, so the implementer works from what the auditor wrote, not from a paraphrase.
- The implementer can only edit files the report cites.
- When it tries to finish, the hook checks every change against the report and blocks the stop until anything uncited has been reverted.

Splitting "decide what to change" from "change it" turned out to be useful well beyond AI. It's the same separation as a design review followed by implementation, and it makes it obvious when the implementation wandered off.

## Testing the config

Since this is real software, it has a check script. `scripts/check.sh` runs shellcheck and ruff, checks the syntax of every bash, zsh, and Python file, and then runs the bootstrap into a throwaway `$HOME` to verify the symlinks, the files created from templates, the backups, that running it twice changes nothing, and that the hooks behave. CI runs it on macOS and in a Fedora container.

## What I've learned

- **Write rules down before trying to enforce them.** Most corrections never come up a second time, and logging them costs nothing. The log shows which rules deserve a hook.
- **Hooks are for mechanical rules.** "Lowercase commit messages" is easy to check. "Write clear documentation" isn't, so it stays a written rule, with a skill that describes what good looks like.
- **Give the assistant the reason, not just the rule.** Every block message and every rule says *why*. An assistant that knows why `main` is protected makes better choices in the cases the rule doesn't cover.
- **This isn't only about AI.** Most of these are the guardrails I'd want for a new teammate too. The assistant just forgets faster.
