---
title: Interface scale
short: the design-unit scale, the zoom keys and px()
category: Engine
order: 29
module: scale
see: renderer, widgets, palette, front-settings, hud
---
**Interface scale** is the factor by which Warp enlarges every interface measurement and font. The `scale` module of `warp_sdk` exposes nine items from the theme code of `warp_core`, and it is the one part of that theme code that a game receives. The scale is the fix for a problem that every game has, and the palette beside it stays behind.[[src:warp_sdk/src/lib.rs|the scale is the fix for a bug every game has.]]

## Why a game needs it

The engine locks egui to one point per physical pixel, on all platforms and displays. This lock is load-bearing, because pointer arithmetic, the camera and the CRT correction all count in physical pixels.[[src:warp_core/src/gui.rs|pixels_per_point = 1.0 on ALL platforms, ALL window sizes, ALL DPI]]

So a retina panel draws a 14 point label at 14 physical pixels, which is half the requested size. An interface written at the default egui sizes looks too small, and no display setting corrects that. Setting pixels per point on the egui context does not help either, because the engine writes that value every frame from three places.[[src:warp_sdk/src/lib.rs|that value every frame, from three places, so a caller cannot keep it.]]

Since the engine cannot give the lock up, the interface grows. Each measurement is a design unit, and `px` turns it into a pixel count.

## Default behaviour

A game normally writes nothing. `Renderer::auto_style` is true by default. Once per frame, before `gui`, the engine then runs the zoom keys and installs the Style at the resulting scale. So a game with no styling code answers Command with +, - and 0 and draws at editor sizes.[[src:warp_core/src/ui/theme/style.rs|The default a hosted game gets, before its own `gui` draws.]]

A game that returns false from `Renderer::auto_style` styles itself and calls the two functions directly. A host that runs its own zoom keys, such as the [[shell]], returns false so that one press does not step the scale twice.

```rust
warp_sdk::scale::zoom_keys(ctx, None);   // Command with +, - and 0
warp_sdk::scale::apply(ctx);             // the Style, at that scale
```

`apply` installs the Style on a context once per frame, before drawing.

## Values

| Constant | Value |
| --- | --- |
| `DEFAULT_UI_SCALE` | 2.0 |
| `MIN_UI_SCALE` | 1.0 |
| `MAX_UI_SCALE` | 4.0 |

The default of 2 matches a retina display, where the lock costs the most. `set_ui_scale` clamps to the range.

## The three terms

`px` multiplies a design unit by `ui_scale` and rounds to a whole pixel.[[src:warp_core/src/ui/theme/scale.rs|Turn a design unit into a pixel count.]] A game calls `px` in place of a literal for anything that it measures itself, such as a window width. A literal holds one pixel count at each zoom step while the text beside it grows.

```rust
scale::px(12.0)
```

Three terms make up the scale:

1. The stored setting, which `set_ui_scale` writes and the zoom keys step.
2. The window factor, measured per window. The source gives two failures that this corrects: a window on a 1x monitor drew at twice its size, and a torn-off window drew a third larger than the window it came from.[[src:warp_core/src/ui/theme/scale.rs|WHY ONE SCALE CANNOT SERVE TWO MONITORS]] A retina window reports 1, so nothing moves on such a panel.
3. The panel factor, a per-panel zoom in the editor. Panel zoom ranges from 0.4 to 2.5 against the chrome.

`chrome_scale` is the first two terms. `ui_scale` is `chrome_scale` times the panel factor, and it equals `chrome_scale` outside a panel body. The two factors are thread-locals, because `px` is reached from several hundred sites through constants, and a parameter would need the same change at each.

## Zoom keys

`zoom_keys` reads Command with `+`, `-` and `0`. Command is the egui `command` modifier, which is Cmd on macOS and Ctrl elsewhere. One press scales by 1.25, a share and not a fixed step, so the keys still respond at 400 percent. The keys step the stored scale and not `chrome_scale`, because on a window that blits, the window factor is above the step, and stepping the combined value made the minus key grow the interface.[[src:warp_core/src/ui/theme/scale.rs|minus key grew the interface the same way the plus key did.]]

The `panel` argument names the panel that receives keys. With a panel, the plain keys zoom that panel and Shift takes the chrome. With no panel, as in a game, the keys apply to the chrome.

The function must run once per frame in each window, because each window owns an egui context and a key press reaches only the focused context.

## Limitations

`scale` does not include the panel zoom functions, `window_scope` or `panel_scope`, which stay in the theme code of the engine. The palette of the editor chrome is deliberately not exported. For game colours, see [[palette]], and for finished controls, see [[widgets]].
