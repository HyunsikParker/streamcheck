// Example records at real OneAquaHealth research sites. The answers are made up
// for demonstration; the sites and their coordinates come from the OAH API,
// and the weather is fetched live when an example is opened.

import { OAH_SITES } from './oah-sites.js';

const site = (code) => {
  const s = OAH_SITES.find((x) => x.code === code);
  return { code: s.code, name: s.name.trim(), city: s.city, lat: s.lat, lon: s.lon };
};

export const EXAMPLES = [
  {
    title: 'Oslo · Gaustadbekken',
    blurb: 'A wooded brook. Consistent answers, rated Good.',
    site: site('O1'),
    obs: {
      channelForm: 'V', channelType: 'NAT', bankType: 'NAT', habitats: ['SD', 'RF'], fallenBiomass: ['FB', 'FL'], waterFlow: 'FAS',
      waterAspect: ['CL'], withdrawal: 'N', dams: 'N', pollutedPipes: 'N', sewage: 'N', construction: 'N',
      imperviousL: 'N', imperviousR: 'N', vegCoverL: 'Y', vegCoverR: 'Y', vegDominantL: 'T', vegDominantR: 'T', invasiveL: 'N', invasiveR: 'NS', cutsL: 'N', cutsR: 'N',
      contact: ['dogs'], overall: 'GOOD', feelings: { joy: 4, serenity: 5, anger: 0, fear: 0 },
    },
  },
  {
    title: 'Toulouse · Marcaissonne aval',
    blurb: 'Rated Good, yet a dirty outfall and foam were reported.',
    site: site('T5'),
    obs: {
      channelForm: 'U', channelType: 'NAT', bankType: 'ART', habitats: ['SB'], fallenBiomass: ['NONE'], waterFlow: 'NOR',
      waterAspect: ['MU', 'FO'], withdrawal: 'N', dams: 'Y', numberOfDams: 1, pollutedPipes: 'Y', sewage: 'NS', construction: 'N',
      imperviousL: 'Y', imperviousR: 'N', vegCoverL: 'N', vegCoverR: 'Y', vegDominantL: 'H', vegDominantR: 'H', invasiveL: 'NS', invasiveR: 'Y', cutsL: 'Y', cutsR: 'N',
      odor: 'sewage', surface: ['litter'], contact: ['children'], overall: 'GOOD', feelings: { joy: 2, serenity: 2, anger: 3, fear: 1 },
    },
  },
  {
    title: 'Coimbra · Vale das Flores',
    blurb: 'Natural channel rated Poor, with green scum.',
    site: site('C3'),
    obs: {
      channelForm: 'U', channelType: 'NAT', bankType: 'NAT', habitats: ['SD', 'AV'], fallenBiomass: ['FL'], waterFlow: 'STA',
      waterAspect: ['MU'], withdrawal: 'NS', dams: 'N', pollutedPipes: 'N', sewage: 'N', construction: 'N',
      imperviousL: 'N', imperviousR: 'N', vegCoverL: 'Y', vegCoverR: 'Y', vegDominantL: 'B', vegDominantR: 'H', invasiveL: 'Y', invasiveR: 'N', cutsL: 'N', cutsR: 'N',
      surface: ['scum'], waterTemp: 21.5, contact: ['dogs'], overall: 'POOR', feelings: { joy: 1, serenity: 2, anger: 1, fear: 0 },
    },
  },
];
