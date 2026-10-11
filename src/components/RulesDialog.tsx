"use client";

import { useEffect, useRef } from "react";
import {
  DEFUSE_BLAST_RADIUS,
  EVENT_DAYS,
  EXTRA_PACKS_PER_DAY,
  EXTRA_STEPS_PACK,
  EXTRA_STEPS_PRICE_GEMS,
  LOCKOUT_MS,
  RINGS,
  SIGNAL_RANGE,
  SIGNAL_STRONG,
  STARTING_TOOLS,
  STEPS_PER_REFILL,
  TOOL_DROP_WEIGHTS,
  TOOL_INFO,
  TREASURE_BONUS_STEPS,
  TREASURE_BONUS_STEPS_CHANCE,
  TREASURE_BONUS_TOOL_CHANCE,
} from "@/lib/config";
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
  type ItemStack,
} from "@/lib/items";
import type { ToolId } from "@/lib/types";
import { TERRAIN_INFO } from "@/lib/world";
import { DefuseIcon } from "./icons";

const SECTIONS = [
  { id: "goal", label: "🎯 Goal" },
  { id: "moving", label: "🕹️ Moving" },
  { id: "cells", label: "🔢 Cells" },
  { id: "defuse", label: "💣 Defuse" },
  { id: "lockout", label: "🔒 Lockout" },
  { id: "steps", label: "👣 Steps" },
  { id: "map", label: "🗺️ Map" },
  { id: "tools", label: "🧰 Tools" },
  { id: "rewards", label: "🎁 Rewards" },
  { id: "tips", label: "💡 Tips" },
];

const hours = Math.round(LOCKOUT_MS / 3_600_000);
const hoursText = `${hours} ${hours === 1 ? "hour" : "hours"}`;
const blast = DEFUSE_BLAST_RADIUS * 2 + 1;

