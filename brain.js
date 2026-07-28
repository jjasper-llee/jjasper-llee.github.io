/* ============================================================================
   ABYSSAL CORTEX  —  the brain behind jjasper-llee.github.io
   ----------------------------------------------------------------------------
   A superior (top-down) view of a brain: two mirrored hemispheres separated by
   the longitudinal fissure, a cerebellum and stem at the posterior, and a
   neural network suspended inside, drifting like it is underwater.

   Geometry note
     Each hemisphere is a RADIAL function of t, where t = 0 is anterior (front,
     toward the top of the screen) and t = PI is posterior. The cortical folds
     are literally summed harmonics on that radius, which is what makes the
     outline read as a brain rather than a bean.

     Two things fall out of that choice for free:
       1. Left/right is correct by construction. Each half is generated on its
          own side of the midline, so a hemisphere highlight cannot leak across.
          (The previous version picked a hemisphere label by coin flip and then
          computed x from an unrelated angle, so ~37% of "left" nodes were
          physically on the right. That was the reported bug.)
       2. Containment is O(1): a point is inside iff hypot(x,y) < radius(t).
          No polygon ray-casting, no rejection-retry loop.

   The space/underwater backdrop lives in CSS (starfield, nebula, godrays,
   marine snow). This canvas is transparent and paints only the brain, its
   glow, and bubbles -- the previous version filled the whole viewport with an
   opaque gradient every frame, which would hide all of it.

   Public API (13 project pages depend on it):
     window.setBrainHighlight('left' | 'right' | 'none')
     window.pendingBrainHighlight   -- handshake for pages that load first
   ========================================================================= */

