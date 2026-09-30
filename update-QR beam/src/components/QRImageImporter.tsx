import { useState, useRef } from 'react';
import { decodeBatchQrImages, type BatchDecodeProgress } from '../services/qr-relay/qrBatchDecoder';
import { FrameIndex } from '../services/qr-relay/frameIndex';
import { unpackQrZipFile, downloadBlob } from '../services/qr-relay/qrPackage';
import { saveRelayProgress, loadRelayProgress, clearRelayProgress } from '../services/qr-relay/relayRecovery';
import { sha256Bytes } from '../utils/checksum';
import MissingFramesPanel from './MissingFramesPanel';
import {
  IconUploadCloud,
  IconQr,
  IconCheck,
  IconAlertCircle,
  IconDownload,
  IconRefresh,
  IconShieldCheck,
  IconArchive,
  IconFile,
  IconInfo,
} from './Icons';

interface QRImageImporterProps {
  onVerified?: (file: Blob, fileName: string, sha256Hex: string) => void;
}

export default function QRImageImporter({ onVerified }: QRImageImporterProps) {
  const [frameIndex] = useState<FrameIndex>(() => new FrameIndex());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchDecodeProgress | null>(null);
  const [missingFrames, setMissingFrames] = useState<number[]>([]);
  const [manifestInfo, setManifestInfo] = useState<any | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedFile, setVerifiedFile] = useState<{
    blob: Blob;
    name: string;
    size: number;
    hash: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'idle' | 'images' | 'package'>('idle');

  // Two separate file inputs — one for images, one for ZIP packages
  const imageInputRef = useRef<HTMLInputElement>(null);
  const packageInputRef = useRef<HTMLInputElement>(null);

  // Helper to convert Uint8Array to hex string
  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Preparing and decoding images…');

    try {
      let imageFiles: File[] = [];

      // Extract images from any ZIP files
      for (const f of files) {
        if (f.name.endsWith('.zip') || f.type.includes('zip') || f.type === 'application/octet-stream') {
          setStatusMessage(`Unpacking QR package: ${f.name}…`);
          const unpacked = await unpackQrZipFile(f);
          if (unpacked.manifest) {
            setManifestInfo(unpacked.manifest);
            if (unpacked.manifest.totalFrames) {
              frameIndex.setTotalExpected(unpacked.manifest.totalFrames);
            }
          }
          imageFiles.push(...unpacked.imageFiles);
        } else if (f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name)) {
          imageFiles.push(f);
        }
      }

      if (imageFiles.length === 0) {
        setErrorMessage('No valid image or ZIP package files found. Please select QR image files (.png, .jpg, .webp) or a QRBeam_Transfer_*.zip package.');
        setIsProcessing(false);
        return;
      }

      setStatusMessage(`Decoding ${imageFiles.length.toLocaleString()} QR images…`);

      const result = await decodeBatchQrImages(imageFiles, {
        existingIndex: frameIndex,
        totalExpected: manifestInfo?.totalFrames,
        onProgress: (p) => setProgress(p),
      });

      const missing = result.missingFrames;
      setMissingFrames(missing);

      // Save partial progress to IndexedDB for recovery
      if (manifestInfo?.transferId) {
        await saveRelayProgress(
          manifestInfo.transferId,
          {
            fileName: manifestInfo.fileName || 'recovered_file',
            fileSize: manifestInfo.fileSize || 0,
            totalFrames: manifestInfo.totalFrames || frameIndex.getStats().totalExpected,
            expectedHash: manifestInfo.fileHash || '',
          },
          frameIndex.getAllFrames()
        );
      }

      // If complete, reassemble and verify
      if (result.isComplete || (missing.length === 0 && frameIndex.getStats().uniqueCount > 0)) {
        setStatusMessage('Reassembling and verifying SHA-256 checksum…');
        const reassembledBytes = frameIndex.reassemble();
        const computedHash = toHex(sha256Bytes(reassembledBytes));

        const expectedHash = manifestInfo?.fileHash;
        if (expectedHash && expectedHash.toLowerCase() !== computedHash.toLowerCase()) {
          setErrorMessage(
            `SHA-256 verification failed! Expected: ${expectedHash.slice(0, 16)}… Computed: ${computedHash.slice(0, 16)}…`
          );
        } else {
          const fileName = manifestInfo?.fileName || `qrbeam_received_${Date.now()}`;
          const mimeType = manifestInfo?.mimeType || 'application/octet-stream';
          const blob = new Blob([reassembledBytes as any], { type: mimeType });

          setIsVerified(true);
          setVerifiedFile({
            blob,
            name: fileName,
            size: reassembledBytes.length,
            hash: computedHash,
          });

          if (manifestInfo?.transferId) {
            await clearRelayProgress(manifestInfo.transferId);
          }

          onVerified?.(blob, fileName, computedHash);
          setStatusMessage('Transfer 100% verified byte-for-byte!');
        }
      } else {
        setStatusMessage(
          `Decoded ${result.stats.uniqueCount} unique frames. ${missing.length} frame${missing.length === 1 ? '' : 's'} missing.`
        );
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMessage(err?.message || 'Error decoding images');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDownloadVerified = () => {
    if (!verifiedFile) return;
    downloadBlob(verifiedFile.blob, verifiedFile.name);
  };

  const handleReset = () => {
    frameIndex.clear();
    setProgress(null);
    setMissingFrames([]);
    setManifestInfo(null);
    setIsVerified(false);
    setVerifiedFile(null);
    setStatusMessage(null);
    setErrorMessage(null);
    setImportMode('idle');
  };

  const stats = frameIndex.getStats();

  // ----- Verified Complete Card -----
  if (isVerified && verifiedFile) {
    return (
      <div className="space-y-6">
        <div className="panel p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
              <IconShieldCheck className="w-6 h-6 text-emerald-400" />
              <span>✓ TRANSFER VERIFIED</span>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              SHA-256: MATCH
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">File</span>
              <span className="text-white font-medium truncate block mt-0.5">{verifiedFile.name}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Size</span>
              <span className="text-white font-mono mt-0.5 block">
                {verifiedFile.size >= 1024 * 1024
                  ? `${(verifiedFile.size / (1024 * 1024)).toFixed(2)} MB`
                  : `${(verifiedFile.size / 1024).toFixed(1)} KB`}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Integrity</span>
              <span className="text-emerald-400 font-bold mt-0.5 block">100% VERIFIED</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 sm:col-span-2 lg:col-span-1">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">SHA-256</span>
              <span className="text-emerald-300 font-mono text-[11px] truncate block mt-0.5">
                {verifiedFile.hash.slice(0, 32)}…
              </span>
            </div>
          </div>

          {/* Full SHA-256 */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Full SHA-256 Digest</span>
            <span className="text-emerald-300 font-mono text-[11px] break-all">{verifiedFile.hash}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              id="save-verified-file-btn"
              onClick={handleDownloadVerified}
              className="btn btn-primary flex items-center gap-2"
            >
              <IconDownload className="w-4 h-4" />
              <span>Save {verifiedFile.name}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn bg-slate-800 border border-white/10 hover:border-white/25 text-slate-300"
            >
              Import Another Transfer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Main Import UI -----
  return (
    <div className="space-y-6">

      {/* QR Image Quality Note */}
      {importMode === 'idle' && (
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-start gap-2.5 text-xs text-slate-300">
          <IconInfo className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            For best reliability, share QR images as <strong>original files/documents</strong> rather than compressed preview images (e.g. in WhatsApp, use "Document" not "Photo" to preserve quality).
          </div>
        </div>
      )}

      {/* Two distinct import action buttons (Section 13 spec layout) */}
      {importMode === 'idle' && !isVerified && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Option A: Import QR Images (individual files) */}
          <button
            type="button"
            id="import-qr-images-btn"
            onClick={() => {
              setImportMode('images');
              imageInputRef.current?.click();
            }}
            className="group flex flex-col items-center gap-4 p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-purple-500/50 hover:bg-slate-800/40 transition-all cursor-pointer text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <IconQr className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                🖼 Import QR Images
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select individual QR PNG/JPG files. Multi-select supported: 5, 50, 100, 500, 1000+. Any order works.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              <span className="badge badge-indigo text-[10px]">Any Order</span>
              <span className="badge badge-cyan text-[10px]">Dupes Auto-Filtered</span>
            </div>
          </button>

          {/* Option B: Import QR Package (ZIP) */}
          <button
            type="button"
            id="import-qr-package-btn"
            onClick={() => {
              setImportMode('package');
              packageInputRef.current?.click();
            }}
            className="group flex flex-col items-center gap-4 p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/40 transition-all cursor-pointer text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <IconArchive className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                📦 Import QR Package
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select a <code>QRBeam_Transfer_*.zip</code> file received via WhatsApp, Telegram, Email, or Drive. QRBeam decodes it automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              <span className="badge badge-purple text-[10px]">Auto Extract</span>
              <span className="badge badge-emerald text-[10px]">Resume Supported</span>
            </div>
          </button>
        </div>
      )}

      {/* Drag-and-Drop Zone (visible when mode is set or if already has frames) */}
      {(importMode !== 'idle' || stats.receivedCount > 0) && !isVerified && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => {
            if (importMode === 'package') packageInputRef.current?.click();
            else imageInputRef.current?.click();
          }}
          className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 hover:bg-slate-800/40 transition-all duration-200 rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <IconUploadCloud className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
            {importMode === 'package' ? 'Drop ZIP Package or Click to Browse' : 'Drop QR Images or Click to Browse More'}
          </div>
          <p className="text-xs text-slate-400 max-w-sm">
            {importMode === 'package'
              ? 'Select QRBeam_Transfer_*.zip package from your device'
              : 'Add more QR image files — existing frames are preserved (no restart needed)'}
          </p>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) processFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={packageInputRef}
        type="file"
        accept=".zip,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) processFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {/* Live Decoding Progress (shown during processing) */}
      {isProcessing && progress && (
        <div className="panel p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-purple-300 flex items-center gap-2">
              <IconRefresh className="w-3.5 h-3.5 animate-spin text-purple-400" />
              Decoding QR Images…
            </span>
            <span className="font-mono text-purple-400 font-bold">{progress.percent}%</span>
          </div>
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} images
            {progress.currentFileName && (
              <span className="ml-2 text-slate-500 truncate inline-block max-w-[200px] align-bottom">
                — {progress.currentFileName}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Frame Statistics (Section 16 & 25) */}
      {stats.receivedCount > 0 && !isVerified && (
        <div className="panel p-5 space-y-4">
          <div className="flex items-center justify-between text-xs border-b border-white/5 pb-3">
            <span className="font-bold text-white flex items-center gap-2">
              <IconQr className="w-4 h-4 text-purple-400" />
              QR Relay — Batch Decode Progress
            </span>
            <span className="font-mono text-purple-400 font-bold">{stats.progressPercent}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-200"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>

          {/* Stats Grid (Section 25 layout) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Frames</span>
              <span className="text-slate-200 font-mono font-bold mt-0.5 block">
                {stats.uniqueCount.toLocaleString()} / {stats.totalExpected > 0 ? stats.totalExpected.toLocaleString() : '?'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Unique</span>
              <span className="text-emerald-400 font-mono font-bold mt-0.5 block">{stats.uniqueCount.toLocaleString()}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Duplicates</span>
              <span className="text-amber-400 font-mono font-bold mt-0.5 block">{stats.duplicateCount.toLocaleString()}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Invalid</span>
              <span className="text-rose-400 font-mono font-bold mt-0.5 block">{stats.invalidCount.toLocaleString()}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5 col-span-2 sm:col-span-1">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Missing</span>
              <span
                className={`font-mono font-bold mt-0.5 block ${
                  stats.missingCount === 0 ? 'text-emerald-400' : 'text-cyan-400'
                }`}
              >
                {stats.missingCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* File info from manifest */}
          {manifestInfo?.fileName && (
            <div className="text-xs text-slate-400 font-mono px-1">
              File: <span className="text-white">{manifestInfo.fileName}</span>
              {manifestInfo.fileSize > 0 && (
                <span className="ml-2">
                  ({manifestInfo.fileSize >= 1024 * 1024
                    ? `${(manifestInfo.fileSize / (1024 * 1024)).toFixed(2)} MB`
                    : `${(manifestInfo.fileSize / 1024).toFixed(1)} KB`})
                </span>
              )}
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className="text-xs text-slate-300 font-mono flex items-center gap-2">
              {isProcessing && <IconRefresh className="w-3.5 h-3.5 animate-spin text-purple-400" />}
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <IconAlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Missing Frames Panel (Section 19) */}
          {stats.missingCount > 0 && !isProcessing && (
            <MissingFramesPanel
              totalExpected={stats.totalExpected}
              receivedCount={stats.uniqueCount}
              missingFrames={missingFrames}
              onImportMore={() => {
                // Allow importing more regardless of mode (images or zip)
                imageInputRef.current?.click();
              }}
            />
          )}

          {/* Reset */}
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 text-slate-400 w-full"
          >
            Reset / Start New Transfer
          </button>
        </div>
      )}

      {/* Error before any frames are received */}
      {errorMessage && stats.receivedCount === 0 && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <IconAlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
