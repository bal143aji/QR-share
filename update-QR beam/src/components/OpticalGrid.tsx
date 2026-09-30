/** Schematic of the fixed region layout (region 0 = top-left ...). */
export default function OpticalGrid({ gx, gy }: { gx: number; gy: number }) {
  const cells = [];
  for (let i = 0; i < gx * gy; i++) {
    cells.push(
      <div
        key={i}
        className="flex items-center justify-center text-xs font-mono font-bold rounded-md bg-indigo-950/60 border border-indigo-500/40 text-cyan-300 shadow-sm"
        style={{ minHeight: 28 }}
      >
        {i}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${gx} by ${gy} region grid schematic`}
      className="grid gap-1.5 p-2 rounded-xl bg-slate-900/80 border border-white/10 shadow-inner"
      style={{ gridTemplateColumns: `repeat(${gx}, 1fr)`, width: 130 }}
    >
      {cells}
    </div>
  );
}
