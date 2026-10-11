// Reward catalogue (server items from the game). Images live in public/serverItems/avatar.
// Common items (1–8) drop in larger amounts, rare ones 1–3 at a time.

export interface ItemDef {
  id: string;
  name: string;
  img: string;
  rare: boolean;
  /** Amount dropped by one treasure. */
  min: number;
  max: number;
  /** Relative weight within its group (common / rare). */
  weight: number;
}

const img = (n: number) => `/serverItems/avatar/${n}.png`;

export const ITEMS: ItemDef[] = [
  // Common – larger amounts
  { id: "grain", name: "Grain", img: img(8), rare: false, min: 20, max: 100, weight: 14 },
  { id: "food", name: "Food", img: img(7), rare: false, min: 5, max: 25, weight: 14 },
  { id: "iron", name: "Iron", img: img(2), rare: false, min: 10, max: 50, weight: 13 },
  { id: "fuel", name: "Fuel", img: img(4), rare: false, min: 10, max: 40, weight: 12 },
  { id: "weapon", name: "Weapon", img: img(5), rare: false, min: 3, max: 15, weight: 12 },
  { id: "titanium", name: "Titanium", img: img(6), rare: false, min: 2, max: 10, weight: 9 },
  { id: "ticket", name: "Airplane ticket", img: img(3), rare: false, min: 1, max: 5, weight: 9 },
  { id: "aircraft", name: "Aircraft", img: img(1), rare: false, min: 1, max: 5, weight: 6 },

  // Rare – 1 to 3 pieces
  { id: "medic_bag", name: "Medic bag", img: img(31), rare: true, min: 1, max: 3, weight: 10 },
  { id: "adrenaline", name: "Adrenaline", img: img(32), rare: true, min: 1, max: 3, weight: 10 },
  { id: "steroids", name: "Steroids", img: img(30), rare: true, min: 1, max: 3, weight: 8 },
  { id: "focus", name: "Focus", img: img(33), rare: true, min: 1, max: 3, weight: 8 },
  { id: "city_map", name: "City map", img: img(27), rare: true, min: 1, max: 3, weight: 7 },
  { id: "hammer", name: "Hammer", img: img(432), rare: true, min: 1, max: 3, weight: 7 },
  { id: "bunker", name: "Bunker", img: img(26), rare: true, min: 1, max: 3, weight: 5 },
  { id: "notepad", name: "Notepad", img: img(17356), rare: true, min: 1, max: 3, weight: 5 },
  { id: "tank", name: "Tank", img: img(28), rare: true, min: 1, max: 3, weight: 4 },
  { id: "manual", name: "Military Strategy Manual", img: img(8270), rare: true, min: 1, max: 3, weight: 3 },
  { id: "relocation", name: "Relocation Permit", img: img(6190), rare: true, min: 1, max: 3, weight: 3 },
  { id: "bomber", name: "Bomber", img: img(29), rare: true, min: 1, max: 3, weight: 2 },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const COMMON_ITEMS = ITEMS.filter((i) => !i.rare);
export const RARE_ITEMS = ITEMS.filter((i) => i.rare);

/** Chance that a normal treasure holds a rare item – per ring (1–4). Further from camp = more rare items. */
export const RARE_CHANCE_BY_RING = [0.1, 0.2, 0.3, 0.4];

export interface ItemStack {
  id: string;
  qty: number;
}

/** Rewards of special points (public – also shown in the rules). */
export const OUTPOST_STEPS = 15;

export const LEGENDARY_GOLD = 30;
/** Items for each of the 5 stars (all different). */
export const LEGENDARY_ITEMS: ItemStack[][] = [
  [
    { id: "medic_bag", qty: 3 },
    { id: "hammer", qty: 3 },
  ],
  [
    { id: "focus", qty: 3 },
    { id: "tank", qty: 3 },
  ],
  [
    { id: "bunker", qty: 3 },
    { id: "bomber", qty: 3 },
  ],
  [
    { id: "manual", qty: 3 },
    { id: "steroids", qty: 3 },
  ],
  [
    { id: "relocation", qty: 3 },
    { id: "adrenaline", qty: 3 },
  ],
];

export const GENERAL_GOLD = 50;
export const GENERAL_ITEMS: ItemStack[] = [
  { id: "bomber", qty: 3 },
  { id: "tank", qty: 3 },
  { id: "manual", qty: 3 },
  { id: "relocation", qty: 3 },
];
