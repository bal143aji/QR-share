export const PacketType = { DATA: 1, TEST: 3 } as const;
export interface Packet {
  type: number;
  transferTag: number; // first 4 bytes of transferId
  frameSeq: number;
  segIndex: number;
  shardIdx: number;
  regionIdx: number;
  payload: Uint8Array;
}
export type ParseResult =
  | { ok: true; packet: Packet }
  | { ok: false; reason: 'magic' | 'version' | 'type' | 'length' | 'checksum' };
