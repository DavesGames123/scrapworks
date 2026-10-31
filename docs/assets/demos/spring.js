/* Port of warp_sdk::juice::Spring. step() is the closed form in juice.rs. */
(function () {
  var TAU = Math.PI * 2;
  function step(s, dt) {
    var w = TAU * Math.max(s.freq, 0.01);
    var z = Math.min(0.99, Math.max(0.01, s.damping));
    var wd = w * Math.sqrt(1 - z * z);
    var a = s.value - s.target;
    var b = (s.velocity + z * w * a) / wd;
    var e = Math.exp(-z * w * dt);
    var sn = Math.sin(wd * dt), c = Math.cos(wd * dt);
    s.value = s.target + e * (a * c + b * sn);
    s.velocity = e * ((b * wd - z * w * a) * c - (a * wd + z * w * b) * sn);
  }
  function mount(el) {
    el.innerHTML = '<h4>Live demo: Spring</h4><canvas height="220"></canvas>' +
      '<label>freq <input type="range" data-k="freq" min="0.5" max="12" step="0.1" value="4"><span></span> Hz</label>' +
      '<label>damping <input type="range" data-k="damping" min="0.01" max="0.99" step="0.01" value="0.25"><span></span></label>' +
      '<select aria-label="Preset"><option value="4,0.25">Spring::bouncy</option><option value="6,0.5">Spring::snappy</option><option value="">custom</option></select> ' +
      '<button type="button" data-a="move">Move target</button> <button type="button" data-a="kick">kick(3.0)</button>' +
      '<p class="cap">This demo runs a JavaScript port of Spring::step at the 60 Hz step of the doc example. The plot shows the value over the next 2.5 seconds.</p>';
    var cv = el.querySelector('canvas'), g = cv.getContext('2d');
    var s = { value: 0, velocity: 0, target: 1, freq: 4, damping: 0.25 };
    var trail = [];
    var inputs = el.querySelectorAll('input'), sel = el.querySelector('select');
    function sync() { inputs.forEach(function (i) { s[i.dataset.k] = +i.value; i.nextElementSibling.textContent = i.value; }); }
    inputs.forEach(function (i) { i.addEventListener('input', function () { sel.value = ''; sync(); }); });
    sel.addEventListener('change', function () { if (!sel.value) return; var p = sel.value.split(','); inputs[0].value = p[0]; inputs[1].value = p[1]; sync(); });
    el.querySelector('[data-a=move]').addEventListener('click', function () { s.target = s.target > 0.5 ? 0 : 1; });
    el.querySelector('[data-a=kick]').addEventListener('click', function () { s.velocity += 3; });
    sync();
    function size() { var w = cv.clientWidth, r = Math.min(devicePixelRatio || 1, 2); cv.width = w * r; cv.height = 220 * r; g.setTransform(r, 0, 0, r, 0, 0); return w; }
    var W = size(); addEventListener('resize', function () { W = size(); });
    function y(v) { return 180 - v * 130; }
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame() {
      step(s, 1 / 60);
      trail.push(s.value); if (trail.length > W - 100) trail.shift();
      g.clearRect(0, 0, W, 220); g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, 220);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, y(s.target)); g.lineTo(W, y(s.target)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#ffc21a'; g.lineWidth = 2; g.beginPath();
      trail.forEach(function (v, i) { var x = W - 100 - trail.length + i; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); }); g.stroke();
      var p = { value: s.value, velocity: s.velocity, target: s.target, freq: s.freq, damping: s.damping };
      g.strokeStyle = 'rgba(255,194,26,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W - 100, y(p.value));
      for (var i = 1; i <= 100; i++) { step(p, 2.5 / 100); g.lineTo(W - 100 + i, y(p.value)); } g.stroke();
      g.fillStyle = '#ffc21a'; g.beginPath(); g.arc(W - 100, y(s.value), 7, 0, TAU); g.fill();
      if (!still) requestAnimationFrame(frame);
    }
    if (still) { for (var i = 0; i < 60; i++) step(s, 1 / 60); }
    frame();
    if (still) el.querySelectorAll('button,input,select').forEach(function (c) { c.addEventListener('input', frame); c.addEventListener('click', function () { setTimeout(frame); }); });
  }
  document.querySelectorAll('[data-demo=spring]').forEach(mount);
})();
