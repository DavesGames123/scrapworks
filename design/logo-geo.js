// Logo geometry lab. Math units, y-up, cap height 100, center (0,0).
(function (G) {
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l]; }
  function rot(p, deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }

  // pts: [[x,y,r], ...] closed. Each vertex is replaced by a tangent arc of radius r.
  function roundPoly(pts, seg) {
    seg = seg || 10;
    var out = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n], r = P[2] || 0;
      if (r <= 0) { out.push([P[0], P[1]]); continue; }
      var u1 = norm(sub(A, P)), u2 = norm(sub(B, P));
      var cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])), th = Math.acos(cos);
      if (th < 1e-3 || Math.PI - th < 1e-3) { out.push([P[0], P[1]]); continue; }
      var d = r / Math.tan(th / 2);
      var lim = Math.min(len(sub(A, P)), len(sub(B, P))) / 2;
      if (d > lim) { d = lim; r = d * Math.tan(th / 2); }
      var T1 = add(P, mul(u1, d)), T2 = add(P, mul(u2, d));
      var C = add(P, mul(norm(add(u1, u2)), r / Math.sin(th / 2)));
      var a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
      var da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      var k = Math.max(2, Math.ceil(seg * Math.abs(da) / (Math.PI / 2)));
      for (var j = 0; j <= k; j++) { var a = a1 + da * j / k; out.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); }
    }
    return out;
  }

  /*
   * Wrench head as a letter C.
   *  W: outer width. t: stroke. tilt: jaw offset in degrees (CCW).
   *  corner: 'round' (radius rc) or 'chamfer' (size ch, small radius rs).
   *  handle: null, or { L, w0, w1, neck } for the icon.
   */
  function head(o) {
    var H = 50, X = o.W / 2, t = o.t, tilt = o.tilt || 0;
    var h = H - t;                       // half opening at the jaw center
    var back = -X + t;                   // back vertex x of the hex jaw
    var a = back + h * Math.tan(Math.PI / 6); // flat end vertex (regular hex)
    var U = X + 6;                       // jaw cut, along the jaw axis
    function J(u, v) { return rot([u, v], tilt); }
    function cutAt(y) {                  // the cut line u = U meets y
      var s = Math.sin(tilt * Math.PI / 180), c = Math.cos(tilt * Math.PI / 180);
      var v = (y - U * s) / c; return J(U, v);
    }
    var tipR = o.tipR == null ? 2.5 : o.tipR, ir = o.ir == null ? 3 : o.ir;
    var top = cutAt(H), bot = cutAt(-H);
    var pts = [[top[0], top[1], tipR]];
    function corner(x, y, sy) {           // sy: +1 top, -1 bottom
      if (o.corner === 'chamfer') {
        pts.push([x + o.ch, y, o.rs || 2]);
        pts.push([x, y - sy * o.ch, o.rs || 2]);
      } else pts.push([x, y, o.rc]);
    }
    corner(-X, H, 1);
    if (o.handle) {
      var hd = o.handle;
      pts.push([-X, hd.w0, hd.neck || 8]);
      pts.push([-hd.L, hd.w1, hd.w1]);
      pts.push([-hd.L, -hd.w1, hd.w1]);
      pts.push([-X, -hd.w0, hd.neck || 8]);
    }
    // bottom-left: walk order is top-left then bottom-left
    if (o.corner === 'chamfer') {
      pts.push([-X, -H + o.ch, o.rs || 2]);
      pts.push([-X + o.ch, -H, o.rs || 2]);
    } else pts.push([-X, -H, o.rc]);
    pts.push([bot[0], bot[1], tipR]);
    var p;
    p = J(U, -h); pts.push([p[0], p[1], 1.5]);
    p = J(a, -h); pts.push([p[0], p[1], ir]);
    p = J(back - (o.vback || 0), 0); pts.push([p[0], p[1], o.vr == null ? ir + 1 : o.vr]);
    p = J(a, h); pts.push([p[0], p[1], ir]);
    p = J(U, h); pts.push([p[0], p[1], 1.5]);
    return roundPoly(pts, 12);
  }

  function bbox(poly, deg) {
    var b = [1e9, 1e9, -1e9, -1e9];
    poly.forEach(function (q) { var p = rot(q, deg); p[1] = -p[1];
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }
  function svgPath(poly) {
    return poly.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + (-p[1]).toFixed(2); }).join('') + 'Z';
  }
  G.LogoGeo = { roundPoly: roundPoly, head: head, bbox: bbox, svgPath: svgPath, rot: rot };
})(window);
// Round-head open-end wrench (icon). y-up. Head circle radius R at (0,0).
// Jaw: half-hex nut of half-height h, back vertex at x = jb, tilted by tilt (CCW).
// Handle along -x: width w0 at the neck, w1 at the end, end center at -L.
(function (G) {
  var g = G.LogoGeo;
  function wrenchRound(o) {
    var R = o.R, h = o.h, tilt = o.tilt || 15, jb = o.jb, L = o.L, w0 = o.w0, w1 = o.w1;
    var tr = tilt * Math.PI / 180;
    function J(u, v) { return g.rot([u, v], tilt); }
    // where jaw flats (v = +-h, along u) leave the circle
    function exitU(v) { return Math.sqrt(Math.max(0, R * R - v * v)); }
    var uTop = exitU(h) + 0.0, uBot = exitU(-h);
    var pts = [];
    var a = jb + h * Math.tan(Math.PI / 6);
    // top tip on circle (jaw frame (uTop, h) -> world)
    var tipT = J(uTop, h), tipB = J(uBot, -h);
    var angT = Math.atan2(tipT[1], tipT[0]), angB = Math.atan2(tipB[1], tipB[0]);
    // neck points on circle at y = +-w0 (world, left side)
    var nx = -Math.sqrt(R * R - w0 * w0);
    var angNT = Math.atan2(w0, nx), angNB = Math.atan2(-w0, nx);
    function arc(a0, a1, n) { var out = []; var da = a1 - a0; for (var i = 1; i < n; i++) { var t = a0 + da * i / n; out.push([Math.cos(t) * R, Math.sin(t) * R, 0]); } return out; }
    pts.push([tipT[0], tipT[1], o.tipR || 4]);
    var aNT = angNT; if (aNT < angT) aNT += 2 * Math.PI;
    pts = pts.concat(arc(angT, aNT, 28));
    pts.push([nx, w0, o.neck || 22]);
    pts.push([-L, w1, w1]);
    pts.push([-L, -w1, w1]);
    pts.push([nx, -w0, o.neck || 22]);
    var aNB = angNB < 0 ? angNB + 2 * Math.PI : angNB, aB = angB < 0 ? angB + 2 * Math.PI : angB;
    pts = pts.concat(arc(aNB, aB, 28));
    pts.push([tipB[0], tipB[1], o.tipR || 4]);
    var p;
    p = J(uBot - 2, -h); pts.push([p[0], p[1], 1.5]);
    p = J(a, -h); pts.push([p[0], p[1], o.ir || 3]);
    p = J(jb, 0); pts.push([p[0], p[1], o.vr || 5]);
    p = J(a, h); pts.push([p[0], p[1], o.ir || 3]);
    p = J(uTop - 2, h); pts.push([p[0], p[1], 1.5]);
    return g.roundPoly(pts, 12);
  }
  g.wrenchRound = wrenchRound;
})(window);
// Letter heads with no handle. outer: 'circle' | 'hex' | 'oct'. sx squeezes x.
(function (G) {
  var g = G.LogoGeo;
  g.letterHead = function (o) {
    var R = 50, h = o.h, tilt = o.tilt || 0, jb = o.jb, sx = o.sx || 1;
    function J(u, v) { return g.rot([u, v], tilt); }
    var outer = [], n = o.outer === 'circle' ? 72 : o.outer === 'hex' ? 6 : 8, off = o.outer === 'hex' ? 0 : (o.outer === 'oct' ? Math.PI / 8 : 0);
    for (var i = 0; i < n; i++) { var a = off + i * 2 * Math.PI / n; outer.push([Math.cos(a) * R, Math.sin(a) * R]); }
    // Jaw opening: keep outer vertices outside the slot |v| < h (in jaw frame) or on the left of the cut.
    var a2 = jb + h * Math.tan(Math.PI / 6);
    function inSlot(p) { var q = g.rot(p, -tilt); return Math.abs(q[1]) < h && q[0] > a2; }
    // intersect outer polygon edges with lines v = +-h (jaw frame)
    function hit(v) {
      for (var i = 0; i < outer.length; i++) {
        var A = g.rot(outer[i], -tilt), B = g.rot(outer[(i + 1) % outer.length], -tilt);
        if ((A[1] - v) * (B[1] - v) <= 0 && A[1] !== B[1]) {
          var t = (v - A[1]) / (B[1] - A[1]), x = A[0] + t * (B[0] - A[0]);
          if (x > 0) return { i: i, p: J(x, v) };
        }
      }
    }
    var top = hit(h), bot = hit(-h);
    var pts = [[top.p[0], top.p[1], o.tipR || 3]];
    var rc = o.outer === 'circle' ? 0 : (o.rc || 6);
    for (var k = 1; k <= outer.length; k++) {
      var idx = (top.i + k) % outer.length;
      if (idx === (bot.i + 1) % outer.length) break;
      var p = outer[idx]; if (!inSlot(p)) pts.push([p[0], p[1], rc]);
    }
    pts.push([bot.p[0], bot.p[1], o.tipR || 3]);
    var q;
    q = J(a2, -h); pts.push([q[0], q[1], o.ir || 3]);
    q = J(jb, 0); pts.push([q[0], q[1], o.vr || 4]);
    q = J(a2, h); pts.push([q[0], q[1], o.ir || 3]);
    var poly = g.roundPoly(pts, 12);
    return poly.map(function (p) { return [p[0] * sx, p[1]]; });
  };
})(window);
// letterHead2: more outers and jaw backs.
// o.outer: circle | ellipse | hex | hexp (pointy left/right) | oct | dodec | squircle
// o.back: v | round | flat. o.R: outer radius (50 = cap). o.ry: y radius for ellipse.
// o.stub: {len, w, ang} short handle stub (world degrees, 180 = left).
(function (G) {
  var g = G.LogoGeo;
  function outerPts(o) {
    var R = o.R || 50, pts = [], i, n;
    if (o.outer === 'squircle') { n = 96; var e = o.n || 4;
      for (i = 0; i < n; i++) { var a = i * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a);
        pts.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * R, Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * R]); }
      return pts; }
    var map = { circle: [96, 0], ellipse: [96, 0], hex: [6, 0], hexp: [6, Math.PI / 6], oct: [8, Math.PI / 8], dodec: [12, Math.PI / 12] };
    var m = map[o.outer]; n = m[0];
    for (i = 0; i < n; i++) { var b = m[1] + i * 2 * Math.PI / n; pts.push([Math.cos(b) * R * (o.rx || 1), Math.sin(b) * (o.outer === 'ellipse' ? (o.ry || R) : R)]); }
    return pts;
  }
  g.letterHead2 = function (o) {
    var h = o.h, tilt = o.tilt || 0, jb = o.jb;
    function J(u, v) { return g.rot([u, v], tilt); }
    var outer = outerPts(o);
    var smooth = o.outer === 'circle' || o.outer === 'ellipse' || o.outer === 'squircle';
    var back = o.back || 'v', a2 = back === 'v' ? jb + h * Math.tan(Math.PI / 6) : back === 'round' ? jb + h : jb;
    function inSlot(p) { var q = g.rot(p, -tilt); return Math.abs(q[1]) < h && q[0] > a2 - 1; }
    function hit(v) {
      for (var i = 0; i < outer.length; i++) {
        var A = g.rot(outer[i], -tilt), B = g.rot(outer[(i + 1) % outer.length], -tilt);
        if ((A[1] - v) * (B[1] - v) <= 0 && A[1] !== B[1]) {
          var t = (v - A[1]) / (B[1] - A[1]), x = A[0] + t * (B[0] - A[0]);
          if (x > 0) return { i: i, p: J(x, v) };
        }
      }
    }
    var top = hit(h), bot = hit(-h), rc = smooth ? 0 : (o.rc == null ? 6 : o.rc);
    var pts = [[top.p[0], top.p[1], o.tipR == null ? 3 : o.tipR]];
    var stubDone = false;
    for (var k = 1; k <= outer.length; k++) {
      var idx = (top.i + k) % outer.length;
      if (idx === (bot.i + 1) % outer.length) break;
      var p = outer[idx];
      if (o.stub && !stubDone && Math.atan2(p[1], p[0]) * 180 / Math.PI < 0 && Math.atan2(p[1], p[0]) * 180 / Math.PI > -180 + 0 && p[0] < 0 && (Math.atan2(p[1], p[0]) * 180 / Math.PI) > o.stub.ang - 360 + 0 && false) {}
      if (!inSlot(p)) pts.push([p[0], p[1], rc]);
    }
    pts.push([bot.p[0], bot.p[1], o.tipR == null ? 3 : o.tipR]);
    var q, ir = o.ir || 3;
    if (back === 'v') {
      q = J(a2, -h); pts.push([q[0], q[1], ir]);
      q = J(jb, 0); pts.push([q[0], q[1], o.vr || 4]);
      q = J(a2, h); pts.push([q[0], q[1], ir]);
    } else if (back === 'flat') {
      q = J(jb, -h); pts.push([q[0], q[1], o.vr || 5]);
      q = J(jb, h); pts.push([q[0], q[1], o.vr || 5]);
    } else {
      for (var j = 0; j <= 16; j++) { var an = -Math.PI / 2 - j * Math.PI / 16; q = J(a2 + Math.cos(an) * h, Math.sin(an) * h); pts.push([q[0], q[1], 0]); }
    }
    var poly = g.roundPoly(pts, 12);
    var sx = o.sx || 1;
    return poly.map(function (p) { return [p[0] * sx, p[1]]; });
  };
  // Extra parts drawn next to a head: a nut in the jaw, a handle stub.
  g.nutIn = function (o, gap) {
    var r = (o.h - (gap || 3)) / Math.cos(Math.PI / 6), back = o.back || 'v';
    var cx = (back === 'v' ? o.jb : back === 'round' ? o.jb : o.jb) + r + (gap || 3) + (back === 'flat' ? 0 : 0);
    var pts = [];
    for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; var p = g.rot([cx + Math.cos(a) * r, Math.sin(a) * r], o.tilt || 0); pts.push([p[0], p[1], r * 0.1]); }
    return g.roundPoly(pts, 6).map(function (p) { return [p[0] * (o.sx || 1), p[1]]; });
  };
  g.stub = function (o) {
    var s = o.stub, R = o.R || 50, w = s.w, L = s.len;
    var pts = [[-R * 0.6, w, 0], [-R - L, w, w], [-R - L, -w, w], [-R * 0.6, -w, 0]];
    return g.roundPoly(pts, 10).map(function (p) { var q = g.rot(p, s.ang - 180); return [q[0] * (o.sx || 1), q[1]]; });
  };
})(window);
