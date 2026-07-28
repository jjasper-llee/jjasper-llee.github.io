/* ============================================================================
   SCALE  —  an interactive ladder from the observable universe to a quark
   ----------------------------------------------------------------------------
   Spans about 45 orders of magnitude, which is the whole engineering problem.
   No depth buffer survives that in a single scene, and no float32 position
   attribute does either: at 1e26 metres the spacing between representable
   floats is larger than a galaxy.

   So nothing here is ever drawn at its real size. Instead:

     * Every stage is modelled in its OWN normalised units, roughly -1..1, and
       gets its own THREE.Group.
     * The camera never moves. The stages cross-fade as the scale value passes
       through them, and each one scales within a narrow band around its own
       centre.
     * `scale` is a LOG value (log10 metres). Everything -- the readout, the
       fades, the per-stage zoom -- is driven off that one number, so the ladder
       is continuous even though the geometry is not.

   That's the trick "powers of ten" visualisations use, and it is why this can
   run at 60fps on a phone while claiming to show you a quark.

   Astronomy note: no API is involved and none is needed. Planet positions come
   from Keplerian orbital elements evaluated in the browser, which is exact,
   offline, and free. The galaxy is procedural -- a real star catalogue would be
   ~30MB and carries a share-alike licence, for a view nobody can distinguish
   from a good density model.
   ========================================================================= */

import * as THREE from './vendor/three.module.js';

/* ---------------------------------------------------------------------------
   1  THE LADDER
   `at` is log10(metres) of the thing being shown.
   -------------------------------------------------------------------------*/
const STAGES = [
  { key:'universe', at: 26.7, name:'Observable Universe',
    blurb:'93 billion light-years across. The filaments are galaxy superclusters — the largest structures that exist.' },
  { key:'galaxy',   at: 21.0, tilt: 1.02, name:'The Milky Way',
    blurb:'100,000 light-years. Roughly 200 billion stars. The Sun sits about two-thirds out, on the Orion Arm.' },
  { key:'solar',    at: 13.0, tilt: 1.10, name:'Solar System',
    blurb:'Planet positions from Keplerian orbital elements, computed live — no data feed, no network.' },
  { key:'earth',    at:  7.0, name:'Earth',
    blurb:'12,742 km. Everything anyone has ever done happened here.' },
  { key:'human',    at:  0.2, name:'Human Scale',
    blurb:'A cello is about 1.2 m. This is the only rung on the ladder our senses evolved for.' },
  { key:'cell',     at: -5.0, name:'Cell',
    blurb:'~10 µm. Jasper engineers micro-topography at roughly this scale, to steer how muscle tissue grows.' },
  { key:'dna',      at: -8.3, name:'DNA',
    blurb:'2 nm wide, one full turn every 3.4 nm. Two metres of it is coiled inside almost every cell you have.' },
  { key:'atom',     at:-10.0, name:'Atom',
    blurb:'~0.1 nm. Almost entirely empty — the electron cloud is a probability, not a shell.' },
  { key:'nucleus',  at:-14.0, name:'Nucleus',
    blurb:'~10 fm. If the atom were a stadium, this would be a marble on the centre spot.' },
  { key:'quark',    at:-18.0, spin: 0.015, name:'Quarks & Gluons',
    blurb:'Below 1 am. Quarks are never found alone — pull two apart and the gluon field makes new ones.' }
];

const MIN = STAGES[STAGES.length - 1].at - 1.2;
const MAX = STAGES[0].at + 1.2;

/* ---------------------------------------------------------------------------
   2  SETUP
   -------------------------------------------------------------------------*/
const host = document.getElementById('scene');
const readout = document.getElementById('readout');
const nameEl = document.getElementById('stage-name');
const blurbEl = document.getElementById('stage-blurb');
const slider = document.getElementById('scale');
const statusEl = document.getElementById('status');

let reduced = false;
try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));   // same cap as the rest of the site
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0, 0, 3.4);

const root = new THREE.Group();
scene.add(root);

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------------------
   3  SHARED BUILDERS
   -------------------------------------------------------------------------*/
const CY = 0x6fd3eb, AM = 0xefb45e, VI = 0xa37bff, WH = 0xdfe9ef;

