# Scrap mockups - shared brief (minimal pass)

Brand: company ScrapWorks, product Scrap (a game development tool).

## Mark
- Wordmark: `<span data-scrap-wordmark></span>` = S + C + RAP. The C is the head of an
  open-end wrench: a chamfered C with a half-hex-nut jaw, turned 10 degrees.
  Set `data-cap` to the display font cap height in em if the C looks off (Anton ~0.78).
- Icon: `<span data-scrap-glyph="icon"></span>` = the full wrench (head + handle), turned 35 degrees.
- 3D: `kit.wrench()` is the icon, `kit.wrench({variant:'letter'})` is the C only.
- Do not edit shared/scrap-brand.js. It sets text antialiasing, the favicon, and MSAA bloom.

## Minimal rules (the first pass read as "vibecoded": too much information)
- Visible copy, the whole page: about 120 words maximum. Count them.
- Sections, at most: nav, hero, one product moment, three features, final CTA, footer line.
  No testimonials. No pricing table. No logo strip. No stat rows. No FAQ.
- Nav: wordmark, two text links (Docs, GitHub), one Download button.
- Hero: one headline (max 6 words), one sentence under it (max 16 words),
  one primary button, one text link. One line of small microcopy is allowed.
- Features: exactly three. A two-word title and one short sentence each.
- No decorative labels: no "// 01", "STATION 01", monospace kickers over headings,
  tag chips, badges, fake console logs, fake version strings, or serial numbers.
- One interactive moment per page, at most. One 3D object (or one assembly), not a scatter.
- Type: one display face + one body face. Three sizes. Generous negative space.
- Color: near-black, one yellow, one gray for text. Glow on one or two elements only.
- Industrial feel comes from material (3D PBR metal, a fine texture, one edge light),
  not from more elements.

## Antialiasing
- Use the shared stage for WebGL (MSAA 4x on the bloom target, DPR cap 2).
- No 0.5px borders. No borders thinner than 1px. Hairlines: 1px, solid, low alpha.
- Do not put transform: scale / translate with sub-pixel values on text at rest.
- Do not animate text with filter: blur. Avoid text-shadow glow on body text.
- SVG: shape-rendering="geometricPrecision", strokes on whole or half pixels.

## Head boilerplate (file:// safe; Safari 16.4+)
    <script src="shared/scrap-brand.js"></script>
    <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
Then one inline module that imports three, RoomEnvironment, EffectComposer,
RenderPass, UnrealBloomPass, OutputPass. Bloom threshold about 0.9+.

## Placeholder copy (use only what fits the word budget)
- Scrap - the game engine workshop.
- Live Patch: code and assets reload in ~140 ms while the game runs.
- Wiring: visual nodes that compile to native code.
- Ship It: one click to Windows, macOS, Linux, Web, Steam Deck.
- Free for small teams. Download is free, no account.
