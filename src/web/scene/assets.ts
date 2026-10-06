import { modelTier, type ModelTier } from '../../shared/models';

const BASE = import.meta.env.BASE_URL;

/** Character models: six women and six men (Kenney Mini Characters, CC0). */
export const CHARACTER_URLS = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((letter) => [
  `${BASE}models/characters/character-female-${letter}.glb`,
  `${BASE}models/characters/character-male-${letter}.glb`,
]);

/** Round glasses every scientist wears (Kenney Mini Characters, CC0). */
export const GLASSES_URL = `${BASE}models/characters/aid-glasses.glb`;

/** Furniture used in labs (Kenney Furniture Kit, CC0). */
export const FURNITURE = {
  desk: 'desk',
  screen: 'computerScreen',
  keyboard: 'computerKeyboard',
  laptop: 'laptop',
  chair: 'chairDesk',
  bookcase: 'bookcaseOpen',
  books: 'books',
  floorLamp: 'lampRoundFloor',
  tableLamp: 'lampSquareTable',
  plant: 'pottedPlant',
  smallPlant: 'plantSmall1',
  rug: 'rugRectangle',
  sideTable: 'sideTable',
  sofa: 'loungeSofa',
  coffee: 'kitchenCoffeeMachine',
  roundTable: 'tableRound',
  television: 'televisionModern',
  radio: 'radio',
  box: 'cardboardBoxClosed',
} as const;

/** Nature decorations for islands (Kenney Nature Kit, CC0). */
export const NATURE = {
  trees: ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_pineRoundC', 'tree_cone'],
  rocks: ['rock_largeA', 'rock_largeC', 'stone_largeB', 'rock_smallA', 'rock_smallC'],
  plants: ['plant_bush', 'plant_bushLarge', 'plant_bushSmall', 'flower_redA', 'flower_yellowB', 'flower_purpleA', 'grass', 'grass_large', 'mushroom_redGroup'],
  props: ['log', 'stump_round'],
} as const;

/** Scale applied to every Kenney model so it fits the 6-unit labs. */
export const KIT_SCALE = 2.2;
/** Base scale of a character before its model build is applied. */
export const CHARACTER_SCALE = 1.25;

/** Body build per model family: [width, height, depth] multipliers. Lean overall; bigger models are taller and broader. */
export const BUILD_BY_TIER: Record<ModelTier, [number, number, number]> = {
  fable: [1.08, 1.26, 1.04],
  opus: [0.98, 1.14, 0.95],
  sonnet: [0.88, 1.04, 0.86],
  haiku: [0.78, 0.94, 0.76],
  unknown: [0.86, 1, 0.84],
};

/** Clothing colour per effort level; unknown effort keeps the character's own outfit. */
export const EFFORT_COLORS: Record<string, string> = {
  max: '#d64545',
  xhigh: '#8a5cd6',
  high: '#3f7fd6',
  medium: '#2fa59a',
  low: '#9aa3ab',
};

/**
 * URL of a furniture model.
 * @param name - model name without extension
 * @returns URL
 */
export const furnitureUrl = (name: string): string => `${BASE}models/furniture/${name}.glb`;

/**
 * URL of a nature model.
 * @param name - model name without extension
 * @returns URL
 */
export const natureUrl = (name: string): string => `${BASE}models/nature/${name}.glb`;

/**
 * A stable pseudo-random number in [0, 1) for a text key and a salt.
 * @param key - identity, e.g. an agent id
 * @param salt - varies the result for different uses of the same key
 * @returns number in [0, 1)
 */
export function seeded(key: string, salt = 0): number {
  let hash = 2166136261 ^ salt;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 100_000) / 100_000;
}

/**
 * The character model an agent wears; the same agent always gets the same one.
 * @param scientistKey - unique key for the agent (session, lab and id)
 * @returns model URL
 */
export function characterFor(scientistKey: string): string {
  return CHARACTER_URLS[Math.floor(seeded(scientistKey, 7) * CHARACTER_URLS.length)] ?? CHARACTER_URLS[0] ?? '';
}

/**
 * Body-build multipliers for a model id.
 * @param model - model id
 * @returns width, height and depth multipliers
 */
export function buildFor(model: string): [number, number, number] {
  return BUILD_BY_TIER[modelTier(model)];
}
