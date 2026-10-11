// Deterministic hash/RNG: the same seed + coordinates always give the same result.

export function hash3(seed: number, x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x * 374761393), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (y * 668265263), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Returns a number in [0, 1). */
export function rand01(seed: number, x: number, y: number): number {
  return hash3(seed, x, y) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
