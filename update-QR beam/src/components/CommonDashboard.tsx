import type { TransportDashboard, TransferMode } from '../types/transport';
import {
  IconWifi,
  IconBluetooth,
  IconBeam,
  IconQr,
  IconSliders,
  IconShieldCheck,
  IconActivity,
  IconCpu,
} from './Icons';
import { fmtBytes, fmtSec } from '../utils/format';

interface CommonDashboardProps {
  data: TransportDashboard;
  onCancel?: () => void;
}

export function getTransportBadge(mode: TransferMode, detail?: string) {
  switch (mode) {
    case 'wifi':
      return {
        label: '⚡ Wi-Fi Local',
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        icon: <IconWifi className="w-4 h-4" />,
      };
    case 'bluetooth':
      return {
        label: '🟦 Bluetooth',
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        icon: <IconBluetooth className="w-4 h-4" />,
      };
    case 'optical':
      return {
        label: detail ? `🔴 Live Optical • ${detail}` : '🔴 Live Optical',
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
        icon: <IconBeam className="w-4 h-4" />,
      };
    case 'qr-relay':
      return {
        label: '🖼 QR Image Relay',
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
        icon: <IconQr className="w-4 h-4" />,
      };
    case 'automatic':
    default:
      return {
        label: '⚙ Automatic',
        color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
        icon: <IconSliders className="w-4 h-4" />,
      };
  }
}

export default function CommonDashboard({ data, onCancel }: CommonDashboardProps) {
  const badge = getTransportBadge(data.transport);
  const percent = Math.min(100, Math.max(0, Math.round(data.progress * 100)));

  return (
    <div className="panel p-6 space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold font-mono ${badge.color}`}>
              {badge.icon}
              {badge.label}
            </span>
            {data.integrityVerified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <IconShieldCheck className="w-3.5 h-3.5" />
                SHA-256 Verified
              </span>
            )}
          </div>
          {data.file && (
            <div className="text-white font-bold text-base truncate pt-1">{data.file}</div>
          )}
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-xs bg-slate-800 border-white/10 hover:border-rose-500/50 hover:text-rose-400 text-slate-400 self-start sm:self-center"
          >
            Cancel Transfer
          </button>
        )}
      </div>

      {/* Main Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400">Transfer Progress</span>
          <span className="font-mono text-cyan-400 font-bold text-sm">{percent}%</span>
        </div>
        <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-white/5">
          <div
            className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-full transition-all duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Grid of Measured Transfer Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Transferred</span>
          <span className="text-slate-200 font-mono font-bold mt-0.5 block">
            {fmtBytes(data.transferred)} / {fmtBytes(data.total)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Speed</span>
          <span className="text-cyan-400 font-mono font-bold mt-0.5 block flex items-center gap-1">
            <IconActivity className="w-3.5 h-3.5" />
            {data.speed ? `${fmtBytes(data.speed)}/s` : '—'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Est. Remaining</span>
          <span className="text-slate-200 font-mono mt-0.5 block">
            {data.etaSec !== undefined ? fmtSec(data.etaSec) : '—'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Packets / Frames</span>
          <span className="text-slate-200 font-mono mt-0.5 block">
            {data.packets ?? 0}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Valid Packets</span>
          <span className="text-emerald-400 font-mono font-bold mt-0.5 block">
            {data.validPackets ?? data.packets ?? 0}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Duplicates</span>
          <span className="text-amber-400 font-mono font-bold mt-0.5 block">
            {data.duplicates ?? 0}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">FEC Recovered</span>
          <span className="text-indigo-400 font-mono mt-0.5 block flex items-center gap-1">
            <IconCpu className="w-3.5 h-3.5" />
            {data.recovered ?? 0}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Error Rate</span>
          <span className="text-slate-300 font-mono mt-0.5 block">
            {data.errorRate !== undefined ? `${(data.errorRate * 100).toFixed(1)}%` : '0.0%'}
          </span>
        </div>
      </div>
    </div>
  );
}
