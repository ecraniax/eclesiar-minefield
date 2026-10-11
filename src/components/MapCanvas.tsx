"use client";

import { useEffect, useRef } from "react";
import { MAP_SIZE } from "@/lib/config";
import type { PublicState, ToolId } from "@/lib/types";
import { type Camera, type DevReveal, type Flash, cellPx, drawMap } from "./render";

interface Props {
  state: PublicState;
  cam: Camera;
  setCam: (fn: (c: Camera) => Camera) => void;
  hover: { x: number; y: number } | null;
  setHover: (h: { x: number; y: number } | null) => void;
  tool: ToolId | null;
  defuseMode: boolean;
  flashes: Flash[];
  dev: DevReveal | null;
  onPrimary: (x: number, y: number) => void;
  onSecondary: (x: number, y: number) => void;
}

export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 1.5;
const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 450;

export default function MapCanvas(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const propsRef = useRef(p);
  propsRef.current = p;

  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    button: number;
    longPress: number | null;
    consumed: boolean;
  } | null>(null);

  // Canvas size
  useEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const c = canvasRef.current!;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      sizeRef.current = { w: r.width, h: r.height };
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pr = propsRef.current;
    drawMap(ctx, {
      state: pr.state,
      cam: pr.cam,
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      hover: pr.hover,
      tool: pr.tool,
      defuseMode: pr.defuseMode,
      flashes: pr.flashes,
      now: performance.now(),
      dev: pr.dev,
    });
  }

  // Continuous animation (pulsing legendary treasure, explosions)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toCell = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const { cam } = propsRef.current;
    const cp = cellPx(cam);
    const x = Math.floor((clientX - r.left - r.width / 2) / cp + cam.x);
    const y = Math.floor((clientY - r.top - r.height / 2) / cp + cam.y);
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE ? { x, y } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const d = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      button: e.button,
      longPress: null as number | null,
      consumed: false,
    };
    if (e.pointerType === "touch") {
      d.longPress = window.setTimeout(() => {
        const cell = toCell(d.startX, d.startY);
        if (cell && drag.current && !drag.current.moved) {
          drag.current.consumed = true;
          propsRef.current.onSecondary(cell.x, cell.y);
        }
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
        d.moved = true;
        if (d.longPress) clearTimeout(d.longPress);
      }
      if (d.moved) {
        const dx = e.clientX - d.lastX;
        const dy = e.clientY - d.lastY;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        propsRef.current.setCam((c) => {
          const cp = cellPx(c);
          return { ...c, x: clamp(c.x - dx / cp, 0, MAP_SIZE), y: clamp(c.y - dy / cp, 0, MAP_SIZE) };
        });
        return;
      }
    }
    if (e.pointerType === "mouse") propsRef.current.setHover(toCell(e.clientX, e.clientY));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.longPress) clearTimeout(d.longPress);
    if (d.moved || d.consumed) return;
    const cell = toCell(e.clientX, e.clientY);
    if (!cell) return;
    if (d.button === 2) propsRef.current.onSecondary(cell.x, cell.y);
    else if (d.button === 0) propsRef.current.onPrimary(cell.x, cell.y);
  };

  // Zoom around the cursor (wheel must be non-passive for preventDefault)
  useEffect(() => {
    const c = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      propsRef.current.setCam((cam) => {
        const zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const before = cellPx(cam);
        const after = cellPx({ ...cam, zoom });
        const wx = cam.x + mx / before;
        const wy = cam.y + my / before;
        return { zoom, x: wx - mx / after, y: wy - my / after };
      });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: p.tool ? "crosshair" : drag.current?.moved ? "grabbing" : "pointer" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => p.setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
