"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CENTER,
  EVENT_DAYS,
  EXTRA_PACKS_PER_DAY,
  EXTRA_STEPS_PACK,
  EXTRA_STEPS_PRICE_GEMS,
  DEFUSE_BLAST_RADIUS,
  MAP_SIZE,
  RINGS,
  STEPS_PER_REFILL,
  TOOL_INFO,
} from "@/lib/config";
import { getApi, type GameApi } from "@/lib/api";
import { SIGNAL_LABEL, type ActionResult, type RewardEvent, type PublicState, type StepReport, type ToolId } from "@/lib/types";
import { TERRAIN_INFO, WORLD, idx, ringOf } from "@/lib/world";
import { ITEM_BY_ID, type ItemStack } from "@/lib/items";
import MapCanvas, { MAX_ZOOM, MIN_ZOOM } from "./MapCanvas";
import Minimap from "./Minimap";
import RewardDialog from "./RewardDialog";
import RulesDialog from "./RulesDialog";
import DevDialog from "./DevDialog";
import PaceDialog from "./PaceDialog";
import OutOfStepsDialog from "./OutOfStepsDialog";
import { DefuseIcon } from "./icons";
import type { Camera, DevReveal, Flash } from "./render";

type Tab = "status" | "rewards" | "log";

const RULES_SEEN_KEY = "razminiranje:rulesSeen";

const MOVE_KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
};

