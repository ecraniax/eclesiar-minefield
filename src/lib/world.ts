// Public (static) world: rings, rivers, smoke, outposts, legendary treasure, the General's Bunker.
// It is the same for every player and the client may know it. Mines and hidden treasure are NOT here
// (they are a server secret, see src/mock/mockServer.ts).

import { CENTER, MAP_SIZE, RINGS, type RingDef } from "./config";
import { mulberry32 } from "./rng";

export const WORLD_SEED = 740_2026;

export const idx = (x: number, y: number) => y * MAP_SIZE + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
export const distFromCenter = (x: number, y: number) => Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));

export function ringOf(x: number, y: number): RingDef {
  const d = distFromCenter(x, y);
  return RINGS.find((r) => d <= r.maxDist) ?? RINGS[RINGS.length - 1];
}

export const NEIGHBORS8: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
export const NEIGHBORS4: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];

export interface Point { x: number; y: number }
export interface Zone extends Point { r: number }

/** Cell terrain (visual only). */
export const TERRAIN = { flats: 0, forest: 1, mountain: 2, desert: 3 } as const;
export type TerrainId = (typeof TERRAIN)[keyof typeof TERRAIN];
export const TERRAIN_INFO: { name: string; color: string; colorOpen: string }[] = [
  { name: "Flats", color: "#6a8f3f", colorOpen: "#c9cf9a" },
  { name: "Forest", color: "#35612b", colorOpen: "#aebd8f" },
  { name: "Mountain", color: "#7b7468", colorOpen: "#c4bfb3" },
  { name: "Desert", color: "#d6ad62", colorOpen: "#ecdcb4" },
];

export interface World {
  terrain: Uint8Array;
  river: Uint8Array;
  smoke: Uint8Array;
  outposts: Point[];
  bunkerZones: Zone[];
  legendaries: Point[];
  general: Point; // centre of the 3×3 area
}

function polar(rand: () => number, minD: number, maxD: number): Point {
  for (;;) {
    const a = rand() * Math.PI * 2;
    const r = minD + rand() * (maxD - minD);
    const x = Math.round(CENTER + Math.cos(a) * r);
    const y = Math.round(CENTER + Math.sin(a) * r);
    const d = distFromCenter(x, y);
    if (inBounds(x, y) && x > 2 && y > 2 && x < MAP_SIZE - 3 && y < MAP_SIZE - 3 && d >= minD && d <= maxD) return { x, y };
  }
}

function carveRiver(river: Uint8Array, rand: () => number, horizontal: boolean, start: number, from: number, to: number) {
  let pos = start;
  let drift = 0;
  let sinceFord = 0;
  let nextFord = 10 + Math.floor(rand() * 8);
  for (let t = from; t <= to; t++) {
    drift = Math.max(-1, Math.min(1, drift + (rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0)));
    const prev = pos;
    if (rand() < 0.45) pos += drift;
    pos = Math.max(3, Math.min(MAP_SIZE - 4, pos));
    sinceFord++;
    if (sinceFord >= nextFord) {
      // Ford: 2 columns/rows without water
      if (sinceFord >= nextFord + 1) {
        sinceFord = 0;
        nextFord = 10 + Math.floor(rand() * 8);
      }
      continue;
    }
    const lo = Math.min(prev, pos);
    const hi = Math.max(prev, pos);
    for (let p = lo; p <= hi; p++) {
      const x = horizontal ? t : p;
      const y = horizontal ? p : t;
      if (distFromCenter(x, y) > 8) river[idx(x, y)] = 1;
    }
  }
}

/** Terrain is set by the ring: each ring is entirely in its own design (RingDef.terrain). */
function buildTerrain(): Uint8Array {
  const terrain = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y++)
    for (let x = 0; x < MAP_SIZE; x++) terrain[idx(x, y)] = ringOf(x, y).terrain;
  return terrain;
}

function buildWorld(): World {
  const rand = mulberry32(WORLD_SEED);
  const river = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const smoke = new Uint8Array(MAP_SIZE * MAP_SIZE);

  carveRiver(river, rand, true, 30, 0, MAP_SIZE - 1);
  carveRiver(river, rand, false, 115, 0, MAP_SIZE - 1);
  carveRiver(river, rand, true, 121, 0, MAP_SIZE - 1);
  carveRiver(river, rand, false, 48, 40, 112);

  // Smoke: a few circular zones in ring 3
  for (let i = 0; i < 7; i++) {
    const c = polar(rand, 40, 52);
    for (let y = c.y - 4; y <= c.y + 4; y++)
      for (let x = c.x - 4; x <= c.x + 4; x++)
        if (inBounds(x, y) && (x - c.x) ** 2 + (y - c.y) ** 2 <= 17) smoke[idx(x, y)] = 1;
  }

  const outposts: Point[] = [];
  for (let i = 0; i < 4; i++) outposts.push(polar(rand, 24, 32));
  for (let i = 0; i < 4; i++) outposts.push(polar(rand, 42, 50));

  const bunkerZones: Zone[] = [];
  for (let i = 0; i < 2; i++) bunkerZones.push({ ...polar(rand, 24, 33), r: 3 });
  for (let i = 0; i < 2; i++) bunkerZones.push({ ...polar(rand, 40, 51), r: 3 });
  for (let i = 0; i < 2; i++) bunkerZones.push({ ...polar(rand, 58, 70), r: 3 });

  const legendaries: Point[] = [];
  for (let i = 0; i < 3; i++) legendaries.push(polar(rand, 44, 53));
  for (let i = 0; i < 2; i++) legendaries.push(polar(rand, 58, 70));

  const general = { x: 137, y: 12 };

  // No water around points of interest
  const clear = (p: Point, r: number) => {
    for (let y = p.y - r; y <= p.y + r; y++)
      for (let x = p.x - r; x <= p.x + r; x++) if (inBounds(x, y)) river[idx(x, y)] = 0;
  };
  outposts.forEach((p) => clear(p, 1));
  bunkerZones.forEach((z) => clear(z, z.r));
  legendaries.forEach((p) => clear(p, 1));
  clear(general, 2);

  return { terrain: buildTerrain(), river, smoke, outposts, bunkerZones, legendaries, general };
}

export const WORLD: World = buildWorld();

export function bunkerZoneAt(x: number, y: number): Zone | undefined {
  return WORLD.bunkerZones.find((z) => Math.abs(x - z.x) <= z.r && Math.abs(y - z.y) <= z.r);
}

export function isGeneralCell(x: number, y: number): boolean {
  return Math.abs(x - WORLD.general.x) <= 1 && Math.abs(y - WORLD.general.y) <= 1;
}

export function ringUnlocked(x: number, y: number, day: number): boolean {
  return ringOf(x, y).unlockDay <= day;
}
