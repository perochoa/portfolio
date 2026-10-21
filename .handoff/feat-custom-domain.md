# feat/custom-domain: serve the site from perocho.com

## Goal
Move the site from perochoa.github.io/portfolio/ to the user's domain, perocho.com.

## Status
- [x] `site: "https://perocho.com"`, removed `base: "/portfolio"`, added public/CNAME, updated README. Build checked: no github.io or /portfolio/ URLs left in dist
- [ ] PR open; merge it
- [ ] User adds DNS records in Cloudflare (nameservers are anita/matt.ns.cloudflare.com; no records existed on 2026-10-21)
- [ ] Set the custom domain on the repo (Settings > Pages, or `gh api -X PUT repos/perochoa/portfolio/pages -f cname=perocho.com`), wait for the cert, then enable Enforce HTTPS
- [ ] Optional: verify the domain at the account level (Settings > Pages > Verified domains, TXT record) to prevent takeover

## Decisions
- Kept `withBase()`; with base "/" it is a no-op, and it keeps links correct if a base ever returns
- Records in Cloudflare must be "DNS only" (grey cloud) at least until GitHub issues the certificate; proxying blocks the Let's Encrypt check
- Apex A records: 185.199.108.153, .109.153, .110.153, .111.153 (AAAA 2606:50c0:8000::153 ... 8003::153); `www` CNAME to perochoa.github.io

## Gotchas
- With the Actions deploy, GitHub ignores public/CNAME; the domain must be set in the repo's Pages settings. The file is kept because Astro's docs recommend it
- Until DNS and the Pages setting are both done, the deploy from main will serve absolute URLs (canonical, RSS, sitemap) for perocho.com while the site is still reachable only at the old URL, where assets load from `/` and break. Merge and set the domain together

## Key files
astro.config.mjs, public/CNAME, src/utils.ts, README.md
