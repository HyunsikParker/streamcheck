// Indicator-based view on the OneAquaHealth Good / Moderate / Poor scale.
// It sits next to the citizen's own rating; it never replaces it.
// Every class carries the answers that produced it.

const has = (list, v) => Array.isArray(list) && list.includes(v);
const CLASS = ['POOR', 'MODERATE', 'GOOD'];
const NAME = { GOOD: 'Good', MODERATE: 'Moderate', POOR: 'Poor', UNKNOWN: 'Not enough information' };
const known = (v) => v !== undefined && v !== 'NS' && !(Array.isArray(v) && (v.length === 0 || v.every((x) => x === 'NS')));

function group(id, title, level, why) {
  return { id, title, level, label: NAME[level], why };
}

export function indicators(o) {
  const out = [];

  // Hydromorphology: bed, banks, habitat variety, natural debris.
  if (known(o.channelType) || known(o.bankType)) {
    let pts = 0;
    const why = [];
    if (o.channelType === 'NAT') { pts += 2; why.push('natural bed'); } else if (o.channelType === 'ART') why.push('artificial bed');
    if (o.bankType === 'NAT') { pts += 2; why.push('natural banks'); } else if (o.bankType === 'LAS') { pts += 1; why.push('laid-stone banks'); } else if (o.bankType === 'ART') why.push('concrete banks');
    const hab = (o.habitats || []).filter((h) => h !== 'NONE' && h !== 'NS').length;
    if (hab >= 2) { pts += 1; why.push(`${hab} habitat types`); }
    if ((o.fallenBiomass || []).some((b) => ['FT', 'FB', 'FL'].includes(b))) { pts += 1; why.push('natural debris'); }
    out.push(group('hydromorphology', 'Channel and banks', pts >= 4 ? 'GOOD' : pts >= 2 ? 'MODERATE' : 'POOR', why.join(', ')));
  } else out.push(group('hydromorphology', 'Channel and banks', 'UNKNOWN', 'channel bed and banks not recorded'));

  // Water: what it looks like and what goes into it.
  if (known(o.waterAspect) || known(o.sewage) || known(o.pollutedPipes)) {
    const why = [];
    let level = 'GOOD';
    if (has(o.waterAspect, 'MU')) { level = 'MODERATE'; why.push('muddy'); }
    if (has(o.waterAspect, 'FO') || has(o.waterAspect, 'CO')) { level = 'MODERATE'; why.push('foam or colour'); }
    if (o.pollutedPipes === 'Y') { level = 'MODERATE'; why.push('dirty outfall'); }
    if (o.sewage === 'Y' || o.odor === 'sewage' || (has(o.waterAspect, 'FO') && o.pollutedPipes === 'Y')) { level = 'POOR'; why.push('sewage'); }
    if (o.waterFlow === 'DRY') { level = 'POOR'; why.push('dry'); }
    if (!why.length) why.push(has(o.waterAspect, 'CL') ? 'clear, no discharges seen' : 'no discharges seen');
    out.push(group('water', 'Water', level, [...new Set(why)].join(', ')));
  } else out.push(group('water', 'Water', 'UNKNOWN', 'water not recorded'));

  // Margins: paving, plant cover, invasive plants, both sides.
  const sides = ['L', 'R'].filter((s) => known(o[`impervious${s}`]) || known(o[`vegCover${s}`]));
  if (sides.length) {
    let pts = 0;
    let max = 0;
    const why = [];
    for (const s of sides) {
      const side = s === 'L' ? 'left' : 'right';
      max += 3;
      if (o[`impervious${s}`] === 'N') pts += 1; else if (o[`impervious${s}`] === 'Y') why.push(`${side} paved`);
      if (o[`vegCover${s}`] === 'Y') { pts += 1; if (o[`vegDominant${s}`] === 'T' || o[`vegDominant${s}`] === 'B') pts += 1; } else if (o[`vegCover${s}`] === 'N') why.push(`${side} bare`);
      if (o[`invasive${s}`] === 'Y') { pts -= 1; why.push(`invasive plants ${side}`); }
    }
    const r = pts / max;
    if (!why.length) why.push('vegetated, unpaved margins');
    out.push(group('margins', 'Margins', r >= 0.66 ? 'GOOD' : r >= 0.33 ? 'MODERATE' : 'POOR', why.join(', ')));
  } else out.push(group('margins', 'Margins', 'UNKNOWN', 'margins not recorded'));

  // Pressures on flow: abstraction, barriers, works.
  const pv = ['withdrawal', 'dams', 'construction'];
  if (pv.some((k) => known(o[k]))) {
    const present = pv.filter((k) => o[k] === 'Y');
    const names = { withdrawal: 'water taken out', dams: 'barriers', construction: 'works' };
    out.push(group('pressures', 'Flow pressures', present.length === 0 ? 'GOOD' : present.length === 1 ? 'MODERATE' : 'POOR', present.length ? present.map((k) => names[k]).join(', ') : 'none seen'));
  } else out.push(group('pressures', 'Flow pressures', 'UNKNOWN', 'not recorded'));

  return out;
}

