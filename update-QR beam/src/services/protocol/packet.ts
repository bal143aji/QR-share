import { ByteReader, ByteWriter } from '../../utils/binary';
import { truncSha } from '../../utils/checksum';
import type { Packet, ParseResult } from '../../types/packet';

export const PACKET_MAGIC = 0x5142; // 'QB'
export const PROTOCOL_VERSION = 1;
export const PACKET_HEADER_BYTES = 19;
export const PACKET_TRAILER_BYTES = 8;
export const PACKET_OVERHEAD = PACKET_HEADER_BYTES + PACKET_TRAILER_BYTES;

/** Compact binary packet: magic | ver<<4|type | tag | frameSeq | seg | shard | region | len | payload | sha256[0..8] */
export function encodePacket(p: Packet): Uint8Array {
  const w = new ByteWriter(p.payload.length + PACKET_OVERHEAD);
  w.u16(PACKET_MAGIC).u8((PROTOCOL_VERSION << 4) | p.type).u32(p.transferTag).u32(p.frameSeq)
    .u32(p.segIndex).u8(p.shardIdx).u8(p.regionIdx).u16(p.payload.length).bytes(p.payload);
  const body = w.finish();
  const out = new Uint8Array(body.length + PACKET_TRAILER_BYTES);
  out.set(body); out.set(truncSha(body, PACKET_TRAILER_BYTES), body.length);
  return out;
}

/** `bytes` may be longer than the packet (region padding). */
export function parsePacket(bytes: Uint8Array): ParseResult {
  if (bytes.length < PACKET_OVERHEAD) return { ok: false, reason: 'length' };
  const r = new ByteReader(bytes);
  if (r.u16() !== PACKET_MAGIC) return { ok: false, reason: 'magic' };
  const vt = r.u8();
  if (vt >> 4 !== PROTOCOL_VERSION) return { ok: false, reason: 'version' };
  const type = vt & 15;
  if (type !== 1 && type !== 3) return { ok: false, reason: 'type' };
  const transferTag = r.u32(), frameSeq = r.u32(), segIndex = r.u32();
  const shardIdx = r.u8(), regionIdx = r.u8(), len = r.u16();
  const total = PACKET_HEADER_BYTES + len + PACKET_TRAILER_BYTES;
  if (total > bytes.length) return { ok: false, reason: 'length' };
  const body = bytes.subarray(0, PACKET_HEADER_BYTES + len);
  const sum = bytes.subarray(PACKET_HEADER_BYTES + len, total);
  const exp = truncSha(body, PACKET_TRAILER_BYTES);
  for (let i = 0; i < PACKET_TRAILER_BYTES; i++) if (sum[i] !== exp[i]) return { ok: false, reason: 'checksum' };
  return {
    ok: true,
    packet: { type, transferTag, frameSeq, segIndex, shardIdx, regionIdx, payload: bytes.slice(PACKET_HEADER_BYTES, PACKET_HEADER_BYTES + len) },
  };
}
