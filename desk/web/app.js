/* astro: deep-sky observing log — frontend
 *
 * data:  /astro/data/catalog.jsn  (objects)
 *        /astro/data/stars.jsn    (finder chart stars)
 *        /astro/data/lines.jsn    (constellation lines + names)
 * ship:  GET /~/scry/astro/state.json ; pokes via PUT /~/channel/<id> (mark %json)
 */
'use strict';

// ------------------------------------------------------------ constants
const TYPE_LABEL = {
  '*': 'Star', '**': 'Double star', '*Ass': 'Stellar association', 'OCl': 'Open cluster',
  'GCl': 'Globular cluster', 'Cl+N': 'Cluster with nebulosity', 'G': 'Galaxy', 'GPair': 'Galaxy pair',
  'GTrpl': 'Galaxy triplet', 'GGroup': 'Galaxy group', 'PN': 'Planetary nebula', 'HII': 'HII region',
  'DrkN': 'Dark nebula', 'EmN': 'Emission nebula', 'Neb': 'Nebula', 'RfN': 'Reflection nebula',
  'SNR': 'Supernova remnant', 'Nova': 'Nova', 'Other': 'Other', 'Planet': 'Planet', 'Moon': 'Moon', 'Sun': 'Star (the Sun)',
};
const FAMILY = {
  '*': 'star', 'Nova': 'star', '**': 'double', '*Ass': 'open', 'OCl': 'open', 'GCl': 'globular',
  'Cl+N': 'nebula', 'G': 'galaxy', 'GPair': 'galaxy', 'GTrpl': 'galaxy', 'GGroup': 'galaxy',
  'PN': 'planetary', 'HII': 'nebula', 'DrkN': 'dark', 'EmN': 'nebula', 'Neb': 'nebula', 'RfN': 'nebula',
  'SNR': 'nebula', 'Other': 'other', 'Planet': 'planet', 'Moon': 'planet', 'Sun': 'planet',
};
const FAMILY_LABEL = {
  galaxy: 'Galaxies', nebula: 'Nebulae', planetary: 'Planetary nebulae', dark: 'Dark nebulae',
  open: 'Open clusters', globular: 'Globular clusters', double: 'Double stars', star: 'Stars', planet: 'Solar system', other: 'Other',
};
const SRC_LABEL = { SOL: 'Solar system', NGC: 'NGC', IC: 'IC', B: 'Barnard', SH2: 'Sharpless', LDN: 'Lynds (LDN)', DBL: 'Double stars', STAR: 'Named stars', ADD: 'Other' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// ------------------------------------------------------------ state
const S = {
  catalog: [], byId: new Map(), conNames: {}, stars: null, lines: null,
  ship: 'zod', site: '', obs: [], gear: { scopes: [], eyepieces: [], rigs: [] },
  seen: new Map(),        // obj id -> {count, imaged}
  sel: null, query: '', filters: { family: '', src: '', seen: '', maxmag: '' }, sort: 'number', planets: [], mobile: false,
  chart: { fov: 5, telrad: false, mirror: false, ep: '' },
  plans: [], plan: null, offline: false, installEvt: null,
  loc: { lat: 34.7, lon: -80.6 },
};

// ------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const fmt = (x, d = 1) => (x == null || isNaN(x) ? '—' : Number(x).toFixed(d));
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2200);
}
function raStr(ra) {
  const h = ra / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
}
function decStr(dec) {
  const sg = dec < 0 ? '−' : '+', a = Math.abs(dec), d = Math.floor(a), m = (a - d) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
  return `${sg}${String(d).padStart(2, '0')}° ${String(mm).padStart(2, '0')}′ ${String(ss).padStart(2, '0')}″`;
}
function sizeStr(o) {
  if (o.t === '**') return o.sep != null ? `${o.sep}″ sep` : '—';
  if (o.maj == null) return '—';
  const f = (v) => (v >= 60 ? `${(v / 60).toFixed(1)}°` : v >= 1 ? `${v.toFixed(1)}′` : `${(v * 60).toFixed(0)}″`);
  return o.min != null && o.min !== o.maj ? `${f(o.maj)} × ${f(o.min)}` : f(o.maj);
}
function bestMonth(ra) {
  // object transits at local midnight when the sun's RA is ra-180. sun RA ≈ 0 near Mar 21.
  const doy = (80 + ((ra - 180) / 360) * 365.25 + 365.25 * 2) % 365.25;
  const d = new Date(2001, 0, 1); d.setDate(d.getDate() + Math.round(doy));
  return MONTHS[d.getMonth()];
}
function familyOf(o) { return FAMILY[o.t] || 'other'; }
function conName(c) { return S.conNames[c] || c; }

// local sidereal time & altitude
function lst(date, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5, t = (jd - 2451545.0) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
  return (((g + lon) % 360) + 360) % 360;
}
function altAz(ra, dec, date, lat, lon) {
  const ha = (lst(date, lon) - ra) * D2R, la = lat * D2R, de = dec * D2R;
  const sinAlt = Math.sin(de) * Math.sin(la) + Math.cos(de) * Math.cos(la) * Math.cos(ha);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(de) - Math.sin(alt) * Math.sin(la)) / (Math.cos(alt) * Math.cos(la));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * R2D; if (Math.sin(ha) > 0) az = 360 - az;
  return { alt: alt * R2D, az };
}
function nowStr(o) { const aa = altAz(o.ra, o.dec, new Date(), S.loc.lat, S.loc.lon); return aa.alt < 0 ? `below horizon (${aa.alt.toFixed(0)}°)` : `alt ${aa.alt.toFixed(0)}°, az ${aa.az.toFixed(0)}° ${compass(aa.az)}`; }
const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];

// ------------------------------------------------------------ ship i/o
const chan = { id: `astro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, seq: 0, es: null, pending: new Map() };
async function poke(json) {
  const id = ++chan.seq;
  const body = [{ id, action: 'poke', ship: S.ship, app: 'astro', mark: 'json', json }];
  const p = new Promise((res, rej) => chan.pending.set(id, { res, rej }));
  let r;
  try { r = await fetch(`/~/channel/${chan.id}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }); }
  catch (e) { chan.pending.delete(id); const err = new Error('ship unreachable'); err.network = true; throw err; }
  if (!r.ok) { chan.pending.delete(id); const err = new Error(`channel PUT ${r.status}`); err.network = r.status >= 500 || r.status === 0; throw err; }
  if (!chan.es) openChannel();
  // if the event stream never answers, resolve anyway after a moment and refresh
  setTimeout(() => { const pd = chan.pending.get(id); if (pd) { chan.pending.delete(id); pd.res('timeout'); } }, 2500);
  return p;
}
function openChannel() {
  const es = new EventSource(`/~/channel/${chan.id}`);
  chan.es = es;
  es.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (ev.lastEventId) fetch(`/~/channel/${chan.id}`, { method: 'PUT', body: JSON.stringify([{ id: ++chan.seq, action: 'ack', 'event-id': Number(ev.lastEventId) }]) }).catch(() => {});
    if (d.response === 'poke') {
      const pd = chan.pending.get(d.id); if (!pd) return; chan.pending.delete(d.id);
      if (d.ok) pd.res('ok'); else pd.rej(new Error(d.err || 'poke failed'));
    }
  };
  es.onerror = () => { es.close(); chan.es = null; };
}
async function act(json, msg) {
  if (S.offline || !navigator.onLine) { queueLocal(json, msg); return; }
  try { await poke(json); await loadState(); if (msg) toast(msg); render(); }
  catch (e) {
    if (e.network) { S.offline = true; queueLocal(json, msg); return; }
    toast(`Ship rejected: ${e.message}`, true); console.error(e);
  }
}
// ---- offline queue: actions taken while the ship is unreachable are applied locally and replayed later
const Q = { key: 'astro-queue', items: [] };
let tempId = -1;
function loadQueue() { try { Q.items = JSON.parse(localStorage.getItem(Q.key) || '[]'); } catch { Q.items = []; } for (const it of Q.items) if (it.json['add-obs']) tempId = Math.min(tempId, (it.tid || 0) - 1); }
function saveQueue() { try { localStorage.setItem(Q.key, JSON.stringify(Q.items)); } catch {} }
function queueLocal(json, msg) {
  const k = Object.keys(json)[0], v = json[k];
  // edits/deletes of an observation that only exists in the queue fold into its queued add
  if ((k === 'edit-obs' && v.id < 0) || (k === 'del-obs' && v < 0)) {
    const tid = k === 'edit-obs' ? v.id : v;
    const i = Q.items.findIndex((it) => it.tid === tid);
    if (i >= 0) { if (k === 'del-obs') Q.items.splice(i, 1); else Q.items[i].json = { 'add-obs': v.observation }; }
    saveQueue(); applyLocal(json); render(); renderNet(); toast('Saved offline'); return;
  }
  const it = { json, t: Date.now() };
  if (k === 'add-obs') it.tid = tempId;
  Q.items.push(it); saveQueue(); applyLocal(json); render(); renderNet();
  toast(`${msg || 'Saved'} — offline, will sync to the ship`);
}
function applyLocal(json) {
  const k = Object.keys(json)[0], v = json[k];
  const upsert = (list, item) => { const i = list.findIndex((x) => x.name === item.name); if (i >= 0) list[i] = item; else list.push(item); };
  switch (k) {
    case 'add-obs': S.obs.push({ ...v, id: tempId--, _pending: true }); break;
    case 'edit-obs': { const o = S.obs.find((x) => x.id === v.id); if (o) Object.assign(o, v.observation, { _pending: true }); break; }
    case 'del-obs': S.obs = S.obs.filter((x) => x.id !== v); break;
    case 'put-scope': upsert(S.gear.scopes, v); break;
    case 'del-scope': S.gear.scopes = S.gear.scopes.filter((x) => x.name !== v); break;
    case 'put-eyepiece': upsert(S.gear.eyepieces, v); break;
    case 'del-eyepiece': S.gear.eyepieces = S.gear.eyepieces.filter((x) => x.name !== v); break;
    case 'put-rig': upsert(S.gear.rigs, v); break;
    case 'del-rig': S.gear.rigs = S.gear.rigs.filter((x) => x.name !== v); break;
    case 'put-plan': upsert(S.plans, v); if (!S.plan) S.plan = v.name; break;
    case 'del-plan': S.plans = S.plans.filter((x) => x.name !== v); if (S.plan === v) S.plan = null; break;
    case 'set-site': S.site = v; break;
  }
  rebuildSeen();
}
let flushing = false;
async function flushQueue() {
  if (flushing || !Q.items.length || !navigator.onLine) return;
  flushing = true; let sent = 0;
  try {
    while (Q.items.length) {
      const it = Q.items[0];
      try { await poke(it.json); Q.items.shift(); saveQueue(); sent++; }
      catch (e) { if (e.network) { S.offline = true; break; } toast(`Ship rejected a queued change: ${e.message}`, true); Q.items.shift(); saveQueue(); }
    }
    if (sent) { try { await loadState(); render(); toast(`Synced ${sent} change${sent > 1 ? 's' : ''} to the ship`); } catch {} }
  } finally { flushing = false; renderNet(); }
}
function renderNet() {
  const el = $('#net'); if (!el) return;
  const n = Q.items.length;
  el.hidden = !S.offline && !n;
  el.textContent = S.offline ? `offline${n ? ` · ${n} queued` : ''}` : `${n} to sync`;
  el.onclick = () => flushQueue();
}
function rebuildSeen() {
  S.seen = new Map();
  for (const o of S.obs) {
    const e = S.seen.get(o.obj) || { count: 0, imaged: false, last: 0 };
    e.count++; e.imaged = e.imaged || o.imaged; e.last = Math.max(e.last, o.when); S.seen.set(o.obj, e);
  }
}
async function loadState() {
  let r;
  try { r = await fetch('/~/scry/astro/state.json', { cache: 'no-store' }); } catch (e) { S.offline = true; renderNet(); const err = new Error('ship unreachable'); err.network = true; throw err; }
  if (!r.ok) { S.offline = true; renderNet(); const err = new Error(`state scry ${r.status}`); err.network = r.status >= 500; throw err; }
  const st = await r.json();
  S.offline = false;
  S.ship = String(st.ship || '~zod').replace(/^~/, '');
  S.site = st.site || ''; S.obs = st.obs || []; S.gear = st.gear || { scopes: [], eyepieces: [], rigs: [] };
  S.plans = (st.plans || []).sort((a, b) => b.date - a.date);
  if (S.plan && !S.plans.some((p) => p.name === S.plan)) S.plan = null;
  if (!S.plan && S.plans.length) S.plan = S.plans[0].name;
  S.gear.scopes.sort((a, b) => a.name.localeCompare(b.name));
  S.gear.eyepieces.sort((a, b) => b.focal - a.focal);
  S.gear.rigs.sort((a, b) => a.name.localeCompare(b.name));
  for (const it of Q.items) applyLocal(it.json);   // re-overlay anything not yet synced
  rebuildSeen(); renderNet();
}

