/* ============================================================================
   SCALE — an explorable ladder from the observable universe to a quark
   ----------------------------------------------------------------------------
   Spanning ~45 orders of magnitude IS the engineering problem. No depth buffer
   survives it in one scene, and neither does a float32 position attribute: at
   1e26 m the gap between representable floats is wider than a galaxy.

   So nothing is drawn at its real size. Each stage is modelled in its own
   normalised units in its own Group; one LOG value (log10 metres) drives every
   cross-fade, every per-stage zoom, and the readout. The camera orbits the
   origin because every stage is modelled around the origin.

   Provenance is the point. Cyan OBSERVED means an instrument recorded it.
   Amber MODEL means it is inferred or drawn, and the chip says why. Half this
   ladder cannot be photographed — nobody has imaged a nucleus, and no picture
   of the Milky Way from outside exists or can.

   Textures are vendored in textures/, not hotlinked: solarsystemscope.com
   sends no CORS header, so a cross-origin fetch into a WebGL texture fails
   outright. See tools/fetch-textures.sh.
   ========================================================================= */

import * as THREE from './vendor/three.module.js';
import { STAGES, PLANETS, MOONS, SUN, TEXTURES, factRows } from './universe-data.js?v=20260802';

/* ---------------------------------------------------------------------------
   0  ENV
   -------------------------------------------------------------------------*/
const host    = document.getElementById('scene');
const readout = document.getElementById('readout');
const nameEl  = document.getElementById('stage-name');
const blurbEl = document.getElementById('stage-blurb');
const slider  = document.getElementById('scale');
const statusEl= document.getElementById('status');
const provEl  = document.getElementById('provenance');
const chipsEl = document.getElementById('body-chips');
const panel   = document.getElementById('body-panel');

let reduced = false;
try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

/* Same tier shape as casper.js, so the site has one mental model. Note the
   texture sizes are PER ASSET CLASS, not global: sixteen 2048 maps would be
   ~180MB of VRAM and would get the context killed on a phone. */
const TIER = (() => {
  const w = document.documentElement.clientWidth;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (w >= 1100 && cores >= 8 && mem >= 8)
    return { key:'hi', dpr:1.75, aa:true,  segW:64, segH:48, pSeg:24, aniso:4 };
  if (w >= 700)
    return { key:'md', dpr:1.75, aa:true,  segW:48, segH:32, pSeg:20, aniso:2 };
  return   { key:'lo', dpr:1.5,  aa:false, segW:32, segH:24, pSeg:16, aniso:1 };
})();

const MIN = STAGES[STAGES.length - 1].at - 1.2;
const MAX = STAGES[0].at + 1.2;

/* ---------------------------------------------------------------------------
   1  RENDERER
   -------------------------------------------------------------------------*/
const renderer = new THREE.WebGLRenderer({ antialias: TIER.aa, alpha: false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TIER.dpr));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral rather than ACES: ACES desaturates and lifts blacks in a way that
// reads as a film still. NASA/JPL releases sit close to straight sRGB with a
// gentle highlight rolloff, which is what Neutral does.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.setClearColor(0x06080A, 1);
host.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
const root   = new THREE.Group();
scene.add(root, camera);

const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.4);
sunLight.position.set(1, 0.15, 0.4);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x223044, 0.10));

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------------------
   2  TEXTURES
   Keyed by URL, deduped in flight, uploaded on a budget, disposed when a stage
   is left far behind. A visitor who never reaches Mars never finishes
   downloading Mars.
   -------------------------------------------------------------------------*/
const texCache = new Map();     // url -> {tex, stage}
const texInflight = new Map();  // url -> {promise, abort, stage}
const uploadQ = [];
const loaderFallback = new THREE.TextureLoader();

function flat(hex) {
  const c = new THREE.Color(hex);
  const d = new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]);
  const t = new THREE.DataTexture(d, 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function configure(tex, isData) {
  // r185 defaults Texture.colorSpace to NoColorSpace. Albedo maps MUST be
  // tagged sRGB or everything renders washed out; data maps (the ocean mask)
  // must NOT be, or the highlight comes out the wrong shape.
  tex.colorSpace = isData ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;        // equirectangular wraps in longitude
  tex.wrapT = THREE.ClampToEdgeWrapping;   // never in latitude — that mirrors the poles
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = TIER.aniso;
  tex.needsUpdate = true;
  return tex;
}

function loadTexture(url, stage, isData) {
  const hit = texCache.get(url);
  if (hit) return Promise.resolve(hit.tex);
  const busy = texInflight.get(url);
  if (busy) return busy.promise;

  const ctl = typeof AbortController === 'function' ? new AbortController() : null;

  const promise = fetch(url, { signal: ctl && ctl.signal, cache:'force-cache' })
    .then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.blob(); })
    // three ignores texture.flipY for ImageBitmap sources, so the flip has to
    // happen at decode time.
    .then(blob => createImageBitmap(blob, { imageOrientation:'flipY', premultiplyAlpha:'none' }))
    .then(bmp => {
      const t = new THREE.Texture(bmp);
      t.flipY = false;
      return new Promise(res => uploadQ.push({ tex: configure(t, isData), resolve: res }));
    })
    .catch(err => {
      if (err && err.name === 'AbortError') throw err;
      return new Promise((res, rej) => loaderFallback.load(url,
        t => uploadQ.push({ tex: configure(t, isData), resolve: res }), undefined, rej));
    })
    .then(tex => { texCache.set(url, { tex, stage }); texInflight.delete(url); return tex; })
    .catch(err => { texInflight.delete(url); throw err; });

  texInflight.set(url, { promise, abort: () => ctl && ctl.abort(), stage });
  return promise;
}

