// Map rendering on canvas (visible cells only).

import { CENTER, MAP_SIZE, RINGS } from "@/lib/config";
import { CELL_BRIDGE, CELL_DEFUSED, CELL_EXPLODED, CELL_HIDDEN, CELL_RUBBLE, CELL_SMOKE, type PublicPoi, type PublicState, type ToolId } from "@/lib/types";
import { NEIGHBORS8, WORLD, idx, inBounds, ringOf } from "@/lib/world";
import { ITEM_BY_ID } from "@/lib/items";
import { hash3 } from "@/lib/rng";
import { TILE_VARIANTS, getTile, terrainColor } from "./tiles";
import { drawDefusedMine } from "./icons";

/** Cell terrain: a tile (close up) or a flat colour (far away). */
function drawTerrain(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, cp: number, open: boolean) {
  const t = WORLD.terrain[idx(x, y)];
  if (cp < 18) {
    ctx.fillStyle = terrainColor(t, open);
    ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
    return;
  }
  const variant = hash3(97, x, y) % TILE_VARIANTS;
  ctx.drawImage(getTile(t, variant, open), sx, sy, cp + 0.5, cp + 0.5);
}

// Item image cache (the canvas draws them once they have loaded)
const imgCache = new Map<string, HTMLImageElement>();
function itemImage(itemId: string | undefined): HTMLImageElement | null {
  const def = itemId ? ITEM_BY_ID.get(itemId) : undefined;
  if (!def) return null;
  let im = imgCache.get(def.img);
  if (!im) {
    im = new Image();
    im.src = def.img;
    imgCache.set(def.img, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

function drawItem(ctx: CanvasRenderingContext2D, itemId: string | undefined, cx: number, cy: number, size: number) {
  const im = itemImage(itemId);
  if (im) ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size);
  return !!im;
}

export interface Camera {
  x: number; // centre of the view in cell coordinates
  y: number;
  zoom: number;
}

export interface Flash {
  x: number;
  y: number;
  kind: "boom" | "loot" | "info";
  t: number;
}

export interface DevReveal {
  mines: Uint8Array;
  /** cell -> item id ("legendary" for a legendary treasure) */
  treasure: Map<number, string>;
}

export const BASE_CELL = 192;
export const cellPx = (cam: Camera) => BASE_CELL * cam.zoom;

const NUMBER_COLORS = ["#a8a29e", "#1d4ed8", "#15803d", "#b91c1c", "#1e3a8a", "#7f1d1d", "#0f766e", "#111827", "#4b5563"];
const SIGNAL_COLORS = ["", "#ca8a04", "#dc2626"];

const POI_ICON: Record<PublicPoi["kind"], string> = {
  crate: "💰",
  crate_opened: "💰",
  crate_destroyed: "✖",
  legendary: "⭐",
  legendary_opened: "⭐",
  outpost: "🏕️",
  outpost_reached: "🏕️",
  bunker_zone: "🏚️",
  general: "🏰",
};

export interface DrawOpts {
  state: PublicState;
  cam: Camera;
  width: number;
  height: number;
  hover: { x: number; y: number } | null;
  tool: ToolId | null;
  defuseMode: boolean;
  flashes: Flash[];
  now: number;
  dev: DevReveal | null;
}

/** Whether the soldier can step onto this (unexplored) cell – or defuse it in defuse mode. */
export function canStepOn(state: PublicState, x: number, y: number, defuse = false) {
  if (!inBounds(x, y)) return false;
  const i = idx(x, y);
  const p = state.player;
  return (
    Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) === 1 &&
    state.cells[i] === CELL_HIDDEN &&
    !WORLD.river[i] &&
    (defuse || !state.dogMine.has(i)) &&
    ringOf(x, y).unlockDay <= state.day
  );
}

export function drawMap(ctx: CanvasRenderingContext2D, o: DrawOpts) {
  const { state, cam, width, height } = o;
  const cp = cellPx(cam);
  const ox = width / 2 - cam.x * cp; // screen x of cell 0
  const oy = height / 2 - cam.y * cp;
  const x0 = Math.max(0, Math.floor(-ox / cp));
  const y0 = Math.max(0, Math.floor(-oy / cp));
  const x1 = Math.min(MAP_SIZE - 1, Math.ceil((width - ox) / cp));
  const y1 = Math.min(MAP_SIZE - 1, Math.ceil((height - oy) / cp));
  const cells = state.cells;
  const showDetail = cp >= 16;
  const canAct = state.lockedUntil === null && state.steps > 0;

  ctx.fillStyle = "#0b0d09";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      const v = cells[i];
      const sx = ox + x * cp;
      const sy = oy + y * cp;
      const ring = ringOf(x, y);
      const locked = ring.unlockDay > state.day;
      const alt = (x + y) & 1;

      if (WORLD.river[i] && v !== CELL_BRIDGE) {
        ctx.fillStyle = alt ? "#26566f" : "#2a5c76";
        ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        if (showDetail) {
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.beginPath();
          ctx.moveTo(sx + cp * 0.2, sy + cp * 0.55);
          ctx.quadraticCurveTo(sx + cp * 0.5, sy + cp * 0.35, sx + cp * 0.8, sy + cp * 0.55);
          ctx.stroke();
        }
      } else if (v === CELL_HIDDEN) {
        drawTerrain(ctx, x, y, sx, sy, cp, false);
        if (WORLD.smoke[i]) {
          ctx.fillStyle = "rgba(200,200,200,0.12)";
          ctx.fillRect(sx, sy, cp, cp);
        }
        if (locked) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        }
        if (o.dev?.mines[i]) {
          ctx.fillStyle = "rgba(255,40,40,0.75)";
          ctx.beginPath();
          ctx.arc(sx + cp / 2, sy + cp / 2, Math.max(1.5, cp * 0.14), 0, Math.PI * 2);
          ctx.fill();
        }
        const devItem = o.dev?.treasure.get(i);
        if (devItem && showDetail) {
          ctx.globalAlpha = 0.85;
          if (!drawItem(ctx, devItem, sx + cp / 2, sy + cp / 2, cp * 0.7)) {
            ctx.font = `${cp * 0.45}px sans-serif`;
            ctx.fillText("💎", sx + cp / 2, sy + cp / 2);
          }
          ctx.globalAlpha = 1;
        }
        if (state.dogSafe.has(i)) {
          ctx.fillStyle = "rgba(74,222,128,0.35)";
          ctx.fillRect(sx + 1, sy + 1, cp - 2, cp - 2);
          if (showDetail) {
            ctx.font = `${cp * 0.45}px sans-serif`;
            ctx.fillText("🐾", sx + cp / 2, sy + cp / 2);
          }
        }
        if (state.dogMine.has(i)) {
          ctx.fillStyle = "rgba(220,38,38,0.35)";
          ctx.fillRect(sx + 1, sy + 1, cp - 2, cp - 2);
          if (showDetail) {
            ctx.font = `${cp * 0.4}px sans-serif`;
            ctx.fillText("💣", sx + cp / 2, sy + cp / 2);
          }
        }
      } else if (v === CELL_EXPLODED) {
        ctx.fillStyle = "#4c1d1d";
        ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        if (showDetail) {
          ctx.font = `${cp * 0.55}px sans-serif`;
          ctx.fillText("💥", sx + cp / 2, sy + cp / 2);
        }
      } else if (v === CELL_RUBBLE) {
        // scorched, impassable
        ctx.fillStyle = alt ? "#2b2420" : "#26201c";
        ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        ctx.strokeStyle = "rgba(120,53,15,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cp - 1, cp - 1);
        if (showDetail) {
          ctx.globalAlpha = 0.7;
          ctx.font = `${cp * 0.4}px sans-serif`;
          ctx.fillText("🪨", sx + cp / 2, sy + cp / 2);
          ctx.globalAlpha = 1;
        }
      } else if (v === CELL_DEFUSED) {
        drawTerrain(ctx, x, y, sx, sy, cp, true);
        ctx.fillStyle = "rgba(74,222,128,0.2)";
        ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        if (showDetail) drawDefusedMine(ctx, sx, sy, cp);
      } else if (v === CELL_BRIDGE) {
        ctx.fillStyle = "#2a5c76";
        ctx.fillRect(sx, sy, cp + 0.5, cp + 0.5);
        ctx.fillStyle = "#8b5a2b";
        for (let k = 0; k < 4; k++) ctx.fillRect(sx + 1, sy + 2 + (k * (cp - 4)) / 4, cp - 2, (cp - 4) / 4 - 1);
      } else {
        drawTerrain(ctx, x, y, sx, sy, cp, true);
        if (showDetail) {
          if (v === CELL_SMOKE) {
            ctx.fillStyle = "rgba(120,120,120,0.55)";
            ctx.fillRect(sx, sy, cp, cp);
            ctx.fillStyle = "#e5e7eb";
            ctx.font = `bold ${cp * 0.5}px sans-serif`;
            ctx.fillText("?", sx + cp / 2, sy + cp / 2 + 1);
          } else {
            ctx.fillStyle = NUMBER_COLORS[v];
            ctx.font = `bold ${cp * (v === 0 ? 0.3 : 0.42)}px ui-monospace, monospace`;
            ctx.fillText(String(v), sx + cp / 2, sy + cp / 2 + 1);
          }
          drawSignal(ctx, sx, sy, cp, state.signals[i]);
        }
      }

      if (cp >= 10) {
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cp, cp);
      }
    }
  }

  // Possible steps around the soldier
  if (canAct) {
    const t = 0.5 + 0.5 * Math.sin(o.now / 350);
    for (const [dx, dy] of NEIGHBORS8) {
      const x = state.player.x + dx;
      const y = state.player.y + dy;
      if (!canStepOn(state, x, y, o.defuseMode)) continue;
      const sx = ox + x * cp;
      const sy = oy + y * cp;
      ctx.fillStyle = o.defuseMode ? `rgba(248,113,113,${0.12 + t * 0.15})` : `rgba(190,242,100,${0.12 + t * 0.12})`;
      ctx.fillRect(sx, sy, cp, cp);
      ctx.strokeStyle = o.defuseMode ? "rgba(252,165,165,0.95)" : "rgba(217,249,157,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 2, sy + 2, cp - 4, cp - 4);
      ctx.lineWidth = 1;
    }
  }

  drawWire(ctx, o, ox, oy, cp);
  drawPois(ctx, o, ox, oy, cp);

  // Mine detector
  for (const [i, n] of state.detectorMarks) {
    const x = i % MAP_SIZE;
    const y = Math.floor(i / MAP_SIZE);
    if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
    const sx = ox + x * cp;
    const sy = oy + y * cp;
    ctx.strokeStyle = "rgba(96,165,250,0.8)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(sx - cp + 1, sy - cp + 1, cp * 3 - 2, cp * 3 - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(30,64,175,0.9)";
    ctx.beginPath();
    ctx.arc(sx + cp, sy, Math.max(6, cp * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(8, cp * 0.32)}px sans-serif`;
    ctx.fillText(String(n), sx + cp, sy + 1);
  }

  drawPlayer(ctx, o, ox, oy, cp);

  // Hover + tool preview
  if (o.hover) {
    const r = o.tool === "detector" ? 1 : o.tool === "drone" ? 3 : 0;
    const sx = ox + (o.hover.x - r) * cp;
    const sy = oy + (o.hover.y - r) * cp;
    const size = cp * (r * 2 + 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = o.tool ? "#60a5fa" : "#f8fafc";
    ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
    if (o.tool) {
      ctx.fillStyle = "rgba(96,165,250,0.15)";
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.lineWidth = 1;
  }

  // Animations
  for (const f of o.flashes) {
    const age = (o.now - f.t) / 900;
    if (age > 1) continue;
    const cx = ox + (f.x + 0.5) * cp;
    const cy = oy + (f.y + 0.5) * cp;
    const color = f.kind === "boom" ? "249,115,22" : f.kind === "loot" ? "250,204,21" : "96,165,250";
    ctx.strokeStyle = `rgba(${color},${1 - age})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cp * (0.5 + age * (f.kind === "boom" ? 3 : 1.5)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

/** Treasure signal bars in the bottom-right corner of a cell. */
function drawSignal(ctx: CanvasRenderingContext2D, sx: number, sy: number, cp: number, signal: number) {
  if (signal <= 0) return;
  const bw = Math.max(2, cp * 0.07);
  const gap = Math.max(1, cp * 0.035);
  const baseX = sx + cp - 2 * (bw + gap) - 3;
  const baseY = sy + cp - 4;
  for (let k = 0; k < 2; k++) {
    const h = cp * (0.12 + k * 0.1);
    ctx.fillStyle = k < signal ? SIGNAL_COLORS[signal] : "rgba(0,0,0,0.15)";
    ctx.fillRect(baseX + k * (bw + gap), baseY - h, bw, h);
  }
}

/** Soldier: a frame around the current cell + a corner badge, so the number stays visible. */
function drawPlayer(ctx: CanvasRenderingContext2D, o: DrawOpts, ox: number, oy: number, cp: number) {
  const { x, y } = o.state.player;
  const sx = ox + x * cp;
  const sy = oy + y * cp;
  const lw = Math.max(2, cp * 0.06);
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#f59e0b";
  ctx.strokeRect(sx + lw / 2, sy + lw / 2, cp - lw, cp - lw);
  ctx.lineWidth = 1;

  const r = Math.max(6, cp * 0.17);
  const bx = sx + r + lw;
  const by = sy + r + lw;
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${Math.max(8, r * 1.3)}px sans-serif`;
  ctx.fillText("💂", bx, by + 1);
}

function drawWire(ctx: CanvasRenderingContext2D, o: DrawOpts, ox: number, oy: number, cp: number) {
  for (let r = 0; r < RINGS.length - 1; r++) {
    const m = RINGS[r].maxDist;
    const next = RINGS[r + 1];
    const locked = next.unlockDay > o.state.day;
    const left = ox + (CENTER - m) * cp;
    const top = oy + (CENTER - m) * cp;
    const size = (m * 2 + 1) * cp;
    ctx.lineWidth = locked ? Math.max(2, cp * 0.1) : 1;
    ctx.strokeStyle = locked ? "rgba(203,213,225,0.85)" : "rgba(203,213,225,0.25)";
    ctx.setLineDash(locked ? [cp * 0.5, cp * 0.25] : [4, 6]);
    ctx.strokeRect(left, top, size, size);
    ctx.setLineDash([]);
    if (locked && cp >= 8) {
      const label = `${next.name} – opens day ${next.unlockDay}`;
      ctx.font = `bold ${Math.max(10, Math.min(14, cp * 0.4))}px sans-serif`;
      const w = ctx.measureText(label).width + 12;
      for (const [lx, ly] of [
        [left + size / 2, top],
        [left + size / 2, top + size],
        [left, top + size / 2],
        [left + size, top + size / 2],
      ]) {
        ctx.fillStyle = "rgba(15,23,42,0.85)";
        ctx.fillRect(lx - w / 2, ly - 10, w, 20);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(label, lx, ly + 1);
      }
    }
  }
  ctx.lineWidth = 1;
}

function drawPois(ctx: CanvasRenderingContext2D, o: DrawOpts, ox: number, oy: number, cp: number) {
  const { width, height } = o;
  const onScreen = (sx: number, sy: number, pad: number) => sx > -pad && sy > -pad && sx < width + pad && sy < height + pad;

  // Base camp
  {
    const sx = ox + CENTER * cp + cp * 0.8;
    const sy = oy + CENTER * cp + cp * 0.22;
    if (onScreen(sx, sy, cp * 2)) {
      ctx.font = `${Math.max(8, cp * 0.32)}px sans-serif`;
      ctx.fillText("⛺", sx, sy);
    }
  }

  for (const p of o.state.pois) {
    const sx = ox + (p.x + 0.5) * cp;
    const sy = oy + (p.y + 0.5) * cp;
    if (!onScreen(sx, sy, cp * 4)) continue;

    if (p.kind === "bunker_zone") {
      const r = p.radius ?? 3;
      ctx.strokeStyle = "rgba(239,68,68,0.7)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + (p.x - r) * cp, oy + (p.y - r) * cp, (r * 2 + 1) * cp, (r * 2 + 1) * cp);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.font = `${Math.max(10, cp * 0.6)}px sans-serif`;
      ctx.fillText(POI_ICON.bunker_zone, ox + (p.x - r + 0.5) * cp, oy + (p.y - r - 0.5) * cp);
      continue;
    }

    if (p.kind === "general") {
      ctx.fillStyle = "rgba(127,29,29,0.35)";
      ctx.fillRect(ox + (p.x - 1) * cp, oy + (p.y - 1) * cp, cp * 3, cp * 3);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + (p.x - 1) * cp, oy + (p.y - 1) * cp, cp * 3, cp * 3);
      ctx.lineWidth = 1;
      ctx.font = `${Math.max(14, cp * 1.8)}px sans-serif`;
      ctx.fillText(POI_ICON.general, sx, sy);
      continue;
    }

    const faded = p.kind === "crate_opened" || p.kind === "legendary_opened" || p.kind === "outpost_reached";
    if (p.kind === "legendary") {
      const pulse = 0.5 + 0.5 * Math.sin(o.now / 300);
      ctx.fillStyle = `rgba(250,204,21,${0.15 + pulse * 0.25})`;
      ctx.beginPath();
      ctx.arc(sx, sy, cp * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Collected treasure: a small corner icon so the number stays readable
    if (faded) {
      const cx = ox + p.x * cp + cp * 0.8;
      const cy = oy + p.y * cp + cp * 0.22;
      if (!(p.itemId && cp >= 16 && drawItem(ctx, p.itemId, cx, cy, cp * 0.36))) {
        ctx.globalAlpha = 0.55;
        ctx.font = `${Math.max(8, cp * 0.3)}px sans-serif`;
        ctx.fillText(POI_ICON[p.kind], cx, cy);
        ctx.globalAlpha = 1;
      }
      continue;
    }
    ctx.font = `${Math.max(9, cp * 0.6)}px sans-serif`;
    if (p.kind === "crate_destroyed") {
      ctx.fillStyle = "#991b1b";
      ctx.font = `bold ${Math.max(9, cp * 0.5)}px sans-serif`;
    }
    ctx.fillText(POI_ICON[p.kind], sx, sy);
  }
}

/** Minimap: 1 pixel per cell, scaled up with CSS. */
export function drawMinimap(ctx: CanvasRenderingContext2D, state: PublicState) {
  const img = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const terrainRgb = [0, 1, 2, 3].map((t) => hex(terrainColor(t, false)));
  const terrainOpenRgb = [0, 1, 2, 3].map((t) => hex(terrainColor(t, true)));
  for (let y = 0; y < MAP_SIZE; y++)
    for (let x = 0; x < MAP_SIZE; x++) {
      const i = idx(x, y);
      const v = state.cells[i];
      let c: number[];
      if (WORLD.river[i] && v !== CELL_BRIDGE) c = [42, 92, 118];
      else if (v === CELL_HIDDEN) {
        c = terrainRgb[WORLD.terrain[i]];
        if (ringOf(x, y).unlockDay > state.day) c = c.map((k) => k * 0.6);
      } else if (v === CELL_EXPLODED) c = [220, 38, 38];
      else if (v === CELL_RUBBLE) c = [90, 82, 74];
      else c = terrainOpenRgb[WORLD.terrain[i]];
      const p = i * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = 255;
    }
  const dot = (x: number, y: number, c: number[], r = 1) => {
    for (let yy = y - r; yy <= y + r; yy++)
      for (let xx = x - r; xx <= x + r; xx++) {
        if (!inBounds(xx, yy)) continue;
        const p = idx(xx, yy) * 4;
        img.data[p] = c[0];
        img.data[p + 1] = c[1];
        img.data[p + 2] = c[2];
      }
  };
  for (const p of state.pois) {
    if (p.kind === "legendary") dot(p.x, p.y, [250, 204, 21]);
    else if (p.kind === "general") dot(p.x, p.y, [251, 146, 60], 2);
    else if (p.kind === "outpost") dot(p.x, p.y, [248, 250, 252]);
    else if (p.kind === "crate") dot(p.x, p.y, [253, 224, 71], 0);
  }
  dot(state.player.x, state.player.y, [245, 158, 11], 1);
  ctx.putImageData(img, 0, 0);
}
