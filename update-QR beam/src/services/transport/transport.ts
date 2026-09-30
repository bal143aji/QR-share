/**
 * QRBeam Transport Abstraction Layer
 *
 * All transfer transports implement TransferTransport.
 * This file is ADDITIVE and does not modify the existing optical protocol.
 */

import type { TransportCapabilities, TransportStatus, TransferTransport } from '../../types/transport';

export type { TransferTransport };

/** Detect available transport capabilities in the current browser environment. */
export async function detectTransportCapabilities(): Promise<TransportCapabilities> {
  const wifi = typeof WebSocket !== 'undefined' || typeof RTCPeerConnection !== 'undefined';
  const bluetooth =
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    typeof (navigator as any).bluetooth?.getAvailability === 'function'
      ? await (navigator as any).bluetooth.getAvailability().catch(() => false)
      : false;
  const optical = true; // always available (screen + camera)
  const qrRelay = true; // always available (QR image generation + import)

  return { wifi, bluetooth, optical, qrRelay };
}

/** Choose the best available transport for automatic mode. */
export function chooseBestTransport(caps: TransportCapabilities): 'wifi' | 'bluetooth' | 'optical' {
  if (caps.wifi) return 'wifi';
  if (caps.bluetooth) return 'bluetooth';
  return 'optical';
}

/** Human-readable label for each transport mode. */
export function transportLabel(mode: string): string {
  switch (mode) {
    case 'wifi': return '⚡ Wi-Fi Local';
    case 'bluetooth': return '🟦 Bluetooth';
    case 'optical': return '🔴 Live Optical';
    case 'qr-relay': return '🖼 QR Image Relay';
    case 'automatic': return '⚙ Automatic';
    default: return mode;
  }
}

/** Transport status message. */
export function transportStatusMessage(status: TransportStatus): string {
  switch (status) {
    case 'available': return 'Available';
    case 'unavailable': return 'Unavailable on this platform';
    case 'connecting': return 'Connecting…';
    case 'connected': return 'Connected ✓';
    case 'transferring': return 'Transferring…';
    case 'completed': return 'Transfer Complete';
    case 'error': return 'Error';
    default: return status;
  }
}

export type { TransportCapabilities, TransportStatus };
