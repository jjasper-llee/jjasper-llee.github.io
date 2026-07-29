/* ============================================================================
   SCALE — data
   Pure data, no three.js import. Every number here is real.

   `moons` carries an as-of year, because the count is not a constant: Saturn
   went from 83 to 146 in a single 2023 announcement. A page that hardcodes a
   number ages badly and silently.
   ========================================================================= */

/* `at` is log10(metres) of the thing being shown.
   `prov` is the provenance chip. This is the honest core of the page: cyan
   OBSERVED means a real instrument recorded it; amber MODEL means it is
   inferred or drawn, and says why. */
export const STAGES = [
  { key:'universe', at: 26.7, name:'Observable Universe', distMin:2.2, distMax:6.0,
    blurb:'93 billion light-years across. The filaments are galaxy superclusters — the largest structures that exist.',
    prov:['model','Large-scale structure from redshift surveys (SDSS, 2dF) and N-body simulation. The filaments are inferred from galaxy positions, not imaged.'] },

  { key:'galaxy', at: 21.0, tilt: 1.02, distMin:2.0, distMax:6.0, name:'The Milky Way',
    blurb:'100,000 light-years. Roughly 200 billion stars. The Sun sits about two-thirds out, on the Orion Arm.',
    prov:['model','No photograph of the Milky Way from outside exists, and none can — we are inside it. Structure inferred from 21 cm hydrogen surveys and Gaia parallaxes.'] },

  { key:'solar', at: 13.0, tilt: 1.02, distMin:2.0, distMax:7.0, name:'Solar System',
    blurb:'Planet maps from NASA imagery. Positions from Keplerian elements, solved live — no data feed, no network.',
    prov:['observed','Planet and moon surface maps from NASA missions, via Solar System Scope (CC BY 4.0). Orbit radii are log-compressed to fit the frame; the panel says so for each body.'] },

  { key:'earth', at: 7.0, distMin:1.75, distMax:5.0, name:'Earth',
    blurb:'12,742 km. Everything anyone has ever done happened here.',
    prov:['observed','Surface from MODIS Blue Marble. Night lights are a cloud-free VIIRS composite — no single photograph shows the whole night side lit at once.'] },

  { key:'human', at: 0.2, distMin:2.0, distMax:6.0, name:'Human Scale',
    blurb:'A cello is about 1.2 m. This is the only rung on the ladder our senses evolved for.',
    prov:['observed','Photographed in the shop. A cello is about 1.2 m end to end.'] },

  { key:'cell', at: -5.0, distMin:2.0, distMax:6.0, name:'C2C12 Muscle Cell',
    blurb:'C2C12 myotubes — the mouse muscle line Jasper works with. Myoblasts fuse into long multinucleated fibres; micro-topography is what makes them grow aligned.',
    prov:['model','Morphology from published C2C12 differentiation studies: multinucleated tubes, sarcomere striation, contact-guided alignment on a grooved substrate. Not a micrograph.'] },

  { key:'dna', at: -8.3, distMin:2.0, distMax:6.0, name:'DNA',
    blurb:'2 nm wide, one full turn every 3.4 nm. Two metres of it is coiled inside almost every cell you have.',
    prov:['model','B-form double helix from X-ray crystallography. The only direct images of DNA are diffraction patterns, not pictures of a molecule.'] },

  { key:'atom', at:-10.0, distMin:2.0, distMax:6.0, name:'Atom',
    blurb:'~0.1 nm. Almost entirely empty — the electron cloud is a probability, not a shell.',
    prov:['model','|ψ|² for a 2p orbital. Scanning tunnelling microscopy images charge density at a surface; nothing images an atom’s interior.'] },

  { key:'nucleus', at:-14.0, distMin:2.0, distMax:6.0, name:'Nucleus',
    blurb:'~10 fm. If the atom were a stadium, this would be a marble on the centre spot.',
    prov:['model','Nucleon packing from the liquid-drop and shell models. No instrument has ever imaged a nucleus; its radius is measured by electron scattering.'] },

  { key:'quark', at:-18.0, spin:0.015, distMin:2.0, distMax:6.0, name:'Quarks & Gluons',
    blurb:'Below 1 am. Quarks are never found alone — pull two apart and the gluon field makes new ones.',
    prov:['model','Lattice-QCD flux-tube picture. A free quark has never been observed and, under confinement, cannot be.'] }
];

/* a = semi-major axis (AU), e = eccentricity, periodD = sidereal period (days),
   rotationD = sidereal rotation (days; negative = retrograde). */
