"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EVENT_DAYS,
  EXTRA_PACKS_PER_DAY,
  EXTRA_STEPS_PACK,
  EXTRA_STEPS_PRICE_GEMS,
  LOCKOUT_MS,
  MAP_SIZE,
  RINGS,
  STEPS_PER_REFILL,
  TREASURE_DENSITY,
} from "@/lib/config";
import { OUTPOST_STEPS } from "@/lib/items";
import { TERRAIN_INFO, WORLD, distFromCenter, idx, ringOf } from "@/lib/world";

const N = MAP_SIZE * MAP_SIZE;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)} %`;

type Mode = "defuse" | "steps";

export default function PaceDialog({ onClose }: { onClose: () => void }) {
  /** "defuse": the player defuses every mine in their way (free) – best case. "steps": only stepping, mines stay unexplored. */
  const [mode, setMode] = useState<Mode>("defuse");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Map size per ring (from the real world data)
  const map = useMemo(() => {
    const rings = RINGS.map((r) => ({ ring: r, cells: 0, land: 0 }));
    let land = 0;
    for (let y = 0; y < MAP_SIZE; y++)
      for (let x = 0; x < MAP_SIZE; x++) {
        const r = rings[ringOf(x, y).id - 1];
        r.cells++;
        if (!WORLD.river[idx(x, y)]) {
          r.land++;
          land++;
        }
      }
    const g = WORLD.general;
    const toGeneral = distFromCenter(g.x, g.y) - 1; // the bunker is 3×3, so one step less
    return { rings, land, toGeneral, desertDay: RINGS[RINGS.length - 1].unlockDay };
  }, []);

  // Pace table
  const lockoutH = LOCKOUT_MS / 3_600_000;
  const maxSessions = Math.floor(24 / lockoutH);
  const patterns = [
    { label: "Every time the lockout ends (day & night)", sessions: maxSessions },
    { label: "Every lockout while awake (~16 h)", sessions: Math.min(maxSessions, Math.floor(16 / lockoutH)) },
    { label: "8× per day", sessions: Math.min(maxSessions, 8) },
    { label: "4× per day", sessions: Math.min(maxSessions, 4) },
    { label: "2× per day", sessions: Math.min(maxSessions, 2) },
    { label: "1× per day", sessions: 1 },
  ].filter((p, i, all) => all.findIndex((q) => q.sessions === p.sessions) === i);
  const packs = Array.from({ length: EXTRA_PACKS_PER_DAY + 1 }, (_, n) => n);
  // Land that is open (behind no barbed wire) on a given day
  const openLand = (day: number) => map.rings.filter((r) => r.ring.unlockDay <= day).reduce((a, r) => a + r.land, 0);

  /**
   * Day-by-day simulation. Sectors are filled from the inside out.
   * - "defuse": every cell of a sector can be explored; a safe cell costs 1 step, a mine is defused for free,
   *   so one step yields 1 / (1 − mine density) cells.
   * - "steps":  only safe cells can be explored (1 step each); mines stay unexplored.
   * The barbed wire limits each sector until its unlock day.
   */
  const simulate = (sessions: number, packsPerDay: number, m: Mode, ignoreWire = false) => {
    const perDay = sessions * STEPS_PER_REFILL + packsPerDay * EXTRA_STEPS_PACK;
    const sectors = map.rings.map(({ ring, land }) => ({
      day: ring.unlockDay,
      capacity: m === "defuse" ? land : land * (1 - ring.mineDensity),
      costPerCell: m === "defuse" ? 1 - ring.mineDensity : 1,
      done: 0,
    }));
    let cells = 0;
    let capped = false;
    for (let d = 1; d <= EVENT_DAYS; d++) {
      let steps = perDay;
      for (const sec of sectors) {
        if (steps <= 0) break;
        if (!ignoreWire && sec.day > d) continue;
        const left = sec.capacity - sec.done;
        if (left <= 0) continue;
        const possible = steps / sec.costPerCell;
        const take = Math.min(left, possible);
        sec.done += take;
        cells += take;
        steps -= take * sec.costPerCell;
      }
      if (steps > 0.5 && sectors.some((sec) => sec.done < sec.capacity)) capped = true;
    }
    return { cells, capped };
  };
  const cellsFor = (sessions: number, packsPerDay: number) => {
    const r = simulate(sessions, packsPerDay, mode);
    return { ...r, uncapped: simulate(sessions, packsPerDay, mode, true).cells };
  };
  const maxCells = mode === "defuse" ? map.land : map.rings.reduce((a, r) => a + r.land * (1 - r.ring.mineDensity), 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-6" onClick={onClose}>
      <div
        className="reward-pop flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-900 bg-stone-950 text-stone-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-gradient-to-r from-emerald-950 to-stone-950 px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Operation Minefield</div>
            <h2 className="text-xl font-bold">📊 Map size & pace</h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
          {/* ---------- Map ---------- */}
          <section>
            <h3 className="mb-2 border-b border-stone-800 pb-1 text-base font-bold text-emerald-200">🗺️ The whole map</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Big label="Cells in total" value={fmt(N)} sub={`${MAP_SIZE} × ${MAP_SIZE}`} />
              <Big label="Land cells" value={fmt(map.land)} sub={`${fmt(N - map.land)} are river`} />
              <Big label="Treasures (approx.)" value={`~${fmt(map.land * TREASURE_DENSITY)}`} sub={`${TREASURE_DENSITY * 100} % of cells`} />
              <Big
                label="Shortest path to 🏰"
                value={`${map.toGeneral} steps`}
                sub={`Desert opens on day ${map.desertDay}`}
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-stone-800">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-stone-900 text-stone-400">
                  <tr>
                    <th className="px-3 py-1.5">Sector</th>
                    <th className="px-3 py-1.5 text-right">Cells</th>
                    <th className="px-3 py-1.5 text-right">Land</th>
                    <th className="px-3 py-1.5 text-right">Mines (approx.)</th>
                    <th className="px-3 py-1.5 text-right">Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {map.rings.map(({ ring, cells, land }) => (
                    <tr key={ring.id} className="border-t border-stone-800">
                      <td className="px-3 py-1.5">
                        <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: ring.fog }} />
                        {ring.id}. {TERRAIN_INFO[ring.terrain].name}
                      </td>
                      <td className="px-3 py-1.5 text-right">{fmt(cells)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(land)}</td>
                      <td className="px-3 py-1.5 text-right">~{fmt(land * ring.mineDensity)}</td>
                      <td className="px-3 py-1.5 text-right">day {ring.unlockDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- Pace ---------- */}
          <section>
            <h3 className="mb-2 border-b border-stone-800 pb-1 text-base font-bold text-emerald-200">👣 Cells you can explore in {EVENT_DAYS} days</h3>
            <p className="text-stone-400">
              You get {STEPS_PER_REFILL} steps, and after they run out a {lockoutH} {lockoutH === 1 ? "hour" : "hours"} lockout follows
              before the next {STEPS_PER_REFILL}. Steps don&apos;t pile up, so what matters is how often you come back. Each pack adds{" "}
              {EXTRA_STEPS_PACK} steps for {EXTRA_STEPS_PRICE_GEMS} 💎 (max {EXTRA_PACKS_PER_DAY}× per day). Numbers assume no losses (no
              mine stepped on, no wrong defuse).
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <ModeBtn active={mode === "defuse"} onClick={() => setMode("defuse")}>
                💣 Defusing every mine (best case)
                <span className="block text-[11px] font-normal opacity-80">Safe cell = 1 step, mine = defused for free</span>
              </ModeBtn>
              <ModeBtn active={mode === "steps"} onClick={() => setMode("steps")}>
                👣 Steps only
                <span className="block text-[11px] font-normal opacity-80">Mines are avoided and stay unexplored</span>
              </ModeBtn>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-stone-800">
              <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                <thead className="bg-stone-900 text-stone-400">
                  <tr>
                    <th className="px-3 py-2">How often you play</th>
                    {packs.map((p) => (
                      <th key={p} className="px-2 py-2 text-right">
                        {p === 0 ? "No purchase" : `${p} pack${p > 1 ? "s" : ""}/day`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((pt) => (
                    <tr key={pt.label} className="border-t border-stone-800">
                      <td className="px-3 py-2">
                        <div>{pt.label}</div>
                        <div className="text-[11px] text-stone-500">
                          {pt.sessions} × {STEPS_PER_REFILL} = {pt.sessions * STEPS_PER_REFILL} steps/day
                        </div>
                      </td>
                      {packs.map((p) => {
                        const c = cellsFor(pt.sessions, p);
                        return (
                          <td
                            key={p}
                            className={`px-2 py-2 text-right ${p === 0 ? "font-semibold text-stone-100" : "text-stone-300"}`}
                            title={c.capped ? `Without barbed wire it would be ${fmt(c.uncapped)}` : undefined}
                          >
                            {c.capped && <span className="mr-1 text-amber-400">🔒</span>}
                            {fmt(c.cells)}
                            <div className="text-[10px] text-stone-500">{pct(c.cells, map.land)} of map</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-stone-700 bg-stone-900/60 text-stone-400">
                    <td className="px-3 py-2 text-xs">Gems spent in {EVENT_DAYS} days</td>
                    {packs.map((p) => (
                      <td key={p} className="px-2 py-2 text-right text-xs">
                        {p === 0 ? "–" : `${fmt(p * EXTRA_STEPS_PRICE_GEMS * EVENT_DAYS)} 💎`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-stone-400">
              <li>
                <span className="text-amber-400">🔒</span> = limited by the barbed wire: you can&apos;t explore more cells than the sectors
                opened so far ({RINGS.map((r) => `day ${r.unlockDay}: ${fmt(openLand(r.unlockDay))}`).join(", ")} land cells). Very
                active players run out of open land and wait for the next sector. Hover a number to see the value without this limit.
                The most you can ever explore in this mode is {fmt(maxCells)} cells ({pct(maxCells, map.land)} of the map).
              </li>
              <li>
                Bonus steps are not included: up to +{OUTPOST_STEPS * WORLD.outposts.length} from the {WORLD.outposts.length} outposts and a
                few from treasure.
              </li>
              <li>
                Reaching the 🏰 General&apos;s Bunker needs only ~{map.toGeneral} steps on the shortest path – the real limits are the
                barbed wire (day {map.desertDay}) and the mines on the way.
              </li>
              <li>
                Defusing is free: in sectors with {RINGS.map((r) => Math.round(r.mineDensity * 100) + " %").join(" / ")} mines, a player who
                defuses every mine in the way gets about{" "}
                {RINGS.map((r) => "+" + Math.round((1 / (1 - r.mineDensity) - 1) * 100) + " %").join(" / ")} cells per step compared to
                &quot;steps only&quot;.
              </li>
              <li>Every mine you step on or wrong defuse costs a lockout, so for careless players real numbers are lower.</li>
            </ul>
          </section>
        </div>

        <div className="shrink-0 border-t border-stone-800 px-5 py-3">
          <button onClick={onClose} className="w-full rounded-xl bg-emerald-700 py-2.5 font-bold text-white hover:bg-emerald-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
        active ? "border-emerald-500 bg-emerald-900/50 text-emerald-100" : "border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800"
      }`}
    >
      {children}
    </button>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900 p-3">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-xl font-bold text-stone-100">{value}</div>
      {sub && <div className="text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
}
