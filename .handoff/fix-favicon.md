# fix/favicon: replace the leftover astro favicon

## Goal
Every browser shows the "ap" monogram (public/favicon.svg), not the Astro logo that favicon.ico still held.

## Status
- [x] Regenerated public/favicon.ico (16/32/48) and added public/apple-touch-icon.png (180, full-bleed accent background) from favicon.svg
- [x] BaseHead: ico link has `sizes="32x32"` and comes before the svg link, plus an apple-touch-icon link. Build checked
- [ ] Open the PR and merge it

## Decisions
- Kept the existing monogram design; the task was only to stop serving the Astro logo
- `sizes="32x32"` on the ico stops Chrome from choosing the ico over the svg

## Gotchas
- Regenerate the raster icons after changing favicon.svg (S = scratchpad dir):
  `for n in 16 32 48; do rsvg-convert -w $n -h $n public/favicon.svg -o $S/fav-$n.png; done; magick $S/fav-{16,32,48}.png public/favicon.ico`
  `rsvg-convert -w 180 -h 180 -b '#c2410c' public/favicon.svg -o public/apple-touch-icon.png`
- The svg's text uses Georgia, so rasterizing on a machine without Georgia changes the glyphs

## Key files
public/favicon.{svg,ico}, public/apple-touch-icon.png, src/components/BaseHead.astro
