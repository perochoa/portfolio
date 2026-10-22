---
title: "Citadel: A Backup Vault for My Domain, Email, and Passwords"
description: "Moving onto my own domain with Cloudflare DNS, Fastmail, and Bitwarden, then building a private repo that can rebuild all three from scratch, without a single plaintext secret in it."
pubDate: "Oct 22 2026"
---

This week I moved onto my own domain, `perocho.com`. The site you're reading is served from it, and so is my email. Owning the domain means I'm the one responsible when it breaks, so I also built **citadel**: a private repository with enough in it to rebuild my domain, my email, and my password vault from nothing.

This post covers both parts: the setup, and the backups.

## The stack

Three services, plus the one that was already hosting this site:

- **Cloudflare** is the registrar and DNS host for `perocho.com`, and its API is what makes the DNS backups below possible.
- **Fastmail** hosts the email. It supports custom domains directly, and its filters are written in Sieve, a standard language I can keep in a file.
- **Bitwarden** holds the passwords. It can export the vault in an encrypted format that doesn't need a Bitwarden account to open, which turns out to matter a lot.
- **GitHub Pages** serves this site, as before. Only the address changed.

## Moving the site onto the domain

The site is static Astro on GitHub Pages, so the move came down to DNS plus one config change: setting `site: "https://perocho.com"` and dropping the old `/portfolio` base path, so canonical URLs, the RSS feed, and the sitemap all point at the real host.

The DNS side is four `A` records and four `AAAA` records for the apex pointing at GitHub's Pages servers, plus a `www` CNAME. Three things caught me out:

- **Keep the records "DNS only" at first.** Cloudflare offers to proxy traffic (the orange cloud). With the proxy on, GitHub can't complete the Let's Encrypt check to issue the site's certificate, so the records have to be unproxied (grey cloud) until the certificate exists.
- **`public/CNAME` doesn't do anything here.** When Pages deploys from a GitHub Actions workflow, it ignores that file. The custom domain has to be set in the repo's Pages settings. I kept the file anyway, since Astro's docs recommend it.
- **Change both sides at once.** As soon as the new `site` config deployed, every absolute URL pointed at `perocho.com`, while the site was still only reachable at the old address. Merging the change and switching the domain needed to happen together.

I also verified the domain at the GitHub account level. That publishes a TXT record proving I own the domain, so nobody else can point a Pages site at it if my DNS ever ends up pointing at GitHub while my own repo isn't claiming it.

## Email on my own domain

Fastmail tells you exactly which records it wants: two `MX` records, three DKIM `CNAME`s that let Fastmail rotate signing keys without me touching DNS again, and an SPF record. On top of that, I added:

- a **DMARC** record, which asks receiving servers to send reports on mail that claims to be from my domain. It's at `p=none` for now, which means "report, don't reject". Once the reports show everything legitimate passes, I'll tighten it.
- a **TLS-RPT** record, for reports about encrypted delivery to my mail servers failing.
- **CAA** records that say only Let's Encrypt may issue certificates for the domain. GitHub Pages uses Let's Encrypt, so nothing else should ever need to.

### One domain, several addresses

