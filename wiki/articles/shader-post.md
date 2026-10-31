---
title: Post shaders
short: WGSL bloom, tonemapping, grading, colour science, sampling, beams and fire
category: Shader library
order: 24
see: shaderlib, post, shader-water, shader-sdf, palette-kit
---
**Post shaders** are the `post/` category of the [[shaderlib|shader library]], a set of WGSL functions for image processing and light effects. The category is registered in `shaderlib::post`. It covers a bloom chain, tonemappers, grading, lens effects, film grain, dither, colour spaces, sample sets, beams, volumetric light and fire. All functions start with `post_`. These are functions and not passes. The engine post-processing chain is a separate kit, described in [[post]].

## Files

| File | Provides | Requires |
|---|---|---|
| `post/color.wgsl` | `post_luminance`, `post_max3`, `post_min3` | None |
| `post/bloom.wgsl` | Soft-knee prefilter, 13-tap downsample, 9-tap upsample, combine | `post/color.wgsl` |
| `post/tonemap.wgsl` | ACES fitted and approximate, AgX, Reinhard extended, PBR Neutral | `post/color.wgsl` |
| `post/exposure.wgsl` | EV100 from camera or luminance, exposure, eye adaption | None |
| `post/grade.wgsl` | Lift, gamma, gain, saturation, contrast, white balance | `post/color.wgsl` |
| `post/lens.wgsl` | Vignette, chromatic aberration, ghosts, halo, starburst | `post/color.wgsl` |
| `post/grain.wgsl` | Film grain weighted by luminance | `noise/hash.wgsl`, `post/color.wgsl` |
| `post/sharpen.wgsl` | Unsharp mask, contrast-adaptive sharpen | None |
| `post/dither.wgsl` | Interleaved gradient, Bayer and triangular dither for output | `noise/hash.wgsl` |
| `post/glow.wgsl` | Emissive glow from a signed distance | None |
| `post/color_science.wgsl` | sRGB, HSV, OKLab, OKLCH, colour maps, palettes, vision deficiency | `post/color.wgsl` |
| `post/sampling.wgsl` | Point sets, warps, disc blur, bicubic filter | `noise/hash.wgsl` |
| `post/beam.wgsl` | Line light, decals, light cones, shields | None |
| `post/volumetric.wgsl` | Analytic in-scattering from a cone lamp | `post/beam.wgsl`, `post/dither.wgsl` |
| `post/fire.wgsl` | Physical flame colour and procedural fire shapes | `noise/fbm.wgsl`, `post/color_science.wgsl`, `post/tonemap.wgsl` |

## Conventions

