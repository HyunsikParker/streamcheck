// FHIR R4 export aligned with the OneAquaHealth Implementation Guide
// (github.com/hl7-eu/oah, 0.1.0 draft):
//   - Location claims LocationOah (identifier, name, mode = instance, type = River).
//   - Observations claim ObservationIndicatorsOah (subject = the Location,
//     performer, effective[x], value CodeableConcept or Quantity).
//   - Observation.code carries the OAH indicator (TemporaryOahSystem) first
//     and the exact citizen question second. The IG does not model the citizen
//     questions yet; StreamCheck's CodeSystem proposes codes for them.
// Second-look decisions travel as Observation.note on the answer they concern.

import { STEPS, answerKeys, fieldOf } from './protocol.js';

export const OAH_IG = 'http://hl7.eu/fhir/ig/oah';
export const OAH_CS = `${OAH_IG}/CodeSystem/temporarySystem-oah-eu`;
export const PROFILE_LOCATION = `${OAH_IG}/StructureDefinition/location-oah`;
export const PROFILE_OBS = `${OAH_IG}/StructureDefinition/observation-indicators-oah`;
export const SC_QUESTION = 'https://hyunsikparker.github.io/streamcheck/fhir/CodeSystem/citizen-question';
export const SC_ANSWER = 'https://hyunsikparker.github.io/streamcheck/fhir/CodeSystem/citizen-answer';
const OAH_LOCATION_ID = 'https://oneaquahealth.eu/location-id';
const SC_LOCATION_ID = 'https://hyunsikparker.github.io/streamcheck/location-id';
const RIVER = { system: 'http://snomed.info/sct', code: '420531007', display: 'River' };
const OAH_DISPLAY = {
  morophology: 'Morphology of the streams', hydrology: 'Hydrology of the stream', LandUse: 'Land use in the margins',
  riparianVegetation: 'Riparian vegetation', invasiveOrganisms: 'Invasive invertebrate, plants and fish',
  foam: 'Foam/colour/smell', waterTemperature: 'Water temperature',
};
const UNITS = { waterTemp: ['Cel', '°C'], waterHeight: ['m', 'm'], numberOfDams: ['1', 'count'] };

const xml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function narrative(r) {
  let text;
  if (r.resourceType === 'Location') text = `${r.name}${r.position ? ` (${r.position.latitude}, ${r.position.longitude})` : ''}`;
  else {
    const v = r.valueCodeableConcept?.text ?? (r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit}` : (r.component || []).map((c) => `${c.code.coding[0].display}: ${c.valueCodeableConcept?.text ?? `${c.valueQuantity?.value} ${c.valueQuantity?.unit ?? ''}`}`).join('; '));
    text = `${r.code.text}: ${v}`;
  }
  return { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${xml(text)}</div>` };
}

