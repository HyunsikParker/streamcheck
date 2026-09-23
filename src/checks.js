// "Second look" checks. Each rule compares answers with each other and with
// recent weather, and explains itself with the answers and data it used.
// Rules never change an answer: the citizen keeps it (optionally saying why)
// or changes it, and that decision is stored with the record.

import { distanceM, formatDistance, photoAgeHours } from './evidence.js';

const has = (list, v) => Array.isArray(list) && list.includes(v);
const FAR_M = 500;
const SLOT = { up: 'upstream', down: 'downstream', around: 'surroundings' };
const fmt = (n, d = 1) => (Number.isFinite(n) ? Number(n).toFixed(d).replace(/\.0$/, '') : '?');
const SIDE = { L: 'left', R: 'right' };

export function pressures(o) {
  const list = [];
  if (o.sewage === 'Y') list.push('signs of sewage');
  if (o.pollutedPipes === 'Y') list.push('pipes draining dirty water');
  if (o.channelType === 'ART') list.push('an artificial channel bed');
  if (o.bankType === 'ART') list.push('concrete banks');
  if (o.imperviousL === 'Y' && o.imperviousR === 'Y') list.push('paved margins on both sides');
  if (has(o.waterAspect, 'FO') || has(o.waterAspect, 'CO')) list.push('foam or unusual colour');
  return list;
}

function naturalSigns(o) {
  const list = [];
  if (o.channelType === 'NAT') list.push('a natural channel bed');
  if (o.bankType === 'NAT') list.push('natural banks');
  if (o.vegCoverL === 'Y' && o.vegCoverR === 'Y') list.push('plants on both margins');
  if (has(o.waterAspect, 'CL')) list.push('clear water');
  if (Array.isArray(o.habitats) && o.habitats.filter((h) => h !== 'NONE').length >= 2) list.push('varied habitats');
  return list;
}