The part I enjoyed most was the address scheme. Instead of one address for everything, I have a few, each with a job: a personal one, a public contact one (the one in this site's footer), one for invoices and receipts, one for DNS and DMARC reports, and one I use for logins and security alerts. There's also a subdomain set aside for per-service sign-up addresses, so if one leaks, I know exactly who leaked it and can turn off just that one.

Sieve filters sort them on arrival. Mail that just needs keeping, like receipts and reports, goes straight to a folder. Mail I need to see, like security alerts and messages from people, stays in the inbox and gets a label too, which Sieve does with `fileinto :copy`:

```sieve
# Filed away: never shows up in the inbox
if address :is "X-Delivered-To" "<receipts address>" {
  fileinto "INBOX.Billing";
  stop;
}

# Labelled, but stays in the inbox
if address :is "X-Delivered-To" "<contact address>" {
  fileinto :copy "INBOX.Hello";
}
```

The sign-up subdomain isn't live yet. Mail for a subdomain only arrives if that subdomain has its own MX records, and I haven't published them. I wrote that down in the repo instead of leaving a rule that looks like it works but quietly matches nothing.

## Why a backup vault?

Each of these services is reliable on its own. What worried me was what they depend on:

- My email depends on my DNS. Lose the MX records, and mail stops arriving.
- Every account, including Cloudflare and Fastmail, depends on my passwords.
- My passwords depend on Bitwarden, and on me being able to log in to it.

That's a chain, and the worst case is losing the first link. If I'm locked out of Bitwarden, I can't log in to Cloudflare to fix DNS, and I can't receive the password reset email either, because the mail runs through that same DNS. So citadel's README starts with a **recovery order**: Bitwarden first, then Cloudflare DNS, then Fastmail. Each folder has its own README that explains how to back up that service and how to restore it.

## DNS as code

At first the Cloudflare backup was just a zone file export. Then I moved to [DNSControl](https://docs.dnscontrol.org/), and a file called `dnsconfig.js` became the source of truth for every record:

```js
D("perocho.com", REG_NONE, DnsProvider(DSP_CLOUDFLARE),
  // Website: GitHub Pages
  A("@", "185.199.108.153"),
  // ...
  CNAME("www", "perochoa.github.io."),

  // Email: Fastmail
  MX("@", 10, "us1-smtp.messagingengine.com."),
  MX("@", 20, "us2-smtp.messagingengine.com."),
  // ...

  // Certificates: only Let's Encrypt may issue
  CAA("@", "issue", "letsencrypt.org")
);
```

Changing DNS now works like changing code. I edit the file on a branch, `dns.sh preview` shows the diff against the live zone, and `dns.sh push` applies it. The rule this creates is strict but useful: **nothing gets edited in the Cloudflare dashboard**, because the next push deletes any record that isn't in the file. Each group of records also has a comment saying what it's for, which I'll be grateful for the next time I wonder what a TXT record is for.

The zone file export stayed as a second backup. It's a snapshot of what's actually live, and it can be imported back into Cloudflare even without DNSControl.

### Two tokens, neither in the repo

DNSControl needs a Cloudflare API token, so I made two:

- a **read-only** token, for exports and previews,
- a **DNS edit** token, scoped to this one zone, used only for `push`.

Both live in the macOS keychain. The repo's `creds.json` only names the `$CLOUDFLARE_API_TOKEN` environment variable, and a small wrapper script fills it in from the keychain. The script picks the read token for `preview` and the edit token for `push`, so the token that can change things is only loaded when I'm actually changing things.

## Password exports that outlive the account

Bitwarden has two kinds of encrypted export, and the difference is easy to miss:

- **Account restricted** exports are encrypted with your account's key. They can only be imported back into the same Bitwarden account. If the account is gone, so is the backup.
- **Password protected** exports are encrypted with a separate password you choose, and can be imported into any Bitwarden account.

For a disaster backup, only the second kind makes sense. The export script, `bitwarden/export.sh`, only ever creates that kind. It unlocks the vault with the Bitwarden CLI, asks twice for the export password, writes the export, and then checks the file. If it isn't marked as password protected, the script deletes it and fails.

That leaves the problem every password manager has: a few secrets can't be stored in the password manager itself. The master password, the two-step login recovery code, and the export password all have to live somewhere that needs no devices at all. That's the one part of citadel that isn't in the repo, by design.

## A hook that refuses plaintext

The repo has one rule: **nothing in it is a plaintext secret.** A rule like that shouldn't depend on me remembering it, so a pre-commit hook checks every staged file. It refuses:

- `.env` files, private keys, and certificate bundles, by name,
- anything under `bitwarden/` that isn't the README, the export script, or a `.json` file,
- and any `.json` there that isn't actually a password-protected export.

The last check reads the file's contents, not just its name:

```bash
git show ":$1" | jq -e '.encrypted == true and .passwordProtected == true and (.data | type == "string")'
```

An unencrypted Bitwarden export is also a `.json` file, so the name proves nothing. A password-protected export carries both flags, and the vault data is a single encrypted string instead of readable items. The hook reads the staged version (`:$1`), so it checks exactly what's about to be committed, not whatever happens to be on disk.

The repo is also private, but I treat that as a second layer of protection, not the first. If something ever leaked, everything in it should still be safe to lose.

## The monthly routine

Backups that depend on me remembering to run them don't get run. A GitHub Actions workflow runs on the 1st of each month:

1. It exports the live Cloudflare zone. If the records changed, it pushes the new snapshot to a `chore/dns-snapshot-YYYY-MM` branch for me to review, never straight to `main`.
2. It runs `dnscontrol preview --expect-no-changes`. If the live zone and `dnsconfig.js` disagree, someone (me) edited the dashboard, and the job fails.
3. It opens a "monthly backup" issue with the results, plus a checklist for the parts that stay manual: a fresh Bitwarden export, and a check that Fastmail's filters still match `rules.sieve`.

The Bitwarden export stays manual on purpose. Automating it would mean giving GitHub my master password, which defeats the point.

A detail I had to add: every export comes with a new timestamp comment and SOA serial number, even when no record changed. Without filtering those out, there would be a "changed" snapshot every month. The workflow ignores those lines when it compares:

```bash
git diff --quiet -I '^;' -I '[[:space:]]SOA[[:space:]]' -- cloudflare/
```

The first runs failed for a much less interesting reason. I'd saved the token as a repo secret under one name and referenced it in the workflow under another. Then, once the names matched, I passed it to the scripts under the wrong environment variable. Two small fix PRs, both the same lesson: GitHub Actions replaces a missing secret with an empty string instead of failing, so a typo only shows up as a confusing error much later. The scripts do check for an empty token, which is the only reason the failures were obvious at all.

## What I'd tell someone doing the same

- **Map out what depends on what first.** The recovery order came straight from asking "if I lose this, what else do I lose?" Your email and your password manager are probably the two ends of that chain.
- **Write restore steps, not just backups.** A backup with no instructions for restoring it is a guess. Every folder in citadel says how to get the service back, including how to do it without my scripts.
- **Make the repo enforce its own rules.** "No plaintext secrets" is a sentence in a README, a check in a hook, and a check in the export script. The README explains it, and the other two make it true.
- **Write down what isn't covered.** The Cloudflare README ends with a list of settings the zone file doesn't capture, like redirect rules and the SSL mode. A known gap is far better than one I'd only find during a restore.
