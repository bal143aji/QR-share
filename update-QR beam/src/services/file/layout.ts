import { GCM_TAG } from '../crypto/encryption';

export interface Segment {
  index: number; plainOffset: number; plainLen: number; transportLen: number;
  k: number; p: number; n: number; firstChunk: number;
}
export interface Layout { segments: Segment[]; totalChunks: number; segPlainCap: number; chunkSize: number }

export const parityFor = (k: number, kFull: number, pFull: number) =>
  k === kFull ? pFull : Math.ceil((pFull * k) / kFull);

/** Deterministic segment layout shared by sender and receiver. */
export function computeLayout(fileSize: number, chunkSize: number, kFull: number, pFull: number, encrypted: boolean): Layout {
  const overhead = encrypted ? GCM_TAG : 0;
  const segPlainCap = kFull * chunkSize - overhead;
  const count = Math.max(1, Math.ceil(fileSize / segPlainCap));
  const segments: Segment[] = [];
  let first = 0;
  for (let i = 0; i < count; i++) {
    const plainOffset = i * segPlainCap;
    const plainLen = Math.min(segPlainCap, fileSize - plainOffset);
    const transportLen = plainLen + overhead;
    const k = Math.max(1, Math.ceil(transportLen / chunkSize));
    const p = pFull === 0 ? 0 : parityFor(k, kFull, pFull);
    segments.push({ index: i, plainOffset, plainLen, transportLen, k, p, n: k + p, firstChunk: first });
    first += k;
  }
  return { segments, totalChunks: first, segPlainCap, chunkSize };
}
