// Custom icons (SVG for the UI, canvas versions for the map).

/** Defuse icon: an anti-tank landmine with a screwdriver in its pressure plate. */
export function DefuseIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle" }}>
      {/* shadow */}
      <ellipse cx="30" cy="52" rx="24" ry="5" fill="rgba(0,0,0,0.35)" />
      {/* mine body (side + top) */}
      <path d="M6 40 v6 a24 9 0 0 0 48 0 v-6 z" fill="#3f4a24" />
      <ellipse cx="30" cy="40" rx="24" ry="9" fill="#5f6f34" stroke="#2b3318" strokeWidth="1.5" />
      {/* rivets */}
      {[-18, -9, 0, 9, 18].map((dx) => (
        <circle key={dx} cx={30 + dx} cy={40 + (Math.abs(dx) > 10 ? 2.5 : 5.5)} r="1.3" fill="#2b3318" />
      ))}
      {/* pressure plate */}
      <ellipse cx="30" cy="38" rx="10" ry="4" fill="#8a9a52" stroke="#2b3318" strokeWidth="1.2" />
      <ellipse cx="30" cy="37.2" rx="5" ry="1.8" fill="#a7b56a" />
      {/* screwdriver: shaft + handle */}
      <line x1="31" y1="37" x2="44" y2="20" stroke="#cbd5e1" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="31" y1="37" x2="44" y2="20" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      <rect x="40" y="6" width="8" height="17" rx="3" transform="rotate(37 44 14)" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.2" />
      <rect x="42.2" y="8" width="1.6" height="12" rx="0.8" transform="rotate(37 44 14)" fill="#fca5a5" />
    </svg>
  );
}

/** Canvas version of the landmine, centred at (cx, cy) with the given width. */
export function drawLandmine(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number) {
  const rx = w / 2;
  const ry = w * 0.19;
  // body side
  ctx.fillStyle = "#3f4a24";
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.6, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // top
  ctx.fillStyle = "#5f6f34";
  ctx.strokeStyle = "#2b3318";
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // pressure plate
  ctx.fillStyle = "#8a9a52";
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.15, rx * 0.42, ry * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Defused mine on the map: a landmine with a green check badge. */
export function drawDefusedMine(ctx: CanvasRenderingContext2D, sx: number, sy: number, cp: number) {
  drawLandmine(ctx, sx + cp / 2, sy + cp * 0.55, cp * 0.62);
  const r = cp * 0.13;
  const bx = sx + cp * 0.74;
  const by = sy + cp * 0.3;
  ctx.fillStyle = "#16a34a";
  ctx.strokeStyle = "#f0fdf4";
  ctx.lineWidth = Math.max(1, cp * 0.02);
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, cp * 0.035);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx - r * 0.5, by);
  ctx.lineTo(bx - r * 0.1, by + r * 0.4);
  ctx.lineTo(bx + r * 0.5, by - r * 0.4);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
}