// texImage2D is main-thread whatever we do, so drain at most one per frame at a
// moment we choose rather than lazily mid-cross-fade.
function drainUploads() {
  if (!uploadQ.length) return;
  const job = uploadQ.shift();
  try { renderer.initTexture(job.tex); } catch (e) {}
  job.resolve(job.tex);
}

function disposeStage(key) {
  for (const [url, job] of texInflight) if (job.stage === key) { job.abort(); texInflight.delete(url); }
  for (const [url, e] of texCache) {
    if (e.stage !== key) continue;
    e.tex.dispose();
    // An ImageBitmap holds a decoded RGBA buffer outside the JS heap until it
    // is explicitly closed; dispose() alone leaks it.
    if (e.tex.image && e.tex.image.close) e.tex.image.close();
    texCache.delete(url);
  }
  const st = STAGES.find(s => s.key === key);
  if (st) st.requested = false;
  if (revert[key]) revert[key]();
}

const revert = {};
const applyTex = {};

function requestStage(key) {
  const st = STAGES.find(s => s.key === key);
  if (!st || st.requested) return;
  const list = TEXTURES[key];
  if (!list) { st.requested = true; return; }
  st.requested = true;
  list.slice().sort((a, b) => a.prio - b.prio).forEach(item => {
    const size = item.sizes[TIER.key];
    if (!size) return;                       // e.g. clouds are skipped on lo
    loadTexture('textures/' + item.file + '_' + size + '.jpg', key, item.data)
      .then(t => { if (applyTex[key]) applyTex[key](item.slot, t); })
      .catch(() => {});                      // a missing texture keeps the placeholder
  });
}

/* ---------------------------------------------------------------------------
   3  SHADERS
   -------------------------------------------------------------------------*/
const VERT = `
  varying vec3 vN; varying vec3 vW; varying vec2 vUv;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

/* Earth. Four things have to be true at once and no stock material does all
   four: city lights only on the unlit side and fading across the terminator;
   a ~20-degree soft terminator (the atmosphere scatters light around the limb,
   which is why Blue Marble frames have a soft edge and a CG globe does not);
   oceans that glint where land does not; and a blue rim on the lit limb.
   Texture sampling returns LINEAR values with no manual decode — three uploads
   sRGB-tagged textures as GL_SRGB8_ALPHA8 and the hardware does the EOTF. */
const EARTH_FRAG = `
  uniform sampler2D uDay, uNight, uOcean;
  uniform vec3 uSunDir;
  uniform float uHasNight, uHasOcean, uFade;
  varying vec3 vN; varying vec3 vW; varying vec2 vUv;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(-uSunDir);
    float ndl = dot(N, L);
    float dayAmt = smoothstep(-0.12, 0.22, ndl);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 lit = day * (0.05 + 1.15 * pow(clamp(ndl, 0.0, 1.0), 0.85));
    vec3 night = texture2D(uNight, vUv).rgb * 1.7 * (1.0 - dayAmt) * uHasNight;
    vec3 col = lit * dayAmt + night;

    // smoothstep collapses the mask's dither to a clean 0/1, which is what
    // stops the specular lobe aliasing into a diamond lattice
    float water = smoothstep(0.35, 0.65, texture2D(uOcean, vUv).r) * uHasOcean;
    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.90) * pow(max(dot(N, H), 0.0), 9.0) * water * 0.075 * dayAmt;

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vec3(0.19, 0.41, 0.86) * fres * clamp(ndl + 0.22, 0.0, 1.0) * 0.85;

    gl_FragColor = vec4(col, uFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* BackSide, so only the far hemisphere draws; the depth test against the globe
   then clips it to the annulus outside the silhouette — exactly the crescent a
   real limb shows. abs() because N faces away on the far side. */
const ATMO_FRAG = `
  uniform vec3 uSunDir, uInner, uOuter;
  uniform float uPower, uFade;
  varying vec3 vN; varying vec3 vW; varying vec2 vUv;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(-uSunDir);
    float rim = pow(1.0 - abs(dot(N, V)), uPower);
    float lit = smoothstep(-0.30, 0.35, dot(N, L));
    gl_FragColor = vec4(mix(uInner, uOuter, lit) * rim * lit * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* Limb darkening + a hot core. Without a bloom pass a textured sphere reads as
   an orange golf ball; this gets most of the way for zero extra files. */
const SUN_FRAG = `
  uniform sampler2D uMap;
  uniform float uFade, uHasMap;
  varying vec3 vN; varying vec3 vW; varying vec2 vUv;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float mu = max(dot(N, V), 0.0);
    vec3 base = mix(vec3(1.0, 0.78, 0.42), texture2D(uMap, vUv).rgb, uHasMap);
    float limb = pow(mu, 0.55);
    gl_FragColor = vec4(base * (0.55 + 1.85 * limb), uFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function atmosphere(r, inner, outer, power) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: ATMO_FRAG,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false,
    uniforms: {
      uSunDir:{value:new THREE.Vector3(-1,0,0)}, uInner:{value:new THREE.Color(inner)},
      uOuter:{value:new THREE.Color(outer)}, uPower:{value:power}, uFade:{value:1}
    }
  }));
  m.renderOrder = 2;
  return m;
}

/* ---------------------------------------------------------------------------
   4  STAGES
   -------------------------------------------------------------------------*/
const groups = {};
const bodiesByStage = {};
const CY = 0x6fd3eb, AM = 0xefb45e, VI = 0xa37bff, WH = 0xdfe9ef;
const rnd = n => (Math.random() - 0.5) * 2 * n;

