/**
 * QR Relay Transport Adapter
 *
 * Implements TransferTransport for the QR Image Relay / store-and-forward mode.
 * Encapsulates the packet queue for sender and receiver.
 */

import type { TransferTransport, TransportCapabilities } from '../../types/transport';
import { FrameIndex } from '../qr-relay/frameIndex';
import type { Packet } from '../../types/packet';

export class QrRelayTransport implements TransferTransport {
  private sendBuffer: Uint8Array[] = [];
  private receiveQueue: Uint8Array[] = [];
  private frameIndex: FrameIndex = new FrameIndex();
  private receiveResolver: ((pkt: Uint8Array) => void) | null = null;
  private closed = false;

  async initialize(): Promise<void> {
    this.sendBuffer = [];
    this.receiveQueue = [];
    this.closed = false;
  }

  async send(packet: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Transport closed');
    this.sendBuffer.push(packet);
  }

  async receive(): Promise<Uint8Array> {
    if (this.receiveQueue.length > 0) {
      return this.receiveQueue.shift()!;
    }
    if (this.closed) throw new Error('Transport closed');

    return new Promise<Uint8Array>((resolve, reject) => {
      this.receiveResolver = resolve;
      if (this.closed) reject(new Error('Transport closed'));
    });
  }

  /**
   * Feed a received packet into the transport queue
   */
  feedPacket(packet: Packet, rawBytes: Uint8Array): void {
    const res = this.frameIndex.addPacket(packet);
    if (res === 'added') {
      if (this.receiveResolver) {
        const resolve = this.receiveResolver;
        this.receiveResolver = null;
        resolve(rawBytes);
      } else {
        this.receiveQueue.push(rawBytes);
      }
    }
  }

  getFrameIndex(): FrameIndex {
    return this.frameIndex;
  }

  getBufferedPackets(): Uint8Array[] {
    return [...this.sendBuffer];
  }

  async close(): Promise<void> {
    this.closed = true;
    this.receiveResolver = null;
  }

  getCapabilities(): TransportCapabilities {
    return {
      wifi: false,
      bluetooth: false,
      optical: false,
      qrRelay: true,
    };
  }
}
