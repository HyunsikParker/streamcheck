import { STEPS, FIELDS, SIDES, answerKeys, optionLabel, keyLabel } from './protocol.js';
import { runChecks, unresolved } from './checks.js';
import { indicators, suggestion, agreement, confidence, oneHealth, CLASS_NAME } from './score.js';
import { toFhirBundle } from './fhir.js';
import { fetchWeather } from './weather.js';
import { EXAMPLES } from './examples.js';
import { OAH_SITES } from './oah-sites.js';
import { readExif, distanceM, formatDistance, photoAgeHours } from './evidence.js';

const KEY = 'streamcheck:v2';
const app = document.getElementById('app');
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EXCLUSIVE = ['none', 'NONE', 'NS'];

let store = load();
let screen = 'home';
let stepIndex = 0;
let map = null;
let marker = null;
let focusKey = null;

function blank() {
  return { site: { code: null, name: '', city: null, lat: null, lon: null }, weather: null, weatherState: 'idle', obs: {}, decisions: {}, evidence: { here: null, photos: {} }, createdAt: null, example: null };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.draft) return s;
  } catch { /* storage unavailable */ }
  return { draft: blank(), history: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
  $('#history-count').textContent = store.history.length;
}
const d = () => store.draft;
const ev = () => (d().evidence ||= { here: null, photos: {} });

function go(name, opts = {}) {
  screen = name;
  if (opts.step !== undefined) stepIndex = opts.step;
  focusKey = opts.focus || null;
  render();
  if (!focusKey) window.scrollTo({ top: 0 });
  app.focus({ preventScroll: true });
}

function render() {
  if (map) { map.remove(); map = null; marker = null; }
  const view = { home, place, step, review, result, history }[screen] || home;
  app.innerHTML = `<div class="fade">${view()}</div>`;
  after[screen]?.();
  save();
}

// ---------- home ----------

function home() {
  const hasDraft = Object.keys(d().obs).length > 0;
  return `
  <section class="hero">
    <span class="kicker">OneAquaHealth · Track 3 · AI-supported assessment</span>
    <h1>A second look at every stream assessment.</h1>
    <p>StreamCheck follows the OneAquaHealth citizen science questions, then checks your answers against each other and the last three days of weather. When something looks off, it tells you why and shows the data. You decide, and your decision is kept with the record.</p>
    <div class="row">
      <button class="btn primary" data-act="start">Start an assessment</button>
      ${hasDraft ? '<button class="btn secondary" data-act="resume">Resume draft</button>' : ''}
    </div>
  </section>
  <ol class="how">
    <li><div><b>Same questions, plain words</b><span>Channel, water, margins and your overall rating, with the scientific term under each question.</span></div></li>
    <li><div><b>Explained checks</b><span>Contradictions, weather mismatches and ratings that disagree with what you recorded are flagged with the reason.</span></div></li>
    <li><div><b>One Health and FHIR</b><span>Notes for the ecosystem, animals and people, and an export shaped by the OneAquaHealth FHIR guide.</span></div></li>
  </ol>
  <h2 class="section">Try an example at a research site</h2>
  <div class="examples">
    ${EXAMPLES.map((e, i) => `<button class="example" data-example="${i}"><b>${esc(e.title)}</b><span>${esc(e.blurb)}</span></button>`).join('')}
  </div>
  <p class="note">Example answers are invented for the demo. Sites are real OneAquaHealth research sites; weather is live.</p>`;
}

// ---------- place ----------

function place() {
  const s = d().site;
  return `
  ${progress(0)}
  <div class="step-head"><span class="kicker">Step 1 of ${STEPS.length + 1}</span><h1>Where are you?</h1><p>Pick one of the 106 OneAquaHealth research sites (teal dots), or tap anywhere on the map to add your own spot.</p></div>
  <div id="map" role="application" aria-label="Map. Tap a research site or any point."></div>
  <div class="row" style="margin-bottom:12px"><button class="btn secondary small" data-act="locate">Use my location</button><button class="btn secondary small" data-act="here" ${s.lat === null ? 'disabled' : ''}>Confirm I'm here</button>${s.code ? `<span class="site-chip">Research site ${esc(s.code)} · ${esc(s.city)}</span>` : ''}</div>
  <p class="note" id="here">${hereLine()}</p>
  <div class="field"><label for="site-name">Site name</label><input id="site-name" value="${esc(s.name)}" placeholder="e.g. Brook behind the school" autocomplete="off"></div>
  <div id="wx">${weatherBlock()}</div>
  <div class="nav"><button class="btn secondary" data-go="home">Back</button><button class="btn primary" data-act="next" ${s.lat === null ? 'disabled' : ''}>Next</button></div>`;
}

