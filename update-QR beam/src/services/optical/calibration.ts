import { ByteReader, ByteWriter, fromB64Url, mulberry32, toB64Url } from '../../utils/binary';
import type { FecLevel, QrEcc, TransferMode } from '../../types/transfer';
import type { CalStepResult } from '../../types/performance';
import { PacketType } from '../../types/packet';
import { encodePacket } from '../protocol/packet';
import { composeFrame } from './opticalEncoder';
import { regionCount } from './geometry';
import { chunkSizeFor, geometryFor, regionGray, type OpticalParams } from './frameBuilder';

export interface Preset extends OpticalParams { id: string; label: string; frameMs: number }
const P = (id: string, label: string, mode: TransferMode, gx: number, R: number, bpc: number, frameMs: number, qrVersion = 0, qrEcc: QrEcc = 'L'): Preset =>
  ({ id, label, mode, gx, gy: gx, R, bpc, frameMs, qrVersion, qrEcc });

/** Configurations offered in the UI. `R` is the data area in cells per region (QR: derived from version). */
export const PRESETS: Preset[] = [
  P('o1-96', 'Fast optical 1×1 · 96 cells', 'optical', 1, 96, 1, 150),
  P('o2-64', 'Fast optical 2×2 · 64 cells', 'optical', 2, 64, 1, 150),
  P('o2-96', 'Fast optical 2×2 · 96 cells', 'optical', 2, 96, 1, 150),
  P('o3-48', 'Fast optical 3×3 · 48 cells', 'optical', 3, 48, 1, 150),
  P('o2-96g', 'Fast optical 2×2 · 96 cells · 4-level gray', 'optical', 2, 96, 2, 150),
  P('o2-128', 'Fast optical 2×2 · 128 cells (dense)', 'optical', 2, 128, 1, 150),
  P('q1-v20', 'Pure QR 1×1 · v20', 'qr', 1, 0, 1, 250, 20),
  P('q2-v10', 'Pure QR 2×2 · v10', 'qr', 2, 0, 1, 250, 10),
];
export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[1];
export const FRAME_MS_OPTIONS = [50, 75, 100, 150, 250, 500];

/** Raw payload bytes per frame and the *theoretical ceiling* (not a measurement). */
export function payloadPerFrame(p: OpticalParams) { return chunkSizeFor(p) * p.gx * p.gy; }
export function ceilingRate(p: OpticalParams, frameMs: number, fec: FecLevel, repeat: number) {
  const fecEff = { off: 1, low: 240 / 255, medium: 224 / 255, high: 192 / 255 }[fec];
  return (payloadPerFrame(p) * (1000 / frameMs) * fecEff) / repeat;
}

/** Steps run during "Optimize Transfer" (Calibration on sender / Benchmark on receiver). */
export const CAL_STEPS: Preset[] = [
  { ...presetById('o1-96'), frameMs: 200 }, { ...presetById('o2-64'), frameMs: 200 }, { ...presetById('o3-48'), frameMs: 200 },
  { ...presetById('o2-96'), frameMs: 200 }, { ...presetById('o2-96'), frameMs: 100 }, { ...presetById('o2-96g'), frameMs: 150 },
  { ...presetById('o2-128'), frameMs: 150 }, { ...presetById('q2-v10'), frameMs: 250 },
];

/* --- wire formats: announcements are text QR codes so any QR reader (incl. BarcodeDetector) can read them --- */
export const CAL_PREFIX = 'QRBEAM-CAL1:', CAL_END_PREFIX = 'QRBEAM-CALEND1:', REC_PREFIX = 'QRBEAM-REC1:';
export interface CalStepMsg extends OpticalParams { step: number; total: number; frameMs: number; nFrames: number; nonce: number }
export function encodeCalStep(m: CalStepMsg): string {
  return CAL_PREFIX + toB64Url(new ByteWriter().u8(m.step).u8(m.total).u8(m.mode === 'optical' ? 0 : 1).u8(m.gx).u8(m.gy).u16(m.R)
    .u8(m.bpc).u8(m.qrVersion).u8(['L', 'M', 'Q', 'H'].indexOf(m.qrEcc)).u16(m.frameMs).u16(m.nFrames).u32(m.nonce).finish());
}
export function decodeCalStep(t: string): CalStepMsg | null {
  if (!t.startsWith(CAL_PREFIX)) return null;
  try {
    const r = new ByteReader(fromB64Url(t.slice(CAL_PREFIX.length)));
    const step = r.u8(), total = r.u8(), mode = r.u8() === 0 ? 'optical' : 'qr', gx = r.u8(), gy = r.u8(), R = r.u16(), bpc = r.u8();
    const qrVersion = r.u8(), qrEcc = (['L', 'M', 'Q', 'H'] as QrEcc[])[r.u8()], frameMs = r.u16(), nFrames = r.u16(), nonce = r.u32();
    return { step, total, mode, gx, gy, R, bpc, qrVersion, qrEcc, frameMs, nFrames, nonce };
  } catch { return null; }
}
export const encodeCalEnd = (nonce: number) => CAL_END_PREFIX + nonce;
export const decodeCalEnd = (t: string) => (t.startsWith(CAL_END_PREFIX) ? Number(t.slice(CAL_END_PREFIX.length)) : null);