// ------------------------------------------------------------ search
const SRC_ORDER = { SOL: 0, ADD: 1, NGC: 2, IC: 3, B: 4, SH2: 5, LDN: 6, DBL: 7, STAR: 8 };
function prepObject(o) {
  let k = '';
  for (const alias of o.s.split(' | ')) {
    const words = alias.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (let i = 0; i < words.length; i++) k += (i === 0 ? '|' : '/') + words.slice(i).join('');
  }
  o._k = k + '|'; o._n = norm(o.n); o._fam = familyOf(o);
  o._feat = !!(o.m || o.c || o.cn || o.src === 'DBL' || o.src === 'STAR' || o.src === 'SOL');
  const m = /^(\D*?)\s*(\d+)(.*)$/.exec(o.n);
  o._pre = m ? m[1].trim().toLowerCase() : o.n.toLowerCase(); o._num = m ? Number(m[2]) : 0; o._suf = m ? m[3] : '';
}
function numCmp(a, b) {
  if (a.src === 'SOL' && b.src === 'SOL') return a._ord - b._ord;
  return (SRC_ORDER[a.src] ?? 9) - (SRC_ORDER[b.src] ?? 9) || (a._pre < b._pre ? -1 : a._pre > b._pre ? 1 : 0) || a._num - b._num || (a._suf < b._suf ? -1 : a._suf > b._suf ? 1 : 0) || a.n.localeCompare(b.n);
}
function sortCmp(a, b) {
  if (S.sort === 'number' && S.filters.src === 'M') return (a.m ?? 999) - (b.m ?? 999);
  if (S.sort === 'number' && S.filters.src === 'C') return (a.c ?? 999) - (b.c ?? 999);
  if (S.sort === 'mag') return (a.mag ?? 99) - (b.mag ?? 99) || numCmp(a, b);
  if (S.sort === 'size') return (b.maj ?? 0) - (a.maj ?? 0) || numCmp(a, b);
  if (S.sort === 'alt') return (b._alt ?? -99) - (a._alt ?? -99) || numCmp(a, b);
  return numCmp(a, b);
}
function refreshPlanets() {
  const now = new Date();
  const list = Planets.compute(now, S.loc.lat, S.loc.lon);
  list.forEach((p, idx) => {
    p._ord = idx;
    p.con = Planets.constellation(p.ra, p.dec, S.lines.bounds);
    let o = S.byId.get(p.id);
    if (!o) { o = p; prepObject(o); S.catalog.push(o); S.byId.set(o.id, o); S.planets.push(o); }
    else Object.assign(o, p);
  });
}
function prepCatalog() {
  for (const o of S.catalog) {
    prepObject(o);
    S.byId.set(o.id, o);
  }
}
function search(q, f) {
  const nq = norm(q);
  const out = [];
  for (const o of S.catalog) {
    if (f.family && o._fam !== f.family) continue;
    if (f.src) {
      if (f.src === 'M' && !o.m) continue;
      if (f.src === 'C' && !o.c) continue;
      if (f.src !== 'M' && f.src !== 'C' && o.src !== f.src) continue;
    }
    if (f.seen === 'seen' && !S.seen.has(o.id)) continue;
    if (f.seen === 'unseen' && S.seen.has(o.id)) continue;
    if (f.seen === 'imaged' && !(S.seen.get(o.id) || {}).imaged) continue;
    if (f.maxmag !== '' && (o.mag == null || o.mag > Number(f.maxmag))) continue;
    if (nq) {
      let score;
      if (o._n === nq) score = 0;
      else if (o._k.includes('|' + nq + '|')) score = 1;
      else if (o._k.includes('|' + nq)) score = 2;
      else if (o._k.includes('/' + nq)) score = 3;
      else continue;
      o._score = score;
    } else {
      if (!f.family && !f.src && !f.seen && f.maxmag === '' && !o._feat) continue;
      o._score = o.m ? 0 : o.c ? 1 : o.cn ? 2 : 3;
    }
    out.push(o);
  }
  if (S.sort === 'alt') { const now = new Date(); for (const o of out) o._alt = altAz(o.ra, o.dec, now, S.loc.lat, S.loc.lon).alt; }
  out.sort((a, b) => a._score - b._score || sortCmp(a, b));
  return out;
}

// ------------------------------------------------------------ hints
function difficulty(o, aperture) {
  if (familyOf(o) === 'planet') return o.n === 'Uranus' || o.n === 'Neptune' ? { cls: 'moderate', text: 'small disk, use a chart' } : o.n === 'Sun' ? { cls: 'beyond', text: 'solar filter required' } : { cls: 'easy', text: 'easy' };
  if (familyOf(o) === 'dark') return { cls: 'moderate', text: 'needs a dark, transparent sky' };
  if (o.mag == null) return null;
  const lim = 2.5 + 5 * Math.log10(aperture);       // rough visual limiting magnitude
  let margin = lim - o.mag;
  const fam = familyOf(o);
  if (fam !== 'star' && fam !== 'double') margin -= 2.5;   // extended objects need headroom
  if (o.sb != null && o.sb > 23.5) margin -= 1;             // low surface brightness galaxies
  if (fam === 'dark') return { cls: 'moderate', text: 'needs a dark, transparent sky' };
  if (margin > 3) return { cls: 'easy', text: 'easy' };
  if (margin > 1) return { cls: 'moderate', text: 'moderate' };
  if (margin > -1) return { cls: 'hard', text: 'challenging' };
  return { cls: 'beyond', text: 'likely beyond this aperture' };
}
function hintFor(o, scope) {
  const A = scope.aperture, F = scope.focal, fam = familyOf(o);
  const minMag = Math.max(Math.round(A / 7), 4), maxMag = Math.round(A * 2);
  const size = o.t === '**' ? (o.sep || 10) / 60 : (o.maj || 0);   // arcmin
  let lo, hi, tips = [], tfov = null, label;
  const pupilRange = (a, b) => [Math.round(A / b), Math.round(A / a)];
  switch (fam) {
    case 'open':
      tfov = Math.max(size * 2, 40);
      [lo, hi] = [minMag, Math.max(minMag + 10, Math.round(A / 3))];
      label = 'Low power, wide field';
      tips.push('Frame the whole cluster: true field about twice the cluster diameter.');
      if (size > 90) tips.push('Very large: binoculars or a finder scope show it best.');
      break;
    case 'globular':
      [lo, hi] = pupilRange(1, 2);
      label = 'Medium to high power';
      tips.push('Start at ~100x to find it, then push to 150–250x to resolve stars at the edges.');
      if (A < 150) tips.push('Under 6", expect a granular glow; a 10"+ scope resolves the core.');
      break;
    case 'galaxy':
      [lo, hi] = pupilRange(2, 3);
      if (size < 3) [lo, hi] = pupilRange(1, 2);
      label = 'Medium power (2–3 mm exit pupil)';
      tips.push('Averted vision and a dark sky matter more than aperture. No filter helps galaxies.');
      if (o.sb != null && o.sb > 23) tips.push(`Low surface brightness (${o.sb} mag/arcsec²): use the lowest power that still darkens the background.`);
      if (size > 30) tips.push('Large and diffuse: sweep at low power; only the core may be obvious.');
      break;
    case 'planetary':
      if (size < 0.5) { [lo, hi] = [Math.round(A * 1.0), maxMag]; label = 'High power, it is nearly stellar'; tips.push('Blink with an OIII filter to pick the nebula out of the star field, then go to 200x+.'); }
      else { [lo, hi] = pupilRange(0.7, 1.5); label = 'Medium-high power'; tips.push('OIII or UHC filter boosts contrast; try 100–200x for structure.'); }
      if (o.cstar != null) tips.push(`Central star is magnitude ${o.cstar}.`);
      break;
    case 'nebula':
      tfov = Math.max(size * 2, 40);
      [lo, hi] = [minMag, Math.round(A / 3)];
      label = 'Low power, wide field';
      if (o.t === 'RfN') tips.push('Reflection nebula: filters do not help; needs dark, transparent sky.');
      else tips.push('UHC or OIII filter makes a big difference. Use the largest exit pupil (5–7 mm) you can.');
      if (o.t === 'SNR') tips.push('Filaments respond very well to an OIII filter.');
      if (size >= 90) tips.push('Huge: use binoculars, a finder, or a rich-field scope; a telescope shows only pieces.');
      break;
    case 'dark':
      tfov = Math.max(size * 2.5, 60);
      [lo, hi] = [minMag, Math.round(A / 5)];
      label = 'Lowest power, largest exit pupil';
      tips.push('You are looking for an absence of stars: needs a Milky Way-dark sky and a wide, low-power field.');
      if (size > 60) tips.push('Big enough for binoculars, which often beat a telescope on dark nebulae.');
      break;
    case 'double': {
      const sep = o.sep || 10, dawes = 116 / A;
      const need = Math.round(240 / sep);
      lo = Math.max(minMag, Math.min(need, maxMag)); hi = Math.min(maxMag, Math.max(need * 1.5, lo + 20));
      label = sep >= 30 ? 'Low power, an easy split' : need > maxMag ? 'Beyond this scope' : 'Enough power to split';
      if (need <= minMag) tips.push(`${sep}″ splits at any power; low power shows the colors best. Dawes limit for ${A} mm is ${dawes.toFixed(2)}″.`);
      else tips.push(`Rule of thumb: about ${need}x to split ${sep}″ comfortably. Dawes limit for ${A} mm is ${dawes.toFixed(2)}″.`);
      if (sep < dawes * 1.2) tips.push('At or below this aperture\'s resolving limit: needs excellent seeing, if at all.');
      if (o.mag2 != null && o.mag2 - o.mag > 4) tips.push('Big brightness difference: use higher power to pull the companion out of the glare.');
      break;
    }
    case 'planet': {
      const P = { Sun: [minMag, Math.round(A / 2), 'Low to medium power, WITH A SOLAR FILTER'], Moon: [minMag, maxMag, 'Any power'],
        Mercury: [Math.round(A / 2), Math.round(A * 1.2), 'High power in twilight'], Venus: [Math.round(A / 2), Math.round(A * 1.2), 'Medium-high power, in twilight or daylight'],
        Mars: [Math.round(A), maxMag, 'Highest power the seeing allows'], Jupiter: [Math.round(A / 2), Math.round(A), 'Medium-high power'],
        Saturn: [Math.round(A * 0.7), Math.round(A * 1.2), 'High power'], Uranus: [Math.round(A * 0.8), maxMag, 'High power to show a disk'], Neptune: [Math.round(A * 0.8), maxMag, 'High power to show a disk'] };
      [lo, hi, label] = P[o.n] || [Math.round(A / 2), Math.round(A), 'Medium-high power'];
      tips.push(o.notes);
      if (o.n === 'Sun') tips.push('Never point an unfiltered telescope or finder at the Sun. Cap or remove the finder.');
      if (o.n === 'Moon') tips.push(`${Math.round(o.illum * 100)}% illuminated, ${o.waxing ? 'waxing' : 'waning'}. Low power for the whole disk, 150x+ along the terminator.`);
      if (o.n === 'Mars' && o.maj < 0.1) tips.push(`Only ${(o.maj * 60).toFixed(1)}″ across right now; wait for opposition for detail.`);
      if (o.n === 'Jupiter' || o.n === 'Saturn') tips.push('Let the scope cool and wait for moments of steady seeing; a light blue or yellow filter can help contrast.');
      if ((o.n === 'Mercury' || o.n === 'Venus') && o.elong != null) tips.push(`${o.elong.toFixed(0)}° from the Sun, ${Math.round(o.illum * 100)}% illuminated.`);
      break;
    }
    case 'star':
      [lo, hi] = pupilRange(1.5, 3); label = 'Any power';
      if (o.bv != null) tips.push(`Color index B−V ${o.bv.toFixed(2)}: ${o.bv < 0 ? 'blue-white' : o.bv < 0.3 ? 'white' : o.bv < 0.6 ? 'yellow-white' : o.bv < 1.0 ? 'yellow' : o.bv < 1.5 ? 'orange' : 'red'}. Defocus slightly to see the tint.`);
      break;
    default:
      [lo, hi] = pupilRange(2, 3); label = 'Medium power';
  }
  lo = Math.max(minMag, Math.min(lo, maxMag)); hi = Math.max(lo, Math.min(hi, maxMag));
  if (tfov) { const m = Math.round(52 * 60 / tfov); lo = Math.max(minMag, Math.min(lo, m)); hi = Math.max(lo, Math.min(hi, Math.round(m * 1.6))); }
  lo = Math.round(lo); hi = Math.round(hi);
  // rank the user's eyepieces for this scope
  const eps = S.gear.eyepieces.map((e) => {
    const mag = F / (e.focal / 10), fov = e.afov / mag, pupil = A / mag;
    let d = mag < lo ? lo - mag : mag > hi ? mag - hi : 0;
    if (tfov && fov * 60 < size * 1.2) d += 100;      // object would not fit
    return { e, mag, fov, pupil, d };
  }).sort((a, b) => a.d - b.d || a.mag - b.mag);
  return { scope, lo, hi, label, tips, tfov, eps, diff: difficulty(o, A), fits: size };
}
function renderHints(o) {
  const scopes = S.gear.scopes;
  if (!scopes.length) return `<div class="tip">Add a telescope and eyepieces on the <a href="#" data-tab="gear">Gear</a> tab to get eyepiece-specific suggestions.</div>${renderGenericHint(o)}`;
  return scopes.map((sc) => {
    const h = hintFor(o, sc);
    const best = h.eps[0];
    const rows = h.eps.map((x) => `<tr class="${x === best ? 'best' : ''}"><td>${esc(x.e.name)}</td><td class="num">${Math.round(x.mag)}×</td><td class="num">${x.fov.toFixed(2)}°</td><td class="num">${x.pupil.toFixed(1)} mm</td><td>${x.d >= 100 ? 'object does not fit' : x.d === 0 ? 'in range' : ''}</td></tr>`).join('');
    return `<div class="hint"><span class="scope">${esc(sc.name)}</span> (${sc.aperture} mm f/${(sc.focal / sc.aperture).toFixed(1)})
      ${h.diff ? ` · <span class="diff ${h.diff.cls}">${h.diff.text}</span>` : ''}
      <div>${esc(h.label)}: aim for <b>${h.lo === h.hi ? '≈' + h.lo : h.lo + '–' + h.hi}×</b>${h.tfov ? ` (true field ≳ ${(h.tfov / 60).toFixed(1)}°)` : ''}${best ? ` — best: <span class="best">${esc(best.e.name)} at ${Math.round(best.mag)}×</span>` : ''}</div>
      ${h.tips.map((t) => `<div class="tip">${esc(t)}</div>`).join('')}
      ${h.eps.length ? `<table><tr><th>Eyepiece</th><th class="num">Mag</th><th class="num">True field</th><th class="num">Exit pupil</th><th></th></tr>${rows}</table>` : '<div class="tip muted">No eyepieces defined yet.</div>'}
    </div>`;
  }).join('') + renderGenericHint(o);
}
function renderGenericHint(o) {
  const fam = familyOf(o);
  const g = {
    open: 'Open clusters: 20–60× with the widest field you have.',
    globular: 'Globulars: 100–250×; resolution improves quickly with aperture.',
    galaxy: 'Galaxies: 60–150× (2–3 mm exit pupil), dark sky, averted vision.',
    planetary: 'Planetaries: 150–300× plus an OIII/UHC filter.',
    nebula: 'Emission nebulae: lowest power plus UHC/OIII; reflection nebulae: no filter.',
    dark: 'Dark nebulae: binoculars or the lowest power; dark sky essential.',
    double: 'Doubles: roughly 240 ÷ separation(″) as a starting magnification.',
    star: 'Bright stars: any power; medium power shows color best.',
    planet: 'Planets: as much power as the seeing allows, typically 150–250×; the Moon takes anything.',
    other: 'Try medium power and adjust.',
  }[fam];
  return `<div class="tip muted">General rule — ${esc(g)}</div>`;
}

