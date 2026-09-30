import { ByteReader, ByteWriter, fromB64Url, toB64Url } from '../../utils/binary';
import { crc32 } from '../../utils/crc';
import { encryptMeta, decryptMeta } from '../crypto/encryption';
import type { QrEcc, TransferHeader } from '../../types/transfer';
import { PROTOCOL_VERSION } from './packet';

const MAGIC = [0x51, 0x52, 0x42, 0x31]; // 'QRB1'
const ECC: QrEcc[] = ['L', 'M', 'Q', 'H'];
export const HANDSHAKE_PREFIX = 'QRBEAM1:';

export function metaPlain(h: Pick<TransferHeader, 'fileName' | 'mimeType' | 'fileHash'>): Uint8Array {
  return new ByteWriter(200).str8(h.fileName, 120).str8(h.mimeType, 60).bytes(h.fileHash).finish();
}

/** Serialize a header. If h.encrypted, the meta block (name, mime, hash) is AES-GCM encrypted with `key`. */
export async function encodeHeader(h: TransferHeader, key?: CryptoKey): Promise<Uint8Array> {
  const w = new ByteWriter(300);
  w.bytes(new Uint8Array(MAGIC)).u8(h.protocolVersion).bytes(h.transferId).u32(h.fileId)
    .u8(h.mode === 'optical' ? 0 : 1).u8(h.encrypted ? 1 : 0)
    .u8(h.gx).u8(h.gy).u16(h.regionCells).u8(h.bpc).u8(h.qrVersion).u8(ECC.indexOf(h.qrEcc))
    .u16(h.chunkSize).u8(h.segK).u8(h.segP).u8(h.interleave).u32(h.totalChunks).u64(h.fileSize)
    .u16(h.frameMs).u8(h.repeat).u8(h.hashAlg).u8(h.handshakeEverySec);
  if (h.encrypted) w.bytes(h.kdfSalt).u32(h.kdfIterations).bytes(h.ivPrefix);
  let meta = metaPlain(h);
  if (h.encrypted) {
    if (!key) throw new Error('encryption key required');
    meta = await encryptMeta(key, h.ivPrefix, meta);
  }
  w.u16(meta.length).bytes(meta);
  const body = w.finish();
  return new ByteWriter(body.length + 4).bytes(body).u32(crc32(body)).finish();
}

export interface RawHeader { header: TransferHeader; metaBlob: Uint8Array }

/** Parse and CRC-check a header. Meta is left unresolved when encrypted (fileName = ''). */
export function decodeHeaderRaw(bytes: Uint8Array): RawHeader {
  if (bytes.length < 8) throw new Error('header too short');
  const body = bytes.subarray(0, bytes.length - 4);
  const crc = new ByteReader(bytes, bytes.length - 4).u32();
  if (crc32(body) !== crc) throw new Error('header checksum mismatch');
  const r = new ByteReader(body);
  const m = r.bytes(4);
  if (MAGIC.some((v, i) => m[i] !== v)) throw new Error('bad magic');
  const protocolVersion = r.u8();
  if (protocolVersion !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${protocolVersion}`);
  const transferId = r.bytes(8).slice();
  const fileId = r.u32();
  const mode = r.u8() === 0 ? 'optical' : 'qr';
  const encrypted = (r.u8() & 1) === 1;
  const gx = r.u8(), gy = r.u8(), regionCells = r.u16(), bpc = r.u8(), qrVersion = r.u8();
  const qrEcc = ECC[r.u8()] ?? 'L';
  const chunkSize = r.u16(), segK = r.u8(), segP = r.u8(), interleave = r.u8();
  const totalChunks = r.u32(), fileSize = r.u64();
  const frameMs = r.u16(), repeat = r.u8(), hashAlg = r.u8(), handshakeEverySec = r.u8();
  let kdfSalt = new Uint8Array(0), kdfIterations = 0, ivPrefix = new Uint8Array(0);
  if (encrypted) { kdfSalt = r.bytes(16).slice(); kdfIterations = r.u32(); ivPrefix = r.bytes(4).slice(); }
  const metaBlob = r.bytes(r.u16()).slice();
  const header: TransferHeader = {
    protocolVersion, transferId, fileId, fileName: '', mimeType: '', fileSize, chunkSize, totalChunks, mode,
    gx, gy, regionCells, bpc, qrVersion, qrEcc, segK, segP, interleave, frameMs, repeat, handshakeEverySec,
    hashAlg, fileHash: new Uint8Array(0), encrypted, kdfSalt, kdfIterations, ivPrefix,
  };
  if (!encrypted) applyMeta(header, metaBlob);
  return { header, metaBlob };
}

function applyMeta(h: TransferHeader, meta: Uint8Array) {
  const r = new ByteReader(meta);
  h.fileName = r.str8(); h.mimeType = r.str8(); h.fileHash = r.bytes(32).slice();
}

/** For encrypted headers: decrypt the meta block. Throws if the key/password is wrong. */
export async function resolveEncryptedMeta(raw: RawHeader, key: CryptoKey): Promise<TransferHeader> {
  const plain = await decryptMeta(key, raw.header.ivPrefix, raw.metaBlob);
  const h = { ...raw.header };
  applyMeta(h, plain);
  return h;
}

export const handshakeToText = (b: Uint8Array) => HANDSHAKE_PREFIX + toB64Url(b);
export function handshakeFromText(t: string): Uint8Array | null {
  if (!t.startsWith(HANDSHAKE_PREFIX)) return null;
  try { return fromB64Url(t.slice(HANDSHAKE_PREFIX.length)); } catch { return null; }
}
export const transferTag = (id: Uint8Array) => new ByteReader(id).u32();
