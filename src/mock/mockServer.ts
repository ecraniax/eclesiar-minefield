// MOCK SERVER
// Everything that would run on the backend in production: mine layout, hidden treasure, rewards,
// rules (steps, lockouts, rings, movement, defuse) and persistence. The client only gets the public state (PublicState).
// Once a real backend exists, only the implementation in src/lib/api.ts needs to be replaced.

import {
  BLAST_RADIUS,
  DEFUSE_BLAST_RADIUS,
  EVENT_DAYS,
  EXTRA_PACKS_PER_DAY,
  EXTRA_STEPS_PACK,
  EXTRA_STEPS_PRICE_GEMS,
  LOCKOUT_MS,
  MAP_SIZE,
  MOCK_GEM_BALANCE,
  STEPS_PER_REFILL,
  ABANDONED_BUNKER_DENSITY,
  SAFE_RADIUS,
  SIGNAL_RANGE,
  SIGNAL_STRONG,
  TREASURE_DENSITY,
  STARTING_TOOLS,
  TOOL_DROP_WEIGHTS,
  TREASURE_BONUS_STEPS,
  TREASURE_BONUS_STEPS_CHANCE,
  TREASURE_BONUS_TOOL_CHANCE,
  CENTER,
} from "@/lib/config";
import { hash3, mulberry32, rand01 } from "@/lib/rng";
import {
  COMMON_ITEMS,
  GENERAL_GOLD,
  GENERAL_ITEMS,
  ITEM_BY_ID,
  LEGENDARY_GOLD,
  LEGENDARY_ITEMS,
  OUTPOST_STEPS,
  RARE_CHANCE_BY_RING,
  RARE_ITEMS,
  type ItemDef,
  type ItemStack,
} from "@/lib/items";
import {
  CELL_BRIDGE,
  CELL_DEFUSED,
  CELL_EXPLODED,
  CELL_HIDDEN,
  CELL_RUBBLE,
  CELL_SMOKE,
  SIGNAL_LABEL,
  type ActionResult,
  type LockReason,
  type LogEntry,
  type PublicPoi,
  type PublicState,
  type Reward,
  type RewardEvent,
  type RewardKind,
  type Signal,
  type StepReport,
  type ToolId,
  type Tools,
} from "@/lib/types";
import {
  NEIGHBORS4,
  NEIGHBORS8,
  WORLD,
  WORLD_SEED,
  bunkerZoneAt,
  distFromCenter,
  idx,
  inBounds,
  isGeneralCell,
  ringOf,
  ringUnlocked,
} from "@/lib/world";

const STORAGE_KEY = "razminiranje:v5";
const DAY_MS = 86_400_000;
const N = MAP_SIZE * MAP_SIZE;

// Cell state on the server
const S_HIDDEN = 0;
const S_OPEN = 1;
const S_EXPLODED = 2;
const S_BRIDGE = 3;
const S_DEFUSED = 4;
const S_RUBBLE = 5;

type CrateTier = "normal" | "big";
type CrateState = "hidden" | "discovered" | "opened" | "destroyed";

/** Mock rivals: the day each of them is "first" to claim a legendary treasure. */
const RIVAL_LEGENDARY_DAYS = [17, 20, 24, 27, 30];
const RIVAL_NAMES = [
  "IronWolf", "Kapitan_Kranjc", "SapperSam", "Mina_Mojca", "BalkanBear", "Gen.Rommel",
  "TankTina", "Desetnik_Jure", "OldGuard", "NightOwl", "Partizan77", "Zvezdica",
];

const LOCK_TEXT: Record<LockReason, string> = {
  mine: "You stepped on a mine",
  defuse: "Your defuse charge went off on a cell without a mine",
  steps: "You used up all your steps",
};

interface SaveData {
  v: 4;
  playerSeed: number;
  startedAt: number;
  devDayOffset: number;
  lastDailyDay: number;
  steps: number;
  lockedUntil: number | null;
  lockReason: LockReason | null;
  minesDefused: number;
  vestArmed: boolean;
  px: number;
  py: number;
  tools: Tools;
  gemBalance: number;
  goldEarned: number;
  items: Record<string, number>;
  titles: string[];
  extraPacksBoughtToday: number;
  cells: string; // S_* per cell
  dogSafe: number[];
  dogMine: number[];
  detector: [number, number][];
  crates: [number, CrateState][]; // only changed ones
  legendaryOpened: number[];
  legendaryDestroyed: number[];
  outpostsReached: number[];
  reachedGeneral: boolean;
  lastReport: StepReport | null;
  log: LogEntry[];
  logSeq: number;
}

