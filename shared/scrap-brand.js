/*
 * ScrapWorks brand kit. The five mockups load this file as a classic script.
 *
 * Contents (grep -n for the names):
 *   LETTER, ICON       - 2D outlines (math units, y-up, cap height 100)
 *   glyphSVG()         - inline SVG: variant 'letter' (the C) or 'icon' (full wrench)
 *   wordmarkHTML()     - S + letter C + RAP, sized in em to the page font
 *   hydrate()          - fills [data-scrap-wordmark] and [data-scrap-glyph], sets favicon
 *   three()            - Three.js helpers: stage (MSAA bloom), PBR materials,
 *                        wrench mesh, hex nut, bolt, brushed-metal texture
 *
 * The C is the head of an open-end wrench. Its outline is a chamfered C,
 * so it reads as a letter at text size. The jaw inside it is the half of a
 * hex nut, so it reads as a wrench up close. The letter turns 10 degrees
 * counterclockwise. The icon adds the handle and turns 35 degrees.
 * The wordmark has no handle, because a handle makes the C read as "F".
 */
(function () {
  'use strict';

  // Head geometry. X, Y: half width and half height. CH: corner chamfer.
  // NR: hex nut radius. NX: nut center x. NH: half the nut flat-to-flat size.
  var X = 31, Y = 50, CH = 16, NR = 28, NX = 10, NH = NR * Math.sin(Math.PI / 3);
  var LETTER_ANGLE = 10, ICON_ANGLE = 35;
  var HW = 11, HANDLE_END = -150, HOLE_X = -146, HOLE_R = 5;

  var JAW = [[X, -NH], [NX - NR / 2, -NH], [NX - NR, 0], [NX - NR / 2, NH], [X, NH]];
  var LETTER = [[X, Y], [-X + CH, Y], [-X, Y - CH], [-X, -Y + CH], [-X + CH, -Y], [X, -Y]].concat(JAW);
  var ICON = [[X, Y], [-X + CH, Y], [-X, Y - CH], [-X, HW], [HANDLE_END, HW], 'ARC',
    [HANDLE_END, -HW], [-X, -HW], [-X, -Y + CH], [-X + CH, -Y], [X, -Y]].concat(JAW);

  // Turned bounding box in SVG units (y-down).
  function bbox(points, deg, pad) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), b = [1e9, 1e9, -1e9, -1e9];
    points.forEach(function (p) {
      if (p === 'ARC') return;
      var x = p[0] * c - p[1] * s, y = -(p[0] * s + p[1] * c);
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    });
    pad = pad || 0;
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  }
  var capPts = [];
  for (var k = 0; k <= 12; k++) {
    var t = Math.PI / 2 + k * Math.PI / 12;
    capPts.push([HANDLE_END + Math.cos(t) * HW, Math.sin(t) * HW]);
  }
  var LETTER_BOX = bbox(LETTER, LETTER_ANGLE, 2);
  var ICON_BOX = bbox(ICON.concat(capPts), ICON_ANGLE, 4);

  function svgPath(outline) {
    var d = '';
    outline.forEach(function (p, i) {
      if (p === 'ARC') { d += ' A' + HW + ',' + HW + ' 0 0 0 '; return; }
      var s = p[0] + ',' + (-p[1]);
      if (i === 0) d += 'M' + s; else if (outline[i - 1] === 'ARC') d += s; else d += ' L' + s;
    });
    return d + ' Z';
  }
  var LETTER_PATH = svgPath(LETTER), ICON_PATH = svgPath(ICON);
  var uid = 0;

  /*
   * glyphSVG(opts)
   *   opts.variant - 'letter' (default) or 'icon'
   *   opts.fill    - CSS color or 'url(#id)' (default: currentColor)
   *   opts.defs    - extra <defs> markup (gradients, filters)
   *   opts.cls, opts.style - class and inline style for the <svg>
   */
  function glyphSVG(opts) {
    opts = opts || {};
    var icon = opts.variant === 'icon';
    var box = icon ? ICON_BOX : LETTER_BOX, fill = opts.fill || 'currentColor';
    var vb = box.map(function (v, i) { return (i < 2 ? v : v - box[i - 2]).toFixed(2); }).join(' ');
    var id = 'scrapHole' + (uid++), mask = '';
    if (icon) {
      mask = '<mask id="' + id + '"><rect x="-200" y="-200" width="400" height="400" fill="#fff"/>' +
        '<circle cx="' + HOLE_X + '" cy="0" r="' + HOLE_R + '" fill="#000"/></mask>';
    }
    return '<svg class="' + (opts.cls || 'scrap-glyph') + '" viewBox="' + vb + '" style="' + (opts.style || '') +
      '" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + mask + (opts.defs || '') + '</defs>' +
      '<g transform="rotate(-' + (icon ? ICON_ANGLE : LETTER_ANGLE) + ')"' + (icon ? ' mask="url(#' + id + ')"' : '') + '>' +
      '<path d="' + (icon ? ICON_PATH : LETTER_PATH) + '" fill="' + fill +
      '" stroke="' + fill + '" stroke-width="2" stroke-linejoin="round"/></g></svg>';
  }

  /*
   * Wordmark: S + letter C + RAP. The page sets font, color, and size.
   * CAP is the cap height of the display font in em. The C center sits at CAP/2.
   */
  function wordmarkHTML(opts) {
    opts = opts || {};
    var cap = opts.cap || 0.72, u = cap / (2 * Y), b = LETTER_BOX;
    var w = (b[2] - b[0]) * u, h = (b[3] - b[1]) * u;
    var drop = b[3] * u - cap / 2;
    opts.variant = 'letter';
    opts.cls = 'scrap-glyph';
    opts.style = 'width:' + w.toFixed(3) + 'em;height:' + h.toFixed(3) + 'em;margin:0 0.035em 0 0.03em;' +
      'transform:translateY(' + drop.toFixed(3) + 'em)';
    return '<span class="scrap-wordmark" aria-label="Scrap" role="img">' +
      '<span>S</span>' + glyphSVG(opts) + '<span>RAP</span></span>';
  }

  // Text antialiasing for every page that loads the kit.
  var CSS =
    'html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;' +
    'text-rendering:optimizeLegibility;font-kerning:normal}' +
    '.scrap-wordmark{display:inline-flex;align-items:baseline;white-space:nowrap;line-height:1}' +
    '.scrap-wordmark .scrap-glyph{overflow:visible;flex:none}' +
    '.scrap-glyph-solo{width:1em;height:1em;overflow:visible}';

  function hydrate(root) {
    root = root || document;
    if (!document.getElementById('scrap-brand-css')) {
      var st = document.createElement('style');
      st.id = 'scrap-brand-css';
      st.textContent = CSS;
      document.head.insertBefore(st, document.head.firstChild);
    }
    if (!document.querySelector('link[rel="icon"]')) {
      var ic = document.createElement('link');
      ic.rel = 'icon';
      ic.href = 'data:image/svg+xml,' + encodeURIComponent(glyphSVG({ variant: 'icon', fill: '#ffc21a' }));
      document.head.appendChild(ic);
    }
    root.querySelectorAll('[data-scrap-wordmark]').forEach(function (el) {
      el.innerHTML = wordmarkHTML({
        fill: el.getAttribute('data-fill') || undefined,
        cap: parseFloat(el.getAttribute('data-cap')) || undefined
      });
    });
    root.querySelectorAll('[data-scrap-glyph]').forEach(function (el) {
      el.innerHTML = glyphSVG({
        variant: el.getAttribute('data-scrap-glyph') || 'icon',
        fill: el.getAttribute('data-fill') || undefined, cls: 'scrap-glyph-solo'
      });
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

    function wrenchShape(variant) {
      var icon = variant !== 'letter', outline = icon ? ICON : LETTER, s = new THREE.Shape();
      outline.forEach(function (p, i) {
        if (p === 'ARC') { s.absarc(HANDLE_END, 0, HW, Math.PI / 2, Math.PI * 1.5, false); return; }
        if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]);
      });
      s.closePath();
      if (icon) {
        var h = new THREE.Path();
        h.absarc(HOLE_X, 0, HOLE_R, 0, Math.PI * 2, true);
        s.holes.push(h);
      }
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
     * wrench(opts) -> THREE.Group with the mesh in userData.mesh.
     *   opts.variant - 'icon' (default, with handle) or 'letter' (the C only)
     *   opts.scale   - units per outline unit (default 0.01: the head is 1 unit tall)
     * The mesh is centered on the head, not on the bounding box, so the
     * group turns about the jaw. The turn angle of the variant is applied.
     */
    function wrench(opts) {
      opts = opts || {};
      var icon = opts.variant !== 'letter';
      var geo = new THREE.ExtrudeGeometry(wrenchShape(opts.variant), {
        depth: opts.depth || 16, bevelEnabled: true, bevelThickness: 3, bevelSize: 2,
        bevelSegments: 6, curveSegments: 40
      });
      geo.translate(0, 0, -(opts.depth || 16) / 2);
      geo.computeVertexNormals();
      var mesh = new THREE.Mesh(geo, opts.material || materials.paint());
      var pivot = new THREE.Group();
      mesh.rotation.z = THREE.MathUtils.degToRad(icon ? ICON_ANGLE : LETTER_ANGLE);
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
        // The default composer target has no MSAA, so bloom pages lose the
        // canvas antialias. A multisampled half-float target restores it.
        var rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: opts.samples || 4 });
        composer = new addons.EffectComposer(renderer, rt);
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
      brushedTexture: brushedTexture, noiseTexture: noiseTexture,
      LETTER_ANGLE: LETTER_ANGLE, ICON_ANGLE: ICON_ANGLE,
      ANGLE: ICON_ANGLE // older name, kept until no page reads it
    };
  }

  window.ScrapBrand = {
    LETTER_PATH: LETTER_PATH, ICON_PATH: ICON_PATH, glyphSVG: glyphSVG, wordmarkHTML: wordmarkHTML,
    hydrate: hydrate, three: three, LETTER_ANGLE: LETTER_ANGLE, ICON_ANGLE: ICON_ANGLE
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  else hydrate();
})();
