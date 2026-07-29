/* ============================================================================
   BOWVISION  —  live bow-hold detection in the browser
   ----------------------------------------------------------------------------
   Runs the Roboflow model client-side. The publishable key is inference-only
   and rate-limited by Roboflow, which is why it is safe in a static site.

   Two input modes, deliberately. Webcam is the demo, but plenty of visitors
   won't grant camera access on a stranger's site -- upload lets them try the
   model anyway, on a still of a bow hold.

   The usual bounding-box bug is sizing the overlay to the element's CSS box
   instead of the source's intrinsic dimensions. Everything here works in
   intrinsic pixels and maps once, at draw time.

   Never looks broken: no key -> the UI renders with a "not connected" note;
   no camera or permission denied -> upload mode, and the webcam button is not
   rendered at all rather than sitting there disabled.
   ========================================================================= */
(function () {
  'use strict';

  var CFG = window.BOWVISION_CONFIG || {};
  var configured = !!(CFG.publishableKey && /^rf_/.test(CFG.publishableKey));

  var el = {};
  ['stage','video','canvas','file','drop','startCam','stopCam','conf','confVal',
   'status','fps','count','note','modes'].forEach(function (k) {
    el[k] = document.getElementById('bv-' + k);
  });
  if (!el.stage) return;

  var ctx = el.canvas.getContext('2d');
  var model = null, loading = null, running = false, raf = 0;
  var engineRef = null, CVImageRef = null;
  var stream = null, lastT = 0, fpsAvg = 0;
  var still = null;                       // an uploaded <img>, when in upload mode

  var hasCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasCam && el.startCam) el.startCam.remove();

  function say(msg, kind) {
    el.status.textContent = msg;
    el.status.dataset.kind = kind || '';
  }

  /* ---- model ----------------------------------------------------------- */
  function loadModel() {
    if (model) return Promise.resolve(model);
    if (loading) return loading;
    if (!configured) return Promise.reject(new Error('not_configured'));

    say('Loading model…', 'busy');
    loading = import('./vendor/inferencejs.esm.js')
      .then(function (mod) {
        var Engine = mod.InferenceEngine || (mod.default && mod.default.InferenceEngine);
        if (!Engine) throw new Error('inferencejs missing InferenceEngine');
        engineRef = new Engine();
        // CVImage is how inferencejs wraps a <video>/<img> source; keep a
        // reference so detect() does not have to re-import.
        CVImageRef = mod.CVImage || (mod.default && mod.default.CVImage) || null;
        return engineRef.startWorker(CFG.model, CFG.version, CFG.publishableKey);
      })
      .then(function (id) {
        model = id;
        say('Model ready', 'ok');
        return id;
      })
      .catch(function (err) {
        loading = null;
        say('Could not load the model. ' + (configured ? 'Check the key and version in bowvision-config.js.' : ''), 'err');
        throw err;
      });
    return loading;
  }

  /* ---- drawing --------------------------------------------------------- */
  var PALETTE = ['#6fd3eb', '#efb45e', '#a37bff', '#7ff5e6', '#ff8f6d'];
  var classColors = {};
  function colorFor(cls) {
    if (!classColors[cls]) classColors[cls] = PALETTE[Object.keys(classColors).length % PALETTE.length];
    return classColors[cls];
  }

  /* Verified against the worker's own buildDetectedObjects(), which emits
       { class, confidence, bbox: {x, y, width, height}, color }
     with x/y at the CENTRE of the box, not its corner. The flat-shape and
     corner-shape branches below are belt-and-braces for a future bundle. */
  function normalise(p) {
    if (!p) return null;
    var b = p.bbox || p;
    var w = +(b.width  != null ? b.width  : b.w);
    var h = +(b.height != null ? b.height : b.h);
    var x = +(b.x != null ? b.x : b.left);
    var y = +(b.y != null ? b.y : b.top);
    if (!isFinite(w) || !isFinite(h) || !isFinite(x) || !isFinite(y)) return null;
    // Heuristic for centre-vs-corner: a corner box can never have its centre
    // outside the frame, but a centre box read as a corner routinely would.
    if (b.left == null && b.top == null) { x -= w / 2; y -= h / 2; }
    var cls = p.class || p.className || p.label || 'object';
    var conf = +(p.confidence != null ? p.confidence : (p.score != null ? p.score : 0));
    // The model ships a colour per class; using it keeps the overlay consistent
    // with how the same classes look in Roboflow itself.
    var col = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : colorFor(String(cls));
    return { x: x, y: y, w: w, h: h, cls: String(cls), conf: conf, col: col };
  }

  /* CVImage's constructor only branches on tf.Tensor / ImageBitmap /
     HTMLImageElement / HTMLVideoElement -- there is NO canvas branch, so
     `new CVImage(canvas)` silently stores nothing, bitmap() returns undefined,
     and infer() then calls postMessage with [undefined] as its transfer list.
     Hand it the <video> element itself. */
  function frameReady() {
    var w = el.video.videoWidth, h = el.video.videoHeight;
    return (w && h) ? { w: w, h: h } : null;
  }

  /* A short history of recent boxes, each fading out. Detection is jittery
     frame to frame, so the trail both looks better and makes an intermittent
     detection legible instead of a flicker. */
  var trail = [];
  var TRAIL_MS = 900;   // long enough for a full bow stroke to show as a path

  function draw(preds, w, h, paint) {
    if (!w || !h) return;
    if (el.canvas.width !== w || el.canvas.height !== h) {
      el.canvas.width = w; el.canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (paint) ctx.drawImage(paint, 0, 0, w, h);   // upload mode paints the still

    // The preview is mirrored so it reads like a mirror; the overlay is not, so
    // the geometry is flipped here instead. Done once at intake, which keeps
    // the trail consistent with the live boxes.
    var mirror = (el.stage.dataset.mode === 'cam');

    var now = performance.now();
    var live = [];
    for (var i = 0; i < preds.length; i++) {
      var d = normalise(preds[i]);
      if (!d) continue;
      if (mirror) d.x = w - (d.x + d.w);
      live.push(d);
      trail.push({ d: d, t: now });
    }
    // drop expired
    while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
    if (trail.length > 240) trail.splice(0, trail.length - 240);

    var scale = Math.max(1, w / 640);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.font = (13 * scale) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';

    // --- the fading trail -------------------------------------------------
    // Two parts: ghosts of the recent boxes, and a line through their centres.
    // The line is the point of it -- a bow sweeps, so its path is the stroke,
    // and a still box tells you far less than the track it leaves behind.
    ctx.globalCompositeOperation = 'lighter';

    for (var k = 0; k < trail.length; k++) {
      var age = (now - trail[k].t) / TRAIL_MS;
      if (age >= 1) continue;
      var a = (1 - age) * (1 - age);          // ease out
      var t = trail[k].d;
      ctx.strokeStyle = hexToRgba(t.col, 0.16 * a);
      ctx.lineWidth = (1 + 2 * a) * scale;
      ctx.strokeRect(t.x, t.y, t.w, t.h);
    }

    // One path per class, so two tracked objects never join into one streak.
    var byClass = {};
    for (var m = 0; m < trail.length; m++) {
      (byClass[trail[m].d.cls] || (byClass[trail[m].d.cls] = [])).push(trail[m]);
    }
    var jump = Math.hypot(w, h) * 0.25;        // a bigger hop is a different object
    for (var cls in byClass) {
      var pts = byClass[cls];
      for (var q = 1; q < pts.length; q++) {
        var A = pts[q - 1], B = pts[q];
        var ax = A.d.x + A.d.w / 2, ay = A.d.y + A.d.h / 2;
        var bx = B.d.x + B.d.w / 2, by = B.d.y + B.d.h / 2;
        if (Math.hypot(bx - ax, by - ay) > jump) continue;
        var ag = (now - B.t) / TRAIL_MS;
        if (ag >= 1) continue;
        var al = (1 - ag) * (1 - ag);
        ctx.strokeStyle = hexToRgba(B.d.col, 0.85 * al);
        ctx.lineWidth = (0.6 + 3.4 * al) * scale;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // --- live boxes -------------------------------------------------------
    for (var j = 0; j < live.length; j++) {
      var p = live[j], c = p.col;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(p.x, p.y, p.w, p.h);

      // corner ticks, matching the drafting language of the rest of the site
      var t2 = Math.min(p.w, p.h) * 0.18;
      ctx.lineWidth = 3.5 * scale;
      var corners = [[p.x,p.y,1,1],[p.x+p.w,p.y,-1,1],[p.x,p.y+p.h,1,-1],[p.x+p.w,p.y+p.h,-1,-1]];
      for (var ci = 0; ci < 4; ci++) {
        var cx = corners[ci][0], cy = corners[ci][1], sx = corners[ci][2], sy = corners[ci][3];
        ctx.beginPath();
        ctx.moveTo(cx + sx * t2, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * t2);
        ctx.stroke();
      }

      // A box on an edge is the common case here -- a bow enters frame side-on --
      // so the label has to be clamped on BOTH axes or the confidence is cut off.
      var label = p.cls + '  ' + Math.round(p.conf * 100) + '%';
      var tw = ctx.measureText(label).width + 10 * scale;
      var th = 20 * scale;
      var lx = p.x, ly = p.y - th;
      if (ly < 0) ly = p.y + 4 * scale;
      if (ly + th > h) ly = h - th;
      if (lx + tw > w) lx = w - tw;
      if (lx < 0) lx = 0;
      ctx.fillStyle = 'rgba(6,8,10,.85)';
      ctx.fillRect(lx, ly, tw, th);
      ctx.fillStyle = c;
      ctx.fillText(label, lx + 5 * scale, ly + 2 * scale);
    }

    el.count.textContent = live.length + (live.length === 1 ? ' detection' : ' detections');
  }

  function hexToRgba(hex, a) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---- inference loop -------------------------------------------------- */
  /* Two things here are load-bearing, both learned the hard way:

     1. `options` must be an ARRAY. The worker does `model.configure(...options)`,
        so a plain object spreads to "Spread syntax requires ...iterable", which
        throws inside the worker's onmessage. It then never posts a reply, and
        the main-thread promise NEVER SETTLES -- no error, no rejection, just a
        permanent hang. That is why the camera ran happily and nothing was ever
        drawn.
     2. The field names are the model's, not the REST API's: scoreThreshold /
        iouThreshold / maxNumBoxes. `confidence` / `overlap` / `maxObjects` are
        silently ignored, so the slider would have done nothing regardless.

     The site's config keeps the friendlier names and they are mapped here. */
  var INFER_TIMEOUT = 8000;
  var inferErrs = 0;

  function detect(src) {
    if (!model || !engineRef) return Promise.resolve([]);
    var img;
    try { img = CVImageRef ? new CVImageRef(src) : src; }
    catch (e) { return Promise.resolve([]); }

    var p = engineRef.infer(model, img, [{
      scoreThreshold: parseFloat(el.conf.value),
      iouThreshold: CFG.overlap,
      maxNumBoxes: CFG.maxDetections
    }]);

    // A hang is a real failure mode of this library, so never await it forever.
    var guard = new Promise(function (res) {
      setTimeout(function () { res('__timeout__'); }, INFER_TIMEOUT);
    });

    return Promise.race([p, guard]).then(function (r) {
      if (r === '__timeout__') { note('timeout'); return []; }
      inferErrs = 0;
      return r || [];
    }, function (err) { note(err); return []; });
  }

  function note(err) {
    if (++inferErrs === 3) {
      say('Inference is failing — see the console for details.', 'err');
      console.warn('[bowvision] infer failed', err);
    }
  }

  function loop(now) {
    if (!running) return;
    var dt = now - lastT; lastT = now;
    if (dt > 0) { fpsAvg = fpsAvg ? fpsAvg * 0.85 + (1000 / dt) * 0.15 : 1000 / dt; }
    el.fps.textContent = fpsAvg.toFixed(0) + ' fps';

    var f = frameReady();
    if (!f) { raf = requestAnimationFrame(loop); return; }     // wait for frames
    var w = f.w, h = f.h;

    detect(el.video).then(function (preds) {
      try { draw(preds || [], w, h, null); }
      catch (err) { if (!loop.warned) { loop.warned = 1; console.warn('[bowvision] draw failed', err); } }
      // re-queue unconditionally: one bad frame must never stop detection
      if (running) raf = requestAnimationFrame(loop);
    }, function () { if (running) raf = requestAnimationFrame(loop); });
  }

  /* ---- webcam ---------------------------------------------------------- */
  function waitForFrame(v) {
    if (v.videoWidth && v.videoHeight) return Promise.resolve();
    return new Promise(function (res) {
      var tries = 0;
      (function poll() {
        if ((v.videoWidth && v.videoHeight) || ++tries > 120) return res();
        requestAnimationFrame(poll);
      })();
    });
  }

  function startCam() {
    if (!hasCam) return;
    say('Requesting camera…', 'busy');
    loadModel().then(function () {
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } }, audio: false
      });
    }).then(function (st) {
      stream = st;
      el.video.srcObject = st;
      el.video.hidden = false;
      if (still) { still = null; }
      return el.video.play();
    }).then(function () {
      // play() can resolve before videoWidth is populated. Starting the loop
      // then means every early frame is skipped and, on some browsers, the
      // first inference is handed a 0x0 source.
      return waitForFrame(el.video);
    }).then(function () {
      el.stage.dataset.mode = 'cam';
      running = true; lastT = performance.now();
      say('Detecting', 'ok');
      raf = requestAnimationFrame(loop);
      el.startCam.hidden = true; el.stopCam.hidden = false;
    }).catch(function (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        say('Camera blocked for this site. You can still upload an image.', 'err');
      } else if (err && err.message === 'not_configured') {
        say('Not connected yet — see the note below.', '');
      } else {
        say('Could not start the camera. Try uploading an image instead.', 'err');
      }
      el.file.focus();
    });
  }

  function stopCam() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    el.video.srcObject = null; el.video.hidden = true;
    el.stage.dataset.mode = 'idle';
    el.startCam.hidden = false; el.stopCam.hidden = true;
    ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    el.count.textContent = ''; el.fps.textContent = '';
    say('Stopped', '');
  }

  /* ---- upload ---------------------------------------------------------- */
  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) { say('That file is not an image.', 'err'); return; }
    stopCam();
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      still = img;
      el.stage.dataset.mode = 'still';
      loadModel().then(function () {
        say('Detecting', 'busy');
        return detect(img);
      }).then(function (preds) {
        draw(preds || [], img.naturalWidth, img.naturalHeight, img);
        say((preds && preds.length) ? 'Done' : 'No bow hold found — try another shot.',
            (preds && preds.length) ? 'ok' : '');
        URL.revokeObjectURL(url);
      }).catch(function () {
        draw([], img.naturalWidth, img.naturalHeight, img);   // still show the picture
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = function () { say('Could not read that image.', 'err'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  el.file.addEventListener('change', function (e) { handleFile(e.target.files && e.target.files[0]); });
  ['dragenter','dragover'].forEach(function (t) {
    el.drop.addEventListener(t, function (e) { e.preventDefault(); el.drop.dataset.over = '1'; });
  });
  ['dragleave','drop'].forEach(function (t) {
    el.drop.addEventListener(t, function (e) { e.preventDefault(); delete el.drop.dataset.over; });
  });
  el.drop.addEventListener('drop', function (e) {
    handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  if (el.startCam) el.startCam.addEventListener('click', startCam);
  el.stopCam.addEventListener('click', stopCam);

  el.conf.addEventListener('input', function () {
    el.confVal.textContent = Math.round(parseFloat(el.conf.value) * 100) + '%';
    if (still) {                            // re-run on the still immediately
      detect(still).then(function (p) { draw(still, p || []); });
    }
  });

  window.addEventListener('pagehide', stopCam);

  /* ---- boot ------------------------------------------------------------ */
  el.conf.value = CFG.confidence || 0.4;
  el.confVal.textContent = Math.round((CFG.confidence || 0.4) * 100) + '%';

  if (!configured) {
    el.note.hidden = false;
    say('Not connected yet', '');
    if (el.startCam) el.startCam.disabled = true;
    el.file.disabled = true;
  } else {
    say('Ready — start the camera or drop in an image', '');
  }
})();