export const RULES = [
  {
    id: 'good-with-pressures',
    severity: 'check',
    fields: ['overall', 'sewage', 'pollutedPipes', 'channelType', 'bankType'],
    test: (o) => o.overall === 'GOOD' && pressures(o).length >= 1 && (o.sewage === 'Y' || o.pollutedPipes === 'Y' || pressures(o).length >= 2),
    explain: (o) => ({
      title: 'You rated this stretch Good, but reported pressures',
      why: `You reported ${pressures(o).join(', ')}. The OneAquaHealth scale describes Good as a natural channel with bank vegetation, good water quality and biodiversity.`,
      ask: 'Keep Good if the stretch you judged is different from where you saw these, and say so. Otherwise, Moderate may fit better.',
    }),
  },
  {
    id: 'poor-but-natural',
    severity: 'check',
    fields: ['overall'],
    test: (o) => o.overall === 'POOR' && pressures(o).length === 0 && naturalSigns(o).length >= 3,
    explain: (o) => ({
      title: 'You rated this stretch Poor, but your answers describe a natural stream',
      why: `You recorded ${naturalSigns(o).join(', ')}, and no sewage, polluted pipes or artificial channel.`,
      ask: 'Something may have influenced your rating that the form does not ask about, such as litter or a smell. Keep Poor and write what it was, so experts can see it.',
    }),
  },
  {
    id: 'dry-with-water',
    severity: 'check',
    fields: ['waterFlow', 'waterAspect'],
    test: (o) => o.waterFlow === 'DRY' && Array.isArray(o.waterAspect) && o.waterAspect.some((a) => a !== 'NS'),
    explain: () => ({
      title: 'The stream is marked dry, but the water is described',
      why: 'Flow is set to Dry, and you also described how the water looks.',
      ask: 'If there were only pools, "Standing, or only now and then" fits better.',
    }),
  },
  {
    id: 'riffles-standing',
    severity: 'check',
    fields: ['habitats', 'waterFlow'],
    test: (o) => has(o.habitats, 'RF') && (o.waterFlow === 'STA' || o.waterFlow === 'DRY'),
    explain: () => ({
      title: 'Riffles and rapids need moving water',
      why: 'You saw riffles, rapids or falls, but marked the water as standing or dry.',
      ask: 'Were the riffles dry stones, or is the water moving slowly rather than standing?',
    }),
  },
  {
    id: 'clear-after-rain',
    severity: 'check',
    fields: ['waterAspect'],
    needs: 'weather',
    test: (o, w) => has(o.waterAspect, 'CL') && Number.isFinite(w.rain48h) && w.rain48h >= 20 && o.waterFlow !== 'DRY',
    explain: (o, w) => ({
      title: 'Clear water right after heavy rain is unusual',
      why: `${fmt(w.rain48h)} mm of rain fell here in the last 48 hours. Urban streams usually run cloudy after that much rain.`,
      ask: 'Did you look at the main flow rather than a sheltered pool?',
      evidence: 'Open-Meteo, precipitation over the last 48 hours at this site',
    }),
  },
  {
    id: 'muddy-no-rain',
    severity: 'check',
    fields: ['waterAspect', 'construction'],
    needs: 'weather',
    test: (o, w) => has(o.waterAspect, 'MU') && Number.isFinite(w.rain48h) && w.rain48h < 1 && o.construction !== 'Y',
    explain: (o, w) => ({
      title: 'Muddy water without rain',
      why: `Only ${fmt(w.rain48h)} mm of rain fell in the last 48 hours, and you saw no construction. Cloudy water in dry weather often comes from an upstream source.`,
      ask: 'Did you notice works, a discharge or animals in the water upstream? Keep the answer if not; it is still useful.',
      evidence: 'Open-Meteo, precipitation over the last 48 hours at this site',
    }),
  },
  ...['L', 'R'].map((s) => ({
    id: `dominant-without-cover-${s}`,
    severity: 'check',
    fields: [`vegCover${s}`, `vegDominant${s}`],
    test: (o) => o[`vegCover${s}`] === 'N' && ['H', 'B', 'T'].includes(o[`vegDominant${s}`]),
    explain: () => ({
      title: `The ${SIDE[s]} margin has no plant cover, but a dominant plant type`,
      why: `You said the ${SIDE[s]} margin is not covered by plants, and also chose which plants cover most of it.`,
      ask: 'Is it partly covered? Then "covered by plants" should be Yes, or the dominant type "not sure".',
    }),
  })),
  {
    id: 'dams-count',
    severity: 'check',
    fields: ['dams', 'numberOfDams'],
    test: (o) => o.dams === 'Y' && Number.isFinite(o.numberOfDams) && o.numberOfDams < 1,
    explain: () => ({
      title: 'Barriers reported, but the count is zero',
      why: 'You answered Yes to dams or barriers and entered 0 for how many.',
      ask: 'Enter how many you saw, or change the answer to No.',
    }),
  },
  {
    id: 'many-unsure',
    severity: 'check',
    fields: ['overall'],
    test: (o) => {
      const vals = Object.entries(o).filter(([k]) => !['feelings', 'odor', 'surface', 'contact', 'waterTemp', 'waterHeight', 'numberOfDams', 'overall'].includes(k)).map(([, v]) => v);
      const ns = vals.filter((v) => v === 'NS' || (Array.isArray(v) && v.includes('NS'))).length;
      return vals.length >= 8 && ns / vals.length >= 0.4;
    },
    explain: () => ({
      title: 'Many answers are "not sure"',
      why: 'That is fine, and honest. Records with many unsure answers carry less weight in city dashboards.',
      ask: 'If you can, add upstream, downstream and surroundings photos so experts can fill the gaps.',
    }),
  },
  {
    id: 'temp-range',
    severity: 'check',
    fields: ['waterTemp'],
    test: (o) => Number.isFinite(o.waterTemp) && (o.waterTemp < 0 || o.waterTemp > 35),
    explain: (o) => ({
      title: 'This water temperature is outside what streams reach',
      why: `You entered ${fmt(o.waterTemp)} °C. Flowing freshwater is almost always between 0 and 35 °C.`,
      ask: 'Was the thermometer in the water for a full minute, out of the sun?',
    }),
  },
  {
    id: 'temp-vs-air',
    severity: 'check',
    fields: ['waterTemp'],
    needs: 'weather',
    test: (o, w) => Number.isFinite(o.waterTemp) && Number.isFinite(w.airMean3d) && Math.abs(o.waterTemp - w.airMean3d) > 10,
    explain: (o, w) => ({
      title: 'Water and air temperatures do not match',
      why: `Water ${fmt(o.waterTemp)} °C, while the air averaged ${fmt(w.airMean3d)} °C over the last three days. Streams usually stay within about 10 °C of that.`,
      ask: 'A big gap can mean a warm discharge, which is worth reporting, or a reading taken in a sunlit pool.',
      evidence: 'Open-Meteo, mean air temperature over the last 3 days at this site',
    }),
  },
  {
    id: 'foam-with-discharge',
    severity: 'alert',
    fields: ['waterAspect', 'sewage', 'pollutedPipes'],
    test: (o) => has(o.waterAspect, 'FO') && (o.sewage === 'Y' || o.pollutedPipes === 'Y' || o.odor === 'sewage'),
    explain: () => ({
      title: 'Foam together with a discharge',
      why: 'Persistent foam next to sewage signs or a dirty outfall usually means detergents or organic pollution.',
      ask: 'Safety note: avoid skin contact and wash your hands. The outfall is worth reporting to the water authority.',
    }),
  },
  {
    id: 'bloom-risk',
    severity: 'alert',
    fields: ['surface', 'waterAspect'],
    needs: 'weather',
    test: (o, w) => has(o.surface, 'scum') && (!Number.isFinite(w.airMaxToday) || w.airMaxToday >= 18),
    explain: (o, w) => ({
      title: 'Possible harmful algal bloom',
      why: `Green scum${Number.isFinite(w.airMaxToday) ? ` on a ${fmt(w.airMaxToday)} °C day` : ''} can mean cyanobacteria, whose toxins harm dogs, livestock and people.`,
      ask: 'Safety note, not an error. Keep dogs out of the water.',
      evidence: Number.isFinite(w.airMaxToday) ? 'Open-Meteo, maximum air temperature today at this site' : undefined,
    }),
  },
  {
    id: 'oil-and-outfall',
    severity: 'alert',
    fields: ['surface', 'pollutedPipes'],
    test: (o) => has(o.surface, 'oil') && o.pollutedPipes === 'Y',
    explain: () => ({
      title: 'Oil sheen next to a dirty outfall',
      why: 'An oil sheen together with a pipe draining dirty water points to a pollution source.',
      ask: 'Safety note: note where the pipe is and report it.',
    }),
  },
];