export interface Recommendation extends OpticalParams { frameMs: number; fec: FecLevel; repeat: number }
const FEC_ORDER: FecLevel[] = ['off', 'low', 'medium', 'high'];
export function encodeRecommendation(r: Recommendation): string {
  return REC_PREFIX + toB64Url(new ByteWriter().u8(r.mode === 'optical' ? 0 : 1).u8(r.gx).u8(r.gy).u16(r.R).u8(r.bpc).u8(r.qrVersion)
    .u8(['L', 'M', 'Q', 'H'].indexOf(r.qrEcc)).u16(r.frameMs).u8(FEC_ORDER.indexOf(r.fec)).u8(r.repeat).finish());
}
export function decodeRecommendation(t: string): Recommendation | null {
  if (!t.startsWith(REC_PREFIX)) return null;
  try {
    const r = new ByteReader(fromB64Url(t.slice(REC_PREFIX.length)));
    const mode = r.u8() === 0 ? 'optical' : 'qr', gx = r.u8(), gy = r.u8(), R = r.u16(), bpc = r.u8(), qrVersion = r.u8();
    const qrEcc = (['L', 'M', 'Q', 'H'] as QrEcc[])[r.u8()], frameMs = r.u16(), fec = FEC_ORDER[r.u8()], repeat = r.u8();
    return { mode, gx, gy, R, bpc, qrVersion, qrEcc, frameMs, fec, repeat };
  } catch { return null; }
}

/** Deterministic test payload so the receiver can verify every test packet byte-for-byte. */
export function testPayload(nonce: number, seq: number, region: number, len: number): Uint8Array {
  const rnd = mulberry32((nonce ^ Math.imul(seq + 1, 0x9e3779b1) ^ Math.imul(region + 7, 0x85ebca6b)) >>> 0);
  return Uint8Array.from({ length: len }, () => (rnd() * 256) | 0);
}
export function buildTestFrame(p: OpticalParams, nonce: number, seq: number): Uint8Array {
  const g = geometryFor(p), len = chunkSizeFor(p), regions: Uint8Array[] = [];
  for (let r = 0; r < regionCount(g); r++) {
    const pkt = encodePacket({ type: PacketType.TEST, transferTag: nonce, frameSeq: seq, segIndex: 0, shardIdx: 0, regionIdx: r, payload: testPayload(nonce, seq, r, len) });
    regions.push(regionGray(p, pkt, r));
  }
  return composeFrame(g, regions, nonce & 0xffff, seq);
}

/** Pick the configuration with the best *reliable* throughput (not the highest theoretical payload). */
export function recommend(results: CalStepResult[], steps: Preset[] = CAL_STEPS): { rec: Recommendation | null; note: string } {
  const good = results.filter((r) => r.reliability >= 0.9).sort((a, b) => b.throughput - a.throughput);
  const ok = results.filter((r) => r.reliability >= 0.5).sort((a, b) => b.throughput - a.throughput);
  const pick = good[0] ?? ok[0];
  if (!pick) return { rec: null, note: 'No configuration decoded reliably. Improve lighting, move closer, avoid glare, and retry.' };
  const s = steps[pick.step], loss = 1 - pick.reliability;
  const fec: FecLevel = loss < 0.02 ? 'low' : loss < 0.08 ? 'medium' : 'high';
  const repeat = pick.reliability < 0.7 ? 2 : 1;
  return {
    rec: { mode: s.mode, gx: s.gx, gy: s.gy, R: s.R, bpc: s.bpc, qrVersion: s.qrVersion, qrEcc: s.qrEcc, frameMs: s.frameMs, fec, repeat },
    note: good[0] ? 'Best reliable throughput measured on these two devices.' : 'Only marginal configurations found; using extra error correction.',
  };
}
