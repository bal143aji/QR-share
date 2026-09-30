import type { TransferMode, TransportStatus as TStatus } from '../types/transport';
import {
  IconWifi,
  IconBluetooth,
  IconBeam,
  IconQr,
  IconSliders,
  IconInfo,
  IconAlertCircle,
} from './Icons';

interface TransportStatusProps {
  mode: TransferMode;
  status?: TStatus;
  detail?: string;
  isOpticalOnlyExplicit?: boolean;
}

export default function TransportStatus({
  mode,
  status = 'available',
  detail,
  isOpticalOnlyExplicit = false,
}: TransportStatusProps) {
  if (isOpticalOnlyExplicit || mode === 'optical') {
    return (
      <div className="panel p-4 rounded-xl border border-rose-200 bg-rose-50/70 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-rose-700">
            <IconBeam className="w-4 h-4" />
            OPTICAL ONLY MODE
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 font-semibold">
            Air-Gapped Active
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[9px] uppercase font-bold">Wi-Fi</span>
            <span className="text-slate-700 font-mono font-medium">Ignored</span>
          </div>
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[9px] uppercase font-bold">Bluetooth</span>
            <span className="text-slate-700 font-mono font-medium">Ignored</span>
          </div>
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[9px] uppercase font-bold">Internet</span>
            <span className="text-emerald-700 font-mono font-bold">Not Used</span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'wifi') {
    return (
      <div className="panel p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-amber-800">
            <IconWifi className="w-4 h-4" />
            WI-FI FAST LOCAL LINK
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
            {status === 'connected' ? 'Connected ✓' : status === 'connecting' ? 'Connecting…' : 'Local P2P'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-[11px] pt-1">
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[9px] uppercase font-bold">Network</span>
            <span className="text-slate-700 font-mono font-medium">Local Network / Hotspot</span>
          </div>
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[9px] uppercase font-bold">Internet</span>
            <span className="text-emerald-700 font-mono font-bold">Not Required</span>
          </div>
        </div>
        {detail && <div className="text-xs text-amber-900 font-mono">{detail}</div>}
      </div>
    );
  }

  if (mode === 'bluetooth') {
    const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    return (
      <div className="panel p-4 rounded-xl border border-blue-200 bg-blue-50/70 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-blue-700">
            <IconBluetooth className="w-4 h-4" />
            BLUETOOTH LINK
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-semibold">
            {isSupported ? 'Available (BLE)' : 'Unavailable on this platform'}
          </span>
        </div>
        <div className="text-xs text-slate-700 leading-relaxed">
          {isSupported ? (
            <p className="m-0">
              Web Bluetooth is available for GATT peripherals. For arbitrary device-to-device file transfer, use Wi-Fi Fast or Live Optical.
            </p>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-800 text-xs">
              <IconAlertCircle className="w-4 h-4 shrink-0" />
              <span>Direct Web Bluetooth is not supported by this browser engine.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'qr-relay') {
    return (
      <div className="panel p-4 rounded-xl border border-purple-200 bg-purple-50/70 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-purple-700">
            <IconQr className="w-4 h-4" />
            QR IMAGE RELAY · STORE-AND-FORWARD
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-semibold">
            Batch Exporter Active
          </span>
        </div>
        <div className="flex items-start gap-2 p-2 rounded-lg bg-white border border-purple-200 text-xs text-purple-900 shadow-2xs">
          <IconInfo className="w-4 h-4 shrink-0 text-purple-600 mt-0.5" />
          <span>
            <strong>For best reliability:</strong> Send QR images as original uncompressed files/documents (not compressed previews) via messaging apps.
          </span>
        </div>
      </div>
    );
  }

  // Automatic
  return (
    <div className="panel p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <IconSliders className="w-4 h-4 text-sky-600" />
        <span className="font-bold text-sky-900">Automatic Mode Active</span>
      </div>
      <span className="text-slate-600">Selects fastest available link</span>
    </div>
  );
}
