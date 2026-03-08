// ---------------------------------------------------------------------------
// Melee game data dictionaries — ported from resources.py
// ---------------------------------------------------------------------------

export const stageDict: Record<number, string> = {
  2: 'Fountain of Dreams',
  3: 'Pokemon Stadium',
  4: "Princess Peach's Castle",
  5: 'Kongo Jungle',
  6: 'Brinstar',
  7: 'Corneria',
  8: "Yoshi's Story",
  9: 'Onett',
  10: 'Mute City',
  11: 'Rainbow Cruise',
  12: 'Jungle Japes',
  13: 'Great Bay',
  14: 'Hyrule Temple',
  15: 'Brinstar Depths',
  16: "Yoshi's Island",
  17: 'Green Greens',
  18: 'Fourside',
  19: 'Mushroom Kingdom I',
  20: 'Mushroom Kingdom II',
  22: 'Venom',
  23: 'Poke Floats',
  24: 'Big Blue',
  25: 'Icicle Mountain',
  26: 'Icetop',
  27: 'Flat Zone',
  28: 'Dream Land N64',
  29: "Yoshi's Island N64",
  30: 'Kongo Jungle N64',
  31: 'Battlefield',
  32: 'Final Destination',
};

export const characterDict: Record<
  number,
  { name: string; shortName: string }
> = {
  0: { name: 'Captain Falcon', shortName: 'Falcon' },
  1: { name: 'Donkey Kong', shortName: 'DK' },
  2: { name: 'Fox', shortName: 'Fox' },
  3: { name: 'Mr. Game & Watch', shortName: 'G&W' },
  4: { name: 'Kirby', shortName: 'Kirby' },
  5: { name: 'Bowser', shortName: 'Bowser' },
  6: { name: 'Link', shortName: 'Link' },
  7: { name: 'Luigi', shortName: 'Luigi' },
  8: { name: 'Mario', shortName: 'Mario' },
  9: { name: 'Marth', shortName: 'Marth' },
  10: { name: 'Mewtwo', shortName: 'Mewtwo' },
  11: { name: 'Ness', shortName: 'Ness' },
  12: { name: 'Peach', shortName: 'Peach' },
  13: { name: 'Pikachu', shortName: 'Pikachu' },
  14: { name: 'Ice Climbers', shortName: 'ICs' },
  15: { name: 'Jigglypuff', shortName: 'Puff' },
  16: { name: 'Samus', shortName: 'Samus' },
  17: { name: 'Yoshi', shortName: 'Yoshi' },
  18: { name: 'Zelda', shortName: 'Zelda' },
  19: { name: 'Sheik', shortName: 'Sheik' },
  20: { name: 'Falco', shortName: 'Falco' },
  21: { name: 'Young Link', shortName: 'YLink' },
  22: { name: 'Dr. Mario', shortName: 'Doc' },
  23: { name: 'Roy', shortName: 'Roy' },
  24: { name: 'Pichu', shortName: 'Pichu' },
  25: { name: 'Ganondorf', shortName: 'Ganon' },
};

export const moveDict: Record<number, { name: string; shortName: string }> = {
  1: { name: 'Miscellaneous', shortName: 'Misc' },
  2: { name: 'Jab', shortName: 'Jab' },
  3: { name: 'Jab 2', shortName: 'Jab2' },
  4: { name: 'Jab 3', shortName: 'Jab3' },
  5: { name: 'Rapid Jab', shortName: 'RJab' },
  6: { name: 'Dash Attack', shortName: 'DA' },
  7: { name: 'Forward Tilt', shortName: 'Ftilt' },
  8: { name: 'Up Tilt', shortName: 'Utilt' },
  9: { name: 'Down Tilt', shortName: 'Dtilt' },
  10: { name: 'Forward Smash', shortName: 'Fsmash' },
  11: { name: 'Up Smash', shortName: 'Usmash' },
  12: { name: 'Down Smash', shortName: 'Dsmash' },
  13: { name: 'Neutral Air', shortName: 'Nair' },
  14: { name: 'Forward Air', shortName: 'Fair' },
  15: { name: 'Back Air', shortName: 'Bair' },
  16: { name: 'Up Air', shortName: 'Uair' },
  17: { name: 'Down Air', shortName: 'Dair' },
  18: { name: 'Neutral B', shortName: 'NeutB' },
  19: { name: 'Side B', shortName: 'SideB' },
  20: { name: 'Up B', shortName: 'UpB' },
  21: { name: 'Down B', shortName: 'DownB' },
  50: { name: 'Getup Attack', shortName: 'Getup' },
  51: { name: 'Getup Attack (Slow)', shortName: 'GetupS' },
  52: { name: 'Grab Pummel', shortName: 'Pummel' },
  53: { name: 'Forward Throw', shortName: 'Fthrow' },
  54: { name: 'Back Throw', shortName: 'Bthrow' },
  55: { name: 'Up Throw', shortName: 'Uthrow' },
  56: { name: 'Down Throw', shortName: 'Dthrow' },
  61: { name: 'Edge Attack (Slow)', shortName: 'EdgeS' },
  62: { name: 'Edge Attack (Fast)', shortName: 'EdgeF' },
};

export function getCharacterName(id: number | null): string {
  if (id === null) return 'Unknown';
  return characterDict[id]?.name ?? `Character ${id}`;
}

export function getStageName(id: number | null): string {
  if (id === null) return 'Unknown Stage';
  return stageDict[id] ?? `Stage ${id}`;
}

export function getMoveName(id: number): string {
  return moveDict[id]?.shortName ?? `Move ${id}`;
}
