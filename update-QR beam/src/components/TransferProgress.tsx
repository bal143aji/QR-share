interface TransferProgressProps {
  value: number;
  label: string;
  sublabel?: string;
}

export default function TransferProgress({ value, label, sublabel }: TransferProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-800 flex items-center gap-2">
          {label}
        </span>
        <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-xs">
          {pct.toFixed(1)}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-3 w-full rounded-full overflow-hidden bg-slate-100 border border-slate-200 p-[1px] shadow-inner"
      >
        <div
          className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 shadow-sm"
          style={{ width: `${pct}%` }}
        />
      </div>

      {sublabel && (
        <div className="text-xs text-slate-500 text-right font-medium">
          {sublabel}
        </div>
      )}
    </div>
  );
}
