# StreamCheck

A second look for citizen stream assessments. StreamCheck asks the same questions as the OneAquaHealth Citizen Science App, then compares the answers with each other and with the last three days of weather. When something looks off, it explains why and shows the data. The citizen keeps the answer or changes it, and that decision is kept with the record. Records export as FHIR R4 shaped by the OneAquaHealth Implementation Guide.

Try it: https://hyunsikparker.github.io/streamcheck/

Built for the IEEE OneAquaHealth Global Hackathon 2026, **Track 3: AI-Supported Assessment**, with an export for Track 7 (Digital Health Standards).

## What it does

1. **Site.** Pick one of the 106 OneAquaHealth research sites (Benevento, Coimbra, Ghent, Oslo, Toulouse) or tap your own spot. Recent weather for that point loads from Open-Meteo: rain over 48 hours, mean air temperature over 3 days, today's high.
2. **Questions.** Channel form, bed and banks, habitats, natural debris, flow; water aspect, abstraction, barriers, polluted pipes, sewage, works; left and right margins (paving, plant cover, dominant plants, invasive plants, cuts). Answer codes are the OAH app's own (`NAT`, `FAS`, `CL`, ...). Each question shows the scientific term under the plain-language wording. Optional extras (smell, surface film, water temperature, who uses the water) feed the One Health notes.
3. **Your rating.** Good, Moderate or Poor, as in the OAH app, plus optional feelings about the place.
4. **Second look.** Explainable rules, for example:
   - rated Good while reporting sewage, a dirty outfall or concrete banks;
   - rated Poor while describing a natural, vegetated, clear stretch;
   - clear water after 20 mm or more of rain, or muddy water with no rain and no works;
   - riffles in standing water, a dry channel with described water, a dominant plant type on a bare margin;
   - water temperature more than 10 °C away from the 3-day air mean.
   Each flag shows the answers involved, the reason and the data source. Safety notes (foam next to a discharge, possible cyanobacteria, oil next to an outfall) never block the record.
5. **Result.** The citizen's rating is the recorded one. Next to it, an indicator view on the same scale (channel and banks, water, margins, flow pressures), how far apart the two are, a confidence level, One Health notes for the ecosystem, animals and people, and the list of second-look decisions.
6. **Export.** FHIR R4 Bundle, CSV, and a local history with a map.

Nothing is sent anywhere except the weather request. Records stay in the browser. The app installs as a PWA and works offline after the first visit (the service worker caches the app shell); without a connection, weather checks are skipped and the app says so.

## FHIR alignment

| OAH IG (hl7-eu/oah 0.1.0) | StreamCheck export |
| --- | --- |
| `LocationOah`: identifier, name, mode = instance, type | `meta.profile` set; identifier `https://oneaquahealth.eu/location-id` with the OAH site code (e.g. `T5`); type SNOMED CT 420531007 River; position |
| `ObservationIndicatorsOah`: subject = Location, performer, effective[x], value CodeableConcept or Quantity | `meta.profile` set on every Observation; performer "Citizen scientist (anonymous)" |
| `TemporaryOahSystem` indicator codes | first coding of `Observation.code` (`morophology`, `hydrology`, `LandUse`, `riparianVegetation`, `invasiveOrganisms`, `foam`, `waterTemperature`) |
| Citizen questions (not modelled in the IG yet) | second coding from the proposed [`citizen-question`](docs/fhir/CodeSystem-citizen-question.json) CodeSystem; answers from [`citizen-answer`](docs/fhir/CodeSystem-citizen-answer.json), reusing OAH app codes |
| Left and right margins | one Observation per question with two components |
| Second-look decisions | `Observation.note` on the answer concerned |
| Indicator view | separate Observation, performer "StreamCheck indicator rules v1", `derivedFrom` all inputs |

An example bundle is in [`docs/fhir/example-bundle-toulouse-T5.json`](docs/fhir/example-bundle-toulouse-T5.json). Checked on validator.fhir.org (FHIR 4.0.1): 0 errors. The remaining warnings are that the OAH profiles are not published yet and that the proposed code systems are not on a terminology server ([summary](docs/fhir/validation-summary.txt)).

## Run locally

No build step, no dependencies.

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Tests

```bash
node --test
```

Node.js 20 or newer. 15 tests cover the answer codes, every check, the indicator view and its cap, confidence, One Health notes, the FHIR bundle (profiles, required elements, references), the weather summary and the bundled sites.

Regenerate the code systems and re-validate:

```bash
node scripts/build-codesystems.mjs
python3 scripts/validate.py docs/fhir/example-bundle-toulouse-T5.json docs/fhir/CodeSystem-citizen-question.json docs/fhir/CodeSystem-citizen-answer.json
```

## Files

| File | Role |
| --- | --- |
| `src/protocol.js` | Questions, OAH answer codes, plain-language labels and scientific terms |
| `src/checks.js` | Second-look rules; each returns its reason, the answers used and the data source |
| `src/score.js` | Indicator view, agreement with the citizen's rating, confidence, One Health notes |
| `src/fhir.js` | FHIR R4 Bundle following the OAH IG profiles |
| `src/weather.js` | Open-Meteo request and 48 h / 72 h summaries |
| `src/oah-sites.js` | The 106 OAH research sites from `api.enora-oah.eu/api/sites/all` (retrieved 2026-09-23) |
| `src/app.js` | Screens, map, state, exports |

## Data and credits

- Research sites: OneAquaHealth public API. The API refuses cross-site browser requests, so the list is bundled.
- Question structure and answer codes: OneAquaHealth Citizen Science App (`api.enora-oah.eu/api/citizens/*`).
- FHIR profiles and indicator codes: [hl7-eu/oah](https://github.com/hl7-eu/oah).
- Weather: [Open-Meteo](https://open-meteo.com/), no key.
- Map: Leaflet and © OpenStreetMap contributors.
- Example records at three research sites are invented for demonstration; weather in the examples is live.

## Limits

- The indicator view is decision support on the OAH three-class scale, not a validated ecological index.
- Weather comes from a model grid, not a gauge at the stream.
- Photos and video, which the OAH app collects, are not part of this prototype.
- No upload to the OAH backend: citizen submissions there need a Community account.

## License

MIT
