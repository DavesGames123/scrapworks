#!/bin/bash
# Compare docs/assets/demos/harmony.js with warp_sdk/src/palette_kit.rs.
# palette_kit.rs has no crate dependencies, so plain rustc builds it.
set -e
SCRATCH="${TMPDIR:-/tmp}/wiki-harmony"; mkdir -p "$SCRATCH"
WARP="${1:-../warp}"
cat > "$SCRATCH/t.rs" <<RS
#![allow(dead_code)]
#[path = "$(cd "$WARP" && pwd)/warp_sdk/src/palette_kit.rs"] mod p;
use p::*;
fn main() {
  for (h, k) in [(0x2f6fdeu32, Harmony::Complementary),(0xd0342c,Harmony::Analogous),(0xefe9dc,Harmony::Triadic),(0x101018,Harmony::Split),(0x33aa66,Harmony::Tetradic)] {
    for n in 2..=5 { for seed in [0u64, 7, 12345] {
      let mut r = Rng::new(seed);
      let s = harmony(Rgb::from_hex(h), k, n, None, &mut r);
      let ink: Vec<String> = s.ink.iter().map(|c| format!("{:06x}", c.to_hex())).collect();
      println!("{:06x} {:?} {} {} {:06x} {}", h, k, n, seed, s.bg.to_hex(), ink.join(","));
    }}
  }
}
RS
rustc -A warnings -O -o "$SCRATCH/t" "$SCRATCH/t.rs"
"$SCRATCH/t" > "$SCRATCH/rust.txt"
node -e '
const {Rng,harmony,hex,parse}=require(process.argv[1]);
for (const [h,k] of [["2f6fde","Complementary"],["d0342c","Analogous"],["efe9dc","Triadic"],["101018","Split"],["33aa66","Tetradic"]])
 for (let n=2;n<=5;n++) for (const s of [0n,7n,12345n]) {
  const p=harmony(parse("#"+h),k,n,null,new Rng(s));
  console.log(h,k,n,String(s),hex(p.bg).slice(1),p.ink.map(i=>hex(i).slice(1)).join(","));
 }' "$PWD/docs/assets/demos/harmony.js" > "$SCRATCH/js.txt"
total=$(wc -l < "$SCRATCH/rust.txt"); same=$(paste -d'\n' "$SCRATCH/rust.txt" "$SCRATCH/js.txt" | awk 'NR%2{a=$0;next} a==$0{c++} END{print c+0}')
echo "harmony: $same of $total palettes match"
diff "$SCRATCH/rust.txt" "$SCRATCH/js.txt" | head -6 || true