export const PLANETS = [
  { key:'mercury', name:'Mercury', tex:'mercury', col:0x9a8f86, radiusKm:2439.7, massKg:3.301e23,
    aAU:0.387098, e:0.20563, periodD:87.969,  rotationD:58.646,  moons:0, drawR:0.016,
    note:'Its solar day — sunrise to sunrise — is 176 Earth days, exactly two Mercury years. It rotates three times for every two orbits.' },
  { key:'venus', name:'Venus', tex:'venus', col:0xd9b382, radiusKm:6051.8, massKg:4.867e24,
    aAU:0.723332, e:0.00677, periodD:224.701, rotationD:-243.02, moons:0, drawR:0.026, atmo:[0xb08a4a,0xf0dcae,2.4],
    note:'Surface temperature 464 °C, hot enough to melt lead, under 92 atmospheres of CO₂. It rotates backwards, and slower than it orbits.' },
  { key:'earth', name:'Earth', tex:'earth_day', col:0x6fd3eb, radiusKm:6371.0, massKg:5.972e24,
    aAU:1.000000, e:0.01671, periodD:365.256, rotationD:0.99727, moons:1, drawR:0.027, atmo:[0x2a5fbf,0x8fb6ff,3.2],
    note:'The only place on this entire ladder where anything is known to be alive.' },
  { key:'mars', name:'Mars', tex:'mars', col:0xc1613a, radiusKm:3389.5, massKg:6.417e23,
    aAU:1.523679, e:0.09339, periodD:686.980, rotationD:1.02595, moons:2, drawR:0.020,
    note:'Olympus Mons stands 21.9 km above the datum — two and a half Everests, on a planet with half Earth’s radius.' },
  { key:'jupiter', name:'Jupiter', tex:'jupiter', col:0xd7b489, radiusKm:69911, massKg:1.898e27,
    aAU:5.20260, e:0.04839, periodD:4332.59, rotationD:0.41354, moons:{n:95,asOf:2023}, drawR:0.062,
    note:'The Great Red Spot has been under continuous observation since 1830, and probably since 1665. It is wider than Earth.' },
  { key:'saturn', name:'Saturn', tex:'saturn', col:0xe3cfa0, radiusKm:58232, massKg:5.683e26,
    aAU:9.55491, e:0.05386, periodD:10759.2, rotationD:0.44401, moons:{n:146,asOf:2023}, drawR:0.054, ring:true,
    note:'Mean density 0.687 g/cm³ — less than water. The rings are almost pure water ice and only about 10 m thick.' },
  { key:'uranus', name:'Uranus', tex:'uranus', col:0x9fdbe6, radiusKm:25362, massKg:8.681e25,
    aAU:19.2184, e:0.04726, periodD:30688.5, rotationD:-0.71833, moons:{n:28,asOf:2024}, drawR:0.038,
    note:'Its axis is tipped 97.8°, so it orbits on its side. Each pole gets 42 years of continuous sunlight, then 42 of dark.' },
  { key:'neptune', name:'Neptune', tex:'neptune', col:0x6b8ff0, radiusKm:24622, massKg:1.024e26,
    aAU:30.1104, e:0.00859, periodD:60195, rotationD:0.67125, moons:{n:16,asOf:2024}, drawR:0.037,
    note:'Winds of about 2,100 km/h, the fastest in the solar system, on a world receiving 1/900th of Earth’s sunlight.' }
];

/* No public texture set exists for the Galileans or Titan, and at solar framing
   they are 3-6 px anyway. Colours are mean albedo from Voyager/Galileo/Cassini
   photometry. */
export const MOONS = [
  { key:'moon', name:'The Moon', parent:'earth', tex:'moon', col:0xbdb8ae,
    radiusKm:1737.4, massKg:7.346e22, aKm:384400, periodD:27.322,
    note:'Receding at 3.8 cm a year — measured by bouncing lasers off the retroreflectors Apollo 11, 14 and 15 left behind.' },
  { key:'io', name:'Io', parent:'jupiter', col:0xc9a44a,
    radiusKm:1821.6, massKg:8.932e22, aKm:421700, periodD:1.769,
    note:'The most volcanically active body in the solar system — over 400 active volcanoes, driven by tidal flexing from Jupiter.' },
  { key:'europa', name:'Europa', parent:'jupiter', col:0xbfa98f,
    radiusKm:1560.8, massKg:4.800e22, aKm:671034, periodD:3.551,
    note:'A salt-water ocean beneath 15–25 km of ice, holding perhaps twice the water of every ocean on Earth combined.' },
  { key:'ganymede', name:'Ganymede', parent:'jupiter', col:0x8a7c6e,
    radiusKm:2634.1, massKg:1.482e23, aKm:1070412, periodD:7.155,
    note:'The largest moon in the solar system — bigger than Mercury — and the only one with a magnetic field of its own.' },
  { key:'callisto', name:'Callisto', parent:'jupiter', col:0x6b5f52,
    radiusKm:2410.3, massKg:1.076e23, aKm:1882709, periodD:16.689,
    note:'One of the most heavily cratered surfaces known. Essentially unchanged for four billion years.' },
  { key:'titan', name:'Titan', parent:'saturn', col:0xc98a3e,
    radiusKm:2574.7, massKg:1.345e23, aKm:1221870, periodD:15.945,
    note:'The only other body in the solar system with stable liquid on its surface — rivers, lakes and seas of methane and ethane.' }
];

