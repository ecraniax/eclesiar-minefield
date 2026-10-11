import type { ItemStack } from "./items";

export type ToolId = "detector" | "dog" | "vest" | "drone" | "bridge";

export type Tools = Record<ToolId, number>;

/**
 * Public cell state as seen by the client.
 * -1 = unexplored, 0..8 = mine count, 9 = exploded mine, 10 = explored but number hidden (smoke), 11 = bridge
 */
export type CellValue = number;
export const CELL_HIDDEN = -1;
export const CELL_EXPLODED = 9;
export const CELL_SMOKE = 10;
export const CELL_BRIDGE = 11;
/** Successfully defused mine: walkable cell. */
export const CELL_DEFUSED = 12;
/** Rubble after a wrong defuse: walkable, no information. */
export const CELL_RUBBLE = 13;

export type LockReason = "mine" | "defuse" | "steps";

/** Metal detector signal: 0 = none, 1 = weak (SIGNAL_RANGE), 2 = strong (SIGNAL_STRONG). */
export type Signal = 0 | 1 | 2;
export const SIGNAL_LABEL = ["no signal", "weak signal", "strong signal"] as const;

export type PoiKind =
  | "crate"
  | "crate_opened"
  | "crate_destroyed"
  | "legendary"
  | "legendary_opened"
  | "outpost"
  | "outpost_reached"
  | "bunker_zone"
  | "general";

export interface PublicPoi {
  id: string;
  kind: PoiKind;
  x: number;
  y: number;
  /** For "bunker_zone": half-width of the area. */
  radius?: number;
  label?: string;
  /** Collected treasure: which item it contained. */
  itemId?: string;
}

export interface Reward {
  gold?: number;
  steps?: number;
  tools?: Partial<Tools>;
  items?: ItemStack[];
  title?: string;
}

export type RewardKind = "treasure" | "bunker" | "outpost" | "legendary" | "general";

/** A reward to show in the (animated) dialog. */
export interface RewardEvent {
  kind: RewardKind;
  source: string;
  reward: Reward;
}

export interface LogEntry {
  id: number;
  day: number;
  kind: "info" | "loot" | "danger" | "success";
  text: string;
}

/** Report after stepping onto a new cell. */
export interface StepReport {
  x: number;
  y: number;
  /** null = hidden by smoke */
  mines: number | null;
  signal: Signal;
  boom?: boolean;
  loot?: string;
  lootItems?: ItemStack[];
  /** Defuse: true = mine defused, false = there was no mine (charge exploded). */
  defused?: boolean;
  /** Number of destroyed treasures. */
  destroyed?: number;
  /** Walked onto an already defused mine cell. */
  onDefused?: boolean;
  /** Walked onto rubble (no information). */
  rubble?: boolean;
}

export interface PublicState {
  day: number;
  steps: number;
  /** Until when (ms timestamp) playing is locked; null = no lockout. */
  lockedUntil: number | null;
  lockReason: LockReason | null;
  minesDefused: number;
  vestArmed: boolean;
  player: { x: number; y: number };
  tools: Tools;
  /** Player's gems (for buying steps). */
  gemBalance: number;
  goldEarned: number;
  /** Collected items (totals). */
  items: ItemStack[];
  titles: string[];
  extraPacksBoughtToday: number;
  cells: Int8Array;
  /** Metal detector signal for each explored cell (-1 = not explored). */
  signals: Int8Array;
  /** Cells where the dog confirmed a mine. */
  dogMine: Set<number>;
  dogSafe: Set<number>;
  detectorMarks: Map<number, number>;
  pois: PublicPoi[];
  cellsCleared: number;
  maxDistance: number;
  cratesOpened: number;
  cratesTotal: number;
  reachedGeneral: boolean;
  lastReport: StepReport | null;
  log: LogEntry[];
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  report?: StepReport;
  /** Rewards gained by this action – each one is shown in a dialog. */
  rewards?: RewardEvent[];
  /** Cells to briefly highlight (e.g. an explosion). */
  flash?: { x: number; y: number; kind: "boom" | "loot" | "info" }[];
}