function points(pos, size, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size, color, transparent: true, opacity,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
}
function ring(r, seg, color, opacity) {
  const p = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    p.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
function rnd(n) { return (Math.random() - 0.5) * 2 * n; }

/* ---------------------------------------------------------------------------
   4  STAGES
   Each returns a Group in roughly -1..1 units.
   -------------------------------------------------------------------------*/
const build = {};

/* Cosmic web: nodes joined into filaments, the way superclusters actually sit. */
build.universe = () => {
  const g = new THREE.Group();
  const NODES = 190, hubs = [];
  for (let i = 0; i < NODES; i++) hubs.push(new THREE.Vector3(rnd(1.5), rnd(1.5), rnd(1.5)));

  const dust = [];
  for (const h of hubs) {
    for (let k = 0; k < 26; k++) dust.push(h.x + rnd(0.06), h.y + rnd(0.06), h.z + rnd(0.06));
  }
  const seg = [];
  for (let i = 0; i < hubs.length; i++) {
    const near = hubs
      .map((h, j) => ({ j, d: hubs[i].distanceTo(h) }))
      .filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const n of near) {
      if (n.d > 0.85) continue;
      // scatter galaxies ALONG the filament, which is what makes it read as a
      // web rather than a point cloud
      for (let t = 0; t <= 1; t += 0.06) {
        const p = hubs[i].clone().lerp(hubs[n.j], t);
        dust.push(p.x + rnd(0.018), p.y + rnd(0.018), p.z + rnd(0.018));
      }
      seg.push(hubs[i].x, hubs[i].y, hubs[i].z, hubs[n.j].x, hubs[n.j].y, hubs[n.j].z);
    }
  }
  g.add(points(dust, 0.012, CY, 0.85));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color: CY, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending })));
  return g;
};

/* Logarithmic spiral arms + a central bulge, plus a marker on the Orion Arm. */
build.galaxy = () => {
  const g = new THREE.Group();
  const ARMS = 4, PER = 2600, disc = [], bulge = [];
  for (let a = 0; a < ARMS; a++) {
    for (let i = 0; i < PER; i++) {
      const t = Math.pow(Math.random(), 0.55);
      const ang = t * 3.6 + (a / ARMS) * Math.PI * 2;
      const r = 0.14 + t * 1.15;
      const spread = 0.05 + t * 0.10;
      disc.push(
        Math.cos(ang) * r + rnd(spread),
        rnd(0.035 * (1 - t * 0.6)),
        Math.sin(ang) * r + rnd(spread)
      );
    }
  }
  for (let i = 0; i < 2200; i++) {
    const r = Math.pow(Math.random(), 2.1) * 0.36;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(1));
    bulge.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.62, Math.sin(ph) * Math.sin(th) * r);
  }
  g.add(points(disc, 0.009, CY, 0.7));
  g.add(points(bulge, 0.010, AM, 0.75));

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  sun.position.set(0.62, 0.01, 0.36);
  g.add(sun);
  g.add(ring(0.72, 128, WH, 0.10));
  return g;
};

/* Real Keplerian elements. Positions are computed, not looked up. */
const PLANETS = [
  // name        a(AU)    e      period(yr)  radius  colour
  ['Mercury',    0.387, 0.2056,   0.241,   0.016, 0x9a8f86],
  ['Venus',      0.723, 0.0068,   0.615,   0.026, 0xd9b382],
  ['Earth',      1.000, 0.0167,   1.000,   0.027, 0x6fd3eb],
  ['Mars',       1.524, 0.0934,   1.881,   0.020, 0xc1613a],
  ['Jupiter',    5.203, 0.0484,  11.862,   0.070, 0xd7b489],
  ['Saturn',     9.537, 0.0539,  29.457,   0.060, 0xe3cfa0],
  ['Uranus',    19.191, 0.0473,  84.011,   0.042, 0x9fdbe6],
  ['Neptune',   30.069, 0.0086, 164.79,    0.041, 0x6b8ff0]
];