export function suggestion(groups) {
  const scored = groups.filter((g) => g.level !== 'UNKNOWN');
  if (scored.length < 2) return { level: 'UNKNOWN', label: NAME.UNKNOWN, why: 'Fewer than two indicator groups could be assessed.' };
  const mean = scored.reduce((a, g) => a + CLASS.indexOf(g.level), 0) / scored.length;
  const base = mean >= 1.5 ? 2 : mean >= 0.75 ? 1 : 0;
  // Poor water caps the result at Moderate, whatever the rest says.
  const capped = base === 2 && scored.some((g) => g.id === 'water' && g.level === 'POOR');
  const level = CLASS[capped ? 1 : base];
  return { level, label: NAME[level], why: `Average of ${scored.length} indicator groups${capped ? ', capped at Moderate because the water is Poor' : ''}.` };
}

export function agreement(own, sugg) {
  if (!own || sugg.level === 'UNKNOWN') return { state: 'n/a', text: 'No comparison possible.' };
  const gap = Math.abs(CLASS.indexOf(own) - CLASS.indexOf(sugg.level));
  if (gap === 0) return { state: 'agree', text: 'Your rating and the indicators agree.' };
  if (gap === 1) return { state: 'close', text: 'One step apart. Normal: your rating also reflects things the form does not ask.' };
  return { state: 'apart', text: 'Two steps apart. Your notes in the second look explain why.' };
}

export function confidence(o, flags, decisions) {
  const kept = flags.filter((f) => f.severity !== 'alert' && decisions[f.id]?.action === 'keep').length;
  const vals = Object.values(o);
  const unsure = vals.filter((v) => v === 'NS' || (Array.isArray(v) && v.includes('NS'))).length;
  const why = [];
  if (kept) why.push(`${kept} answer(s) kept after a second look`);
  if (unsure >= 4) why.push(`${unsure} "not sure" answers`);
  if (!why.length) return { level: 'high', why: 'Answers are consistent and mostly certain.' };
  return { level: kept + (unsure >= 6 ? 1 : 0) >= 2 ? 'low' : 'medium', why: why.join('; ') + '.' };
}

// One Health: the same record read for the ecosystem, animals and people.
export function oneHealth(o, weather = null, groups = indicators(o)) {
  const notes = { ecosystem: [], animals: [], people: [] };
  const bloom = has(o.surface, 'scum');
  const sewage = o.sewage === 'Y' || o.odor === 'sewage';
  const rain = weather && Number.isFinite(weather.rain48h) ? weather.rain48h : null;

  const hydro = groups.find((g) => g.id === 'hydromorphology');
  const margins = groups.find((g) => g.id === 'margins');
  if (hydro?.level === 'GOOD') notes.ecosystem.push({ level: 'good', text: 'A natural channel with varied habitats gives insects, fish and plants places to live.' });
  if (hydro?.level === 'POOR') notes.ecosystem.push({ level: 'watch', text: 'A hard, uniform channel offers little habitat and warms quickly in summer.' });
  if (margins?.level === 'POOR') notes.ecosystem.push({ level: 'watch', text: 'Bare or paved margins let runoff in unfiltered and give no shade.' });
  if (o.invasiveL === 'Y' || o.invasiveR === 'Y') notes.ecosystem.push({ level: 'watch', text: 'Invasive plants crowd out native bank vegetation. Worth mapping.' });
  if (o.dams === 'Y') notes.ecosystem.push({ level: 'watch', text: 'Barriers block fish and sediment moving along the stream.' });

  if (bloom) notes.animals.push({ level: 'alert', text: 'Possible toxic algae. Keep dogs out and stop them drinking or licking wet fur.' });
  if (has(o.contact, 'livestock') && (sewage || bloom)) notes.animals.push({ level: 'alert', text: 'Farm animals drink here while the water shows pollution signs. Tell the landowner.' });
  if (has(o.contact, 'dogs') && sewage && !bloom) notes.animals.push({ level: 'watch', text: 'Dogs swim here and there are sewage signs. Rinse them afterwards.' });

  if (sewage) notes.people.push({ level: 'alert', text: 'Sewage signs: avoid skin contact and wash hands after the visit.' });
  if (rain !== null && rain >= 20) notes.people.push({ level: 'watch', text: `${Math.round(rain)} mm of rain in 48 hours. Storm overflows are likely; avoid contact for two days.` });
  if (has(o.contact, 'children') && (sewage || bloom || has(o.surface, 'oil') || o.pollutedPipes === 'Y')) notes.people.push({ level: 'alert', text: 'Children play in water with pollution signs. A priority to report.' });
  if (o.pollutedPipes === 'Y') notes.people.push({ level: 'watch', text: 'A dirty outfall enters here. Note it for the water authority.' });
  const f = o.feelings || {};
  if (Number.isFinite(f.serenity) || Number.isFinite(f.joy)) {
    const calm = Math.max(f.serenity ?? 0, f.joy ?? 0);
    if (calm >= 4) notes.people.push({ level: 'good', text: 'You found this place calming. Green, living streams support mental well-being.' });
  }
  if ((f.fear ?? 0) >= 3 || (f.anger ?? 0) >= 3) notes.people.push({ level: 'watch', text: 'This place made you uneasy. Neglected water spaces are used less by residents.' });

  for (const k of Object.keys(notes)) if (!notes[k].length) notes[k].push({ level: 'good', text: 'Nothing of concern in this record.' });
  return notes;
}

export { NAME as CLASS_NAME };
