"use client";

import dynamic from "next/dynamic";

// The game uses localStorage (mock backend), so it only renders in the browser.
const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => <div className="flex h-dvh items-center justify-center text-stone-400">Loading the minefield…</div>,
});

export default function GameLoader() {
  return <Game />;
}