function points(pos, size, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size, color, transparent:true, opacity, sizeAttenuation:true,
    depthWrite:false, blending:THREE.AdditiveBlending }));
}

function kepler(M, e) { let E = M; for (let i = 0; i < 5; i++) E -= (E - e*Math.sin(E) - M)/(1 - e*Math.cos(E)); return E; }

/* ---- cosmic web ---- */
function buildUniverse() {
  const g = new THREE.Group(), hubs = [], dust = [], seg = [];
  for (let i = 0; i < 190; i++) hubs.push(new THREE.Vector3(rnd(1.5), rnd(1.5), rnd(1.5)));
  for (const h of hubs) for (let k = 0; k < 26; k++) dust.push(h.x+rnd(0.06), h.y+rnd(0.06), h.z+rnd(0.06));
  for (let i = 0; i < hubs.length; i++) {
    const near = hubs.map((h,j)=>({j,d:hubs[i].distanceTo(h)})).filter(o=>o.j!==i).sort((a,b)=>a.d-b.d).slice(0,2);
    for (const n of near) {
      if (n.d > 0.85) continue;
      for (let t = 0; t <= 1; t += 0.06) {
        const p = hubs[i].clone().lerp(hubs[n.j], t);
        dust.push(p.x+rnd(0.018), p.y+rnd(0.018), p.z+rnd(0.018));
      }
      seg.push(hubs[i].x,hubs[i].y,hubs[i].z, hubs[n.j].x,hubs[n.j].y,hubs[n.j].z);
    }
  }
  g.add(points(dust, 0.012, CY, 0.85));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color:CY, transparent:true, opacity:0.10, blending:THREE.AdditiveBlending })));
  return g;
}

/* ---- galaxy ---- */
function buildGalaxy() {
  const g = new THREE.Group(), disc = [], bulge = [];
  for (let a = 0; a < 4; a++) for (let i = 0; i < 2600; i++) {
    const t = Math.pow(Math.random(), 0.55);
    const ang = t*3.6 + (a/4)*Math.PI*2, r = 0.14 + t*1.15, sp = 0.05 + t*0.10;
    disc.push(Math.cos(ang)*r + rnd(sp), rnd(0.035*(1-t*0.6)), Math.sin(ang)*r + rnd(sp));
  }
  for (let i = 0; i < 2200; i++) {
    const r = Math.pow(Math.random(), 2.1)*0.36, th = Math.random()*6.2832, ph = Math.acos(rnd(1));
    bulge.push(Math.sin(ph)*Math.cos(th)*r, Math.cos(ph)*r*0.62, Math.sin(ph)*Math.sin(th)*r);
  }
  g.add(points(disc, 0.009, CY, 0.7));
  g.add(points(bulge, 0.010, AM, 0.75));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), new THREE.MeshBasicMaterial({ color:0xffffff }));
  sun.position.set(0.62, 0.01, 0.36);
  g.add(sun);
  return g;
}

/* ---- solar system ---- */
function buildSolar() {
  const g = new THREE.Group();
  const bodies = [];

  const sunMat = new THREE.ShaderMaterial({
    vertexShader:VERT, fragmentShader:SUN_FRAG, transparent:true,
    uniforms:{ uMap:{value:flat(0xffb457)}, uFade:{value:1}, uHasMap:{value:0} }
  });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 24), sunMat);
  g.add(sunMesh);
  bodies.push({ data:SUN, mesh:sunMesh, geomR:0.075 });

  // The ladder already lies about distance, so a physical inverse-square on top
  // of a log-compressed radius produces nonsense. decay 0.
  const sunPoint = new THREE.PointLight(0xfff2dd, 2.6, 0, 0);
  g.add(sunPoint);

  const mats = {};
  for (const p of PLANETS) {
    const A = Math.log10(1 + p.aAU * 9) * 0.62;      // log spacing or the inner
    const b = A * Math.sqrt(1 - p.e * p.e);          // planets are one pixel
    const orbit = new THREE.Group();

    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const th = (i/160)*Math.PI*2;
      pts.push(Math.cos(th)*A - A*p.e, 0, Math.sin(th)*b);
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    orbit.add(new THREE.Line(og, new THREE.LineBasicMaterial({ color:CY, transparent:true, opacity:0.16 })));

    const mat = new THREE.MeshStandardMaterial({ color:p.col, roughness:0.92, metalness:0 });
    mats[p.key] = mat;
    const m = new THREE.Mesh(new THREE.SphereGeometry(p.drawR, TIER.pSeg, TIER.pSeg), mat);
    orbit.add(m);
    if (p.atmo) { const a = atmosphere(p.drawR * 1.05, p.atmo[0], p.atmo[1], p.atmo[2]); m.add(a); }

    if (p.ring) {
      const rg = new THREE.RingGeometry(p.drawR * 1.35, p.drawR * 2.25, 96, 1);
      // RingGeometry's default UVs are planar over the bounding box, so the
      // alpha strip maps wrongly. Rewrite u to run with radius.
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      const ri = p.drawR * 1.35, ro = p.drawR * 2.25;
      for (let i = 0; i < pos.count; i++) {
        const rr = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (rr - ri) / (ro - ri), 0.5);
      }
      const ringMat = new THREE.MeshBasicMaterial({
        color:0xd8c9a6, side:THREE.DoubleSide, transparent:true, opacity:0.85, depthWrite:false });
      const ring = new THREE.Mesh(rg, ringMat);
      ring.rotation.x = Math.PI / 2 - 0.12;
      m.add(ring);
      mats.__ring = ringMat;
    }

    g.add(orbit);
    bodies.push({ data:p, mesh:m, geomR:p.drawR, orbit, A, b, e:p.e, periodD:p.periodD });
  }

  // Moons. Real periods drive phase; radii are log-compressed so Callisto does
  // not sit outside Earth's orbit and Io is not inside Jupiter's disc. Rank
  // order is preserved, and because the periods are real the Laplace resonance
  // (Io : Europa : Ganymede = 1 : 2 : 4) is actually visible.
  for (const mo of MOONS) {
    const parent = bodies.find(b => b.data.key === mo.parent);
    if (!parent) continue;
    const ratio = mo.aKm / parent.data.radiusKm;
    const r = parent.geomR * (1.6 + 2.4 * Math.log10(1 + ratio / 3));
    const mat = new THREE.MeshStandardMaterial({ color:mo.col, roughness:1, metalness:0 });
    mats[mo.key] = mat;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(parent.geomR * 0.20, 14, 10), mat);
    parent.mesh.add(mesh);

    const pts = [];
    for (let i = 0; i <= 72; i++) { const th=(i/72)*Math.PI*2; pts.push(Math.cos(th)*r, 0, Math.sin(th)*r); }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    parent.mesh.add(new THREE.Line(og, new THREE.LineBasicMaterial({ color:WH, transparent:true, opacity:0.13 })));

    bodies.push({ data:mo, mesh, geomR:parent.geomR*0.20, moonR:r, periodD:mo.periodD, drawnRatio:(1.6+2.4*Math.log10(1+ratio/3)), trueRatio:ratio });
  }

  bodiesByStage.solar = bodies;
  g.userData.mats = mats;
  g.userData.sunMat = sunMat;
  applyTex.solar = (slot, tex) => {
    if (slot === 'sun') { sunMat.uniforms.uMap.value = tex; sunMat.uniforms.uHasMap.value = 1; return; }
    const m = mats[slot];
    if (m) { m.map = tex; m.color.set(0xffffff); m.needsUpdate = true; }
  };
  revert.solar = () => {
    for (const p of PLANETS) if (mats[p.key]) { mats[p.key].map = null; mats[p.key].color.set(p.col); mats[p.key].needsUpdate = true; }
    for (const mo of MOONS) if (mats[mo.key]) { mats[mo.key].map = null; mats[mo.key].color.set(mo.col); mats[mo.key].needsUpdate = true; }
    sunMat.uniforms.uHasMap.value = 0;
  };
  return g;
}