// Evidence rules compare where the phone and the photos were with the chosen site.
export function evidenceChecks(evidence = {}, site = {}, assessedAt = new Date()) {
  const flags = [];
  const hasSite = Number.isFinite(site.lat) && Number.isFinite(site.lon);
  const here = evidence.here;
  if (hasSite && here && Number.isFinite(here.lat)) {
    const dist = distanceM(here.lat, here.lon, site.lat, site.lon);
    const slack = Math.max(FAR_M, Number(here.accuracy) || 0);
    if (dist > slack) {
      flags.push({
        id: 'far-from-site', severity: 'check', fields: ['here'],
        title: 'You seem to be away from the chosen site',
        why: `Your phone placed you ${formatDistance(dist)} from ${site.name || 'the chosen site'} (accuracy ±${Math.round(here.accuracy || 0)} m).`,
        ask: 'Pick the site you are actually at, or keep it if you are recording from notes after the visit, and say so.',
        evidence: 'Device location at the time of the assessment',
      });
    }
  }
  for (const [slot, ph] of Object.entries(evidence.photos || {})) {
    if (!ph) continue;
    if (hasSite && Number.isFinite(ph.lat)) {
      const dist = distanceM(ph.lat, ph.lon, site.lat, site.lon);
      if (dist > FAR_M) {
        flags.push({
          id: `photo-far-${slot}`, severity: 'check', fields: ['photos'],
          title: `The ${SLOT[slot]} photo was taken elsewhere`,
          why: `The photo's location data places it ${formatDistance(dist)} from ${site.name || 'the chosen site'}.`,
          ask: 'Replace it with a photo from this site, or keep it and explain.',
          evidence: 'EXIF GPS position stored in the photo',
        });
      }
    }
    const age = photoAgeHours(ph.takenLocal, assessedAt);
    if (age !== null && age > 48) {
      flags.push({
        id: `photo-old-${slot}`, severity: 'check', fields: ['photos'],
        title: `The ${SLOT[slot]} photo is older than this visit`,
        why: `It was taken ${age >= 48 ? `${Math.round(age / 24)} days` : `${Math.round(age)} hours`} before this assessment, so it may not show today's conditions.`,
        ask: 'Take a new photo if you can, or keep it and say when you were last there.',
        evidence: 'EXIF capture time stored in the photo',
      });
    }
  }
  return flags;
}

export function runChecks(obs, weather = null, evidence = null, site = null, assessedAt = new Date()) {
  const w = weather || {};
  const flags = [];
  for (const rule of RULES) {
    if (rule.needs === 'weather' && !weather) continue;
    if (!rule.test(obs, w)) continue;
    flags.push({ id: rule.id, severity: rule.severity, fields: rule.fields, ...rule.explain(obs, w) });
  }
  if (evidence && site) flags.push(...evidenceChecks(evidence, site, assessedAt));
  return flags;
}

export function unresolved(flags, decisions) {
  return flags.filter((f) => f.severity !== 'alert' && !decisions[f.id]);
}