export default function Game() {
  const [api, setApi] = useState<GameApi | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [cam, setCamState] = useState<Camera>({ x: CENTER + 0.5, y: CENTER + 0.5, zoom: 1 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [defuseMode, setDefuseMode] = useState(false);
  /** Queue of rewards waiting to be confirmed in the dialog. */
  const [rewards, setRewards] = useState<{ events: RewardEvent[]; i: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [toast, setToast] = useState<{ text: string; kind: "error" | "ok" } | null>(null);
  const [tab, setTab] = useState<Tab>("status");
  const [dev, setDev] = useState<DevReveal | null>(null);
  /** Rules dialog – opens automatically on the first visit. */
  const [rulesOpen, setRulesOpen] = useState(() => {
    try {
      return localStorage.getItem(RULES_SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [devDocOpen, setDevDocOpen] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  /** "Out of steps" dialog – offers to buy a step pack and continue right away. */
  const [outOfStepsOpen, setOutOfStepsOpen] = useState(false);
  const closeOutOfSteps = useCallback(() => setOutOfStepsOpen(false), []);
  const closePace = useCallback(() => setPaceOpen(false), []);
  const closeDevDoc = useCallback(() => setDevDocOpen(false), []);
  const closeRules = useCallback(() => {
    setRulesOpen(false);
    try {
      localStorage.setItem(RULES_SEEN_KEY, "1");
    } catch {
      // without localStorage the rules simply show on every visit
    }
  }, []);
  const [goto, setGoto] = useState("");
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const mapWrap = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const setCam = useCallback((fn: (c: Camera) => Camera) => setCamState(fn), []);
  const centerOn = useCallback((x: number, y: number) => setCamState((c) => ({ ...c, x: x + 0.5, y: y + 0.5 })), []);

  useEffect(() => {
    getApi().then(async (a) => {
      setApi(a);
      const s = await a.getState();
      setState(s);
      setCamState((c) => ({ ...c, x: s.player.x + 0.5, y: s.player.y + 0.5 }));
    });
  }, []);

  // Lockout countdown; refresh the state when it ends
  const lockedUntil = state?.lockedUntil ?? null;
  useEffect(() => {
    if (lockedUntil === null) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil && api) api.getState().then(setState);
    }, 1000);
    return () => window.clearInterval(t);
  }, [lockedUntil, api]);

  const loaded = state !== null;
  useEffect(() => {
    const el = mapWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const showToast = useCallback((text: string, kind: "error" | "ok" = "error") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2600);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>) => {
      if (!api || busy.current) return;
      busy.current = true;
      try {
        const res = await fn();
        if (!res.ok && res.error) showToast(res.error);
        const won = res.rewards;
        if (won?.length) setRewards((q) => (q ? { ...q, events: [...q.events, ...won] } : { events: won, i: 0 }));
        if (res.flash?.length) {
          const now = performance.now();
          setFlashes((f) => [...f.filter((x) => now - x.t < 1000), ...res.flash!.map((x) => ({ ...x, t: now }))]);
        }
        const s = await api.getState();
        setState(s);
        return { res, state: s };
      } finally {
        busy.current = false;
      }
    },
    [api, showToast],
  );

  const move = useCallback(
    async (x: number, y: number) => {
      if (!api) return;
      const out = await run(() => api.move(x, y));
      if (out?.res.ok) centerOn(out.state.player.x, out.state.player.y);
      // ran out of steps on this move, or tried to move while out of steps
      if (out?.state.lockReason === "steps") setOutOfStepsOpen(true);
    },
    [api, run, centerOn],
  );

  const onPrimary = useCallback(
    (x: number, y: number) => {
      if (!api || !state) return;
      if (tool) {
        run(() => api.useTool(tool, x, y)).then((o) => o?.res.ok && setTool(null));
        return;
      }
      if (defuseMode) {
        run(() => api.defuse(x, y)).then((o) => {
          if (!o?.res.ok) return;
          setDefuseMode(false);
          // a wrong defuse throws the soldier out of the blast area
          if (o.res.report?.thrownTo) centerOn(o.state.player.x, o.state.player.y);
        });
        return;
      }
      if (x === state.player.x && y === state.player.y) return;
      move(x, y);
    },
    [api, state, tool, defuseMode, run, move, centerOn],
  );

  // Right-click / long press: only cancels the selected tool or defuse
  const onSecondary = useCallback(() => {
    setTool(null);
    setDefuseMode(false);
  }, []);

  // Keyboard: move the soldier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || !state || rewards || rulesOpen || devDocOpen || paceOpen || outOfStepsOpen) return;
      const k = e.key.toLowerCase();
      const dir = MOVE_KEYS[k];
      if (dir) {
        if (e.repeat) return;
        move(state.player.x + dir[0], state.player.y + dir[1]);
      } else if (k === "+" || k === "=") setCamState((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, c.zoom * 1.2) }));
      else if (k === "-") setCamState((c) => ({ ...c, zoom: Math.max(MIN_ZOOM, c.zoom / 1.2) }));
      else if (k === "escape") {
        setTool(null);
        setDefuseMode(false);
      } else if (k === "x") {
        setTool(null);
        setDefuseMode((m) => !m);
      }
      else if (k === " " || k === "h") centerOn(state.player.x, state.player.y);
      else if (k === "r") setRulesOpen(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, move, centerOn, rewards, rulesOpen, devDocOpen, paceOpen, outOfStepsOpen]);

  if (!state || !api) {
    return <div className="flex h-dvh items-center justify-center text-stone-400">Loading the minefield…</div>;
  }

  const hoverInfo = hover ? describeCell(state, hover.x, hover.y) : null;
  const lockLeft = state.lockedUntil !== null ? Math.max(0, state.lockedUntil - now) : 0;

  const submitGoto = (e: React.FormEvent) => {
    e.preventDefault();
    const m = goto.match(/(\d+)\D+(\d+)/);
    if (!m) return showToast("Use the format x|y, e.g. 120|40");
    centerOn(Math.min(MAP_SIZE - 1, +m[1]), Math.min(MAP_SIZE - 1, +m[2]));
  };

  return (
    <div className="flex h-dvh flex-col bg-[#12140f] text-stone-200 lg:flex-row">
      {/* ---------- MAP ---------- */}
      <div ref={mapWrap} className="relative min-h-0 flex-1">
        <MapCanvas
          state={state}
          cam={cam}
          setCam={setCam}
          hover={hover}
          setHover={setHover}
          tool={tool}
          defuseMode={defuseMode}
          flashes={flashes}
          dev={dev}
          onPrimary={onPrimary}
          onSecondary={onSecondary}
        />

        {/* HUD */}
        <div className="pointer-events-none absolute left-2 right-2 top-2 flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-stone-700 bg-stone-950/85 px-3 py-2 text-sm shadow-lg">
            <span className="font-semibold tracking-wide text-amber-300">OPERATION MINEFIELD</span>
            <span>
              Day <b>{state.day}</b>/{EVENT_DAYS}
            </span>
            <span title="Steps: each step onto a NEW cell costs one. Walking on cleared cells is free.">
              👣 <b>{state.steps}</b>
            </span>
            {state.vestArmed && <span title="Flak vest armed – the next mine won't lock you out">🛡️</span>}
            {state.lockedUntil !== null && (
              <span className="font-mono font-semibold text-red-300" title="You can't play until the lockout ends">
                🔒 {formatDuration(lockLeft)}
              </span>
            )}
            <span title="Treasures found">
              💰 <b>{state.cratesOpened}</b>
            </span>
            <button
              onClick={() => setRulesOpen(true)}
              className="rounded-md border border-amber-600/70 bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:bg-amber-800/60"
              title="Rules (R)"
            >
              📖 Rules
            </button>
            <button
              onClick={() => setPaceOpen(true)}
              className="rounded-md border border-emerald-600/70 bg-emerald-900/40 px-2 py-0.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-800/60"
              title="Map size & how many cells you can explore"
            >
              📊 Pace
            </button>
          </div>
          {state.lastReport && <ReportCard report={state.lastReport} />}
        </div>

        {state.lockedUntil !== null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-2">
            <div className="rounded-lg border border-red-800 bg-red-950/95 px-5 py-3 text-center text-red-100 shadow-xl">
              <div className="text-xs uppercase tracking-wider text-red-300">{LOCK_TITLE[state.lockReason ?? "steps"]}</div>
              <div className="font-mono text-2xl font-bold">{formatDuration(lockLeft)}</div>
              <div className="text-xs text-red-300">
                until you can play again{state.lockReason === "steps" ? ` (+${STEPS_PER_REFILL} steps)` : ""}
              </div>
              {state.lockReason === "steps" && (
                <button
                  onClick={() => setOutOfStepsOpen(true)}
                  className="pointer-events-auto mt-2 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-1.5 text-sm font-bold text-stone-950 hover:brightness-110"
                >
                  Continue playing
                </button>
              )}
            </div>
          </div>
        )}

        {defuseMode && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-2">
            <div className="rounded-md border border-red-500 bg-stone-950/90 px-4 py-2 text-center text-sm text-red-200 shadow-lg">
              <DefuseIcon size={18} /> <b>Defuse mode</b> – click a red cell next to your soldier. No mine there = blast ({DEFUSE_BLAST_RADIUS * 2 + 1}×
              {DEFUSE_BLAST_RADIUS * 2 + 1}, impassable afterwards) + lockout. Esc to cancel.
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`pointer-events-none absolute left-1/2 top-1/3 max-w-[90%] -translate-x-1/2 rounded-md px-4 py-2 text-center text-sm shadow-lg ${
              toast.kind === "error" ? "bg-red-900/95 text-red-100" : "bg-emerald-900/95 text-emerald-100"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* Bottom left: cell info */}
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded-md border border-stone-700 bg-stone-950/85 px-3 py-1.5 font-mono text-xs">
          {hoverInfo ?? <span className="text-stone-500">WASD / arrows to move · drag to look around · X to defuse</span>}
        </div>

        {/* Bottom right: controls */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <MapBtn onClick={() => setCamState((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, c.zoom * 1.25) }))}>＋</MapBtn>
          <MapBtn onClick={() => setCamState((c) => ({ ...c, zoom: Math.max(MIN_ZOOM, c.zoom / 1.25) }))}>－</MapBtn>
          <MapBtn onClick={() => centerOn(state.player.x, state.player.y)} title="Center on soldier (Space)">
            💂
          </MapBtn>
          <MapBtn onClick={() => centerOn(WORLD.general.x, WORLD.general.y)} title="Look at the General's Bunker">
            🏰
          </MapBtn>
          <MapBtn
            active={defuseMode}
            onClick={() => {
              setTool(null);
              setDefuseMode((m) => !m);
            }}
            title="Defuse a cell next to you (X)"
          >
            <DefuseIcon size={24} />
          </MapBtn>
        </div>
      </div>

      {rewards && rewards.events[rewards.i] && (
        <RewardDialog
          event={rewards.events[rewards.i]}
          position={rewards.i + 1}
          total={rewards.events.length}
          onConfirm={() => setRewards((q) => (q && q.i + 1 < q.events.length ? { ...q, i: q.i + 1 } : null))}
        />
      )}

      {rulesOpen && <RulesDialog onClose={closeRules} />}
      {devDocOpen && <DevDialog onClose={closeDevDoc} />}
      {paceOpen && <PaceDialog onClose={closePace} />}
      {outOfStepsOpen && state.lockReason === "steps" && (
        <OutOfStepsDialog
          state={state}
          onClose={closeOutOfSteps}
          onBuy={async () => {
            const o = await run(() => api.buySteps());
            if (o?.res.ok) showToast(`+${EXTRA_STEPS_PACK} steps – keep going!`, "ok");
            return !!o?.res.ok;
          }}
        />
      )}

      {/* ---------- SIDEBAR ---------- */}
      <aside className="flex max-h-[45dvh] w-full flex-col border-t border-stone-800 bg-stone-950 lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0">
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          <div className="flex gap-3">
            <Minimap state={state} cam={cam} viewport={viewport} onJump={(x, y) => setCamState((c) => ({ ...c, x, y }))} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
              <form onSubmit={submitGoto} className="flex flex-col gap-1">
                <label className="text-stone-400">Look at coordinates</label>
                <div className="flex gap-1">
                  <input
                    value={goto}
                    onChange={(e) => setGoto(e.target.value)}
                    placeholder="120|40"
                    className="w-full min-w-0 rounded border border-stone-700 bg-stone-900 px-2 py-1 font-mono"
                  />
                  <button className="rounded bg-stone-700 px-2 hover:bg-stone-600">Go</button>
                </div>
              </form>
              <div className="font-mono text-stone-300">
                💂 ({state.player.x}|{state.player.y})
              </div>
              <div className="font-mono text-stone-400">
                🏰 ({WORLD.general.x}|{WORLD.general.y})
              </div>
              <div className="text-stone-500">{ringOf(state.player.x, state.player.y).name}</div>
            </div>
          </div>

          {/* Tools */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Tools</h3>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(TOOL_INFO) as ToolId[]).map((t) => {
                const info = TOOL_INFO[t];
                const count = state.tools[t];
                const active = tool === t;
                return (
                  <button
                    key={t}
                    disabled={count <= 0}
                    title={`${info.name}: ${info.desc}`}
                    onClick={() => {
                      if (t === "vest") run(() => api.useTool("vest", 0, 0));
                      else setTool(active ? null : t);
                    }}
                    className={`relative flex flex-col items-center rounded border px-1 py-1.5 text-lg transition disabled:opacity-30 ${
                      active ? "border-sky-400 bg-sky-900/50" : "border-stone-700 bg-stone-900 hover:bg-stone-800"
                    }`}
                  >
                    {info.icon}
                    <span className="text-[10px] text-stone-300">×{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 min-h-[2.5em] text-xs text-stone-400">
              {tool ? (
                <>
                  <b className="text-sky-300">{TOOL_INFO[tool].name}:</b> {TOOL_INFO[tool].desc} Click a cell (Esc to cancel).
                </>
              ) : (
                "Click a tool, then a cell on the map. More tools are hidden in treasures."
              )}
            </p>
          </section>

          {/* Buy steps */}
          <button
            onClick={() => run(() => api.buySteps()).then((o) => o?.res.ok && showToast(`+${EXTRA_STEPS_PACK} steps – keep going!`, "ok"))}
            disabled={state.extraPacksBoughtToday >= EXTRA_PACKS_PER_DAY}
            className="rounded border border-amber-700 bg-amber-900/40 px-3 py-2 text-left text-sm hover:bg-amber-900/60 disabled:opacity-40"
          >
            Buy {EXTRA_STEPS_PACK} steps for {EXTRA_STEPS_PRICE_GEMS} 💎 gems{" "}
            <span className="text-xs text-stone-400">
              ({state.extraPacksBoughtToday}/{EXTRA_PACKS_PER_DAY} today · balance {state.gemBalance} 💎, mock)
            </span>
          </button>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-stone-800 text-xs">
            {(["status", "rewards", "log"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-1.5 capitalize ${tab === t ? "border-b-2 border-amber-400 text-amber-300" : "text-stone-400 hover:text-stone-200"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "status" && (
            <section className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-center">
                <Stat label="Treasures" value={state.cratesOpened} />
                <Stat label="Defused" value={state.minesDefused} />
                <Stat label="Cells explored" value={state.cellsCleared} />
                <Stat label="Max distance" value={state.maxDistance} />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Sectors</h3>
                <ul className="flex flex-col gap-1">
                  {RINGS.map((r) => {
                    const open = r.unlockDay <= state.day;
                    return (
                      <li key={r.id} className="flex items-center justify-between rounded bg-stone-900 px-2 py-1">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: r.fog }} />
                          {r.id}. {r.name}
                        </span>
                        <span className={`text-xs ${open ? "text-emerald-400" : "text-stone-500"}`}>
                          {open ? `open · ${Math.round(r.mineDensity * 100)}% mines` : `day ${r.unlockDay}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {state.reachedGeneral && (
                <div className="rounded border border-amber-500 bg-amber-900/30 p-2 text-center text-amber-200">
                  🏆 You reached the General&apos;s Bunker!
                </div>
              )}
            </section>
          )}

          {tab === "rewards" && (
            <section className="flex flex-col gap-2 text-sm">
              <Stat label="Gold earned in event" value={state.goldEarned} />
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Collected items</h3>
                {state.items.length ? (
                  <ul className="grid grid-cols-4 gap-1">
                    {state.items.map((it) => (
                      <ItemTile key={it.id} stack={it} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-stone-500">Nothing yet – find treasure to collect items.</p>
                )}
              </div>
              {state.titles.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Titles</h3>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(state.titles)].map((t) => (
                      <span key={t} className="rounded bg-amber-700/60 px-2 py-0.5 text-xs">
                        🎖️ {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "log" && (
            <ul className="flex flex-col gap-1 text-xs">
              {state.log.map((l) => (
                <li
                  key={l.id}
                  className={`rounded px-2 py-1 ${
                    l.kind === "danger"
                      ? "bg-red-950/60 text-red-200"
                      : l.kind === "loot"
                        ? "bg-amber-950/60 text-amber-200"
                        : l.kind === "success"
                          ? "bg-emerald-950/60 text-emerald-200"
                          : "bg-stone-900 text-stone-300"
                  }`}
                >
                  <span className="text-stone-500">D{l.day} · </span>
                  {l.text}
                </li>
              ))}
            </ul>
          )}

          {/* DEV */}
          <section className="mt-2 rounded border border-dashed border-fuchsia-800 p-2 text-xs">
            <h3 className="mb-1 font-semibold uppercase tracking-wider text-fuchsia-400">Dev / mock</h3>
            <button
              onClick={() => setDevDocOpen(true)}
              className="mb-2 w-full rounded-md border border-sky-700 bg-sky-950 px-3 py-2 text-left text-sm font-semibold text-sky-200 hover:bg-sky-900"
            >
              🛠️ Development
              <span className="block text-[11px] font-normal text-sky-300/80">How to build the real backend (DB, API, scaling)</span>
            </button>
            <div className="flex flex-wrap gap-1">
              <DevBtn onClick={() => run(() => api.dev.nextDay())}>Next day →</DevBtn>
              <DevBtn onClick={() => run(() => api.dev.addSteps(50))}>+50 steps</DevBtn>
              <DevBtn onClick={() => run(() => api.dev.skipLock())}>Skip lockout</DevBtn>
              <DevBtn onClick={async () => setDev(dev ? null : await api.dev.reveal())}>
                {dev ? "Hide mines & treasure" : "Show mines & treasure"}
              </DevBtn>
              <DevBtn
                onClick={async () => {
                  if (!confirm("Reset all progress?")) return;
                  setDev(null);
                  const out = await run(() => api.dev.reset());
                  if (out) centerOn(out.state.player.x, out.state.player.y);
                }}
              >
                Reset
              </DevBtn>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

const LOCK_TITLE = {
  mine: "💥 You stepped on a mine",
  defuse: "💥 Wrong defuse – there was no mine",
  steps: "👣 Out of steps",
} as const;

function formatDuration(ms: number) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ReportCard({ report }: { report: StepReport }) {
  const lost = report.destroyed ? ` ${report.destroyed} treasure${report.destroyed > 1 ? "s" : ""} destroyed.` : "";
  if (report.boom) {
    return (
      <div className="rounded-md border border-red-700 bg-red-950/90 px-4 py-2 text-sm text-red-100 shadow-lg">
        💥 <b>BOOM!</b> Mine at ({report.x}|{report.y}).{lost}
      </div>
    );
  }
  if (report.defused === false) {
    return (
      <div className="rounded-md border border-red-700 bg-red-950/90 px-4 py-2 text-sm text-red-100 shadow-lg">
        💥 <b>No mine at ({report.x}|{report.y})!</b> The defuse charge blew up the area – it can no longer be crossed.{lost}
        {report.thrownTo && (
          <>
            {" "}
            The blast threw you to ({report.thrownTo.x}|{report.thrownTo.y}).
          </>
        )}
      </div>
    );
  }
  if (report.defused) {
    return (
      <div className="rounded-md border border-emerald-700 bg-emerald-950/90 px-4 py-2 text-sm text-emerald-100 shadow-lg">
        <DefuseIcon size={18} /> <b>Mine defused</b> at ({report.x}|{report.y}). The cell is now safe.
      </div>
    );
  }
  const mines =
    report.mines === null
      ? "Smoke – can't read the mine count"
      : report.mines === 0
        ? "No mines around"
        : `${report.mines} mine${report.mines === 1 ? "" : "s"} around`;
  const signalColor = ["text-stone-400", "text-yellow-400", "text-red-400"][report.signal];
  return (
    <div className="max-w-[min(520px,100%)] rounded-md border border-stone-600 bg-stone-950/90 px-4 py-2 text-sm shadow-lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-stone-400">
          ({report.x}|{report.y})
        </span>
        {report.onDefused && (
          <span className="text-stone-300">
            <DefuseIcon size={16} /> defused mine
          </span>
        )}
        <span className={report.mines ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>💣 {mines}</span>
        <span className={`font-semibold ${signalColor}`}>📡 {cap(SIGNAL_LABEL[report.signal])}</span>
      </div>
      {report.loot && (
        <div className="mt-1 flex items-center gap-2 font-semibold text-amber-300">
          {report.lootItems?.map((it) => {
            const def = ITEM_BY_ID.get(it.id);
            return def ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={it.id} src={def.img} alt={def.name} className="h-9 w-9 object-contain" />
            ) : null;
          })}
          <span>💰 {report.loot}</span>
        </div>
      )}
    </div>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function describeCell(state: PublicState, x: number, y: number) {
  const i = idx(x, y);
  const v = state.cells[i];
  const ring = ringOf(x, y);
  const poi = state.pois.find((p) =>
    p.kind === "bunker_zone"
      ? Math.abs(p.x - x) <= (p.radius ?? 3) && Math.abs(p.y - y) <= (p.radius ?? 3)
      : p.kind === "general"
        ? Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1
        : p.x === x && p.y === y,
  );
  const sig = state.signals[i];
  const what =
    WORLD.river[i] && v !== 11
      ? "river"
      : v === -1
        ? state.dogMine.has(i)
          ? "mine confirmed by the dog"
          : ring.unlockDay > state.day
            ? `behind wire (day ${ring.unlockDay})`
            : "unexplored"
        : v === 9
          ? "crater"
          : v === 10
            ? "smoke – mine count hidden"
            : v === 11
              ? "bridge"
              : v === 12
                ? "defused mine"
                : v === 13
                  ? "destroyed by a defuse blast – impassable"
                  : `${v} mine${v === 1 ? "" : "s"} around${sig > 0 ? ` · ${SIGNAL_LABEL[sig]}` : ""}`;
  return (
    <span>
      ({x}|{y}) · {TERRAIN_INFO[WORLD.terrain[i]].name} · {ring.name} · {what}
      {WORLD.smoke[i] ? " · smoke zone" : ""}
      {poi?.label ? ` · ${poi.label}` : ""}
    </span>
  );
}

function ItemTile({ stack }: { stack: ItemStack }) {
  const def = ITEM_BY_ID.get(stack.id);
  if (!def) return null;
  return (
    <li
      title={def.name}
      className={`relative flex flex-col items-center rounded border p-1 ${def.rare ? "border-purple-700 bg-purple-950/50" : "border-stone-700 bg-stone-900"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={def.img} alt={def.name} className="h-10 w-10 object-contain" />
      <span className="text-[11px] font-semibold text-stone-100">×{stack.qty}</span>
      <span className="w-full truncate text-center text-[9px] text-stone-400">{def.name}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-stone-900 px-2 py-1.5">
      <div className="text-lg font-semibold text-stone-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-stone-500">{label}</div>
    </div>
  );
}

function MapBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title?: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-9 w-9 rounded-md border text-base shadow ${
        active ? "border-red-500 bg-red-900/70" : "border-stone-700 bg-stone-950/85 hover:bg-stone-800"
      }`}
    >
      {children}
    </button>
  );
}

function DevBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded bg-fuchsia-950 px-2 py-1 text-fuchsia-200 hover:bg-fuchsia-900">
      {children}
    </button>
  );
}
