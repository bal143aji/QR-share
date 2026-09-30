export type TransferMode = 'optical' | 'qr';
export type FecLevel = 'off' | 'low' | 'medium' | 'high';
export type QrEcc = 'L' | 'M' | 'Q' | 'H';

/** Reed-Solomon segment geometry per FEC level (k data + p parity shards, k+p <= 255). */
export const FEC_PARAMS: Record<FecLevel, { k: number; p: number }> = {
  off: { k: 240, p: 0 },
  low: { k: 240, p: 15 },
  medium: { k: 224, p: 31 },
  high: { k: 192, p: 63 },
};

export interface TransferHeader {
  protocolVersion: number;
  transferId: Uint8Array; // 8 bytes
  fileId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  mode: TransferMode;
  gx: number;
  gy: number;
  regionCells: number;
  bpc: number;
  qrVersion: number;
  qrEcc: QrEcc;
  segK: number;
  segP: number;
  interleave: number;
  frameMs: number;
  repeat: number;
  handshakeEverySec: number;
  hashAlg: number; // 1 = SHA-256
  fileHash: Uint8Array; // SHA-256 of the ORIGINAL (plaintext) file; empty if unknown (encrypted, no key)
  encrypted: boolean;
  kdfSalt: Uint8Array;
  kdfIterations: number;
  ivPrefix: Uint8Array;
}

export type SenderState =
  | 'IDLE' | 'FILE_SELECTED' | 'HASHING' | 'CALIBRATING' | 'HANDSHAKE'
  | 'TRANSMITTING' | 'PAUSED' | 'COMPLETE' | 'ERROR';
export type ReceiverState =
  | 'IDLE' | 'CAMERA_READY' | 'WAITING_FOR_HANDSHAKE' | 'HANDSHAKE_RECEIVED' | 'RECEIVING'
  | 'VERIFYING' | 'REASSEMBLING' | 'HASH_CHECK' | 'COMPLETE' | 'ERROR' | 'RECOVERY';
