import type { FecLevel, TransferHeader } from '../../types/transfer';
import { FEC_PARAMS } from '../../types/transfer';
import { randomBytes } from '../../utils/binary';
import { computeLayout } from '../file/layout';
import { chunkSizeFor, regionCellsFor, type OpticalParams } from '../optical/frameBuilder';
import { DEFAULT_KDF_ITERATIONS } from '../crypto/keyDerivation';
import { PROTOCOL_VERSION } from './packet';

export interface HeaderInput {
  fileName: string; mimeType: string; fileSize: number; fileHash: Uint8Array;
  params: OpticalParams; frameMs: number; repeat: number; fec: FecLevel; encrypted: boolean; handshakeEverySec: number;
}
export function buildHeader(i: HeaderInput): TransferHeader {
  const { k, p } = FEC_PARAMS[i.fec], chunkSize = chunkSizeFor(i.params);
  const layout = computeLayout(i.fileSize, chunkSize, k, p, i.encrypted);
  const id = randomBytes(8);
  return {
    protocolVersion: PROTOCOL_VERSION, transferId: id, fileId: (id[0] << 8) | id[1], fileName: i.fileName, mimeType: i.mimeType, fileSize: i.fileSize,
    chunkSize, totalChunks: layout.totalChunks, mode: i.params.mode, gx: i.params.gx, gy: i.params.gy,
    regionCells: regionCellsFor(i.params), bpc: i.params.bpc, qrVersion: i.params.qrVersion, qrEcc: i.params.qrEcc,
    segK: k, segP: p, interleave: 4, frameMs: i.frameMs, repeat: i.repeat, handshakeEverySec: i.handshakeEverySec,
    hashAlg: 1, fileHash: i.fileHash, encrypted: i.encrypted,
    kdfSalt: i.encrypted ? randomBytes(16) : new Uint8Array(0), kdfIterations: i.encrypted ? DEFAULT_KDF_ITERATIONS : 0,
    ivPrefix: i.encrypted ? randomBytes(4) : new Uint8Array(0),
  };
}
