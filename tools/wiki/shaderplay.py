#!/usr/bin/env python3
"""
tools/wiki/shaderplay.py - write docs/data/shaderplay.json for the playground.

This is a port of warp_sdk::shaderlib::compose: depth first, each file once,
a file written after its `// requires:` dependencies. The output holds only
the composed text of the nine presets, not the whole library.

    python3 tools/wiki/shaderplay.py [path/to/warp]
"""
import json, pathlib, re, sys
SITE = pathlib.Path(__file__).resolve().parent.parent.parent
WARP = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else SITE.parent / "warp").resolve()
LIB = WARP / "warp_sdk" / "shaderlib"

PRESETS = [
 ("Noise: fBm", ["noise/fbm.wgsl"], "let v = noise_fbm3(vec3(uv * 5.0, t * 0.3), 5, 2.0, 0.5, 7u);\nreturn vec3(0.5 + 0.5 * v);"),
 ("SDF: guilloche", ["sdf/polar.wgsl"], "let v = sdf_polar_guilloche(uv - 0.5, 0.3, 0.08, 7.0, 6, t, 0.003);\nreturn vec3(1.0, 0.76, 0.1) * v;"),
 ("Material: lava", ["material/volcanic.wgsl"], "let m = material_lava(uv, 4.0, 0.7, t, 1.0);\nreturn m.albedo + m.emissive;"),
 ("Water: caustics", ["water/caustics.wgsl"], "let v = water_caustic_layered(uv * 4.0, t);\nreturn vec3(0.02, 0.2, 0.3) + vec3(0.7, 0.9, 1.0) * v;"),
 ("Post: fire", ["post/fire.wgsl"], "let h = post_fire_column(vec2(uv.x - 0.5, 1.0 - uv.y), t, 0.5, 1.5, 1.0);\nreturn post_fire_ramp_classic(clamp(h, 0.0, 1.0));"),
 ("Organic: brain coral", ["organic/coral_massive.wgsl"], "let v = organic_brain_groove(uv * 3.0, 2.0, 2.0 + sin(t * 0.2));\nreturn mix(vec3(0.9, 0.55, 0.45), vec3(0.2, 0.05, 0.08), v);"),
 ("Creature: jellyfish", ["creature/jellyfish.wgsl"], "var j = creature_jelly_species(3.0);\nj.pulse = 0.5 - 0.5 * cos(t * 1.5);\nj.time = t;\nlet m = creature_jelly(vec2(uv.x - 0.5, 0.5 - uv.y), j, 3.0, 0.003);\nreturn m.albedo * m.alpha + m.emissive;"),
 ("Terrain: DLA height", ["terrain/dla.wgsl"], "let v = terrain_dla_height(uv * 3.0, 4, 0.5 + 0.3 * sin(t * 0.3), 1u);\nreturn vec3(v);"),
 ("Pattern: phase rings", ["pattern/radial.wgsl"], "let v = pattern_radial_phase_rings(uv * 2.0 - 1.0, 12.0, 7.0, 1.5, 2.0 * sin(t * 0.3), 0.4);\nreturn vec3(v);"),
]

def compose(paths):
    seen, out = [], []
    def visit(p):
        if p in seen: return
        seen.append(p)
        src = (LIB / p).read_text(encoding="utf-8")
        for line in re.split(r"\r?\n", src):
            s = line.strip()
            if s.startswith("// requires:"):
                visit(s[len("// requires:"):].strip())
        # WGSL parsers newer than naga 0.12 read `a < b, c > d` as a template
        # list. Warp's own build is not affected. Same meaning, in brackets.
        src = src.replace("p.y < v[j].y,", "(p.y < v[j].y),")
        out.append(f"// ---- shaderlib/{p}\n{src}\n")
    for p in paths: visit(p)
    return "".join(out), seen

data = []
for name, paths, body in PRESETS:
    lib, files = compose(paths)
    lib = "\n".join(l for l in lib.splitlines() if not re.search(r"grep -n", l))
    data.append({"name": name, "compose": paths, "files": files, "lib": lib, "body": body})
(SITE / "docs/data").mkdir(parents=True, exist_ok=True)
(SITE / "docs/data/shaderplay.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("shaderplay:", len(data), "presets,", sum(len(d["lib"]) for d in data) // 1024, "KiB")
