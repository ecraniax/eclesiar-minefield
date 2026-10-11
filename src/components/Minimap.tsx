"use client";

import { useEffect, useRef } from "react";
import { MAP_SIZE } from "@/lib/config";
import type { PublicState } from "@/lib/types";
import { type Camera, cellPx, drawMinimap } from "./render";

interface Props {
  state: PublicState;
  cam: Camera;
  viewport: { w: number; h: number };
  onJump: (x: number, y: number) => void;
}

const SIZE = 180;

export default function Minimap({ state, cam, viewport, onJump }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    drawMinimap(ref.current!.getContext("2d")!, state);
  }, [state]);

  const cp = cellPx(cam);
  const vw = (viewport.w / cp) * (SIZE / MAP_SIZE);
  const vh = (viewport.h / cp) * (SIZE / MAP_SIZE);
  const vx = cam.x * (SIZE / MAP_SIZE) - vw / 2;
  const vy = cam.y * (SIZE / MAP_SIZE) - vh / 2;

  const jump = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onJump(((e.clientX - r.left) / r.width) * MAP_SIZE, ((e.clientY - r.top) / r.height) * MAP_SIZE);
  };

  return (
    <div
      className="relative cursor-pointer overflow-hidden rounded border border-stone-600 bg-black touch-none"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => dragging.current && jump(e)}
      onPointerUp={() => (dragging.current = false)}
    >
      <canvas ref={ref} width={MAP_SIZE} height={MAP_SIZE} style={{ width: SIZE, height: SIZE, imageRendering: "pixelated" }} />
      <div
        className="pointer-events-none absolute border-2 border-white/80"
        style={{ left: vx, top: vy, width: vw, height: vh }}
      />
    </div>
  );
}