// ------------------------------------------------------------ rendering
function render() {
  renderList(); renderDetail(); renderLog(); renderGear(); renderStats(); renderPlan();
  $('#status').textContent = `~${S.ship} · ${S.catalog.length.toLocaleString()} objects · ${S.obs.length} observations`;
}
let listCache = [];
function activeFilters() {
  const f = S.filters, out = [];
  if (f.family) out.push(FAMILY_LABEL[f.family] || f.family);
  if (f.src) out.push(f.src === 'M' ? 'Messier' : f.src === 'C' ? 'Caldwell' : SRC_LABEL[f.src] || f.src);
  if (f.seen) out.push({ unseen: 'not yet seen', seen: 'seen', imaged: 'imaged' }[f.seen]);
  if (f.maxmag !== '') out.push(`mag ≤ ${f.maxmag}`);
  return out;
}
function clearFilters() {
  S.filters = { family: '', src: '', seen: '', maxmag: '' };
  for (const id of ['f-family', 'f-src', 'f-seen', 'f-maxmag']) $('#' + id).value = '';
  renderList(); updateFilterButton();
}
function updateFilterButton() {
  const b = $('#filters-toggle'); if (!b) return;
  const n = activeFilters().length, open = $('.searchbar').classList.contains('open');
  b.textContent = open ? 'Hide filters' : n ? `Filters (${n})` : 'Filters';
  b.classList.toggle('active', n > 0);
}
function renderList() {
  const res = search(S.query, S.filters); listCache = res;
  const el = $('#list'); const max = 300;
  if (!res.length) {
    const f = S.filters, active = activeFilters();
    let hint = '';
    if (active.length) {
      const without = search(S.query, { family: '', src: '', seen: '', maxmag: '' }).length;
      hint = `<div>${without ? `${without} match${without > 1 ? 'es' : ''} hidden by` : 'Active'} filter${active.length > 1 ? 's' : ''}: <b>${esc(active.join(', '))}</b></div><button id="clear-filters" class="small primary" style="margin-top:6px">Clear filters</button>`;
    }
    el.innerHTML = `<div class="empty">No matches${S.query ? ` for "${esc(S.query)}"` : ''}. ${hint || 'Try "M 31", "NGC 7000", "Horsehead", "B 33", "Sh2-155", "LDN 1773", "Albireo"…'}</div>`;
    const cf = $('#clear-filters'); if (cf) cf.onclick = clearFilters;
    return;
  }
  el.innerHTML = res.slice(0, max).map((o) => {
    const sn = S.seen.get(o.id);
    return `<div class="row${S.sel === o.id ? ' sel' : ''}" data-id="${esc(o.id)}">
      <div class="name">${esc(o.n)}${o.m ? `<span class="badge m">M ${o.m}</span>` : ''}${o.c ? `<span class="badge c">C ${o.c}</span>` : ''}${sn ? `<span class="badge seen">✓${sn.count > 1 ? ' ' + sn.count : ''}</span>` : ''}${sn && sn.imaged ? '<span class="badge img">📷</span>' : ''}</div>
      <div class="mag">${o.mag != null ? 'mag ' + fmt(o.mag, 1) : ''}</div>
      <div class="sub">${esc(TYPE_LABEL[o.t] || o.t)} · ${esc(conName(o.con))}${o.cn ? ' · ' + esc(o.cn.join(', ')) : ''}</div>
    </div>`;
  }).join('') + (res.length > max ? `<div class="more">${res.length - max} more — refine your search</div>` : '');
}
function renderDetail() {
  const el = $('#detail');
  const o = S.byId.get(S.sel);
  if (!o) { el.innerHTML = '<div class="muted">Pick an object from the list, or search for one.</div>'; return; }
  const sn = S.seen.get(o.id);
  const now = new Date(); const aa = altAz(o.ra, o.dec, now, S.loc.lat, S.loc.lon);
  const maxAlt = 90 - Math.abs(S.loc.lat - o.dec);
  const facts = [
    ['Type', TYPE_LABEL[o.t] || o.t], ['Constellation', conName(o.con)],
    ['RA (J2000)', raStr(o.ra)], ['Dec (J2000)', decStr(o.dec)],
    ['Magnitude', o.mag != null ? `${fmt(o.mag, 1)}${o.magb ? ' (B)' : ''}${o.mag2 != null ? ' / ' + fmt(o.mag2, 1) : ''}` : '—'],
  ];
  if (o.src !== 'SOL') facts.push(['Size', sizeStr(o)]);
  const noDss = o.src === 'SOL' && (o.n === 'Sun' || o.n === 'Moon');
  if (o.pa != null) facts.push([o.t === '**' ? 'Position angle' : 'Orientation (PA)', `${o.pa}°`]);
  if (o.sb != null) facts.push(['Surface brightness', `${o.sb} mag/″²`]);
  if (o.hub) facts.push(['Hubble type', o.hub]);
  if (o.cstar != null) facts.push(['Central star', `mag ${o.cstar}`]);
  if (o.opac != null) facts.push(['Opacity', `${o.opac} / 6`]);
  if (o.bv != null) facts.push(['B−V', o.bv.toFixed(2)]);
  if (o.src === 'SOL') {
    if (o.distAu != null) facts.push(['Distance', `${o.distAu.toFixed(3)} AU`]);
    if (o.distKm != null) facts.push(['Distance', `${Math.round(o.distKm).toLocaleString()} km`]);
    facts.push(['Apparent diameter', o.maj >= 1 ? `${o.maj.toFixed(1)}′` : `${(o.maj * 60).toFixed(1)}″`]);
    if (o.illum != null) facts.push(['Illuminated', `${Math.round(o.illum * 100)}%${o.n === 'Moon' ? (o.waxing ? ', waxing' : ', waning') : ''}`]);
    if (o.elong != null) facts.push(['Elongation from Sun', `${o.elong.toFixed(0)}°`]);
    facts.push(['Position for', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]);
  } else facts.push(['Best evening', bestMonth(o.ra)]);
  facts.push(['Max altitude here', maxAlt <= 0 ? 'never rises' : `${maxAlt.toFixed(0)}°`]);
  facts.push(['Right now', nowStr(o)]);
  const aliases = o.s.split(' | ').filter((a) => a !== o.n);
  const wikiName = o.src === 'SOL' ? (o.n === 'Sun' || o.n === 'Moon' ? o.n : o.n + ' (planet)') : o.m ? `Messier ${o.m}` : o.cn ? o.cn[0] : o.n;
  const simbad = o.src === 'DBL' || o.src === 'STAR' ? o.n : o.n;
  el.innerHTML = `
    <button id="btn-back" class="back">‹ Back to list</button>
    <h2>${esc(o.n)}${o.m ? `<span class="badge m">Messier ${o.m}</span>` : ''}${o.c ? `<span class="badge c">Caldwell ${o.c}</span>` : ''}${sn ? `<span class="badge seen">seen ×${sn.count}</span>` : '<span class="badge">not yet seen</span>'}${sn && sn.imaged ? '<span class="badge img">imaged</span>' : ''}</h2>
    <div class="common">${o.cn ? esc(o.cn.join(' · ')) : ''}</div>
    <div class="actions">
      <button class="primary" id="btn-seen">✓ Mark as seen now</button>
      <button id="btn-log">Log observation…</button>
      <button id="btn-plan" title="Add to the current night plan">＋ Plan</button>
      <a class="badge" target="_blank" href="https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(simbad)}">SIMBAD ↗</a>
      <a class="badge" target="_blank" href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(wikiName)}">Wikipedia ↗</a>
      <a class="badge" target="_blank" href="https://aladin.cds.unistra.fr/AladinLite/?target=${o.ra}%20${o.dec}&fov=${Math.max(0.2, (o.maj || 10) / 60 * 3).toFixed(2)}">Aladin ↗</a>
    </div>
    <div class="facts">${facts.map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v"${k === 'Right now' ? ' id="now-altaz"' : ''}>${esc(v)}</div></div>`).join('')}</div>
    ${o.notes ? `<div class="section"><h3>Notes</h3><div class="notes">${esc(o.notes)}</div></div>` : ''}
    ${aliases.length ? `<div class="aliases">Also: ${esc(aliases.join(' · '))}</div>` : ''}
    <div class="section"><h3>Magnification &amp; approach</h3>${renderHints(o)}</div>
    <div class="section"><h3>Atlas</h3>
      <div class="atlas">
        <div class="pane">
          <div class="controls">
            <label>Field <select id="chart-fov">${[1, 2, 5, 10, 20, 45].map((f) => `<option value="${f}"${f === S.chart.fov ? ' selected' : ''}>${f}°</option>`).join('')}</select></label>
            <label><input type="checkbox" id="chart-telrad"${S.chart.telrad ? ' checked' : ''}> Telrad</label>
            <label><input type="checkbox" id="chart-mirror"${S.chart.mirror ? ' checked' : ''}> Mirror (diagonal)</label>
            <label>Eyepiece circle <select id="chart-ep"><option value="">none</option>${epOptions()}</select></label>
          </div>
          <canvas id="chart"></canvas>
          <div class="caption">North up, ${S.chart.mirror ? 'east right (mirrored)' : 'east left'} · stars to mag ${starLimit(S.chart.fov)} · drag to pan, wheel to zoom, double-click to recenter</div>
        </div>
        <div class="pane"${noDss ? ' hidden' : ''}>
          <div class="controls">
            <span>DSS2 color image${o.src === 'SOL' ? ' (background stars)' : ''}</span>
            <label>Field <select id="dss-fov">${dssFovOptions(o)}</select></label>
            <span class="muted" id="dss-status"></span>
          </div>
          <img id="dss" alt="DSS image" referrerpolicy="no-referrer">
          <div class="caption">Digitized Sky Survey via CDS hips2fits (needs internet). North up, east left.</div>
        </div>
      </div>
    </div>
    <div class="section"><h3>Your observations</h3><div id="obs-for-obj">${renderObsList(S.obs.filter((x) => x.obj === o.id))}</div></div>
  `;
  $('#btn-seen').onclick = () => quickSeen(o);
  $('#btn-log').onclick = () => openObsForm({ obj: o.id });
  $('#btn-plan').onclick = () => addToPlan(o.id);
  $('#chart-fov').onchange = (e) => { S.chart.fov = Number(e.target.value); chartCenter = null; drawChart(o); };
  $('#chart-telrad').onchange = (e) => { S.chart.telrad = e.target.checked; drawChart(o); };
  $('#chart-mirror').onchange = (e) => { S.chart.mirror = e.target.checked; drawChart(o); };
  $('#chart-ep').onchange = (e) => { S.chart.ep = e.target.value; drawChart(o); };
  $('#chart-ep').value = S.chart.ep;
  $('#dss-fov').onchange = () => loadDss(o);
  $('#btn-back').onclick = () => { $('.split').classList.remove('show-detail'); };
  bindObsButtons(el);
  chartCenter = null;
  ensureChartData().then(() => { drawChart(o); bindChartGestures(o); });
  if (!noDss) loadDss(o);
}
function epOptions() {
  const out = [];
  for (const sc of S.gear.scopes) for (const e of S.gear.eyepieces) {
    const mag = sc.focal / (e.focal / 10), fov = e.afov / mag;
    const v = `${fov.toFixed(3)}`;
    out.push(`<option value="${v}">${esc(sc.name)} + ${esc(e.name)} (${fov.toFixed(2)}°)</option>`);
  }
  out.push('<option value="6">9×50 finder (6°)</option>', '<option value="6.5">10×50 binoculars (6.5°)</option>');
  return out.join('');
}
function dssFovOptions(o) {
  const base = Math.max(0.15, ((o.maj || 10) / 60) * 2.5);
  return [[base, 'object'], [Math.max(base * 3, 1), 'context'], [Math.max(base * 8, 3), 'wide']].map(([f, l], i) => `<option value="${f.toFixed(3)}"${i === 0 ? ' selected' : ''}>${l} (${f < 1 ? (f * 60).toFixed(0) + '′' : f.toFixed(1) + '°'})</option>`).join('');
}
function loadDss(o) {
  const img = $('#dss'), st = $('#dss-status'); if (!img) return;
  const fov = Number($('#dss-fov').value);
  st.textContent = 'loading…';
  img.onload = () => { st.textContent = ''; }; img.onerror = () => { st.textContent = 'could not load (offline?)'; };
  img.src = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=640&height=640&fov=${fov}&projection=TAN&coordsys=icrs&ra=${o.ra}&dec=${o.dec}&format=jpg`;
}
function renderObsList(list) {
  if (!list.length) return '<div class="muted">None logged yet.</div>';
  return list.slice().sort((a, b) => b.when - a.when).map((x) => {
    const o = S.byId.get(x.obj);
    const meta = [x.site, x.scope, x.eyepiece, x.seeing ? `seeing ${x.seeing}/5` : '', x.transparency ? `transp ${x.transparency}/5` : '', x.imaged ? `📷 ${x.rig || 'imaged'}` : ''].filter(Boolean).join(' · ');
    return `<div class="obs${x.imaged ? ' imaged' : ''}${x._pending ? ' pending' : ''}" data-id="${x.id}">${x._pending ? '<span class="badge">not synced</span>' : ''}
      <span class="ctl"><button class="small" data-edit="${x.id}">edit</button> <button class="small danger" data-del="${x.id}">delete</button></span>
      <div class="head"><span class="when">${new Date(x.when).toLocaleString()}</span>${o ? `<a href="#" data-obj="${esc(o.id)}"><b>${esc(o.n)}</b>${o.cn ? ' ' + esc(o.cn[0]) : ''}</a>` : esc(x.obj)}</div>
      <div class="meta">${esc(meta)}</div>
      ${x.notes ? `<div class="txt">${esc(x.notes)}</div>` : ''}
    </div>`;
  }).join('');
}
function bindObsButtons(root) {
  $$('[data-edit]', root).forEach((b) => b.onclick = () => { const x = S.obs.find((y) => y.id === Number(b.dataset.edit)); if (x) openObsForm(x); });
  $$('[data-del]', root).forEach((b) => b.onclick = () => { if (confirm('Delete this observation?')) act({ 'del-obs': Number(b.dataset.del) }, 'Deleted'); });
  $$('[data-obj]', root).forEach((a) => a.onclick = (e) => { e.preventDefault(); selectObject(a.dataset.obj); showTab('objects'); });
}
function quickSeen(o) {
  act({ 'add-obs': { obj: o.id, when: Date.now(), site: S.site, scope: '', eyepiece: '', seeing: 0, transparency: 0, notes: '', imaged: false, rig: '' } }, `${o.n} marked as seen`);
}

