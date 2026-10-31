---
title: Lit2d
short: Deferred 2D PBR lighting for material sprites
category: Look
order: 50
module: lit2d
example: lit2d
see: shaderlib, shader-material, post, camera, art-direction, gpu
---
**Lit2d** is the Warp deferred lighting renderer for 2D sprites, which shades each sprite as a surface with albedo, normal, roughness, metallic, height and emissive channels. It lives in `warp_sdk::lit2d` and its main type is `Lit2d`. One key light, a hemisphere ambient term and up to `MAX_POINT_LIGHTS` (256) point lights shade the surfaces, so a flat scene shows the specular highlights and bevel shading of a 3D scene, as Stella Nova does.[[src:warp_sdk/src/lit2d/mod.rs|scene then shows the specular highlights and the bevel shading of a 3D]] It is the code form of the [[art-direction#Everything is a lit material|art direction rule]] that every object is a lit material.

## How it works

The renderer has two passes. The G-buffer pass draws each instance as a quad and stores its MaterialSample in four targets. The lighting pass reads the four targets once per pixel and writes HDR colour into the engine HDR target, and the engine bloom and tonemap then process that colour.[[src:warp_sdk/src/lit2d/mod.rs|The engine bloom and tonemap then process that colour.]]

### G-buffer

| Target | Format | Contents |
|---|---|---|
| albedo | `Rgba8UnormSrgb` | albedo, coverage in alpha |
| normal | `Rgba8Unorm` | world normal encoded `n * 0.5 + 0.5`, coverage in alpha |
| surface | `Rgba16Float` | roughness, metallic, height, coverage in alpha |
| emissive | `Rgba16Float` | emissive, coverage in alpha |

Every target is premultiplied by coverage, so overlapping sprites blend with one blend state.[[src:warp_sdk/src/lit2d/gbuffer.wgsl|so overlapping sprites blend with one blend state.]] The material normal is in sprite space. The fragment stage turns it by the instance rotation. A near-zero normal becomes a flat normal. The stored height is the instance `z` plus the material height times `height_scale`. Roughness has a floor of 0.02 and a fragment under coverage 0.002 is discarded.

### Lighting

The lighting pass is one full-screen triangle. The viewer is straight above the plane, at direction (0, 0, 1).[[src:warp_sdk/src/lit2d/light.wgsl|The viewer is straight above the plane: v = (0, 0, 1).]] Each lit pixel sums these terms.

- **Key light.** Lambert diffuse plus Cook-Torrance GGX specular in a metallic workflow, with Smith height-correlated visibility and Schlick Fresnel. The source notes that these are the same terms as the Stella Nova rock shader.[[src:warp_sdk/src/lit2d/light.wgsl|Fresnel. The same terms as the Stella Nova rock shader.]] The result is scaled by pi, so intensity 1 on a white flat surface gives 1. The contact shadow multiplies this term only.
- **Ambient.** A hemisphere term from the normal for diffuse, and a rough specular from the reflection vector.
- **Point lights.** The same BRDF per light, with a windowed inverse-square falloff that reaches exactly zero at `radius`.
- **Emissive.** Added last, so a value above 1 feeds bloom.[[src:warp_sdk/src/lit2d/light.wgsl|added last, so a value above 1 feeds bloom]]

The result blends over the HDR target with the premultiplied blend state, with a load operation of `Load`. The lit output does not replace what is already there, and the engine scene layers then draw on top.

## Materials

There are two ways to submit a surface.

### Procedural material

A `Material` is game WGSL. The game writes one function, and `Lit2d` splices it into the G-buffer template and makes one instanced pipeline for it. Thousands of instances cost one draw call for each run of the same material.[[src:warp_sdk/src/lit2d/mod.rs|Thousands of instances]]

```wgsl
fn lit2d_material(uv: vec2<f32>, world: vec2<f32>, inst: Lit2dInstance) -> MaterialSample {
    var m = material_default();
    // Sprite space, y up, -1..1.
    let p = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    // Lamp: a glass dome over a hot core.
    let core = 1.0 - smoothstep(0.0, 0.55, length(p));
    m.albedo = vec3<f32>(0.9);
    m.roughness = 0.12;
    m.emissive = inst.tint.rgb * inst.params.x * (0.25 + core * core * 2.0);
    m.alpha = 1.0 - smoothstep(0.95, 1.0, length(p));
    return m;
}
```

`uv` runs 0 to 1 across the sprite with y down, and `world` is the world position. The normal is in sprite space: +x is the sprite right, +y is the sprite up and +z points to the camera. The `wgsl` string can hold more functions. `Material::with_shaderlib` adds [[shaderlib]] paths that the material calls, and `core/material.wgsl` is always included, which is where MaterialSample and `material_default` come from. `Material::gbuffer_wgsl` and `compose_gbuffer_wgsl` return the complete shader, so a test can validate a material with naga before it reaches a device.[[src:warp_sdk/src/lit2d/mod.rs|validate a material with naga before it reaches a device.]]

The example puts four surface kinds in one material and branches on `Lit2dInstance::kind`, so the whole scene is one instanced draw call.

### Sprite sheet

A `SpriteSheet` is three RGBA8 images of one size: `albedo` (sRGB colour and coverage), an optional `normal` (a tangent-space map encoded `n * 0.5 + 0.5`) and an optional `surface` (roughness, metallic, height and an emissive mask in rgba). A missing map gets a neutral value: a flat normal, roughness 0.8, metallic 0, height 0 and no emission.[[src:warp_sdk/src/lit2d/mod.rs|a flat normal, roughness 0.8, metallic 0, height 0, no emission.]] The built-in material reads `tint`, `uv_rect` and `params[3]`, which is the emissive gain.

## Instances

`Lit2dInstance` is one sprite: `pos` and `size` in world units, `rotation`, a base height `z`, and the free values `seed`, `kind`, `tint` and `params`, plus a texture sub-rectangle `uv_rect`. `kind`, `seed`, `tint` and `params` have no fixed meaning, because the game material gives them one. `Lit2dInstance::new` gives no rotation and a white tint, and builder methods set the rest. One instance occupies `Lit2dInstance::STRIDE` (80) bytes.

## Lifecycle

```rust
use warp_sdk::lit2d::{Lit2d, Lit2dInstance, Material, PointLight};

// Renderer::new
let mut lit = Lit2d::new();
let stone = lit.add_material(Material::new("stone", STONE_WGSL).with_shaderlib(&["material/stone.wgsl"]));
// Renderer::render
lit.clear();
lit.submit(stone, &[Lit2dInstance::new([0.0, 0.0], [4.0, 1.0])]);
lit.add_light(PointLight::new([1.0, 1.5], 6.0).color([1.0, 0.8, 0.5], 3.0));
```

`Lit2d::encode` then runs from `Renderer::scene_underlay`, with the arguments that the engine gives:

```rust
fn scene_underlay(
    &mut self,
    shared: &SharedGpu,
    encoder: &mut wgpu::CommandEncoder,
    hdr_view: &wgpu::TextureView,
    _z_view: &wgpu::TextureView,
    _coverage_view: &wgpu::TextureView,
    view: &warp_sdk::types::View,
    _surface_px: [u32; 2],
) {
    self.lit.encode(shared, encoder, hdr_view, view);
}
```

- `Lit2d::new` touches no device. The first `encode` makes the GPU resources.
- A material or sheet can be added at any time. The next `encode` makes its pipeline.
- `Lit2d::clear` removes the instances and point lights of the last frame. The key light, the ambient and the materials stay.
- `Lit2d::submit` and `Lit2d::submit_sprites` queue instances. Instances draw in call order, so a later call draws on top. Consecutive submits with the same material join one batch.[[src:warp_sdk/src/lit2d/mod.rs|Some(b) if b.pipe == pipe => b.count += n,]]
- `Lit2d::add_light` returns false and ignores the light when the frame already holds `MAX_POINT_LIGHTS`.

`submit` stores bytes on the CPU and touches no device, so `smoke::boot` runs a Lit2d game with no GPU.[[src:warp_sdk/src/lit2d/mod.rs|`submit` stores bytes on the CPU and touches no device. Thus]] `Lit2d::encode_raw` records both passes into any target, for a host with no `SharedGpu`, for example a test. A change of target format rebuilds the GPU state. A camera with a zero-sized target records nothing.

For bloom, the post chain must be on. The example calls `post::replace(Post::cinematic())` in `new`, which blooms only what is brighter than white, so lit surfaces stay crisp and the lamps glow. See [[post]].

## Configuration

`Lit2d` has public fields for the light rig. A game changes them at any time.

| Field | Type | Default |
|---|---|---|
| `key` | `KeyLight` | azimuth 2.3, elevation 0.6, colour `[1.0, 0.96, 0.9]`, intensity 2.5 |
| `ambient` | `Ambient` | sky `[0.16, 0.2, 0.3]`, ground `[0.05, 0.04, 0.04]`, up `[0, 0, 1]`, intensity 1.0 |
| `shadow` | `ContactShadow` | strength 0.75, length 0.12, bias 0.002, softness 0.01, steps 12 |
| `height_scale` | `f32` | 0.04 |
| `debug` | `DebugView` | Lit |

`KeyLight::from_angles` builds a key light from an azimuth and an elevation in radians, and `PI / 2` is straight above. The `up` field of `Ambient` is `[0, 0, 1]` for a top-down view and `[0, 1, 0]` for a side view. `PointLight::new` gives a white light at 0.1 units above the plane, and `PointLight::color` and `PointLight::z` change it. A higher light gives a softer gradient and a wider highlight.

### Contact shadow

The `ContactShadow` is screen-space. The lighting pass marches from each pixel toward the key light and compares the ray with the height channel.[[src:warp_sdk/src/lit2d/mod.rs|marches from each pixel toward the key light and compares the ray with]] A strength or step count of zero turns it off, and so does a key light with no horizontal part or one at or below the plane.

### Debug views

`DebugView` selects what the lighting pass writes: Lit, Albedo, Normal, RoughnessMetallic or Shadow. The example steps through them on the D key.

## Interaction with other kits

`Camera` holds the view of one encode. `Camera::from_view` builds it from an engine `View` and adds the render origin back, so instances use plain world positions. `Lit2d::encode` does this itself. `Camera2d::lit2d` in [[camera]] builds one for `Lit2d::encode_raw`. Two world units fill the screen height at scale 1, the same as the engine scene shaders.[[src:warp_sdk/src/lit2d/gpu.rs|scale 1, the same as the engine scene shaders.]] A material reads the time as `frame.rot.z`.

`COMMON_WGSL`, `GBUFFER_WGSL`, `SPRITE_WGSL` and `LIGHT_WGSL` are public, and `sprite_gbuffer_wgsl` and `light_wgsl` return complete shaders.

## Failure modes

`Lit2d::add_sprite_sheet` panics when an image does not hold `width * height * 4` bytes. `Lit2d::submit` and `Lit2d::submit_sprites` panic on a handle from another `Lit2d`.

## Limitations

The G-buffer has one layer. Overlapping sprites blend by coverage, so a half-transparent sprite mixes its normal with the normal below it. The contact shadow sees only what is on the screen. The lighting ignores the engine view `light_z` field and the occluder list.[[src:warp_sdk/src/lit2d/mod.rs|the engine `View::light_z` and the occluder list.]]

## Testing

The test file validates the G-buffer template and the sprite and lighting shaders, checks that instance bytes match the stride, that submissions batch by run and that lights stop at the cap. One test lights a disc on a real device.

## History

The module was added on 2026-10-29 in the commit "sdk: add lit2d, deferred 2D PBR lighting for material sprites".
