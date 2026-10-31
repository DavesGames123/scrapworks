---
title: Noise shaders
short: WGSL hashes, lattice noise, fBm, curl, domain warp and dither
category: Shader library
order: 20
see: shaderlib, shader-material, shader-terrain, shader-water, procgen
---
**Noise shaders** are the `noise/` category of the [[shaderlib|shader library]], a set of WGSL files that give hashes, lattice and cellular noise, fractal sums, curl fields, domain warp and per-pixel dither. The category is registered in `shaderlib::noise`. The terrain, post and pattern categories build on it, and every other noise in the library rests on its hash file. All functions start with `noise_`.

## Files

| File | Provides | Output |
|---|---|---|
| `noise/hash.wgsl` | PCG hashes, seeded lattice hashes, cell wrap, quintic fade, unit gradients | Floats in [0, 1) |
| `noise/value.wgsl` | Value noise in 2D and 3D, with derivative, tileable | [0, 1] |
| `noise/gradient.wgsl` | Perlin gradient noise in 2D and 3D, with derivative, tileable | [-1, 1], 0 on lattice points |
| `noise/simplex.wgsl` | Simplex noise in 2D and 3D, with derivative | [-1, 1] |
| `noise/cellular.wgsl` | Worley noise, cell border distance, smooth F1 | F1 and F2 about 0..1.5, cell id in [0, 1) |
| `noise/fbm.wgsl` | fBm, ridged, billow, eroded terrain form, tileable fBm | About [-1, 1], or [0, 1] for ridged and billow |
| `noise/curl.wgsl` | Divergence-free velocity fields | A vector, not unit length |
| `noise/warp.wgsl` | One-stage and two-stage domain warp | A warped point, or a struct |
| `noise/dither.wgsl` | Interleaved gradient noise, R2, Bayer, triangle dither | [0, 1), or (-1, 1) for the triangle form |

`noise/hash.wgsl` requires nothing. The value, gradient, simplex, cellular and dither files require it. `noise/fbm.wgsl` requires the gradient file, `noise/warp.wgsl` requires fBm, and `noise/curl.wgsl` requires both simplex and fBm.

## Parameter conventions

The files share these parameters:

| Parameter | Meaning |
|---|---|
| `p` | Any position, in cells. One unit is about one feature. The headers advise keeping `\|p\|` below about 1e5 |
| `seed` | Any `u32`. Two seeds give two unrelated fields |
| `period` | Cells before the noise repeats, `> 0`, in tiled forms only |
| `octaves` | 1..16. Each octave costs one gradient noise |
| `lacunarity` | Frequency step per octave. 2.0 is usual |
| `gain` | Amplitude step per octave. 0.5 is usual. Higher is rougher |
| `jitter` | 0..1 for cellular noise. 0 gives a square grid, 1 gives fully random points |