// observation form (dialog)
function openObsForm(x) {
  const o = S.byId.get(x.obj);
  const dlg = $('#obs-dialog');
  const when = x.when ? new Date(x.when) : new Date();
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const opt = (list, cur, key = 'name') => `<option value="">—</option>` + list.map((g) => `<option value="${esc(g[key])}"${g[key] === cur ? ' selected' : ''}>${esc(g[key])}</option>`).join('');
  const rate = (name, cur) => `<select name="${name}"><option value="0"${!cur ? ' selected' : ''}>unknown</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${cur === n ? ' selected' : ''}>${n} — ${['poor', 'fair', 'average', 'good', 'excellent'][n - 1]}</option>`).join('')}</select>`;
  dlg.innerHTML = `<form method="dialog" id="obs-form">
    <h3>${x.id ? 'Edit observation' : 'Log observation'}: ${esc(o ? o.n : x.obj)}${o && o.cn ? ' · ' + esc(o.cn[0]) : ''}</h3>
    <div class="form">
      <label>When <input type="datetime-local" name="when" value="${local}" required></label>
      <label>Site <input name="site" value="${esc(x.site ?? S.site)}" list="sites"><datalist id="sites">${[...new Set(S.obs.map((y) => y.site).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label>Telescope <select name="scope">${opt(S.gear.scopes, x.scope)}</select></label>
      <label>Eyepiece <select name="eyepiece">${opt(S.gear.eyepieces, x.eyepiece)}</select></label>
      <label>Seeing ${rate('seeing', x.seeing)}</label>
      <label>Transparency ${rate('transparency', x.transparency)}</label>
      <label class="check"><span><input type="checkbox" name="imaged"${x.imaged ? ' checked' : ''}> Imaged it</span></label>
      <label>Imaging setup <select name="rig">${opt(S.gear.rigs, x.rig)}</select></label>
      <label class="wide">Notes <textarea name="notes" placeholder="What did you see? Filters, conditions, sketches…">${esc(x.notes || '')}</textarea></label>
    </div>
    <div class="actions"><button class="primary" value="save">Save</button><button value="cancel" type="button" id="obs-cancel">Cancel</button></div>
  </form>`;
  $('#obs-cancel').onclick = () => dlg.close();
  $('#obs-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const obs = {
      obj: x.obj, when: new Date(f.get('when')).getTime(), site: f.get('site') || '', scope: f.get('scope') || '', eyepiece: f.get('eyepiece') || '',
      seeing: Number(f.get('seeing')), transparency: Number(f.get('transparency')), notes: f.get('notes') || '', imaged: f.get('imaged') === 'on', rig: f.get('rig') || '',
    };
    dlg.close();
    if (x.id) act({ 'edit-obs': { id: x.id, observation: obs } }, 'Observation updated');
    else act({ 'add-obs': obs }, 'Observation logged');
  };
  dlg.showModal();
}

// ------------------------------------------------------------ log tab
function renderLog() {
  const el = $('#log-list'); if (!el) return;
  const q = norm($('#log-search').value), onlyImg = $('#log-imaged').checked;
  let list = S.obs.filter((x) => (!onlyImg || x.imaged));
  if (q) list = list.filter((x) => { const o = S.byId.get(x.obj); return norm(`${x.notes} ${x.site} ${x.scope} ${x.rig} ${o ? o.s : x.obj}`).includes(q); });
  el.innerHTML = renderObsList(list);
  bindObsButtons(el);
}
function exportLog(kind) {
  const rows = S.obs.slice().sort((a, b) => a.when - b.when).map((x) => {
    const o = S.byId.get(x.obj) || {};
    return { id: x.id, object: o.n || x.obj, common: (o.cn || []).join('; '), type: TYPE_LABEL[o.t] || o.t || '', constellation: conName(o.con), ra: o.ra, dec: o.dec, mag: o.mag, when: new Date(x.when).toISOString(), site: x.site, scope: x.scope, eyepiece: x.eyepiece, seeing: x.seeing, transparency: x.transparency, imaged: x.imaged, rig: x.rig, notes: x.notes };
  });
  let blob, name;
  if (kind === 'json') { blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }); name = 'observations.json'; }
  else {
    const cols = Object.keys(rows[0] || { id: 0 });
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    blob = new Blob([cols.join(',') + '\n' + rows.map((r) => cols.map((c) => cell(r[c])).join(',')).join('\n')], { type: 'text/csv' }); name = 'observations.csv';
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------ gear tab
function renderGear() {
  const el = $('#gear'); if (!el) return;
  const g = S.gear;
  el.innerHTML = `
    <div class="card"><h3>Observing site &amp; location</h3>
      <div class="form">
        <label>Default site name <input id="site-name" value="${esc(S.site)}" placeholder="Backyard"></label>
        <label>Latitude (°) <input id="loc-lat" type="number" step="0.01" value="${S.loc.lat}"></label>
        <label>Longitude (°, east +) <input id="loc-lon" type="number" step="0.01" value="${S.loc.lon}"></label>
        <label>&nbsp;<span><button id="site-save" class="primary">Save</button> <button id="loc-geo">Use my location</button></span></label>
      </div>
      <div class="muted">Site name is stored on the ship; latitude/longitude stay in this browser and drive the altitude figures.</div>
    </div>
    <div class="card"><h3>Phone app &amp; offline</h3>
      <div class="tip">${window.matchMedia('(display-mode: standalone)').matches ? 'Running as an installed app.' : S.installEvt ? '<button id="install-app" class="primary">Install as an app</button> &nbsp; adds it to your home screen, full screen, works offline.' : 'To install: on iPhone open this page in Safari and use Share → <b>Add to Home Screen</b>; on Android use the browser menu → <b>Add to Home screen</b> / <b>Install app</b>.'}</div>
      <div class="tip">${'serviceWorker' in navigator ? 'Offline mode: the catalog, charts and your last-loaded log are cached on this device. Observations made while the ship is unreachable are queued and synced when it is back.' : 'This browser does not support offline mode (needs HTTPS or localhost).'}${Q.items.length ? ` <b>${Q.items.length} change${Q.items.length > 1 ? 's' : ''} waiting to sync</b> <button id="sync-now" class="small">Sync now</button>` : ''}</div>
    </div>
    <div class="card"><h3>Telescopes</h3>
      <table><tr><th>Name</th><th>Kind</th><th class="num">Aperture</th><th class="num">Focal length</th><th class="num">f/</th><th>Notes</th><th></th></tr>
      ${g.scopes.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.kind)}</td><td class="num">${s.aperture} mm</td><td class="num">${s.focal} mm</td><td class="num">${(s.focal / s.aperture).toFixed(1)}</td><td>${esc(s.notes)}</td><td><button class="small" data-edit-scope="${esc(s.name)}">edit</button> <button class="small danger" data-del-scope="${esc(s.name)}">×</button></td></tr>`).join('')}</table>
      <form id="scope-form" class="form">
        <label>Name <input name="name" required placeholder="10&quot; Dob"></label>
        <label>Kind <select name="kind">${['dob', 'reflector', 'refractor', 'sct', 'mak', 'binocular', 'other'].map((k) => `<option>${k}</option>`).join('')}</select></label>
        <label>Aperture (mm) <input name="aperture" type="number" min="10" required></label>
        <label>Focal length (mm) <input name="focal" type="number" min="50" required></label>
        <label>Notes <input name="notes"></label>
        <label>&nbsp;<button class="primary">Add / update telescope</button></label>
      </form>
    </div>
    <div class="card"><h3>Eyepieces</h3>
      <table><tr><th>Name</th><th class="num">Focal length</th><th class="num">AFOV</th><th>Notes</th><th></th></tr>
      ${g.eyepieces.map((e) => `<tr><td>${esc(e.name)}</td><td class="num">${(e.focal / 10).toFixed(1)} mm</td><td class="num">${e.afov}°</td><td>${esc(e.notes)}</td><td><button class="small" data-edit-ep="${esc(e.name)}">edit</button> <button class="small danger" data-del-ep="${esc(e.name)}">×</button></td></tr>`).join('')}</table>
      <form id="ep-form" class="form">
        <label>Name <input name="name" required placeholder="13mm Nagler"></label>
        <label>Focal length (mm) <input name="focal" type="number" step="0.1" min="1" required></label>
        <label>Apparent field (°) <input name="afov" type="number" min="30" max="120" value="52" required></label>
        <label>Notes <input name="notes"></label>
        <label>&nbsp;<button class="primary">Add / update eyepiece</button></label>
      </form>
    </div>
    <div class="card"><h3>Imaging setups</h3>
      <table><tr><th>Name</th><th>Optics</th><th>Camera</th><th>Mount</th><th>Filters</th><th>Notes</th><th></th></tr>
      ${g.rigs.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.optics)}</td><td>${esc(r.camera)}</td><td>${esc(r.mount)}</td><td>${esc(r.filters)}</td><td>${esc(r.notes)}</td><td><button class="small" data-edit-rig="${esc(r.name)}">edit</button> <button class="small danger" data-del-rig="${esc(r.name)}">×</button></td></tr>`).join('')}</table>
      <form id="rig-form" class="form">
        <label>Name <input name="name" required></label>
        <label>Optics <input name="optics"></label>
        <label>Camera <input name="camera"></label>
        <label>Mount <input name="mount"></label>
        <label>Filters <input name="filters"></label>
        <label>Notes <input name="notes"></label>
        <label>&nbsp;<button class="primary">Add / update setup</button></label>
      </form>
    </div>`;
  const fill = (form, obj) => { for (const [k, v] of Object.entries(obj)) { const i = form.elements[k]; if (i) i.value = v; } form.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const ia = $('#install-app'); if (ia) ia.onclick = async () => { S.installEvt.prompt(); const r = await S.installEvt.userChoice; if (r.outcome === 'accepted') { S.installEvt = null; renderGear(); } };
  const sn = $('#sync-now'); if (sn) sn.onclick = () => flushQueue();
  $('#site-save').onclick = () => {
    S.loc = { lat: Number($('#loc-lat').value), lon: Number($('#loc-lon').value) };
    try { localStorage.setItem('astro-loc', JSON.stringify(S.loc)); } catch {}
    act({ 'set-site': $('#site-name').value }, 'Saved');
  };
  $('#loc-geo').onclick = () => navigator.geolocation?.getCurrentPosition((p) => { $('#loc-lat').value = p.coords.latitude.toFixed(3); $('#loc-lon').value = p.coords.longitude.toFixed(3); }, () => toast('Location unavailable', true));
  $('#scope-form').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); act({ 'put-scope': { name: f.get('name'), kind: f.get('kind'), aperture: Number(f.get('aperture')), focal: Number(f.get('focal')), notes: f.get('notes') || '' } }, 'Telescope saved'); };
  $('#ep-form').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); act({ 'put-eyepiece': { name: f.get('name'), focal: Math.round(Number(f.get('focal')) * 10), afov: Number(f.get('afov')), notes: f.get('notes') || '' } }, 'Eyepiece saved'); };
  $('#rig-form').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); act({ 'put-rig': { name: f.get('name'), optics: f.get('optics') || '', camera: f.get('camera') || '', mount: f.get('mount') || '', filters: f.get('filters') || '', notes: f.get('notes') || '' } }, 'Imaging setup saved'); };
  $$('[data-del-scope]', el).forEach((b) => b.onclick = () => confirm(`Delete ${b.dataset.delScope}?`) && act({ 'del-scope': b.dataset.delScope }, 'Deleted'));
  $$('[data-del-ep]', el).forEach((b) => b.onclick = () => confirm(`Delete ${b.dataset.delEp}?`) && act({ 'del-eyepiece': b.dataset.delEp }, 'Deleted'));
  $$('[data-del-rig]', el).forEach((b) => b.onclick = () => confirm(`Delete ${b.dataset.delRig}?`) && act({ 'del-rig': b.dataset.delRig }, 'Deleted'));
  $$('[data-edit-scope]', el).forEach((b) => b.onclick = () => fill($('#scope-form'), g.scopes.find((s) => s.name === b.dataset.editScope)));
  $$('[data-edit-ep]', el).forEach((b) => b.onclick = () => { const e = g.eyepieces.find((s) => s.name === b.dataset.editEp); fill($('#ep-form'), { ...e, focal: e.focal / 10 }); });
  $$('[data-edit-rig]', el).forEach((b) => b.onclick = () => fill($('#rig-form'), g.rigs.find((s) => s.name === b.dataset.editRig)));
}

// ------------------------------------------------------------ stats tab
function renderStats() {
  const el = $('#stats'); if (!el) return;
  const cats = [
    ['Messier (M102 = M101)', (o) => o.m], ['Caldwell', (o) => o.c], ['NGC', (o) => o.src === 'NGC'], ['IC', (o) => o.src === 'IC'],
    ['Barnard', (o) => o.src === 'B' || o.id === 'B033'], ['Sharpless', (o) => o.src === 'SH2'], ['Lynds', (o) => o.src === 'LDN'],
    ['Double stars', (o) => o.src === 'DBL'], ['Named stars', (o) => o.src === 'STAR'], ['Solar system', (o) => o.src === 'SOL'],
  ];
  const seenIds = new Set(S.seen.keys());
  const rows = cats.map(([name, pred, total]) => {
    const all = S.catalog.filter(pred); const n = all.filter((o) => seenIds.has(o.id)).length; const t = total || all.length;
    const img = all.filter((o) => (S.seen.get(o.id) || {}).imaged).length;
    return `<div class="stat"><div class="n">${n}<span class="muted" style="font-size:14px"> / ${t}</span></div><div class="l">${name}${img ? ` · ${img} imaged` : ''}</div><div class="bar"><div style="width:${(100 * n / t).toFixed(1)}%"></div></div></div>`;
  }).join('');
  const fam = {}; for (const id of seenIds) { const o = S.byId.get(id); if (o) fam[familyOf(o)] = (fam[familyOf(o)] || 0) + 1; }
  const nights = new Set(S.obs.map((x) => new Date(x.when).toDateString())).size;
  el.innerHTML = `<div class="card"><h3>Progress</h3>${rows}</div>
    <div class="card"><h3>Totals</h3>
      <div class="stat"><div class="n">${seenIds.size}</div><div class="l">distinct objects seen</div></div>
      <div class="stat"><div class="n">${S.obs.length}</div><div class="l">observations</div></div>
      <div class="stat"><div class="n">${S.obs.filter((x) => x.imaged).length}</div><div class="l">imaged</div></div>
      <div class="stat"><div class="n">${nights}</div><div class="l">nights out</div></div>
      <div style="margin-top:8px">${Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="badge">${FAMILY_LABEL[k]}: ${v}</span>`).join(' ')}</div>
    </div>`;
}

