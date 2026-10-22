# chore/cleanup: prune stale config

## Goal
Remove configuration left over from the Eleventy site and the resume sync, and keep the deploy workflow's actions current (Node 24).

## Status
- [x] Removed .github/workflows/sync-resume.yml (user)
- [x] checkout@v7, deploy-pages@v5, withastro/action@v6 (latest majors on 2026-10-22; v6 defaults to Node 24, same inputs)
- [x] CLAUDE.md now just imports AGENTS.md (`@AGENTS.md`); the two files were identical
- [x] Pruned resume-workflow and /portfolio/ references from .handoff/v2.md
- [ ] User decision: delete the orphaned repo secrets GOOGLE_CREDENTIALS and GOOGLE_DRIVE_FOLDER_ID (only sync-resume used them), and revoke the Google service account key behind GOOGLE_CREDENTIALS
- [ ] Commit 6af1401's message says deploy-pages "v7" but the file (correctly) has v5; rewording needs a force-push. User decision
- [ ] Open PR and merge

## Decisions
- Kept public/CNAME and withBase() (see .handoff/feat-custom-domain.md)
- Left the template's .gitignore entries (yarn/pnpm logs, .env.production): harmless

## Key files
.github/workflows/deploy.yml, CLAUDE.md, AGENTS.md