export default function RulesDialog({ onClose }: { onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);

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

  const jump = (id: string) => body.current?.querySelector(`#rules-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-6" onClick={onClose}>
      <div
        className="reward-pop flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 text-stone-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-gradient-to-r from-stone-900 to-stone-950 px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Operation Minefield</div>
            <h2 className="text-xl font-bold">📖 Rules</h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex shrink-0 flex-wrap gap-1 border-b border-stone-800 px-3 py-2 text-xs">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => jump(s.id)} className="shrink-0 rounded-full bg-stone-900 px-3 py-1 hover:bg-stone-800">
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div ref={body} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
          <Section id="goal" title="🎯 Goal">
            <p>
              Guide your soldier 💂 through a huge minefield, <b>find hidden treasure</b> and reach the <b>🏰 General&apos;s Bunker</b> at the
              far edge of the map. The event lasts <b>{EVENT_DAYS} days</b>. Only the most careful and persistent sappers will make it.
            </p>
          </Section>

          <Section id="moving" title="🕹️ Moving">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Move with <Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> or the arrow keys, diagonally with <Key>Q</Key> <Key>E</Key>{" "}
                <Key>Z</Key> <Key>C</Key> – or click a highlighted cell next to your soldier.
              </li>
              <li>
                You can only enter a <b>new cell right next to your soldier</b>. No jumping across the map.
              </li>
              <li>
                Stepping onto a new cell costs <b>1 step 👣</b>. Walking over cells you already explored is <b>free</b> – just click one and
                your soldier walks there.
              </li>
              <li>Drag the map to look around, scroll to zoom, <Key>Space</Key> to centre on your soldier.</li>
            </ul>
          </Section>

          <Section id="cells" title="🔢 What a cell tells you">
            <p>Every new cell you step on shows a report:</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Card title="💣 Mines around">
                The number of mines touching the cell – all <b>8 neighbours</b>, including diagonals. <b>0</b> means all neighbours are safe.
              </Card>
              <Card title="📡 Treasure signal">
                <b className="text-red-400">Strong</b> = treasure within {SIGNAL_STRONG} cells, <b className="text-yellow-400">weak</b> = within{" "}
                {SIGNAL_RANGE} cells. It never tells the direction – the bars stay on explored cells so you can work it out.
              </Card>
            </div>

            <div className="mt-3 flex flex-col items-center gap-4 rounded-lg border border-stone-800 bg-stone-900 p-3 sm:flex-row sm:items-start">
              <NeighbourGrid />
              <div className="space-y-1.5 text-stone-300">
                <p>
                  <b>Example:</b> you stand on a cell showing <b className="text-green-400">2</b>. That means exactly <b>2 of the 8 cells</b>{" "}
                  around you hold a mine – but not which ones.
                </p>
                <p>Find out which by comparing the numbers of neighbouring explored cells. A neighbour showing 0 has no mines around it, so none of its neighbours can be a mine.</p>
                <p>
                  <b>Defused mines still count.</b> A number never changes once it is shown – if one of the 2 mines is already defused, the
                  cell still shows 2 and only 1 live mine is left.
                </p>
              </div>
            </div>
          </Section>

          <Section id="defuse" title="💣 Defuse">
            <p>
              Think a mine is next to you? Press <Key>X</Key> (or the <DefuseIcon size={18} /> button) and click that cell. Defusing is <b>free</b> – it costs no step.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Card title="✅ There was a mine" tone="good">
                The mine is defused and the cell becomes safe to walk on – an explored cell that cost you no step.
              </Card>
              <Card title="💥 There was no mine" tone="bad">
                The charge explodes: every unexplored cell in a {blast}×{blast} area turns to rubble, <b>all treasure there is destroyed</b>{" "}
                (legendary too) and you are locked out for {hoursText}.
              </Card>
            </div>
          </Section>

          <Section id="lockout" title="🔒 Lockout">
            <p>
              For <b>{hoursText}</b> you can&apos;t play when you:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <b>step on a mine</b> – it leaves a crater and destroys hidden treasure within 2 cells,
              </li>
              <li>
                <b>defuse a cell without a mine</b>,
              </li>
              <li>
                <b>run out of steps</b> – after the lockout you get <b>{STEPS_PER_REFILL} new steps</b>.
              </li>
            </ul>
            <p className="mt-1 text-stone-400">An armed 🛡️ flak vest saves you from one mine lockout.</p>
          </Section>

          <Section id="steps" title="👣 Steps">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                You start with <b>{STEPS_PER_REFILL} steps</b>. When they run out you rest for {hoursText} and get {STEPS_PER_REFILL} more.
              </li>
              <li>
                Only stepping onto a <b>new</b> cell costs a step. Walking over explored cells and <b>defusing are free</b>.
              </li>
              <li>
                Out of steps? A dialog lets you <b>continue right away</b>: buy <b>{EXTRA_STEPS_PACK} steps for {EXTRA_STEPS_PRICE_GEMS} 💎
                gems</b> (up to <b>{EXTRA_PACKS_PER_DAY}×</b> per day). Buying ends the out-of-steps lockout immediately. You can also buy
                before you run out. Buying is not possible during a mine or wrong-defuse lockout.
              </li>
              <li>Some treasures and every outpost 🏕️ give extra steps.</li>
            </ul>
          </Section>

          <Section id="map" title="🗺️ Map & sectors">
            <p>The map has 4 sectors around the base camp ⛺. Each one is more dangerous and opens later:</p>
            <div className="mt-2 overflow-hidden rounded-lg border border-stone-800">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-stone-900 text-stone-400">
                  <tr>
                    <th className="px-3 py-1.5">Sector</th>
                    <th className="px-3 py-1.5">Mines</th>
                    <th className="px-3 py-1.5">Rare items</th>
                    <th className="px-3 py-1.5">Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {RINGS.map((r) => (
                    <tr key={r.id} className="border-t border-stone-800">
                      <td className="px-3 py-1.5">
                        <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: r.fog }} />
                        {r.id}. {TERRAIN_INFO[r.terrain].name}
                      </td>
                      <td className="px-3 py-1.5">{Math.round(r.mineDensity * 100)} %</td>
                      <td className="px-3 py-1.5">{Math.round(RARE_CHANCE_BY_RING[r.id - 1] * 100)} %</td>
                      <td className="px-3 py-1.5">day {r.unlockDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Barbed wire</b> keeps you out of a sector until its day comes.
              </li>
              <li>
                <b>🌊 Rivers</b> can only be crossed at a ford (gap) or with a 🌉 bridge.
              </li>
              <li>
                <b>🏚️ Abandoned bunkers</b> (red dashed squares) are packed with mines but hide a big stash.
              </li>
              <li>
                <b>🌫️ Smoke zones</b> hide the mine count until you also explore a side neighbour.
              </li>
            </ul>
          </Section>

          <Section id="tools" title="🧰 Tools">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.values(TOOL_INFO).map((t) => (
                <div key={t.name} className="flex gap-3 rounded-lg bg-stone-900 p-2">
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-stone-400">{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-stone-400">
              Select a tool, then click a cell (the vest is armed straight away). Every tool is <b>used up</b> after one use.
            </p>

            <h4 className="mt-4 font-semibold text-amber-300">How to get tools</h4>
            <p className="text-stone-400">Tools can&apos;t be bought – you find them while exploring.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Card title="🎒 Starting kit">
                {(Object.entries(STARTING_TOOLS) as [ToolId, number][])
                  .filter(([, n]) => n > 0)
                  .map(([t, n]) => `${n}× ${TOOL_INFO[t].icon} ${TOOL_INFO[t].name}`)
                  .join(", ")}
                .
              </Card>
              <Card title="💰 Treasure">
                <b>{Math.round(TREASURE_BONUS_TOOL_CHANCE * 100)} %</b> chance of a bonus random tool on top of the item (otherwise{" "}
                {Math.round(TREASURE_BONUS_STEPS_CHANCE * 100)} % chance of +{TREASURE_BONUS_STEPS} steps).
              </Card>
              <Card title="🏚️ Abandoned bunker stash">
                Always <b>1 random tool + 1 🌉 bridge</b> – the most reliable way to get a bridge.
              </Card>
              <Card title="🏕️ Outpost">
                Always <b>1 🛸 recon drone</b> (each of the 8 outposts once).
              </Card>
            </div>

            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-stone-400">Random tool odds</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {(() => {
                const entries = Object.entries(TOOL_DROP_WEIGHTS) as [ToolId, number][];
                const total = entries.reduce((a, [, w]) => a + w, 0);
                return entries.map(([t, w]) => (
                  <span key={t} className="rounded-full bg-stone-900 px-3 py-1 text-xs">
                    {TOOL_INFO[t].icon} {TOOL_INFO[t].name} <b className="text-amber-300">{Math.round((w / total) * 100)} %</b>
                  </span>
                ));
              })()}
            </div>
          </Section>

          <Section id="rewards" title="🎁 Rewards">
            <h4 className="font-semibold text-amber-300">💰 Treasure</h4>
            <p>
              Each treasure holds one item – a <b>common</b> item in larger amounts or a <b>rare</b> item (1–3 pcs). The further from base
              camp, the higher the rare chance. Sometimes there&apos;s a bonus tool or 5 steps.
            </p>
            <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Common</div>
            <ItemGrid items={COMMON_ITEMS.map((i) => ({ id: i.id, label: `${i.min}–${i.max}` }))} />
            <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-purple-300">Rare</div>
            <ItemGrid items={RARE_ITEMS.map((i) => ({ id: i.id, label: `${i.min}–${i.max}` }))} />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Card title="🏚️ Abandoned bunker stash">10–25 gold, 1 rare item, a double pile of a common item, a tool and a 🌉 bridge.</Card>
              <Card title="🏕️ Outpost">
                +{OUTPOST_STEPS} steps and a 🛸 recon drone.
              </Card>
            </div>

            <h4 className="mt-4 font-semibold text-amber-300">⭐ Legendary treasures</h4>
            <p>
              Five stars are visible on the map. Each gives <b>{LEGENDARY_GOLD} gold</b> and two rare items. The first player on the server
              to reach a star also earns the title <b>“Trailblazer”</b>.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LEGENDARY_ITEMS.map((items, n) => (
                <div key={n} className="flex items-center gap-2 rounded-lg bg-stone-900 p-2">
                  <span className="w-8 text-center text-lg">⭐{n + 1}</span>
                  <ItemRow items={items} />
                </div>
              ))}
            </div>

            <h4 className="mt-4 font-semibold text-amber-300">🏰 General&apos;s Bunker</h4>
            <div className="mt-1 flex flex-wrap items-center gap-3 rounded-lg border border-amber-700/60 bg-amber-950/30 p-3">
              <span>
                <b>{GENERAL_GOLD} gold</b> +
              </span>
              <ItemRow items={GENERAL_ITEMS} />
              <span>
                + title <b>“Master Sapper”</b>
              </span>
            </div>
            <p className="mt-1 text-stone-400">Every player who reaches the bunker gets the same reward.</p>
          </Section>

          <Section id="tips" title="💡 Tips">
            <ul className="list-disc space-y-1 pl-5">
              <li>A cell showing 0 means all 8 neighbours are safe – a free path forward.</li>
              <li>Compare numbers of neighbouring cells to find out exactly where the mines are before you step or defuse.</li>
              <li>Follow the signal bars: walk where the signal gets stronger, but never rush into a cell you aren&apos;t sure about.</li>
              <li>Save your 🐕 dog and 🛡️ vest for the dangerous outer sectors.</li>
              <li>A wrong defuse destroys treasure nearby – only defuse when you are sure.</li>
            </ul>
          </Section>
        </div>

        <div className="shrink-0 border-t border-stone-800 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 font-bold text-stone-950 hover:brightness-110"
          >
            Got it – let&apos;s go!
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`rules-${id}`} className="scroll-mt-2">
      <h3 className="mb-2 border-b border-stone-800 pb-1 text-base font-bold text-stone-100">{title}</h3>
      {children}
    </section>
  );
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "good" | "bad" }) {
  const cls =
    tone === "good" ? "border-emerald-800 bg-emerald-950/40" : tone === "bad" ? "border-red-800 bg-red-950/40" : "border-stone-800 bg-stone-900";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="mb-1 font-semibold">{title}</div>
      <div className="text-stone-300">{children}</div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-stone-600 bg-stone-800 px-1.5 py-0.5 font-mono text-[11px] text-stone-100 shadow-[0_1px_0_#57534e]">
      {children}
    </kbd>
  );
}

function ItemGrid({ items }: { items: { id: string; label: string }[] }) {
  return (
    <div className="mt-1 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {items.map(({ id, label }) => {
        const def = ITEM_BY_ID.get(id);
        if (!def) return null;
        return (
          <div
            key={id}
            title={def.name}
            className={`flex flex-col items-center rounded-lg border p-1.5 ${def.rare ? "border-purple-800 bg-purple-950/40" : "border-stone-800 bg-stone-900"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={def.img} alt={def.name} className="h-10 w-10 object-contain" />
            <div className="w-full truncate text-center text-[10px] text-stone-300">{def.name}</div>
            <div className="text-[11px] font-semibold text-amber-300">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ items }: { items: ItemStack[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const def = ITEM_BY_ID.get(it.id);
        if (!def) return null;
        return (
          <span key={it.id} className="flex items-center gap-1 rounded-md bg-stone-950/60 px-1.5 py-0.5 text-xs" title={def.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={def.img} alt="" className="h-6 w-6 object-contain" />
            {it.qty}× {def.name}
          </span>
        );
      })}
    </div>
  );
}

/** 3×3 illustration: the soldier in the middle and the 8 neighbours that are counted. */
function NeighbourGrid() {
  const cells = ["↖", "↑", "↗", "←", "", "→", "↙", "↓", "↘"];
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1">
      {cells.map((c, n) =>
        n === 4 ? (
          <div key={n} className="flex h-12 w-12 flex-col items-center justify-center rounded-md border-2 border-amber-500 bg-stone-200 text-stone-900">
            <span className="text-xs leading-none">💂</span>
            <span className="text-lg font-bold leading-none text-green-700">2</span>
          </div>
        ) : (
          <div key={n} className="flex h-12 w-12 items-center justify-center rounded-md border border-lime-700/60 bg-lime-900/40 text-lg text-lime-200">
            {c}
          </div>
        ),
      )}
    </div>
  );
}
