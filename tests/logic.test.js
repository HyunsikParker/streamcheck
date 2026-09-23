import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, unresolved } from '../src/checks.js';
import { indicators, suggestion, agreement, confidence, oneHealth } from '../src/score.js';
import { toFhirBundle, OAH_CS, PROFILE_LOCATION, PROFILE_OBS, SC_ANSWER } from '../src/fhir.js';
import { summarise, weatherUrl, fetchWeather } from '../src/weather.js';
import { FIELDS, answerKeys, fieldOf, optionLabel } from '../src/protocol.js';
import { OAH_SITES } from '../src/oah-sites.js';
import { EXAMPLES } from '../src/examples.js';

const natural = {
  channelForm: 'U', channelType: 'NAT', bankType: 'NAT', habitats: ['SD', 'RF', 'AV'], fallenBiomass: ['FB'], waterFlow: 'NOR',
  waterAspect: ['CL'], withdrawal: 'N', dams: 'N', pollutedPipes: 'N', sewage: 'N', construction: 'N',
  imperviousL: 'N', imperviousR: 'N', vegCoverL: 'Y', vegCoverR: 'Y', vegDominantL: 'T', vegDominantR: 'B', invasiveL: 'N', invasiveR: 'N', cutsL: 'N', cutsR: 'N',
  overall: 'GOOD',
};
const dry = { rain48h: 0.4, airMean3d: 16, airMaxToday: 22 };

test('answer codes match the OneAquaHealth app lists', () => {
  assert.deepEqual(FIELDS.waterFlow.options.map((o) => o.value), ['FAS', 'NOR', 'STA', 'DRY', 'NS']);
  assert.deepEqual(FIELDS.waterAspect.options.map((o) => o.value), ['CL', 'MU', 'FO', 'CO', 'NS']);
  assert.deepEqual(FIELDS.bankType.options.map((o) => o.value), ['NAT', 'ART', 'LAS', 'NS']);
  assert.deepEqual(FIELDS.overall.options.map((o) => o.value), ['GOOD', 'MODERATE', 'POOR']);
});

test('paired margin questions are stored per bank', () => {
  assert.deepEqual(answerKeys(FIELDS.vegCover), ['vegCoverL', 'vegCoverR']);
  assert.equal(fieldOf('vegDominantR').side, 'R');
  assert.equal(optionLabel('vegDominantL', 'T'), 'Trees');
});

test('a consistent natural stretch raises no flags and the indicators agree with Good', () => {
  assert.deepEqual(runChecks(natural, dry), []);
  const g = indicators(natural);
  assert.deepEqual(g.map((x) => x.level), ['GOOD', 'GOOD', 'GOOD', 'GOOD']);
  const s = suggestion(g);
  assert.equal(s.level, 'GOOD');
  assert.equal(agreement('GOOD', s).state, 'agree');
  assert.equal(confidence(natural, [], {}).level, 'high');
});

test('Good with sewage and a dirty outfall is questioned, naming the pressures', () => {
  const o = { ...natural, sewage: 'Y', pollutedPipes: 'Y' };
  const flags = runChecks(o, dry);
  const f = flags.find((x) => x.id === 'good-with-pressures');
  assert.ok(f);
  assert.match(f.why, /signs of sewage, pipes draining dirty water/);
  const s = suggestion(indicators(o));
  assert.equal(s.level, 'MODERATE');
  assert.match(s.why, /capped/);
});

test('Poor for a natural-looking stretch asks what drove the rating', () => {
  const flags = runChecks({ ...natural, overall: 'POOR' }, dry);
  assert.deepEqual(flags.map((f) => f.id), ['poor-but-natural']);
  assert.equal(agreement('POOR', suggestion(indicators(natural))).state, 'apart');
});

test('clear water after heavy rain and muddy water in dry weather are both questioned', () => {
  assert.ok(runChecks(natural, { ...dry, rain48h: 31 }).some((f) => f.id === 'clear-after-rain'));
  const muddy = runChecks({ ...natural, waterAspect: ['MU'] }, dry);
  const m = muddy.find((f) => f.id === 'muddy-no-rain');
  assert.match(m.evidence, /Open-Meteo/);
  assert.equal(runChecks({ ...natural, waterAspect: ['MU'], construction: 'Y' }, dry).some((f) => f.id === 'muddy-no-rain'), false);
});

test('weather rules are skipped without weather', () => {
  assert.equal(runChecks({ ...natural, waterAspect: ['MU'] }, null).length, 0);
});

test('internal contradictions: dry with water, riffles in standing water, dominant plants without cover', () => {
  const ids = runChecks({ ...natural, waterFlow: 'STA', vegCoverR: 'N' }, dry).map((f) => f.id);
  assert.ok(ids.includes('riffles-standing'));
  assert.ok(ids.includes('dominant-without-cover-R'));
  assert.ok(runChecks({ ...natural, waterFlow: 'DRY', habitats: ['SD'] }, dry).some((f) => f.id === 'dry-with-water'));
});

test('foam next to a dirty outfall is a safety alert that never blocks finishing', () => {
  const o = { ...natural, waterAspect: ['FO'], pollutedPipes: 'Y', overall: 'MODERATE' };
  const flags = runChecks(o, dry);
  const alert = flags.find((f) => f.id === 'foam-with-discharge');
  assert.equal(alert.severity, 'alert');
  assert.deepEqual(unresolved(flags, {}).map((f) => f.id), flags.filter((f) => f.severity !== 'alert').map((f) => f.id));
});

