import React from 'react';
import type { TransferMode } from '../types/transport';
import {
  IconWifi,
  IconBluetooth,
  IconBeam,
  IconQr,
  IconSliders,
  IconSparkles,
} from './Icons';

interface TransportSelectorProps {
  value: TransferMode;
  onChange: (mode: TransferMode) => void;
  fileSize?: number;
  disabled?: boolean;
}

export function getRecommendedTransport(fileSize?: number): {
  mode: TransferMode;
  reason: string;
} {
  if (!fileSize) return { mode: 'optical', reason: 'Default high-density optical link' };
  if (fileSize < 2 * 1024 * 1024) {
    return { mode: 'qr-relay', reason: 'Small file: QR or QR Image Relay is fast and flexible' };
  }
  if (fileSize < 50 * 1024 * 1024) {
    return { mode: 'optical', reason: 'Medium file: Live Optical or Wi-Fi Fast recommended' };
  }
  if (fileSize < 500 * 1024 * 1024) {
    return { mode: 'wifi', reason: 'Large file: Wi-Fi Fast or Multi-Region Optical recommended' };
  }
  return { mode: 'wifi', reason: '1 GB+: Wi-Fi Fast recommended for fastest completion' };
}

export default function TransportSelector({
  value,
  onChange,
  fileSize,
  disabled = false,
}: TransportSelectorProps) {
  const rec = getRecommendedTransport(fileSize);

  const options: Array<{
    id: TransferMode;
    label: string;
    badge?: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    {
      id: 'wifi',
      label: 'Wi-Fi Fast',
      badge: 'High Speed',
      description: 'Local peer-to-peer over Wi-Fi / Hotspot. No internet required.',
      icon: <IconWifi className="w-5 h-5" />,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      id: 'bluetooth',
      label: 'Bluetooth',
      badge: 'Native BLE',
      description: 'Direct device transfer via Web Bluetooth if platform allows.',
      icon: <IconBluetooth className="w-5 h-5" />,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    {
      id: 'optical',
      label: 'Live Optical',
      badge: 'Air-Gapped',
      description: 'Screen to camera. No Wi-Fi, No Bluetooth, Zero radios.',
      icon: <IconBeam className="w-5 h-5" />,
      color: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    {
      id: 'qr-relay',
      label: 'QR Image Relay',
      badge: 'Store & Forward',
      description: 'Export QR images or ZIP package to share via apps / email.',
      icon: <IconQr className="w-5 h-5" />,
      color: 'text-purple-700 bg-purple-50 border-purple-200',
    },
    {
      id: 'automatic',
      label: 'Automatic',
      badge: 'Smart Selection',
      description: 'Detects best available local transport automatically.',
      icon: <IconSliders className="w-5 h-5" />,
      color: 'text-sky-700 bg-sky-50 border-sky-200',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Transfer Method
        </label>
        {fileSize !== undefined && (
          <span className="flex items-center gap-1 text-[11px] text-blue-600 font-semibold">
            <IconSparkles className="w-3 h-3" />
            {rec.reason}
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {options.map((opt) => {
          const isSelected = value === opt.id;
          const isRec = rec.mode === opt.id && value !== opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-50/80 border-blue-600 shadow-sm ring-1 ring-blue-500/30'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start justify-between w-full mb-2">
                <div className={`p-2 rounded-lg border ${opt.color}`}>
                  {opt.icon}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {opt.badge && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
                      {opt.badge}
                    </span>
                  )}
                  {isRec && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-bold">
                      Recommended
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  {opt.label}
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
