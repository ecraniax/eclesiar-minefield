"use client";

import { useEffect, useMemo } from "react";
import { TOOL_INFO } from "@/lib/config";
import { ITEM_BY_ID } from "@/lib/items";
import type { RewardEvent, RewardKind, ToolId } from "@/lib/types";

const HEADLINE: Record<RewardKind, { title: string; emoji: string; color: string }> = {
  treasure: { title: "Treasure found!", emoji: "💰", color: "from-amber-400 to-yellow-200" },
  bunker: { title: "Bunker stash!", emoji: "🏚️", color: "from-orange-400 to-amber-200" },
  outpost: { title: "Outpost secured!", emoji: "🏕️", color: "from-emerald-400 to-lime-200" },
  legendary: { title: "LEGENDARY treasure!", emoji: "⭐", color: "from-fuchsia-400 to-amber-200" },
  general: { title: "General's Bunker reached!", emoji: "🏰", color: "from-red-400 to-amber-200" },
};

const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#facc15", "#ec4899", "#14b8a6"];

interface Props {
  event: RewardEvent;
  /** Position in the reward queue (shown as "1 / 3"). */
  position: number;
  total: number;
  onConfirm: () => void;
}

export default function RewardDialog({ event, position, total, onConfirm }: Props) {
  const h = HEADLINE[event.kind];
  const r = event.reward;
  const big = event.kind === "legendary" || event.kind === "general";

  // Confetti: random positions, colours, delays (stable for this dialog)
  const confetti = useMemo(
    () =>
      Array.from({ length: big ? 140 : 80 }, (_, n) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.8 + Math.random() * 1.6,
        color: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
        round: Math.random() < 0.35,
        drift: (Math.random() - 0.5) * 160,
      })),
    // a new burst of confetti for each reward
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event],
  );

  // Enter / Space confirms
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm]);

  const tools = Object.entries(r.tools ?? {}).filter(([, n]) => (n ?? 0) > 0) as [ToolId, number][];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((c, n) => (
          <span
            key={n}
            className="confetti-piece absolute top-0"
            style={
              {
                left: `${c.left}%`,
                width: c.size,
                height: c.round ? c.size : c.size * 0.45,
                background: c.color,
                borderRadius: c.round ? "50%" : 2,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                "--drift": `${c.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="reward-pop relative w-full max-w-sm overflow-hidden rounded-2xl border border-amber-500/60 bg-stone-950 text-center shadow-[0_0_60px_rgba(245,158,11,0.35)]">
        {/* Glow behind the header */}
        <div className="reward-rays pointer-events-none absolute left-1/2 top-16 h-72 w-72 rounded-full" />

        <div className="relative px-6 pb-5 pt-6">
          <div className="reward-bounce text-5xl">{h.emoji}</div>
          <h2 className={`mt-2 bg-gradient-to-r ${h.color} bg-clip-text text-2xl font-extrabold tracking-wide text-transparent`}>
            {h.title}
          </h2>
          <p className="mt-1 text-xs text-stone-400">{event.source}</p>

          {/* Items */}
          {r.items && r.items.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {r.items.map((it, n) => {
                const def = ITEM_BY_ID.get(it.id);
                if (!def) return null;
                return (
                  <div
                    key={it.id}
                    className={`reward-item flex w-24 flex-col items-center rounded-xl border p-2 ${
                      def.rare ? "border-purple-500 bg-purple-950/60" : "border-stone-600 bg-stone-900"
                    }`}
                    style={{ animationDelay: `${0.15 + n * 0.12}s` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={def.img} alt={def.name} className="h-16 w-16 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]" />
                    <div className="mt-1 text-lg font-bold text-amber-300">×{it.qty}</div>
                    <div className="text-[11px] leading-tight text-stone-300">{def.name}</div>
                    {def.rare && <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-300">rare</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Everything else */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {r.gold ? <Chip>🪙 {r.gold} gold</Chip> : null}
            {r.steps ? <Chip>👣 +{r.steps} steps</Chip> : null}
            {tools.map(([t, n]) => (
              <Chip key={t}>
                {TOOL_INFO[t].icon} {n}× {TOOL_INFO[t].name}
              </Chip>
            ))}
            {r.title ? <Chip highlight>🎖️ Title “{r.title}”</Chip> : null}
          </div>

          <button
            autoFocus
            onClick={onConfirm}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-3 text-base font-bold text-stone-950 shadow-lg transition hover:brightness-110 active:scale-[0.98]"
          >
            Confirm
          </button>
          {total > 1 && (
            <div className="mt-2 text-xs text-stone-500">
              {position} / {total}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 ${highlight ? "bg-amber-600/70 text-amber-50" : "bg-stone-800 text-stone-200"}`}>{children}</span>
  );
}
