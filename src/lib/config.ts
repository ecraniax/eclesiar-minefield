// All balance settings in one place.

export const MAP_SIZE = 150;
export const CENTER = 75;
export const CHUNK_SIZE = 15;

export const EVENT_DAYS = 30;

/**
 * Steps: every step onto a NEW cell costs 1 step. Walking over explored cells and defusing are free.
 * When steps hit 0, a LOCKOUT_MS lockout follows, then STEPS_PER_REFILL steps are refilled.
 */
export const STEPS_PER_REFILL = 20;

/** Lockout: when you run out of steps, step on a mine or defuse a cell without a mine. */
export const LOCKOUT_MS = 1 * 60 * 60 * 1000;

/** Wrong defuse (no mine on the cell): destroys unexplored cells and treasure within this radius (2 = a 5×5 area). */
export const DEFUSE_BLAST_RADIUS = 2;

export const EXTRA_STEPS_PACK = 20;
/** Price of a step pack in gems. */
export const EXTRA_STEPS_PRICE_GEMS = 5;
export const EXTRA_PACKS_PER_DAY = 5;

/**
 * The metal detector (treasure signal) is deliberately imprecise:
 * strong = treasure within SIGNAL_STRONG cells, weak = within SIGNAL_RANGE cells.
 */
export const SIGNAL_RANGE = 4;
export const SIGNAL_STRONG = 2;

/** Share of cells hiding a treasure. */
export const TREASURE_DENSITY = 0.008;

/** Radius (in cells) around the camp with no mines. */
export const SAFE_RADIUS = 1;

/** Blast radius that destroys hidden treasure. */
export const BLAST_RADIUS = 2;

export interface RingDef {
  id: 1 | 2 | 3 | 4;
  name: string;
  /** Maximum Chebyshev distance from the centre (inclusive). */
  maxDist: number;
  mineDensity: number;
  unlockDay: number;
  /** Design (terrain) of the whole ring: 0 Flats, 1 Forest, 2 Mountain, 3 Desert. */
  terrain: 0 | 1 | 2 | 3;
  /** Ring colour (legend in the side panel). */
  fog: string;
}

export const RINGS: RingDef[] = [
  { id: 1, name: "Flats", maxDist: 18, mineDensity: 0.18, unlockDay: 1, terrain: 0, fog: "#6a8f3f" },
  { id: 2, name: "Forest", maxDist: 36, mineDensity: 0.22, unlockDay: 8, terrain: 1, fog: "#35612b" },
  { id: 3, name: "Mountain", maxDist: 54, mineDensity: 0.26, unlockDay: 15, terrain: 2, fog: "#7b7468" },
  { id: 4, name: "Desert", maxDist: 74, mineDensity: 0.3, unlockDay: 22, terrain: 3, fog: "#d6ad62" },
];

export const ABANDONED_BUNKER_DENSITY = 0.38;

export const TOOL_INFO = {
  detector: { icon: "🔍", name: "Mine detector", desc: "Shows the number of mines in a 3×3 area (within 2 cells of you)." },
  dog: { icon: "🐕", name: "Sniffer dog", desc: "Checks one cell next to you: safe or mine." },
  vest: { icon: "🛡️", name: "Flak vest", desc: "Arm it: the next mine you step on won't lock you out." },
  drone: { icon: "🛸", name: "Recon drone", desc: "Spots hidden treasure in a 7×7 area (up to 10 cells from you)." },
  bridge: { icon: "🌉", name: "Bridge", desc: "Build a bridge over a river cell next to you." },
} as const;

export const STARTING_TOOLS = { detector: 1, dog: 1, vest: 0, drone: 0, bridge: 0 };

/** Chance that a normal treasure also holds a bonus tool / bonus steps (mutually exclusive). */
export const TREASURE_BONUS_TOOL_CHANCE = 0.12;
export const TREASURE_BONUS_STEPS_CHANCE = 0.08;
export const TREASURE_BONUS_STEPS = 5;

/** Which tool drops (relative weights) when a treasure or bunker stash gives a random tool. */
export const TOOL_DROP_WEIGHTS = { detector: 35, dog: 30, vest: 20, drone: 10, bridge: 5 } as const;
/** Mock gem balance (in production this comes from the player's account). */
export const MOCK_GEM_BALANCE = 100;
