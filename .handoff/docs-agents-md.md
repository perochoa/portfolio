# docs/agents-md: restore agent instructions

## Goal
CLAUDE.md is a tracked symlink to AGENTS.md. Chore/cleanup (#7) wrote `@AGENTS.md` into that shared file, so it imported itself and the repo had no instructions. Restore real content.

## Status
- [x] AGENTS.md rewritten from /init: commands, architecture, deploy, content rules, gotchas (taken from README, source, and .handoff/v2.md)
- [ ] User review, then push and open a PR

## Decisions
- Kept the symlink and the `# AGENTS.md` heading rather than /init's "# CLAUDE.md" header, since other assistants read the same file

## Key files
AGENTS.md (CLAUDE.md -> AGENTS.md)