A name ending in `d` returns the value with its analytic slope: `vec3<f32>` as (value, d/dx, d/dy) in 2D, and `vec4<f32>` in 3D. The header of the gradient file gives the normal of a height field `k * value` as `normalize(vec3(-k * d.yz, 1.0))`.[[src:warp_sdk/shaderlib/noise/gradient.wgsl|// n = normalize(vec3(-k * d.yz, 1.0)) for a height field k * value.]]

## Hashes

`noise_pcg` hashes one `u32` lane, and `noise_pcg3d` hashes three lanes. `noise_u2f` converts a hash to a float. `noise_hash11`, `noise_hash21`, `noise_hash22`, `noise_hash31` and `noise_hash33` take floats and hash their bits. The lattice forms take an integer cell and a seed:

```wgsl
fn noise_lattice2(c: vec2<i32>, seed: u32) -> vec3<f32>
fn noise_wrap2(c: vec2<i32>, period: vec2<i32>) -> vec2<i32>
fn noise_fade2(t: vec2<f32>) -> vec2<f32>
fn noise_grad2(c: vec2<i32>, seed: u32) -> vec2<f32>
```

The fade is the quintic `6t^5 - 15t^4 + 10t^3`. Its first and second derivatives are zero at 0 and 1, so lattice noise has no creases.[[src:warp_sdk/shaderlib/noise/hash.wgsl|// Quintic fade 6t^5 - 15t^4 + 10t^3 and its derivative.]] Gradients are random directions on the circle or sphere and not a fixed set, so no direction is preferred.

## Lattice noise

Each of the three lattice families has a value form, a derivative form, and a 3D pair. The value and gradient families also have tiled forms.

```wgsl
fn noise_value2(p: vec2<f32>, seed: u32) -> f32
fn noise_perlin2(p: vec2<f32>, seed: u32) -> f32
fn noise_perlin2d(p: vec2<f32>, seed: u32) -> vec3<f32>
fn noise_perlin3(p: vec3<f32>, seed: u32) -> f32
fn noise_simplex2(p: vec2<f32>, seed: u32) -> f32
fn noise_simplex3d(p: vec3<f32>, seed: u32) -> vec4<f32>
```

Simplex noise uses the PCG lattice hash in place of the common mod-289 permutation, so the field does not repeat and it accepts a seed. Its kernel radius squared is 0.5, which keeps the field fully continuous.[[src:warp_sdk/shaderlib/noise/simplex.wgsl|// not repeat and works with a seed. Kernel radius squared is 0.5, so]] The 3D forms suit animation: time goes in the z coordinate, and the field changes in place.

## Cellular noise

```wgsl
fn noise_worley2(p: vec2<f32>, jitter: f32, seed: u32) -> vec4<f32>
fn noise_worley2_border(p: vec2<f32>, jitter: f32, seed: u32) -> vec4<f32>
fn noise_worley2_smooth(p: vec2<f32>, jitter: f32, k: f32, seed: u32) -> f32
```

`noise_worley2` and `noise_worley3` return (F1, F2, F2 - F1, cell id). The header advises F1 for pebbles and scales, F2 - F1 for cracks and cell walls, and the cell id for a random colour per cell.

`noise_worley2_border` gives the true distance to the nearest cell border and not the F2 - F1 estimate, so cracks keep a constant width. It returns (border distance, vector to the nearest point, cell id) and costs 9 + 25 hashes.[[src:warp_sdk/shaderlib/noise/cellular.wgsl|// True distance to the nearest cell border, not the F2 - F1 estimate.]] `noise_worley2_smooth` takes a soft minimum of the distances and has no creases at borders. Its `k` is 8 for a soft result and 32 for a result near F1.

## Fractal sums

```wgsl
fn noise_fbm2(p: vec2<f32>, octaves: i32, lacunarity: f32, gain: f32, seed: u32) -> f32
fn noise_fbm3(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32, seed: u32) -> f32
fn noise_ridged2(p: vec2<f32>, octaves: i32, lacunarity: f32, gain: f32, seed: u32) -> f32
fn noise_billow2(p: vec2<f32>, octaves: i32, lacunarity: f32, gain: f32, seed: u32) -> f32
fn noise_fbm2_terrain(p: vec2<f32>, octaves: i32, erosion: f32, seed: u32) -> f32
fn noise_fbm2_tiled(p: vec2<f32>, period: vec2<i32>, octaves: i32, gain: f32, seed: u32) -> f32
```

Each octave rotates and shifts the domain, so the octave lattices do not line up and no grid artefact shows.[[src:warp_sdk/shaderlib/noise/fbm.wgsl|// shifts the domain, so the lattices of the octaves do not line up and]] Sums are divided by the total amplitude. Each form clamps the loop to 16 octaves.

- `noise_ridged2` and `noise_ridged3` make sharp crests from `1 - |n|`, squared. Each octave is weighted by the one before it, so detail gathers on ridges.
- `noise_billow2` and `noise_billow3` sum `|n|`, which gives round puffs with sharp creases.
- `noise_fbm2_terrain` divides each octave by `1 + |slope so far|^2`. Steep slopes get less fine detail, as with real erosion. `erosion` 0 gives plain fBm, and 1 is strong.
- The tiled forms fix lacunarity at 2 and do not rotate, so that each octave tiles inside `period`.

## Curl and warp

`noise_curl2` builds velocity from the slope of a simplex potential, as `v = (d psi / dy, -d psi / dx)`. The field has zero divergence, so particles swirl and do not bunch up. The vector is not unit length, because the slow zones and fast lanes are part of the look.[[src:warp_sdk/shaderlib/noise/curl.wgsl|// Output: a velocity vector. The vector is not unit length: slow zones]]

```wgsl
fn noise_curl2(p: vec2<f32>, seed: u32) -> vec2<f32>
fn noise_curl2_fbm(p: vec2<f32>, octaves: i32, seed: u32) -> vec2<f32>
fn noise_warp2(p: vec2<f32>, amount: f32, octaves: i32, seed: u32) -> vec2<f32>
fn noise_warp2_iq(p: vec2<f32>, amount: f32, octaves: i32, seed: u32) -> noise_Warp2
```

`noise_warp2` returns a moved point, and the caller samples any noise there. `amount` is in units of `p`: 0.5..1 is subtle and 4 is the strong look. `noise_warp2_iq` is the two-stage form `f(p + a r(p + a q(p)))`. It costs five fBm calls and returns the final value with the two warp vectors `q` and `r`, which the header recommends as inputs for a colour ramp.[[src:warp_sdk/shaderlib/noise/warp.wgsl|// Two-stage warp f(p + a r(p + a q(p))). Costs five fBm calls.]]

## Dither

The dither file needs no texture. `pixel` is an integer pixel position such as `floor(frag_coord.xy)`.

```wgsl
fn noise_ign(pixel: vec2<f32>) -> f32
fn noise_ign_frame(pixel: vec2<f32>, frame: u32) -> f32
fn noise_r2(pixel: vec2<f32>) -> f32
fn noise_r2_point(n: u32) -> vec2<f32>
fn noise_bayer8(pixel: vec2<f32>) -> f32
fn noise_dither_tpdf(pixel: vec2<f32>, frame: u32) -> f32
fn noise_dither_rgb(pixel: vec2<f32>, frame: u32, levels: f32) -> vec3<f32>
```

`noise_ign_frame` advances by a step of 5.588238 and repeats every 64 frames. `noise_dither_rgb` gives an offset to add to a colour in [0, 1] before quantising to `levels` steps, for example 255.0 for 8 bit. Triangle dither removes banding and also the noise modulation that uniform dither leaves in dark gradients.[[src:warp_sdk/shaderlib/noise/dither.wgsl|// Triangle-distributed white noise in (-1, 1). Triangle dither removes]]

A similar set for final output is in [[shader-post]], in `post/dither.wgsl`.

## Usage

The sample below shades a fragment with animated fBm. It composes `noise/fbm.wgsl`, which pulls in the gradient and hash files.

```rust
let wgsl = warp_sdk::shaderlib::compose(&["noise/fbm.wgsl"]);
```

```wgsl
let v = noise_fbm3(vec3<f32>(uv * 5.0, time * 0.3), 5, 2.0, 0.5, 7u);
let grey = 0.5 + 0.5 * v;
```

The output of `noise_fbm3` is about -1..1, so a display maps it to 0..1.

## Interaction with other kits

- `noise/fbm.wgsl` is required by the terrain files `cave`, `dla` and `strata`, and by `post/fire.wgsl`.
- `noise/hash.wgsl` is required by the material, organic, creature, pattern and water categories.
- The [[lit2d]] example composes `noise/fbm.wgsl` for its material.
- CPU-side generation is a separate system. See [[procgen]].
