/**
 * QR Image Relay Generator
 *
 * Generates QR images from binary packets incrementally (chunk-by-chunk).
 * NEVER pre-generates all frames for large files.
 *
 * Packet binary format (inside QR payload):
 *   [0..1]   MAGIC: 0x5142 ('QB')
 *   [2]      PROTOCOL_VERSION << 4 | packet_type (1=DATA)
 *   [3..6]   TRANSFER_TAG (first 4 bytes of transferId)
 *   [7..10]  FRAME_SEQUENCE (u32)
 *   [11..14] CHUNK_INDEX (u32, = segIndex)
 *   [15]     BLOCK_INDEX (u8, = shardIdx)
 *   [16]     REGION_INDEX (u8)
 *   [17..18] PAYLOAD_LENGTH (u16)
 *   [19..N]  PAYLOAD
 *   [N+1..N+8] SHA-256 truncated checksum (8 bytes)
 *
 * This reuses the existing encodePacket binary format exactly.
 */

import QRCode from 'qrcode';
import { encodePacket } from '../protocol/packet';
import type { Packet } from '../../types/packet';
import type { TransferHeader } from '../../types/transfer';

const RELAY_QR_VERSION = 20; // QR version 20 = ~1273 bytes max at L ECC
const RELAY_QR_ECC: QRCode.QRCodeErrorCorrectionLevel = 'L'; // max capacity
const RELAY_MAX_PAYLOAD = 400; // bytes per QR frame (conservative for reliability)

export interface RelayQrFrame {
  frameSeq: number;
  chunkIndex: number;
  blockIndex: number;
  regionIndex: number;
  packet: Uint8Array;
}

export interface RelayQrImage {
  frameSeq: number;
  dataUrl: string;
  width: number;
  height: number;
}

/** Calculate the maximum payload size that fits in one relay QR. */
export function relayPayloadMaxBytes(): number {
  return RELAY_MAX_PAYLOAD;
}

/** Calculate total QR frames needed for a file. */
export function estimateRelayFrameCount(fileSize: number, payloadMax = RELAY_MAX_PAYLOAD): number {
  return Math.ceil(fileSize / payloadMax);
}

/** Estimated QR package size in bytes (rough estimate). */
export function estimatePackageSize(frameCount: number): number {
  // Each PNG QR is roughly 8–15 KB depending on version
  return frameCount * 10 * 1024;
}

/**
 * Build a relay packet (same binary format as encodePacket).
 */
export function buildRelayPacket(
  transferTag: number,
  frameSeq: number,
  chunkIndex: number,
  blockIndex: number,
  regionIndex: number,
  payload: Uint8Array
): Uint8Array {
  const pkt: Packet = {
    type: 1, // DATA
    transferTag,
    frameSeq,
    segIndex: chunkIndex,
    shardIdx: blockIndex,
    regionIdx: regionIndex,
    payload,
  };
  return encodePacket(pkt);
}

/**
 * Encode a single packet as a QR PNG data URL.
 * Returns null if the packet is too large for a QR code at these settings.
 */
export async function encodePacketToQrDataUrl(packetBytes: Uint8Array): Promise<string | null> {
  try {
    const seg = [{ data: packetBytes, mode: 'byte' }];
    const dataUrl: string = await (QRCode.toDataURL as any)(seg, {
      errorCorrectionLevel: RELAY_QR_ECC,
      type: 'image/png',
      margin: 2,
      scale: 4,
    });
    return dataUrl;
  } catch {
    return null;
  }
}


/**
 * Generate a single relay QR image for a chunk of data.
 * Yields one RelayQrImage per payload chunk.
 *
 * Usage: call in a loop, release each image after use or download.
 */
export async function generateRelayQrImage(
  transferTag: number,
  frameSeq: number,
  chunkIndex: number,
  blockIndex: number,
  regionIndex: number,
  payload: Uint8Array
): Promise<RelayQrImage | null> {
  const packetBytes = buildRelayPacket(
    transferTag, frameSeq, chunkIndex, blockIndex, regionIndex, payload
  );
  const dataUrl = await encodePacketToQrDataUrl(packetBytes);
  if (!dataUrl) return null;
  return { frameSeq, dataUrl, width: 400, height: 400 };
}

/**
 * Split file data into relay-sized chunks and yield frame metadata.
 * Does NOT generate QR images — call generateRelayQrImage() per frame.
 */
export function* splitIntoRelayFrames(
  fileData: Uint8Array,
  transferTag: number,
  startFrameSeq = 0
): Generator<RelayQrFrame> {
  let frameSeq = startFrameSeq;
  let offset = 0;
  let chunkIndex = 0;

  while (offset < fileData.length) {
    const end = Math.min(offset + RELAY_MAX_PAYLOAD, fileData.length);
    const payload = fileData.slice(offset, end);
    yield {
      frameSeq,
      chunkIndex,
      blockIndex: 0,
      regionIndex: 0,
      packet: buildRelayPacket(transferTag, frameSeq, chunkIndex, 0, 0, payload),
    };
    offset = end;
    frameSeq++;
    chunkIndex++;
  }
}

/**
 * Create a QR manifest object for inclusion in a QR package.
 */
export function createRelayManifest(
  header: TransferHeader,
  headerBytes: Uint8Array,
  totalFrames: number,
  fileHash: string
): object {
  return {
    magic: 'QRBEAM_RELAY',
    protocolVersion: 1,
    transferId: Array.from(header.transferId).map((b) => b.toString(16).padStart(2, '0')).join(''),
    fileName: header.fileName,
    fileSize: header.fileSize,
    mimeType: header.mimeType,
    totalFrames,
    fileHash,
    encrypted: header.encrypted,
    createdAt: Date.now(),
    headerB64: (() => {
      let b = '';
      headerBytes.forEach((byte) => (b += String.fromCharCode(byte)));
      return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    })(),
  };
}

/**
 * Encode a Uint8Array as base64url.
 */
export function uint8ToB64Url(bytes: Uint8Array): string {
  let b = '';
  bytes.forEach((byte) => (b += String.fromCharCode(byte)));
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
