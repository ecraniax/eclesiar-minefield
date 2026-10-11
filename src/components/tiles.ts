// Terrain tiles (Flats, Forest, Mountain, Desert), drawn once into an offscreen canvas and then just copied.
// Each terrain has several variants so the map isn't repetitive. Explored cells are lightened so numbers stay readable.

import { mulberry32 } from "@/lib/rng";
import { TERRAIN, TERRAIN_INFO } from "@/lib/world";

const T = 128; // logical size the tiles are drawn in
const RES = 384; // actual pixel resolution (sharp even for a 192 px cell at 2× DPI)
export const TILE_VARIANTS = 4;

const cache = new Map<string, HTMLCanvasElement>();

export function getTile(terrain: number, variant: number, open: boolean): HTMLCanvasElement {
  const key = `${terrain}:${variant}:${open ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = RES;
  c.height = RES;
  const ctx = c.getContext("2d")!;
  ctx.scale(RES / T, RES / T);
  const rand = mulberry32(terrain * 1000 + variant * 37 + 7);
  switch (terrain) {
    case TERRAIN.forest:
      drawForest(ctx, rand);
      break;
    case TERRAIN.mountain:
      drawMountain(ctx, rand);
      break;
    case TERRAIN.desert:
      drawDesert(ctx, rand);
      break;
    default:
      drawFlats(ctx, rand);
  }
  if (open) {
    // Explored cell: terrain stays visible, but light and calm
    ctx.fillStyle = "rgba(246,238,214,0.66)";
    ctx.fillRect(0, 0, T, T);
  }
  cache.set(key, c);
  return c;
}

/** Colour for far-out zoom (instead of a tile). */
export function terrainColor(terrain: number, open: boolean) {
  const info = TERRAIN_INFO[terrain] ?? TERRAIN_INFO[0];
  return open ? info.colorOpen : info.color;
}

function speckle(ctx: CanvasRenderingContext2D, rand: () => number, colors: string[], n: number, size: number) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(rand() * T, rand() * T, size, size);
  }
}

function drawFlats(ctx: CanvasRenderingContext2D, rand: () => number) {
  const g = ctx.createLinearGradient(0, 0, T, T);
  g.addColorStop(0, "#6f9442");
  g.addColorStop(1, "#628a3a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T, T);
  speckle(ctx, rand, ["#5d8236", "#78a04a"], 60, 3);
  // Grass tufts
  ctx.lineCap = "round";
  for (let k = 0; k < 26; k++) {
    const x = 6 + rand() * (T - 12);
    const y = 10 + rand() * (T - 14);
    ctx.strokeStyle = rand() < 0.5 ? "#86b053" : "#4f7430";
    ctx.lineWidth = 2;
    for (let b = -1; b <= 1; b++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + b * 3 + (rand() - 0.5) * 2, y - 6 - rand() * 5);
      ctx.stroke();
    }
  }
  // Flowers
  const flowers = Math.floor(rand() * 4);
  for (let k = 0; k < flowers; k++) {
    ctx.fillStyle = rand() < 0.5 ? "#f5e27a" : "#f4f1e8";
    ctx.beginPath();
    ctx.arc(10 + rand() * (T - 20), 10 + rand() * (T - 20), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawForest(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = "#35612b";
  ctx.fillRect(0, 0, T, T);
  speckle(ctx, rand, ["#2c5224", "#3f6f33", "#4a3a22"], 70, 4);
  const trees: { x: number; y: number; s: number; pine: boolean }[] = [];
  const n = 4 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) trees.push({ x: 16 + rand() * (T - 32), y: 30 + rand() * (T - 36), s: 0.75 + rand() * 0.45, pine: rand() < 0.6 });
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 2, 14 * t.s, 5 * t.s, 0, 0, Math.PI * 2);
    ctx.fill();
    // trunk
    ctx.fillStyle = "#5b3b20";
    ctx.fillRect(t.x - 2.5 * t.s, t.y - 10 * t.s, 5 * t.s, 12 * t.s);
    if (t.pine) {
      for (let l = 0; l < 3; l++) {
        const w = (18 - l * 4) * t.s;
        const top = t.y - (22 + l * 11) * t.s;
        const base = t.y - (6 + l * 11) * t.s;
        ctx.fillStyle = l % 2 ? "#2b5a26" : "#23491f";
        ctx.beginPath();
        ctx.moveTo(t.x, top);
        ctx.lineTo(t.x + w, base);
        ctx.lineTo(t.x - w, base);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(140,200,110,0.25)";
        ctx.beginPath();
        ctx.moveTo(t.x, top);
        ctx.lineTo(t.x - w, base);
        ctx.lineTo(t.x - w * 0.3, base);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const r = 15 * t.s;
      const cy = t.y - 20 * t.s;
      ctx.fillStyle = "#2f6a2c";
      ctx.beginPath();
      ctx.arc(t.x, cy, r, 0, Math.PI * 2);
      ctx.arc(t.x - r * 0.7, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
      ctx.arc(t.x + r * 0.7, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(150,210,110,0.3)";
      ctx.beginPath();
      ctx.arc(t.x - r * 0.35, cy - r * 0.35, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMountain(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = "#7b7468";
  ctx.fillRect(0, 0, T, T);
  speckle(ctx, rand, ["#6d665b", "#8a8377", "#5f594f"], 90, 4);
  const peaks = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < peaks; k++) {
    const cx = peaks === 1 ? T / 2 + (rand() - 0.5) * 20 : k === 0 ? T * 0.35 : T * 0.7;
    const base = T * (0.88 - k * 0.05);
    const h = T * (0.55 + rand() * 0.2) * (peaks === 1 ? 1.1 : 0.9);
    const w = T * (peaks === 1 ? 0.42 : 0.3);
    const top = base - h;
    // left (lit) and right (shaded) side
    ctx.fillStyle = "#a39b8d";
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - w, base);
    ctx.lineTo(cx + w * 0.1, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5c564c";
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + w * 0.1, base);
    ctx.lineTo(cx + w, base);
    ctx.closePath();
    ctx.fill();
    // snow
    const sh = h * 0.28;
    ctx.fillStyle = "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - w * (sh / h), top + sh);
    ctx.lineTo(cx - w * 0.12, top + sh * 0.8);
    ctx.lineTo(cx, top + sh * 1.05);
    ctx.lineTo(cx + w * 0.1, top + sh * 0.75);
    ctx.lineTo(cx + w * (sh / h), top + sh);
    ctx.closePath();
    ctx.fill();
  }
  // rocks at the bottom
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = rand() < 0.5 ? "#8e877a" : "#6a6358";
    ctx.beginPath();
    ctx.ellipse(rand() * T, T - 6 - rand() * 10, 5 + rand() * 4, 3 + rand() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDesert(ctx: CanvasRenderingContext2D, rand: () => number) {
  const g = ctx.createLinearGradient(0, 0, 0, T);
  g.addColorStop(0, "#e0b96d");
  g.addColorStop(1, "#cfa258");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T, T);
  speckle(ctx, rand, ["#c9994f", "#ecc98a", "#b98a45"], 80, 2);
  // dunes
  for (let k = 0; k < 3; k++) {
    const y = 26 + k * 36 + (rand() - 0.5) * 12;
    const amp = 8 + rand() * 8;
    ctx.strokeStyle = "rgba(255,236,190,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, y);
    ctx.quadraticCurveTo(T * 0.3, y - amp, T * 0.55, y);
    ctx.quadraticCurveTo(T * 0.8, y + amp, T + 4, y - 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(160,110,50,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, y + 4);
    ctx.quadraticCurveTo(T * 0.3, y - amp + 4, T * 0.55, y + 4);
    ctx.quadraticCurveTo(T * 0.8, y + amp + 4, T + 4, y + 2);
    ctx.stroke();
  }
  // occasional cactus
  if (rand() < 0.45) {
    const x = 20 + rand() * (T - 40);
    const y = 40 + rand() * (T - 60);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 24, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4f7d3a";
    ctx.fillRect(x - 4, y - 8, 8, 32);
    ctx.fillRect(x - 13, y + 2, 6, 10);
    ctx.fillRect(x - 13, y + 8, 12, 5);
    ctx.fillRect(x + 7, y - 2, 6, 12);
    ctx.fillRect(x + 1, y + 6, 12, 5);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x - 3, y - 7, 2, 30);
  }
}
