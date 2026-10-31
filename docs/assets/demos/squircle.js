/* Port of warp_core/src/ui/squircle/shape.rs: the corner of |x|^n + |y|^n = 1
   with n = 4, ten steps per corner, and a radius clamp to half the short side. */
(function () {
  var STEPS = 10;
  function path(g, x0, y0, x1, y1, r, n) {
    r = Math.max(0, Math.min(r, Math.min(x1 - x0, y1 - y0) / 2));
    var cs = [[x1 - r, y1 - r], [x0 + r, y1 - r], [x0 + r, y0 + r], [x1 - r, y0 + r]], e = 2 / n;
    g.beginPath();
    cs.forEach(function (c, q) {
      for (var s = 0; s <= STEPS; s++) {
        var t = q * Math.PI / 2 + s / STEPS * Math.PI / 2, ct = Math.cos(t), st = Math.sin(t);
        var x = c[0] + Math.sign(ct) * Math.pow(Math.abs(ct), e) * r, y = c[1] + Math.sign(st) * Math.pow(Math.abs(st), e) * r;
        if (q === 0 && s === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    });
    g.closePath();
  }
  function mount(el) {
    el.innerHTML = '<h4>Live demo: the squircle curve</h4><canvas height="240"></canvas>' +
      '<label>n <input type="range" data-k="n" min="2" max="8" step="0.1" value="4"><span></span></label>' +
      '<label>radius <input type="range" data-k="r" min="0" max="100" step="1" value="100"><span></span>%</label>' +
      '<p class="cap">The amber outline uses the n and the radius from the sliders. The kit fixes n at 4. The dim outline is a circular corner at the same radius, and n = 2 matches it.</p>';
    var cv = el.querySelector('canvas'), g = cv.getContext('2d'), v = { n: 4, r: 100 }, W = 0;
    function draw() {
      g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, 240);
      var side = 200, x0 = W / 2 - side / 2, y0 = 20, r = v.r / 100 * side / 2;
      path(g, x0, y0, x0 + side, y0 + side, r, 2); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.stroke();
      path(g, x0, y0, x0 + side, y0 + side, r, v.n); g.fillStyle = 'rgba(255,194,26,.14)'; g.fill(); g.strokeStyle = '#ffc21a'; g.lineWidth = 2; g.stroke();
    }
    function size() { W = cv.clientWidth; var q = Math.min(devicePixelRatio || 1, 2); cv.width = W * q; cv.height = 240 * q; g.setTransform(q, 0, 0, q, 0, 0); draw(); }
    el.querySelectorAll('input').forEach(function (i) {
      var f = function () { v[i.dataset.k] = +i.value; i.nextElementSibling.textContent = i.value; if (W) draw(); };
      i.addEventListener('input', f); f();
    });
    size(); addEventListener('resize', size);
  }
  document.querySelectorAll('[data-demo=squircle]').forEach(mount);
})();
