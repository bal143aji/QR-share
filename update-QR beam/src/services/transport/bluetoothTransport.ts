/**
 * Bluetooth Transport Adapter
 *
 * IMPORTANT: Web Bluetooth API (navigator.bluetooth) allows communication
 * with BLE peripheral devices but does NOT support arbitrary file transfer
 * between two browsers/PWAs acting as equals.
 *
 * Browsers can act as a BLE Central (scanner/initiator) but NOT as a
 * BLE Peripheral (advertiser/server) without native app support.
 *
 * This adapter:
 * - Honestly detects Web Bluetooth availability
 * - Documents the limitation clearly
 * - Does NOT simulate fake transfer
 * - Provides the integration point for future native/Electron builds
 * - Recommends Wi-Fi transfer or QR Relay as alternatives
 */

import type { TransferTransport, TransportCapabilities } from '../../types/transport';

export type BluetoothAvailability =
  | 'checking'
  | 'available' // Web Bluetooth is available (BLE Central operations)
  | 'unavailable' // No Bluetooth API at all
  | 'pwa-limited'; // Web Bluetooth exists but peer-to-peer PWA file transfer requires native support

export interface BluetoothTransportInfo {
  availability: BluetoothAvailability;
  reason: string;
  recommendation: string;
}

/**
 * Check real Web Bluetooth availability and explain limitations honestly.
 */
export async function checkBluetoothAvailability(): Promise<BluetoothTransportInfo> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return {
      availability: 'unavailable',
      reason: 'Web Bluetooth API is not available in this browser.',
      recommendation: 'Use Chrome on Android/Windows, or use Wi-Fi or QR Image Relay instead.',
    };
  }

  try {
    const available = await (navigator as any).bluetooth.getAvailability();
    if (!available) {
      return {
        availability: 'unavailable',
        reason: 'Bluetooth hardware is not available or is disabled.',
        recommendation: 'Enable Bluetooth in system settings, or use Wi-Fi or QR Image Relay.',
      };
    }
    // Web Bluetooth is available but PWA-to-PWA file transfer requires the peripheral role
    // which is not supported in browsers. A native app integration layer is required.
    return {
      availability: 'pwa-limited',
      reason:
        'Web Bluetooth supports connecting to BLE peripherals but cannot make this browser act as a BLE peripheral. ' +
        'Direct browser-to-browser Bluetooth file transfer is not supported without a native companion app.',
      recommendation:
        'For peer-to-peer device transfer, use Wi-Fi (same network) or QR Image Relay. ' +
        'Native Bluetooth transfer requires a native app build of QRBeam.',
    };
  } catch (e) {
    return {
      availability: 'unavailable',
      reason: `Bluetooth check failed: ${e instanceof Error ? e.message : String(e)}`,
      recommendation: 'Use Wi-Fi or QR Image Relay for device-to-device file transfer.',
    };
  }
}

/**
 * BluetoothTransport — architecture adapter (integration point for native builds).
 *
 * In PWA mode, this transport accurately reports its limitations.
 * It does NOT fake progress or simulate successful transfers.
 */
export class BluetoothTransport implements TransferTransport {
  private info: BluetoothTransportInfo | null = null;

  async initialize(): Promise<void> {
    this.info = await checkBluetoothAvailability();
    if (this.info.availability !== 'available') {
      // Do NOT throw — we let the UI display the honest status message.
      // Throw only if actually attempting a transfer.
    }
  }

  async send(_packet: Uint8Array): Promise<void> {
    throw new Error(
      'Bluetooth peer-to-peer file transfer is not available in this browser environment. ' +
        (this.info?.recommendation ?? 'Use Wi-Fi or QR Image Relay instead.')
    );
  }

  async receive(): Promise<Uint8Array> {
    throw new Error(
      'Bluetooth peer-to-peer file transfer is not available in this browser environment. ' +
        (this.info?.recommendation ?? 'Use Wi-Fi or QR Image Relay instead.')
    );
  }

  async close(): Promise<void> {
    // No-op
  }

  getCapabilities(): TransportCapabilities {
    return {
      wifi: false,
      bluetooth: this.info?.availability === 'available',
      optical: true,
      qrRelay: true,
    };
  }

  getInfo(): BluetoothTransportInfo | null {
    return this.info;
  }
}
