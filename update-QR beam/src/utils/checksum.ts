import { sha256 } from '@noble/hashes/sha2.js';
export const sha256Bytes = (d: Uint8Array): Uint8Array => sha256(d);
/** Truncated SHA-256 (first n bytes) used as the per-packet cryptographic checksum. */
export const truncSha = (d: Uint8Array, n = 8): Uint8Array => sha256(d).subarray(0, n);
export class Sha256Stream {
  private h = sha256.create();
  private res?: Uint8Array;
  update(d: Uint8Array) {
    if (this.res) throw new Error('Cannot update after digest');
    this.h.update(d);
    return this;
  }
  digest(): Uint8Array {
    if (!this.res) this.res = this.h.digest();
    return this.res;
  }
}
