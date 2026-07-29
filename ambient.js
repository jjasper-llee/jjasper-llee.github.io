/* ============================================================================
   AMBIENT  —  the background clip behind the hero
   ----------------------------------------------------------------------------
   Design rule: the hero must look finished with ZERO video bytes. The grid,
   vignette, waveform and name treatment are the hero; this is additive. If any
   gate fails we never fetch the file at all and the poster stands alone.

   That is why the <video> ships with no src and no autoplay attribute: sources
   are injected here, after the gates. `preload="none"` alone is only advisory
   and Chrome overrides it when `autoplay` is present, so the attribute has to
   be absent for the zero-byte path to actually be zero bytes.

   Gates, cheapest first:
     1  prefers-reduced-motion: reduce   -> never load, never play
     2  connection.saveData / 2G         -> never load
     3  deviceMemory < 2                 -> never load
     4  IntersectionObserver on the hero -> load on first intersect only
     5  document.hidden                  -> pause
     6  play() rejection (iOS Low Power) -> keep the poster, stop asking
   ========================================================================= */

(function () {
  'use strict';

  var video = document.getElementById('ambient-video');
  if (!video) return;

  var CLIPS = { cello: 'media/ambient-cello', shop: 'media/ambient-shop' };

  function mq(q) { try { return window.matchMedia(q); } catch (e) { return null; } }
  var reducedMQ = mq('(prefers-reduced-motion: reduce)');
  var smallMQ   = mq('(max-width: 760px)');

  function saveData() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData) return true;
    return c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
  }
  function tooWeak() {
    // 1GB-class Android: decoding 720p alongside a dozen photos is not worth it.
    return typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 2;
  }
  function blocked() {
    return (reducedMQ && reducedMQ.matches) || saveData() || tooWeak();
  }

  var loaded = false, currentKey = null, visible = false;

  function load(key) {
    var base = CLIPS[key];
    if (!base || blocked()) return;
    if (loaded && currentKey === key) return;

    // 640-wide on phones. The clip is graded to a low luminance ceiling, so
    // nobody can resolve detail in it, and this halves the transfer.
    var w = (smallMQ && smallMQ.matches) ? '.640' : '';

    while (video.firstChild) video.removeChild(video.firstChild);
    var mp4 = document.createElement('source');
    mp4.type = 'video/mp4; codecs="avc1.640028"';
    mp4.src  = base + w + '.mp4';
    video.appendChild(mp4);

    if (video.poster !== undefined) video.poster = base + '.poster.jpg';

    video.preload = 'auto';
    video.load();
    loaded = true;
    currentKey = key;
  }

  function play() {
    if (blocked() || !loaded || document.hidden) return;
    var p = video.play();
    if (p && typeof p.catch === 'function') {
      // iOS Low Power Mode rejects even muted autoplay. Not an error -- the
      // poster is a perfectly good still, so stop asking.
      p.catch(function () { video.classList.remove('is-live'); });
    }
  }
  function pause() { if (!video.paused) { try { video.pause(); } catch (e) {} } }

  video.addEventListener('playing', function () { video.classList.add('is-live'); });

  var host = video.closest('.hero') || video.parentElement;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { load(host.dataset.ambient || 'cello'); play(); }
      else pause();
    }, { rootMargin: '180px 0px' }).observe(host);
  } else {
    visible = true;
    load(host.dataset.ambient || 'cello');
    play();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else if (visible) play();
  });
  window.addEventListener('pagehide', pause);

  // Respond live to the OS toggle rather than only at load.
  if (reducedMQ && reducedMQ.addEventListener) {
    reducedMQ.addEventListener('change', function (e) {
      if (e.matches) { pause(); video.classList.remove('is-live'); }
      else if (visible) { load(currentKey || 'cello'); play(); }
    });
  }

  /* Both scripts are deferred and site.js is first, so on a direct load of
     #left-brain the router's `if (window.setAmbientClip)` call is skipped --
     this function does not exist yet. Clicking the nav worked; bookmarking the
     section did not. Resolve the section here at init instead of relying on
     the router having gone first. */
  (function initialClip() {
    var h = (location.hash || '').replace('#', '');
    if (h === 'left-brain') host.dataset.ambient = 'shop';
  })();

  // Called by the section router so the engineering side gets machinery.
  window.setAmbientClip = function (key) {
    if (!CLIPS[key] || key === currentKey) return;
    host.dataset.ambient = key;
    if (visible) {
      video.classList.remove('is-live');
      loaded = false;
      load(key);
      play();
    }
  };
})();
