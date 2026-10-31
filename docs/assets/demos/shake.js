/* Port of the trauma shake in warp_sdk::camera: hash, perlin1, and step 9 of
   Camera2d::update. Offset and angle scale with trauma squared. */
(function () {
  function u32(x) { return x >>> 0; }
  function hash(i, seed) {
    var x = u32(Math.imul(i, 0x9E3779B1) ^ Math.imul(seed, 0x85EBCA6B));
    x = u32(x ^ (x >>> 15)); x = u32(Math.imul(x, 0x2C1B3C6D));
    x = u32(x ^ (x >>> 12)); x = u32(Math.imul(x, 0x297A2D39));
    x = u32(x ^ (x >>> 15));
    return (x / 4294967295) * 2 - 1;
  }
  function ease(t) { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function perlin1(x, seed) {
    var i = Math.floor(x), f = x - i;
    var v0 = hash(i, seed) * f, v1 = hash(i + 1, seed) * (f - 1), u = ease(f);
    return Math.min(1, Math.max(-1, (v0 + u * (v1 - v0)) * 2));
  }
  function mount(el) {
    el.innerHTML = '<h4>Live demo: trauma shake</h4><canvas height="240"></canvas>' +
      '<button type="button" data-t="0.3">add_trauma(0.3)</button> <button type="button" data-t="0.6">add_trauma(0.6)</button> <button type="button" data-t="1">add_trauma(1.0)</button>' +
      '<label>frequency <input type="range" data-k="frequency" min="2" max="40" step="1" value="15"><span></span></label>' +
      '<label>decay <input type="range" data-k="decay" min="0.2" max="4" step="0.1" value="1.2"><span></span></label>' +
      '<label>motion_scale <input type="range" data-k="motion_scale" min="0" max="1" step="0.1" value="1"><span></span></label>' +
      '<p class="cap">The sliders start at the ShakeSettings defaults. The offset and the angle follow the square of the trauma, so small trauma stays subtle.</p>';
    var cv = el.querySelector('canvas'), g = cv.getContext('2d');
    var cfg = { frequency: 15, decay: 1.2, motion_scale: 1, max_offset: 0.06, max_angle: 0.05 };
    var trauma = 0, clock = 0, last = performance.now(), W = 0;
    el.querySelectorAll('input').forEach(function (i) {
      var f = function () { cfg[i.dataset.k] = +i.value; i.nextElementSibling.textContent = i.value; };
      i.addEventListener('input', f); f();
    });
    el.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { trauma = Math.min(1, trauma + +b.dataset.t); wake(); }); });
    function size() { W = cv.clientWidth; var r = Math.min(devicePixelRatio || 1, 2); cv.width = W * r; cv.height = 240 * r; g.setTransform(r, 0, 0, r, 0, 0); }
    size(); addEventListener('resize', function () { size(); draw(0, 0, 0); });
    function draw(ox, oy, ang) {
      g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, 240);
      g.save(); g.translate(W / 2 + ox, 120 + oy); g.rotate(ang);
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.strokeRect(-W / 2 + 20, -95, W - 40, 190);
      g.fillStyle = '#ffc21a'; g.fillRect(-24, -24, 48, 48);
      g.restore();
      g.fillStyle = '#fff'; g.font = '12px ui-monospace, monospace'; g.fillText('trauma ' + trauma.toFixed(2), 12, 20);
      g.fillStyle = 'rgba(255,194,26,.8)'; g.fillRect(100, 12, 120 * trauma, 8);
    }
    var running = false;
    function wake() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      trauma = Math.max(0, trauma - Math.max(cfg.decay, 0) * dt); clock += dt;
      var amount = trauma * trauma * Math.min(1, Math.max(0, cfg.motion_scale));
      var t = clock * cfg.frequency, unit = 240 / 2;
      var ox = perlin1(t, 0x51) * cfg.max_offset * unit * amount, oy = perlin1(t, 0xA7) * cfg.max_offset * unit * amount;
      draw(ox, oy, perlin1(t, 0xF3) * cfg.max_angle * amount);
      if (trauma > 0) requestAnimationFrame(frame); else running = false;
    }
    draw(0, 0, 0);
  }
  document.querySelectorAll('[data-demo=shake]').forEach(mount);
})();
