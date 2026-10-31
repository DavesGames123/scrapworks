/* Shader playground: the composed WGSL of warp_sdk::shaderlib, run by WebGPU. */
(function () {
  var WRAP_A = '\nstruct U { t: f32, aspect: f32, a: f32, b: f32 }\n@group(0) @binding(0) var<uniform> u: U;\n' +
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {\n  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));\n  return vec4<f32>(p[i], 0.0, 1.0);\n}\n' +
    'fn shade(uv: vec2<f32>, t: f32) -> vec3<f32> {\n';
  var WRAP_B = '\n}\n@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {\n  let uv = pos.xy / vec2(u.a, u.b);\n  return vec4<f32>(clamp(shade(uv, u.t), vec3(0.0), vec3(1.0)), 1.0);\n}\n';
  function mount(el) {
    el.innerHTML = '<h4>Live demo: shader playground</h4><canvas style="aspect-ratio:16/9"></canvas>' +
      '<label>preset <select></select></label> <button type="button">Compile</button>' +
      '<textarea spellcheck="false" aria-label="The body of fn shade(uv, t)"></textarea><div class="bad" role="status"></div>' +
      '<p class="cap"></p>';
    var cv = el.querySelector('canvas'), sel = el.querySelector('select'), ta = el.querySelector('textarea'), bad = el.querySelector('.bad'), cap = el.querySelector('.cap');
    if (!navigator.gpu) { cv.style.display = 'none'; bad.textContent = 'This browser has no WebGPU, so the shaders cannot run here. The code below is still real.'; }
    fetch('data/shaderplay.json').then(function (r) { return r.json(); }).then(function (presets) {
      presets.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o); });
      function load() { var p = presets[sel.value]; ta.value = p.body; cap.textContent = 'compose(&' + JSON.stringify(p.compose) + ') writes ' + p.files.length + ' file' + (p.files.length > 1 ? 's' : '') + ': ' + p.files.join(', ') + '. Edit the body of fn shade(uv, t), then press Compile.'; }
      sel.addEventListener('change', function () { load(); build(); }); load();
      if (!navigator.gpu) return;
      var dev, ctx, fmt, pipe, group, ubuf, seen = false;
      navigator.gpu.requestAdapter().then(function (a) {
        if (!a) throw new Error('No WebGPU adapter is available.');
        return a.requestDevice();
      }).then(function (d) {
        dev = d; ctx = cv.getContext('webgpu'); fmt = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device: dev, format: fmt, alphaMode: 'opaque' });
        ubuf = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        el.querySelector('button').addEventListener('click', build);
        build();
        new IntersectionObserver(function (e) { seen = e[0].isIntersecting; if (seen) requestAnimationFrame(frame); }).observe(cv);
      }).catch(function (e) { bad.textContent = e.message; });
      function build() {
        if (!dev) return;
        var code = presets[sel.value].lib + WRAP_A + ta.value + WRAP_B;
        var mod = dev.createShaderModule({ code: code });
        var preLines = (presets[sel.value].lib + WRAP_A).split('\n').length;
        bad.textContent = '';
        mod.getCompilationInfo().then(function (info) {
          var errs = info.messages.filter(function (m) { return m.type === 'error'; });
          if (errs.length) { bad.textContent = errs.map(function (m) { return 'line ' + (m.lineNum - preLines + 1) + ': ' + m.message; }).join('\n'); return; }
          return dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: fmt }] }, primitive: { topology: 'triangle-list' } }).then(function (p) {
            pipe = p; group = dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }] });
            el.dataset.ok = sel.value;
          });
        }).catch(function (e) { bad.textContent = e.message; });
      }
      function frame(now) {
        if (!seen) return;
        var w = cv.clientWidth, r = Math.min(devicePixelRatio || 1, 1.5);
        if (cv.width !== Math.floor(w * r)) { cv.width = Math.floor(w * r); cv.height = Math.floor(w * r * 9 / 16); }
        if (pipe) {
          dev.queue.writeBuffer(ubuf, 0, new Float32Array([now / 1000, cv.width / cv.height, cv.width, cv.height]));
          var enc = dev.createCommandEncoder();
          var pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
          pass.setPipeline(pipe); pass.setBindGroup(0, group); pass.draw(3); pass.end();
          dev.queue.submit([enc.finish()]);
        }
        requestAnimationFrame(frame);
      }
    });
  }
  document.querySelectorAll('[data-demo=shaderplay]').forEach(mount);
})();