function hereLine() {
  const h = ev().here;
  const s = d().site;
  if (!h || s.lat === null) return 'Optional: confirm you are at the site. Your position is only compared with the site, never sent anywhere.';
  const dist = distanceM(h.lat, h.lon, s.lat, s.lon);
  const ok = dist <= Math.max(500, h.accuracy || 0);
  return `${ok ? '✓' : '⚠'} Your phone is ${formatDistance(dist)} from this site (±${Math.round(h.accuracy || 0)} m).`;
}

function weatherBlock() {
  const w = d().weather;
  const st = d().weatherState;
  if (st === 'loading') return '<p class="note">Loading the last three days of weather…</p>';
  if (st === 'failed') return '<p class="note err">Weather could not be loaded. You can continue; weather checks will be skipped.</p>';
  if (!w) return '<p class="note">Choose a spot to load recent weather.</p>';
  const v = (x) => (x === null || x === undefined ? '–' : x);
  return `<div class="weather">
    <div class="wx"><b>${v(w.rain48h)}<small> mm</small></b><span>Rain, last 48 h</span></div>
    <div class="wx"><b>${v(w.airMean3d)}°</b><span>Air, 3-day mean</span></div>
    <div class="wx"><b>${v(w.airMaxToday)}°</b><span>Air, today's high</span></div>
  </div><p class="note">Open-Meteo, fetched ${new Date(w.fetchedAt).toLocaleString()}.</p>`;
}

async function setSite(lat, lon, oah = null) {
  const s = d().site;
  if (oah) Object.assign(s, { code: oah.code, name: oah.name.trim() || oah.code, city: oah.city, lat: oah.lat, lon: oah.lon });
  else Object.assign(s, { code: null, city: null, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 });
  if (screen === 'place') {
    if (map) { if (marker) marker.setLatLng([s.lat, s.lon]); else marker = L.marker([s.lat, s.lon]).addTo(map); }
    $('#site-name').value = s.name;
    $('[data-act="next"]')?.removeAttribute('disabled');
    $('[data-act="here"]')?.removeAttribute('disabled');
    if ($('#here')) $('#here').textContent = hereLine();
    const row = $('.site-chip');
    if (s.code && !row) $('[data-act="locate"]').insertAdjacentHTML('afterend', `<span class="site-chip">Research site ${esc(s.code)} · ${esc(s.city)}</span>`);
    else if (row) row.outerHTML = s.code ? `<span class="site-chip">Research site ${esc(s.code)} · ${esc(s.city)}</span>` : '';
  }
  d().weatherState = 'loading';
  if (screen === 'place') $('#wx').innerHTML = weatherBlock();
  const w = await fetchWeather(s.lat, s.lon);
  d().weather = w;
  d().weatherState = w ? 'ok' : 'failed';
  save();
  if (screen === 'place') $('#wx').innerHTML = weatherBlock();
}

function makeMap(id, center, zoom) {
  if (!window.L) return null;
  const m = L.map(id).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(m);
  return m;
}

// ---------- questions ----------