/* ---- Earth ---- */
function buildEarth() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, TIER.segW, TIER.segH);
  const mat = new THREE.ShaderMaterial({
    vertexShader:VERT, fragmentShader:EARTH_FRAG, transparent:true,
    uniforms:{
      uDay:{value:flat(0x1b3d55)}, uNight:{value:flat(0x000000)}, uOcean:{value:flat(0x000000)},
      uSunDir:{value:new THREE.Vector3(-1,0,0)},
      uHasNight:{value:0}, uHasOcean:{value:0}, uFade:{value:1}
    }
  });
  const globe = new THREE.Mesh(geo, mat);
  g.add(globe);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.006, TIER.segW, Math.max(16, TIER.segH >> 1)),
    new THREE.MeshPhongMaterial({ color:0xffffff, specular:0x000000, shininess:0,
      transparent:true, opacity:0, depthWrite:false }));
  clouds.renderOrder = 1;
  g.add(clouds);
  g.add(atmosphere(1.028, 0x2a5fbf, 0x8fb6ff, 3.2));

  const moonMat = new THREE.MeshStandardMaterial({ color:0xbdb8ae, roughness:1 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), moonMat);
  moon.position.set(2.6, 0.15, -0.7);
  g.add(moon);

  bodiesByStage.earth = [
    { data:PLANETS.find(p=>p.key==='earth'), mesh:globe, geomR:1 },
    { data:MOONS.find(m=>m.key==='moon'), mesh:moon, geomR:0.27 }
  ];
  g.userData = { mat, clouds, moonMat };
  applyTex.earth = (slot, tex) => {
    if (slot === 'clouds') { clouds.material.alphaMap = tex; clouds.material.needsUpdate = true; tweenMeshBase(clouds, 0.92, 700); return; }
    mat.uniforms[slot].value = tex;
    if (slot === 'uNight') tweenUniform(mat.uniforms.uHasNight, 1, 600);
    if (slot === 'uOcean') tweenUniform(mat.uniforms.uHasOcean, 1, 400);
  };
  revert.earth = () => {
    mat.uniforms.uDay.value = flat(0x1b3d55);
    mat.uniforms.uHasNight.value = 0; mat.uniforms.uHasOcean.value = 0;
    clouds.material.alphaMap = null; clouds.userData.base = 0; clouds.material.opacity = 0; clouds.material.needsUpdate = true;
  };
  return g;
}

/* ---- small scales ---- */
function buildHuman() {
  const g = new THREE.Group(), body = [];
  for (let i = 0; i <= 200; i++) {
    const t = i/200, y = -1 + t*1.55;
    body.push(0.52*(0.62+0.38*Math.sin(t*6.2832+0.4))*(1-0.25*t), y, 0);
  }
  for (let i = 200; i >= 0; i--) body.push(-body[i*3], body[i*3+1], 0);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(body, 3));
  g.add(new THREE.Line(bg, new THREE.LineBasicMaterial({ color:AM, transparent:true, opacity:0.9 })));
  const extra = [0,0.55,0, 0,1.35,0];
  for (let s = 0; s < 4; s++) { const x = -0.06 + s*0.04; extra.push(x,1.3,0.02, x,-0.7,0.02); }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(extra, 3));
  g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:WH, transparent:true, opacity:0.5 })));
  return g;
}

