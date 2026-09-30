import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/utils/binary';
import { sha256Bytes, Sha256Stream } from '../src/utils/checksum';
import { computeLayout } from '../src/services/file/layout';
import { bufferSource, buildSegmentShards } from '../src/services/file/chunker';
import { ReceiverSession } from '../src/services/file/receiverSession';
import { MemoryStore } from '../src/services/storage/transferStore';
import { shardOrder } from '../src/services/optical/frameBuilder';
import { PacketType } from '../src/types/packet';
import { FramePipeline } from '../src/services/optical/receiverPipeline';
import { makeGeometry } from '../src/services/optical/geometry';
import { composeFrame, encodeRegionGray, regionCapacityBytes } from '../src/services/optical/opticalEncoder';
import { encodePacket, PACKET_OVERHEAD } from '../src/services/protocol/packet';
import { simulateCamera, defaultChannel } from '../src/services/testing/channelSim';
import { toHex, randomBytes } from '../src/utils/binary';
import type { TransferHeader } from '../src/types/transfer';

describe('multi-segment carousel with heavy loss (no camera)', () => {
  it('3 MB, 35% packet loss, out-of-order, duplicates -> verified over several cycles', async () => {
    const rnd = mulberry32(11), file = Uint8Array.from({ length: 3_000_000 }, () => (rnd() * 256) | 0);
    const cs = 360, layout = computeLayout(file.length, cs, 192, 63, false);
    const src = bufferSource(file), shards = new Map<number, Uint8Array[]>();
    for (const s of layout.segments) shards.set(s.index, await buildSegmentShards(src, layout, s));
    const h = { fileHash: sha256Bytes(file), transferId: randomBytes(8), mimeType: 'video/mp4', fileSize: file.length } as TransferHeader;
    const session = new ReceiverSession(h, layout, new MemoryStore()); await session.init(new Uint8Array(1));
    const order = shardOrder(layout, 4); let sent = 0, cycles = 0;
    while (!session.isComplete() && sent < 200000) {
      const it = order.next().value!; sent++; cycles = it.cycle;
      if (rnd() < 0.35) continue;
      const pk = { type: PacketType.DATA, transferTag: 1, frameSeq: sent, segIndex: it.seg, shardIdx: it.shard, regionIdx: 0, payload: shards.get(it.seg)![it.shard] };
      await session.accept(pk); if (rnd() < 0.2) await session.accept(pk);
    }
    console.log('segments', layout.segments.length, 'sent', sent, 'cycles', cycles + 1, 'dups', session.dupShards, 'recovered', session.recovered);
    const r = await session.finalize();
    expect(r.ok).toBe(true);
    expect(toHex(new Uint8Array(await r.blob!.arrayBuffer())).slice(0, 64)).toBe(toHex(file.slice(0, 32)));
  });
});

describe('screen tearing', () => {
  it('rejects a frame made of half old / half new regions', async () => {
    const R = 40, g = makeGeometry(2, 2, R), tag = 0x11223344, rnd = mulberry32(5);
    const mk = (seq: number, r: number) => encodeRegionGray(encodePacket({ type: 1, transferTag: tag, frameSeq: seq, segIndex: 0, shardIdx: r, regionIdx: r,
      payload: Uint8Array.from({ length: regionCapacityBytes(R, 1) - PACKET_OVERHEAD }, () => (rnd() * 256) | 0) }), R, 1, r);
    const regs = [mk(6, 0), mk(6, 1), mk(5, 2), mk(5, 3)]; // bottom half still the previous frame
    const got: number[] = [];
    const pipe = new FramePipeline({ mode: 'optical', gx: 2, gy: 2, R, bpc: 1, tag }, async (p) => { got.push(p.regionIdx); return 'new'; });
    const cam = simulateCamera(composeFrame(g, regs, tag & 0xffff, 6), g.W, g.H, defaultChannel);
    const rep = await pipe.process(cam.gray, cam.w, cam.h);
    expect(rep.valid).toBe(2); expect(rep.torn).toBe(2); expect(got.sort()).toEqual([0, 1]);
  });
});

describe('Sha256Stream', () => {
  it('allows multiple digest() calls without throwing "hash was destroyed"', () => {
    const s = new Sha256Stream();
    s.update(new Uint8Array([1, 2, 3, 4]));
    const d1 = s.digest();
    const d2 = s.digest();
    expect(d1).toEqual(d2);
    expect(toHex(d1)).toBe(toHex(sha256Bytes(new Uint8Array([1, 2, 3, 4]))));
  });
});


