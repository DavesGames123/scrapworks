# ScrapWorks website

The Scrap website, served at https://scrapworks.website by GitHub Pages from `main`.

    index.html              the homepage: the Assembly Line scroll build
    mockups.html            list of the five early directions
    01-foundry.html         early direction: conventional layout
    02-control-panel.html   early direction: faceplate and amber CRT
    04-machined.html        early direction: black anodized, centered
    05-forge.html           early direction: heat glow, embers
    shared/scrap-brand.js   logo parameters, wordmark, icon, favicon,
                            Three.js kit (stage, materials, soft geometry)
    shared/BRIEF.md         rules for the early directions
    design/                 logo labs and the logo study (not linked)

The early directions are frozen. Only index.html is developed.

All product copy on the pages is placeholder text.

## Research notes

These findings set the hero structure. Most published numbers come from vendor
blogs or single cases. Use them as a direction, not as a measurement.

- A visitor decides in about five seconds. The headline must say what the product
  does. A headline that fits three products is too vague.
- A specific CTA verb beats "Get started". Evil Martians changed "Build with us" to
  "Hire Martians", and clicks went from 1.3% to 2.0%.
- Developers want a second path: docs, a demo, or the source.
- Generic social proof ("trusted by thousands") did no better than none in a 2026
  benchmark.
- A crowded first screen loses developers before they find basic facts.
- 3D holds attention (one study, one site, self-report), but slow WebGL raises
  bounce on mid-range phones. Load 3D after the text, cap the DPR, and stop the
  render loop off screen.

Sources:
[Evil Martians](https://evilmartians.com/chronicles/how-to-kill-conversions-on-your-developer-tool-landing-page),
[peal.dev](https://www.peal.dev/blog/landing-page-developer-tools-conversion-what-works),
[DEV](https://dev.to/alpo190010/landing-page-best-practices-2026-what-actually-converts-from-someone-who-got-it-wrong-first-2f9e),
[FoundryCRO](https://foundrycro.com/blog/landing-page-social-proof-benchmarks-2026/),
[DesignRush](https://www.designrush.com/best-designs/websites/trends/how-3d-web-design-drives-real-ux-performance),
[WebGL performance](https://hyperyond-website.pages.dev/blog/webgl-performance-optimization-2025).