function kepler(M, e) {                 // Newton-Raphson, 5 iterations is plenty
  let E = M;
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

build.solar = () => {
  const g = new THREE.Group();
  const AU = 0.055;                     // compress so Neptune fits the frame
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 })));

  g.userData.bodies = [];
  for (const [name, a, e, per, rad, col] of PLANETS) {
    const A = Math.log10(1 + a * 9) * 0.62;      // log spacing, or the inner
    const b = A * Math.sqrt(1 - e * e);          // planets are one pixel
    const orbit = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const th = (i / 160) * Math.PI * 2;
      pts.push(Math.cos(th) * A - A * e, 0, Math.sin(th) * b);
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    orbit.add(new THREE.Line(og, new THREE.LineBasicMaterial({ color: CY, transparent: true, opacity: 0.20 })));

    const m = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.55, 14, 14),
      new THREE.MeshBasicMaterial({ color: col }));
    orbit.add(m);
    g.add(orbit);
    g.userData.bodies.push({ mesh: m, A, b, e, per, name });
  }
  return g;
};

build.earth = () => {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 48, 48);
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x11384c })));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: CY, wireframe: true, transparent: true, opacity: 0.22 })));
  // a thin lit limb, so it reads as a sphere and not a wire ball
  const limb = new THREE.Mesh(new THREE.SphereGeometry(1.02, 48, 48),
    new THREE.MeshBasicMaterial({ color: CY, transparent: true, opacity: 0.06, side: THREE.BackSide }));
  g.add(limb);
  return g;
};

/* A cello, in outline. The one rung of the ladder built for a human. */
build.human = () => {
  const g = new THREE.Group();
  const body = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, y = -1 + t * 1.55;
    // two bouts and a waist
    const w = 0.52 * (0.62 + 0.38 * Math.sin(t * Math.PI * 2.0 + 0.4)) * (1 - 0.25 * t);
    body.push(w, y, 0);
  }
  for (let i = 200; i >= 0; i--) body.push(-body[i * 3], body[i * 3 + 1], 0);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(body, 3));
  g.add(new THREE.Line(bg, new THREE.LineBasicMaterial({ color: AM, transparent: true, opacity: 0.9 })));

  const neck = [];
  neck.push(0, 0.55, 0, 0, 1.35, 0);
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(neck, 3));
  g.add(new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: AM, transparent: true, opacity: 0.6 })));

  const strings = [];
  for (let s = 0; s < 4; s++) {
    const x = -0.06 + s * 0.04;
    strings.push(x, 1.3, 0.02, x, -0.7, 0.02);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: WH, transparent: true, opacity: 0.45 })));
  return g;
};

build.cell = () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 40),
    new THREE.MeshBasicMaterial({ color: CY, wireframe: true, transparent: true, opacity: 0.14 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24),
    new THREE.MeshBasicMaterial({ color: VI, transparent: true, opacity: 0.30 })));
  const org = [];
  for (let i = 0; i < 90; i++) {
    const r = 0.42 + Math.random() * 0.48;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(1));
    org.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r);
  }
  g.add(points(org, 0.05, AM, 0.55));
  return g;
};

/* Double helix with base-pair rungs. */
build.dna = () => {
  const g = new THREE.Group();
  const TURNS = 3.2, N = 300;
  const a = [], b = [], rung = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = -1.25 + t * 2.5, th = t * Math.PI * 2 * TURNS;
    const x1 = Math.cos(th) * 0.34, z1 = Math.sin(th) * 0.34;
    const x2 = Math.cos(th + Math.PI) * 0.34, z2 = Math.sin(th + Math.PI) * 0.34;
    a.push(x1, y, z1); b.push(x2, y, z2);
    if (i % 9 === 0) rung.push(x1, y, z1, x2, y, z2);
  }
  for (const [arr, col] of [[a, CY], [b, AM]]) {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.add(new THREE.Line(gg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 })));
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rung, 3));
  g.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: WH, transparent: true, opacity: 0.35 })));
  return g;
};

/* Orbital *clouds*, not Bohr rings -- the electron is a probability. */
build.atom = () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 18),
    new THREE.MeshBasicMaterial({ color: AM })));
  const cloud = [];
  for (let i = 0; i < 4200; i++) {
    // radial density peaking away from the nucleus, like a 2p lobe pair
    const r = 0.35 + Math.abs(rnd(0.45));
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(rnd(1));
    const lobe = Math.pow(Math.abs(Math.cos(ph)), 0.7);
    cloud.push(Math.sin(ph) * Math.cos(th) * r * (0.5 + lobe),
               Math.cos(ph) * r * 1.15,
               Math.sin(ph) * Math.sin(th) * r * (0.5 + lobe));
  }
  g.add(points(cloud, 0.014, CY, 0.35));
  g.userData.cloud = g.children[1];
  return g;
};

