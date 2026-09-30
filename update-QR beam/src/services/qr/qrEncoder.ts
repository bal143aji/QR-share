import QRCode from 'qrcode';
import type { QrEcc } from '../../types/transfer';

export const QUIET = 2;
export const qrRegionSize = (version: number) => 17 + 4 * version + 2 * QUIET;
const capCache = new Map<string, number>();

function create(data: Uint8Array | string, version: number | undefined, ecc: QrEcc) {
  const seg: any = typeof data === 'string' ? data : [{ data, mode: 'byte' }];
  return QRCode.create(seg, { version, errorCorrectionLevel: ecc } as any);
}
/** Max binary bytes a fixed QR version/ECC can carry (probed with the QR library itself). */
export function qrCapacity(version: number, ecc: QrEcc): number {
  const key = `${version}:${ecc}`;
  let c = capCache.get(key);
  if (c) return c;
  let lo = 1, hi = 3000;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    try { create(new Uint8Array(mid), version, ecc); lo = mid; } catch { hi = mid - 1; }
  }
  capCache.set(key, lo);
  return lo;
}
/** Binary packet -> R*R gray block (0 = dark module) with a 2-module quiet zone. */
export function qrRegionGray(bytes: Uint8Array, version: number, ecc: QrEcc): Uint8Array {
  const qr = create(bytes, version, ecc);
  const n = qr.modules.size, R = qrRegionSize(version);
  if (n !== 17 + 4 * version) throw new Error('unexpected QR version');
  const out = new Uint8Array(R * R).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (qr.modules.data[y * n + x]) out[(y + QUIET) * R + x + QUIET] = 0;
  return out;
}
/** Text QR (handshake / calibration announcements) -> module matrix. */
export function qrMatrix(text: string, ecc: QrEcc = 'M'): { size: number; get: (x: number, y: number) => boolean } {
  const qr = create(text, undefined, ecc);
  const n = qr.modules.size;
  return { size: n, get: (x, y) => !!qr.modules.data[y * n + x] };
}
