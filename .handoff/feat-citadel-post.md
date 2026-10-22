# feat/citadel-post: citadel blog post

## Goal
Blog post about the private citadel repo (backups for perocho.com DNS, Fastmail, Bitwarden) and the domain/email setup behind it.

## Status
- [x] src/content/blog/citadel.md written; build and `astro check` pass
- [ ] User review of the wording, then PR and merge

## Decisions
- citadel is private, so the post doesn't link it
- Left out anything that helps an attacker or isn't public: the DMARC report ID, the Pages verification token, keychain item names, and the non-public addresses (the Sieve sample uses placeholders; only contact@ is named, since it's on the site)
- Didn't mention the `_mta-sts` TXT record: there's no mta-sts.perocho.com policy host, so MTA-STS isn't actually in effect

## Key files
src/content/blog/citadel.md