function progress(n) {
  const total = STEPS.length + 2;
  return `<div class="progress" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'done' : i === n ? 'now' : ''}"></span>`).join('')}</div>`;
}

function openFlagKeys() {
  return new Set(currentFlags().filter((f) => f.severity !== 'alert' && !d().decisions[f.id]).flatMap((f) => f.fields));
}

function step() {
  const s = STEPS[stepIndex];
  const flagged = openFlagKeys();
  const body = s.paired ? paired(s, flagged) : s.fields.filter((f) => !f.showIf || f.showIf(d().obs)).map((f) => question(f, flagged.has(f.id))).join('');
  return `
  ${progress(stepIndex + 1)}
  <div class="step-head"><span class="kicker">Step ${stepIndex + 2} of ${STEPS.length + 1}</span><h1>${esc(s.title)}</h1><p>${esc(s.hint)}</p></div>
  ${body}
  <div class="nav"><button class="btn secondary" data-act="prev">Back</button><button class="btn primary" data-act="next">${stepIndex === STEPS.length - 1 ? 'Take a second look' : 'Next'}</button></div>`;
}

const term = (f) => `<span class="term">Scientists call this: <b>${esc(f.term)}</b></span>`;

function question(f, flagged) {
  const v = d().obs[f.id];
  if (f.type === 'number') {
    return `<div class="q ${flagged ? 'flagged' : ''}" id="q-${f.id}"><label class="q-label" for="in-${f.id}">${esc(f.label)}${f.optional ? ' <small>(optional)</small>' : ''}</label><br>${term(f)}
      <div class="num"><input id="in-${f.id}" data-num="${f.id}" type="number" inputmode="decimal" min="${f.min}" max="${f.max}" step="${f.step || 0.1}" value="${v ?? ''}"><span class="unit">${esc(f.unit)}</span></div></div>`;
  }
  if (f.type === 'photos') {
    const ph = ev().photos;
    return `<div class="q" id="q-${f.id}"><div class="q-label">${esc(f.label)}</div>${term(f)}
      <div class="photos">${f.slots.map((sl) => {
        const p = ph[sl.id];
        return `<div class="photo">
          <label class="shot">${p?.thumb ? `<img src="${p.thumb}" alt="${esc(sl.label)} photo">` : `<span>+ ${esc(sl.label)}</span>`}
            <input type="file" accept="image/*" capture="environment" data-slot="${sl.id}" aria-label="${esc(sl.label)} photo"></label>
          <div class="meta">${p ? photoMeta(p) : esc(sl.label)}</div>
          ${p ? `<button class="link inline" data-rmphoto="${sl.id}">Remove</button>` : ''}
        </div>`;
      }).join('')}</div></div>`;
  }
  if (f.type === 'feelings') {
    const cur = v || {};
    return `<div class="q" id="q-${f.id}"><div class="q-label">${esc(f.label)}</div>${term(f)}
      <div class="moods">${f.moods.map((m) => `<label class="mood"><span>${esc(m.label)}</span><input type="range" min="0" max="5" step="1" data-mood="${m.id}" value="${cur[m.id] ?? 0}" aria-label="${esc(m.label)}, 0 to 5"><b data-mood-val="${m.id}">${cur[m.id] ?? '–'}</b></label>`).join('')}</div></div>`;
  }
  const type = f.multiple ? 'checkbox' : 'radio';
  const many = f.options.length > 4 ? 'grid2' : '';
  return `<div class="q ${flagged ? 'flagged' : ''}" id="q-${f.id}"><fieldset><legend>${esc(f.label)}${f.optional ? ' <small>(optional)</small>' : ''}</legend>${term(f)}
    <div class="opts ${many}">${f.options.map((o) => {
      const on = f.multiple ? (v || []).includes(o.value) : v === o.value;
      return `<label class="opt"><input type="${type}" name="${f.id}" value="${o.value}" ${on ? 'checked' : ''}><span>${esc(o.label)}</span></label>`;
    }).join('')}</div></fieldset></div>`;
}

function paired(s, flagged) {
  return s.fields.map((f) => `
    <div class="q ${answerKeys(f).some((k) => flagged.has(k)) ? 'flagged' : ''}" id="q-${f.id}">
      <div class="q-label">${esc(f.label)}</div>${term(f)}
      <div class="pair">${SIDES.map((side) => {
        const key = `${f.id}${side.id}`;
        return `<fieldset class="side" id="q-${key}"><legend>${side.label}</legend><div class="seg">${f.options.map((o) => `<label class="segopt"><input type="radio" name="${key}" value="${o.value}" ${d().obs[key] === o.value ? 'checked' : ''}><span>${esc(o.value === 'NS' ? 'Not sure' : o.label)}</span></label>`).join('')}</div></fieldset>`;
      }).join('')}</div>
    </div>`).join('');
}

function photoMeta(p) {
  const s = d().site;
  const bits = [];
  if (p.takenLocal) {
    const age = photoAgeHours(p.takenLocal, new Date(d().createdAt || Date.now()));
    bits.push(`taken ${p.takenLocal.replace('T', ' ').slice(0, 16)}${age !== null && age > 48 ? ' ⚠ older than 2 days' : ''}`);
  } else bits.push('no capture time');
  if (Number.isFinite(p.lat) && s.lat !== null) {
    const dist = distanceM(p.lat, p.lon, s.lat, s.lon);
    bits.push(`${dist <= 500 ? '✓' : '⚠'} ${formatDistance(dist)} from site`);
  } else bits.push('no location in file');
  return esc(bits.join(' · '));
}

async function addPhoto(slot, file) {
  const buf = await file.arrayBuffer();
  const exif = readExif(buf);
  const sha = async (algo) => new Uint8Array(await crypto.subtle.digest(algo, buf));
  const hex = [...(await sha('SHA-256'))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha1 = btoa(String.fromCharCode(...(await sha('SHA-1'))));
  let thumb = null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    thumb = c.toDataURL('image/jpeg', 0.7);
  } catch { /* unsupported image format; keep metadata only */ }
  ev().photos[slot] = { name: file.name, type: file.type || 'image/jpeg', size: file.size, sha256: hex, sha1, thumb, ...exif };
  save();
  render();
}

function readInputs() {
  for (const inp of app.querySelectorAll('[data-num]')) {
    const id = inp.dataset.num;
    const n = inp.value === '' ? undefined : Number(inp.value);
    if (n === undefined || Number.isNaN(n)) delete d().obs[id]; else d().obs[id] = n;
  }
}

function onOptionChange(inp) {
  const name = inp.name;
  const base = FIELDS[name] || FIELDS[name.slice(0, -1)];
  if (!base) return;
  if (base.multiple) {
    let list = [...app.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
    if (EXCLUSIVE.includes(inp.value) && inp.checked) list = [inp.value];
    else if (inp.checked) list = list.filter((x) => !EXCLUSIVE.includes(x));
    for (const x of app.querySelectorAll(`input[name="${name}"]`)) x.checked = list.includes(x.value);
    d().obs[name] = list;
  } else {
    d().obs[name] = inp.value;
  }
  if (name === 'dams' && inp.value !== 'Y') delete d().obs.numberOfDams;
  // Changing an answer that a kept flag was about re-opens that flag.
  for (const [id, dec] of Object.entries(d().decisions)) if (dec.fields?.includes(name)) delete d().decisions[id];
  save();
  if (name === 'dams') render();
}

// ---------- second look ----------

function currentFlags() {
  return runChecks(d().obs, d().weather, ev(), d().site, new Date(d().createdAt || Date.now()));
}

function review() {
  const flags = currentFlags();
  const questions = flags.filter((f) => f.severity !== 'alert');
  const alerts = flags.filter((f) => f.severity === 'alert');
  const open = unresolved(flags, d().decisions);
  const s = suggestion(indicators(d().obs));
  return `
  ${progress(STEPS.length + 1)}
  <div class="step-head"><span class="kicker">Second look</span><h1>${questions.length ? `${questions.length} answer${questions.length > 1 ? 's' : ''} to double-check` : 'Your answers are consistent'}</h1>
  <p>${questions.length ? 'These answers disagree with each other, with the recent weather, or with your overall rating. Nothing is changed for you: keep the answer and say why, or go back and change it.' : 'No contradictions between your answers, the recent weather and your rating.'}${d().weather ? '' : ' Weather was not available, so weather checks were skipped.'}</p></div>
  <div class="compare">
    <div><span class="kicker">Your rating</span><span class="cls ${(d().obs.overall || 'UNKNOWN').toLowerCase()}">${CLASS_NAME[d().obs.overall] || 'Not given'}</span></div>
    <div><span class="kicker">Indicator view</span><span class="cls ${s.level.toLowerCase()}">${s.label}</span></div>
  </div>
  ${!questions.length ? '<div class="allclear">✓ Nothing to double-check.</div>' : ''}
  ${questions.map(flagCard).join('')}
  ${alerts.length ? `<h2 class="section">Safety notes</h2>${alerts.map(flagCard).join('')}` : ''}
  <div class="nav"><button class="btn secondary" data-act="prev">Back</button><button class="btn primary" data-act="finish" ${open.length || !d().obs.overall ? 'disabled' : ''}>${!d().obs.overall ? 'Give your rating first' : open.length ? `${open.length} left to decide` : 'See the result'}</button></div>`;
}

function flagCard(f) {
  const dec = d().decisions[f.id];
  const answers = f.fields.includes('here') ? hereLine() : f.fields.includes('photos') ? '' : f.fields.filter((k) => d().obs[k] !== undefined).map((k) => `${keyLabel(k)}: ${optionLabel(k, d().obs[k], true)}`).join(' · ');
  const alert = f.severity === 'alert';
  const tag = alert ? '<span class="tag alert">Safety</span>' : dec ? '<span class="tag ok">Kept</span>' : '<span class="tag">Check</span>';
  return `<article class="flag ${alert ? 'alert' : ''} ${dec ? 'resolved' : ''}" data-flag="${f.id}">
    <h3>${tag}<span>${esc(f.title)}</span></h3>
    ${answers ? `<p class="answer">${esc(answers)}</p>` : ''}
    <p class="why">${esc(f.why)}</p>
    <p class="ask">${esc(f.ask)}</p>
    ${f.evidence ? `<p class="evidence">Data: ${esc(f.evidence)}</p>` : ''}
    ${alert ? '' : dec ? `<p class="evidence">Kept${dec.reason ? `: “${esc(dec.reason)}”` : ''} · <button class="link inline" data-undo="${f.id}">Undo</button></p>` : `
      <label class="note" for="why-${f.id}">Why keep it? (optional, helps experts)</label>
      <textarea id="why-${f.id}" placeholder="e.g. The outfall is 200 m downstream of the stretch I rated."></textarea>
      <div class="row"><button class="btn secondary small" data-change="${f.id}">Change my answer</button><button class="btn primary small" data-keep="${f.id}">Keep my answer</button></div>`}
  </article>`;
}

// ---------- result ----------

function buildRecord() {
  const flags = currentFlags();
  const groups = indicators(d().obs);
  const sugg = suggestion(groups);
  return {
    id: d().createdAt || new Date().toISOString(),
    createdAt: d().createdAt || new Date().toISOString(),
    site: { ...d().site }, weather: d().weather, obs: structuredClone(d().obs), evidence: structuredClone(ev()),
    flags, decisions: structuredClone(d().decisions), groups, suggestion: sugg,
    agreement: agreement(d().obs.overall, sugg),
    confidence: confidence(d().obs, flags, d().decisions),
    oneHealth: oneHealth(d().obs, d().weather, groups),
  };
}

const LANE_ICONS = {
  ecosystem: '<svg viewBox="0 0 24 24"><path d="M3 17c3-3 5-3 8 0s5 3 8 0"/><path d="M12 3c3 3 4 6 0 10-4-4-3-7 0-10z"/></svg>',
  animals: '<svg viewBox="0 0 24 24"><circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="18" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 2-2 1-4 0-4-2z"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></svg>',
};

function result() {
  const r = buildRecord();
  const own = r.obs.overall;
  const decided = r.flags.filter((f) => f.severity !== 'alert');
  return `
  <section class="result-top">
    <div class="rt-site"><span class="kicker">${r.site.code ? `OneAquaHealth site ${esc(r.site.code)} · ${esc(r.site.city)}` : 'Citizen site'}</span><h1>${esc(r.site.name || 'Unnamed site')}</h1><p>${new Date(r.createdAt).toLocaleString()} · confidence <b>${r.confidence.level}</b> · ${esc(r.confidence.why)}</p><p class="evline">${esc(evidenceLine(r))}</p></div>
    <div class="compare big">
      <div><span class="kicker">Your rating (recorded)</span><span class="cls ${own.toLowerCase()}">${CLASS_NAME[own]}</span></div>
      <div><span class="kicker">Indicator view</span><span class="cls ${r.suggestion.level.toLowerCase()}">${r.suggestion.label}</span></div>
    </div>
    <p class="agree ${r.agreement.state}">${esc(r.agreement.text)}</p>
  </section>
  <div class="groups">${r.groups.map((g) => `<div class="grp"><span class="cls small ${g.level.toLowerCase()}">${g.label}</span><b>${esc(g.title)}</b><span>${esc(g.why)}</span></div>`).join('')}</div>
  <h2 class="section">One Health</h2>
  <div class="lanes">${['ecosystem', 'animals', 'people'].map((k) => `<div class="lane"><h3>${LANE_ICONS[k]}${k[0].toUpperCase() + k.slice(1)}</h3><ul>${r.oneHealth[k].map((n) => `<li class="${n.level}">${esc(n.text)}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="audit"><h3>Second-look record</h3>${decided.length ? `<ol>${decided.map((f) => { const dc = r.decisions[f.id]; return `<li>${esc(f.title)}: <b>${dc?.action === 'keep' ? 'answer kept' : 'resolved'}</b>${dc?.reason ? `, “${esc(dc.reason)}”` : ''} <code>${f.id}</code></li>`; }).join('')}</ol>` : '<p class="note">No answers needed a second look.</p>'}</div>
  <div class="export"><h2 class="section">Share the data</h2>
    <p class="note">FHIR R4 bundle using the OneAquaHealth IG profiles (LocationOah, ObservationIndicatorsOah). Your rating and StreamCheck's suggestion are separate Observations.</p>
    <div class="row"><button class="btn secondary" data-act="fhir">Download FHIR bundle</button><button class="btn secondary" data-act="csv">Download CSV</button><button class="btn secondary" data-act="showfhir">Preview FHIR</button></div>
    <pre class="json" id="fhir-preview" hidden></pre></div>
  <div class="nav"><button class="btn secondary" data-act="prev">Back</button><button class="btn primary" data-act="save">Save to my records</button></div>`;
}

function evidenceLine(r) {
  const parts = [];
  const e = r.evidence || {};
  if (e.here && r.site.lat !== null) {
    const dist = distanceM(e.here.lat, e.here.lon, r.site.lat, r.site.lon);
    parts.push(`${dist <= Math.max(500, e.here.accuracy || 0) ? 'On site' : 'Away from site'}: phone ${formatDistance(dist)} from it`);
  } else parts.push('Location not confirmed');
  const photos = Object.values(e.photos || {}).filter(Boolean);
  if (photos.length) {
    const located = photos.filter((p) => Number.isFinite(p.lat) && distanceM(p.lat, p.lon, r.site.lat, r.site.lon) <= 500).length;
    parts.push(`${photos.length} photo${photos.length > 1 ? 's' : ''}, ${located} placed at the site by their own metadata`);
  } else parts.push('no photos');
  return `Field evidence: ${parts.join(' · ')}.`;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(r) {
  const rows = [['site_code', 'site_name', 'lat', 'lon', 'created', 'question', 'answer_code', 'answer']];
  for (const [k, v] of Object.entries(r.obs)) {
    if (k === 'feelings') continue;
    rows.push([r.site.code || '', r.site.name, r.site.lat, r.site.lon, r.createdAt, k, Array.isArray(v) ? v.join('|') : v, optionLabel(k, v)]);
  }
  rows.push([r.site.code || '', r.site.name, r.site.lat, r.site.lon, r.createdAt, 'indicatorSuggestion', r.suggestion.level, r.suggestion.label]);
  return rows.map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ---------- history ----------

function history() {
  const h = store.history;
  return `
  <div class="step-head"><span class="kicker">My records</span><h1>${h.length} saved assessment${h.length === 1 ? '' : 's'}</h1><p>Stored only in this browser. Each can be downloaded as FHIR.</p></div>
  ${h.length ? '<div id="hmap"></div>' : ''}
  <div class="hlist">${h.length ? h.slice().reverse().map((r) => `
    <div class="hitem"><span class="cls small ${r.obs.overall.toLowerCase()}">${CLASS_NAME[r.obs.overall]}</span>
    <div><b>${esc(r.site.name || 'Unnamed site')}</b><span>${new Date(r.createdAt).toLocaleString()} · indicators ${r.suggestion.label.toLowerCase()} · confidence ${r.confidence.level}</span></div>
    <button class="btn secondary small" data-hfhir="${esc(r.id)}">FHIR</button></div>`).join('') : '<div class="empty">No records yet. Start an assessment from the home screen.</div>'}</div>
  <div class="nav"><button class="btn secondary" data-go="home">Home</button>${h.length ? '<button class="btn secondary" data-act="clearhist">Delete all</button>' : ''}</div>`;
}

// ---------- after-render hooks ----------

const COLOURS = { GOOD: '#1f7a4a', MODERATE: '#b59a12', POOR: '#b3261e' };

const after = {
  place() {
    const s = d().site;
    map = makeMap('map', s.lat !== null ? [s.lat, s.lon] : [48.5, 6], s.lat !== null ? 14 : 4);
    if (!map) return;
    for (const site of OAH_SITES) {
      L.circleMarker([site.lat, site.lon], { radius: 6, color: '#fff', weight: 1.5, fillColor: '#1c7c7d', fillOpacity: 0.9 })
        .bindTooltip(`${site.code} · ${site.name.trim() || site.city}`)
        .on('click', (e) => { L.DomEvent.stopPropagation(e); map.setView([site.lat, site.lon], Math.max(map.getZoom(), 14)); setSite(site.lat, site.lon, site); })
        .addTo(map);
    }
    if (s.lat !== null) marker = L.marker([s.lat, s.lon]).addTo(map);
    map.on('click', (e) => setSite(e.latlng.lat, e.latlng.lng));
  },
  step() {
    if (focusKey) {
      const el = $(`#q-${focusKey}`) || $(`#q-${focusKey.replace(/[LR]$/, '')}`);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  },
  history() {
    const pts = store.history.filter((r) => r.site.lat !== null);
    if (!pts.length) { $('#hmap')?.remove(); return; }
    map = makeMap('hmap', [pts[0].site.lat, pts[0].site.lon], 12);
    if (!map) return;
    const layer = L.featureGroup(pts.map((r) => L.circleMarker([r.site.lat, r.site.lon], { radius: 10, color: '#fff', weight: 2, fillColor: COLOURS[r.obs.overall], fillOpacity: 0.95 })
      .bindPopup(`<b>${esc(r.site.name || 'Unnamed site')}</b><br>Rated ${CLASS_NAME[r.obs.overall]} · indicators ${r.suggestion.label}`))).addTo(map);
    if (pts.length > 1) map.fitBounds(layer.getBounds().pad(0.3));
  },
};

// ---------- events ----------

app.addEventListener('change', (e) => {
  if (e.target.matches('input[type=file][data-slot]') && e.target.files[0]) { addPhoto(e.target.dataset.slot, e.target.files[0]); return; }
  if (e.target.matches('input[type=radio], input[type=checkbox]')) onOptionChange(e.target);
});
app.addEventListener('input', (e) => {
  if (e.target.id === 'site-name') { d().site.name = e.target.value; save(); }
  if (e.target.dataset.num) { readInputs(); save(); }
  if (e.target.dataset.mood) {
    d().obs.feelings = { ...(d().obs.feelings || {}), [e.target.dataset.mood]: Number(e.target.value) };
    $(`[data-mood-val="${e.target.dataset.mood}"]`).textContent = e.target.value;
    save();
  }
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.go) { e.preventDefault(); readInputs(); go(t.dataset.go); return; }
  if (t.dataset.example !== undefined) {
    const ex = EXAMPLES[Number(t.dataset.example)];
    store.draft = { ...blank(), obs: structuredClone(ex.obs), example: ex.title };
    go('place');
    map?.setView([ex.site.lat, ex.site.lon], 15);
    setSite(ex.site.lat, ex.site.lon, { ...ex.site });
    return;
  }
  const act = t.dataset.act;
  if (act === 'start') { store.draft = blank(); go('place'); return; }
  if (act === 'resume') { go('place'); return; }
  if (act === 'here') {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    navigator.geolocation.getCurrentPosition((p) => {
      ev().here = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: new Date().toISOString() };
      save();
      if ($('#here')) $('#here').textContent = hereLine();
    }, () => toast('Location permission was not given'), { enableHighAccuracy: true, timeout: 15000 });
    return;
  }
  if (t.dataset.rmphoto) { delete ev().photos[t.dataset.rmphoto]; save(); render(); return; }
  if (act === 'locate') {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    navigator.geolocation.getCurrentPosition((p) => { map?.setView([p.coords.latitude, p.coords.longitude], 16); setSite(p.coords.latitude, p.coords.longitude); }, () => toast('Location permission was not given'));
    return;
  }
  if (act === 'next') {
    readInputs();
    if (screen === 'place') return go('step', { step: 0 });
    if (screen === 'step') return stepIndex < STEPS.length - 1 ? go('step', { step: stepIndex + 1 }) : go('review');
  }
  if (act === 'prev') {
    readInputs();
    if (screen === 'step') return stepIndex === 0 ? go('place') : go('step', { step: stepIndex - 1 });
    if (screen === 'review') return go('step', { step: STEPS.length - 1 });
    if (screen === 'result') return go('review');
  }
  if (t.dataset.keep) {
    const flag = currentFlags().find((f) => f.id === t.dataset.keep);
    const reason = ($(`#why-${t.dataset.keep}`)?.value || '').trim();
    d().decisions[t.dataset.keep] = { action: 'keep', reason, fields: flag?.fields || [], at: new Date().toISOString() };
    save(); render(); return;
  }
  if (t.dataset.undo) { delete d().decisions[t.dataset.undo]; save(); render(); return; }
  if (t.dataset.change) {
    const flag = currentFlags().find((f) => f.id === t.dataset.change);
    if (flag.fields.includes('here')) { go('place'); return; }
    const key = flag.fields.find((k) => d().obs[k] !== undefined) || flag.fields[0];
    const idx = STEPS.findIndex((s) => s.fields.some((f) => answerKeys(f).includes(key)));
    go('step', { step: Math.max(0, idx), focus: key });
    return;
  }
  if (act === 'finish') { if (!d().createdAt) d().createdAt = new Date().toISOString(); go('result'); return; }
  if (act === 'fhir') { const r = buildRecord(); download(`streamcheck-${slug(r.site.name)}.fhir.json`, JSON.stringify(toFhirBundle(r), null, 2), 'application/fhir+json'); return; }
  if (act === 'csv') { const r = buildRecord(); download(`streamcheck-${slug(r.site.name)}.csv`, toCsv(r), 'text/csv'); return; }
  if (act === 'showfhir') { const pre = $('#fhir-preview'); pre.hidden = !pre.hidden; pre.textContent = JSON.stringify(toFhirBundle(buildRecord()), null, 2); return; }
  if (act === 'save') {
    const r = buildRecord();
    store.history = store.history.filter((x) => x.id !== r.id).concat(r);
    store.draft = blank();
    save(); toast('Saved to my records'); go('history'); return;
  }
  if (act === 'clearhist') { if (confirm('Delete all saved records from this browser?')) { store.history = []; save(); render(); } return; }
  if (t.dataset.hfhir) { const r = store.history.find((x) => x.id === t.dataset.hfhir); if (r) download(`streamcheck-${slug(r.site.name)}.fhir.json`, JSON.stringify(toFhirBundle(r), null, 2), 'application/fhir+json'); }
});

function slug(s) { return (s || 'site').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'; }

function toast(msg) {
  let el = $('.toast');
  if (!el) { el = Object.assign(document.createElement('div'), { className: 'toast' }); el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

render();

// Offline support (see sw.js). Weather still needs a connection.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
window.addEventListener('offline', () => toast('Offline: you can keep going; weather checks will be skipped'));