function buildCell() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 40), new THREE.MeshBasicMaterial({ color:CY, wireframe:true, transparent:true, opacity:0.14 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24), new THREE.MeshBasicMaterial({ color:VI, transparent:true, opacity:0.30 })));
  const org = [];
  for (let i = 0; i < 90; i++) {
    const r = 0.42 + Math.random()*0.48, th = Math.random()*6.2832, ph = Math.acos(rnd(1));
    org.push(Math.sin(ph)*Math.cos(th)*r, Math.cos(ph)*r, Math.sin(ph)*Math.sin(th)*r);
  }
  g.add(points(org, 0.05, AM, 0.55));
  return g;
}

function buildDNA() {
  const g = new THREE.Group(), a = [], b = [], rung = [];
  for (let i = 0; i <= 300; i++) {
    const t = i/300, y = -1.25 + t*2.5, th = t*Math.PI*2*3.2;
    const x1 = Math.cos(th)*0.34, z1 = Math.sin(th)*0.34;
    const x2 = Math.cos(th+Math.PI)*0.34, z2 = Math.sin(th+Math.PI)*0.34;
    a.push(x1,y,z1); b.push(x2,y,z2);
    if (i % 9 === 0) rung.push(x1,y,z1, x2,y,z2);
  }
  for (const [arr,col] of [[a,CY],[b,AM]]) {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.add(new THREE.Line(gg, new THREE.LineBasicMaterial({ color:col, transparent:true, opacity:0.9 })));
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rung, 3));
  g.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color:WH, transparent:true, opacity:0.35 })));
  return g;
}

/* 2p_z orbital: radial part r*exp(-r/2) times cos^2(theta). The node AT the
   nucleus is the physically interesting feature, and a cos-power fudge does not
   produce one. */
function buildAtom() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 18), new THREE.MeshBasicMaterial({ color:AM })));
  const cloud = [];
  let guard = 0;
  while (cloud.length < 4200*3 && guard < 400000) {
    guard++;
    const r = Math.random()*2.6, th = Math.random()*6.2832, ct = rnd(1);
    const st = Math.sqrt(1-ct*ct);
    const psi2 = r*r * Math.exp(-r) * ct*ct;     // |psi|^2 * r^2 dr
    if (Math.random() * 0.55 > psi2) continue;
    const s = 0.42;
    cloud.push(st*Math.cos(th)*r*s, ct*r*s, st*Math.sin(th)*r*s);
  }
  g.add(points(cloud, 0.014, CY, 0.38));
  g.userData.cloud = g.children[1];
  return g;
}

/* Carbon-12: 6 protons, 6 neutrons. Twelve labelled nucleons is a fact;
   twenty-six unlabelled ones was decoration. */
function buildNucleus() {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const r = Math.pow(Math.random(), 0.4)*0.52, th = Math.random()*6.2832, ph = Math.acos(rnd(1));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.20, 18, 18),
      new THREE.MeshStandardMaterial({ color: i < 6 ? CY : AM, roughness:0.75 }));
    m.position.set(Math.sin(ph)*Math.cos(th)*r, Math.cos(ph)*r, Math.sin(ph)*Math.sin(th)*r);
    g.add(m);
  }
  return g;
}

function buildQuark() {
  const g = new THREE.Group();
  const cols = [0xff5f6d, 0x6fd3eb, 0xa37bff];
  const pos = [new THREE.Vector3(0,0.62,0), new THREE.Vector3(-0.58,-0.34,0.14), new THREE.Vector3(0.58,-0.34,-0.14)];
  const qs = [];
  pos.forEach((p,i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 20), new THREE.MeshBasicMaterial({ color:cols[i] }));
    m.position.copy(p); g.add(m); qs.push(m);
  });
  const tube = new THREE.BufferGeometry();
  // 3 pairs x 40 segments x 2 vertices x 3 components. Sizing this by eye
  // truncated the flux tubes to a single thread.
  tube.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3*40*2*3), 3));
  g.add(new THREE.LineSegments(tube, new THREE.LineBasicMaterial({ color:WH, transparent:true, opacity:0.75, blending:THREE.AdditiveBlending })));
  g.userData = { qs, tube };
  return g;
}

const BUILD = { universe:buildUniverse, galaxy:buildGalaxy, solar:buildSolar, earth:buildEarth,
                human:buildHuman, cell:buildCell, dna:buildDNA, atom:buildAtom,
                nucleus:buildNucleus, quark:buildQuark };

for (const st of STAGES) {
  const g = BUILD[st.key]();
  g.visible = false;
  groups[st.key] = g;
  root.add(g);
}

/* ---------------------------------------------------------------------------
   5  FADE
   ShaderMaterial does not respond to .opacity at all, so every custom shader
   carries a uFade uniform. Missing this leaves Earth at full opacity across the
   entire ladder while everything else fades.
   -------------------------------------------------------------------------*/
function setOpacity(g, o) {
  g.traverse(n => {
    const m = n.material; if (!m) return;
    if (m.uniforms && m.uniforms.uFade) { m.uniforms.uFade.value = o; return; }
    if (n.userData.base === undefined) n.userData.base = m.opacity === undefined ? 1 : m.opacity;
    m.transparent = true;
    m.opacity = n.userData.base * o;
  });
}

