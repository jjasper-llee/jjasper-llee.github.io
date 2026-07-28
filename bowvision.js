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

  /* Source dimensions, NOT the CSS box. This is the whole trick to boxes that
     line up: the canvas backing store matches the source pixel grid, and CSS
     scales both together. */
  function sourceSize(src) {
    if (src === el.video) return { w: el.video.videoWidth, h: el.video.videoHeight };
    return { w: src.naturalWidth, h: src.naturalHeight };
  }

  function draw(src, preds) {
    var s = sourceSize(src);
    if (!s.w || !s.h) return;
    if (el.canvas.width !== s.w || el.canvas.height !== s.h) {
      el.canvas.width = s.w; el.canvas.height = s.h;
    }
    ctx.clearRect(0, 0, s.w, s.h);
    if (src !== el.video) ctx.drawImage(src, 0, 0, s.w, s.h);

    var scale = Math.max(1, s.w / 640);          // keep strokes readable at 4K
    ctx.lineWidth = 2 * scale;
    ctx.font = (13 * scale) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';

    for (var i = 0; i < preds.length; i++) {
      var p = preds[i];
      // inferencejs reports the CENTRE plus width/height
      var x = p.bbox.x - p.bbox.width / 2;
      var y = p.bbox.y - p.bbox.height / 2;
      var c = colorFor(p.class);

      ctx.strokeStyle = c;
      ctx.strokeRect(x, y, p.bbox.width, p.bbox.height);

      var label = p.class + '  ' + Math.round(p.confidence * 100) + '%';
      var tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(6,8,10,.82)';
      ctx.fillRect(x, Math.max(0, y - 20 * scale), tw + 10 * scale, 20 * scale);
      ctx.fillStyle = c;
      ctx.fillText(label, x + 5 * scale, Math.max(0, y - 18 * scale));
    }
    el.count.textContent = preds.length + (preds.length === 1 ? ' detection' : ' detections');
  }

  /* ---- inference loop -------------------------------------------------- */
  function detect(src) {
    if (!model || !engineRef) return Promise.resolve([]);
    var img = CVImageRef ? new CVImageRef(src) : src;
    return engineRef.infer(model, img, {
      confidence: parseFloat(el.conf.value),
      overlap: CFG.overlap,
      maxObjects: CFG.maxDetections
    }).catch(function () { return []; });
  }

  function loop(now) {
    if (!running) return;
    var dt = now - lastT; lastT = now;
    if (dt > 0) { fpsAvg = fpsAvg ? fpsAvg * 0.85 + (1000 / dt) * 0.15 : 1000 / dt; }
    el.fps.textContent = fpsAvg.toFixed(0) + ' fps';

    detect(el.video).then(function (preds) {
      draw(el.video, preds || []);
      if (running) raf = requestAnimationFrame(loop);
    });
  }

  /* ---- webcam ---------------------------------------------------------- */
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
        draw(img, preds || []);
        say('Done', 'ok');
        URL.revokeObjectURL(url);
      }).catch(function () {
        draw(img, []);                     // still show the picture
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
