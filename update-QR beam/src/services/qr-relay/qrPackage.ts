/**
 * QR Package Exporter & Importer
 *
 * Packages generated QR code images into a standard .zip archive:
 *   QRBeam_Transfer_<transferId>.zip
 * containing:
 *   manifest.qrb
 *   QR_000001.png
 *   QR_000002.png
 *   ...
 *
 * Incrementally generates images chunk-by-chunk to preserve memory.
 */

import JSZip from 'jszip';
import type { TransferHeader } from '../../types/transfer';
import {
  generateRelayQrImage,
  createRelayManifest,
  estimateRelayFrameCount,
  relayPayloadMaxBytes,
} from './qrImageGenerator';

export interface QrPackageExportProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
}

export interface UnpackedQrPackage {
  manifest: any | null;
  imageFiles: File[];
}

/**
 * Generate a complete QRBeam ZIP package for a file.
 * Yields progress updates after each frame is generated.
 */
export async function createQrZipPackage(
  fileData: Uint8Array,
  header: TransferHeader,
  headerBytes: Uint8Array,
  fileHash: string,
  onProgress?: (progress: QrPackageExportProgress) => void,
  selectedFrames?: number[]
): Promise<Blob> {
  const zip = new JSZip();
  const maxPayload = relayPayloadMaxBytes();
  const totalFrames = estimateRelayFrameCount(fileData.length, maxPayload);
  const transferTag = new DataView(header.transferId.buffer, header.transferId.byteOffset, 4).getUint32(0, false);

  // Add manifest.qrb
  const manifest = createRelayManifest(header, headerBytes, totalFrames, fileHash);
  zip.file('manifest.qrb', JSON.stringify(manifest, null, 2));

  // Determine which frames to generate
  const framesToGenerate: number[] = selectedFrames && selectedFrames.length > 0
    ? selectedFrames
    : Array.from({ length: totalFrames }, (_, i) => i);

  let generated = 0;

  for (const seq of framesToGenerate) {
    const offset = seq * maxPayload;
    if (offset >= fileData.length) continue;

    const end = Math.min(offset + maxPayload, fileData.length);
    const chunkData = fileData.slice(offset, end);

    const qrImg = await generateRelayQrImage(
      transferTag,
      seq,
      seq, // chunkIndex
      0,   // blockIndex
      0,   // regionIndex
      chunkData
    );

    if (qrImg && qrImg.dataUrl) {
      // Convert base64 dataUrl to binary
      const base64Data = qrImg.dataUrl.split(',')[1];
      const filename = `QR_${String(seq + 1).padStart(6, '0')}.png`;
      zip.file(filename, base64Data, { base64: true });
    }

    generated++;
    if (onProgress) {
      onProgress({
        currentFrame: generated,
        totalFrames: framesToGenerate.length,
        percent: Math.round((generated / framesToGenerate.length) * 100),
      });
    }
  }

  // Generate ZIP blob with DEFLATE compression
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return zipBlob;
}

/**
 * Unpack a ZIP file uploaded to the receiver.
 * Extracts image files and manifest if present.
 */
export async function unpackQrZipFile(zipFile: Blob | File): Promise<UnpackedQrPackage> {
  const zip = await JSZip.loadAsync(zipFile);
  let manifest: any = null;
  const imageFiles: File[] = [];

  // Check for manifest
  const manifestFile = zip.file('manifest.qrb') || zip.file(/manifest\.json/i)[0];
  if (manifestFile) {
    try {
      const text = await manifestFile.async('text');
      manifest = JSON.parse(text);
    } catch {
      // Manifest parsing failed, continue with images
    }
  }

  // Find all image files
  const imageEntries = zip.file(/\.(png|jpe?g|webp)$/i);
  for (const entry of imageEntries) {
    if (entry.dir) continue;
    const blob = await entry.async('blob');
    const file = new File([blob], entry.name, { type: 'image/png' });
    imageFiles.push(file);
  }

  return {
    manifest,
    imageFiles,
  };
}

/**
 * Trigger browser file download for a Blob
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
