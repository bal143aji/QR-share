/**
 * Wi-Fi Transport Adapter
 *
 * Uses WebRTC DataChannel for local peer-to-peer Wi-Fi transfer.
 * No Internet required. No cloud storage. No backend.
 *
 * Connection flow:
 *   Sender creates offer → shows SDP offer QR
 *   Receiver scans offer → creates answer → shows answer QR
 *   Sender scans answer → DataChannel established
 *   File transferred as binary chunks over DataChannel
 *
 * The same chunk/checksum/SHA-256 pipeline is used as in optical mode.
 */

import type { TransferTransport, TransportCapabilities } from '../../types/transport';

export type WifiRole = 'sender' | 'receiver';
export type WifiConnectionState = 'idle' | 'offering' | 'answering' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WifiTransportEvents {
  onStateChange?(state: WifiConnectionState): void;
  onData?(data: Uint8Array): void;
  onError?(message: string): void;
  onOfferReady?(offerSdp: string): void;
  onAnswerReady?(answerSdp: string): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

const ICE_SERVERS: RTCIceServer[] = [
  // Local-only — no STUN/TURN required when on same LAN
];

/**
 * WifiTransport — WebRTC DataChannel-based local transfer.
 *
 * No STUN/TURN servers are used by default so this works fully offline
 * on a shared local network or direct connection (Wi-Fi Direct emulation).
 */
export class WifiTransport implements TransferTransport {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: WifiRole;
  private events: WifiTransportEvents;
  private connectionState: WifiConnectionState = 'idle';
  private receiveQueue: Uint8Array[] = [];
  private receiveResolvers: Array<(data: Uint8Array) => void> = [];

  constructor(role: WifiRole, events: WifiTransportEvents = {}) {
    this.role = role;
    this.events = events;
  }

  static isSupported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  private setState(s: WifiConnectionState) {
    this.connectionState = s;
    this.events.onStateChange?.(s);
  }

  async initialize(): Promise<void> {
    if (!WifiTransport.isSupported()) {
      throw new Error('WebRTC is not supported on this platform. Wi-Fi transfer is unavailable.');
    }
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc?.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        this.setState('connected');
        this.events.onConnected?.();
      } else if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        this.setState('disconnected');
        this.events.onDisconnected?.();
      }
    };

    if (this.role === 'sender') {
      this.dc = this.pc.createDataChannel('qrbeam', {
        ordered: false, // out-of-order delivery is fine; we have sequence numbers
        maxRetransmits: 0,
      });
      this._setupDataChannel(this.dc);

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this._waitForIceGathering();
      const sdp = this.pc.localDescription?.sdp ?? '';
      this.setState('offering');
      this.events.onOfferReady?.(sdp);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.dc = ev.channel;
        this._setupDataChannel(this.dc);
      };
      this.setState('answering');
    }
  }

  /** Receiver: accept the sender's SDP offer and produce an answer. */
  async acceptOffer(offerSdp: string): Promise<string> {
    if (!this.pc) throw new Error('Not initialized');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._waitForIceGathering();
    const sdp = this.pc.localDescription?.sdp ?? '';
    this.setState('connecting');
    this.events.onAnswerReady?.(sdp);
    return sdp;
  }

  /** Sender: accept receiver's SDP answer. */
  async acceptAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) throw new Error('Not initialized');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.setState('connecting');
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }
    (this.dc as any).send(packet);
  }


  async receive(): Promise<Uint8Array> {
    if (this.receiveQueue.length > 0) {
      return this.receiveQueue.shift()!;
    }
    return new Promise<Uint8Array>((resolve) => {
      this.receiveResolvers.push(resolve);
    });
  }

  async close(): Promise<void> {
    this.dc?.close();
    this.pc?.close();
    this.setState('disconnected');
  }

  getCapabilities(): TransportCapabilities {
    return {
      wifi: WifiTransport.isSupported(),
      bluetooth: false,
      optical: true,
      qrRelay: true,
    };
  }

  get state(): WifiConnectionState {
    return this.connectionState;
  }

  private _setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      this.setState('connected');
      this.events.onConnected?.();
    };
    dc.onclose = () => {
      this.setState('disconnected');
      this.events.onDisconnected?.();
    };
    dc.onerror = (ev) => {
      this.events.onError?.(`DataChannel error: ${(ev as RTCErrorEvent).error?.message ?? 'unknown'}`);
    };
    dc.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const data = new Uint8Array(ev.data);
      if (this.receiveResolvers.length > 0) {
        this.receiveResolvers.shift()!(data);
      } else {
        this.receiveQueue.push(data);
      }
      this.events.onData?.(data);
    };
  }

  private _waitForIceGathering(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.pc) return resolve();
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const handler = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', handler);
      // Timeout fallback — use whatever candidates we have after 3s
      setTimeout(resolve, 3000);
    });
  }
}

/** Encode SDP for QR display (compact base64url). */
export function encodeSdpForQr(sdp: string): string {
  const bytes = new TextEncoder().encode(sdp);
  let b = '';
  bytes.forEach((byte) => (b += String.fromCharCode(byte)));
  return 'QRBEAM_SDP:' + btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Decode SDP from QR text. Returns null if not a valid SDP QR. */
export function decodeSdpFromQr(text: string): string | null {
  if (!text.startsWith('QRBEAM_SDP:')) return null;
  try {
    const b64 = text.slice('QRBEAM_SDP:'.length).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
