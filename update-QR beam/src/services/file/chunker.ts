import { rsEncode, rsDecode } from '../fec/rs';
import { encryptSegment, decryptSegment } from '../crypto/encryption';
import type { Layout, Segment } from './layout';

export interface ByteSource { size: number; read(offset: number, length: number): Promise<Uint8Array> }
export interface CryptoCtx { key: CryptoKey; ivPrefix: Uint8Array }

export const blobSource = (f: Blob): ByteSource => ({
  size: f.size,
  read: async (o, l) => new Uint8Array(await f.slice(o, o + l).arrayBuffer()),
});
export const bufferSource = (b: Uint8Array): ByteSource => ({ size: b.length, read: async (o, l) => b.slice(o, o + l) });

/** Read one segment from the source (never the whole file), optionally encrypt, split into shards, add RS parity. */
export async function buildSegmentShards(src: ByteSource, layout: Layout, seg: Segment, cx?: CryptoCtx): Promise<Uint8Array[]> {
  const plain = seg.plainLen > 0 ? await src.read(seg.plainOffset, seg.plainLen) : new Uint8Array(0);
  const transport = cx ? await encryptSegment(cx.key, cx.ivPrefix, seg.index, plain) : plain;
  const cs = layout.chunkSize;
  const data: Uint8Array[] = [];
  for (let j = 0; j < seg.k; j++) {
    const s = new Uint8Array(cs);
    s.set(transport.subarray(j * cs, Math.min(transport.length, (j + 1) * cs)));
    data.push(s);
  }
  return seg.p > 0 ? [...data, ...rsEncode(data, seg.p)] : data;
}

/** Inverse of buildSegmentShards. Returns null if fewer than k shards; throws if decryption fails. */
export async function assembleSegment(shards: (Uint8Array | null | undefined)[], layout: Layout, seg: Segment, cx?: CryptoCtx) {
  const data = rsDecode(shards, seg.k, seg.p);
  if (!data) return null;
  const transport = new Uint8Array(seg.k * layout.chunkSize);
  data.forEach((d, i) => transport.set(d, i * layout.chunkSize));
  const t = transport.subarray(0, seg.transportLen);
  return cx ? decryptSegment(cx.key, cx.ivPrefix, seg.index, t) : t.slice();
}
