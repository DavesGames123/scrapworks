# Scrap mockups - shared brief

Brand: company ScrapWorks, product Scrap (a game development tool). Wordmark is
"SCRAP" in industrial yellow (#FFC21A family), the C is a hexagonal open-end wrench
turned 30 degrees. Use shared/scrap-brand.js: [data-scrap-wordmark], [data-scrap-glyph],
and ScrapBrand.three(THREE, addons) for PBR wrench / nut / bolt / stage with bloom.
Do not edit shared/scrap-brand.js. Put page-specific helpers inline in the page.

Mood: black and yellow, industrial, metal, PBR 3D, glowing elements. Not grimy.
"Workshop kit with a polish pass": clean machined edges, brushed steel, painted
safety yellow, hazard stripes used sparingly, warm glows.

Head boilerplate (file:// safe; Safari 16.4+):
  <script src="shared/scrap-brand.js"></script>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  then an inline <script type="module"> that imports three, RoomEnvironment,
  EffectComposer, RenderPass, UnrealBloomPass, OutputPass from three/addons.
  The bloom threshold must be high (about 0.9+) so only glow materials bloom, not the paint.

Engagement structure (from research - all five pages follow it, each in its own visual language):
 1. Hero gets ~5 s: specific headline that says what Scrap does, one sub line,
    primary CTA with a concrete verb ("Download Scrap - free"), secondary path
    (docs / 90 s demo), microcopy under CTA ("Windows · macOS · Linux · no account").
    Text is the LCP element: render it in HTML first, load 3D after.
 2. One line of specific social proof directly under the CTA (numbers, not "trusted by thousands").
 3. Show the product early: a CSS-built editor mock or a 10-15 line code sample.
 4. 3-6 features with concrete claims (numbers, before/after), not adjectives.
 5. One interactive moment (toggle, slider, hover-reactive 3D, scroll-driven assembly).
 6. 2-3 specific testimonials with name, role, studio (placeholder people).
 7. Pricing/licensing clarity, then a repeated final CTA. Minimal nav (4-5 links + CTA).
 8. Performance: DPR cap 2, pause offscreen (the stage does this), honor
    prefers-reduced-motion, static SVG fallback if WebGL fails, mobile layout at 390 px.

Placeholder product facts (use consistently, all are placeholders):
 - Tagline idea: "The game engine workshop." / "Build games like you build machines."
 - Live Patch: code and asset hot reload in ~140 ms, play mode keeps running.
 - Parts Bin: drag .blend/.fbx/.gltf/.png/.wav in; auto-import, LODs, atlases.
 - Wiring: node-based visual scripting that compiles to readable Rust/C# (say "native code").
 - Chassis: data-oriented ECS runtime, 100k entities at 60 fps on a 2019 laptop.
 - Ship It: one-click export to Windows, macOS, Linux, Web, Steam Deck.
 - Teardown: frame profiler with per-system timings.
 - Free for teams under $250k revenue; Pro $24/seat/month; source-available.
 - Proof: "12,400 games built · 38k developers on Discord · 4.9 on itch.io" (placeholders).
