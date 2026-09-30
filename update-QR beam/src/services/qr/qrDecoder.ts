import jsQR from 'jsqr';

/** Decode one QR from a gray image (used for text handshakes). */
export function decodeQrGray(gray: Uint8Array, w: number, h: number): { text: string; bytes: Uint8Array } | null {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) { rgba[j] = rgba[j + 1] = rgba[j + 2] = gray[i]; rgba[j + 3] = 255; }
  const r = jsQR(rgba, w, h, { inversionAttempts: 'attemptBoth' });
  return r ? { text: r.data, bytes: Uint8Array.from(r.binaryData) } : null;
}
/** Decode a QR region from measured module luminance (R*R floats). Returns raw bytes. */
export function decodeQrRegion(lum: Float32Array, R: number): Uint8Array | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < lum.length; i++) { lo = Math.min(lo, lum[i]); hi = Math.max(hi, lum[i]); }
  if (hi - lo < 40) return null;
  const t = (lo + hi) / 2, S = 4, w = R * S;
  const rgba = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const v = lum[Math.floor(y / S) * R + Math.floor(x / S)] < t ? 0 : 255, o = (y * w + x) * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
  }
  const r = jsQR(rgba, w, w, { inversionAttempts: 'dontInvert' });
  return r ? Uint8Array.from(r.binaryData) : null;
}
export function decodeQrRgba(rgba: Uint8ClampedArray, w: number, h: number): string | null {
  const r = jsQR(rgba, w, h, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}