// ------------------------------------------------------------ finder chart
let chartCenter = null, chartDrag = null;
function starLimit(fov) { return fov <= 2 ? 8.5 : fov <= 5 ? 8.5 : fov <= 10 ? 7.5 : fov <= 20 ? 6.5 : 5.5; }
async function ensureChartData() {
  if (!S.stars) { const r = await fetch('/astro/data/stars.jsn'); S.stars = await r.json(); }
  if (!S.lines) { const r = await fetch('/astro/data/lines.jsn'); S.lines = await r.json(); }
}
function project(ra, dec, c) {
  // gnomonic, returns [x, y] in radians (east = -x before mirroring)
  const dr = (ra - c.ra) * D2R, d = dec * D2R, d0 = c.dec * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dr);
  if (cosc <= 0.05) return null;
  const x = Math.cos(d) * Math.sin(dr) / cosc, y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dr)) / cosc;
  return [x, y];
}
function unproject(x, y, c) {
  const d0 = c.dec * D2R, rho = Math.hypot(x, y); if (rho === 0) return { ra: c.ra, dec: c.dec };
  const cc = Math.atan(rho), sc = Math.sin(cc), cs = Math.cos(cc);
  const dec = Math.asin(cs * Math.sin(d0) + y * sc * Math.cos(d0) / rho) * R2D;
  const ra = c.ra + Math.atan2(x * sc, rho * Math.cos(d0) * cs - y * Math.sin(d0) * sc) * R2D;
  return { ra: ((ra % 360) + 360) % 360, dec };
}
const PRINT_PAL = { '--chart-bg': '#ffffff', '--chart-line': '#b8b8b8', '--star': '#000000', '--chart-obj': '#555555', '--chart-mark': '#c00000', '--chart-text': '#333333', '--chart-ep': '#0055cc' };
function drawChart(o, opts = {}) {
  const cv = opts.canvas || $('#chart'); if (!cv || !S.stars) return;
  const cssv = getComputedStyle(document.body);
  const css = { getPropertyValue: (k) => (opts.print ? PRINT_PAL[k] : cssv.getPropertyValue(k)) };
  const W = opts.size || cv.clientWidth || 500, dpr = opts.size ? 2 : (window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = W * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fov = opts.fov ?? S.chart.fov, c = opts.center || chartCenter || { ra: o.ra, dec: o.dec };
  const telrad = opts.telrad ?? S.chart.telrad, epc = opts.ep ?? S.chart.ep;
  const scale = (W / 2) / Math.tan((fov / 2) * D2R), mir = (opts.mirror ?? S.chart.mirror) ? 1 : -1;
  const toPx = (p) => [W / 2 + mir * p[0] * scale, W / 2 - p[1] * scale];
  const lim = starLimit(fov), cosd = Math.max(0.05, Math.cos(c.dec * D2R));
  const raHalf = Math.min(180, (fov * 0.75) / cosd), decHalf = fov * 0.75;
  ctx.fillStyle = css.getPropertyValue('--chart-bg'); ctx.fillRect(0, 0, W, W);
  // constellation lines
  if (fov >= 4) {
    ctx.strokeStyle = css.getPropertyValue('--chart-line'); ctx.lineWidth = 1;
    for (const [r1, d1, r2, d2] of S.lines.lines) {
      const a = project(r1, d1, c), b = project(r2, d2, c); if (!a || !b) continue;
      const pa = toPx(a), pb = toPx(b); if (Math.max(Math.abs(pa[0] - W / 2), Math.abs(pa[1] - W / 2), Math.abs(pb[0] - W / 2), Math.abs(pb[1] - W / 2)) > W) continue;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
  }
  if (fov >= 15) {
    ctx.fillStyle = css.getPropertyValue('--chart-text'); ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    for (const [, name, r, d] of S.lines.names) { const p = project(r, d, c); if (!p) continue; const q = toPx(p); if (q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > W) continue; ctx.fillText(name.toUpperCase(), q[0], q[1]); }
  }
  // stars
  ctx.fillStyle = css.getPropertyValue('--star');
  for (const s of S.stars) {
    const m = s[2]; if (m > lim) continue;
    const dd = s[1] - c.dec; if (dd > decHalf || dd < -decHalf) continue;
    let dr = Math.abs(s[0] - c.ra); if (dr > 180) dr = 360 - dr; if (dr > raHalf) continue;
    const p = project(s[0], s[1], c); if (!p) continue; const q = toPx(p);
    if (q[0] < -5 || q[0] > W + 5 || q[1] < -5 || q[1] > W + 5) continue;
    const r = Math.max(0.6, (lim + 1 - m) * (fov <= 2 ? 0.75 : fov <= 10 ? 0.6 : 0.45));
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 2 * Math.PI); ctx.fill();
  }
  // neighbouring catalog objects (bright / famous)
  ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  let n = 0;
  for (const x of S.catalog) {
    if (x === o || n > 60) continue;
    if (!(x.m || x.c || (x.mag != null && x.mag < (fov <= 5 ? 11 : 9) && x.src !== 'STAR' && x.src !== 'LDN'))) continue;
    if (x.src === 'STAR' && fov > 10) continue;
    const dd = x.dec - c.dec; if (dd > decHalf || dd < -decHalf) continue;
    let dr = Math.abs(x.ra - c.ra); if (dr > 180) dr = 360 - dr; if (dr > raHalf) continue;
    const p = project(x.ra, x.dec, c); if (!p) continue; const q = toPx(p);
    if (q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > W) continue;
    n++;
    drawSymbol(ctx, x, q, Math.max(4, ((x.maj || 2) / 60) * D2R * scale / 2), css.getPropertyValue('--chart-obj'), mir);
    ctx.fillStyle = css.getPropertyValue('--chart-text'); ctx.fillText(x.m ? `M${x.m}` : x.c ? `C${x.c}` : x.n, q[0] + 7, q[1] - 5);
  }
  // the target
  const tp = project(o.ra, o.dec, c);
  if (tp) {
    const q = toPx(tp), rr = Math.max(6, ((o.maj || 2) / 60) * D2R * scale / 2);
    drawSymbol(ctx, o, q, rr, css.getPropertyValue('--chart-mark'), mir, true);
    ctx.fillStyle = css.getPropertyValue('--chart-mark'); ctx.font = 'bold 12px sans-serif'; ctx.fillText(o.n, q[0] + Math.min(rr, 30) + 4, q[1] + 4);
  }
  // overlays
  ctx.lineWidth = 1;
  if (telrad) {
    ctx.strokeStyle = css.getPropertyValue('--chart-mark'); ctx.setLineDash([4, 4]);
    for (const d of [0.5, 2, 4]) { ctx.beginPath(); ctx.arc(W / 2, W / 2, Math.tan((d / 2) * D2R) * scale, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (epc) {
    ctx.strokeStyle = css.getPropertyValue('--chart-ep'); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, Math.tan((Number(epc) / 2) * D2R) * scale, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }
  // scale bar + compass
  ctx.strokeStyle = css.getPropertyValue('--chart-text'); ctx.fillStyle = css.getPropertyValue('--chart-text'); ctx.font = '11px sans-serif';
  const bar = fov >= 10 ? 5 : fov >= 4 ? 1 : 0.5, bl = Math.tan(bar * D2R) * scale;
  ctx.beginPath(); ctx.moveTo(12, W - 12); ctx.lineTo(12 + bl, W - 12); ctx.stroke(); ctx.textAlign = 'left'; ctx.fillText(`${bar}°`, 12, W - 16);
  ctx.textAlign = 'center'; ctx.fillText('N', W / 2, 14); ctx.fillText('E', mir === -1 ? 10 : W - 10, W / 2 + 4);
  ctx.textAlign = 'right'; ctx.fillText(`${raStr(c.ra)} ${decStr(c.dec)}`, W - 8, W - 8);
}
function drawSymbol(ctx, x, q, r, color, mir, bold) {
  const fam = familyOf(x);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = bold ? 2 : 1;
  ctx.beginPath();
  if (fam === 'galaxy') {
    // PA runs from north toward east; on screen north is -y and east is mir*x
    const ratio = x.min && x.maj ? x.min / x.maj : 0.5, pa = (x.pa ?? 90) * D2R;
    ctx.ellipse(q[0], q[1], r, Math.max(2, r * ratio), Math.atan2(-Math.cos(pa), mir * Math.sin(pa)), 0, 2 * Math.PI);
  } else if (fam === 'open') { ctx.setLineDash([2, 2]); ctx.arc(q[0], q[1], r, 0, 2 * Math.PI); }
  else if (fam === 'globular') { ctx.arc(q[0], q[1], r, 0, 2 * Math.PI); ctx.moveTo(q[0] - r, q[1]); ctx.lineTo(q[0] + r, q[1]); ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0], q[1] + r); }
  else if (fam === 'planetary') { ctx.arc(q[0], q[1], Math.max(4, r), 0, 2 * Math.PI); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r); ctx.lineTo(q[0] + Math.cos(a) * (r + 4), q[1] + Math.sin(a) * (r + 4)); } }
  else if (fam === 'dark') { ctx.setLineDash([1, 3]); ctx.rect(q[0] - r, q[1] - r, 2 * r, 2 * r); }
  else if (fam === 'double') { ctx.arc(q[0], q[1], 4, 0, 2 * Math.PI); ctx.moveTo(q[0] - 8, q[1]); ctx.lineTo(q[0] + 8, q[1]); }
  else if (fam === 'star') { ctx.arc(q[0], q[1], 5, 0, 2 * Math.PI); }
  else { ctx.rect(q[0] - r, q[1] - r, 2 * r, 2 * r); }
  ctx.stroke(); ctx.setLineDash([]);
  if (bold) { ctx.beginPath(); ctx.moveTo(q[0] - r - 8, q[1]); ctx.lineTo(q[0] - r - 2, q[1]); ctx.moveTo(q[0] + r + 2, q[1]); ctx.lineTo(q[0] + r + 8, q[1]); ctx.stroke(); }
}
function bindChartGestures(o) {
  const cv = $('#chart'); if (!cv) return;
  const pxToRad = () => { const W = cv.clientWidth; return 1 / ((W / 2) / Math.tan((S.chart.fov / 2) * D2R)); };
  cv.onpointerdown = (e) => { chartDrag = { x: e.clientX, y: e.clientY, c: { ...(chartCenter || { ra: o.ra, dec: o.dec }) } }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => {
    if (!chartDrag) return;
    const k = pxToRad(), mir = S.chart.mirror ? 1 : -1;
    const dx = (e.clientX - chartDrag.x) * k * mir, dy = -(e.clientY - chartDrag.y) * k;
    chartCenter = unproject(-dx, -dy, chartDrag.c); drawChart(o);
  };
  cv.onpointerup = cv.onpointercancel = () => { chartDrag = null; };
  cv.ondblclick = () => { chartCenter = null; drawChart(o); };
  cv.onwheel = (e) => { e.preventDefault(); const f = [1, 2, 5, 10, 20, 45]; let i = f.indexOf(S.chart.fov); i = Math.max(0, Math.min(f.length - 1, i + (e.deltaY > 0 ? 1 : -1))); S.chart.fov = f[i]; $('#chart-fov').value = String(f[i]); drawChart(o); };
}

// ------------------------------------------------------------ night planning
function dateKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function noonOf(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0).getTime(); }
const hm = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
// sun/moon events for the night starting at local noon `noon` (ms)
function nightInfo(noon) {
  const lat = S.loc.lat, lon = S.loc.lon;
  const sunAlt = (t) => { const p = Planets.compute(new Date(t), lat, lon)[0]; return altAz(p.ra, p.dec, new Date(t), lat, lon).alt; };
  const ev = { sunset: null, darkStart: null, darkEnd: null, sunrise: null };
  let prev = sunAlt(noon);
  for (let t = noon + 300000; t <= noon + 86400000; t += 300000) {
    const a = sunAlt(t);
    if (prev >= -0.833 && a < -0.833) ev.sunset = new Date(t);
    if (prev >= -18 && a < -18) ev.darkStart = new Date(t);
    if (prev < -18 && a >= -18) ev.darkEnd = new Date(t);
    if (prev < -0.833 && a >= -0.833) ev.sunrise = new Date(t);
    prev = a;
  }
  const mid = noon + 43200000, moon = Planets.compute(new Date(mid), lat, lon)[1];
  ev.moon = moon; ev.moonAltMid = altAz(moon.ra, moon.dec, new Date(mid), lat, lon).alt;
  ev.moonRise = null; ev.moonSet = null;
  let pm = altAz(moon.ra, moon.dec, new Date(noon), lat, lon).alt;
  for (let t = noon + 600000; t <= noon + 86400000; t += 600000) {
    const m = Planets.compute(new Date(t), lat, lon)[1], a = altAz(m.ra, m.dec, new Date(t), lat, lon).alt;
    if (pm < 0 && a >= 0 && !ev.moonRise) ev.moonRise = new Date(t);
    if (pm >= 0 && a < 0 && !ev.moonSet) ev.moonSet = new Date(t);
    pm = a;
  }
  ev.start = ev.darkStart || ev.sunset || new Date(noon + 8 * 3600000);
  ev.end = ev.darkEnd || ev.sunrise || new Date(noon + 18 * 3600000);
  return ev;
}
// altitude track of an object across the night: transit time, max alt, hours above 30°
function nightTrack(o, ni) {
  const lat = S.loc.lat, lon = S.loc.lon, t0 = ni.start.getTime(), t1 = ni.end.getTime();
  let best = { alt: -99, t: null }, above = 0, first = null;
  for (let t = t0; t <= t1; t += 600000) {
    const a = altAz(o.ra, o.dec, new Date(t), lat, lon).alt;
    if (a > best.alt) best = { alt: a, t };
    if (a >= 30) { above += 1 / 6; if (!first) first = t; }
  }
  // transit: when LST == RA
  const lst0 = lst(new Date(t0), lon); let dt = (((o.ra - lst0) % 360) + 360) % 360 / 360.98564736629 * 86400000;
  let transit = t0 + dt; if (transit > t1 + 3600000) transit -= 86164000;
  const inWindow = transit >= t0 - 1800000 && transit <= t1 + 1800000;
  // `when` is the time to observe it: the transit if it falls in the dark window, else the moment of best altitude
  return { best, above, first, transit: new Date(transit), inWindow, when: new Date(inWindow ? transit : best.t) };
}
function currentPlan() { return S.plans.find((p) => p.name === S.plan) || null; }
function savePlan(p, msg) { return act({ 'put-plan': { name: p.name, date: p.date, site: p.site, targets: p.targets, notes: p.notes || '' } }, msg); }
function addToPlan(id) {
  let p = currentPlan();
  if (!p) { const name = `Night of ${dateKey(Date.now())}`; p = { name, date: noonOf(dateKey(Date.now())), site: S.site, targets: [], notes: '' }; S.plan = name; }
  if (p.targets.includes(id)) { toast('Already on the plan'); return; }
  p.targets = [...p.targets, id];
  savePlan(p, `${S.byId.get(id)?.n || id} added to "${p.name}"`);
}
function suggestTargets(p, n = 25) {
  const ni = nightInfo(p.date), have = new Set(p.targets);
  const moonBright = ni.moon.illum > 0.5 && ni.moonAltMid > 0;
  const out = [];
  for (const o of S.catalog) {
    if (have.has(o.id) || S.seen.has(o.id) || o.src === 'SOL') continue;
    if (!(o.m || o.c || o.cn || o.src === 'DBL')) continue;
    if (moonBright && !['open', 'globular', 'double', 'planetary'].includes(familyOf(o))) continue;
    const tr = nightTrack(o, ni); if (tr.above < 1) continue;
    out.push({ o, tr, score: (o.m ? 0 : o.c ? 1 : 2) + (o.mag ?? 12) / 10 - tr.above / 20 });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, n);
}
let planSearch = '';
function renderPlan() {
  const el = $('#plan'); if (!el) return;
  const p = currentPlan();
  const sel = `<select id="plan-select">${S.plans.map((x) => `<option value="${esc(x.name)}"${x.name === S.plan ? ' selected' : ''}>${esc(x.name)} · ${dateKey(x.date)}</option>`).join('')}<option value="__new">＋ New plan…</option></select>`;
  if (!p) {
    el.innerHTML = `<div class="card"><h3>Night plans</h3><div class="searchbar">${sel}</div>
      <form id="plan-new" class="form"><label>Date <input type="date" name="date" value="${dateKey(Date.now())}" required></label><label>Name <input name="name" placeholder="Night of …"></label><label>Site <input name="site" value="${esc(S.site)}"></label><label>&nbsp;<button class="primary">Create plan</button></label></form>
      <div class="muted">A plan is a target list for one night. Add objects from their pages with "＋ Plan", or let the planner suggest targets that are well placed after dark.</div></div>`;
    bindPlanCommon(el); return;
  }
  const ni = nightInfo(p.date);
  const rows = p.targets.map((id) => { const o = S.byId.get(id); return o ? { o, tr: nightTrack(o, ni) } : null; }).filter(Boolean);
  const sorted = rows.slice().sort((a, b) => a.tr.when - b.tr.when);
  const sugg = suggestTargets(p, 20);
  const q = planSearch ? search(planSearch, { family: '', src: '', seen: '', maxmag: '' }).slice(0, 8) : [];
  el.innerHTML = `
    <div class="card"><div class="searchbar">${sel}<button id="plan-print" class="primary">🖨 Print / PDF</button><button id="plan-del" class="danger">Delete plan</button></div>
      <div class="form">
        <label>Date <input type="date" id="plan-date" value="${dateKey(p.date)}"></label>
        <label>Name <input id="plan-name" value="${esc(p.name)}"></label>
        <label>Site <input id="plan-site" value="${esc(p.site)}"></label>
        <label class="wide">Night notes <textarea id="plan-notes" placeholder="Weather, goals, equipment to bring…">${esc(p.notes || '')}</textarea></label>
        <label>&nbsp;<button id="plan-save" class="primary">Save</button></label>
      </div>
      <div class="night">
        <span><b>Sunset</b> ${hm(ni.sunset)}</span> <span><b>Dark</b> ${hm(ni.darkStart)} – ${hm(ni.darkEnd)}</span> <span><b>Sunrise</b> ${hm(ni.sunrise)}</span>
        <span><b>Moon</b> ${Math.round(ni.moon.illum * 100)}% ${ni.moon.waxing ? 'waxing' : 'waning'}${ni.moonRise ? `, rises ${hm(ni.moonRise)}` : ''}${ni.moonSet ? `, sets ${hm(ni.moonSet)}` : ''}${ni.moonAltMid < 0 && !ni.moonRise ? ', down all night' : ''}</span>
        <span class="muted">lat ${S.loc.lat}, lon ${S.loc.lon} (Gear tab)</span>
      </div>
    </div>
    <div class="card"><h3>Targets (${rows.length}) <span class="muted" style="font-weight:400">in transit order</span></h3>
      ${rows.length ? `<div class="muted" style="font-size:12px">* does not transit during darkness; time shown is when it is highest in the dark window.</div><table class="targets"><tr><th></th><th>Object</th><th>Type</th><th class="num">Mag</th><th class="num">Best at</th><th class="num">Max alt</th><th class="num">Hrs &gt;30°</th><th></th></tr>
      ${sorted.map(({ o, tr }, i) => `<tr class="${tr.above < 0.5 ? 'poor' : ''}"><td class="num">${i + 1}</td><td><a href="#${esc(o.id)}" data-obj="${esc(o.id)}"><b>${esc(o.n)}</b></a>${o.cn ? ' <span class="muted">' + esc(o.cn[0]) + '</span>' : ''}${S.seen.has(o.id) ? ' <span class="badge seen">seen</span>' : ''}</td><td>${esc(TYPE_LABEL[o.t] || o.t)} · ${esc(conName(o.con))}</td><td class="num">${o.mag != null ? fmt(o.mag, 1) : '—'}</td><td class="num">${hm(tr.when)}${tr.inWindow ? '' : '*'}</td><td class="num">${tr.best.alt.toFixed(0)}°</td><td class="num">${tr.above.toFixed(1)}</td><td><button class="small danger" data-rm="${esc(o.id)}">×</button></td></tr>`).join('')}</table>` : '<div class="muted">No targets yet. Add from the suggestions below, search, or the "＋ Plan" button on any object.</div>'}
    </div>
    <div class="card"><h3>Add targets</h3>
      <div class="searchbar"><input id="plan-q" type="search" placeholder="Search to add…" value="${esc(planSearch)}"></div>
      ${q.length ? `<div class="chips">${q.map((o) => `<button class="small" data-add="${esc(o.id)}">＋ ${esc(o.n)}${o.cn ? ' · ' + esc(o.cn[0]) : ''}</button>`).join('')}</div>` : ''}
      <h3 style="margin-top:10px">Suggested for this night <span class="muted" style="font-weight:400">— unseen, well placed after dark${ni.moon.illum > 0.5 && ni.moonAltMid > 0 ? ', bright-moon friendly' : ''}</span></h3>
      ${sugg.length ? `<div class="chips">${sugg.map(({ o, tr }) => `<button class="small" data-add="${esc(o.id)}" title="${esc(TYPE_LABEL[o.t] || o.t)}, best ${hm(tr.when)}, max ${tr.best.alt.toFixed(0)}°">＋ ${esc(o.n)}${o.cn ? ' · ' + esc(o.cn[0]) : ''} <span class="muted">${o.mag != null ? fmt(o.mag, 1) : ''}</span></button>`).join('')}</div><div style="margin-top:6px"><button id="plan-add-all" class="small">Add all suggestions</button></div>` : '<div class="muted">Nothing left to suggest.</div>'}
    </div>`;
  bindPlanCommon(el);
  $('#plan-save').onclick = () => { const np = { ...p, name: $('#plan-name').value || p.name, date: noonOf($('#plan-date').value), site: $('#plan-site').value, notes: $('#plan-notes').value }; if (np.name !== p.name) { act({ 'del-plan': p.name }); S.plan = np.name; } savePlan(np, 'Plan saved'); };
  $('#plan-del').onclick = () => { if (confirm(`Delete plan "${p.name}"?`)) { S.plan = null; act({ 'del-plan': p.name }, 'Plan deleted'); } };
  $('#plan-print').onclick = () => openPrintView(p);
  $('#plan-q').oninput = (e) => { planSearch = e.target.value; renderPlan(); $('#plan-q').focus(); const v = $('#plan-q'); v.setSelectionRange(v.value.length, v.value.length); };
  $$('[data-add]', el).forEach((b) => b.onclick = () => { planSearch = ''; addToPlan(b.dataset.add); });
  $$('[data-rm]', el).forEach((b) => b.onclick = () => { p.targets = p.targets.filter((x) => x !== b.dataset.rm); savePlan(p, 'Removed'); });
  const all = $('#plan-add-all'); if (all) all.onclick = () => { p.targets = [...p.targets, ...sugg.map((x) => x.o.id)]; savePlan(p, `${sugg.length} targets added`); };
  $$('[data-obj]', el).forEach((a) => a.onclick = (e) => { e.preventDefault(); selectObject(a.dataset.obj); showTab('objects'); });
}
function bindPlanCommon(el) {
  const ps = $('#plan-select'); if (ps) ps.onchange = () => { if (ps.value === '__new') { S.plan = null; renderPlan(); } else { S.plan = ps.value; renderPlan(); } };
  const f = $('#plan-new'); if (f) f.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(f); const name = fd.get('name') || `Night of ${fd.get('date')}`; S.plan = name; savePlan({ name, date: noonOf(fd.get('date')), site: fd.get('site') || '', targets: [], notes: '' }, 'Plan created'); };
}
// ---- printable report
async function openPrintView(p) {
  await ensureChartData();
  const ni = nightInfo(p.date);
  const rows = p.targets.map((id) => { const o = S.byId.get(id); return o ? { o, tr: nightTrack(o, ni) } : null; }).filter(Boolean).sort((a, b) => a.tr.when - b.tr.when);
  const pv = $('#print-view');
  const chartImg = (o, fov) => { const cv = document.createElement('canvas'); drawChart(o, { canvas: cv, size: 560, fov, telrad: true, mirror: false, ep: '', center: { ra: o.ra, dec: o.dec }, print: true }); return cv.toDataURL('image/png'); };
  const dssUrl = (o) => `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=480&height=480&fov=${Math.max(0.15, ((o.maj || 10) / 60) * 2.5).toFixed(3)}&projection=TAN&coordsys=icrs&ra=${o.ra}&dec=${o.dec}&format=jpg`;
  const hintText = (o) => S.gear.scopes.slice(0, 2).map((sc) => { const h = hintFor(o, sc); const b = h.eps[0]; return `<div><b>${esc(sc.name)}</b>: ${esc(h.label)}, ${h.lo === h.hi ? '≈' + h.lo : h.lo + '–' + h.hi}×${b ? ` (${esc(b.e.name)} → ${Math.round(b.mag)}×, ${b.fov.toFixed(2)}° field)` : ''}${h.diff ? ` · ${esc(h.diff.text)}` : ''}</div>${h.tips.slice(0, 2).map((t) => `<div class="ptip">${esc(t)}</div>`).join('')}`; }).join('') || `<div class="ptip">${renderGenericHint(o).replace(/<[^>]+>/g, '')}</div>`;
  pv.innerHTML = `
    <div class="print-tools"><button id="print-go" class="primary">🖨 Print / Save as PDF</button> <label><input type="checkbox" id="print-dss" checked> include DSS images</label> <label><input type="checkbox" id="print-notes" checked> notes lines</label> <button id="print-close">Close</button> <span class="muted">Tip: in the print dialog choose "Save as PDF", portrait, and turn on background graphics.</span></div>
    <div class="sheet cover">
      <h1>${esc(p.name)}</h1>
      <div class="cover-meta">${new Date(p.date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${p.site ? ' · ' + esc(p.site) : ''} · lat ${S.loc.lat}, lon ${S.loc.lon}</div>
      <table class="night-table"><tr><th>Sunset</th><th>Astronomical dark</th><th>Sunrise</th><th>Moon</th></tr>
        <tr><td>${hm(ni.sunset)}</td><td>${hm(ni.darkStart)} – ${hm(ni.darkEnd)}</td><td>${hm(ni.sunrise)}</td><td>${Math.round(ni.moon.illum * 100)}% ${ni.moon.waxing ? 'waxing' : 'waning'}${ni.moonRise ? `, rises ${hm(ni.moonRise)}` : ''}${ni.moonSet ? `, sets ${hm(ni.moonSet)}` : ''}</td></tr></table>
      ${p.notes ? `<div class="pnotes">${esc(p.notes)}</div>` : ''}
      <h2>Targets in transit order</h2>
      <table class="targets"><tr><th>#</th><th>Object</th><th>Type</th><th>Con</th><th>RA</th><th>Dec</th><th>Mag</th><th>Size</th><th>Best at</th><th>Max alt</th><th>Seen</th></tr>
      ${rows.map(({ o, tr }, i) => `<tr><td>${i + 1}</td><td><b>${esc(o.n)}</b>${o.m ? ' (M ' + o.m + ')' : o.c ? ' (C ' + o.c + ')' : ''}${o.cn ? '<br><small>' + esc(o.cn[0]) + '</small>' : ''}</td><td>${esc(TYPE_LABEL[o.t] || o.t)}</td><td>${esc(o.con)}</td><td>${raStr(o.ra)}</td><td>${decStr(o.dec)}</td><td>${o.mag != null ? fmt(o.mag, 1) : '—'}</td><td>${esc(sizeStr(o))}</td><td>${hm(tr.when)}${tr.inWindow ? '' : '*'}</td><td>${tr.best.alt.toFixed(0)}°</td><td>☐</td></tr>`).join('')}</table>
      <div class="ptip">* does not transit during darkness; shown at its highest point in the dark window.</div>
      <div class="pfoot">Generated by astro on ~${S.ship} · ${new Date().toLocaleString()}</div>
    </div>
    ${rows.map(({ o, tr }, i) => `
    <div class="sheet target">
      <div class="thead"><h2>${i + 1}. ${esc(o.n)}${o.m ? ` <span class="pb">Messier ${o.m}</span>` : ''}${o.c ? ` <span class="pb">Caldwell ${o.c}</span>` : ''}</h2><div class="tsub">${o.cn ? esc(o.cn.join(' · ')) + ' · ' : ''}${esc(TYPE_LABEL[o.t] || o.t)} in ${esc(conName(o.con))}</div></div>
      <div class="pfacts">
        <div><span>RA / Dec</span>${raStr(o.ra)} &nbsp; ${decStr(o.dec)}</div>
        <div><span>Magnitude</span>${o.mag != null ? fmt(o.mag, 1) + (o.magb ? ' (B)' : '') + (o.mag2 != null ? ' / ' + fmt(o.mag2, 1) : '') : '—'}</div>
        <div><span>Size</span>${esc(sizeStr(o))}${o.pa != null ? ', PA ' + o.pa + '°' : ''}</div>
        ${o.sb != null ? `<div><span>Surface br.</span>${o.sb} mag/″²</div>` : ''}
        <div><span>${tr.inWindow ? 'Transit' : 'Highest (dark)'}</span>${hm(tr.when)} at ${tr.best.alt.toFixed(0)}° alt</div>
        <div><span>Above 30°</span>${tr.above.toFixed(1)} h${tr.first ? ' from ' + hm(new Date(tr.first)) : ''}</div>
      </div>
      ${o.notes ? `<div class="ptip">${esc(o.notes)}</div>` : ''}
      <div class="phints">${hintText(o)}</div>
      <div class="pimgs">
        <figure><img src="${chartImg(o, 10)}"><figcaption>Finder, 10° field, Telrad circles (0.5°, 2°, 4°). North up, east left.</figcaption></figure>
        <figure><img src="${chartImg(o, 2)}"><figcaption>Eyepiece field, 2°, stars to mag 8.5.</figcaption></figure>
        <figure class="dss"><img src="${dssUrl(o)}" crossorigin="anonymous"><figcaption>DSS2 color.</figcaption></figure>
      </div>
      <div class="pobs"><b>Observed</b> ☐ &nbsp; time ______ &nbsp; eyepiece ________ &nbsp; seeing ☐☐☐☐☐ &nbsp; transparency ☐☐☐☐☐ &nbsp; imaged ☐
        <div class="lines"><div></div><div></div><div></div><div></div></div></div>
    </div>`).join('')}`;
  document.body.classList.add('printing'); window.scrollTo(0, 0);
  $('#print-go').onclick = () => window.print();
  $('#print-close').onclick = () => { document.body.classList.remove('printing'); pv.innerHTML = ''; };
  $('#print-dss').onchange = (e) => pv.classList.toggle('no-dss', !e.target.checked);
  $('#print-notes').onchange = (e) => pv.classList.toggle('no-notes', !e.target.checked);
}

