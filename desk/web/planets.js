/* planets.js — solar-system positions in the browser.
 * Planets: JPL approximate Keplerian elements (Standish, valid 1800–2050), geocentric, ~arcminute accuracy.
 * Moon: Schlyter's series with topocentric parallax, a few arcminutes.
 * Exposes window.Planets = { compute(date, lat, lon) -> [object...] }
 */
(function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, AU_KM = 149597870.7;
  const norm360 = (x) => ((x % 360) + 360) % 360;
  // a, e, I, L, long.peri, long.node  + rates per Julian century
  const EL = {
    Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    Venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    Mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    Uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  };
  const RADIUS = { Mercury: 2440, Venus: 6052, Mars: 3390, Jupiter: 69911, Saturn: 58232, Uranus: 25362, Neptune: 24622, Sun: 696000, Moon: 1737 };
  const INFO = {
    Sun: 'Our star. NEVER look at it without a proper full-aperture solar filter or a dedicated solar scope.',
    Moon: 'Best along the terminator, where shadows show relief. A polarizing or neutral-density filter tames the glare at low power.',
    Mercury: 'Only ever seen low in twilight; shows a tiny phase. Catch it near greatest elongation.',
    Venus: 'Dazzling; shows phases. Observe in twilight or daylight to cut the glare; a crescent is obvious at 60x.',
    Mars: 'Small most of the time; near opposition (every 26 months) the polar cap and dark markings appear at 150x+.',
    Jupiter: 'Cloud belts, the Great Red Spot and the four Galilean moons. Rewards patient viewing at 100–200x.',
    Saturn: 'The rings are obvious at 50x; Cassini division and moon Titan at 150x+.',
    Uranus: 'A tiny blue-green disk at 150x+; looks stellar at low power. Find it with a chart.',
    Neptune: 'Faint blue dot; needs 200x to tell it from a star. Triton visible in large scopes.',
  };
  function heliocentric(name, T) {
    const [b, r] = EL[name];
    const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = (b[2] + r[2] * T) * D2R, L = b[3] + r[3] * T, wb = b[4] + r[4] * T, om = (b[5] + r[5] * T) * D2R;
    const w = (wb - (b[5] + r[5] * T)) * D2R;
    let M = norm360(L - wb) * D2R; if (M > Math.PI) M -= 2 * Math.PI;
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 10; i++) { const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E)); E += dE; if (Math.abs(dE) < 1e-8) break; }
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(I), si = Math.sin(I);
    return {
      x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
      y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
    };
  }
  function eclToEq(x, y, z, T) {
    const eps = 23.43929111 * D2R;   // J2000 obliquity: inputs are J2000 ecliptic
    const ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps);
    const d = Math.hypot(x, ye, ze);
    return { ra: norm360(Math.atan2(ye, x) * R2D), dec: Math.asin(ze / d) * R2D, dist: d };
  }
  function moon(d, T, lat, lstDeg) {
    // Schlyter: d = days since 2000-01-00 (JD 2451543.5)
    const N = norm360(125.1228 - 0.0529538083 * d), i = 5.1454, w = norm360(318.0634 + 0.1643573223 * d), a = 60.2666, e = 0.054900, M = norm360(115.3654 + 13.0649929509 * d);
    const ws = norm360(282.9404 + 4.70935e-5 * d), Ms = norm360(356.0470 + 0.9856002585 * d);
    const Mr = M * D2R; let E = Mr + e * Math.sin(Mr) * (1 + e * Math.cos(Mr));
    for (let k = 0; k < 5; k++) E = E - (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv) * R2D, r = Math.hypot(xv, yv);
    const Nr = N * D2R, ir = i * D2R, vw = (v + w) * D2R;
    const xh = r * (Math.cos(Nr) * Math.cos(vw) - Math.sin(Nr) * Math.sin(vw) * Math.cos(ir));
    const yh = r * (Math.sin(Nr) * Math.cos(vw) + Math.cos(Nr) * Math.sin(vw) * Math.cos(ir));
    const zh = r * Math.sin(vw) * Math.sin(ir);
    let lon = Math.atan2(yh, xh) * R2D, lat0 = Math.atan2(zh, Math.hypot(xh, yh)) * R2D;
    const Ls = Ms + ws, Lm = M + w + N, D = Lm - Ls, F = Lm - N, s = (x) => Math.sin(x * D2R), c = (x) => Math.cos(x * D2R);
    lon += -1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D) - 0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms) - 0.015 * s(2 * F - 2 * D) + 0.011 * s(M - 4 * D);
    lat0 += -0.173 * s(F - 2 * D) - 0.055 * s(M - F - 2 * D) - 0.046 * s(M + F - 2 * D) + 0.033 * s(F + 2 * D) + 0.017 * s(2 * M + F);
    const rr = r - 0.58 * c(M - 2 * D) - 0.46 * c(2 * D);   // earth radii
    // the series is referred to the ecliptic of date: precess longitude back to J2000
    const lo = (lon - 1.39697 * T) * D2R, la = lat0 * D2R;
    const x = Math.cos(lo) * Math.cos(la), y = Math.sin(lo) * Math.cos(la), z = Math.sin(la);
    const eq = eclToEq(x, y, z, T);
    // topocentric correction (parallax up to ~1°)
    const mpar = Math.asin(1 / rr) * R2D, gclat = lat - 0.1924 * Math.sin(2 * lat * D2R), rho = 0.99833 + 0.00167 * Math.cos(2 * lat * D2R);
    const HA = (lstDeg - eq.ra) * D2R, g = Math.atan(Math.tan(gclat * D2R) / Math.cos(HA)) * R2D;
    const raT = eq.ra - mpar * rho * Math.cos(gclat * D2R) * Math.sin(HA) / Math.cos(eq.dec * D2R);
    const decT = g === 0 ? eq.dec : eq.dec - mpar * rho * Math.sin(gclat * D2R) * Math.sin((g - eq.dec) * D2R) / Math.sin(g * D2R);
    const elong = norm360(lon - Ls);  // Moon minus Sun ecliptic longitude
    const folded = elong > 180 ? 360 - elong : elong;
    return { ra: norm360(raT), dec: decT, distKm: rr * 6371.0, elong: folded, illum: (1 - Math.cos(elong * D2R)) / 2, waxing: elong < 180, phaseAngle: 180 - folded };
  }
  function lst(date, lon) {
    const jd = date.getTime() / 86400000 + 2440587.5, t = (jd - 2451545.0) / 36525;
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t + lon);
  }
  function magnitude(name, r, dl, i) {
    const l = 5 * Math.log10(r * dl);
    switch (name) {
      case 'Mercury': return -0.42 + l + 0.038 * i - 2.73e-4 * i * i + 2.0e-6 * i * i * i;
      case 'Venus': return -4.40 + l + 0.0009 * i + 2.39e-4 * i * i - 6.5e-7 * i * i * i;
      case 'Mars': return -1.52 + l + 0.016 * i;
      case 'Jupiter': return -9.40 + l + 0.005 * i;
      case 'Saturn': return -8.88 + l + 0.044 * i - 1.0;
      case 'Uranus': return -7.19 + l;
      case 'Neptune': return -6.87 + l;
    }
    return 0;
  }
  function compute(date, lat, lon) {
    const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545.0) / 36525, d = jd - 2451543.5;
    const earth = heliocentric('Earth', T);
    const out = [];
    const mk = (name, eq, extra) => ({ id: 'SOL-' + name, n: name, src: 'SOL', t: name === 'Sun' ? 'Sun' : name === 'Moon' ? 'Moon' : 'Planet', ra: +eq.ra.toFixed(4), dec: +eq.dec.toFixed(4), con: '', s: name, notes: INFO[name], ...extra });
    // Sun
    const sun = eclToEq(-earth.x, -earth.y, -earth.z, T);
    out.push(mk('Sun', sun, { mag: -26.7, maj: (2 * Math.asin(RADIUS.Sun / (sun.dist * AU_KM)) * R2D * 60), distAu: sun.dist }));
    // Moon
    const m = moon(d, T, lat, lst(date, lon));
    out.push(mk('Moon', m, { mag: +(-12.7 + 0.026 * m.phaseAngle + 4e-9 * Math.pow(m.phaseAngle, 4)).toFixed(1), maj: 2 * Math.asin(RADIUS.Moon / m.distKm) * R2D * 60, distKm: m.distKm, illum: m.illum, waxing: m.waxing, elong: m.elong }));
    for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      const h = heliocentric(name, T);
      const gx = h.x - earth.x, gy = h.y - earth.y, gz = h.z - earth.z;
      const eq = eclToEq(gx, gy, gz, T);
      const r = Math.hypot(h.x, h.y, h.z), dl = eq.dist, re = Math.hypot(earth.x, earth.y, earth.z);
      const cosI = (r * r + dl * dl - re * re) / (2 * r * dl), i = Math.acos(Math.max(-1, Math.min(1, cosI))) * R2D;
      const cosE = (re * re + dl * dl - r * r) / (2 * re * dl), elong = Math.acos(Math.max(-1, Math.min(1, cosE))) * R2D;
      out.push(mk(name, eq, { mag: +magnitude(name, r, dl, i).toFixed(1), maj: 2 * Math.asin(RADIUS[name] / (dl * AU_KM)) * R2D * 60, distAu: dl, illum: (1 + Math.cos(i * D2R)) / 2, elong, phaseAngle: i }));
    }
    for (const o of out) o.maj = +o.maj.toFixed(3);
    return out;
  }
  // constellation from J2000 RA/Dec using the Roman (1987) boundary table (B1875 coordinates)
  function precessTo1875(ra, dec) {
    // rigorous precession J2000 -> B1875 (T = -1.25 centuries), Meeus eq. 21.3/21.4
    const T = (2405889.258551 - 2451545.0) / 36525;
    const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600 * D2R;
    const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600 * D2R;
    const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600 * D2R;
    const a = ra * D2R, dd = dec * D2R;
    const A = Math.cos(dd) * Math.sin(a + zeta), B = Math.cos(th) * Math.cos(dd) * Math.cos(a + zeta) - Math.sin(th) * Math.sin(dd), C = Math.sin(th) * Math.cos(dd) * Math.cos(a + zeta) + Math.cos(th) * Math.sin(dd);
    return { ra: norm360((Math.atan2(A, B) + z) * R2D), dec: Math.asin(C) * R2D };
  }
  function constellation(ra, dec, bounds) {
    const p = precessTo1875(ra, dec), h = p.ra / 15;
    for (const [lo, hi, dlo, con] of bounds) { if (p.dec >= dlo && h >= lo && h < hi) return con; }
    return '';
  }
  window.Planets = { compute, constellation, INFO };
})();
