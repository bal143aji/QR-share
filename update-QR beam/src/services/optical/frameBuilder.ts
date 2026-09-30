import type { TransferHeader } from '../../types/transfer';
import { PacketType } from '../../types/packet';
import { encodePacket, PACKET_OVERHEAD } from '../protocol/packet';
import { transferTag } from '../protocol/header';
import type { Layout } from '../file/layout';
import { makeGeometry, regionCount, type FrameGeometry } from './geometry';
import { composeFrame, encodeRegionGray, regionCapacityBytes } from './opticalEncoder';
import { qrCapacity, qrRegionGray, qrRegionSize } from '../qr/qrEncoder';
import type { QrEcc, TransferMode } from '../../types/transfer';

export interface ShardSource { getShards(seg: number): Promise<Uint8Array[]> }

export interface OpticalParams { mode: TransferMode; gx: number; gy: number; R: number; bpc: number; qrVersion: number; qrEcc: QrEcc }

/** Region size in cells for a set of optical params (QR: derived from the QR version). */
export const regionCellsFor = (p: { mode: TransferMode; R: number; qrVersion: number }) =>
  p.mode === 'qr' ? qrRegionSize(p.qrVersion) : p.R;
/** Payload bytes per region (= chunk size) for a configuration. */
export function chunkSizeFor(p: OpticalParams): number {
  const cap = p.mode === 'qr' ? qrCapacity(p.qrVersion, p.qrEcc) : regionCapacityBytes(p.R, p.bpc);
  return cap - PACKET_OVERHEAD;
}
export const geometryFor = (p: OpticalParams): FrameGeometry => makeGeometry(p.gx, p.gy, regionCellsFor(p));
export const paramsFromHeader = (h: TransferHeader): OpticalParams => ({
  mode: h.mode, gx: h.gx, gy: h.gy, R: h.regionCells, bpc: h.bpc, qrVersion: h.qrVersion, qrEcc: h.qrEcc,
});

export function regionGray(p: OpticalParams, pkt: Uint8Array, regionIdx: number): Uint8Array {
  return p.mode === 'qr' ? qrRegionGray(pkt, p.qrVersion, p.qrEcc) : encodeRegionGray(pkt, p.R, p.bpc, regionIdx);
}

/** Interleaved carousel order: shard j of D consecutive segments round-robin, cycled forever. */
export function* shardOrder(layout: Layout, D: number): Generator<{ seg: number; shard: number; cycle: number }> {
  const N = layout.segments.length; let cycle = 0;
  for (;;) {
    for (let w0 = 0; w0 < N; w0 += D) {
      const win = layout.segments.slice(w0, w0 + D);
      const maxN = Math.max(...win.map((s) => s.n));
      for (let j = 0; j < maxN; j++) for (const s of win) if (j < s.n) yield { seg: s.index, shard: j, cycle };
    }
    cycle++;
  }
}

export interface BuiltFrame { seq: number; cells: Uint8Array; cycle: number; firstPass: boolean }

export class FrameBuilder {
  seq = 0; shardsSent = 0; cycle = 0;
  readonly geom: FrameGeometry;
  private order: Generator<{ seg: number; shard: number; cycle: number }>;
  private tag: number;
  private params: OpticalParams;
  private cache = new Map<number, Uint8Array[]>();
  constructor(private h: TransferHeader, private layout: Layout, private source: ShardSource) {
    this.params = paramsFromHeader(h);
    this.geom = geometryFor(this.params);
    this.order = shardOrder(layout, Math.max(1, h.interleave));
    this.tag = transferTag(h.transferId);
  }
  private async shards(seg: number) {
    let s = this.cache.get(seg);
    if (!s) {
      s = await this.source.getShards(seg);
      this.cache.set(seg, s);
      while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value as number);
    }
    return s;
  }
  async next(): Promise<BuiltFrame> {
    const seq = this.seq++, regions: Uint8Array[] = [];
    let cycle = 0;
    for (let r = 0; r < regionCount(this.geom); r++) {
      const it = this.order.next().value!;
      cycle = it.cycle;
      const payload = (await this.shards(it.seg))[it.shard];
      const pkt = encodePacket({ type: PacketType.DATA, transferTag: this.tag, frameSeq: seq, segIndex: it.seg, shardIdx: it.shard, regionIdx: r, payload });
      regions.push(regionGray(this.params, pkt, r));
      this.shardsSent++;
    }
    this.cycle = cycle;
    return { seq, cells: composeFrame(this.geom, regions, this.tag & 0xffff, seq), cycle, firstPass: cycle === 0 };
  }
}
