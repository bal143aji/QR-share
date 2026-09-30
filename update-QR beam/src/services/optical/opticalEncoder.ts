import { crc16 } from '../../utils/crc';
import { FINDER, MARGIN, STRIP_BITS, type FrameGeometry, regionOrigin, regionCount } from './geometry';

export const refCells = (bpc: number) => 2 * (1 << bpc);
export const regionCapacityBytes = (R: number, bpc: number) => Math.floor(((R * R - refCells(bpc)) * bpc) / 8);

/** Fixed per-region pseudo-random mask so payloads are DC-balanced (no big black/white areas). */
export function whitenMask(regionIdx: number, len: number): Uint8Array {
  let s = (Math.imul(regionIdx + 1, 0x9e3779b1) ^ 0x1234567) >>> 0 || 1;
  const m = new Uint8Array(len);
  for (let i = 0; i < len; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; m[i] = s & 0xff; }
  return m;
}

/** Packet bytes -> R*R gray values (0..255). Cells: [reference levels x2][data symbols]. */
export function encodeRegionGray(pkt: Uint8Array, R: number, bpc: number, regionIdx: number): Uint8Array {
  const cap = regionCapacityBytes(R, bpc);
  if (pkt.length > cap) throw new Error(`packet ${pkt.length}B exceeds region capacity ${cap}B`);
  const buf = new Uint8Array(cap); buf.set(pkt);
  const mask = whitenMask(regionIdx, cap);
  for (let i = 0; i < cap; i++) buf[i] ^= mask[i];
  const L = 1 << bpc, out = new Uint8Array(R * R).fill(255);
  const level = (s: number) => Math.round((255 * s) / (L - 1));
  const nref = refCells(bpc);
  for (let i = 0; i < nref; i++) out[i] = level(i % L);
  const per = 8 / bpc; let ci = nref;
  for (let i = 0; i < cap; i++) {
    for (let k = 0; k < per; k++) {
      const s = (buf[i] >> (8 - bpc * (k + 1))) & (L - 1);
      out[ci++] = level(s);
    }
  }
  return out;
}

/** Decode measured luminance (R*R floats) back to de-whitened bytes; null if reference levels are unusable. */
export function decodeRegionLum(lum: Float32Array, R: number, bpc: number, regionIdx: number): Uint8Array | null {
  const L = 1 << bpc, nref = refCells(bpc);
  const ref = new Float64Array(L);
  for (let i = 0; i < nref; i++) ref[i % L] += lum[i] / 2;
  for (let s = 1; s < L; s++) if (ref[s] - ref[s - 1] < 12) return null;
  const thr: number[] = [];
  for (let s = 0; s < L - 1; s++) thr.push((ref[s] + ref[s + 1]) / 2);
  const cap = regionCapacityBytes(R, bpc), per = 8 / bpc;
  const out = new Uint8Array(cap);
  let ci = nref;
  for (let i = 0; i < cap; i++) {
    let v = 0;
    for (let k = 0; k < per; k++) {
      const x = lum[ci++]; let s = 0;
      while (s < L - 1 && x > thr[s]) s++;
      v = (v << bpc) | s;
    }
    out[i] = v;
  }
  const mask = whitenMask(regionIdx, cap);
  for (let i = 0; i < cap; i++) out[i] ^= mask[i];
  return out;
}

/** Frame-level sync strip: tid16 | seq32 | crc16 = 64 bits, black=1. */
export function stripBits(tid16: number, seq: number): number[] {
  const b = new Uint8Array(8);
  b[0] = tid16 >> 8; b[1] = tid16 & 255;
  b[2] = (seq >>> 24) & 255; b[3] = (seq >>> 16) & 255; b[4] = (seq >>> 8) & 255; b[5] = seq & 255;
  const c = crc16(b.subarray(0, 6)); b[6] = c >> 8; b[7] = c & 255;
  const bits: number[] = [];
  for (let i = 0; i < 8; i++) for (let k = 7; k >= 0; k--) bits.push((b[i] >> k) & 1);
  return bits;
}
export function stripCell(g: FrameGeometry, i: number): [number, number] {
  const cols = g.W - 2 * MARGIN;
  return [MARGIN + (i % cols), 1 + Math.floor(i / cols)];
}
export function readStrip(g: FrameGeometry, lum: Float32Array): { tid16: number; seq: number } | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < STRIP_BITS; i++) { lo = Math.min(lo, lum[i]); hi = Math.max(hi, lum[i]); }
  if (hi - lo < 30) return null;
  const t = (lo + hi) / 2, b = new Uint8Array(8);
  for (let i = 0; i < STRIP_BITS; i++) if (lum[i] < t) b[i >> 3] |= 0x80 >> (i & 7);
  if (crc16(b.subarray(0, 6)) !== ((b[6] << 8) | b[7])) return null;
  return { tid16: (b[0] << 8) | b[1], seq: ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0 };
}

/** Compose the W*H gray frame (0..255) from per-region R*R gray blocks. */
export function composeFrame(g: FrameGeometry, regions: Uint8Array[], tid16: number, seq: number): Uint8Array {
  const { W, H, R } = g, out = new Uint8Array(W * H).fill(255);
  const fin = (x0: number, y0: number) => {
    for (let dy = 0; dy < FINDER; dy++) for (let dx = 0; dx < FINDER; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      out[(y0 + dy) * W + x0 + dx] = d === 3 || d <= 1 ? 0 : 255;
    }
  };
  fin(0, 0); fin(W - FINDER, 0); fin(0, H - FINDER); fin(W - FINDER, H - FINDER);
  stripBits(tid16, seq).forEach((bit, i) => { const [x, y] = stripCell(g, i); out[y * W + x] = bit ? 0 : 255; });
  for (let r = 0; r < regionCount(g); r++) {
    const [ox, oy] = regionOrigin(g, r), src = regions[r];
    for (let y = 0; y < R; y++) out.set(src.subarray(y * R, (y + 1) * R), (oy + y) * W + ox);
  }
  return out;
}
/** Add the white display pad (PAD cells) and expand to RGBA for canvas display. */
export function frameToRgba(cells: Uint8Array, W: number, H: number, pad: number): { data: Uint8ClampedArray; w: number; h: number } {
  const w = W + 2 * pad, h = H + 2 * pad, data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = cells[y * W + x], o = ((y + pad) * w + x + pad) * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
  }
  return { data, w, h };
}