test('keeping an answer resolves the flag and lowers confidence', () => {
  const o = { ...natural, overall: 'POOR' };
  const flags = runChecks(o, dry);
  const decisions = { 'poor-but-natural': { action: 'keep', reason: 'Lots of litter under the bridge' } };
  assert.equal(unresolved(flags, decisions).length, 0);
  assert.equal(confidence(o, flags, decisions).level, 'medium');
});

test('One Health notes: bloom for dogs, sewage for people, calm for well-being', () => {
  const o = { ...natural, surface: ['scum'], contact: ['dogs', 'children'], sewage: 'Y', feelings: { serenity: 4 } };
  const n = oneHealth(o, dry);
  assert.match(n.animals[0].text, /dogs/);
  assert.ok(n.people.some((x) => x.level === 'alert' && /Sewage/.test(x.text)));
  assert.ok(n.people.some((x) => /well-being/.test(x.text)));
});

test('FHIR bundle follows the OAH IG profiles and every reference resolves', () => {
  const o = { ...natural, overall: 'POOR', waterTemp: 14.2, feelings: { joy: 3, fear: 1 } };
  const flags = runChecks(o, dry);
  const decisions = { 'poor-but-natural': { action: 'keep', reason: 'Litter under the bridge' } };
  const sugg = suggestion(indicators(o));
  const b = toFhirBundle({ obs: o, weather: dry, flags, decisions, suggestion: sugg, site: { code: 'C1', name: 'Exploratório', city: 'Coimbra', lat: 40.19787, lon: -8.42865 }, createdAt: '2026-09-23T09:00:00Z' });
  const urls = new Set(b.entry.map((e) => e.fullUrl));
  for (const r of JSON.stringify(b).match(/"reference":"(urn:uuid:[^"]+)"/g).map((s) => s.slice(13, -1))) assert.ok(urls.has(r), r);
  const loc = b.entry[0].resource;
  assert.deepEqual(loc.meta.profile, [PROFILE_LOCATION]);
  assert.deepEqual(loc.identifier, [{ system: 'https://oneaquahealth.eu/location-id', value: 'C1' }]);
  assert.equal(loc.type[0].coding[0].code, '420531007');
  for (const e of b.entry.slice(1)) {
    const r = e.resource;
    assert.deepEqual(r.meta.profile, [PROFILE_OBS]);
    assert.ok(r.subject && r.effectiveDateTime && r.performer?.length, 'required elements');
    if (!r.component) assert.ok(r.valueCodeableConcept || r.valueQuantity, 'value only CodeableConcept or Quantity');
  }
  const bank = b.entry.find((e) => e.resource.code?.coding.some((c) => c.code === 'bankType')).resource;
  assert.equal(bank.code.coding[0].system, OAH_CS);
  assert.equal(bank.code.coding[0].code, 'morophology');
  const veg = b.entry.find((e) => e.resource.code?.coding.some((c) => c.code === 'vegCover')).resource;
  assert.deepEqual(veg.component.map((c) => c.code.coding[0].code), ['vegCoverL', 'vegCoverR']);
  const overall = b.entry.find((e) => e.resource.code?.coding.some((c) => c.code === 'overall')).resource;
  assert.equal(overall.valueCodeableConcept.coding[0].code, 'overall.POOR');
  assert.match(overall.note[0].text, /answer kept: Litter under the bridge/);
  const s = b.entry.at(-1).resource;
  assert.equal(s.code.coding[0].code, 'indicatorSuggestion');
  assert.equal(s.valueCodeableConcept.coding[0].system, SC_ANSWER);
  assert.ok(s.derivedFrom.length >= 20);
});

test('weather summary uses the last 48 h for rain and the last 72 h for air', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const time = []; const precipitation = []; const temperature_2m = [];
  for (let h = 0; h < 96; h++) {
    time.push(new Date(Date.parse('2026-09-20T02:00:00Z') + h * 3600e3).toISOString().slice(0, 16));
    precipitation.push(1); temperature_2m.push(10 + (h % 2));
  }
  const s = summarise({ utc_offset_seconds: 3600, hourly: { time, precipitation, temperature_2m } }, now);
  assert.equal(s.rain48h, 49);
  assert.equal(s.airMean3d, 10.5);
  assert.equal(s.airMaxToday, 11);
});

test('weather failure returns null', async () => {
  assert.equal(await fetchWeather(1, 2, async () => { throw new Error('offline'); }), null);
  assert.match(weatherUrl(40.2, -8.4), /latitude=40.2000&longitude=-8.4000/);
});

test('bundled OAH sites and examples are well formed', () => {
  assert.equal(OAH_SITES.length, 106);
  assert.deepEqual([...new Set(OAH_SITES.map((s) => s.city))].sort(), ['Benevento', 'Coimbra', 'Ghent', 'Oslo', 'Toulouse']);
  for (const ex of EXAMPLES) {
    assert.ok(OAH_SITES.some((s) => s.code === ex.site.code), ex.title);
    for (const k of Object.keys(ex.obs)) assert.ok(fieldOf(k).field, `${ex.title}: ${k}`);
  }
});
