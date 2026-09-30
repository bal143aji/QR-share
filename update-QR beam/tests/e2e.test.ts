import { describe, it, expect } from 'vitest';
import { randomBytes, toHex, mulberry32 } from '../src/utils/binary';
import { sha256Bytes } from '../src/utils/checksum';
import { rsEncode, rsDecode } from '../src/services/fec/rs';
import { encodePacket, parsePacket } from '../src/services/protocol/packet';
import { encodeHeader, decodeHeaderRaw, resolveEncryptedMeta, transferTag } from '../src/services/protocol/header';
import { computeLayout } from '../src/services/file/layout';
import { bufferSource, buildSegmentShards, type CryptoCtx } from '../src/services/file/chunker';
import { FrameBuilder, chunkSizeFor, type OpticalParams } from '../src/services/optical/frameBuilder';
import { FramePipeline } from '../src/services/optical/receiverPipeline';
import { ReceiverSession } from '../src/services/file/receiverSession';
import { MemoryStore } from '../src/services/storage/transferStore';
import { simulateCamera, defaultChannel } from '../src/services/testing/channelSim';
import { deriveKey } from '../src/services/crypto/keyDerivation';
import { FEC_PARAMS, type TransferHeader, type FecLevel } from '../src/types/transfer';

describe('reed-solomon', () => {
  it('recovers any k of n shards', () => {
    const k = 20, p = 6, L = 64, rnd = mulberry32(3);
    const data = Array.from({ length: k }, () => Uint8Array.from({ length: L }, () => (rnd() * 256) | 0));
    const par = rsEncode(data, p), all: (Uint8Array | null)[] = [...data, ...par];
    for (const i of [0, 3, 7, 11, 19, 21]) all[i] = null; // 5 data + 1 parity lost
    const out = rsDecode(all, k, p)!;
    expect(out.map(toHex)).toEqual(data.map(toHex));
    for (const i of [1, 2]) all[i] = null; // too many lost
    expect(rsDecode(all, k, p)).toBeNull();
  });
});

describe('packet', () => {
  it('round-trips and rejects corruption / garbage', () => {
    const payload = randomBytes(300);
    const pkt = encodePacket({ type: 1, transferTag: 7, frameSeq: 9, segIndex: 4, shardIdx: 3, regionIdx: 1, payload });
    const padded = new Uint8Array(pkt.length + 50); padded.set(pkt);
    const r = parsePacket(padded);
    expect(r.ok && toHex(r.packet.payload)).toBe(toHex(payload));
    padded[100] ^= 1;
    expect(parsePacket(padded).ok).toBe(false);
    expect(parsePacket(randomBytes(500)).ok).toBe(false);
  });
});

async function makeHeader(file: Uint8Array, p: OpticalParams, fec: FecLevel, password?: string) {
  const { k, p: par } = FEC_PARAMS[fec];
  const chunkSize = chunkSizeFor(p), enc = !!password;
  const layout = computeLayout(file.length, chunkSize, k, par, enc);
  const salt = randomBytes(16), ivPrefix = randomBytes(4);
  const h: TransferHeader = {
    protocolVersion: 1, transferId: randomBytes(8), fileId: 1, fileName: 'clip.mp4', mimeType: 'video/mp4', fileSize: file.length,
    chunkSize, totalChunks: layout.totalChunks, mode: p.mode, gx: p.gx, gy: p.gy, regionCells: p.mode === 'qr' ? 17 + 4 * p.qrVersion + 4 : p.R,
    bpc: p.bpc, qrVersion: p.qrVersion, qrEcc: p.qrEcc, segK: k, segP: par, interleave: 4, frameMs: 100, repeat: 1, handshakeEverySec: 30,
    hashAlg: 1, fileHash: sha256Bytes(file), encrypted: enc, kdfSalt: enc ? salt : new Uint8Array(0), kdfIterations: enc ? 1000 : 0,
    ivPrefix: enc ? ivPrefix : new Uint8Array(0),
  };
  const key = enc ? await deriveKey(password!, salt, 1000) : undefined;
  return { h, layout, key, headerBytes: await encodeHeader(h, key) };
}

