/* Port of warp_sdk::palette_kit: Rng, OKLab, from_oklch, ensure_contrast,
   harmony. tools/wiki/verify_harmony.sh compares it with the Rust source. */
(function (root) {
  var M = (1n << 64n) - 1n;
  function Rng(seed) { this.s = (BigInt(seed) ^ 0x9e3779b97f4a7c15n) & M; }
  Rng.prototype.u64 = function () {
    this.s = (this.s + 0x9e3779b97f4a7c15n) & M;
    var z = this.s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M;
    return z ^ (z >> 31n);
  };
  Rng.prototype.f = function () { return Math.fround(Math.fround(Number(this.u64() >> 40n)) / 16777216); };
  var toLin = function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var toGam = function (c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
  var clamp = function (x) { return Math.min(1, Math.max(0, x)); };
  function linToLab(v) {
    var l = Math.cbrt(0.41222147 * v[0] + 0.53633255 * v[1] + 0.051445995 * v[2]);
    var m = Math.cbrt(0.2119035 * v[0] + 0.6806995 * v[1] + 0.10739696 * v[2]);
    var s = Math.cbrt(0.08830246 * v[0] + 0.28171885 * v[1] + 0.6299787 * v[2]);
    return [0.21045426 * l + 0.7936178 * m - 0.004072047 * s, 1.9779985 * l - 2.4285922 * m + 0.4505937 * s, 0.025904037 * l + 0.78277177 * m - 0.80867577 * s];
  }
  function labToLin(p) {
    var l = Math.pow(p[0] + 0.39633778 * p[1] + 0.21580376 * p[2], 3);
    var m = Math.pow(p[0] - 0.105561346 * p[1] - 0.06385417 * p[2], 3);
    var s = Math.pow(p[0] - 0.08948418 * p[1] - 1.2914855 * p[2], 3);
    return [4.0767417 * l - 3.3077116 * m + 0.23096994 * s, -1.268438 * l + 2.6097574 * m - 0.34131938 * s, -0.0041960863 * l - 0.7034186 * m + 1.7076147 * s];
  }
  var lin = function (c) { return c.map(toLin); };
  var fromLab = function (p) { return labToLin(p).map(function (v) { return toGam(clamp(v)); }); };
  function oklch(c) {
    var p = linToLab(lin(c)), h = Math.atan2(p[2], p[1]) * 180 / Math.PI;
    if (h < 0) h += 360;
    return [p[0], Math.hypot(p[1], p[2]), h];
  }
  var inGamut = function (p) { return labToLin(p).every(function (c) { return c >= -1e-4 && c <= 1 + 1e-4; }); };
  function fromOklch(l, c, h) {
    l = clamp(l); var t = h * Math.PI / 180;
    var lab = function (k) { return [l, k * Math.cos(t), k * Math.sin(t)]; };
    if (inGamut(lab(c))) return fromLab(lab(c));
    var lo = 0, hi = Math.max(c, 0);
    for (var i = 0; i < 18; i++) { var m = 0.5 * (lo + hi); if (inGamut(lab(m))) lo = m; else hi = m; }
    return fromLab(lab(lo));
  }
  var lum = function (c) { var v = lin(c); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function ensure(ink, bg, min) {
    if (contrast(ink, bg) >= min) return ink;
    var q = oklch(ink), up = lum(bg) < 0.18;
    for (var k = 1; k <= 40; k++) {
      var c = fromOklch(clamp(q[0] + (up ? 1 : -1) * k * 0.025), q[1], q[2]);
      if (contrast(c, bg) >= min) return c;
    }
    return up ? [1, 1, 1] : [0, 0, 0];
  }
  var HUES = { Complementary: [0, 180], Analogous: [-30, 0, 30], Triadic: [0, 120, 240], Split: [0, 150, 210], Tetradic: [0, 90, 180, 270] };
  function harmony(seed, kind, n, dark, rng) {
    var hs = HUES[kind], o = oklch(seed), l0 = o[0], c0 = o[1], h0 = o[2];
    n = Math.min(5, Math.max(2, n));
    if (dark === null) dark = l0 > 0.72;
    var c = Math.min(0.2, Math.max(0.06, c0 < 0.03 ? 0.12 : c0));
    var a, b;
    if (dark) { a = rng.f(); b = rng.f(); var bg = fromOklch(0.17 + 0.05 * a, 0.012 + 0.012 * b, h0); }
    else { a = rng.f(); b = rng.f(); bg = fromOklch(0.955 - 0.03 * a, 0.012 + 0.014 * b, h0 + 40); }
    var ink = [];
    for (var i = 0; i < n; i++) {
      var lap = Math.floor(i / hs.length), h = (h0 + hs[i % hs.length] + 1440) % 360, l;
      if (i === 0) l = dark ? Math.max(l0, 0.72) : Math.min(l0, 0.5);
      else l = dark ? 0.62 + 0.25 * rng.f() : 0.42 + 0.3 * rng.f();
      if (lap > 0) l = dark ? 0.9 - 0.08 * rng.f() : 0.26 + 0.06 * rng.f();
      var ci = lap > 0 ? c * 0.5 : c * (0.8 + 0.4 * rng.f());
      ink.push(fromOklch(l, ci, h));
    }
    ink[0] = ensure(ink[0], bg, 3.2);
    return { bg: bg, ink: ink };
  }
  var hex = function (c) { return '#' + c.map(function (v) { return Math.round(clamp(v) * 255).toString(16).padStart(2, '0'); }).join(''); };
  var parse = function (s) { var h = parseInt(s.slice(1), 16); return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; };
  if (typeof module !== 'undefined') { module.exports = { Rng: Rng, harmony: harmony, hex: hex, parse: parse }; return; }
  function mount(el) {
    el.innerHTML = '<h4>Live demo: harmony</h4><div class="sw" style="padding:14px;min-height:150px"></div>' +
      '<label>seed <input type="color" value="#2f6fde"></label>' +
      '<label>kind <select>' + Object.keys(HUES).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label>' +
      '<label>inks <input type="range" min="2" max="5" value="4"><span></span></label>' +
      '<label>rng seed <input type="number" value="7" min="0" style="width:80px"></label>' +
      '<p class="cap">This demo runs a JavaScript port of harmony, with Rng::new and the OKLCH gamut search. The output matches the Rust source for the same inputs.</p>';
    var sw = el.querySelector('.sw'), c = el.querySelector('[type=color]'), k = el.querySelector('select'), n = el.querySelector('[type=range]'), s = el.querySelector('[type=number]');
    function run() {
      n.nextElementSibling.textContent = n.value;
      var p = harmony(parse(c.value), k.value, +n.value, null, new Rng(BigInt(Math.max(0, parseInt(s.value, 10) || 0))));
      sw.style.background = hex(p.bg);
      sw.innerHTML = '<div style="font:12px ui-monospace,monospace;color:' + hex(p.ink[0]) + '">bg ' + hex(p.bg) + '</div><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">' + p.ink.map(function (i) {
        return '<div style="flex:1 1 90px;height:92px;background:' + hex(i) + ';display:flex;align-items:flex-end;padding:5px;font:12px ui-monospace,monospace;color:' + hex(p.bg) + '">' + hex(i) + '<br>' + contrast(i, p.bg).toFixed(1) + ':1</div>';
      }).join('') + '</div>';
    }
    [c, k, n, s].forEach(function (i) { i.addEventListener('input', run); }); run();
  }
  document.querySelectorAll('[data-demo=harmony]').forEach(mount);
})(this);