const tweens = [];
function tweenUniform(u, to, ms) { tweens.push({ get:()=>u.value, set:v=>u.value=v, from:u.value, to, t:0, ms }); }
/* Tween the MESH's cached base, not material.opacity. setOpacity() caches
   userData.base on the mesh and rewrites material.opacity every frame as
   base * fade -- so tweening the material directly is overwritten on the very
   next frame. The clouds stayed invisible for exactly this reason. */
function tweenMeshBase(mesh, to, ms) {
  if (mesh.userData.base === undefined) mesh.userData.base = mesh.material.opacity || 0;
  tweens.push({ set:v => { mesh.userData.base = v; }, from: mesh.userData.base, to, t:0, ms });
}
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    w.t += dt * 1000;
    const k = Math.min(1, w.t / w.ms);
    w.set(w.from + (w.to - w.from) * (1 - Math.pow(1 - k, 3)));
    if (k >= 1) tweens.splice(i, 1);
  }
}

/* ---------------------------------------------------------------------------
   6  SCALE READOUT
   -------------------------------------------------------------------------*/
let scale = 0.2, target = 0.2, t = 0;
const SI = [[1e24,'Ym'],[1e21,'Zm'],[1e18,'Em'],[1e15,'Pm'],[1e12,'Tm'],[1e9,'Gm'],
            [1e6,'Mm'],[1e3,'km'],[1,'m'],[1e-3,'mm'],[1e-6,'µm'],[1e-9,'nm'],
            [1e-12,'pm'],[1e-15,'fm'],[1e-18,'am']];
function human(logm) {
  const v = Math.pow(10, logm);
  for (const [f,u] of SI) if (v >= f) {
    const n = v/f;
    return (n>=100?n.toFixed(0):n>=10?n.toFixed(1):n.toFixed(2)) + ' ' + u;
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
    provEl.dataset.kind = st.prov[0];
    provEl.textContent = st.prov[0] === 'observed' ? 'Observed' : 'Model';
    provEl.title = st.prov[1];
    renderChips(st.key);
    onStageChange(st);
  }
  readout.textContent = human(scale);
  readout.dataset.exp = '10^' + scale.toFixed(1) + ' m';
}

/* ---------------------------------------------------------------------------
   7  CAMERA — orbit about the origin
   Every stage is modelled around the origin, so this needs yaw/pitch/distance
   and nothing else. That is why it is 60 lines and OrbitControls is 1200.
   -------------------------------------------------------------------------*/
const cam = { yaw:0, pitch:0.20, dist:3.4, tYaw:0, tPitch:0.20, tDist:3.4 };
const PITCH_LIM = 1.45;
const GRACE = 4000;
let lastTouched = -1e9;
const pointers = new Map();
let dragId = null, lastX = 0, lastY = 0, dragPx = 0, pinchD = 0;

function touched() { lastTouched = performance.now(); }
function applyCamera(dt) {
  const k = reduced ? 1 : Math.min(1, dt * 9);
  cam.yaw += (cam.tYaw - cam.yaw)*k;
  cam.pitch += (cam.tPitch - cam.pitch)*k;
  cam.dist += (cam.tDist - cam.dist)*k;
  const cp = Math.cos(cam.pitch);
  camera.position.set(Math.sin(cam.yaw)*cp*cam.dist, Math.sin(cam.pitch)*cam.dist, Math.cos(cam.yaw)*cp*cam.dist);
  camera.lookAt(0,0,0);
}
function dolly(f) {
  const st = nearest(scale);
  cam.tDist = Math.max(st.distMin || 1.6, Math.min(st.distMax || 8, cam.tDist * f));
  touched();
}
function onStageChange(st) {
  // The ladder owns framing; the user borrows it. Without this you can point
  // the camera at nothing, scroll four decades, and arrive at a black screen.
  if (performance.now() - lastTouched > GRACE) { cam.tYaw = 0; cam.tPitch = 0.20; }
  cam.tDist = Math.max(st.distMin || 1.6, Math.min(st.distMax || 8, cam.tDist));
  closePanel();
}

host.addEventListener('pointerdown', e => {
  host.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pointers.size === 1) { dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY; dragPx = 0; }
  if (pointers.size === 2) { dragId = null; pinchD = spread(); }
});
host.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { hoverEvent = e; return; }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const d = spread(); if (pinchD > 0) dolly(pinchD/d); pinchD = d; return; }
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  dragPx += Math.abs(dx) + Math.abs(dy);
  cam.tYaw -= dx*0.006;
  cam.tPitch = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, cam.tPitch + dy*0.006));
  touched();
});
function endPointer(e) {
  const wasDrag = e.pointerId === dragId;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchD = 0;
  if (!wasDrag) return;
  dragId = null;
  // Under the slop threshold it was a click, not an orbit.
  if (dragPx < 6) clickAt(e.clientX, e.clientY);
}
host.addEventListener('pointerup', endPointer);
host.addEventListener('pointercancel', endPointer);
function spread() { const v = [...pointers.values()]; return Math.hypot(v[0].x-v[1].x, v[0].y-v[1].y); }

host.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.shiftKey) dolly(1 + Math.sign(e.deltaY)*0.08);
  else setTarget(target - e.deltaY*0.004);
}, { passive:false });

/* ---------------------------------------------------------------------------
   8  PICKING — analytic ray/sphere
   Not proxy meshes: r185's raycaster does NOT skip invisible objects, so
   proxies belonging to a faded-out stage stay hittable and you get phantom
   clicks on Jupiter while looking at a cell. Everything clickable here is a
   sphere, so the whole problem is one line of algebra.
   -------------------------------------------------------------------------*/
