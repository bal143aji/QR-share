import type { TransferHeader } from '../../types/transfer';
import { PacketType, type Packet } from '../../types/packet';
import { toHex, bytesEqual } from '../../utils/binary';
import { Sha256Stream } from '../../utils/checksum';
import type { TransferStore } from '../storage/transferStore';
import { assembleSegment, type CryptoCtx } from './chunker';
import type { Layout } from './layout';

export type Outcome = 'new' | 'duplicate' | 'invalid';
export interface FinalizeResult { ok: boolean; hashHex: string; blob?: Blob; reason?: string }

export class ReceiverSession {
  readonly id: string;
  private pending = new Map<number, Map<number, Uint8Array>>();
  private done: Uint8Array;
  useful = 0; recovered = 0; dupShards = 0; newShards = 0; segFailures = 0; doneCount = 0; plainBytes = 0;
  constructor(readonly h: TransferHeader, readonly layout: Layout, private store: TransferStore, private cx?: CryptoCtx) {
    this.id = toHex(h.transferId);
    this.done = new Uint8Array(layout.segments.length);
  }
  /** Load anything persisted from an earlier (interrupted) session. */
  async init(headerBytes: Uint8Array) {
    await this.store.saveMeta(this.id, headerBytes);
    const st = await this.store.loadState(this.id);
    for (const s of st.doneSegments) if (!this.done[s]) { this.done[s] = 1; this.doneCount++; this.useful += this.layout.segments[s].k; this.plainBytes += this.layout.segments[s].plainLen; }
    for (const s of st.shardSegments) {
      if (this.done[s]) { await this.store.deleteShards(this.id, s); continue; }
      const m = await this.store.getShards(this.id, s);
      this.pending.set(s, m); this.useful += Math.min(m.size, this.layout.segments[s].k);
    }
  }
  get total() { return this.layout.segments.length; }
  isComplete() { return this.doneCount === this.total; }
  progress() { return Math.min(1, this.useful / this.layout.totalChunks); }

  async accept(p: Packet): Promise<Outcome> {
    if (p.type !== PacketType.DATA) return 'invalid';
    const seg = this.layout.segments[p.segIndex];
    if (!seg || p.shardIdx >= seg.n || p.payload.length !== this.layout.chunkSize) return 'invalid';
    if (this.done[seg.index]) { this.dupShards++; return 'duplicate'; }
    let m = this.pending.get(seg.index);
    if (!m) { m = new Map(); this.pending.set(seg.index, m); }
    if (m.has(p.shardIdx)) { this.dupShards++; return 'duplicate'; }
    m.set(p.shardIdx, p.payload); this.newShards++; this.useful++;
    await this.store.putShards(this.id, [{ seg: seg.index, shard: p.shardIdx, data: p.payload }]);
    if (m.size >= seg.k) await this.complete(seg.index);
    return 'new';
  }

  private async complete(si: number) {
    const seg = this.layout.segments[si], m = this.pending.get(si)!;
    const shards: (Uint8Array | null)[] = Array.from({ length: seg.n }, (_, i) => m.get(i) ?? null);
    let plain: Uint8Array | null = null;
    try { plain = await assembleSegment(shards, this.layout, seg, this.cx); } catch { plain = null; }
    if (!plain) {
      this.segFailures++; this.useful -= m.size; this.pending.delete(si);
      await this.store.deleteShards(this.id, si); return;
    }
    for (let j = 0; j < seg.k; j++) if (!m.has(j)) this.recovered++;
    await this.store.putSegment(this.id, si, plain);
    await this.store.deleteShards(this.id, si);
    this.pending.delete(si); this.done[si] = 1; this.doneCount++; this.plainBytes += seg.plainLen;
  }

  /** Re-read every stored segment, compute SHA-256 and only then build the final Blob. */
  async finalize(): Promise<FinalizeResult> {
    const hasher = new Sha256Stream(), parts: Blob[] = [];
    for (let i = 0; i < this.total; i++) {
      if (!this.done[i]) return { ok: false, hashHex: '', reason: 'transfer incomplete' };
      const b = await this.store.getSegmentBlob(this.id, i);
      hasher.update(new Uint8Array(await b.arrayBuffer())); parts.push(b);
    }
    const d = hasher.digest(), hashHex = toHex(d);
    if (!bytesEqual(d, this.h.fileHash)) return { ok: false, hashHex, reason: 'SHA-256 mismatch' };
    return { ok: true, hashHex, blob: new Blob(parts, { type: this.h.mimeType || 'application/octet-stream' }) };
  }
}
