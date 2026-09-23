// The field protocol. Core questions mirror the OneAquaHealth Citizen Science
// App and use its answer codes (api.enora-oah.eu/api/citizens/*), so records
// line up with the project's data. "Extras" are StreamCheck additions used for
// One Health notes; they are optional.

const NS = { value: 'NS', label: "I'm not sure" };
const YN = [{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' }, NS];

export const STEPS = [
  {
    id: 'channel',
    title: 'What do you see from where you stand?',
    hint: 'Look about 100 metres along the stream, up and down.',
    fields: [
      { id: 'channelForm', label: 'What shape is the channel?', term: 'Channel form', oah: 'morophology',
        options: [{ value: 'FLAT', label: 'Flat and wide' }, { value: 'U', label: 'U shape' }, { value: 'V', label: 'V shape, steep sides' }, NS] },
      { id: 'channelType', label: 'What is the bottom of the channel made of?', term: 'Channel bed', oah: 'morophology',
        options: [{ value: 'NAT', label: 'Natural: stones, sand, mud', short: 'Natural' }, { value: 'ART', label: 'Artificial: concrete, or stones set in concrete', short: 'Artificial' }, NS] },
      { id: 'bankType', label: 'What are the banks made of?', term: 'Bank type', oah: 'morophology',
        options: [{ value: 'NAT', label: 'Natural soil and plants', short: 'Natural' }, { value: 'ART', label: 'Concrete, or stones set in concrete', short: 'Concrete' }, { value: 'LAS', label: 'Laid stones without concrete', short: 'Laid stones' }, NS] },
      { id: 'habitats', label: 'Which of these can you see in the stream?', term: 'Instream habitats', oah: 'morophology', multiple: true,
        options: [{ value: 'SB', label: 'Sand banks' }, { value: 'SI', label: 'Sand islands' }, { value: 'SD', label: 'Stone deposits' }, { value: 'RF', label: 'Riffles, rapids or small falls' }, { value: 'AV', label: 'Plants growing in the water' }, { value: 'NONE', label: 'None of these' }] },
      { id: 'fallenBiomass', label: 'Any fallen wood or leaves in the water?', term: 'Natural debris', oah: 'morophology', multiple: true,
        options: [{ value: 'FT', label: 'Fallen trees' }, { value: 'FB', label: 'Fallen branches' }, { value: 'FL', label: 'Piles of leaves' }, { value: 'NONE', label: 'None' }] },
      { id: 'waterFlow', label: 'How is the water moving?', term: 'Flow type', oah: 'hydrology',
        options: [{ value: 'FAS', label: 'Fast, with waves' }, { value: 'NOR', label: 'Slow' }, { value: 'STA', label: 'Standing, or only now and then', short: 'Standing' }, { value: 'DRY', label: 'Dry' }, NS] },
    ],
  },
  {
    id: 'water',
    title: 'The water and what goes into it',
    hint: 'Look at the main flow, not a still pool by the edge.',
    fields: [
      { id: 'waterAspect', label: 'How does the water look?', term: 'Water aspect', oah: 'foam', multiple: true,
        options: [{ value: 'CL', label: 'Clear, you can see through it', short: 'Clear' }, { value: 'MU', label: 'Muddy or cloudy' }, { value: 'FO', label: 'Foam on the surface' }, { value: 'CO', label: 'An unusual colour' }, NS] },
      { id: 'withdrawal', label: 'Is water being pumped or taken out?', term: 'Water abstraction', oah: 'hydrology', options: YN },
      { id: 'dams', label: 'Any dams, weirs or barriers?', term: 'Longitudinal connectivity', oah: 'hydrology', options: YN },
      { id: 'numberOfDams', label: 'How many?', term: 'Barrier count', oah: 'hydrology', type: 'number', unit: '', min: 0, max: 50, step: 1, optional: true, showIf: (o) => o.dams === 'Y' },
      { id: 'pollutedPipes', label: 'Pipes draining dirty-looking water into the stream?', term: 'Polluted outfalls', oah: 'LandUse', options: YN },
      { id: 'sewage', label: 'Signs of sewage going in?', term: 'Sewage discharge', oah: 'LandUse', options: YN },
      { id: 'construction', label: 'Construction work in or next to the stream?', term: 'Channel works', oah: 'morophology', options: YN },
      { id: 'waterHeight', label: 'About how deep is the water?', term: 'Water height', oah: 'hydrology', type: 'number', unit: 'm', min: 0, max: 10, step: 0.05, optional: true },
    ],
  },
  {
    id: 'margins',
    title: 'The margins',
    hint: 'Look at the land 5 to 10 metres back from the top of each bank. Left and right are as you face downstream.',
    paired: true,
    fields: [
      { id: 'impervious', label: 'Is more than a third of it paved or built on?', term: 'Impervious surface', oah: 'LandUse', sides: true, options: YN },
      { id: 'vegCover', label: 'Is it covered by plants?', term: 'Riparian vegetation cover', oah: 'riparianVegetation', sides: true, options: YN },
      { id: 'vegDominant', label: 'Which plants cover most of it?', term: 'Dominant vegetation', oah: 'riparianVegetation', sides: true,
        options: [{ value: 'H', label: 'Grass and herbs' }, { value: 'B', label: 'Shrubs' }, { value: 'T', label: 'Trees' }, NS] },
      { id: 'invasive', label: 'Any invasive plants?', term: 'Invasive species', oah: 'invasiveOrganisms', sides: true, options: YN },
      { id: 'cuts', label: 'Has vegetation been cut recently?', term: 'Vegetation management', oah: 'riparianVegetation', sides: true, options: YN },
    ],
  },
  {
    id: 'extras',
    title: 'For people and animals (optional)',
    hint: 'StreamCheck extras beyond the OneAquaHealth form. They feed the One Health notes.',
    fields: [
      { id: 'odor', label: 'Does the water smell?', term: 'Odour', oah: 'foam', optional: true,
        options: [{ value: 'none', label: 'No smell' }, { value: 'earthy', label: 'Earthy or leafy' }, { value: 'sewage', label: 'Sewage or rotten eggs' }, { value: 'chemical', label: 'Chemical or fuel' }] },
      { id: 'surface', label: 'Anything floating on top?', term: 'Surface film', oah: 'foam', multiple: true, optional: true,
        options: [{ value: 'scum', label: 'Green scum like spilled paint' }, { value: 'oil', label: 'Rainbow sheen (oil)' }, { value: 'litter', label: 'Litter' }, { value: 'none', label: 'Nothing' }] },
      { id: 'waterTemp', label: 'Water temperature, if you have a thermometer', term: 'Water temperature', oah: 'waterTemperature', type: 'number', unit: '°C', min: -5, max: 45, step: 0.1, optional: true },
      { id: 'contact', label: 'Who uses the water here?', term: 'Exposure', multiple: true, optional: true,
        options: [{ value: 'dogs', label: 'Dogs swim or drink' }, { value: 'children', label: 'Children play in it' }, { value: 'livestock', label: 'Farm animals drink' }, { value: 'none', label: 'No one that I saw' }] },
    ],
  },
  {
    id: 'overall',
    title: 'Your overall assessment',
    hint: 'Your own judgement. StreamCheck will show its indicator-based view next to it, but yours is the one recorded.',
    fields: [
      { id: 'overall', label: 'How would you rate this stretch of stream?', term: 'Overall stream assessment',
        options: [
          { value: 'GOOD', label: 'Good: natural channel, plants on the banks, clean water, life', short: 'Good' },
          { value: 'MODERATE', label: 'Moderate: some changes, but still green and alive', short: 'Moderate' },
          { value: 'POOR', label: 'Poor: heavily modified, little life, polluted', short: 'Poor' },
        ] },
      { id: 'feelings', label: 'How does this place make you feel? (optional)', term: 'Well-being', type: 'feelings', optional: true,
        moods: [{ id: 'joy', label: 'Joy' }, { id: 'serenity', label: 'Calm' }, { id: 'anger', label: 'Anger' }, { id: 'fear', label: 'Fear' }] },
    ],
  },
];

export const FIELDS = Object.fromEntries(STEPS.flatMap((s) => s.fields).map((f) => [f.id, f]));
export const SIDES = [{ id: 'L', label: 'Left bank' }, { id: 'R', label: 'Right bank' }];

// Answer keys: paired fields are stored as `<id>L` / `<id>R`.
export function answerKeys(field) {
  return field.sides ? SIDES.map((s) => `${field.id}${s.id}`) : [field.id];
}

export function fieldOf(key) {
  if (FIELDS[key]) return { field: FIELDS[key], side: null };
  const side = key.slice(-1);
  const base = key.slice(0, -1);
  if (FIELDS[base]?.sides && (side === 'L' || side === 'R')) return { field: FIELDS[base], side };
  return { field: null, side: null };
}

export function optionLabel(key, value, short = false) {
  const { field } = fieldOf(key);
  if (!field) return String(value ?? '');
  if (field.type === 'feelings') return Object.entries(value || {}).map(([k, v]) => `${k} ${v}/5`).join(', ');
  if (!field.options) return value === undefined ? '' : `${value}${field.unit ? ` ${field.unit}` : ''}`;
  if (Array.isArray(value)) return value.map((v) => optionLabel(key, v, short)).join(', ');
  const o = field.options.find((x) => x.value === value) || {};
  return (short && o.short) || o.label || String(value ?? '');
}

export function keyLabel(key) {
  const { field, side } = fieldOf(key);
  if (!field) return key;
  return side ? `${field.term} (${side === 'L' ? 'left' : 'right'} bank)` : field.term;
}