const HIT_PX = 22;
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function pxToWorld(px, dist) {
  const fh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  return fh * (px / Math.max(1, host.clientHeight));
}
function raySphere(ro, rd, c, r) {
  const ox=ro.x-c.x, oy=ro.y-c.y, oz=ro.z-c.z;
  const b = ox*rd.x + oy*rd.y + oz*rd.z;
  const cc = ox*ox + oy*oy + oz*oz - r*r;
  const h = b*b - cc;
  if (h < 0) return -1;
  const t0 = -b - Math.sqrt(h);
  return t0 >= 0 ? t0 : (-b + Math.sqrt(h) >= 0 ? 0 : -1);
}
function pick(cx, cy) {
  const bodies = bodiesByStage[shownKey];
  if (!bodies || !bodies.length) return null;
  root.updateMatrixWorld(true);
  const r = host.getBoundingClientRect();
  const nx =  ((cx - r.left)/r.width)*2 - 1;
  const ny = -((cy - r.top)/r.height)*2 + 1;
  _o.copy(camera.position);
  _d.set(nx, ny, 0.5).unproject(camera).sub(_o).normalize();

  let best = null, bestD2 = Infinity;
  for (const b of bodies) {
    b.mesh.getWorldPosition(_c);
    b.mesh.getWorldScale(_s);
    const trueR = b.geomR * _s.x;
    const hitR = Math.max(trueR, pxToWorld(HIT_PX, _o.distanceTo(_c)));
    if (raySphere(_o, _d, _c, hitR) < 0) continue;
    // Rank by screen distance, not nearest-along-ray: at solar zoom Jupiter's
    // 22px disc swallows Io's and nearest-hit always returns Jupiter.
    _p.copy(_c).project(camera);
    const dx = (_p.x - nx)*r.width*0.5, dy = (_p.y - ny)*r.height*0.5;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD2) { bestD2 = d2; best = b; }
  }
  return best;
}

/* one shared reticle for hover AND keyboard focus — one draw call, one path */
const reticle = (() => {
  const pts = [];
  for (let i = 0; i <= 96; i++) { const a=(i/96)*Math.PI*2; pts.push(Math.cos(a), Math.sin(a), 0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color:CY, transparent:true, opacity:0.9, depthTest:false }));
  l.renderOrder = 100; l.visible = false;
  scene.add(l);
  return l;
})();

let hoverEvent = null, hovered = null;
function updateHover() {
  if (hoverEvent) {
    hovered = pick(hoverEvent.clientX, hoverEvent.clientY);
    hoverEvent = null;
    host.style.cursor = hovered ? 'pointer' : 'grab';
  }
  const showFor = hovered || focusedBody;
  if (!showFor) { reticle.visible = false; return; }
  showFor.mesh.getWorldPosition(_c);
  showFor.mesh.getWorldScale(_s);
  const rr = Math.max(showFor.geomR * _s.x, pxToWorld(HIT_PX, camera.position.distanceTo(_c))) * 1.35;
  reticle.position.copy(_c);
  reticle.scale.setScalar(rr);
  reticle.lookAt(camera.position);
  reticle.visible = true;
}

/* ---------------------------------------------------------------------------
   9  INFO PANEL  —  textContent only, never innerHTML
   -------------------------------------------------------------------------*/
let focusedBody = null, lastOpener = null;
const nf = new Intl.NumberFormat('en-US');

function openPanel(body, opener) {
  if (!body) return;
  focusedBody = body; lastOpener = opener || null;
  const d = body.data;
  panel.hidden = false;
  document.getElementById('body-name').textContent = d.name;

  const facts = document.getElementById('body-facts');
  facts.replaceChildren();
  const rows = factRows(d);
  // The one place a reader could be misled by the picture, so it is stated.
  if (body.trueRatio) {
    rows.push(['Drawn at', body.drawnRatio.toFixed(1) + ' parent radii (true: '
      + body.trueRatio.toFixed(1) + ') — log-compressed for visibility']);
  }
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    facts.append(dt, dd);
  }
  document.getElementById('body-note').textContent = d.note || '';
  document.getElementById('body-close').focus();
}
function closePanel() {
  if (panel.hidden) return;
  panel.hidden = true;
  focusedBody = null;
  if (lastOpener && lastOpener.focus) lastOpener.focus();
  lastOpener = null;
}
document.getElementById('body-close').addEventListener('click', closePanel);

function clickAt(cx, cy) {
  const b = pick(cx, cy);
  if (b) openPanel(b, null); else closePanel();
}

/* Body chips: the keyboard path, and honestly the fastest way to reach Titan
   for anyone. Nothing else on the page tells you the planets are clickable. */
function renderChips(key) {
  chipsEl.replaceChildren();
  const bodies = bodiesByStage[key];
  if (!bodies) { chipsEl.hidden = true; return; }
  chipsEl.hidden = false;
  for (const b of bodies) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'body-chip'; btn.textContent = b.data.name;
    btn.addEventListener('click', () => openPanel(b, btn));
    btn.addEventListener('focus', () => { hovered = b; });
    btn.addEventListener('blur', () => { if (hovered === b) hovered = null; });
    chipsEl.appendChild(btn);
  }
}

/* ---------------------------------------------------------------------------
   10  FRAME
   -------------------------------------------------------------------------*/
let raf = 0, running = false, lastT = 0;
const PREFETCH = 3.4, DISPOSE_SPAN = 3.0, IDLE_DISPOSE = 8000;

