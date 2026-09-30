/**
 * Frame Index for QR Image Relay
 *
 * Tracks received frames, eliminates duplicates, detects missing frames,
 * and maintains sequence order regardless of arrival order.
 */

import type { Packet } from '../../types/packet';

export interface FrameStats {
  totalExpected: number;
  receivedCount: number;
  uniqueCount: number;
  duplicateCount: number;
  invalidCount: number;
  missingCount: number;
  progressPercent: number;
}

export class FrameIndex {
  private frames: Map<number, Packet> = new Map();
  private duplicateCount = 0;
  private invalidCount = 0;
  private totalExpected = 0;
  private transferTag: number | null = null;

  constructor(totalExpected = 0, transferTag: number | null = null) {
    this.totalExpected = totalExpected;
    this.transferTag = transferTag;
  }

  setTotalExpected(total: number) {
    this.totalExpected = Math.max(this.totalExpected, total);
  }

  setTransferTag(tag: number) {
    this.transferTag = tag;
  }

  getTransferTag(): number | null {
    return this.transferTag;
  }

  /**
   * Add a decoded packet to the index.
   * Returns:
   *   'added' if new valid frame
   *   'duplicate' if already present
   *   'tag_mismatch' if transfer tag doesn't match
   */
  addPacket(packet: Packet): 'added' | 'duplicate' | 'tag_mismatch' {
    if (this.transferTag !== null && packet.transferTag !== this.transferTag) {
      this.invalidCount++;
      return 'tag_mismatch';
    }

    if (this.frames.has(packet.frameSeq)) {
      this.duplicateCount++;
      return 'duplicate';
    }

    this.frames.set(packet.frameSeq, packet);

    // If totalExpected wasn't set, deduce from highest frame seen
    if (this.totalExpected === 0) {
      this.totalExpected = Math.max(...Array.from(this.frames.keys())) + 1;
    }

    return 'added';
  }

  recordInvalid() {
    this.invalidCount++;
  }

  hasFrame(seq: number): boolean {
    return this.frames.has(seq);
  }

  getFrame(seq: number): Packet | undefined {
    return this.frames.get(seq);
  }

  getAllFrames(): Packet[] {
    return Array.from(this.frames.entries())
      .sort(([a], [b]) => a - b)
      .map(([, pkt]) => pkt);
  }

  /**
   * Find list of missing frame sequences in range [0, totalExpected - 1]
   */
  getMissingFrames(): number[] {
    if (this.totalExpected <= 0) return [];
    const missing: number[] = [];
    for (let i = 0; i < this.totalExpected; i++) {
      if (!this.frames.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  isComplete(): boolean {
    if (this.totalExpected <= 0) return false;
    return this.frames.size >= this.totalExpected && this.getMissingFrames().length === 0;
  }

  getStats(): FrameStats {
    const unique = this.frames.size;
    const missing = this.getMissingFrames().length;
    const total = this.totalExpected > 0 ? this.totalExpected : unique;
    const progress = total > 0 ? Math.min(100, Math.round((unique / total) * 100)) : 0;

    return {
      totalExpected: total,
      receivedCount: unique + this.duplicateCount,
      uniqueCount: unique,
      duplicateCount: this.duplicateCount,
      invalidCount: this.invalidCount,
      missingCount: missing,
      progressPercent: progress,
    };
  }

  /**
   * Reassemble payloads in sequence order into one contiguous Uint8Array.
   * Throws if frames are missing.
   */
  reassemble(): Uint8Array {
    const missing = this.getMissingFrames();
    if (missing.length > 0) {
      throw new Error(`Cannot reassemble: ${missing.length} frames missing (${missing.slice(0, 5).join(', ')}...)`);
    }

    const sortedFrames = this.getAllFrames();
    const totalBytes = sortedFrames.reduce((acc, f) => acc + f.payload.length, 0);
    const result = new Uint8Array(totalBytes);
    let offset = 0;

    for (const frame of sortedFrames) {
      result.set(frame.payload, offset);
      offset += frame.payload.length;
    }

    return result;
  }

  clear() {
    this.frames.clear();
    this.duplicateCount = 0;
    this.invalidCount = 0;
    this.totalExpected = 0;
    this.transferTag = null;
  }
}
