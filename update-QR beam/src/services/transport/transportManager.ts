/**
 * Transport Manager — coordinates all transports and manages automatic mode selection.
 * Additive module: does NOT modify existing optical transfer code.
 */

import type { TransportCapabilities, TransportStatus, TransferMode } from '../../types/transport';
import { detectTransportCapabilities, chooseBestTransport } from './transport';

export interface TransportManagerState {
  capabilities: TransportCapabilities;
  selectedMode: TransferMode;
  resolvedMode: 'wifi' | 'bluetooth' | 'optical' | 'qr-relay';
  wifiStatus: TransportStatus;
  bluetoothStatus: TransportStatus;
  opticalStatus: TransportStatus;
  qrRelayStatus: TransportStatus;
}

export class TransportManager {
  private caps: TransportCapabilities | null = null;
  private listeners: Array<(state: TransportManagerState) => void> = [];
  private state: TransportManagerState = {
    capabilities: { wifi: false, bluetooth: false, optical: true, qrRelay: true },
    selectedMode: 'optical',
    resolvedMode: 'optical',
    wifiStatus: 'unavailable',
    bluetoothStatus: 'unavailable',
    opticalStatus: 'available',
    qrRelayStatus: 'available',
  };

  async initialize(): Promise<void> {
    this.caps = await detectTransportCapabilities();
    this.state = {
      ...this.state,
      capabilities: this.caps,
      wifiStatus: this.caps.wifi ? 'available' : 'unavailable',
      bluetoothStatus: this.caps.bluetooth ? 'available' : 'unavailable',
      opticalStatus: 'available',
      qrRelayStatus: 'available',
    };
    this._notify();
  }

  select(mode: TransferMode): void {
    this.state.selectedMode = mode;
    if (mode === 'automatic') {
      this.state.resolvedMode = chooseBestTransport(
        this.state.capabilities
      );
    } else {
      this.state.resolvedMode = mode;
    }
    this._notify();
  }


  getState(): TransportManagerState {
    return { ...this.state };
  }

  subscribe(fn: (state: TransportManagerState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private _notify() {
    this.listeners.forEach((fn) => fn(this.getState()));
  }
}

/** Singleton transport manager */
export const transportManager = new TransportManager();