build.nucleus = () => {
  const g = new THREE.Group();
  const N = 26;
  for (let i = 0; i < N; i++) {
    const r = Math.pow(Math.random(), 0.4) * 0.62;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(1));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16),
      new THREE.MeshBasicMaterial({ color: i % 2 ? CY : AM, transparent: true, opacity: 0.85 }));
    m.position.set(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r);
    g.add(m);
  }
  return g;
};

/* Three quarks and the flux tubes between them. */
build.quark = () => {
  const g = new THREE.Group();
  const cols = [0xff5f6d, 0x6fd3eb, 0xa37bff];      // "colour" charge, literally
  const pos = [
    new THREE.Vector3(0, 0.62, 0),
    new THREE.Vector3(-0.58, -0.34, 0.14),
    new THREE.Vector3(0.58, -0.34, -0.14)
  ];
  const qs = [];
  pos.forEach((p, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 20),
      new THREE.MeshBasicMaterial({ color: cols[i] }));
    m.position.copy(p); g.add(m); qs.push(m);
  });
  // gluon flux tubes, rebuilt each frame so they writhe
  const tube = new THREE.BufferGeometry();
  // 3 pairs x 40 segments x 2 vertices x 3 components. Sizing this by
  // eye truncated the flux tubes to a single thread.
  tube.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 40 * 2 * 3), 3));
  const line = new THREE.LineSegments(tube, new THREE.LineBasicMaterial({
    color: WH, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }));
  g.add(line);
  g.userData.qs = qs; g.userData.tube = tube;
  return g;
};

/* ---------------------------------------------------------------------------
   5  MOUNT
   -------------------------------------------------------------------------*/
const groups = {};
for (const st of STAGES) {
  const g = build[st.key]();
  g.visible = false;
  groups[st.key] = g;
  root.add(g);
}

function setOpacity(g, o) {
  g.traverse(n => {
    if (n.material) {
      if (n.userData.base === undefined) n.userData.base = n.material.opacity !== undefined ? n.material.opacity : 1;
      n.material.transparent = true;
      n.material.opacity = n.userData.base * o;
    }
  });
}

/* ---------------------------------------------------------------------------
   6  SCALE
   -------------------------------------------------------------------------*/
let scale = 0.2, target = 0.2, t = 0;

const SI = [
  [1e24,'Ym'],[1e21,'Zm'],[1e18,'Em'],[1e15,'Pm'],[1e12,'Tm'],[1e9,'Gm'],
  [1e6,'Mm'],[1e3,'km'],[1,'m'],[1e-3,'mm'],[1e-6,'µm'],[1e-9,'nm'],
  [1e-12,'pm'],[1e-15,'fm'],[1e-18,'am']
];
function human(logm) {
  const v = Math.pow(10, logm);
  for (const [f, u] of SI) {
    if (v >= f) {
      const n = v / f;
      return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u;
    }
  }
  return v.toExponential(1) + ' m';
}

function nearest(s) {
  let best = STAGES[0], bd = 1e9;
  for (const st of STAGES) { const d = Math.abs(st.at - s); if (d < bd) { bd = d; best = st; } }
  return best;
}

let shownKey = null;
function paint() {
  const st = nearest(scale);
  if (st.key !== shownKey) {
    shownKey = st.key;
    nameEl.textContent = st.name;
    blurbEl.textContent = st.blurb;
    document.body.dataset.stage = st.key;
  }
  readout.textContent = human(scale);
  readout.dataset.exp = '10^' + scale.toFixed(1) + ' m';
}

/* ---------------------------------------------------------------------------
   7  FRAME
   -------------------------------------------------------------------------*/
let raf = 0, running = false, lastT = 0;