let n = 0;
const uuid = () => globalThis.crypto?.randomUUID?.() || `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function code(field) {
  const coding = [];
  if (field.oah) coding.push({ system: OAH_CS, code: field.oah, display: OAH_DISPLAY[field.oah] });
  coding.push({ system: SC_QUESTION, code: field.id, display: field.term });
  return { coding, text: field.label };
}

function answer(field, value) {
  const opt = (field.options || []).find((o) => o.value === value);
  return { coding: [{ system: SC_ANSWER, code: `${field.id}.${value}`, display: opt ? opt.label : String(value) }], text: opt ? opt.label : String(value) };
}

export function toFhirBundle(record) {
  const { obs, weather, flags = [], decisions = {}, site = {}, createdAt, suggestion: sugg } = record;
  const when = createdAt || new Date().toISOString();
  const entry = [];
  const add = (resource) => {
    const id = uuid();
    const { resourceType, meta, ...rest } = resource;
    entry.push({ fullUrl: `urn:uuid:${id}`, resource: { resourceType, meta, text: narrative(resource), ...rest } });
    return id;
  };

  const location = {
    resourceType: 'Location',
    meta: { profile: [PROFILE_LOCATION] },
    identifier: [site.code ? { system: OAH_LOCATION_ID, value: site.code } : { system: SC_LOCATION_ID, value: site.id || `site-${when}` }],
    status: 'active',
    name: site.name || 'Citizen stream assessment site',
    mode: 'instance',
    type: [{ coding: [RIVER] }],
  };
  if (site.city) location.description = `OneAquaHealth research site, ${site.city}`;
  if (Number.isFinite(site.lat) && Number.isFinite(site.lon)) location.position = { longitude: site.lon, latitude: site.lat };
  const locId = add(location);

  const base = () => ({
    resourceType: 'Observation',
    meta: { profile: [PROFILE_OBS] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] }],
    subject: { reference: `urn:uuid:${locId}` },
    effectiveDateTime: when,
    performer: [{ display: 'Citizen scientist (anonymous)' }],
  });

  const notes = (keys) => flags.filter((f) => f.fields.some((k) => keys.includes(k))).map((f) => {
    const d = decisions[f.id];
    const outcome = f.severity === 'alert' ? 'safety note shown' : d?.action === 'keep' ? `answer kept${d.reason ? `: ${d.reason}` : ''}` : d?.action === 'changed' ? 'answer changed' : 'open';
    return { text: `StreamCheck second look [${f.id}] ${f.title}. Outcome: ${outcome}.` };
  });

  const inputs = [];
  for (const step of STEPS) {
    for (const field of step.fields) {
      if (field.type === 'feelings') continue;
      const keys = answerKeys(field);
      const present = keys.filter((k) => obs[k] !== undefined && !(Array.isArray(obs[k]) && !obs[k].length));
      if (!present.length) continue;
      const r = { ...base(), code: code(field) };
      if (field.sides) {
        r.component = present.map((k) => ({
          code: { coding: [{ system: SC_QUESTION, code: k, display: `${field.term}, ${fieldOf(k).side === 'L' ? 'left' : 'right'} bank` }] },
          valueCodeableConcept: answer(field, obs[k]),
        }));
      } else if (field.type === 'number') {
        const [ucum, unit] = UNITS[field.id] || ['1', ''];
        r.valueQuantity = { value: Number(obs[field.id]), unit, system: 'http://unitsofmeasure.org', code: ucum };
      } else if (field.multiple) {
        r.component = obs[field.id].map((v) => ({ code: { coding: [{ system: SC_QUESTION, code: field.id, display: field.term }] }, valueCodeableConcept: answer(field, v) }));
      } else {
        r.valueCodeableConcept = answer(field, obs[field.id]);
      }
      const nt = notes(keys);
      if (nt.length) r.note = nt;
      inputs.push(add(r));
    }
  }

  if (obs.feelings && Object.keys(obs.feelings).length) {
    inputs.push(add({
      ...base(),
      code: { coding: [{ system: SC_QUESTION, code: 'feelings', display: 'Well-being at the site' }], text: 'How the place made the citizen feel (0-5)' },
      component: Object.entries(obs.feelings).map(([k, v]) => ({ code: { coding: [{ system: SC_QUESTION, code: `feelings.${k}`, display: k }] }, valueQuantity: { value: v, unit: 'score', system: 'http://unitsofmeasure.org', code: '1' } })),
    }));
  }

  if (weather) {
    inputs.push(add({
      ...base(),
      performer: [{ display: 'Open-Meteo (api.open-meteo.com)' }],
      effectiveDateTime: weather.fetchedAt || when,
      code: { coding: [{ system: SC_QUESTION, code: 'weatherContext', display: 'Recent weather at the site' }], text: 'Recent weather at the site' },
      component: [['rain48h', 'Precipitation, last 48 h', 'mm', 'mm'], ['airMean3d', 'Mean air temperature, last 3 days', 'Cel', '°C'], ['airMaxToday', 'Maximum air temperature today', 'Cel', '°C']]
        .filter(([k]) => Number.isFinite(weather[k]))
        .map(([k, display, ucum, unit]) => ({ code: { coding: [{ system: SC_QUESTION, code: k, display }] }, valueQuantity: { value: weather[k], unit, system: 'http://unitsofmeasure.org', code: ucum } })),
    }));
  }

  if (sugg && sugg.level !== 'UNKNOWN') {
    add({
      ...base(),
      performer: [{ display: 'StreamCheck indicator rules v1 (decision support, not a measurement)' }],
      code: { coding: [{ system: SC_QUESTION, code: 'indicatorSuggestion', display: 'Indicator-based condition suggestion' }], text: 'Indicator-based suggestion on the OAH Good/Moderate/Poor scale' },
      valueCodeableConcept: { coding: [{ system: SC_ANSWER, code: `overall.${sugg.level}`, display: sugg.label }], text: sugg.label },
      note: [{ text: sugg.why }],
      derivedFrom: inputs.map((id) => ({ reference: `urn:uuid:${id}` })),
    });
  }

  return { resourceType: 'Bundle', type: 'collection', timestamp: when, entry };
}