export const SUN = {
  key:'sun', name:'The Sun', radiusKm:695700, massKg:1.989e30, rotationD:25.4,
  note:'Holds 99.86% of the mass of the solar system. Everything else here — every planet, moon, comet and grain of dust — is the remaining 0.14%.'
};

/* Which textures each stage needs, in priority order. prio 0 lands first, so on
   a slow link the Earth day map is not competing with the clouds. */
export const TEXTURES = {
  earth: [
    { slot:'uDay',   file:'earth_day',    sizes:{hi:4096,md:2048,lo:512}, prio:0 },
    { slot:'uNight', file:'earth_night',  sizes:{hi:4096,md:2048,lo:512}, prio:1 },
    { slot:'clouds', file:'earth_clouds', sizes:{hi:2048,md:1024,lo:0},   prio:2 },
    { slot:'uOcean', file:'earth_ocean',  sizes:{hi:1024,md:1024,lo:512}, prio:3, data:true },
    // The earth stage never requested this, so its Moon stayed a flat sphere.
    { slot:'moon',   file:'moon',         sizes:{hi:2048,md:1024,lo:512}, prio:4 }
  ],
  solar: [
    { slot:'sun',     file:'sun',     sizes:{hi:1024,md:1024,lo:512}, prio:0 },
    { slot:'earth',   file:'earth_day', sizes:{hi:1024,md:1024,lo:512}, prio:1 },
    { slot:'jupiter', file:'jupiter', sizes:{hi:1024,md:1024,lo:512}, prio:2 },
    { slot:'saturn',  file:'saturn',  sizes:{hi:1024,md:1024,lo:512}, prio:3 },
    { slot:'mars',    file:'mars',    sizes:{hi:1024,md:1024,lo:512}, prio:4 },
    { slot:'venus',   file:'venus',   sizes:{hi:1024,md:1024,lo:512}, prio:5 },
    { slot:'mercury', file:'mercury', sizes:{hi:1024,md:1024,lo:512}, prio:6 },
    { slot:'uranus',  file:'uranus',  sizes:{hi:1024,md:1024,lo:512}, prio:7 },
    { slot:'neptune', file:'neptune', sizes:{hi:1024,md:1024,lo:512}, prio:8 },
    { slot:'moon',    file:'moon',    sizes:{hi:1024,md:1024,lo:512}, prio:9 }
  ],
  galaxy: [ { slot:'sky', file:'milkyway', sizes:{hi:2048,md:1024,lo:1024}, prio:0 } ],
  human:  [ { slot:'cello', file:'cello', sizes:{hi:1400,md:1400,lo:700}, prio:0 } ]
};

/* Rows for the info panel. Formatting lives here; the data above stays raw. */
const nf = new Intl.NumberFormat('en-US');
function sci(x) {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = (x / Math.pow(10, e)).toFixed(3);
  return m + ' × 10' + String(e).replace(/[0-9-]/g, c => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]) + ' kg';
}

export function factRows(b) {
  const r = [];
  if (b.radiusKm) r.push(['Radius', nf.format(b.radiusKm) + ' km']);
  if (b.massKg)   r.push(['Mass', sci(b.massKg)]);
  if (b.aAU)      r.push(['Orbit radius', b.aAU.toFixed(3) + ' AU']);
  if (b.aKm)      r.push(['Orbit radius', nf.format(b.aKm) + ' km']);
  if (b.periodD)  r.push(['Orbital period',
    b.periodD >= 365 ? (b.periodD / 365.256).toFixed(2) + ' years' : b.periodD.toFixed(2) + ' days']);
  if (b.rotationD) r.push(['Day length',
    (Math.abs(b.rotationD) < 1 ? (Math.abs(b.rotationD) * 24).toFixed(1) + ' hours'
                               : Math.abs(b.rotationD).toFixed(2) + ' days')
    + (b.rotationD < 0 ? ' (retrograde)' : '')]);
  if (b.moons !== undefined) {
    r.push(['Moons', typeof b.moons === 'object'
      ? nf.format(b.moons.n) + ' known (as of ' + b.moons.asOf + ')'
      : String(b.moons)]);
  }
  return r;
}
