import { useState } from 'react';
import { IconAlertTriangle, IconCopy, IconCheck, IconRefresh } from './Icons';

interface MissingFramesPanelProps {
  totalExpected: number;
  receivedCount: number;
  missingFrames: number[];
  onImportMore?: () => void;
}

export function formatMissingRanges(frames: number[]): string {
  if (frames.length === 0) return 'None';
  const sorted = [...frames].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start + 1}` : `${start + 1}–${end + 1}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start + 1}` : `${start + 1}–${end + 1}`);
  return ranges.join(', ');
}

export default function MissingFramesPanel({
  totalExpected,
  receivedCount,
  missingFrames,
  onImportMore,
}: MissingFramesPanelProps) {
  const [copied, setCopied] = useState(false);

  if (missingFrames.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <IconCheck className="w-5 h-5" />
          <span>All {totalExpected} Frames Received!</span>
        </div>
        <span className="text-xs font-mono text-emerald-300">100% Complete</span>
      </div>
    );
  }

  const handleCopy = () => {
    const list = missingFrames.map((f) => f + 1).join(', ');
    navigator.clipboard.writeText(`Missing Frames (${missingFrames.length}): ${list}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-5 rounded-xl bg-amber-950/25 border border-amber-500/30 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <IconAlertTriangle className="w-5 h-5 shrink-0" />
          <span>Missing Frames Detected ({missingFrames.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="btn btn-xs bg-slate-800 border-white/10 hover:border-amber-400 text-slate-300 flex items-center gap-1.5"
          >
            {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy List'}
          </button>
          {onImportMore && (
            <button
              type="button"
              onClick={onImportMore}
              className="btn btn-xs bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 text-amber-200 flex items-center gap-1.5"
            >
              <IconRefresh className="w-3.5 h-3.5" />
              Import More
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Received</span>
          <span className="text-slate-200 font-mono font-bold">{receivedCount} / {totalExpected}</span>
        </div>
        <div className="p-2 rounded bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Missing</span>
          <span className="text-rose-400 font-mono font-bold">{missingFrames.length}</span>
        </div>
        <div className="p-2 rounded bg-slate-900/60 border border-white/5 col-span-2">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Missing Frame IDs</span>
          <span className="text-amber-300 font-mono font-bold truncate block">
            {formatMissingRanges(missingFrames)}
          </span>
        </div>
      </div>

      <div className="max-h-28 overflow-y-auto pr-1 text-xs font-mono space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-white/5">
        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Detailed Missing List:</div>
        <div className="flex flex-wrap gap-1.5">
          {missingFrames.slice(0, 50).map((idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px]"
            >
              #{String(idx + 1).padStart(4, '0')}
            </span>
          ))}
          {missingFrames.length > 50 && (
            <span className="text-slate-400 self-center text-[11px]">
              +{missingFrames.length - 50} more…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