function frame(now) {
  if (!running) return;
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;
  t += dt;

  scale += (target - scale) * Math.min(1, dt * 6);

  for (const st of STAGES) {
    const g = groups[st.key];
    const d = Math.abs(scale - st.at);
    const span = 2.2;
    const vis = Math.max(0, 1 - d / span);
    g.visible = vis > 0.004;
    if (!g.visible) continue;

    setOpacity(g, Math.pow(vis, 1.6));
    // Each stage zooms only within its own band: closer than its centre and it
    // grows past the frame, further and it recedes. That is what makes the
    // ladder feel continuous across 45 orders of magnitude.
    const z = Math.pow(2, (st.at - scale) * 0.55);
    g.scale.setScalar(z);
    g.rotation.y = t * (st.spin === undefined ? 0.05 : st.spin) + (st.at - scale) * 0.02;
    // A disc viewed edge-on shows nothing. Discs get tilted toward the camera.
    g.rotation.x = st.tilt || 0;
  }

  // per-stage life
  if (groups.solar.visible) {
    for (const b of groups.solar.userData.bodies) {
      const M = (t * 0.06 / b.per) * Math.PI * 2;
      const E = kepler(M % (Math.PI * 2), b.e);
      b.mesh.position.set(Math.cos(E) * b.A - b.A * b.e, 0, Math.sin(E) * b.b);
    }
  }
  if (groups.quark.visible) {
    const qs = groups.quark.userData.qs, tube = groups.quark.userData.tube;
    const arr = tube.attributes.position.array;
    let i = 0;
    for (let a = 0; a < 3; a++) {
      const A = qs[a].position, B = qs[(a + 1) % 3].position;
      for (let s = 0; s < 40; s++) {
        const u = s / 40, v = (s + 1) / 40;
        for (const p of [u, v]) {
          const w = Math.sin(p * Math.PI) * 0.16;
          arr[i++] = A.x + (B.x - A.x) * p + Math.sin(t * 6 + p * 9 + a) * w;
          arr[i++] = A.y + (B.y - A.y) * p + Math.cos(t * 5 + p * 8 + a) * w;
          arr[i++] = A.z + (B.z - A.z) * p + Math.sin(t * 7 + p * 7 + a) * w;
        }
      }
    }
    tube.attributes.position.needsUpdate = true;
  }
  if (groups.atom.visible && groups.atom.userData.cloud) {
    groups.atom.userData.cloud.rotation.y = t * 0.35;
    groups.atom.userData.cloud.rotation.x = Math.sin(t * 0.2) * 0.3;
  }

  paint();
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}

function start() { if (running || reduced) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); }
function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
function renderOnce() { paint(); for (const st of STAGES) { const g = groups[st.key]; const d = Math.abs(scale - st.at); const vis = Math.max(0, 1 - d / 2.2); g.visible = vis > 0.004; if (g.visible) { setOpacity(g, Math.pow(vis, 1.6)); g.scale.setScalar(Math.pow(2, (st.at - scale) * 0.55)); g.rotation.x = st.tilt || 0; } } renderer.render(scene, camera); }

/* ---------------------------------------------------------------------------
   8  INPUT
   -------------------------------------------------------------------------*/
function setTarget(v) {
  target = Math.max(MIN, Math.min(MAX, v));
  slider.value = String(target);
  if (reduced) { scale = target; renderOnce(); }
}

host.addEventListener('wheel', e => {
  e.preventDefault();
  setTarget(target - e.deltaY * 0.004);
}, { passive: false });

let drag = null;
host.addEventListener('pointerdown', e => { drag = e.clientY; host.setPointerCapture(e.pointerId); });
host.addEventListener('pointermove', e => {
  if (drag === null) return;
  setTarget(target + (e.clientY - drag) * 0.012);
  drag = e.clientY;
});
host.addEventListener('pointerup', () => { drag = null; });
host.addEventListener('pointercancel', () => { drag = null; });

slider.addEventListener('input', () => { setTarget(parseFloat(slider.value)); });

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setTarget(target + 0.5); e.preventDefault(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setTarget(target - 0.5); e.preventDefault(); }
});

document.querySelectorAll('[data-goto]').forEach(b => {
  b.addEventListener('click', () => {
    const st = STAGES.find(s => s.key === b.dataset.goto);
    if (st) setTarget(st.at);
  });
});

document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
window.addEventListener('resize', resize);

/* ---------------------------------------------------------------------------
   9  BOOT
   -------------------------------------------------------------------------*/
slider.min = String(MIN); slider.max = String(MAX); slider.step = '0.01';
resize();
setTarget(0.2);
scale = 0.2;
statusEl.remove();
if (reduced) renderOnce(); else start();
