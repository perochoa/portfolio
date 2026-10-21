# Alexander Perocho: portfolio

Personal site and blog for Alexander Perocho, built with [Astro](https://astro.build).

## Stack

- Astro 7, static output (no adapter, no client JS)
- Blog posts are Markdown in `src/content/blog/`, loaded through a content collection (`src/content.config.ts`)
- Images go through `astro:assets` from `src/assets/`
- RSS feed (`@astrojs/rss`) and sitemap (`@astrojs/sitemap`)

## Commands

Requires Node `>=22.12.0`.

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Install dependencies                            |
| `npm run dev`     | Start the dev server at `localhost:4321`        |
| `npm run build`   | Build the static site to `./dist/`              |
| `npm run preview` | Preview the production build locally            |
| `npm run check`   | Type-check `.astro`/`.ts` files and content     |

## Deploy

The site is a static build deployed to GitHub Pages at [perocho.com](https://perocho.com).
`site` in `astro.config.mjs` must match that domain, so canonical URLs, the RSS feed and the
sitemap point at the real host. `public/CNAME` holds the custom domain, which is also set under
the repository's Settings > Pages.
