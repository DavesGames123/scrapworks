/*
 * ScrapWorks brand kit. The pages load this file as a classic script.
 *
 * Contents (grep -n for the names):
 *   LOGO               - logo parameters (font, weight, jaw, nut, handle). Not final.
 *   setLogo()          - merges new parameters and redraws every mark on the page
 *   roundPoly()        - replaces each polygon corner with a tangent arc
 *   headPoly()         - wrench head outline; with a handle for the icon
 *   nutPoly()          - hex nut in the jaw
 *   glyphSVG()         - inline SVG: variant 'letter' (the C) or 'icon' (full wrench)
 *   wordmarkHTML()     - S + C + RAP in the logo font
 *   hydrate()          - fills [data-scrap-wordmark] and [data-scrap-glyph], sets favicon
 *   three()            - Three.js helpers: stage (MSAA bloom), materials,
 *                        soft geometry (soft.*), wrench, hex nut, bolt
 *
 * The C is the round head of an open-end wrench with a nut in its jaw.
 * One parameter set drives the wordmark, the icon, the favicon, and the
 * 3D wrench. Use design/logo-orbitron.html to find values, and its "Copy
 * params" output with setLogo(). All units: cap height = 100, y-up.
 */
(function () {
  'use strict';

  var LOGO = {
    // Chosen by the user in design/logo-orbitron.html on 2026-10-29.
    font: 'Orbitron', weight: 710,
    tilt: 0,        // jaw turn, degrees CCW
    h: 27.5,        // jaw half opening
    depth: 9,       // jaw back moves left (+) or right (-)
    back: 'v',      // jaw back: 'v' | 'round' | 'flat'
    nut: 0.94,      // nut size, 0 = no nut, 1 = fills the jaw minus the gap
    gap: 5, spin: 0, hole: 0, tone: 0.63, slide: 0,
    sx: 1.09,       // letter head width; the icon head stays round
    tipR: 3.5,      // jaw tip radius
    space: -0.5,    // side space around the C in the wordmark
    iconAngle: 35,  // icon turn, degrees CCW
    handle: { L: 175, w0: 17, w1: 14, neck: 24, hole: 0.45 }
  };

  /* ---------------- 2D geometry ---------------- */

  function rot(p, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  }

  // pts: [[x, y, r], ...] closed. Each corner becomes a tangent arc of radius r.
  function roundPoly(pts, seg) {
    seg = seg || 10;
    var out = [], n = pts.length;
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
    function nrm(a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }
    for (var i = 0; i < n; i++) {
      var P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n], r = P[2] || 0;
      if (r <= 0) { out.push([P[0], P[1]]); continue; }
      var u1 = nrm(sub(A, P)), u2 = nrm(sub(B, P));
      var th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
      if (th < 1e-3 || Math.PI - th < 1e-3) { out.push([P[0], P[1]]); continue; }
      var d = r / Math.tan(th / 2), lim = Math.min(Math.hypot(A[0] - P[0], A[1] - P[1]), Math.hypot(B[0] - P[0], B[1] - P[1])) / 2;
      if (d > lim) { d = lim; r = d * Math.tan(th / 2); }
      var bis = nrm([u1[0] + u2[0], u1[1] + u2[1]]), k = r / Math.sin(th / 2);
      var C = [P[0] + bis[0] * k, P[1] + bis[1] * k];
      var T1 = [P[0] + u1[0] * d, P[1] + u1[1] * d], T2 = [P[0] + u2[0] * d, P[1] + u2[1] * d];
      var a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), da = a2 - a1;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      var m = Math.max(2, Math.ceil(seg * Math.abs(da) / (Math.PI / 2)));
      for (var j = 0; j <= m; j++) { var a = a1 + da * j / m; out.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); }
    }
    return out;
  }

  // Jaw back x (jaw frame). A V back sits where a regular hex nut vertex would sit.
  function jawBack(p) { return -(p.h * Math.tan(Math.PI / 6)) - p.depth - 6; }

  /*
   * headPoly(p, icon) -> [[x, y], ...]
   * Round head (R = 50) with the jaw. icon = true adds the handle along -x
   * with a round end (a true half circle, so the taper does not notch it).
   */
  function headPoly(p, icon) {
    var R = 50, h = p.h, tilt = p.tilt, jb = jawBack(p), back = p.back;
    function J(u, v) { return rot([u, v], tilt); }
    var a2 = back === 'v' ? jb + h * Math.tan(Math.PI / 6) : back === 'round' ? jb + h : jb;
    // Where the jaw flats leave the circle.
    var tipT = J(Math.sqrt(R * R - h * h), h), tipB = J(Math.sqrt(R * R - h * h), -h);
    var angT = Math.atan2(tipT[1], tipT[0]), angB = Math.atan2(tipB[1], tipB[0]);
    if (angB < angT) angB += 2 * Math.PI;
    var pts = [[tipT[0], tipT[1], p.tipR]], N = 96, hd = p.handle;
    var nx = icon ? -Math.sqrt(R * R - hd.w0 * hd.w0) : 0;
    var angNT = Math.atan2(hd.w0, nx), angNB = Math.atan2(-hd.w0, nx) + 2 * Math.PI;
    var handleDone = false;
    // Leave room next to each rounded corner, or roundPoly must shrink the
    // radius to fit a short circle segment (the tip then spikes under a bevel).
    var dTip = 3 * p.tipR / R, dNeck = 1.2 * hd.neck / R;
    for (var i = 1; i < N; i++) {
      var a = angT + (angB - angT) * i / N;
      if (a - angT < dTip || angB - a < dTip) continue;
      if (icon && a > angNT && a < angNB) {
        if (!handleDone) {
          handleDone = true;
          pts.push([nx, hd.w0, hd.neck]);
          pts.push([-hd.L, hd.w1, 0]);
          for (var k = 1; k < 16; k++) { var b = Math.PI / 2 + k * Math.PI / 16; pts.push([-hd.L + Math.cos(b) * hd.w1, Math.sin(b) * hd.w1, 0]); }
          pts.push([-hd.L, -hd.w1, 0]);
          pts.push([nx, -hd.w0, hd.neck]);
        }
        continue;
      }
      if (icon && (Math.abs(a - angNT) < dNeck || Math.abs(a - angNB) < dNeck)) continue;
      pts.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
    }
    pts.push([tipB[0], tipB[1], p.tipR]);
    var q;
    if (back === 'v') {
      q = J(a2, -h); pts.push([q[0], q[1], 3]);
      q = J(jb, 0); pts.push([q[0], q[1], 4]);
      q = J(a2, h); pts.push([q[0], q[1], 3]);
    } else if (back === 'flat') {
      q = J(jb, -h); pts.push([q[0], q[1], 4]);
      q = J(jb, h); pts.push([q[0], q[1], 4]);
    } else {
      for (var j = 0; j <= 16; j++) { var an = -Math.PI / 2 - j * Math.PI / 16; q = J(a2 + Math.cos(an) * h, Math.sin(an) * h); pts.push([q[0], q[1], 0]); }
    }
    return roundPoly(pts, 12);
  }

  // Nut in the jaw: { poly, center: [x, y], r, holeR } in head units.
  function nutPoly(p) {
    if (!(p.nut > 0)) return null;
    var rMax = (p.h - p.gap) / Math.cos(Math.PI / 6), r = rMax * p.nut, cx = jawBack(p) + p.gap + rMax + p.slide, pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (i * 60 + p.spin) * Math.PI / 180, q = rot([cx + Math.cos(a) * r, Math.sin(a) * r], p.tilt);
      pts.push([q[0], q[1], r * 0.1]);
    }
    return { poly: roundPoly(pts, 6), center: rot([cx, 0], p.tilt), r: r, holeR: r * p.hole };
  }

  function svgPath(poly, sx) {
    sx = sx || 1;
    return poly.map(function (q, i) { return (i ? 'L' : 'M') + (q[0] * sx).toFixed(2) + ',' + (-q[1]).toFixed(2); }).join('') + 'Z';
  }
  function circlePath(x, y, r) {
    return 'M' + (x + r) + ',' + y + 'A' + r + ',' + r + ' 0 1 0 ' + (x - r) + ',' + y + 'A' + r + ',' + r + ' 0 1 0 ' + (x + r) + ',' + y + 'Z';
  }

  /*
   * glyphSVG(opts)
   *   opts.variant - 'letter' (default) or 'icon'
   *   opts.fill    - CSS color (default: currentColor)
   *   opts.cls, opts.style, opts.viewBox
   */
  function glyphSVG(opts) {
    opts = opts || {};
    var p = LOGO, icon = opts.variant === 'icon', fill = opts.fill || 'currentColor';
    var sx = icon ? 1 : p.sx, head = headPoly(p, icon), nut = nutPoly(p), body = '', vb;
    var d = svgPath(head, sx);
    if (icon && p.handle.hole > 0) d += circlePath(-p.handle.L, 0, p.handle.w1 * p.handle.hole);
    body += '<path d="' + d + '" fill="' + fill + '" fill-rule="evenodd"/>';
    if (nut) {
      var nd = svgPath(nut.poly, sx);
      if (nut.holeR > 0) nd += circlePath(nut.center[0] * sx, -nut.center[1], nut.holeR);
      body += '<path d="' + nd + '" fill="' + fill + '" fill-rule="evenodd" opacity="' + p.tone + '"/>';
    }
    if (icon) {
      var b = [1e9, 1e9, -1e9, -1e9];
      head.forEach(function (q) { var r = rot(q, p.iconAngle); b[0] = Math.min(b[0], r[0]); b[1] = Math.min(b[1], -r[1]); b[2] = Math.max(b[2], r[0]); b[3] = Math.max(b[3], -r[1]); });
      var s = Math.max(b[2] - b[0], b[3] - b[1]) + 8, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      vb = (cx - s / 2).toFixed(1) + ' ' + (cy - s / 2).toFixed(1) + ' ' + s.toFixed(1) + ' ' + s.toFixed(1);
      body = '<g transform="rotate(' + (-p.iconAngle) + ')">' + body + '</g>';
    } else {
      var w = 100 * sx + 2 * p.space;
      vb = opts.viewBox || ((-w / 2) + ' -50 ' + w + ' 100');
    }
    return '<svg class="' + (opts.cls || 'scrap-glyph') + '" viewBox="' + vb + '" style="' + (opts.style || '') +
      '" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }

  // Cap height of the logo font, in em. Measured after the font loads.
  var capEm = 0.72;
  function measureCap() {
    try {
      var c = document.createElement('canvas').getContext('2d');
      c.font = LOGO.weight + " 400px '" + LOGO.font + "'";
      var m = c.measureText('H').actualBoundingBoxAscent / 400;
      if (m > 0.3 && m < 1) capEm = m;
    } catch (e) {}
  }

  /*
   * Wordmark: S + C + RAP in the logo font and weight. The page sets color and
   * size. The C is drawn at cap height, on the baseline.
   */
  function wordmarkHTML(opts) {
    opts = opts || {};
    var p = LOGO, pad = 24, w = 100 * p.sx + 2 * p.space, u = capEm / 100;
    opts.variant = 'letter';
    opts.cls = 'scrap-glyph';
    opts.viewBox = (-w / 2) + ' ' + (-50 - pad) + ' ' + w + ' ' + (100 + 2 * pad);
    opts.style = 'width:' + (w * u).toFixed(4) + 'em;height:' + ((100 + 2 * pad) * u).toFixed(4) + 'em;' +
      'transform:translateY(' + (pad * u).toFixed(4) + 'em)';
    return '<span class="scrap-wordmark" aria-label="Scrap" role="img" style="font-family:\'' + p.font + '\',sans-serif;font-weight:' + p.weight + '">' +
      '<span>S</span>' + glyphSVG(opts) + '<span>RAP</span></span>';
  }

  // Text antialiasing for every page that loads the kit.
  var CSS =
    'html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;' +
    'text-rendering:optimizeLegibility;font-kerning:normal}' +
    '.scrap-wordmark{display:inline-flex;align-items:baseline;white-space:nowrap;line-height:1;font-synthesis:none}' +
    '.scrap-wordmark .scrap-glyph{overflow:visible;flex:none}' +
    '.scrap-glyph-solo{width:1em;height:1em;overflow:visible}';

  function ensureFont() {
    var id = 'scrap-logo-font', href = 'https://fonts.googleapis.com/css2?family=' + LOGO.font.replace(/ /g, '+') + ':wght@400..900&display=swap';
    var l = document.getElementById(id);
    if (l && l.getAttribute('href') === href) return;
    if (!l) { l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; document.head.appendChild(l); }
    l.href = href;
    var redraw = function () {
      if (!document.fonts) return;
      document.fonts.load(LOGO.weight + " 40px '" + LOGO.font + "'", 'SCRAP').then(function () { measureCap(); hydrate(); });
    };
    if (l.sheet) redraw(); else l.addEventListener('load', redraw);
  }

  function hydrate(root) {
    root = root || document;
    if (!document.getElementById('scrap-brand-css')) {
      var st = document.createElement('style');
      st.id = 'scrap-brand-css';
      st.textContent = CSS;
      document.head.insertBefore(st, document.head.firstChild);
    }
    var ic = document.getElementById('scrap-favicon');
    if (!ic && !document.querySelector('link[rel="icon"]')) {
      ic = document.createElement('link'); ic.id = 'scrap-favicon'; ic.rel = 'icon'; document.head.appendChild(ic);
    }
    if (ic) ic.href = 'data:image/svg+xml,' + encodeURIComponent(glyphSVG({ variant: 'icon', fill: '#ffc21a' }));
    root.querySelectorAll('[data-scrap-wordmark]').forEach(function (el) { el.innerHTML = wordmarkHTML({ fill: el.getAttribute('data-fill') || undefined }); });
    root.querySelectorAll('[data-scrap-glyph]').forEach(function (el) {
      el.innerHTML = glyphSVG({ variant: el.getAttribute('data-scrap-glyph') || 'icon', fill: el.getAttribute('data-fill') || undefined, cls: 'scrap-glyph-solo' });
    });
  }

  // setLogo(params): merge parameters (for example the lab's "Copy params"
  // output) and redraw. 3D wrenches made after the call use the new values.
  function setLogo(params) {
    params = params || {};
    Object.keys(params).forEach(function (k) {
      if (k === 'handle') Object.assign(LOGO.handle, params.handle); else LOGO[k] = params[k];
    });
    ensureFont();
    hydrate();
  }

  /* ------------------------------------------------------------------ */
  /* Three.js helpers. Call ScrapBrand.three(THREE, addons) from a module */
  /* script. addons = { RoomEnvironment, EffectComposer, RenderPass,      */
  /* UnrealBloomPass, OutputPass, RoundedBoxGeometry, BufferGeometryUtils }*/
  /* The bloom and soft-geometry addons are optional.                     */
  /* ------------------------------------------------------------------ */
  function three(THREE, addons) {
    addons = addons || {};
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    /*
     * Cast texture for rough metal: low-frequency value noise (smooth blobs),
     * so the roughness varies across a part, not per texel. Per-texel noise
     * sparkles under motion. Returned as { rough, normal } canvas textures.
     */
    function castTextures(size) {
      size = size || 256;
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
      for (var i = 0; i < 260; i++) {
        var x = Math.random() * size, y = Math.random() * size, r = size * (0.03 + Math.random() * 0.12), v = Math.random() < 0.5 ? 0 : 255;
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.10)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      var img = g.getImageData(0, 0, size, size), d = img.data, n = document.createElement('canvas');
      n.width = n.height = size;
      var ng = n.getContext('2d'), out = ng.createImageData(size, size), o = out.data;
      function h(x, y) { x = (x + size) % size; y = (y + size) % size; return d[(y * size + x) * 4] / 255; }
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2, k = (y * size + x) * 4;
        o[k] = 128 - dx * 127; o[k + 1] = 128 - dy * 127; o[k + 2] = 255; o[k + 3] = 255;
      }
      ng.putImageData(out, 0, 0);
      var rough = new THREE.CanvasTexture(c), normal = new THREE.CanvasTexture(n);
      [rough, normal].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; });
      return { rough: rough, normal: normal };
    }
    var cast = castTextures();

    /*
     * Materials are calm on purpose. No roughness or bump maps: the canvas
     * textures average about 0.5, so as roughness maps they halved the
     * roughness, and per-texel variation sparkled as the object turned.
     * Brushed metal gets its look from anisotropy, which does not shimmer.
     * Minimum roughness is about 0.4, so highlights stay under the bloom
     * threshold that stage() enforces.
     */
    var materials = {
      // Safety-yellow paint with a satin clear coat. The wrench uses this.
      paint: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xf5b81a, metalness: 0.1, roughness: 0.5,
          clearcoat: 0.6, clearcoatRoughness: 0.4
        }, o || {}));
      },
      // Yellow anodized metal: brushed, satin.
      anodized: function (o) {
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xe8a90c, metalness: 1, roughness: 0.42, anisotropy: 0.5
        }, o || {}));
      },
      // With anisotropy: 0, steel and darkSteel return the cheaper MeshStandardMaterial.
      steel: function (o) {
        if (o && o.anisotropy === 0 && !o.clearcoat) {
          var so = Object.assign({}, o); delete so.anisotropy;
          return new THREE.MeshStandardMaterial(Object.assign({ color: 0xa9adb3, metalness: 1, roughness: 0.45 }, so));
        }
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0xa9adb3, metalness: 1, roughness: 0.45, anisotropy: 0.6
        }, o || {}));
      },
      darkSteel: function (o) {
        if (o && o.anisotropy === 0 && !o.clearcoat) {
          var so = Object.assign({}, o); delete so.anisotropy;
          return new THREE.MeshStandardMaterial(Object.assign({ color: 0x2c3036, metalness: 1, roughness: 0.52 }, so));
        }
        return new THREE.MeshPhysicalMaterial(Object.assign({
          color: 0x2c3036, metalness: 1, roughness: 0.52, anisotropy: 0.4
        }, o || {}));
      },
      /*
       * Brass: fully metallic, satin, clean. The user found the cast-texture
       * version "way too rough/smudged", and its non-tiling canvas showed seams.
       * No anisotropy: the slab side walls have UVs that do not change along the
       * depth, so the anisotropic tangent degenerates and writes white specks.
       */
      brass: function (o) {
        o = Object.assign({}, o || {});
        delete o.repeat;
        // Standard, not Physical: no clearcoat or anisotropy here, and the physical shader costs more per pixel.
        return new THREE.MeshStandardMaterial(Object.assign({ color: 0xc9a75a, metalness: 1, roughness: 0.32 }, o));
      },
      // Older, darker brass for secondary parts.
      brassDark: function (o) { return materials.brass(Object.assign({ color: new THREE.Color(0x9c7f3e), roughness: 0.38 }, o || {})); },
      castIron: function (o) {
        return new THREE.MeshStandardMaterial(Object.assign({
          color: 0x1c1d20, metalness: 0.8, roughness: 0.72
        }, o || {}));
      },
      // Unlit emissive. Values over 1 pass the bloom threshold. toneMapped false keeps the color.
      glow: function (color, intensity) {
        var c = new THREE.Color(color == null ? 0xffb300 : color).multiplyScalar(intensity || 1.8);
        return new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
      }
    };


    /*
     * Soft geometry. One edge language for every object: plan-view corners
     * are tangent arcs, the bevel radius matches them, and the normals are
     * smoothed across the bevel. Sharp polygon corners next to soft bevels
     * read as two edge languages, so no geometry in the scene skips this.
     *   soft.extrude(pts | Shape, { depth, radius, holes, corner })
     *   soft.box(w, h, d, r)        soft.cylinder(r, h, bevel, seg)
     *   soft.ring(rOut, rIn, h, b)  soft.hexNut(r, depth, holeRatio)
     *   soft.gear(teeth, r, depth, hole)  soft.pipe(curve, r)
     */
    var CREASE = Math.PI / 3;
    function smooth(geo) {
      var U = addons.BufferGeometryUtils;
      if (U && U.toCreasedNormals) return U.toCreasedNormals(geo, CREASE);
      geo.computeVertexNormals();
      return geo;
    }
    function toShape(pts) {
      var s = new THREE.Shape();
      pts.forEach(function (q, i) { if (i) s.lineTo(q[0], q[1]); else s.moveTo(q[0], q[1]); });
      s.closePath();
      return s;
    }
    function circleHole(x, y, r) { var h = new THREE.Path(); h.absarc(x, y, r, 0, Math.PI * 2, true); return h; }

    /*
     * roundedSlab(outer, holes, depth, r, seg) -> BufferGeometry
     * A slab with a quarter-round edge of radius r on both faces.
     *   outer: [[x, y], ...] dense outline (already rounded). holes: list of the same.
     * The edge is swept along the outline: each point moves along its 2D outward
     * normal by r*sin(phi) from the inset contour, and z follows r*cos(phi).
     * Normals are exact: (n * sin(phi), cos(phi)). The caps are flat, with
     * normals (0, 0, +-1). Convex outline corners need a radius larger than r.
     */
    function roundedSlab(outer, holes, depth, r, seg) {
      var U = THREE.ShapeUtils, zf = depth / 2, zi = Math.max(0, zf - r);
      r = Math.min(r, zf);
      function dedupe(c) { return c.filter(function (q, i) { var n = c[(i + 1) % c.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 1e-6; }); }
      function v2(c) { return c.map(function (q) { return new THREE.Vector2(q[0], q[1]); }); }
      outer = dedupe(outer); holes = holes.map(dedupe);
      // Orientation: outer CCW, holes CW. Then the right-hand normal of each edge points out of the solid.
      if (U.isClockWise(v2(outer))) outer.reverse();
      holes.forEach(function (h) { if (!U.isClockWise(v2(h))) h.reverse(); });
      var pos = [], nor = [], uv = [], idx = [];
      function vert(x, y, z, nx, ny, nz) { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(x, y); return pos.length / 3 - 1; }
      function inset(c) {
        var n = c.length, out = [], nrm = [];
        for (var i = 0; i < n; i++) {
          var a = c[(i + n - 1) % n], p = c[i], b = c[(i + 1) % n];
          var e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
          var l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
          var n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
          var m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]) || 1;
          m = [m[0] / ml, m[1] / ml];
          var k = Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]);   // miter, capped for sharp corners
          nrm.push(m);
          out.push([p[0] - m[0] * r / k, p[1] - m[1] * r / k, r / k]);
        }
        return { pts: out, nrm: nrm };
      }
      var all = [outer].concat(holes).map(inset);
      // Edge sweep: phi from 0 (front) to PI (back), with the flat wall between PI/2 rings.
      var phis = [];
      for (var i = 0; i <= seg; i++) phis.push(i / seg * Math.PI / 2);
      for (i = 0; i <= seg; i++) phis.push(Math.PI / 2 + i / seg * Math.PI / 2);
      all.forEach(function (ct) {
        var n = ct.pts.length, rows = [];
        phis.forEach(function (ph, j) {
          var back = j > seg, z = back ? -zi + r * Math.cos(ph) : zi + r * Math.cos(ph), row = [];
          for (var t = 0; t < n; t++) {
            var q = ct.pts[t], m = ct.nrm[t], d = q[2] * Math.sin(ph);
            row.push(vert(q[0] + m[0] * d, q[1] + m[1] * d, z, m[0] * Math.sin(ph), m[1] * Math.sin(ph), Math.cos(ph)));
          }
          rows.push(row);
        });
        for (var j = 0; j < rows.length - 1; j++) {
          for (var t = 0; t < n; t++) {
            var a = rows[j][t], b = rows[j][(t + 1) % n], c = rows[j + 1][t], d = rows[j + 1][(t + 1) % n];
            idx.push(a, c, b, b, c, d);
          }
        }
      });
      // Caps on the inset contours.
      var co = all[0].pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
      var ch = all.slice(1).map(function (ct) { return ct.pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }); });
      var tris = U.triangulateShape(co, ch), flat = co.concat.apply(co, ch);
      [[zf, 1], [-zf, -1]].forEach(function (side) {
        var base = pos.length / 3;
        flat.forEach(function (q) { vert(q.x, q.y, side[0], 0, 0, side[1]); });
        tris.forEach(function (tr) {
          if (side[1] > 0) idx.push(base + tr[0], base + tr[1], base + tr[2]);
          else idx.push(base + tr[0], base + tr[2], base + tr[1]);
        });
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      // Winding check: the first cap triangle must face +z. Flip all if not.
      geo.computeBoundingBox();
      return fixWinding(geo);
    }
    // Make every triangle wind so that its face normal agrees with its vertex normals.
    function fixWinding(geo) {
      var p = geo.attributes.position.array, n = geo.attributes.normal.array, ix = geo.index.array;
      for (var i = 0; i < ix.length; i += 3) {
        var a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        var vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        var dot = fx * (n[a] + n[b] + n[c]) + fy * (n[a + 1] + n[b + 1] + n[c + 1]) + fz * (n[a + 2] + n[b + 2] + n[c + 2]);
        if (dot < 0) { var t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      }
      return geo;
    }

    var soft = {
      // pts: [[x, y, r?], ...] corners rounded here (default radius o.corner), or a THREE.Shape.
      // pts: [[x, y, r?], ...] (corners rounded here, default radius o.corner) or a THREE.Shape.
      // o.holes: [[x, y, r], ...] circles, or THREE.Path. Built by roundedSlab(): flat caps with
      // exact flat normals, and a quarter-round edge with exact normals. No smoothing pass.
      extrude: function (pts, o) {
        o = o || {};
        var depth = o.depth || 0.2, r = o.radius == null ? depth * 0.18 : o.radius, outer, holes = [];
        if (pts instanceof THREE.Shape) {
          var ex = pts.extractPoints(24);
          outer = ex.shape.map(function (v) { return [v.x, v.y]; });
          holes = ex.holes.map(function (h) { return h.map(function (v) { return [v.x, v.y]; }); });
        } else {
          var c = o.corner == null ? r * 1.6 : o.corner;
          outer = roundPoly(pts.map(function (q) { return [q[0], q[1], q[2] == null ? c : q[2]]; }), 10);
        }
        (o.holes || []).forEach(function (h) {
          if (h instanceof THREE.Path) { holes.push(h.getPoints(48).map(function (v) { return [v.x, v.y]; })); return; }
          var ring = [];
          for (var i = 0; i < 64; i++) { var a = i / 64 * Math.PI * 2; ring.push([h[0] + Math.cos(a) * h[2], h[1] + Math.sin(a) * h[2]]); }
          holes.push(ring);
        });
        return roundedSlab(outer, holes, depth, r, o.segments || 6);
      },
      box: function (w, h, d, r) {
        r = r == null ? Math.min(w, h, d) * 0.12 : r;
        if (addons.RoundedBoxGeometry) return new addons.RoundedBoxGeometry(w, h, d, 4, r);
        return soft.extrude([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { depth: d, radius: r, corner: r });
      },
      // Lathe profile: flat caps with a round bevel. Y is the axis.
      cylinder: function (r, h, b, seg) {
        b = b == null ? Math.min(r, h) * 0.18 : b;
        var pts = [new THREE.Vector2(0, -h / 2)], i, a;
        for (i = 0; i <= 6; i++) { a = -Math.PI / 2 + i * Math.PI / 12; pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, -h / 2 + b + Math.sin(a) * b)); }
        for (i = 0; i <= 6; i++) { a = i * Math.PI / 12; pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b)); }
        pts.push(new THREE.Vector2(0, h / 2));
        return smooth(new THREE.LatheGeometry(pts, seg || 40));
      },
      ring: function (ro, ri, h, b) {
        b = b == null ? Math.min(ro - ri, h) * 0.3 : b;
        var pts = [], i, a;
        function arc(cx, cy, a0) { for (var k = 0; k <= 6; k++) { a = a0 + k * Math.PI / 12; pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b)); } }
        arc(ri + b, -h / 2 + b, Math.PI); arc(ro - b, -h / 2 + b, -Math.PI / 2);
        arc(ro - b, h / 2 - b, 0); arc(ri + b, h / 2 - b, Math.PI / 2);
        pts.push(pts[0].clone());
        return smooth(new THREE.LatheGeometry(pts, 40));
      },
      hexNut: function (r, depth, hole) {
        var pts = [];
        for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; pts.push([Math.cos(a) * r, Math.sin(a) * r, r * 0.12]); }
        return soft.extrude(pts, { depth: depth || r * 0.8, radius: r * 0.07, holes: hole === 0 ? [] : [[0, 0, r * (hole || 0.48)]] });
      },
      gear: function (teeth, r, depth, hole) {
        var pts = [], tooth = r * 0.16, n = teeth || 12;
        for (var i = 0; i < n; i++) {
          var a = i * 2 * Math.PI / n, w = Math.PI / n;
          [[a - w * 0.55, r - tooth], [a - w * 0.3, r], [a + w * 0.3, r], [a + w * 0.55, r - tooth]].forEach(function (q) {
            pts.push([Math.cos(q[0]) * q[1], Math.sin(q[0]) * q[1], tooth * 0.22]);
          });
        }
        return soft.extrude(pts, { depth: depth || r * 0.3, radius: (depth || r * 0.3) * 0.16, holes: [[0, 0, r * (hole || 0.22)]] });
      },
      pipe: function (curve, r, seg) { return new THREE.TubeGeometry(curve, seg || 64, r, 16, false); }
    };

    /*
     * wrench(opts) -> THREE.Group. Built from LOGO, so it follows setLogo().
     *   opts.variant  - 'icon' (default, with handle) or 'letter' (the C only)
     *   opts.scale    - units per logo unit (default 0.01: the head is 1 unit tall)
     *   opts.material, opts.nutMaterial, opts.depth (logo units, default 16)
     *   opts.nut      - false hides the nut
     * userData.mesh is the wrench, userData.nut the nut (may be null).
     * The group pivots on the head center. The icon angle is applied.
     */
    function wrench(opts) {
      opts = opts || {};
      var p = LOGO, icon = opts.variant !== 'letter', sx = icon ? 1 : p.sx, depth = opts.depth || 16;
      var pts = headPoly(p, icon).map(function (q) { return [q[0] * sx, q[1], 0]; });
      var holes = icon && p.handle.hole > 0 ? [[-p.handle.L, 0, p.handle.w1 * p.handle.hole]] : [];
      var geo = soft.extrude(pts, { depth: depth, radius: Math.min(2.4, p.tipR * 0.7), corner: 0, holes: holes });
      var group = new THREE.Group(), inner = new THREE.Group();
      var mesh = new THREE.Mesh(geo, opts.material || materials.paint());
      inner.add(mesh);
      var nut = null, np = opts.nut === false ? null : nutPoly(p);
      if (np) {
        var ngeo = soft.hexNut(np.r, depth * 1.15, np.holeR > 0 ? np.holeR / np.r : 0.42);
        nut = new THREE.Mesh(ngeo, opts.nutMaterial || materials.steel({ anisotropy: 0 }));
        nut.position.set(np.center[0] * sx, np.center[1], 0);
        nut.rotation.z = (p.spin + p.tilt) * Math.PI / 180;
        inner.add(nut);
      }
      inner.rotation.z = icon ? p.iconAngle * Math.PI / 180 : 0;
      inner.scale.setScalar(opts.scale || 0.01);
      group.add(inner);
      group.userData.mesh = mesh;
      group.userData.nut = nut;
      return group;
    }

    function hexNut(opts) {
      opts = opts || {};
      var r = opts.r || 0.24;
      return new THREE.Mesh(soft.hexNut(r, opts.depth || r * 0.8), opts.material || materials.steel({ anisotropy: 0 }));
    }

    function bolt(opts) {
      opts = opts || {};
      var g = new THREE.Group(), r = opts.r || 0.08, m = opts.material || materials.steel({ anisotropy: 0 });
      var head = new THREE.Mesh(soft.hexNut(r, r * 0.6, 0), m);
      head.rotation.x = Math.PI / 2;
      var shaft = new THREE.Mesh(soft.cylinder(r * 0.5, r * 4, r * 0.12, 24), m);
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
        scene.environmentIntensity = opts.envIntensity == null ? 0.7 : opts.envIntensity;
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
        // Clamp the page values. A threshold under 1 lets metal highlights
        // bloom, and they cross it on some frames only, which reads as flicker.
        // Only glow materials (toneMapped false, value over 1) bloom.
        var b = opts.bloom;
        composer.addPass(new addons.UnrealBloomPass(new THREE.Vector2(256, 256),
          Math.min(b.strength == null ? 0.35 : b.strength, 0.45),
          Math.min(b.radius == null ? 0.35 : b.radius, 0.45),
          Math.max(b.threshold == null ? 1.05 : b.threshold, 1.05)));
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

      // held: no frames render. A page holds the stage while it builds the scene and
      // precompiles its shaders, so no draw call compiles a program on the main thread.
      var hooks = [], clock = new THREE.Clock(), visible = true, running = false, held = !!opts.hold;
      function render(force) {
        if (held && !force) return;
        if (composer) composer.render(); else renderer.render(scene, camera);
      }
      function frame() {
        if (!visible || reduceMotion || held) { running = false; return; }
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
        render: render,
        // hold(true) stops rendering; hold(false) resumes the loop.
        hold: function (on) { held = !!on; if (!held && visible && !reduceMotion) start(); },
        /*
         * warm(updates): precompile every program the scene can use, then render once per
         * update callback (with force) so the post passes and state variants compile too.
         * All objects are visible during compileAsync, so lazy compiles never happen later.
         */
        warm: function (updates) {
          var shown = [];
          scene.traverse(function (o) { if (!o.visible) { shown.push(o); o.visible = true; } });
          var p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera));
          return p.catch(function () {}).then(function () {
            shown.forEach(function (o) { o.visible = false; });
            var chain = Promise.resolve();
            (updates || []).forEach(function (fn) {
              chain = chain.then(function () {
                fn(); render(true);
                return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
              });
            });
            return chain;
          });
        }
      };
    }

    return {
      THREE: THREE, materials: materials, soft: soft, wrench: wrench,
      hexNut: hexNut, bolt: bolt, stage: stage,
      brushedTexture: brushedTexture, noiseTexture: noiseTexture
    };
  }

  window.ScrapBrand = {
    LOGO: LOGO, setLogo: setLogo, roundPoly: roundPoly, headPoly: headPoly, nutPoly: nutPoly,
    glyphSVG: glyphSVG, wordmarkHTML: wordmarkHTML, hydrate: hydrate, three: three
  };
  function boot() { ensureFont(); hydrate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