The value `c` is linear RGB unless a header says otherwise, and HDR values above 1 are legal. Three headers mark the display-referred exceptions. `post/grain.wgsl` takes colour after the tonemapper. `post/dither.wgsl` takes display-encoded RGB after the sRGB encode. The colour maps `post_map_viridis`, `post_map_magma`, `post_map_inferno` and `post_map_turbo` return sRGB-encoded values, as do the fire ramps.[[src:warp_sdk/shaderlib/post/color_science.wgsl|// viridis, 6th order polynomial fit. sRGB encoded output.]]

`tex` and `samp` are arguments, so the caller binds them. `texel` is 1 over the size of the source texture, in UV units. `pixel` is a coordinate such as the fragment position, and `frame` is a counter. Seeds are `u32`. No post function calls `fwidth`. Functions such as `post_beam_decal_fill` take the width as an argument, and texture reads use `textureSampleLevel`.

## Output order

The headers imply one order for a final image: `post_exposure_from_ev100` multiplies linear HDR before the tonemapper, the tonemapper returns linear 0..1, the sRGB encode follows, and `post_dither_output` runs last, before the store.[[src:warp_sdk/shaderlib/post/dither.wgsl|// Add one quantum of triangular dither. Call this last, before the store.]] Grain runs after the tonemapper.

```wgsl
fn post_exposure_from_ev100(ev100: f32, comp: f32) -> f32
fn post_tonemap_aces_fitted(c: vec3<f32>) -> vec3<f32>
fn post_tonemap_agx(c: vec3<f32>) -> vec3<f32>
fn post_linear_to_srgb(c: vec3<f32>) -> vec3<f32>
fn post_film_grain(c: vec3<f32>, pixel: vec2<f32>, frame: u32, intensity: f32, response: f32, size: f32) -> vec3<f32>
fn post_dither_output(c: vec3<f32>, pixel: vec2<f32>, frame: u32, levels: f32) -> vec3<f32>
```

`post_exposure_adapt` moves the current EV toward a target with an exponential step that does not depend on frame rate. The header of `post/tonemap.wgsl` recommends AgX for bright saturated light such as fire, and PBR Neutral for keeping base colours true to sRGB.

## Bloom chain

Bloom is a set of functions for a chain that the game owns. The chain runs the prefilter, then a downsample for each mip with the Karis average on the first mip only, then an upsample for each mip that adds to the next larger mip, then the combine.[[src:warp_sdk/shaderlib/post/bloom.wgsl|// Chain: prefilter (soft-knee threshold), then downsample13 for each mip]]

```wgsl
fn post_bloom_prefilter(c: vec3<f32>, threshold: f32, knee: f32) -> vec3<f32>
fn post_bloom_downsample13(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texel: vec2<f32>, karis: bool) -> vec3<f32>
fn post_bloom_upsample9(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texel: vec2<f32>, radius: f32) -> vec3<f32>
fn post_bloom_combine(scene: vec3<f32>, bloom: vec3<f32>, strength: f32) -> vec3<f32>
```

The Karis average weights each 2x2 box by `1 / (1 + luma)`, which stops single bright pixels from flickering into large blobs. `threshold` is about 1.0 for HDR, `knee` is 0..threshold, and `strength` is 0..1, with 0.04..0.15 looking like a real lens. The combine is an energy-preserving mix, because "a lens spreads light, it does not add light".

## Grading and lens

`post_lift_gamma_gain`, `post_saturation` and `post_contrast` grade in linear light. Contrast works in log2 space about a pivot, 0.18 for mid grey, so HDR values stay stable. `post_white_balance` applies a von Kries scale in LMS space. It corrects for a light of the given colour temperature, so a low `kelvin` makes the image cooler. `post_tint_by_kelvin` is the inverse look.

`post_vignette` returns a factor. `post_vignette_cos4` gives the natural falloff of a real lens. `post_chromatic_aberration` reads three channels from a texture, with `amount` 0..0.02. `post_flare_ghosts` and `post_flare_halo` read a bright, thresholded, small mip, such as bloom mip 2. `post_starburst` is analytic and returns a weight for a light colour.

## Glow

`post/glow.wgsl` lights each pixel by its distance to the nearest edge, as a real emissive tube does. The header rejects a blurred sprite as the wrong method, because it loses thin strokes, dims corners and costs a blur pass.[[src:warp_sdk/shaderlib/post/glow.wgsl|// blurred sprite of the shape is the wrong method: it loses the thin]]

```wgsl
fn post_glow_shape(d: f32, aa: f32, radius: f32, color: vec3<f32>, core: f32, glow: f32) -> vec4<f32>
fn post_glow_over(bg: vec3<f32>, g: vec4<f32>) -> vec3<f32>
```

`d` is in pixels and negative inside. For a glyph atlas, the header gives `d = (0.5 - sample) * px_range`. The result is premultiplied emissive RGBA. The header advises writing it as HDR and letting `post/bloom.wgsl` add the wide spread.

## Colour science

`post/color_science.wgsl` holds `post_linear_to_oklab`, `post_oklab_to_linear`, `post_linear_to_oklch`, `post_oklch_to_linear`, `post_oklab_mix`, `post_hsv_to_rgb`, `post_palette_cosine`, `post_ramp3`, `post_blackbody_kang`, `post_posterize`, `post_quantize_dither`, `post_cvd_protanopia` and `post_cvd_deuteranopia`. `t` is a colour map position in 0..1. OKLab has L 0..1, and OKLCH has h in radians. `post_oklab_to_linear` can return a colour out of gamut. The comment says to clamp it or use `post_gamut_to_max1`.

`post_blackbody_kang` is more accurate below 4000 K than `post_kelvin_to_rgb` of `post/grade.wgsl`.[[src:warp_sdk/shaderlib/post/color_science.wgsl|// more accurate than post_kelvin_to_rgb (post/grade.wgsl) below 4000 K.]]

## Sampling

`post/sampling.wgsl` gives the i-th of n points without a table: `post_halton`, `post_hammersley`, `post_sobol`, `post_fibonacci_lattice`, `post_rank1_lattice`, `post_nrooks`, `post_jittered` and `post_cmj`. Warps move a uniform point to a shape: `post_vogel_disc`, `post_disc_concentric`, `post_annulus`, `post_gaussian_box_muller`, `post_tent2` and `post_triangle_uniform`. `post_blur_disc` is a 13-tap golden-angle blur, and `post_sample_bicubic` reconstructs with 4 bilinear taps, which requires a linear sampler. `water/refraction.wgsl` requires this file.

## Beams

`post/beam.wgsl` treats a line as a distance `d` from the pixel. `post_beam_glow` turns `d` into a crisp core and a `1/distance` halo, with an exponential cut so that a line does not light the whole screen.[[src:warp_sdk/shaderlib/post/beam.wgsl|// half width w. The halo is 1/distance with an exponential cut, so a line]]

```wgsl
fn post_beam_segment_dt(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> vec2<f32>
fn post_beam_glow(d: f32, w: f32, px: f32) -> vec2<f32>
fn post_beam_light(g: vec2<f32>, col: vec3<f32>, gain: f32) -> vec3<f32>
fn post_beam_finish(bg: vec3<f32>, c: vec3<f32>, exposure: f32) -> vec3<f32>
fn post_beam_shield(p: vec2<f32>, big_r: f32, cells: f32, hit: vec2<f32>, age: f32, px: f32, col: vec3<f32>) -> vec3<f32>
```

Colours add in HDR, and `post_beam_finish` maps them over the ground as `1 - exp(-c * exposure)`. `post_beam_curve_glow` has a shorter halo for sampled curves, where a long halo shows the creases at curve vertices. The file also holds a Henyey-Greenstein phase, `post_beam_cone`, ground decals with `post_beam_decal_fill` and related functions, and hex shields.

## Volumetric light

`post/volumetric.wgsl` computes in-scattering from a cone lamp in a 2D side view. The substitution `t = h tan(phi)` makes the singular inverse-square part analytic, and two 8-point Gauss-Legendre rules integrate the smooth remainder. Each sample is a smooth function of `p`, so the result has no hard edge at any zoom.[[src:warp_sdk/shaderlib/post/volumetric.wgsl|// smooth function of p, so the result has no hard edge, no polygon and]] PostVolCone carries the lamp, and `post_volumetric_cone_default` fills it with a half angle of 0.45, range 3.0 and anisotropy 0.6. The header gives this use:

```wgsl
var c = post_volumetric_cone_default(lamp_pos, lamp_dir);
let vis = post_volumetric_occlusion(occ_tex, samp, uv, lamp_uv, 24,
                                    post_dither_ign(frag.xy, frame));
let fog = lamp_col * 2.0 * post_volumetric_cone(world, c) * vis;
```

`post_volumetric_dither` then stops the smooth glow from banding.

## Fire

`post/fire.wgsl` has two halves. The physical half maps a simulation value `t`, where 0.3 is the break between smoke and flame, to a temperature, then to a colour by Planck's law against colour matching functions, with intensity `(T / Tmax)^4` and optional emission lines. The presets are `post_fire_palette_blackbody`, `post_fire_palette_wood`, `post_fire_palette_sodium`, `post_fire_palette_copper`, `post_fire_palette_potassium`, `post_fire_palette_gas` and `post_fire_palette_magnesium`. `post_fire_planck` integrates in 41 steps, and the header says that a game can bake it to a 1D table.[[src:warp_sdk/shaderlib/post/fire.wgsl|// Note: post_fire_planck integrates the spectrum in 41 steps of 10 nm.]]

The procedural half gives heat values from 0 to 2, in a space where x is centred on 0 and y runs from 0 at the floor to 1 at the top:

```wgsl
fn post_fire_column(uv: vec2<f32>, time: f32, width: f32, rise: f32, detail: f32) -> f32
fn post_fire_plume(uv: vec2<f32>, time: f32, width: f32, rise: f32) -> f32
fn post_fire_tongue(uv: vec2<f32>, time: f32, sharp: f32, speed: f32) -> f32
fn post_fire_coals(uv: vec2<f32>, time: f32) -> f32
fn post_fire_ramp_classic(t: f32) -> vec3<f32>
fn post_fire_present(heat: f32, contrast: f32, exposure: f32, glow: f32, ink: vec3<f32>, tone: vec3<f32>, cream: vec3<f32>) -> vec3<f32>
```

`post_fire_tongue` uses no noise. `post_fire_haze_uv` offsets UV for heat haze behind the fire.

## Interaction with other kits

- `creature_headlamp_cone` in [[shader-creature]] calls `post_volumetric_cone`.
- `water/sim_view.wgsl` in [[shader-water]] requires `post/color_science.wgsl`.
- `post_glow_shape` takes distances from [[shader-sdf]] or a glyph atlas.
