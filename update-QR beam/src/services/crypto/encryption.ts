import { ByteWriter, concat } from '../../utils/binary';

function iv(prefix: Uint8Array, index: number): Uint8Array {
  return new ByteWriter(12).bytes(prefix).u64(index).finish();
}
export const GCM_TAG = 16;
export const META_IV_INDEX = 2 ** 53 - 1; // never collides with a segment index

export async function encryptSegment(key: CryptoKey, prefix: Uint8Array, seg: number, plain: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(prefix, seg) as BufferSource }, key, plain as BufferSource));
}
export async function decryptSegment(key: CryptoKey, prefix: Uint8Array, seg: number, cipher: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv(prefix, seg) as BufferSource }, key, cipher as BufferSource));
}
export const encryptMeta = (key: CryptoKey, prefix: Uint8Array, meta: Uint8Array) => encryptSegment(key, prefix, META_IV_INDEX, meta);
export const decryptMeta = (key: CryptoKey, prefix: Uint8Array, blob: Uint8Array) => decryptSegment(key, prefix, META_IV_INDEX, blob);
export { concat };
