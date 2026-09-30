/**
 * QR Batch Decoder
 *
 * Robust, concurrent batch decoding for multiple imported QR images.
 * Tolerant of rotation, scaling, and contrast differences.
 * Uses jsQR with raw binaryData extraction.
 */

import jsQR from 'jsqr';
import { parsePacket } from '../protocol/packet';
import type { Packet } from '../../types/packet';
import { FrameIndex, type FrameStats } from './frameIndex';

export interface BatchDecodeProgress {
  processed: number;
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  missing: number;
  percent: number;
  currentFileName?: string;
}

export interface BatchDecodeResult {
  stats: FrameStats;
  frameIndex: FrameIndex;
  missingFrames: number[];
  isComplete: boolean;
  errors: Array<{ file: string; reason: string }>;
}

/**
 * Helper to load an image File/Blob into an HTMLImageElement
 */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file'));
    };
    img.src = url;
  });
}

/**
 * Scan an ImageData with jsQR, trying variations if needed.
 */
function scanImageData(data: ImageData): Uint8Array | null {
  // First attempt: direct scan
  let qr = jsQR(data.data, data.width, data.height, {
    inversionAttempts: 'attemptBoth',
  });

  if (qr && qr.binaryData && qr.binaryData.length > 0) {
    return new Uint8Array(qr.binaryData);
  }

  // Fallback: If binaryData is missing or empty, try utf-8 / binary string in data
  if (qr && qr.data) {
    const bytes = new Uint8Array(qr.data.length);
    for (let i = 0; i < qr.data.length; i++) {
      bytes[i] = qr.data.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  return null;
}

/**
 * Decode a single image file to a Packet.
 * Attempts rotated / adjusted canvases if initial attempt fails.
 */
export async function decodeQrImageFile(file: Blob): Promise<Packet | null> {
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let rawBytes = scanImageData(imgData);

    // If direct scan fails, try 90-degree rotations (for photos taken in portrait/landscape)
    if (!rawBytes && (canvas.width > 200 && canvas.height > 200)) {
      for (const angle of [90, 180, 270]) {
        const rotCanvas = document.createElement('canvas');
        if (angle === 90 || angle === 270) {
          rotCanvas.width = canvas.height;
          rotCanvas.height = canvas.width;
        } else {
          rotCanvas.width = canvas.width;
          rotCanvas.height = canvas.height;
        }
        const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
        if (!rotCtx) continue;

        rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rotCtx.rotate((angle * Math.PI) / 180);
        rotCtx.drawImage(img, -canvas.width / 2, -canvas.height / 2);

        const rotData = rotCtx.getImageData(0, 0, rotCanvas.width, rotCanvas.height);
        rawBytes = scanImageData(rotData);
        if (rawBytes) break;
      }
    }

    if (!rawBytes) return null;

    // Parse packet
    const parseRes = parsePacket(rawBytes);
    if (!parseRes.ok || !parseRes.packet) {
      return null;
    }

    return parseRes.packet;
  } catch {
    return null;
  }
}

/**
 * Decode a batch of QR image files sequentially or with chunked concurrency.
 */
export async function decodeBatchQrImages(
  files: File[],
  options: {
    existingIndex?: FrameIndex;
    totalExpected?: number;
    transferTag?: number;
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (progress: BatchDecodeProgress) => void;
  } = {}
): Promise<BatchDecodeResult> {
  const frameIndex = options.existingIndex || new FrameIndex(options.totalExpected, options.transferTag);
  if (options.totalExpected) frameIndex.setTotalExpected(options.totalExpected);
  if (options.transferTag !== undefined) frameIndex.setTransferTag(options.transferTag);

  const total = files.length;
  let processed = 0;
  const errors: Array<{ file: string; reason: string }> = [];
  const concurrency = options.concurrency || 3; // Keep responsive on mobile / UI

  const updateProgress = (fileName?: string) => {
    const stats = frameIndex.getStats();
    options.onProgress?.({
      processed,
      total,
      valid: stats.uniqueCount,
      duplicates: stats.duplicateCount,
      invalid: stats.invalidCount,
      missing: stats.missingCount,
      percent: total > 0 ? Math.round((processed / total) * 100) : 0,
      currentFileName: fileName,
    });
  };

  // Process files in concurrency-sized chunks
  for (let i = 0; i < files.length; i += concurrency) {
    if (options.signal?.aborted) break;

    const chunk = files.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (file) => {
        if (options.signal?.aborted) return;
        try {
          const packet = await decodeQrImageFile(file);
          if (!packet) {
            frameIndex.recordInvalid();
            errors.push({ file: file.name, reason: 'No valid QRBeam packet found in image' });
          } else {
            const addResult = frameIndex.addPacket(packet);
            if (addResult === 'tag_mismatch') {
              errors.push({ file: file.name, reason: 'Packet belongs to a different transfer' });
            }
          }
        } catch (err: any) {
          frameIndex.recordInvalid();
          errors.push({ file: file.name, reason: err?.message || 'Decode error' });
        } finally {
          processed++;
          updateProgress(file.name);
        }
      })
    );
  }

  const finalStats = frameIndex.getStats();

  return {
    stats: finalStats,
    frameIndex,
    missingFrames: frameIndex.getMissingFrames(),
    isComplete: frameIndex.isComplete(),
    errors,
  };
}