function updateStages(now) {
  for (const st of STAGES) {
    const g = groups[st.key];
    const d = Math.abs(scale - st.at);
    const vis = Math.max(0, 1 - d/2.2);
    g.visible = vis > 0.004;

    if (d < PREFETCH) { st.lastSeen = now; requestStage(st.key); }
    else if (d > DISPOSE_SPAN && now - (st.lastSeen || 0) > IDLE_DISPOSE && st.requested) {
      disposeStage(st.key);
    }
    if (!g.visible) continue;
    setOpacity(g, Math.pow(vis, 1.6));
    g.scale.setScalar(Math.pow(2, (st.at - scale) * 0.55));
    g.rotation.y = t * (st.spin === undefined ? 0.05 : st.spin) + (st.at - scale) * 0.02;
    g.rotation.x = st.tilt || 0;
  }
}

function animateContents(dt) {
  const solar = groups.solar, earth = groups.earth, quark = groups.quark, atom = groups.atom;

  if (solar.visible) {
    const bodies = bodiesByStage.solar;
    for (const b of bodies) {
      if (b.A !== undefined) {
        const M = (t * 0.06 / (b.periodD / 365.256)) * Math.PI * 2;
        const E = kepler(M % 6.2832, b.e);
        b.mesh.position.set(Math.cos(E)*b.A - b.A*b.e, 0, Math.sin(E)*b.b);
      } else if (b.moonR !== undefined) {
        const th = (t * 0.6 / (b.periodD / 27.3)) % 6.2832;
        b.mesh.position.set(Math.cos(th)*b.moonR, 0, Math.sin(th)*b.moonR);
      }
    }
  }

  if (earth.visible) {
    const u = earth.userData;
    // The terminator sweeps: a static one makes the night lights look painted on.
    // start near-frontally lit (the framing every Blue Marble frame uses),
    // then let the terminator drift
    const a = 2.05 + t * 0.05;
    const dir = new THREE.Vector3(-Math.cos(a), -0.16, -Math.sin(a)).normalize();
    u.mat.uniforms.uSunDir.value.copy(dir);
    earth.traverse(n => { if (n.material && n.material.uniforms && n.material.uniforms.uSunDir) n.material.uniforms.uSunDir.value.copy(dir); });
    sunLight.position.copy(dir).multiplyScalar(-6);
    u.clouds.rotation.y += dt * 0.011;       // clouds lead the surface
  }

  if (atom.visible && atom.userData.cloud) {
    atom.userData.cloud.rotation.y = t * 0.35;
    atom.userData.cloud.rotation.x = Math.sin(t*0.2)*0.3;
  }

  if (quark.visible) {
    const { qs, tube } = quark.userData;
    const arr = tube.attributes.position.array;
    let i = 0;
    for (let a = 0; a < 3; a++) {
      const A = qs[a].position, B = qs[(a+1)%3].position;
      for (let s = 0; s < 40; s++) {
        for (const p of [s/40, (s+1)/40]) {
          const w = Math.sin(p*Math.PI)*0.16;
          arr[i++] = A.x + (B.x-A.x)*p + Math.sin(t*6 + p*9 + a)*w;
          arr[i++] = A.y + (B.y-A.y)*p + Math.cos(t*5 + p*8 + a)*w;
          arr[i++] = A.z + (B.z-A.z)*p + Math.sin(t*7 + p*7 + a)*w;
        }
      }
    }
    tube.attributes.position.needsUpdate = true;
  }
}

function frame(now) {
  if (!running) return;
  let dt = (now - lastT)/1000; lastT = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;
  t += dt;

  scale += (target - scale) * Math.min(1, dt*6);
  drainUploads();
  stepTweens(dt);
  updateStages(now);
  animateContents(dt);
  applyCamera(dt);
  updateHover();
  paint();
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}

function start() { if (running || reduced) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); }
function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

/* Reduced motion: one frame, re-scheduled while uploads are pending so a
   texture that lands after the first paint is not stranded. */
let staticPending = false;
function renderOnce() {
  staticPending = false;
  drainUploads();
  stepTweens(0.016);
  updateStages(performance.now());
  animateContents(0);
  applyCamera(1);
  updateHover();
  paint();
  renderer.render(scene, camera);
  if (uploadQ.length || tweens.length) scheduleStatic();
}
function scheduleStatic() {
  if (staticPending) return;
  staticPending = true;
  requestAnimationFrame(renderOnce);
}

/* ---------------------------------------------------------------------------
   11  INPUT
   -------------------------------------------------------------------------*/
function setTarget(v) {
  target = Math.max(MIN, Math.min(MAX, v));
  slider.value = String(target);
  if (reduced) { scale = target; scheduleStatic(); }
}
slider.addEventListener('input', () => setTarget(parseFloat(slider.value)));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!panel.hidden) closePanel();
    else { cam.tYaw = 0; cam.tPitch = 0.20; touched(); }
    return;
  }
  if (e.target && /^(INPUT|BUTTON|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setTarget(target + 0.5); e.preventDefault(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setTarget(target - 0.5); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') dolly(0.9);
  if (e.key === '-') dolly(1.1);
});
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
  const st = STAGES.find(s => s.key === b.dataset.goto);
  if (st) setTarget(st.at);
}));
document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
window.addEventListener('resize', () => { resize(); if (reduced) scheduleStatic(); });

/* ---------------------------------------------------------------------------
   12  BOOT
   -------------------------------------------------------------------------*/
slider.min = String(MIN); slider.max = String(MAX); slider.step = '0.01';
resize();
setTarget(0.2); scale = 0.2;
if (statusEl) statusEl.remove();
if (reduced) scheduleStatic(); else start();