async function runTransfer(file: Uint8Array, p: OpticalParams, fec: FecLevel, opt: { drop?: number; corrupt?: number; password?: string; maxFrames?: number; tamper?: boolean } = {}) {
  const { h: h0, layout: l0, key, headerBytes } = await makeHeader(file, p, fec, opt.password);
  // receiver side: parse handshake from bytes only
  const raw = decodeHeaderRaw(headerBytes);
  const rkey = opt.password ? await deriveKey(opt.password, raw.header.kdfSalt, raw.header.kdfIterations) : undefined;
  const h = opt.password ? await resolveEncryptedMeta(raw, rkey!) : raw.header;
  const layout = computeLayout(h.fileSize, h.chunkSize, h.segK, h.segP, h.encrypted);
  const src = bufferSource(file), scx: CryptoCtx | undefined = key ? { key, ivPrefix: h0.ivPrefix } : undefined;
  const cache = new Map<number, Uint8Array[]>();
  const fb = new FrameBuilder(h0, l0, { getShards: async (s) => { if (!cache.has(s)) cache.set(s, await buildSegmentShards(src, l0, l0.segments[s], scx)); return cache.get(s)!; } });
  const store = new MemoryStore();
  const session = new ReceiverSession(h, layout, store, rkey ? { key: rkey, ivPrefix: h.ivPrefix } : undefined);
  await session.init(headerBytes);
  const pipe = new FramePipeline({ mode: h.mode, gx: h.gx, gy: h.gy, R: h.regionCells, bpc: h.bpc, tag: transferTag(h.transferId) }, (pk) => session.accept(pk));
  const rnd = mulberry32(99);
  let frames = 0;
  const limit = opt.maxFrames ?? 4000;
  while (!session.isComplete() && frames < limit) {
    const f = await fb.next(); frames++;
    if (rnd() < (opt.drop ?? 0)) continue; // camera missed this frame
    const times = rnd() < 0.3 ? 2 : 1; // duplicate captures of same frame
    for (let t = 0; t < times; t++) {
      const cam = simulateCamera(f.cells, fb.geom.W, fb.geom.H, { ...defaultChannel, seed: frames * 7 + t, rotationDeg: (rnd() - 0.5) * 6 });
      if (opt.corrupt && rnd() < opt.corrupt) for (let i = 0; i < 3000; i++) cam.gray[(rnd() * cam.gray.length) | 0] = (rnd() * 255) | 0;
      await pipe.process(cam.gray, cam.w, cam.h);
    }
  }
  if (opt.tamper) { const b = store.segments.get(`${session.id}:0`)!; b[5] ^= 1; }
  const res = await session.finalize();
  return { res, frames, session, pipe, file, h };
}

const opt2x2: OpticalParams = { mode: 'optical', gx: 2, gy: 2, R: 40, bpc: 1, qrVersion: 0, qrEcc: 'L' };
const rndFile = (n: number, seed = 5) => { const r = mulberry32(seed); return Uint8Array.from({ length: n }, () => (r() * 256) | 0); };

describe('optical end-to-end (simulated camera)', () => {
  it('2x2 binary, lossy, duplicates, garbage -> byte-identical', async () => {
    const file = rndFile(60_000);
    const r = await runTransfer(file, opt2x2, 'medium', { drop: 0.1, corrupt: 0.1 });
    console.log('frames', r.frames, JSON.stringify(r.pipe.c), 'recovered', r.session.recovered);
    expect(r.res.ok).toBe(true);
    expect(toHex(new Uint8Array(await r.res.blob!.arrayBuffer()))).toBe(toHex(file));
  });
  it('gray4 (2 bits/cell) 1x1', async () => {
    const r = await runTransfer(rndFile(40_000, 8), { ...opt2x2, gx: 1, gy: 1, R: 60, bpc: 2 }, 'low', { drop: 0.05 });
    expect(r.res.ok).toBe(true);
  });
  it('AES-256-GCM encrypted', async () => {
    const r = await runTransfer(rndFile(30_000, 9), opt2x2, 'low', { password: 'correct horse' });
    expect(r.res.ok).toBe(true);
  });
  it('pure QR mode 2x2', async () => {
    const r = await runTransfer(rndFile(8_000, 4), { mode: 'qr', gx: 2, gy: 2, R: 0, bpc: 1, qrVersion: 10, qrEcc: 'L' }, 'off', { drop: 0.05 });
    expect(r.res.ok).toBe(true);
  });
  it('tampered byte -> SHA-256 mismatch, no file', async () => {
    const r = await runTransfer(rndFile(20_000, 2), opt2x2, 'low', { tamper: true });
    expect(r.res.ok).toBe(false);
    expect(r.res.blob).toBeUndefined();
  });
});

describe('header', () => {
  it('wrong password fails', async () => {
    const { headerBytes } = await makeHeader(rndFile(1000), opt2x2, 'low', 'secret');
    const raw = decodeHeaderRaw(headerBytes);
    const bad = await deriveKey('nope', raw.header.kdfSalt, raw.header.kdfIterations);
    await expect(resolveEncryptedMeta(raw, bad)).rejects.toBeTruthy();
  });
});
