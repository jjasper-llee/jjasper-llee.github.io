/* ============================================================================
   CASPER CONFIG  —  the only file you need to edit.

   There is no API key here, and there never should be. The model runs on the
   Cloudflare Workers AI free tier, where `env.AI` is a binding rather than a
   credential. See worker/README.md.
   ========================================================================= */
window.CASPER_CONFIG = {

  /* Paste the URL `npx wrangler deploy` prints, e.g.
       'https://casper.your-subdomain.workers.dev'
     Leave it empty and Casper runs in scripted mode: the orb still animates
     and the FAQ below still answers. Nothing looks broken either way. */
  workerUrl: '',

  lang: 'en-US',

  /* true  -> Deepgram Aura via the Worker. One consistent, natural voice on
              every browser and OS, and it reads with real pacing.
     false -> the browser's own voice: instant and free, but quality depends
              entirely on what the visitor has installed.
     Either way there is a toggle in the panel, and Aura failing falls back
     to the browser voice automatically. */
  naturalVoice: true,

  rate: 1.0,
  pitch: 1.0,

  /* Only a tie-breaker. casper.js ranks by QUALITY MARKERS first -- Apple's
     "(Premium)"/"(Enhanced)" and Microsoft's "Natural" voices are neural and
     far better than the defaults, so plain "Samantha" must not win just
     because it is famous. Tell visitors on macOS they can install more under
     System Settings > Accessibility > Spoken Content > System Voice. */
  preferredVoices: ['Zoe', 'Ava', 'Samantha', 'Daniel', 'Alex'],

  /* The six questions people actually ask. These are answered EXACTLY, from
     here, before the model is ever consulted -- so the most common questions
     can never be got wrong, and they cost nothing. They are also the whole
     product when the Worker isn't configured or the daily cap is reached. */
  faq: [
    { q: ['what does jasper study', 'what does he study', 'major', 'school', 'college', 'university'],
      label: 'What does he study?',
      a: "He's at MIT, double-majoring in Mechanical Engineering and Physics." },

    { q: ['research', 'raman', 'lab', 'superurop', 'nano', 'bio', 'tissue'],
      label: 'What is his research?',
      a: "He's a SuperUROP researcher in MIT's Raman Lab, engineering micro-topography structures for tissue regeneration — work aimed at treating neuromuscular disease. It's under Left Brain, the Nano/Bio Engineering page." },

    { q: ['drone', 'quadcopter', 'tricopter', 'flying', 'fly', 'aerial'],
      label: 'Tell me about the drones.',
      a: "He designed and flew a shape-shifting tricopter in France through MIT's MISTI program, and separately built a quadcopter with a radio system he made from scratch. Both are under Left Brain." },

    { q: ['cello', 'music', 'play', 'perform', 'instrument', 'concert'],
      label: 'Does he really play cello?',
      a: "He does. He made his concerto debut with the Manhattan Symphony in 2023, and he's a two-time National YoungArts winner. The Right Brain tab has recordings." },

    { q: ['lumi', 'fingerboard', 'fingering', 'algorithm'],
      label: 'What is the LUMI fingerboard?',
      a: "An LED-lit cello fingerboard that displays the output of a fingering-optimisation algorithm he wrote — he believes it's the first of its kind." },

    { q: ['contact', 'email', 'reach', 'hire', 'linkedin', 'github', 'get in touch'],
      label: 'How do I contact him?',
      a: "Email is repsaj17 at mit dot edu, and he's on LinkedIn and GitHub as jjasper-llee. The Contact tab has all of it." }
  ],

  /* Shown when nothing matches and there is no Worker to ask. */
  fallback: "I only know a short script until Jasper connects my brain. Try asking about his research, the drones, or his cello playing — or email him at repsaj17@mit.edu."
};