// ------------------------------------------------------------ navigation
function selectObject(id) { S.sel = id; renderList(); renderDetail(); $('.split').classList.add('show-detail'); if (S.mobile) window.scrollTo(0, 0); const row = $(`.row[data-id="${CSS.escape(id)}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); location.hash = id; }
function showTab(name) {
  $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'objects' && S.sel) { const o = S.byId.get(S.sel); if (o) setTimeout(() => drawChart(o), 0); }
  if (name === 'plan') renderPlan();
}

// ------------------------------------------------------------ init
async function init() {
  try { const l = JSON.parse(localStorage.getItem('astro-loc') || 'null'); if (l) S.loc = l; if (localStorage.getItem('astro-night') === '1') document.body.classList.add('night'); } catch {}
  loadQueue();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/astro/sw.js', { scope: '/astro/' }).catch((e) => console.warn('sw', e));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; renderGear(); });
  window.addEventListener('online', () => { S.offline = false; flushQueue(); });
  window.addEventListener('offline', () => { S.offline = true; renderNet(); });
  $('#status').textContent = 'loading catalog…';
  const [cat, lines] = await Promise.all([fetch('/astro/data/catalog.jsn').then((r) => r.json()), fetch('/astro/data/lines.jsn').then((r) => r.json())]);
  S.catalog = cat; S.lines = lines; for (const [ab, name] of lines.names) S.conNames[ab] = name;
  prepCatalog();
  refreshPlanets();
  const mq = window.matchMedia('(max-width: 720px)'); S.mobile = mq.matches; mq.onchange = () => { S.mobile = mq.matches; };
  try { await loadState(); } catch (e) { toast(`Ship unreachable — working offline from cached data`, true); for (const it of Q.items) applyLocal(it.json); }
  setInterval(() => { if (Q.items.length) flushQueue(); else if (S.offline) loadState().then(render).catch(() => {}); }, 60000);
  flushQueue();
  // controls
  const q = $('#q'); q.oninput = () => { S.query = q.value; renderList(); };
  q.onkeydown = (e) => { if (e.key === 'Enter' && listCache.length) selectObject(listCache[0].id); };
  $('#f-family').innerHTML = '<option value="">All types</option>' + Object.entries(FAMILY_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#f-src').innerHTML = '<option value="">All catalogs</option><option value="M">Messier</option><option value="C">Caldwell</option>' + Object.entries(SRC_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  for (const id of ['f-family', 'f-src', 'f-seen', 'f-maxmag', 'f-sort']) $('#' + id).onchange = () => { S.filters = { family: $('#f-family').value, src: $('#f-src').value, seen: $('#f-seen').value, maxmag: $('#f-maxmag').value }; S.sort = $('#f-sort').value; renderList(); updateFilterButton(); };
  $('#filters-toggle').onclick = () => { $('.searchbar').classList.toggle('open'); updateFilterButton(); };
  $('#list').onclick = (e) => { const r = e.target.closest('.row'); if (r) selectObject(r.dataset.id); };
  $$('nav button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  document.body.addEventListener('click', (e) => { const a = e.target.closest('a[data-tab]'); if (a) { e.preventDefault(); showTab(a.dataset.tab); } });
  const setNight = (on) => { document.body.classList.toggle('night', on); try { localStorage.setItem('astro-night', on ? '1' : '0'); } catch {} const o = S.byId.get(S.sel); if (o) drawChart(o); $('#night').textContent = on ? '🔴 Day' : '🔴 Night'; };
  $('#night').onclick = () => setNight(!document.body.classList.contains('night'));
  const dim = $('#dim'); try { dim.value = localStorage.getItem('astro-dim') || '0'; } catch {}
  const applyDim = () => { document.body.style.setProperty('--dim', dim.value); try { localStorage.setItem('astro-dim', dim.value); } catch {} };
  dim.oninput = applyDim; applyDim();
  document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'n' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setNight(!document.body.classList.contains('night')); });
  if (document.body.classList.contains('night')) $('#night').textContent = '🔴 Day';
  $('#log-search').oninput = renderLog; $('#log-imaged').onchange = renderLog;
  $('#export-csv').onclick = () => exportLog('csv'); $('#export-json').onclick = () => exportLog('json');
  window.addEventListener('resize', () => { const o = S.byId.get(S.sel); if (o) drawChart(o); });
  render();
  const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && S.byId.has(h) && h !== S.sel) { selectObject(h); showTab('objects'); } };
  window.addEventListener('hashchange', fromHash); fromHash();
  setInterval(() => {
    refreshPlanets();
    const o = S.byId.get(S.sel), el = $('#now-altaz'); if (o && el) el.textContent = nowStr(o);
    if (o && o.src === 'SOL' && $('#tab-objects').classList.contains('active')) { const c = $('#chart'); if (c && !chartDrag) drawChart(o); }
  }, 30000);
}
if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined') module.exports = { search, hintFor, nightInfo, nightTrack, suggestTargets, project, unproject, altAz, bestMonth, norm, S, prepCatalog, numCmp, TYPE_LABEL, FAMILY };
