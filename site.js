/* ============================================================================
   SITE  —  jjasper-llee.github.io
   Replaces brain.js. Three independent IIFEs in one file, because every page
   already loads this one request and splitting it would triple that across 17
   pages.

     A  Mobile nav      (lifted verbatim from brain.js -- all pages depend on it)
     B  Section router  (hash-routed SPA: About / Left Brain / Right Brain / Contact)
     C  YouTube facades (click-to-load; see the note in C)
   ========================================================================= */

/* ---------------------------------------------------------------------------
   A  MOBILE NAV
   A checkbox-hack menu cannot express aria-expanded, close on Escape, or close
   on outside-click, so this is ~20 lines of vanilla JS instead.
   -------------------------------------------------------------------------*/
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ---------------------------------------------------------------------------
   B  SECTION ROUTER
   -------------------------------------------------------------------------*/
(function () {
  'use strict';

  var pages = document.querySelectorAll('.page');
  if (!pages.length) return;                       // project detail pages

  var navLinks = document.querySelectorAll('nav a[data-section]');
  var sectionIds = {};
  for (var i = 0; i < pages.length; i++) sectionIds[pages[i].id] = true;

  var TITLES = {
    'about':       'Jasper Lee — Engineer & Cellist',
    'left-brain':  'Engineering — Jasper Lee',
    'right-brain': 'Cello — Jasper Lee',
    'contact':     'Contact — Jasper Lee'
  };

  // Drop the hash on reload so a refresh returns to a clean URL.
  var navEntries = typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('navigation') : [];
  var isReload = navEntries.length
    ? navEntries[0].type === 'reload'
    : (performance.navigation && performance.navigation.type === 1);
  if (isReload) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function showSection(section, opts) {
    var scroll = !opts || opts.scroll !== false;
    if (!sectionIds[section]) section = 'about';

    for (var i = 0; i < pages.length; i++) {
      pages[i].classList.toggle('visible', pages[i].id === section);
    }
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.toggle('active', navLinks[j].dataset.section === section);
    }

    // Retints every accent on the page -- nav LED, panel rim, tile duotone,
    // waveform -- from one attribute.
    document.body.dataset.hemi =
      section === 'left-brain' ? 'left' : section === 'right-brain' ? 'right' : '';

    document.title = TITLES[section] || 'Jasper Lee';

    // Machinery footage on the engineering side, cello everywhere else.
    if (window.setAmbientClip) {
      window.setAmbientClip(section === 'left-brain' ? 'shop' : 'cello');
    }

    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleHash(opts) {
    var section = window.location.hash.replace('#', '') || 'about';
    showSection(section, opts);
  }

  for (var k = 0; k < navLinks.length; k++) {
    navLinks[k].addEventListener('click', function (e) {
      var target = this.dataset.section;
      if (!target) return;
      e.preventDefault();
      if (window.location.hash === '#' + target) showSection(target);
      else window.location.hash = target;
    });
  }

  window.addEventListener('hashchange', function () {
    handleHash();
    // Sections are hash views, not page loads; log each switch as its own path.
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: '/#' + (window.location.hash.replace('#', '') || 'about') });
    }
  });
  handleHash({ scroll: false });
})();

/* ---------------------------------------------------------------------------
   C  YOUTUBE FACADES
   The Right Brain grid used to hold 18 live <iframe> players. They escaped
   lazy-loading because display:none gives an element no layout box, so opening
   the section instantiated all 18 at once -- roughly 8 MB of transfer and 18
   nested browsing contexts on a single click.

   Now each tile is a button over a locally cached still. The real player is
   created only when one is clicked, which also means zero requests to Google
   on page load.
   -------------------------------------------------------------------------*/
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.ytf');
    if (!f || !f.dataset.yt) return;

    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + f.dataset.yt +
                '?autoplay=1&rel=0&modestbranding=1';
    frame.title = f.dataset.title || 'Video';
    frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.className = 'ytf__frame';
    f.replaceWith(frame);
    frame.focus();
  });
})();