(function () {
  'use strict';

  var canvas = document.getElementById('brain-canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) { installStub(); return; }

  /* ----------------------------------------------------------------------
     1  PALETTE + TUNING
     -------------------------------------------------------------------- */
  var PAL = {
    outline:  [143, 240, 255],
    node:     [127, 242, 230],
    link:     [ 68, 196, 206],
    bubble:   [190, 245, 255],
    LEFT:     [ 63, 216, 245],   // analytical cyan   (matches --hemi-left)
    RIGHT:    [194, 115, 255]    // creative violet   (matches --hemi-right)
  };

  var TUNE = {
    K: 2.8,             // spring back to home position
    DRAG: 2.0,          // zeta ~0.60 -> underdamped, so nodes slosh and settle
    BUOY: 0.06,
    SWAY: 0.075,        // coherent flow field: neighbours move together
    MAX_DRIFT: 0.055,   // < sampling margin, so containment is guaranteed
    PUSH: 2.2,
    PUSH_R: 0.55,
    FIXED_DT: 1 / 60,
    MAX_SUBSTEPS: 3
  };

  var TIMELINE = {
    outlineStart: 180, outlineDur: 1320,
    cerebStart:  1180, cerebDur:   520,
    detailStart: 1500, detailDur:  600,
    nodeStart:   1700, nodeDur:    800,
    linkStart:   1950, linkDur:    650,
    total:       2600
  };

  var prefersReduced = false;
  try {
    prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var isTouch = false;
  try { isTouch = window.matchMedia('(hover: none)').matches; } catch (e) {}

  function pickTier() {
    var w = document.documentElement.clientWidth;
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 8;
    if (w >= 1100 && cores >= 8 && mem > 4) {
      return { nodes: 300, links: 3, bubbles: 24, dpr: 2.0 };
    }
    if (w >= 700) {
      return { nodes: 210, links: 3, bubbles: 16, dpr: 1.75 };
    }
    return { nodes: 120, links: 2, bubbles: 9, dpr: 1.5 };
  }
  var TIER = pickTier();

  /* ----------------------------------------------------------------------
     2  GEOMETRY
     -------------------------------------------------------------------- */
  // Width:length lands at ~0.83, which is what a real brain measures from
  // above (roughly 14cm x 17cm). Getting this wrong is what makes a top-down
  // brain read as a leaf.
  var HALF_W = 0.80, HALF_L = 0.95;

  // Cortical margin. The three sine terms ARE the gyri -- this is the single
  // thing that makes the silhouette legible as a brain rather than an egg.
  function radius(t) {
    // +cos, so the frontal pole (t=0) is the SHORTER end and the occipital
    // is the longer one, as in life.
    var taper = 1 + 0.10 * Math.cos(t);
    var sx = HALF_L * Math.sin(t);
    var sy = HALF_W * Math.cos(t) * taper;
    var base = (HALF_W * HALF_L) / Math.sqrt(sx * sx + sy * sy);
    // Irrational-ish frequencies, so the bumps never line up into the obvious
    // rotational symmetry that makes a scalloped outline read as a cog or a
    // flower. Kept low-amplitude: the outline should undulate, and the real
    // fold detail belongs inside (see drawFissureAndSulci).
    var gyri = 0.030 * Math.sin(t * 8.3)
             + 0.018 * Math.sin(t * 13.7 + 1.1)
             + 0.010 * Math.sin(t * 21.3 + 2.3);
    // Pinch the radius near the midline at both poles. This is what separates
    // the two frontal lobes at the top and the occipital lobes at the bottom,
    // instead of the halves meeting in one continuous dome.
    var front = t / 0.42, back = (Math.PI - t) / 0.42;
    var notch = 0.11 * Math.exp(-front * front) + 0.08 * Math.exp(-back * back);
    return base * (1 + gyri - notch);
  }

  var CONTOUR_STEPS = 220;
  var contour = [];      // [{x,y,t}] for the RIGHT half, t: 0..PI
  var contourLen = null; // Float32Array of cumulative arc length

  function buildContour() {
    contour.length = 0;
    for (var i = 0; i <= CONTOUR_STEPS; i++) {
      var t = Math.PI * i / CONTOUR_STEPS;
      var r = radius(t);
      contour.push({ x: r * Math.sin(t), y: r * Math.cos(t), t: t });
    }
    contourLen = new Float32Array(contour.length);
    var acc = 0;
    for (var j = 1; j < contour.length; j++) {
      var dx = contour[j].x - contour[j - 1].x;
      var dy = contour[j].y - contour[j - 1].y;
      acc += Math.sqrt(dx * dx + dy * dy);
      contourLen[j] = acc;
    }
  }

  // Cerebellum: a squat lobe tucked under the posterior, drawn as its own
  // wrinkled arc so it reads as folia rather than a plain ellipse.
  var CEREB_CY = -0.82, CEREB_RX = 0.34, CEREB_RY = 0.13;

  function cerebPoint(a) {
    var wob = 1 + 0.045 * Math.sin(a * 11);
    return { x: Math.cos(a) * CEREB_RX * wob, y: CEREB_CY + Math.sin(a) * CEREB_RY * wob };
  }

  function insideCereb(x, y) {
    var dx = x / CEREB_RX, dy = (y - CEREB_CY) / CEREB_RY;
    return dx * dx + dy * dy < 1;
  }

  // O(1) containment: convert to polar about the brain origin and compare
  // against the cortical margin at that angle.
  function insideBrain(x, y, margin) {
    var ax = Math.abs(x);
    var r = Math.sqrt(ax * ax + y * y);
    if (r < 1e-6) return true;
    var t = Math.atan2(ax, y);              // 0 at anterior, PI at posterior
    if (r < radius(t) - margin) return true;
    return insideCereb(x, y) && r < 1.25;
  }

  /* ----------------------------------------------------------------------
     3  LAYOUT
     -------------------------------------------------------------------- */
  var width = 0, height = 0, cx = 0, cy = 0, scale = 0, dpr = 1;

  function measure() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    var hero = document.querySelector('.brain-hero-spacer');
    // offsetTop/offsetHeight are document-space and scroll-independent;
    // getBoundingClientRect would drift the brain on every scroll-resize.
    var heroTop = hero ? hero.offsetTop : 0;
    var heroH = hero ? hero.offsetHeight : height * 0.8;
    cx = width * 0.5;
    cy = Math.min(height * 0.5, heroTop + heroH * 0.52);
    scale = Math.max(78, Math.min(Math.min(heroH * 0.40, width * 0.30), 300));
  }

  function resizeBacking() {
    dpr = Math.min(window.devicePixelRatio || 1, TIER.dpr);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sx(x) { return cx + x * scale; }
  function sy(y) { return cy - y * scale; }

  /* ----------------------------------------------------------------------
     4  NODES + CONNECTIONS
     -------------------------------------------------------------------- */
  var nodes = [], links = [];
  var FISSURE_HALF = 0.035;   // keeps the midline seam clear and makes the
                              // left/right sign test unambiguous
  var SAMPLE_MARGIN = 0.075;  // > TUNE.MAX_DRIFT

  function buildNodes() {
    nodes.length = 0;
    var target = TIER.nodes, guard = target * 60, spent = 0;
    while (nodes.length < target && spent < guard) {
      spent++;
      var x = -1.05 + Math.random() * 2.10;
      var y = -1.20 + Math.random() * 2.30;
      if (Math.abs(x) < FISSURE_HALF) continue;
      if (!insideBrain(x, y, SAMPLE_MARGIN)) continue;
      // bias toward the cortical ribbon -- grey matter lives on the surface,
      // and a uniform fill reads as a pincushion
      var ax = Math.abs(x), rr = Math.sqrt(ax * ax + y * y);
      var frac = rr / Math.max(0.08, radius(Math.atan2(ax, y)));
      if (Math.random() > 0.30 + 0.70 * Math.min(1, frac)) continue;

      nodes.push({
        hx: x, hy: y, x: x, y: y, vx: 0, vy: 0,
        side: x < 0 ? 'left' : 'right',       // position decides the label
        seed: Math.random() * Math.PI * 2,
        buoy: 0.6 + Math.random() * 0.8,
        r: 1.5 + Math.random() * 1.5,
        hl: 0
      });
    }
  }

  function buildLinks() {
    links.length = 0;
    var maxD = 0.24, maxD2 = maxD * maxD;
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i], cand = [];
      for (var j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        var b = nodes[j];
        if (a.hx * b.hx < 0) continue;        // never cross the midline...
        var dx = a.hx - b.hx, dy = a.hy - b.hy, d2 = dx * dx + dy * dy;
        if (d2 < maxD2) cand.push({ j: j, d2: d2 });
      }
      cand.sort(function (p, q) { return p.d2 - q.d2; });
      for (var k = 0; k < Math.min(TIER.links, cand.length); k++) {
        if (cand[k].j > i) links.push({ a: i, b: cand[k].j, cross: false });
      }
    }
    // ...except for a handful of commissural fibres, which is both
    // anatomically right and a nice echo of the site's "bridging the left and
    // right brains" line.
    var leftMid = [], rightMid = [];
    for (var m = 0; m < nodes.length; m++) {
      var n = nodes[m];
      if (n.hy > -0.25 && n.hy < 0.30 && Math.abs(n.hx) < 0.34) {
        (n.hx < 0 ? leftMid : rightMid).push(m);
      }
    }
    var bridges = Math.min(6, leftMid.length, rightMid.length);
    for (var q = 0; q < bridges; q++) {
      links.push({
        a: leftMid[Math.floor(q * leftMid.length / bridges)],
        b: rightMid[Math.floor(q * rightMid.length / bridges)],
        cross: true
      });
    }
  }

  /* ----------------------------------------------------------------------
     5  BUBBLES
     -------------------------------------------------------------------- */
  var bubbles = [];
  function makeBubble(seed) {
    return {
      x: -0.95 + Math.random() * 1.90,
      y: seed ? -1.2 + Math.random() * 2.6 : -1.35,
      r: 1.5 + Math.random() * 3.0,
      rise: 0.10 + Math.random() * 0.16,
      wob: 0.4 + Math.random() * 0.5,
      seed: Math.random() * 6.28,
      life: 0
    };
  }
  function buildBubbles() {
    bubbles.length = 0;
    for (var i = 0; i < TIER.bubbles; i++) bubbles.push(makeBubble(true));
  }

  /* ----------------------------------------------------------------------
     6  POINTER
     -------------------------------------------------------------------- */
  var pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0 };

  window.addEventListener('pointermove', function (e) {
    // the canvas is position:fixed and inset:0, so clientX/Y map 1:1
    pointer.tx = e.clientX; pointer.ty = e.clientY;
    pointer.strength = Math.min(1, pointer.strength + 0.35);
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    pointer.tx = e.clientX; pointer.ty = e.clientY;
    pointer.strength = 1;
    for (var i = 0; i < 4; i++) {
      var b = makeBubble(false);
      b.x = (e.clientX - cx) / scale + (Math.random() - 0.5) * 0.1;
      b.y = (cy - e.clientY) / scale;
      bubbles.push(b);
      if (bubbles.length > TIER.bubbles + 12) bubbles.shift();
    }
  }, { passive: true });

  window.addEventListener('blur', function () { pointer.strength = 0; });

  /* ----------------------------------------------------------------------
     7  PHYSICS
     -------------------------------------------------------------------- */
  var tSec = 0;

  function stepNodes(dt) {
    var pux = (pointer.x - cx) / scale;
    var puy = (cy - pointer.y) / scale;
    var damp = Math.exp(-TUNE.DRAG * dt);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      // coherent flow field, so neighbours drift together like water rather
      // than jittering independently like noise
      var ax = Math.sin(tSec * 0.31 + n.hy * 2.1 + n.seed) * TUNE.SWAY;
      var ay = Math.cos(tSec * 0.23 + n.hx * 2.6 + n.seed * 1.7) * TUNE.SWAY * 0.55;

      ax += (n.hx - n.x) * TUNE.K;
      ay += (n.hy - n.y) * TUNE.K;
      ay += TUNE.BUOY * n.buoy;

      if (pointer.strength > 0.01) {
        var dx = n.x - pux, dy = n.y - puy, d2 = dx * dx + dy * dy;
        if (d2 < TUNE.PUSH_R * TUNE.PUSH_R && d2 > 1e-6) {
          var d = Math.sqrt(d2), fo = 1 - d / TUNE.PUSH_R;
          fo = fo * fo * TUNE.PUSH * pointer.strength;
          ax += (dx / d) * fo; ay += (dy / d) * fo;
        }
      }

      n.vx = (n.vx + ax * dt) * damp;
      n.vy = (n.vy + ay * dt) * damp;
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      // hard clamp: every node was sampled at least SAMPLE_MARGIN inside, so
      // bounding the drift guarantees nothing ever escapes the silhouette
      var ox = n.x - n.hx, oy = n.y - n.hy;
      var od = Math.sqrt(ox * ox + oy * oy);
      if (od > TUNE.MAX_DRIFT) {
        var s = TUNE.MAX_DRIFT / od;
        n.x = n.hx + ox * s; n.y = n.hy + oy * s;
      }

      var target = (highlightMode !== 'none' && n.side === highlightMode) ? 1 : 0;
      n.hl += (target - n.hl) * Math.min(1, dt * 4);
    }
  }

  function stepBubbles(dt) {
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y += b.rise * dt;
      b.life += dt;
      b.x += Math.sin(tSec * b.wob + b.seed) * 0.02 * dt;
      if (b.y > 1.30) { bubbles[i] = makeBubble(false); }
    }
  }

  /* ----------------------------------------------------------------------
     8  DRAWING
     -------------------------------------------------------------------- */
  var highlightMode = 'none';
  var lineW = {};

  function computeWidths() {
    lineW.outline = Math.max(1.6, scale * 0.012);
    lineW.glow = lineW.outline * 3.0;
    lineW.detail = lineW.outline * 0.5;
    lineW.link = Math.max(0.7, scale * 0.005);   // was hardcoded 0.1 -> invisible
    lineW.accent = lineW.link * 1.7;
  }

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function hemiColor(side) { return side === 'left' ? PAL.LEFT : PAL.RIGHT; }

  // Stroke the cortical margin of one hemisphere from arc length 0..upTo.
  function strokeContour(dir, upTo) {
    var total = contourLen[contourLen.length - 1];
    var limit = upTo === undefined ? total : Math.min(upTo, total);
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < contour.length; i++) {
      if (contourLen[i] > limit) {
        // interpolate the final partial segment so the tip is smooth
        var prev = contour[i - 1];
        var seg = contourLen[i] - contourLen[i - 1];
        var f = seg > 0 ? (limit - contourLen[i - 1]) / seg : 0;
        var px = prev.x + (contour[i].x - prev.x) * f;
        var py = prev.y + (contour[i].y - prev.y) * f;
        ctx.lineTo(sx(px * dir), sy(py));
        break;
      }
      var p = contour[i];
      if (!started) { ctx.moveTo(sx(p.x * dir), sy(p.y)); started = true; }
      else ctx.lineTo(sx(p.x * dir), sy(p.y));
    }
    ctx.stroke();
  }

  function contourTip(dir, upTo) {
    var total = contourLen[contourLen.length - 1];
    var limit = Math.min(upTo, total);
    for (var i = 1; i < contour.length; i++) {
      if (contourLen[i] >= limit) {
        var prev = contour[i - 1];
        var seg = contourLen[i] - contourLen[i - 1];
        var f = seg > 0 ? (limit - contourLen[i - 1]) / seg : 0;
        return { x: sx((prev.x + (contour[i].x - prev.x) * f) * dir),
                 y: sy(prev.y + (contour[i].y - prev.y) * f) };
      }
    }
    return null;
  }

  function drawOutline(progress) {
    var total = contourLen[contourLen.length - 1];
    var upTo = total * progress;
    computeWidths();

    for (var s = 0; s < 2; s++) {
      var dir = s === 0 ? -1 : 1;
      var side = dir < 0 ? 'left' : 'right';
      var lit = highlightMode === side;
      var dim = highlightMode !== 'none' && !lit;
      var col = highlightMode === 'none' ? PAL.outline : hemiColor(side);

      // wide dim pass + narrow bright pass gives the glow ~40x cheaper than
      // shadowBlur, which used to run on every node every frame
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(col, dim ? 0.05 : 0.13);
      ctx.lineWidth = lineW.glow;
      ctx.lineJoin = ctx.lineCap = 'round';
      strokeContour(dir, upTo);

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(col, dim ? 0.45 : 0.95);
      ctx.lineWidth = lineW.outline;
      strokeContour(dir, upTo);
    }

    // comet head while the outline is still being traced
    if (progress < 1) {
      for (var d = -1; d <= 1; d += 2) {
        var tip = contourTip(d, upTo);
        if (!tip) continue;
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, lineW.outline * 5);
        g.addColorStop(0, rgba(PAL.outline, 0.95));
        g.addColorStop(1, rgba(PAL.outline, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, lineW.outline * 5, 0, 6.2832);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawCerebellum(progress) {
    if (progress <= 0) return;
    ctx.save();
    ctx.globalAlpha = progress;
    ctx.strokeStyle = rgba(PAL.outline, 0.72);
    ctx.lineWidth = lineW.outline * 0.8;
    ctx.beginPath();
    for (var i = 0; i <= 80; i++) {
      var a = Math.PI * i / 80;               // lower half only
      var p = cerebPoint(Math.PI + a);
      i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y));
    }
    ctx.stroke();

    // folia
    ctx.strokeStyle = rgba(PAL.outline, 0.26);
    ctx.lineWidth = lineW.detail;
    ctx.beginPath();
    for (var f = 1; f <= 3; f++) {
      var sc = 1 - f * 0.22;
      for (var k = 0; k <= 40; k++) {
        var aa = Math.PI + Math.PI * k / 40;
        var pp = cerebPoint(aa);
        var px = pp.x * sc, py = CEREB_CY + (pp.y - CEREB_CY) * sc;
        k ? ctx.lineTo(sx(px), sy(py)) : ctx.moveTo(sx(px), sy(py));
      }
    }
    ctx.stroke();

    // brain stem -- short and stubby; a long one reads as a plant stalk
    ctx.strokeStyle = rgba(PAL.outline, 0.55);
    ctx.lineWidth = lineW.outline * 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(CEREB_CY - CEREB_RY * 0.4));
    ctx.lineTo(sx(0), sy(CEREB_CY - 0.10));
    ctx.stroke();
    ctx.restore();
  }

  function drawFissureAndSulci(progress) {
    if (progress <= 0) return;
    ctx.save();
    ctx.globalAlpha = progress;

    // Longitudinal fissure, with a slight organic wobble. Endpoints are taken
    // from the contour itself and inset, so the notches can be retuned without
    // the line poking out past the frontal or occipital pole.
    var yFront = contour[0].y * 0.97;
    var yBack = contour[contour.length - 1].y * 0.97;
    ctx.strokeStyle = 'rgba(74,122,208,0.42)';
    ctx.lineWidth = lineW.detail;
    ctx.beginPath();
    for (var i = 0; i <= 60; i++) {
      var t = i / 60;
      var y = yFront + (yBack - yFront) * t;
      var x = Math.sin(t * 7.5) * 0.012;
      i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y));
    }
    ctx.stroke();

    // Sulci: open, meandering arcs at varying depth. These carry the "brain"
    // read now that the outline itself is only gently undulating. Full
    // concentric rings were tried first and collapse into a flower shape in
    // the middle, so each arc spans only part of the sweep and wanders.
    var SULCI = [
      { t0: 0.30, t1: 1.35, inset: 0.86, amp: 0.055, freq: 5.5 },
      { t0: 0.80, t1: 2.05, inset: 0.66, amp: 0.048, freq: 6.5 },
      { t0: 0.25, t1: 1.10, inset: 0.48, amp: 0.040, freq: 7.5 },
      { t0: 1.45, t1: 2.70, inset: 0.80, amp: 0.050, freq: 5.0 },
      { t0: 1.20, t1: 2.35, inset: 0.36, amp: 0.034, freq: 8.5 },
      { t0: 1.95, t1: 2.85, inset: 0.58, amp: 0.042, freq: 6.0 }
    ];

    for (var s = 0; s < 2; s++) {
      var dir = s === 0 ? -1 : 1;
      var side = dir < 0 ? 'left' : 'right';
      var col = highlightMode === 'none' ? PAL.outline : hemiColor(side);
      var dim = highlightMode !== 'none' && highlightMode !== side;
      ctx.strokeStyle = rgba(col, dim ? 0.20 : 0.55);
      ctx.lineWidth = lineW.detail * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var b = 0; b < SULCI.length; b++) {
        var S = SULCI[b];
        for (var k = 0; k <= 40; k++) {
          var f = k / 40;
          var tt = S.t0 + (S.t1 - S.t0) * f;
          // taper the wander at both ends so arcs fade into the tissue
          var env = Math.sin(f * Math.PI);
          var r = radius(tt) * (S.inset + S.amp * Math.sin(f * S.freq + b) * env);
          var px = r * Math.sin(tt) * dir, py = r * Math.cos(tt);
          k ? ctx.lineTo(sx(px), sy(py)) : ctx.moveTo(sx(px), sy(py));
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLinks(alpha) {
    if (alpha <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = lineW.link;

    // batch by tint so we issue a handful of strokes, not one per link
    var buckets = [[], [], []];   // 0 = base, 1 = left accent, 2 = right accent
    for (var i = 0; i < links.length; i++) {
      var L = links[i], a = nodes[L.a], b = nodes[L.b];
      if (!a || !b) continue;
      var acc = 0;
      if (!L.cross && highlightMode !== 'none' && a.side === highlightMode && b.side === highlightMode) {
        acc = highlightMode === 'left' ? 1 : 2;
      }
      buckets[acc].push(a, b);
    }

    for (var t = 0; t < 3; t++) {
      var list = buckets[t];
      if (!list.length) continue;
      var col = t === 0 ? PAL.link : (t === 1 ? PAL.LEFT : PAL.RIGHT);
      ctx.strokeStyle = rgba(col, (t === 0 ? 0.16 : 0.55) * alpha);
      ctx.lineWidth = t === 0 ? lineW.link : lineW.accent;
      ctx.beginPath();
      for (var k = 0; k < list.length; k += 2) {
        ctx.moveTo(sx(list[k].x), sy(list[k].y));
        ctx.lineTo(sx(list[k + 1].x), sy(list[k + 1].y));
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNodes(alpha) {
    if (alpha <= 0) return;
    // three batched passes replace 300 shadowBlur'd fills
    var passes = [
      { mul: 3.0, a: 0.05, add: true },
      { mul: 1.8, a: 0.11, add: true },
      { mul: 1.0, a: 0.95, add: false }
    ];
    for (var p = 0; p < passes.length; p++) {
      var ps = passes[p];
      ctx.globalCompositeOperation = ps.add ? 'lighter' : 'source-over';
      for (var tint = 0; tint < 3; tint++) {
        var col = tint === 0 ? PAL.node : (tint === 1 ? PAL.LEFT : PAL.RIGHT);
        // when one hemisphere is lit, push the other well down so the
        // difference is obvious at a glance
        var fade = (tint === 0 && highlightMode !== 'none') ? 0.34 : 1;
        ctx.fillStyle = rgba(col, ps.a * alpha * fade);
        ctx.beginPath();
        var any = false;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var want = n.hl > 0.5 ? (n.side === 'left' ? 1 : 2) : 0;
          if (want !== tint) continue;
          any = true;
          ctx.moveTo(sx(n.x) + n.r * ps.mul, sy(n.y));
          ctx.arc(sx(n.x), sy(n.y), n.r * ps.mul, 0, 6.2832);
        }
        if (any) ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBubbles(alpha) {
    if (alpha <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      var fade = Math.min(1, b.life * 1.5) * Math.max(0, 1 - Math.max(0, b.y - 0.9) / 0.4);
      if (fade <= 0.01) continue;
      var px = sx(b.x), py = sy(b.y);
      ctx.strokeStyle = rgba(PAL.bubble, 0.30 * fade * alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, b.r, 0, 6.2832);
      ctx.stroke();
      // a single bright arc at the upper-left is what makes it read as a
      // bubble rather than a dot
      ctx.strokeStyle = rgba([255, 255, 255], 0.45 * fade * alpha);
      ctx.beginPath();
      ctx.arc(px, py, b.r * 0.72, 3.6, 4.9);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPointerGlow() {
    if (pointer.strength < 0.05) return;
    var rad = scale * 0.85;
    var g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, rad);
    g.addColorStop(0, 'rgba(150,240,255,' + (0.14 * pointer.strength) + ')');
    g.addColorStop(0.4, 'rgba(90,180,255,0.05)');
    g.addColorStop(1, 'rgba(10,20,50,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, rad, 0, 6.2832);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ----------------------------------------------------------------------
     9  FRAME
     -------------------------------------------------------------------- */
  var elapsed = 0;

  function track(ms, start, dur) {
    return Math.max(0, Math.min(1, (ms - start) / dur));
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function render() {
    ctx.clearRect(0, 0, width, height);   // transparent: CSS paints the space

    var outline = easeInOut(track(elapsed, TIMELINE.outlineStart, TIMELINE.outlineDur));
    var cereb   = easeOut(track(elapsed, TIMELINE.cerebStart,  TIMELINE.cerebDur));
    var detail  = easeOut(track(elapsed, TIMELINE.detailStart, TIMELINE.detailDur));
    var nodeA   = easeOut(track(elapsed, TIMELINE.nodeStart,   TIMELINE.nodeDur));
    var linkA   =         track(elapsed, TIMELINE.linkStart,   TIMELINE.linkDur);

    drawPointerGlow();
    drawBubbles(nodeA);
    if (outline > 0) drawOutline(outline);
    drawCerebellum(cereb);
    drawFissureAndSulci(detail);
    drawLinks(linkA);
    drawNodes(nodeA);
  }

  var running = false, rafId = 0, last = 0, acc = 0;

  function frame(now) {
    if (!running) return;
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;         // a backgrounded tab must not teleport
    elapsed += dt * 1000;
    tSec += dt;

    pointer.x += (pointer.tx - pointer.x) * 0.16;
    pointer.y += (pointer.ty - pointer.y) * 0.16;
    pointer.strength *= Math.exp(-1.1 * dt);
    if (pointer.strength < 0.02) pointer.strength = 0;

    if (isTouch) {   // pointermove barely fires on touch; keep it alive
      pointer.tx = cx + Math.sin(tSec * 0.21) * scale * 0.8;
      pointer.ty = cy + Math.cos(tSec * 0.17) * scale * 0.55;
      pointer.strength = Math.max(pointer.strength, 0.3);
    }

    acc += dt;
    var steps = 0;
    while (acc >= TUNE.FIXED_DT && steps < TUNE.MAX_SUBSTEPS) {
      stepNodes(TUNE.FIXED_DT);
      stepBubbles(TUNE.FIXED_DT);
      acc -= TUNE.FIXED_DT; steps++;
    }
    if (acc > TUNE.FIXED_DT * TUNE.MAX_SUBSTEPS) acc = 0;

    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || prefersReduced) return;
    running = true; last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function renderStatic() {
    elapsed = TIMELINE.total; tSec = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x = n.hx; n.y = n.hy;
      n.hl = (highlightMode !== 'none' && n.side === highlightMode) ? 1 : 0;
    }
    render();
  }

  /* ----------------------------------------------------------------------
     10  LIFECYCLE
     -------------------------------------------------------------------- */
  function rebuild() {
    measure(); resizeBacking(); computeWidths();
  }

  var resizeTimer = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var w = document.documentElement.clientWidth, h = window.innerHeight;
      // Mobile browsers fire resize on every scroll as the URL bar shows and
      // hides. That is a height-only delta; treat it as jitter, not a resize.
      var jitter = Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 90;
      lastW = w; lastH = h;
      rebuild();
      if (!jitter && prefersReduced) renderStatic();
    }, 140);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!prefersReduced) start();
  });

  // The canvas is position:fixed/inset:0, so it is ALWAYS 100% intersecting --
  // observing it would never fire. Observe the hero band instead.
  var hero = document.querySelector('.brain-hero-spacer');
  if (hero && 'IntersectionObserver' in window && !prefersReduced) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }, { rootMargin: '140px' }).observe(hero);
  }

  /* ----------------------------------------------------------------------
     11  PUBLIC API
     -------------------------------------------------------------------- */
  function setBrainHighlight(mode) {
    highlightMode = (mode === 'left' || mode === 'right') ? mode : 'none';
    if (prefersReduced) renderStatic();
  }
  window.setBrainHighlight = setBrainHighlight;

  /* ----------------------------------------------------------------------
     12  BOOT
     -------------------------------------------------------------------- */
  buildContour();
  rebuild();
  buildNodes();
  buildLinks();
  buildBubbles();
  lastW = width; lastH = height;

  if (window.pendingBrainHighlight) {
    setBrainHighlight(window.pendingBrainHighlight);
    try { delete window.pendingBrainHighlight; } catch (e) { window.pendingBrainHighlight = null; }
  }

  if (prefersReduced) renderStatic();
  else start();

  function installStub() {
    if (!window.setBrainHighlight) {
      window.setBrainHighlight = function (mode) { window.pendingBrainHighlight = mode; };
    }
  }
})();

/* ============================================================================
   MOBILE NAV
   Kept here rather than a second file: every page already loads brain.js, so
   this costs no extra request. A checkbox-hack menu cannot express
   aria-expanded, close on Escape, or close on outside-click, so this is ~20
   lines of vanilla JS instead.
   ========================================================================= */
(function () {
  'use strict';
  function init() {
    var btn = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav') || document.querySelector('header nav');
    if (!btn || !nav) return;

    function set(open) {
      btn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      set(btn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') set(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') set(false);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('header')) set(false);
    });
    try {
      window.matchMedia('(min-width: 861px)').addEventListener('change', function (e) {
        if (e.matches) set(false);
      });
    } catch (err) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
