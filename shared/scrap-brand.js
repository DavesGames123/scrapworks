/*
 * ScrapWorks brand kit. The five mockups load this file as a classic script.
 *
 * Contents (grep -n for the names):
 *   WRENCH_SVG_PATH   - 2D outline of the wrench C, SVG y-down units
 *   glyphSVG()        - inline SVG for the wrench C, sized in em
 *   hydrate()         - fills [data-scrap-wordmark] and [data-scrap-glyph] nodes
 *   three()           - Three.js helpers: stage, PBR materials, wrench mesh,
 *                       hex nut, bolt, brushed-metal texture, bloom
 *
 * The wrench is an open-end wrench. Its jaw grips a hex nut and makes the
 * opening of the C. The glyph turns 40 degrees counterclockwise, so the jaw
 * points up and right, and the handle points down and left.
 */
(function () {
  'use strict';

  var JAW = 20.78; // half of the hex nut flat-to-flat distance (r = 24)
  var ANGLE = 30;  // glyph turn, degrees counterclockwise
  var HANDLE_END = -80, HANDLE_R = 11, HOLE_X = -79, HOLE_R = 4.5;

  // Outline in math units (y-up). The SVG path below is the same outline, y-down.
  // Head: flat-top hexagon ring, outer r = 58, tips cut flat at x = 42.
  var OUTLINE = [
    [42, 27.7], [29, 50.2], [-29, 50.2], [-51.6, HANDLE_R], [HANDLE_END, HANDLE_R],
    'ARC',
    [HANDLE_END, -HANDLE_R], [-51.6, -HANDLE_R], [-29, -50.2], [29, -50.2], [42, -27.7],
    [42, -JAW], [-12, -JAW], [-24, 0], [-12, JAW], [42, JAW]
  ];
  var HEAD = [[42, 27.7], [29, 50.2], [-29, 50.2], [-58, 0], [-29, -50.2], [29, -50.2], [42, -27.7]];

  // Turned bounding box in SVG units (y-down), so viewBox and em sizing follow the outline.
  function bbox(points) {
    var a = ANGLE * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), b = [1e9, 1e9, -1e9, -1e9];
    points.forEach(function (p) {
      var x = p[0] * c - p[1] * s, y = -(p[0] * s + p[1] * c);
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    });
    return b;
  }
  var capPts = [];
  for (var k = 0; k <= 12; k++) {
    var t = Math.PI / 2 + k * Math.PI / 12;
    capPts.push([HANDLE_END + Math.cos(t) * HANDLE_R, Math.sin(t) * HANDLE_R]);
  }
  var FULL = bbox(OUTLINE.filter(function (p) { return p !== 'ARC'; }).concat(capPts));
  var HEADB = bbox(HEAD);
  var PAD = 4;
  FULL = [FULL[0] - PAD, FULL[1] - PAD, FULL[2] + PAD, FULL[3] + PAD];

  var WRENCH_SVG_PATH = (function () {
    var d = '';
    OUTLINE.forEach(function (p, i) {
      if (p === 'ARC') { d += ' A' + HANDLE_R + ',' + HANDLE_R + ' 0 0 0 '; return; }
      var s = p[0] + ',' + (-p[1]);
      if (i === 0) d += 'M' + s;
      else if (OUTLINE[i - 1] === 'ARC') d += s;
      else d += ' L' + s;
    });
    return d + ' Z';
  })();

  var uid = 0;

  /*
   * glyphSVG(opts)
   *   opts.fill   - CSS color or 'url(#id)' (default: currentColor)
   *   opts.stroke - stroke color for the outline bevel (default: same as fill)
   *   opts.defs   - extra <defs> markup (gradients, filters)
   *   opts.hole   - true adds the hang hole in the handle
   *   opts.cls    - class for the <svg>
   */
  function glyphSVG(opts) {
    opts = opts || {};
    var fill = opts.fill || 'currentColor';
    var stroke = opts.stroke || fill;
    var id = 'scrapHole' + (uid++);
    var hole = opts.hole === false ? '' :
      '<mask id="' + id + '"><rect x="-120" y="-120" width="240" height="240" fill="#fff"/>' +
      '<circle cx="' + HOLE_X + '" cy="0" r="' + HOLE_R + '" fill="#000"/></mask>';
    var vb = FULL[0].toFixed(1) + ' ' + FULL[1].toFixed(1) + ' ' + (FULL[2] - FULL[0]).toFixed(1) + ' ' + (FULL[3] - FULL[1]).toFixed(1);
    return '<svg class="' + (opts.cls || 'scrap-glyph') + '" viewBox="' + vb + '" style="' + (opts.style || '') + '" ' +
      'aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + hole + (opts.defs || '') + '</defs>' +
      '<g transform="rotate(-' + ANGLE + ')"' + (hole ? ' mask="url(#' + id + ')"' : '') + '>' +
      '<path d="' + WRENCH_SVG_PATH + '" fill="' + fill + '" stroke="' + stroke +
      '" stroke-width="5" stroke-linejoin="round"/></g></svg>';
  }

  /*
   * Wordmark markup: S + wrench + RAP. The page sets font, color, and size.
   * The glyph head matches the cap height of a condensed sans at 0.72em.
   */
  // Scale: the turned head is CAP em tall. The head center sits at CAP/2 over the baseline.
  var CAP = 0.74;
  function wordmarkHTML(opts) {
    opts = opts || {};
    var u = CAP / (HEADB[3] - HEADB[1]);
    var w = (FULL[2] - FULL[0]) * u, h = (FULL[3] - FULL[1]) * u;
    var drop = FULL[3] * u - CAP / 2;                 // origin to svg bottom, minus head center height
    var left = -(HEADB[0] - FULL[0]) * u * 0.18 + 0.05; // handle fills the gap after the S
    var right = (FULL[2] - HEADB[2]) * -u + 0.03;
    opts.cls = 'scrap-glyph';
    opts.style = 'width:' + w.toFixed(3) + 'em;height:' + h.toFixed(3) + 'em;margin:0 ' + right.toFixed(3) +
      'em 0 ' + left.toFixed(3) + 'em;transform:translateY(' + drop.toFixed(3) + 'em)';
    return '<span class="scrap-wordmark" aria-label="Scrap" role="img">' +
      '<span class="scrap-wm-l">S</span>' + glyphSVG(opts) + '<span class="scrap-wm-l">RAP</span></span>';
  }

  var CSS =
    '.scrap-wordmark{display:inline-flex;align-items:baseline;white-space:nowrap;line-height:1}' +
    '.scrap-wordmark .scrap-glyph{overflow:visible;flex:none;position:relative;z-index:0}' +
    '.scrap-wordmark .scrap-wm-l{position:relative;z-index:1}' +
    '.scrap-glyph-solo{width:1em;height:1em;overflow:visible}';

  function hydrate(root) {
    root = root || document;
    if (!document.getElementById('scrap-brand-css')) {
      var st = document.createElement('style');
      st.id = 'scrap-brand-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.querySelectorAll('[data-scrap-wordmark]').forEach(function (el) {
      el.innerHTML = wordmarkHTML({ fill: el.getAttribute('data-fill') || undefined });
    });
    root.querySelectorAll('[data-scrap-glyph]').forEach(function (el) {
      el.innerHTML = glyphSVG({ fill: el.getAttribute('data-fill') || undefined, cls: 'scrap-glyph-solo' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Three.js helpers. Call ScrapBrand.three(THREE, addons) from a module */
  /* script. addons = { RoomEnvironment, EffectComposer, RenderPass,      */
  /* UnrealBloomPass, OutputPass } - the bloom classes are optional.     */
  /* ------------------------------------------------------------------ */
  function three(THREE, addons) {
    addons = addons || {};
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function wrenchShape() {
      var s = new THREE.Shape();
      OUTLINE.forEach(function (p, i) {
        if (p === 'ARC') { s.absarc(HANDLE_END, 0, HANDLE_R, Math.PI / 2, Math.PI * 1.5, false); return; }
        if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]);
      });
      s.closePath();
      var h = new THREE.Path();
      h.absarc(HOLE_X, 0, HOLE_R, 0, Math.PI * 2, true);
      s.holes.push(h);
      return s;
    }

    // Brushed-metal streak texture, drawn on a canvas. Used as roughness and bump map.
    function brushedTexture(size, strength) {
      size = size || 1024; strength = strength == null ? 1 : strength;
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
      for (var i = 0; i < size * 6; i++) {
        var y = Math.random() * size, v = 110 + Math.random() * 40 * strength;
        g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.15 + Math.random() * 0.35) + ')';
        g.lineWidth = Math.random() * 1.6;
        var x = Math.random() * size, len = size * (0.2 + Math.random() * 0.8);
        g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y); g.stroke();
      }
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    }

    // Speckled noise for powder-coat paint and cast iron.
    function noiseTexture(size, lo, hi) {
      size = size || 512; lo = lo == null ? 100 : lo; hi = hi == null ? 160 : hi;
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d'), img = g.createImageData(size, size);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = lo + Math.random() * (hi - lo);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }

    var brushed = brushedTexture();
    var noise = noiseTexture();

    var materials = {
      // Safety-yellow paint with a clear coat. The wrench C uses this.
      paint: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xffc21a, metalness: 0.25, roughness: 0.38, roughnessMap: noise,
          clearcoat: 1, clearcoatRoughness: 0.12
        }, o || {}));
      },
      // Yellow anodized metal: more reflective than paint.
      anodized: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xffb800, metalness: 1, roughness: 0.28, roughnessMap: brushed,
          anisotropy: 0.6, clearcoat: 0.4
        }, o || {}));
      },
      steel: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xc4c8cd, metalness: 1, roughness: 0.3, roughnessMap: brushed,
          bumpMap: brushed, bumpScale: 0.15, anisotropy: 0.7
        }, o || {}));
      },
      darkSteel: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0x30343a, metalness: 1, roughness: 0.42, roughnessMap: brushed, anisotropy: 0.5
        }, o || {}));
      },
      castIron: function (o) {
        return new THREE.MeshStandardMaterial(Object.assign({
          color: 0x1c1d20, metalness: 0.85, roughness: 0.7, roughnessMap: noise, bumpMap: noise, bumpScale: 0.4
        }, o || {}));
      },
      // Unlit emissive. Bloom picks it up. toneMapped false keeps it hot.
      glow: function (color, intensity) {
        var c = new THREE.Color(color == null ? 0xffb300 : color).multiplyScalar(intensity || 3);
        return new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
      }
    };

    /*
     * wrench(opts) -> THREE.Mesh, centered, 40 degree turn applied.
     * Size: head is about 1.1 units across with scale 0.01.
     */
    function wrench(opts) {
      opts = opts || {};
      var geo = new THREE.ExtrudeGeometry(wrenchShape(), {
        depth: opts.depth || 14, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.4,
        bevelSegments: 5, curveSegments: 32
      });
      geo.center();
      geo.computeVertexNormals();
      // Planar UVs so brushed texture runs along the handle.
      var mesh = new THREE.Mesh(geo, opts.material || materials.paint());
      var pivot = new THREE.Group();
      mesh.rotation.z = THREE.MathUtils.degToRad(ANGLE);
      mesh.scale.setScalar(opts.scale || 0.01);
      pivot.add(mesh);
      pivot.userData.mesh = mesh;
      return pivot;
    }

    function hexNut(opts) {
      opts = opts || {};
      var r = opts.r || 0.24, s = new THREE.Shape();
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      s.closePath();
      var h = new THREE.Path(); h.absarc(0, 0, r * 0.5, 0, Math.PI * 2, true); s.holes.push(h);
      var geo = new THREE.ExtrudeGeometry(s, {
        depth: opts.depth || r * 0.8, bevelEnabled: true, bevelThickness: r * 0.08,
        bevelSize: r * 0.06, bevelSegments: 3, curveSegments: 24
      });
      geo.center();
      return new THREE.Mesh(geo, opts.material || materials.steel());
    }

    function bolt(opts) {
      opts = opts || {};
      var g = new THREE.Group(), r = opts.r || 0.08;
      var head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.6, 6), opts.material || materials.steel());
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, r * 4, 20), opts.material || materials.steel());
      shaft.position.y = -r * 2.3;
      g.add(head, shaft);
      return g;
    }

    /*
     * stage(canvas, opts) -> { scene, camera, renderer, pointer, onFrame(fn), render() }
     *   opts.bloom      - { strength, radius, threshold } adds UnrealBloomPass
     *   opts.fov, opts.z - camera
     *   opts.exposure   - tone-mapping exposure
     *   opts.envIntensity
     * The loop stops when the canvas is off screen. Reduced motion renders
     * one frame per pointer move only.
     */
    function stage(canvas, opts) {
      opts = opts || {};
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = opts.exposure || 1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      var scene = new THREE.Scene();
      var pmrem = new THREE.PMREMGenerator(renderer);
      if (addons.RoomEnvironment) {
        scene.environment = pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = opts.envIntensity == null ? 1 : opts.envIntensity;
      }

      var camera = new THREE.PerspectiveCamera(opts.fov || 35, 1, 0.1, 100);
      camera.position.set(0, 0, opts.z || 4);

      var composer = null;
      if (opts.bloom && addons.EffectComposer) {
        composer = new addons.EffectComposer(renderer);
        composer.addPass(new addons.RenderPass(scene, camera));
        var b = opts.bloom;
        composer.addPass(new addons.UnrealBloomPass(new THREE.Vector2(256, 256),
          b.strength == null ? 0.8 : b.strength, b.radius == null ? 0.5 : b.radius, b.threshold == null ? 0.85 : b.threshold));
        if (addons.OutputPass) composer.addPass(new addons.OutputPass());
      }

      var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
      window.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX / window.innerWidth * 2 - 1;
        pointer.y = -(e.clientY / window.innerHeight * 2 - 1);
        if (reduceMotion) render();
      }, { passive: true });

      function resize() {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        if (composer) composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      }
      new ResizeObserver(resize).observe(canvas);

      var hooks = [], clock = new THREE.Clock(), visible = true, running = false;
      function render() {
        if (composer) composer.render(); else renderer.render(scene, camera);
      }
      function frame() {
        if (!visible || reduceMotion) { running = false; return; }
        var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
        pointer.sx += (pointer.x - pointer.sx) * 0.06;
        pointer.sy += (pointer.y - pointer.sy) * 0.06;
        for (var i = 0; i < hooks.length; i++) hooks[i](t, dt);
        render();
        requestAnimationFrame(frame);
      }
      function start() { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) start();
      }).observe(canvas);

      resize();
      if (reduceMotion) {
        setTimeout(function () { for (var i = 0; i < hooks.length; i++) hooks[i](1.5, 0); render(); }, 0);
      }
      canvas.classList.add('is-live');

      return {
        scene: scene, camera: camera, renderer: renderer, composer: composer, pointer: pointer,
        reduceMotion: reduceMotion,
        onFrame: function (fn) { hooks.push(fn); start(); },
        render: render
      };
    }

    return {
      THREE: THREE, materials: materials, wrench: wrench, wrenchShape: wrenchShape,
      hexNut: hexNut, bolt: bolt, stage: stage,
      brushedTexture: brushedTexture, noiseTexture: noiseTexture, ANGLE: ANGLE
    };
  }

  window.ScrapBrand = {
    WRENCH_SVG_PATH: WRENCH_SVG_PATH, glyphSVG: glyphSVG, wordmarkHTML: wordmarkHTML,
    hydrate: hydrate, three: three, ANGLE: ANGLE
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  else hydrate();
})();
