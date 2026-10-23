# AGENTS.md

Guidance for AI coding assistants working in this repository. `CLAUDE.md` is a symlink to this file, so
edit `AGENTS.md` and never put `@AGENTS.md` in it (it would import itself).

Personal site and blog for Alexander Perocho: Astro 7, static output (no adapter, no client JS),
deployed to GitHub Pages at https://perocho.com.

## Commands

Requires Node `>=22.12.0`.

- `npm run dev`: dev server at `localhost:4321`. Run it in the background with
  `npx astro dev --background`, and manage it with `astro dev stop|status|logs`
- `npm run build`: static build to `dist/`; `npm run preview` serves it
- `npm run check`: `astro check`, which type-checks `.astro`/`.ts` files and validates blog
  frontmatter against the collection schema

There is no test suite or linter. Verify a change with `npm run check` and `npm run build`, then
look at it in `npm run preview`.

## Architecture

- **Blog posts** are Markdown in `src/content/blog/`. The slug is the filename. Frontmatter is
  validated by the schema in `src/content.config.ts` (`title`, `description`, `pubDate`, optional
  `updatedDate`, `heroImage` from `src/assets/`, and `draft`).
- **Always load posts through `getPosts()`** in `src/posts.ts`, never `getCollection('blog')`
  directly. It drops `draft: true` posts from production builds (they still show in dev, with a
  "Draft" badge) and sorts newest first. The home page, blog index, post routes and RSS all use it.
- **Internal links go through `withBase()`** (`src/utils.ts`). The base is currently `/`, so it
  does nothing yet, but it keeps links correct if a `base` comes back.
- **Site-wide constants** (title, description, social links, the contact email) live only in
  `src/consts.ts`.
- **Layouts**: every page uses `BaseLayout`, which renders `BaseHead` (global CSS, fonts,
  canonical/OG/RSS meta), `Header` and `Footer`. Post pages wrap that in `BlogPost`.
- **Styling**: design tokens are CSS variables in `src/styles/global.css` (`--bg --surface --text
  --muted --border --accent`, `--measure`, `--wide`). Dark mode is automatic through
  `prefers-color-scheme`. Use the `.mono` and `.serif` utility classes. Page-specific styles go
  in scoped `<style>` blocks.
- **Fonts** (Geist, Geist Mono, Instrument Serif) come from Google at build time through Astro's
  fonts API in `astro.config.mjs`. Shiki uses dual themes (github-light/github-dark).

## Deploy

Pushing to `main` deploys through `.github/workflows/deploy.yml` (withastro/action, then
actions/deploy-pages). `site` in `astro.config.mjs` must stay `https://perocho.com`, because
canonical URLs, the RSS feed and the sitemap are built from it. The custom domain is set in the
repo's Pages settings. `public/CNAME` is kept as well, although the Actions deploy ignores it.

## Content rules

- Posts derived from the author's job stay drafts and contain no internal names (tickets,
  tenants, buckets, repos, team names) until the author approves publishing them.
- When a post is rewritten, keep its slug and `pubDate` and add `updatedDate`.

## Gotchas

- Astro removes a line break that sits right next to a tag, so `text\n<a>` renders as `text<a>`
  with no space. Put the break between plain words instead. To find cases:
  `grep -rhoE '[A-Za-z,.]<a href|</a>[A-Za-z(]' dist --include=*.html`
- `main` squash-merges PRs.