// --- Hidden treasure (same for every player, but never sent to the client) ---
const CRATE_TIER = new Map<number, CrateTier>();
(function buildCrates() {
  const reserved = new Set<number>();
  WORLD.outposts.forEach((p) => reserved.add(idx(p.x, p.y)));
  WORLD.legendaries.forEach((p) => reserved.add(idx(p.x, p.y)));
  WORLD.bunkerZones.forEach((z) => CRATE_TIER.set(idx(z.x, z.y), "big"));
  for (let y = 0; y < MAP_SIZE; y++)
    for (let x = 0; x < MAP_SIZE; x++) {
      const i = idx(x, y);
      if (WORLD.river[i] || reserved.has(i) || CRATE_TIER.has(i) || isGeneralCell(x, y)) continue;
      if (distFromCenter(x, y) <= 1) continue;
      if (rand01(WORLD_SEED + 77, x, y) < TREASURE_DENSITY) CRATE_TIER.set(i, "normal");
    }
})();

const OUTPOST_IDX = new Map(WORLD.outposts.map((p, n) => [idx(p.x, p.y), n]));
const LEGENDARY_IDX = new Map(WORLD.legendaries.map((p, n) => [idx(p.x, p.y), n]));

const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export class MockServer {
  private d!: SaveData;
  private cells!: Uint8Array;
  private dogSafe!: Set<number>;
  private dogMine!: Set<number>;
  private detector!: Map<number, number>;
  private crates!: Map<number, CrateState>;
  private mines!: Uint8Array;
  /** Items from the last action (for the report). */
  private lastLootItems: ItemStack[] = [];
  /** Rewards from the last action (for the dialog). */
  private lastRewards: RewardEvent[] = [];

  constructor() {
    this.load();
  }

  // ---------------- persistence ----------------

  private fresh(): SaveData {
    return {
      v: 4,
      playerSeed: (Math.random() * 2 ** 31) | 0,
      startedAt: Date.now(),
      devDayOffset: 0,
      lastDailyDay: 1,
      steps: STEPS_PER_REFILL,
      lockedUntil: null,
      lockReason: null,
      minesDefused: 0,
      vestArmed: false,
      px: CENTER,
      py: CENTER,
      tools: { ...STARTING_TOOLS },
      gemBalance: MOCK_GEM_BALANCE,
      goldEarned: 0,
      items: {},
      titles: [],
      extraPacksBoughtToday: 0,
      cells: "",
      dogSafe: [],
      dogMine: [],
      detector: [],
      crates: [],
      legendaryOpened: [],
      legendaryDestroyed: [],
      outpostsReached: [],
      reachedGeneral: false,
      lastReport: null,
      log: [],
      logSeq: 0,
    };
  }

  private load() {
    let data: SaveData | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw) as SaveData;
    } catch {
      data = null;
    }
    const isNew = !data || data.v !== 4;
    this.d = isNew ? this.fresh() : data!;
    this.d.gemBalance ??= MOCK_GEM_BALANCE;
    this.cells = new Uint8Array(N);
    if (this.d.cells.length === N) for (let i = 0; i < N; i++) this.cells[i] = this.d.cells.charCodeAt(i) - 48;
    this.dogSafe = new Set(this.d.dogSafe);
    this.dogMine = new Set(this.d.dogMine);
    this.detector = new Map(this.d.detector);
    this.crates = new Map(this.d.crates);
    this.buildMines();
    if (isNew) {
      this.cells[idx(CENTER, CENTER)] = S_OPEN;
      this.d.lastReport = this.makeReport(CENTER, CENTER);
      this.addLog("info", "Welcome, sapper. Every new cell you step on tells you how many mines are around it. Find the treasure!");
      this.save();
    }
    this.sync();
  }

  private save() {
    let s = "";
    for (let i = 0; i < N; i++) s += String.fromCharCode(48 + this.cells[i]);
    this.d.cells = s;
    this.d.dogSafe = [...this.dogSafe];
    this.d.dogMine = [...this.dogMine];
    this.d.detector = [...this.detector];
    this.d.crates = [...this.crates];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.d));
    } catch {
      // localStorage unavailable – the game works until the page is reloaded
    }
  }

  private buildMines() {
    this.mines = new Uint8Array(N);
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const i = idx(x, y);
        if (WORLD.river[i] || CRATE_TIER.has(i) || OUTPOST_IDX.has(i) || LEGENDARY_IDX.has(i) || isGeneralCell(x, y)) continue;
        if (distFromCenter(x, y) <= SAFE_RADIUS) continue;
        const density = bunkerZoneAt(x, y) ? ABANDONED_BUNKER_DENSITY : ringOf(x, y).mineDensity;
        if (rand01(this.d.playerSeed, x, y) < density) this.mines[i] = 1;
      }
  }

  // ---------------- time: days and lockouts ----------------

  get day(): number {
    const elapsed = Math.floor((Date.now() - this.d.startedAt) / DAY_MS);
    return Math.min(EVENT_DAYS, 1 + elapsed + this.d.devDayOffset);
  }

  private sync() {
    let changed = false;
    while (this.d.lastDailyDay < this.day) {
      this.d.lastDailyDay++;
      this.d.extraPacksBoughtToday = 0;
      changed = true;
      this.addLog("info", `Day ${this.d.lastDailyDay} has started.`);
      const ring = [8, 15, 22].indexOf(this.d.lastDailyDay);
      if (ring >= 0) this.addLog("success", `The barbed wire to ring ${ring + 2} has been cut!`);
    }
    if (this.d.lockedUntil !== null && Date.now() >= this.d.lockedUntil) {
      this.d.lockedUntil = null;
      this.d.lockReason = null;
      if (this.d.steps <= 0) {
        this.d.steps = STEPS_PER_REFILL;
        this.addLog("success", `Back in action! +${STEPS_PER_REFILL} steps.`);
      } else {
        this.addLog("success", "Back in action!");
      }
      changed = true;
    }
    if (changed) this.save();
  }

  private isLocked() {
    return this.d.lockedUntil !== null && Date.now() < this.d.lockedUntil;
  }

  private lock(reason: LockReason) {
    this.d.lockedUntil = Date.now() + LOCKOUT_MS;
    this.d.lockReason = reason;
    const hours = Math.round(LOCKOUT_MS / 3_600_000);
    this.addLog("danger", `${LOCK_TEXT[reason]} – you can't play for ${hours} ${hours === 1 ? "hour" : "hours"}.`);
  }

  /** After each spent step: running out of steps starts a lockout. */
  private afterStep() {
    if (this.d.steps <= 0 && !this.isLocked()) this.lock("steps");
  }

  private lockedError(): string | null {
    if (!this.isLocked()) return null;
    const mins = Math.ceil((this.d.lockedUntil! - Date.now()) / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${LOCK_TEXT[this.d.lockReason ?? "steps"]}. You can play again in ${h}h ${m}min.`;
  }

  // ---------------- helpers ----------------

  private addLog(kind: LogEntry["kind"], text: string) {
    this.d.log.unshift({ id: ++this.d.logSeq, day: this.day, kind, text });
    if (this.d.log.length > 80) this.d.log.length = 80;
  }

  private isWalkable(i: number) {
    const s = this.cells[i];
    return s === S_OPEN || s === S_BRIDGE || s === S_DEFUSED || s === S_RUBBLE;
  }

  /** A live mine (not defused / destroyed / exploded). */
  private liveMine(i: number) {
    return this.mines[i] === 1 && this.cells[i] === S_HIDDEN;
  }

  /** Mines around a cell – counts the original layout, including defused mines, so shown numbers never change. */
  private mineCount(x: number, y: number) {
    let n = 0;
    for (const [dx, dy] of NEIGHBORS8) if (inBounds(x + dx, y + dy) && this.mines[idx(x + dx, y + dy)]) n++;
    return n;
  }

  private isSmoked(x: number, y: number) {
    return (
      WORLD.smoke[idx(x, y)] === 1 &&
      !NEIGHBORS4.some(([dx, dy]) => inBounds(x + dx, y + dy) && this.isWalkable(idx(x + dx, y + dy)))
    );
  }

  /** Metal detector: how close the nearest uncollected treasure is. */
  private signalAt(x: number, y: number): Signal {
    let best = SIGNAL_RANGE + 1;
    for (let yy = y - SIGNAL_RANGE; yy <= y + SIGNAL_RANGE; yy++)
      for (let xx = x - SIGNAL_RANGE; xx <= x + SIGNAL_RANGE; xx++) {
        if (!inBounds(xx, yy) || (xx === x && yy === y)) continue;
        const j = idx(xx, yy);
        if (!this.hasTreasure(j)) continue;
        best = Math.min(best, cheb(x, y, xx, yy));
      }
    return best <= SIGNAL_STRONG ? 2 : best <= SIGNAL_RANGE ? 1 : 0;
  }

  private hasTreasure(j: number) {
    if (CRATE_TIER.has(j)) {
      const st = this.crates.get(j) ?? "hidden";
      if (st === "hidden" || st === "discovered") return true;
    }
    const l = LEGENDARY_IDX.get(j);
    return l !== undefined && !this.d.legendaryOpened.includes(l) && !this.d.legendaryDestroyed.includes(l);
  }

  private makeReport(x: number, y: number, extra?: Partial<StepReport>): StepReport {
    return { x, y, mines: this.isSmoked(x, y) ? null : this.mineCount(x, y), signal: this.signalAt(x, y), ...extra };
  }

  private grant(r: Reward, source: string, kind: RewardKind): string {
    this.lastRewards.push({ kind, source, reward: r });
    const parts: string[] = [];
    if (r.gold) {
      this.d.goldEarned += r.gold;
      parts.push(`${r.gold} gold`);
    }
    if (r.steps) {
      this.d.steps += r.steps;
      parts.push(`${r.steps} steps`);
    }
    if (r.tools)
      for (const [t, n] of Object.entries(r.tools) as [ToolId, number][]) {
        this.d.tools[t] += n;
        parts.push(`${n}× ${t}`);
      }
    if (r.items) {
      for (const it of r.items) {
        this.d.items[it.id] = (this.d.items[it.id] ?? 0) + it.qty;
        parts.push(`${it.qty}× ${ITEM_BY_ID.get(it.id)?.name ?? it.id}`);
      }
      this.lastLootItems.push(...r.items);
    }
    if (r.title) {
      this.d.titles.push(r.title);
      parts.push(`title "${r.title}"`);
    }
    const text = `${source}: ${parts.join(", ")}`;
    this.addLog("loot", text);
    return text;
  }

/**
   * Treasure contents. Depends only on the position (WORLD_SEED), so it is the same for every player.
   * Normal treasure: 1 item (common = larger amount, rare = 1–3); further from camp = more rare items.
   */
  private rollCrate(x: number, y: number, tier: CrateTier): Reward {
    const rand = mulberry32(hash3(WORLD_SEED + 999, x, y));
    const pick = (pool: ItemDef[]) => {
      const total = pool.reduce((a, i) => a + i.weight, 0);
      let r = rand() * total;
      for (const i of pool) if ((r -= i.weight) < 0) return i;
      return pool[pool.length - 1];
    };
    const qty = (i: ItemDef, mult = 1) => Math.round((i.min + Math.floor(rand() * (i.max - i.min + 1))) * mult);
    const tool = (): ToolId => {
      const entries = Object.entries(TOOL_DROP_WEIGHTS) as [ToolId, number][];
      let r = rand() * entries.reduce((a, [, w]) => a + w, 0);
      for (const [t, w] of entries) if ((r -= w) < 0) return t;
      return entries[entries.length - 1][0];
    };

    if (tier === "big") {
      const rare = pick(RARE_ITEMS);
      const common = pick(COMMON_ITEMS);
      return {
        gold: 10 + Math.floor(rand() * 16),
        items: [
          { id: rare.id, qty: qty(rare) },
          { id: common.id, qty: qty(common, 2) },
        ],
        // a random tool plus a bridge (a random bridge stacks to 2)
        tools: (() => {
          const t = tool();
          return t === "bridge" ? { bridge: 2 } : { [t]: 1, bridge: 1 };
        })() as Partial<Tools>,
      };
    }

    const ring = ringOf(x, y).id;
    const isRare = rand() < RARE_CHANCE_BY_RING[ring - 1];
    const item = pick(isRare ? RARE_ITEMS : COMMON_ITEMS);
    const reward: Reward = { items: [{ id: item.id, qty: qty(item) }] };
    const bonus = rand();
    if (bonus < TREASURE_BONUS_TOOL_CHANCE) reward.tools = { [tool()]: 1 } as Partial<Tools>;
    else if (bonus < TREASURE_BONUS_TOOL_CHANCE + TREASURE_BONUS_STEPS_CHANCE) reward.steps = TREASURE_BONUS_STEPS;
    return reward;
  }

  /** Called when the player steps onto a new cell. Returns a loot description (if any). */
  private onReveal(x: number, y: number, flash: NonNullable<ActionResult["flash"]>): string | undefined {
    const i = idx(x, y);
    let loot: string | undefined;
    const tier = CRATE_TIER.get(i);
    if (tier) {
      const st = this.crates.get(i) ?? "hidden";
      if (st === "hidden" || st === "discovered") {
        this.crates.set(i, "opened");
        loot = this.grant(this.rollCrate(x, y, tier), tier === "big" ? "Bunker stash" : "Treasure found", tier === "big" ? "bunker" : "treasure");
        flash.push({ x, y, kind: "loot" });
      }
    }
    const o = OUTPOST_IDX.get(i);
    if (o !== undefined && !this.d.outpostsReached.includes(o)) {
      this.d.outpostsReached.push(o);
      loot = this.grant({ steps: OUTPOST_STEPS, tools: { drone: 1 } }, `Outpost ${o + 1} secured`, "outpost");
      flash.push({ x, y, kind: "loot" });
    }
    const l = LEGENDARY_IDX.get(i);
    if (l !== undefined && !this.d.legendaryOpened.includes(l) && !this.d.legendaryDestroyed.includes(l)) {
      this.d.legendaryOpened.push(l);
      const first = this.day < RIVAL_LEGENDARY_DAYS[l];
      loot = this.grant(
        first
          ? { gold: LEGENDARY_GOLD, items: LEGENDARY_ITEMS[l], title: "Trailblazer" }
          : { gold: LEGENDARY_GOLD, items: LEGENDARY_ITEMS[l] },
        first ? "LEGENDARY treasure (first on the server!)" : "Legendary treasure",
        "legendary",
      );
      flash.push({ x, y, kind: "loot" });
    }
    if (isGeneralCell(x, y) && !this.d.reachedGeneral) {
      this.d.reachedGeneral = true;
      loot = this.grant({ gold: GENERAL_GOLD, items: GENERAL_ITEMS, title: "Master Sapper" }, "GENERAL'S BUNKER reached", "general");
    }
    return loot;
  }

  /** Destroys hidden treasure within a radius. Returns how many were destroyed. */
  private destroyTreasure(x: number, y: number, radius: number, includeLegendary: boolean) {
    let destroyed = 0;
    for (let yy = y - radius; yy <= y + radius; yy++)
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (!inBounds(xx, yy)) continue;
        const j = idx(xx, yy);
        const st = this.crates.get(j) ?? (CRATE_TIER.has(j) ? "hidden" : undefined);
        if (st === "hidden" || st === "discovered") {
          this.crates.set(j, "destroyed");
          destroyed++;
        }
        const l = LEGENDARY_IDX.get(j);
        if (includeLegendary && l !== undefined && !this.d.legendaryOpened.includes(l) && !this.d.legendaryDestroyed.includes(l)) {
          this.d.legendaryDestroyed.push(l);
          destroyed++;
        }
      }
    return destroyed;
  }

  /** Stepping on a mine. */
  private explode(x: number, y: number, flash: NonNullable<ActionResult["flash"]>): number {
    const i = idx(x, y);
    this.cells[i] = S_EXPLODED;
    flash.push({ x, y, kind: "boom" });
    const destroyed = this.destroyTreasure(x, y, BLAST_RADIUS, false);
    if (this.d.vestArmed) {
      this.d.vestArmed = false;
      this.addLog("danger", `BOOM at (${x}|${y})! Your flak vest absorbed the blast – no lockout.`);
    } else {
      this.addLog("danger", `BOOM at (${x}|${y})!`);
      this.lock("mine");
    }
    if (destroyed) this.addLog("danger", `The blast destroyed ${destroyed} hidden treasure${destroyed > 1 ? "s" : ""}.`);
    return destroyed;
  }

  private fail(error: string): ActionResult {
    return { ok: false, error };
  }

  /** Path over already explored cells (BFS, 8 directions). */
  private pathExists(tx: number, ty: number) {
    const start = idx(this.d.px, this.d.py);
    const target = idx(tx, ty);
    if (start === target) return true;
    const seen = new Uint8Array(N);
    const queue = [start];
    seen[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const x = i % MAP_SIZE;
      const y = (i / MAP_SIZE) | 0;
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen[j] || !this.isWalkable(j)) continue;
        if (j === target) return true;
        seen[j] = 1;
        queue.push(j);
      }
    }
    return false;
  }

  /** Shared checks for a cell right next to the soldier. */
  private checkAdjacentNew(x: number, y: number, verb: string): string | null {
    const i = idx(x, y);
    if (cheb(x, y, this.d.px, this.d.py) !== 1) return `You can only ${verb} a cell right next to your soldier.`;
    if (WORLD.river[i]) return "That's a river. Find a ford or build a 🌉 bridge.";
    if (!ringUnlocked(x, y, this.day)) return `Barbed wire! ${ringOf(x, y).name} opens on day ${ringOf(x, y).unlockDay}.`;
    return null;
  }

  // ---------------- public API ----------------

  /**
   * Move the soldier.
   * - Onto an explored cell: free (if there is a path over explored cells).
   * - Onto a new cell: only right next to the soldier (8 directions), costs 1 step.
   */
  move(x: number, y: number): ActionResult {
    this.sync();
    const locked = this.lockedError();
    if (locked) return this.fail(locked);
    if (!inBounds(x, y)) return this.fail("That's the edge of the map.");
    const i = idx(x, y);
    const s = this.cells[i];

    if (s === S_EXPLODED) return this.fail("That's a crater from an exploded mine – go around it.");
    if (this.isWalkable(i)) {
      if (!this.pathExists(x, y)) return this.fail("There is no cleared path to that cell.");
      this.d.px = x;
      this.d.py = y;
      // The report always describes the cell the soldier stands on – also when walking over explored cells
      const report: StepReport =
        s === S_RUBBLE ? { x, y, mines: null, signal: 0, rubble: true } : this.makeReport(x, y, s === S_DEFUSED ? { onDefused: true } : undefined);
      this.d.lastReport = report;
      this.save();
      return { ok: true, report };
    }

    // New cell
    const bad = this.checkAdjacentNew(x, y, "step onto");
    if (bad) return this.fail(bad);
    if (this.dogMine.has(i)) return this.fail("The dog confirmed a mine here – defuse it (X) instead of stepping on it.");
    if (this.d.steps <= 0) return this.fail("No steps left.");

    const flash: NonNullable<ActionResult["flash"]> = [];
    this.d.steps--;
    this.lastLootItems = [];
    this.lastRewards = [];
    let report: StepReport;
    if (this.mines[i]) {
      const destroyed = this.explode(x, y, flash);
      report = { x, y, mines: null, signal: 0, boom: true, destroyed };
    } else {
      this.cells[i] = S_OPEN;
      this.dogSafe.delete(i);
      this.d.px = x;
      this.d.py = y;
      const loot = this.onReveal(x, y, flash);
      report = this.makeReport(x, y, loot ? { loot, lootItems: [...this.lastLootItems] } : undefined);
      const mines = report.mines === null ? "? (smoke)" : `${report.mines} mine${report.mines === 1 ? "" : "s"} around`;
      this.addLog("info", `(${x}|${y}): ${mines}, ${SIGNAL_LABEL[report.signal]}.`);
    }
    this.afterStep();
    this.d.lastReport = report;
    this.save();
    return { ok: true, report, flash, rewards: [...this.lastRewards] };
  }

  /**
   * Defuse a cell right next to the soldier. Free – it costs no step (a wrong defuse is punished by the lockout).
   * - Mine present: defused, the cell becomes walkable.
   * - No mine: the charge explodes, unexplored cells within DEFUSE_BLAST_RADIUS turn to rubble,
   *   treasure in that area (legendary too) is destroyed and a lockout follows.
   */
  defuse(x: number, y: number): ActionResult {
    this.sync();
    const locked = this.lockedError();
    if (locked) return this.fail(locked);
    if (!inBounds(x, y)) return this.fail("That's the edge of the map.");
    const i = idx(x, y);
    if (this.cells[i] !== S_HIDDEN) return this.fail("You can only defuse an unexplored cell.");
    const bad = this.checkAdjacentNew(x, y, "defuse");
    if (bad) return this.fail(bad);

    const flash: NonNullable<ActionResult["flash"]> = [];
    let report: StepReport;

    if (this.mines[i]) {
      this.cells[i] = S_DEFUSED;
        this.dogMine.delete(i);
      this.d.minesDefused++;
      flash.push({ x, y, kind: "info" });
      this.addLog("success", `Mine at (${x}|${y}) defused! The cell is now safe to walk on.`);
      report = this.makeReport(x, y, { defused: true });
    } else {
      flash.push({ x, y, kind: "boom" });
      const r = DEFUSE_BLAST_RADIUS;
      let rubble = 0;
      for (let yy = y - r; yy <= y + r; yy++)
        for (let xx = x - r; xx <= x + r; xx++) {
          if (!inBounds(xx, yy)) continue;
          const j = idx(xx, yy);
          if (this.cells[j] !== S_HIDDEN || WORLD.river[j] || isGeneralCell(xx, yy) || !ringUnlocked(xx, yy, this.day)) continue;
          this.cells[j] = S_RUBBLE;
          this.dogSafe.delete(j);
          this.dogMine.delete(j);
          rubble++;
        }
      const destroyed = this.destroyTreasure(x, y, r, true);
      this.addLog(
        "danger",
        `No mine at (${x}|${y})! The defuse charge blew up ${rubble} cells${destroyed ? ` and destroyed ${destroyed} treasure${destroyed > 1 ? "s" : ""}` : ""}.`,
      );
      this.lock("defuse");
      report = { x, y, mines: null, signal: 0, defused: false, destroyed };
    }
    this.d.lastReport = report;
    this.save();
    return { ok: true, report, flash };
  }

  useTool(tool: ToolId, x: number, y: number): ActionResult {
    this.sync();
    const locked = this.lockedError();
    if (locked) return this.fail(locked);
    if (this.d.tools[tool] <= 0) return this.fail("You don't have that tool.");
    const i = idx(x, y);
    const d = cheb(x, y, this.d.px, this.d.py);
    const flash: NonNullable<ActionResult["flash"]> = [];

    switch (tool) {
      case "vest": {
        if (this.d.vestArmed) return this.fail("Your vest is already on.");
        this.d.vestArmed = true;
        this.addLog("info", "Flak vest armed. The next mine you step on won't lock you out.");
        break;
      }
      case "detector": {
        if (!inBounds(x, y) || d > 2) return this.fail("The mine detector reaches only 2 cells from your soldier.");
        let n = 0;
        for (let yy = y - 1; yy <= y + 1; yy++)
          for (let xx = x - 1; xx <= x + 1; xx++) if (inBounds(xx, yy) && this.liveMine(idx(xx, yy))) n++;
        this.detector.set(i, n);
        this.addLog("info", `Mine detector at (${x}|${y}): ${n} live mine${n === 1 ? "" : "s"} in the 3×3 area.`);
        flash.push({ x, y, kind: "info" });
        break;
      }
      case "dog": {
        if (!inBounds(x, y) || this.cells[i] !== S_HIDDEN || WORLD.river[i]) return this.fail("The dog needs an unexplored cell.");
        if (d !== 1) return this.fail("The dog only sniffs cells right next to your soldier.");
        if (this.mines[i]) {
          this.dogMine.add(i);
          this.addLog("info", `Woof! Mine confirmed at (${x}|${y}).`);
        } else {
          this.dogSafe.add(i);
          this.addLog("info", `The dog says (${x}|${y}) is safe.`);
        }
        flash.push({ x, y, kind: "info" });
        break;
      }
      case "drone": {
        if (!inBounds(x, y) || d > 10) return this.fail("The drone's range is 10 cells from your soldier.");
        let found = 0;
        for (let yy = y - 3; yy <= y + 3; yy++)
          for (let xx = x - 3; xx <= x + 3; xx++) {
            if (!inBounds(xx, yy)) continue;
            const j = idx(xx, yy);
            if (CRATE_TIER.has(j) && (this.crates.get(j) ?? "hidden") === "hidden") {
              this.crates.set(j, "discovered");
              found++;
            }
          }
        this.addLog("info", `Drone over (${x}|${y}) spotted ${found} hidden treasure${found === 1 ? "" : "s"}.`);
        flash.push({ x, y, kind: "info" });
        break;
      }
      case "bridge": {
        if (!inBounds(x, y) || !WORLD.river[i]) return this.fail("Bridges go on river cells.");
        if (this.cells[i] !== S_HIDDEN) return this.fail("There's already a bridge.");
        if (!ringUnlocked(x, y, this.day)) return this.fail("That ring is still behind barbed wire.");
        if (d !== 1) return this.fail("Build the bridge right next to your soldier.");
        this.cells[i] = S_BRIDGE;
        this.addLog("success", `Bridge built at (${x}|${y}).`);
        flash.push({ x, y, kind: "info" });
        break;
      }
    }
    this.d.tools[tool]--;
    this.save();
    return { ok: true, flash };
  }

  /** Buy a step pack. Allowed during an out-of-steps lockout (and ends it), but not during a mine / wrong-defuse lockout. */
  buySteps(): ActionResult {
    this.sync();
    const outOfSteps = this.isLocked() && this.d.lockReason === "steps";
    const locked = this.lockedError();
    if (locked && !outOfSteps) return this.fail(locked);
    if (this.d.extraPacksBoughtToday >= EXTRA_PACKS_PER_DAY) return this.fail("Daily purchase limit reached.");
    if (this.d.gemBalance < EXTRA_STEPS_PRICE_GEMS) return this.fail("Not enough gems.");
    this.d.gemBalance -= EXTRA_STEPS_PRICE_GEMS;
    this.d.extraPacksBoughtToday++;
    this.d.steps += EXTRA_STEPS_PACK;
    this.addLog("info", `Bought ${EXTRA_STEPS_PACK} steps for ${EXTRA_STEPS_PRICE_GEMS} gems.`);
    if (outOfSteps) {
      this.d.lockedUntil = null;
      this.d.lockReason = null;
      this.addLog("success", "Back in action – the lockout has ended.");
    }
    this.save();
    return { ok: true };
  }

  // ---------------- dev / mock only ----------------

  devNextDay(): ActionResult {
    if (this.day >= EVENT_DAYS) return this.fail("The event is over (day 30).");
    this.d.devDayOffset++;
    this.sync();
    this.save();
    return { ok: true };
  }

  devSkipLock(): ActionResult {
    if (this.d.lockedUntil === null) return this.fail("You are not locked out.");
    this.d.lockedUntil = Date.now();
    this.addLog("info", "[DEV] Lockout skipped.");
    this.sync();
    return { ok: true };
  }

  devAddSteps(n: number): ActionResult {
    this.d.steps += n;
    this.addLog("info", `[DEV] +${n} steps.`);
    this.save();
    return { ok: true };
  }

  devReset(): ActionResult {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.load();
    return { ok: true };
  }

  /** Development only: all live mines and treasure (as if the player were cheating). */
  devReveal(): { mines: Uint8Array; treasure: Map<number, string> } {
    const treasure = new Map<number, string>();
    const mines = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (this.liveMine(i)) mines[i] = 1;
      if (!this.hasTreasure(i)) continue;
      const tier = CRATE_TIER.get(i);
      treasure.set(i, tier ? (this.rollCrate(i % MAP_SIZE, Math.floor(i / MAP_SIZE), tier).items?.[0]?.id ?? "") : "legendary");
    }
    return { mines, treasure };
  }

  // ---------------- state ----------------

  getState(): PublicState {
    this.sync();
    const cells = new Int8Array(N);
    const signals = new Int8Array(N).fill(-1);
    let cleared = 0;
    let maxDistance = 0;
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const i = idx(x, y);
        const s = this.cells[i];
        if (s === S_HIDDEN) {
          cells[i] = CELL_HIDDEN;
          continue;
        }
        if (s === S_EXPLODED) {
          cells[i] = CELL_EXPLODED;
          continue;
        }
        if (s === S_RUBBLE) {
          cells[i] = CELL_RUBBLE;
          continue;
        }
        cleared++;
        maxDistance = Math.max(maxDistance, distFromCenter(x, y));
        if (s === S_BRIDGE) {
          cells[i] = CELL_BRIDGE;
          continue;
        }
        if (s === S_DEFUSED) {
          cells[i] = CELL_DEFUSED;
          continue;
        }
        signals[i] = this.signalAt(x, y);
        cells[i] = this.isSmoked(x, y) ? CELL_SMOKE : this.mineCount(x, y);
      }

    const pois: PublicPoi[] = [];
    WORLD.bunkerZones.forEach((z, n) => pois.push({ id: `bz${n}`, kind: "bunker_zone", x: z.x, y: z.y, radius: z.r, label: "Abandoned bunker" }));
    WORLD.outposts.forEach((p, n) =>
      pois.push({ id: `o${n}`, kind: this.d.outpostsReached.includes(n) ? "outpost_reached" : "outpost", x: p.x, y: p.y, label: `Outpost ${n + 1}` }),
    );
    WORLD.legendaries.forEach((p, n) => {
      if (this.d.legendaryDestroyed.includes(n)) {
        pois.push({ id: `l${n}`, kind: "crate_destroyed", x: p.x, y: p.y, label: "Destroyed legendary treasure" });
        return;
      }
      const opened = this.d.legendaryOpened.includes(n);
      const rivalDay = RIVAL_LEGENDARY_DAYS[n];
      const claimedBy = !opened && this.day >= rivalDay ? ` – first claimed by ${RIVAL_NAMES[n]}` : "";
      pois.push({ id: `l${n}`, kind: opened ? "legendary_opened" : "legendary", x: p.x, y: p.y, label: `Legendary treasure${claimedBy}` });
    });
    pois.push({ id: "general", kind: "general", x: WORLD.general.x, y: WORLD.general.y, label: "General's Bunker" });
    for (const [i, st] of this.crates) {
      if (st === "hidden") continue;
      pois.push({
        id: `c${i}`,
        kind: st === "opened" ? "crate_opened" : st === "destroyed" ? "crate_destroyed" : "crate",
        x: i % MAP_SIZE,
        y: Math.floor(i / MAP_SIZE),
        label: st === "discovered" ? "Treasure (spotted by drone)" : st === "destroyed" ? "Destroyed treasure" : "Collected treasure",
        itemId: st === "opened" ? this.rollCrate(i % MAP_SIZE, Math.floor(i / MAP_SIZE), CRATE_TIER.get(i)!).items?.[0]?.id : undefined,
      });
    }

    return {
      day: this.day,
      steps: this.d.steps,
      lockedUntil: this.isLocked() ? this.d.lockedUntil : null,
      lockReason: this.isLocked() ? this.d.lockReason : null,
      minesDefused: this.d.minesDefused,
      vestArmed: this.d.vestArmed,
      player: { x: this.d.px, y: this.d.py },
      tools: { ...this.d.tools },
      gemBalance: this.d.gemBalance,
      goldEarned: this.d.goldEarned,
      items: Object.entries(this.d.items)
        .map(([id, qty]) => ({ id, qty }))
        .sort((a, b) => Number(ITEM_BY_ID.get(b.id)?.rare) - Number(ITEM_BY_ID.get(a.id)?.rare) || b.qty - a.qty),
      titles: [...this.d.titles],
      extraPacksBoughtToday: this.d.extraPacksBoughtToday,
      cells,
      signals,
      dogMine: new Set(this.dogMine),
      dogSafe: new Set(this.dogSafe),
      detectorMarks: new Map(this.detector),
      pois,
      cellsCleared: cleared,
      maxDistance,
      cratesOpened: [...this.crates.values()].filter((s) => s === "opened").length,
      cratesTotal: CRATE_TIER.size,
      reachedGeneral: this.d.reachedGeneral,
      lastReport: this.d.lastReport,
      log: [...this.d.log],
    };
  }
}
