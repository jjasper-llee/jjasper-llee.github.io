/* ============================================================================
   CASPER  —  the assistant in the corner
   ----------------------------------------------------------------------------
   Two IIFEs in one file, following the house pattern in site.js: every page
   already pays for this request, so splitting it would double that across 17
   pages.

     A  CasperOrb   a sphere of neurons on a canvas, no dependencies
     B  Casper      voice in, voice out, transcript, scripted FAQ

   Guiding rule: Casper must NEVER look broken. Every unsupported path lands on
   something usable. A disabled microphone button is the broken-looking thing,
   so where voice can't work the button simply isn't rendered.

   Security note: model output is written with textContent, never innerHTML.
   A model can emit `<img onerror=...>`; there is no path here that would
   execute it.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   A  THE NEURON ORB
   Four states, distinguished mainly by PULSE DIRECTION -- inward while
   listening reads instantly as taking something in, outward while speaking as
   putting something out, and chaotic as thinking. That reads at 96px without
   a label, which colour alone does not.
   -------------------------------------------------------------------------*/
window.CasperOrb = (function () {
  'use strict';

  var canvas, ctx, w = 0, h = 0, dpr = 1, raf = 0, running = false;
  var nodes = [], edges = [], pulses = [];
  var state = 'idle', level = 0, envelope = 0, yaw = 0, pitch = -0.22, t = 0, last = 0;
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var TIER = (function () {
    var cw = document.documentElement.clientWidth;
    var cores = navigator.hardwareConcurrency || 4;
    if (cw >= 1100 && cores >= 8) return { n: 110, k: 3, dpr: 2.0 };
    if (cw >= 700) return { n: 84, k: 3, dpr: 1.75 };
    return { n: 56, k: 2, dpr: 1.5 };
  })();

  var COLOR = {
    idle:      [111, 211, 235],
    listening: [ 63, 216, 245],
    thinking:  [163, 123, 255],
    speaking:  [165, 229, 245]
  };

  /* Fibonacci sphere. Every 7th node is pulled inward so the orb reads as a
     volume rather than a hollow shell -- that inner cluster is the core the
     speaking pulses radiate from. */
  function build() {
    nodes.length = 0;
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < TIER.n; i++) {
      var y = 1 - (i / (TIER.n - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      var core = (i % 7 === 0);
      var k = core ? 0.42 + Math.random() * 0.22 : 0.92 + Math.random() * 0.10;
      nodes.push({ x: Math.cos(th) * r * k, y: y * k, z: Math.sin(th) * r * k,
                   core: core, seed: Math.random() * 6.2832, r: 0.9 + Math.random() * 0.8 });
    }
    // k-nearest, computed once. A recomputed graph flickers.
    edges.length = 0;
    for (var a = 0; a < nodes.length; a++) {
      var cand = [];
      for (var b = 0; b < nodes.length; b++) {
        if (a === b) continue;
        var dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y, dz = nodes[a].z - nodes[b].z;
        cand.push({ b: b, d: dx * dx + dy * dy + dz * dz });
      }
      cand.sort(function (p, q) { return p.d - q.d; });
      for (var m = 0; m < Math.min(TIER.k, cand.length); m++) {
        if (cand[m].b > a) {
          var A = nodes[a], B = nodes[cand[m].b];
          edges.push({ a: a, b: cand[m].b,
            out: (A.x * A.x + A.y * A.y + A.z * A.z) < (B.x * B.x + B.y * B.y + B.z * B.z) });
        }
      }
    }
  }

  function resize() {
    if (!canvas) return;
    var box = canvas.getBoundingClientRect();
    w = box.width || 96; h = box.height || 96;
    dpr = Math.min(window.devicePixelRatio || 1, TIER.dpr);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnPulse() {
    if (!edges.length) return;
    var e = edges[(Math.random() * edges.length) | 0];
    var dir = state === 'listening' ? -1 : state === 'speaking' ? 1 : (Math.random() < 0.5 ? 1 : -1);
    pulses.push({ e: e, p: 0, dir: dir, life: 1 });
    if (pulses.length > 34) pulses.shift();
  }

  function project(n, cy, sy, cp, sp, R) {
    var x1 = n.x * cy - n.z * sy;
    var z1 = n.x * sy + n.z * cy;
    var y1 = n.y * cp - z1 * sp;
    var z2 = n.y * sp + z1 * cp;
    var s = 2.6 / (2.6 + z2);
    return { x: w / 2 + x1 * R * s, y: h / 2 - y1 * R * s, s: s };
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    var col = COLOR[state] || COLOR.idle;

    var breathe = state === 'thinking' ? -0.08
                : state === 'listening' ? level * 0.25
                : state === 'speaking' ? envelope * 0.18
                : Math.sin(t * 1.6) * 0.03;
    var R = (Math.min(w, h) / 2 - 6) * (1 + breathe);

    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);

    var pts = [];
    for (var i = 0; i < nodes.length; i++) pts.push(project(nodes[i], cy, sy, cp, sp, R));

    // edges, one batched stroke
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.16)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (var e = 0; e < edges.length; e++) {
      var A = pts[edges[e].a], B = pts[edges[e].b];
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();

    // travelling pulses -- the state cue that carries the most meaning
    for (var q = 0; q < pulses.length; q++) {
      var pu = pulses[q];
      var Pa = pts[pu.e.a], Pb = pts[pu.e.b];
      var from = (pu.dir > 0) === pu.e.out ? Pa : Pb;
      var to   = from === Pa ? Pb : Pa;
      var px = from.x + (to.x - from.x) * pu.p;
      var py = from.y + (to.y - from.y) * pu.p;
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.85 * pu.life) + ')';
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, 6.2832); ctx.fill();
    }

    // nodes: two batched additive passes + one solid, instead of shadowBlur
    var passes = [[2.6, 0.06], [1.7, 0.12]];
    for (var pz = 0; pz < passes.length; pz++) {
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + passes[pz][1] + ')';
      ctx.beginPath();
      for (var k = 0; k < pts.length; k++) {
        var rr = nodes[k].r * pts[k].s * passes[pz][0];
        ctx.moveTo(pts[k].x + rr, pts[k].y);
        ctx.arc(pts[k].x, pts[k].y, rr, 0, 6.2832);
      }
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    for (var m2 = 0; m2 < pts.length; m2++) {
      var flick = state === 'thinking' ? (0.6 + 0.4 * Math.sin(t * 22 + nodes[m2].seed * 9)) : 1;
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.85 * flick) + ')';
      var r3 = nodes[m2].r * pts[m2].s;
      ctx.beginPath(); ctx.arc(pts[m2].x, pts[m2].y, r3, 0, 6.2832); ctx.fill();
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    t += dt;

    var spin = state === 'thinking' ? 0.55 : state === 'listening' ? 0.18 : state === 'speaking' ? 0.22 : 0.12;
    yaw += spin * dt;
    envelope *= Math.exp(-4.0 * dt);
    level += (0 - level) * dt * 2.2;

    var rate = state === 'thinking' ? 14 : state === 'idle' ? 0.5 : 3;
    if (Math.random() < rate * dt) spawnPulse();
    for (var i = pulses.length - 1; i >= 0; i--) {
      pulses[i].p += dt * 1.6;
      pulses[i].life = 1 - pulses[i].p;
      if (pulses[i].p >= 1) pulses.splice(i, 1);
    }

    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  return {
    mount: function (el) {
      canvas = el; ctx = canvas.getContext('2d');
      if (!ctx) return false;
      build(); resize();
      window.addEventListener('resize', resize, { passive: true });
      if (reduced) draw(); else start();
      return true;
    },
    setState: function (s) {
      state = s;
      if (reduced) { draw(); return; }
      if (!running) start();
    },
    setLevel: function (v) { level = Math.max(level, Math.min(1, v)); },
    kick: function () { envelope = 1; if (state === 'speaking') spawnPulse(); }
  };
})();

/* ---------------------------------------------------------------------------
   B  CASPER
   -------------------------------------------------------------------------*/
(function () {
  'use strict';

  var CFG = window.CASPER_CONFIG || {};
  var CAP = {
    rec:  !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    tts:  !!(window.speechSynthesis && window.SpeechSynthesisUtterance),
    worker: !!(CFG.workerUrl && /^https:\/\//.test(CFG.workerUrl))
  };
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var root, panel, log, sayNode, input, micBtn, orbBtn, chips;
  var state = 'idle', open = false, history = [], scriptedOnly = !CAP.worker;
  var rec = null, recActive = false;

  /* ---- build the DOM in JS: with no JS there is no dead button --------- */
  function build() {
    root = document.createElement('div');
    root.className = 'casper';
    root.innerHTML =
      '<div class="casper__panel" id="casper-panel" role="dialog" aria-label="Casper" hidden>' +
        '<div class="casper__head">' +
          '<span class="casper__title">Casper</span>' +
          '<span class="casper__state" id="casper-state">Ready</span>' +
        '</div>' +
        '<div class="casper__log" id="casper-log" role="log" aria-live="off"></div>' +
        '<p class="sr-only" id="casper-say" aria-live="polite" aria-atomic="true"></p>' +
        '<div class="casper__chips" id="casper-chips"></div>' +
        '<form class="casper__form" id="casper-form">' +
          '<input id="casper-input" type="text" autocomplete="off" ' +
                 'placeholder="Ask about Jasper…" aria-label="Ask Casper a question">' +
          '<button type="submit" aria-label="Send">→</button>' +
        '</form>' +
        '<div class="casper__foot">' +
          (CAP.rec ? '<button type="button" class="casper__mic" id="casper-mic" aria-pressed="false">Speak</button>' : '') +
          '<button type="button" class="casper__clear" id="casper-clear">Clear</button>' +
        '</div>' +
        '<p class="casper__note">Casper is a small model and can be wrong — check the pages.</p>' +
      '</div>' +
      '<button class="casper__orb" id="casper-orb" aria-label="Ask Casper" ' +
              'aria-expanded="false" aria-controls="casper-panel">' +
        '<canvas class="casper__canvas" aria-hidden="true"></canvas>' +
      '</button>';
    document.body.appendChild(root);
    document.documentElement.classList.add('has-orb');

    panel   = root.querySelector('.casper__panel');
    log     = root.querySelector('#casper-log');
    sayNode = root.querySelector('#casper-say');
    input   = root.querySelector('#casper-input');
    micBtn  = root.querySelector('#casper-mic');
    orbBtn  = root.querySelector('#casper-orb');
    chips   = root.querySelector('#casper-chips');

    CasperOrb.mount(root.querySelector('.casper__canvas'));
    renderChips();

    orbBtn.addEventListener('click', function () {
      if (state === 'speaking' || state === 'thinking') { bargeIn(); return; }
      toggle();
    });
    root.querySelector('#casper-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      input.value = '';
      ask(v);
    });
    root.querySelector('#casper-clear').addEventListener('click', function () {
      history.length = 0; log.textContent = ''; renderChips(); setState('idle');
    });
    if (micBtn) micBtn.addEventListener('click', toggleMic);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { if (state !== 'idle') bargeIn(); else toggle(false); }
    });
  }

  function renderChips() {
    chips.innerHTML = '';
    var list = (CFG.faq || []).slice(0, 4);
    for (var i = 0; i < list.length; i++) {
      (function (item) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'casper__chip'; b.textContent = item.label;
        b.addEventListener('click', function () { ask(item.label); });
        chips.appendChild(b);
      })(list[i]);
    }
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    panel.hidden = !open;
    orbBtn.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    if (open) {
      if (!log.textContent) {
        say("Hi — I'm Casper. Ask me about Jasper's research, his builds, or his cello playing.", false);
      }
      (CAP.rec ? micBtn : input).focus();
    }
  }

  function setState(s) {
    state = s;
    CasperOrb.setState(s);
    root.dataset.state = s;
    var label = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[s];
    var el = root.querySelector('#casper-state');
    if (el) el.textContent = label || 'Ready';
  }

  /* ---- transcript. textContent only, ever. ------------------------------ */
  function line(who, text) {
    var d = document.createElement('p');
    d.className = 'casper__line casper__line--' + who;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  /* ---- speech out ------------------------------------------------------- */
  var synth = window.speechSynthesis, voice = null, queue = [], speaking = false, unlocked = false;

  function pickVoice() {
    if (!CAP.tts) return;
    var vs = synth.getVoices();
    if (!vs.length) return;                 // voiceschanged will call us again
    var want = CFG.preferredVoices || [];
    // Prefer a LOCAL voice: a network voice can add 200-800ms to every reply.
    var local = vs.filter(function (v) { return v.localService && /^en/i.test(v.lang); });
    var pool = local.length ? local : vs.filter(function (v) { return /^en/i.test(v.lang); });
    for (var i = 0; i < want.length; i++) {
      var hit = pool.filter(function (v) { return v.name === want[i]; })[0];
      if (hit) { voice = hit; return; }
    }
    voice = pool[0] || vs[0] || null;
  }
  if (CAP.tts) { pickVoice(); synth.addEventListener('voiceschanged', pickVoice); }

  /* iOS refuses to speak unless the first speak() came from a user gesture. */
  function unlock() {
    if (unlocked || !CAP.tts) return;
    var u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; synth.speak(u); unlocked = true;
  }

  /* Chrome truncates utterances past ~15s, so chunk at sentence boundaries. */
  function chunk(text) {
    var out = [], t = text.trim();
    var parts = t.split(/(?<=[.!?])\s+/);
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      while (s.length > 200) {
        var cut = s.lastIndexOf(' ', 200); if (cut < 60) cut = 200;
        out.push(s.slice(0, cut)); s = s.slice(cut).trim();
      }
      if (s) out.push(s);
    }
    return out;
  }

  function speak(text) {
    if (!CAP.tts) { setState('idle'); return; }
    queue = queue.concat(chunk(text));
    if (!speaking) next();
  }
  function next() {
    if (!queue.length) { speaking = false; setState('idle'); return; }
    speaking = true; setState('speaking');
    var u = new SpeechSynthesisUtterance(queue.shift());
    if (voice) u.voice = voice;
    u.lang = CFG.lang || 'en-US'; u.rate = 1.02;
    u.onboundary = function (e) { if (e.name === 'word') CasperOrb.kick(); };
    u.onend = next; u.onerror = next;     // never strand the queue
    synth.speak(u);
  }
  function stopSpeaking() {
    queue.length = 0; speaking = false;
    if (CAP.tts) { try { synth.cancel(); } catch (e) {} }
  }
  /* Chrome keeps speaking across a navigation. On a 17-page site that is not
     theoretical. */
  window.addEventListener('pagehide', stopSpeaking);

  function say(text, voiceToo) {
    line('casper', text);
    sayNode.textContent = text;
    if (voiceToo !== false) speak(text); else setState('idle');
  }

  /* ---- speech in -------------------------------------------------------- */
  function toggleMic() {
    if (recActive) { stopListening(); return; }
    unlock();
    startListening();
  }

  function startListening() {
    if (!CAP.rec) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    stopSpeaking();
    try {
      rec = new SR();
      rec.lang = CFG.lang || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onstart = function () { recActive = true; micBtn.setAttribute('aria-pressed', 'true'); setState('listening'); };
      rec.onresult = function (e) {
        var txt = '', fin = false;
        for (var i = e.resultIndex; i < e.results.length; i++) {
          txt += e.results[i][0].transcript;
          if (e.results[i].isFinal) fin = true;
        }
        // Interim cadence drives the orb where an AnalyserNode isn't available.
        CasperOrb.setLevel(0.6);
        if (fin && txt.trim()) { stopListening(); ask(txt.trim()); }
      };
      rec.onerror = function (e) {
        stopListening();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          micBtn.textContent = 'Mic blocked';
          micBtn.disabled = true;
          say("I can't hear you — the microphone is blocked for this site. You can still type.", false);
          input.focus();
        }
      };
      rec.onend = function () { recActive = false; if (micBtn) micBtn.setAttribute('aria-pressed', 'false'); if (state === 'listening') setState('idle'); };
      rec.start();
    } catch (e) { recActive = false; setState('idle'); }
  }
  function stopListening() {
    recActive = false;
    if (micBtn && !micBtn.disabled) micBtn.setAttribute('aria-pressed', 'false');
    if (rec) { try { rec.stop(); } catch (e) {} }
  }

  function bargeIn() {
    stopSpeaking();
    if (inflight) { inflight.abort(); inflight = null; }
    setState('idle');
  }

  /* ---- the scripted FAQ, tried BEFORE the model -------------------------
     The most common questions therefore can never be got wrong, cost nothing,
     and still work with no Worker configured or the daily cap reached. */
  function scripted(q) {
    var s = q.toLowerCase();
    var best = null, bestScore = 0;
    var faq = CFG.faq || [];
    for (var i = 0; i < faq.length; i++) {
      var score = 0;
      for (var j = 0; j < faq[i].q.length; j++) if (s.indexOf(faq[i].q[j]) !== -1) score++;
      if (score > bestScore) { bestScore = score; best = faq[i]; }
    }
    return bestScore > 0 ? best.a : null;
  }

  /* ---- network ---------------------------------------------------------- */
  var inflight = null;

  function ask(q) {
    if (!open) toggle(true);
    line('you', q);
    unlock();

    var hit = scripted(q);
    if (hit) { history.push({ role: 'user', content: q }, { role: 'assistant', content: hit }); say(hit); return; }

    if (scriptedOnly) { say(CFG.fallback || "I don't have that one yet."); return; }

    history.push({ role: 'user', content: q });
    if (history.length > 8) history = history.slice(-8);
    setState('thinking');

    var node = line('casper', '');
    var acc = '', spokenTo = 0;

    if (inflight) inflight.abort();
    var ctl = inflight = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 25000);

    fetch(CFG.workerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ v: 1, messages: history }),
      signal: ctl.signal, credentials: 'omit', cache: 'no-store'
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('http_' + res.status);
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finish(); return; }
          buf += dec.decode(r.value, { stream: true });
          var i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            var block = buf.slice(0, i); buf = buf.slice(i + 2);
            var ln = block.split('\n').filter(function (x) { return x.indexOf('data:') === 0; })[0];
            if (!ln) continue;
            var ev; try { ev = JSON.parse(ln.slice(5)); } catch (e) { continue; }

            if (ev.t === 'delta') {
              acc += ev.v;
              node.textContent = acc;
              log.scrollTop = log.scrollHeight;
              // Speak each completed sentence as it lands, so speech starts
              // long before the full answer arrives.
              var m = acc.slice(spokenTo).match(/^[\s\S]*?[.!?](?=\s|$)/);
              if (m) { speak(m[0]); spokenTo += m[0].length; }
            } else if (ev.t === 'meta' && ev.limit === 'daily') {
              scriptedOnly = true;   // stay useful for the rest of the session
            } else if (ev.t === 'done') { finish(); return; }
          }
          return pump();
        });
      }

      function finish() {
        clearTimeout(timer); inflight = null;
        var rest = acc.slice(spokenTo).trim();
        if (rest) speak(rest);
        else if (!speaking) setState('idle');
        sayNode.textContent = acc;
        history.push({ role: 'assistant', content: acc });
      }
      return pump();
    }).catch(function (err) {
      clearTimeout(timer); inflight = null;
      if (err && err.name === 'AbortError') { setState('idle'); return; }
      // No auto-retry, ever -- that is how a bug becomes a flood.
      node.textContent = "I can't reach my brain right now. Try again in a moment, or email Jasper at repsaj17@mit.edu.";
      setState('idle');
    });
  }

  /* ---- boot ------------------------------------------------------------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  window.Casper = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    ask: ask,
    forget: function () { history.length = 0; log.textContent = ''; }
  };
})();
