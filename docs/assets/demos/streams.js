/* Port of the integer core of warp_sdk::procgen::Rng: splitmix64, fnv1a,
   xoshiro256**, stream, and f32. All u64 work uses BigInt. */
(function (root) {
  var M = (1n << 64n) - 1n, w = function (x) { return x & M; };
  var rotl = function (x, k) { return w((x << BigInt(k)) | (x >> BigInt(64 - k))); };
  function splitmix64(x) {
    x = w(x + 0x9E3779B97F4A7C15n);
    var z = x;
    z = w((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
    z = w((z ^ (z >> 27n)) * 0x94D049BB133111EBn);
    return z ^ (z >> 31n);
  }
  function fnv1a(name) {
    var h = 0xCBF29CE484222325n, b = new TextEncoder().encode(name);
    for (var i = 0; i < b.length; i++) { h ^= BigInt(b[i]); h = w(h * 0x100000001B3n); }
    return h;
  }
  function Rng(key) {
    this.key = key; this.s = [];
    var x = key;
    for (var i = 0; i < 4; i++) { x = w(x + 0x9E3779B97F4A7C15n); this.s[i] = splitmix64(x); }
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1n;
  }
  Rng.seed = function (seed) { return new Rng(splitmix64(BigInt(seed) ^ 0x0005EED0FA11n)); };
  Rng.prototype.u64 = function () {
    var s = this.s, r = w(rotl(w(s[1] * 5n), 7) * 9n), t = w(s[1] << 17n);
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 45);
    return r;
  };
  Rng.prototype.f32 = function () { return Number(this.u64() >> 40n) * Math.pow(2, -24); };
  Rng.prototype.stream = function (name) { return new Rng(splitmix64(this.key ^ splitmix64(fnv1a(name)))); };
  if (typeof module !== 'undefined') { module.exports = { Rng: Rng }; return; }
  function mount(el) {
    el.innerHTML = '<h4>Live demo: named streams</h4><canvas height="230"></canvas>' +
      '<label>seed <input type="number" value="42" min="0" style="width:90px"></label>' +
      '<label><input type="checkbox" data-x> add a draw to stream "coral"</label>' +
      '<p class="cap">Each panel scatters 400 points from its own named stream of Rng. An extra draw from "coral" moves only the coral panel. The other streams stay the same, which is why a new feature does not reshuffle a world.</p>';
    var cv = el.querySelector('canvas'), g = cv.getContext('2d'), seed = el.querySelector('[type=number]'), extra = el.querySelector('[type=checkbox]'), W = 0;
    var names = ['terrain', 'coral', 'loot'], colors = ['#7fb3ff', '#ff8a6b', '#ffc21a'];
    function draw() {
      g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, 230);
      var root = Rng.seed(Math.max(0, parseInt(seed.value, 10) || 0)), pw = (W - 16) / 3;
      names.forEach(function (n, i) {
        var r = root.stream(n), x0 = 4 + i * (pw + 4);
        if (n === 'coral' && extra.checked) r.u64();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(x0, 4, pw, 222);
        g.fillStyle = '#fff'; g.font = '12px ui-monospace, monospace'; g.fillText('stream("' + n + '")', x0 + 6, 18);
        g.fillStyle = colors[i];
        for (var k = 0; k < 400; k++) { var x = r.f32(), y = r.f32(); g.fillRect(x0 + 4 + x * (pw - 8), 26 + y * 194, 2, 2); }
      });
    }
    function size() { W = cv.clientWidth; var q = Math.min(devicePixelRatio || 1, 2); cv.width = W * q; cv.height = 230 * q; g.setTransform(q, 0, 0, q, 0, 0); draw(); }
    seed.addEventListener('input', draw); extra.addEventListener('change', draw); size(); addEventListener('resize', size);
  }
  document.querySelectorAll('[data-demo=streams]').forEach(mount);
})(this);
