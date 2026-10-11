"use client";

import { useEffect, useState } from "react";
import { EXTRA_PACKS_PER_DAY, EXTRA_STEPS_PACK, EXTRA_STEPS_PRICE_GEMS, STEPS_PER_REFILL } from "@/lib/config";
import type { PublicState } from "@/lib/types";

interface Props {
  state: PublicState;
  onBuy: () => Promise<boolean>;
  onClose: () => void;
}

/** Shown when the player runs out of steps: wait for the free refill or buy a pack to continue now. */
export default function OutOfStepsDialog({ state, onBuy, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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

  const left = state.lockedUntil !== null ? Math.max(0, state.lockedUntil - now) : 0;
  const limitReached = state.extraPacksBoughtToday >= EXTRA_PACKS_PER_DAY;
  const noGems = state.gemBalance < EXTRA_STEPS_PRICE_GEMS;
  const blocked = limitReached || noGems;

  const buy = async () => {
    setBuying(true);
    const ok = await onBuy();
    setBuying(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="reward-pop w-full max-w-sm overflow-hidden rounded-2xl border border-amber-700/60 bg-stone-950 text-center text-stone-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-5 pt-6">
          <div className="text-5xl">👣</div>
          <h2 className="mt-2 text-2xl font-extrabold text-amber-300">Out of steps</h2>
          <p className="mt-1 text-sm text-stone-400">
            Your next <b className="text-stone-200">{STEPS_PER_REFILL} free steps</b> arrive in
          </p>
          <div className="mt-1 font-mono text-3xl font-bold text-stone-100">{formatDuration(left)}</div>

          <div className="mt-5 rounded-xl border border-stone-700 bg-stone-900 p-4">
            <div className="text-sm font-semibold text-stone-200">Continue playing now?</div>
            <button
              onClick={buy}
              disabled={blocked || buying}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 py-3 text-base font-bold text-stone-950 shadow-lg transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Buy {EXTRA_STEPS_PACK} steps for {EXTRA_STEPS_PRICE_GEMS} 💎
            </button>
            <div className="mt-2 text-xs text-stone-400">
              {limitReached ? (
                <span className="text-red-300">Daily limit reached ({EXTRA_PACKS_PER_DAY}/{EXTRA_PACKS_PER_DAY}). Come back tomorrow or wait.</span>
              ) : noGems ? (
                <span className="text-red-300">Not enough gems (you have {state.gemBalance} 💎).</span>
              ) : (
                <>
                  Today {state.extraPacksBoughtToday}/{EXTRA_PACKS_PER_DAY} · balance {state.gemBalance} 💎
                </>
              )}
            </div>
          </div>

          <button onClick={onClose} className="mt-4 w-full rounded-xl border border-stone-700 py-2.5 text-sm font-semibold text-stone-300 hover:bg-stone-800">
            Wait for free steps
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
