// Writes the two StreamCheck CodeSystems (questions and answers) from the
// protocol, so the published terminology always matches the app.
import { writeFileSync } from 'node:fs';
import { STEPS, SIDES } from '../src/protocol.js';
import { SC_QUESTION, SC_ANSWER } from '../src/fhir.js';

const questions = [];
const answers = [];
for (const step of STEPS) {
  for (const f of step.fields) {
    questions.push({ code: f.id, display: f.term, definition: f.label });
    if (f.sides) for (const s of SIDES) questions.push({ code: `${f.id}${s.id}`, display: `${f.term}, ${s.label.toLowerCase()}`, definition: `${f.label} (${s.label.toLowerCase()})` });
    for (const o of f.options || []) answers.push({ code: `${f.id}.${o.value}`, display: o.short || o.label, definition: o.label });
  }
}
questions.push(
  { code: 'weatherContext', display: 'Recent weather at the site', definition: 'Open-Meteo summary used by the second-look checks' },
  { code: 'rain48h', display: 'Precipitation, last 48 h', definition: 'Sum of hourly precipitation over the 48 hours before the assessment' },
  { code: 'airMean3d', display: 'Mean air temperature, last 3 days', definition: 'Mean hourly air temperature over the 72 hours before the assessment' },
  { code: 'airMaxToday', display: 'Maximum air temperature today', definition: 'Highest hourly air temperature on the local calendar day' },
  { code: 'indicatorSuggestion', display: 'Indicator-based condition suggestion', definition: 'Decision-support class on the OAH Good/Moderate/Poor scale; not a measurement' },
  { code: 'observerDistance', display: 'Distance between the observer and the site', definition: 'Metres between the citizen device position and the selected site; device coordinates are not exported' },
);
for (const lvl of ['GOOD', 'MODERATE', 'POOR']) if (!answers.some((a) => a.code === `overall.${lvl}`)) answers.push({ code: `overall.${lvl}`, display: lvl });

const cs = (url, id, title, concept) => ({
  resourceType: 'CodeSystem', id, url, version: '0.1.0', name: title.replace(/\W/g, ''), title, status: 'draft', experimental: true,
  publisher: 'StreamCheck (IEEE OneAquaHealth Global Hackathon 2026 prototype)',
  description: 'Proposed codes for the OneAquaHealth citizen stream assessment, which the OAH FHIR IG (hl7-eu/oah 0.1.0) does not model yet. Answer codes reuse the OAH app codes (api.enora-oah.eu/api/citizens/*).',
  caseSensitive: true, content: 'complete', count: concept.length, concept,
});
writeFileSync('docs/fhir/CodeSystem-citizen-question.json', JSON.stringify(cs(SC_QUESTION, 'citizen-question', 'StreamCheck citizen questions', questions), null, 2));
writeFileSync('docs/fhir/CodeSystem-citizen-answer.json', JSON.stringify(cs(SC_ANSWER, 'citizen-answer', 'StreamCheck citizen answers', answers), null, 2));
console.log(questions.length, 'questions,', answers.length, 'answers');
