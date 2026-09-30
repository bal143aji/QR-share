import { useState, useEffect } from 'react';
import type { TransferHeader } from '../types/transfer';
import {
  estimateRelayFrameCount,
  estimatePackageSize,
  relayPayloadMaxBytes,
  generateRelayQrImage,
  type RelayQrImage,
} from '../services/qr-relay/qrImageGenerator';
import { createQrZipPackage, downloadBlob, type QrPackageExportProgress } from '../services/qr-relay/qrPackage';
import {
  IconDownload,
  IconArchive,
  IconChevronRight,
  IconQr,
  IconCheck,
  IconRefresh,
  IconSliders,
  IconAlertTriangle,
  IconInfo,
} from './Icons';

interface QRPackageExporterProps {
  file: File;
  fileBytes: Uint8Array;
  header: TransferHeader;
  headerBytes: Uint8Array;
  fileHash: string;
}

/** Frame threshold above which we warn the user */
const LARGE_FRAME_THRESHOLD = 2000;
/** Frame threshold above which we show strong recommendation to switch mode */
const VERY_LARGE_FRAME_THRESHOLD = 10000;

export default function QRPackageExporter({
  file,
  fileBytes,
  header,
  headerBytes,
  fileHash,
}: QRPackageExporterProps) {
  const [currentFrameSeq, setCurrentFrameSeq] = useState(0);
  const [previewQr, setPreviewQr] = useState<RelayQrImage | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<QrPackageExportProgress | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [selectedRange, setSelectedRange] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);

  const payloadMax = relayPayloadMaxBytes();
  const totalFrames = estimateRelayFrameCount(fileBytes.length, payloadMax);
  const estZipBytes = estimatePackageSize(totalFrames);
  const transferTag = new DataView(header.transferId.buffer, header.transferId.byteOffset, 4).getUint32(0, false);
  const transferIdHex = Array.from(header.transferId).map((b) => b.toString(16).padStart(2, '0')).join('');

  const isLarge = totalFrames >= LARGE_FRAME_THRESHOLD;
  const isVeryLarge = totalFrames >= VERY_LARGE_FRAME_THRESHOLD;

  // Load preview QR when currentFrameSeq changes
  useEffect(() => {
    let active = true;
    const offset = currentFrameSeq * payloadMax;
    const end = Math.min(offset + payloadMax, fileBytes.length);
    const chunkData = fileBytes.slice(offset, end);

    generateRelayQrImage(
      transferTag,
      currentFrameSeq,
      currentFrameSeq,
      0,
      0,
      chunkData
    ).then((img) => {
      if (active) setPreviewQr(img);
    });

    return () => {
      active = false;
    };
  }, [currentFrameSeq, fileBytes, payloadMax, transferTag]);

  const handleDownloadZip = async (customFrames?: number[]) => {
    try {
      setIsExporting(true);
      setExportSuccess(false);
      setExportedBlob(null);

      const zipBlob = await createQrZipPackage(
        fileBytes,
        header,
        headerBytes,
        fileHash,
        (prog) => setExportProgress(prog),
        customFrames
      );

      const filename = `QRBeam_Transfer_${transferIdHex.slice(0, 8)}.zip`;
      downloadBlob(zipBlob, filename);
      setExportedBlob(zipBlob);
      setExportSuccess(true);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleDownloadCurrentQr = () => {
    if (!previewQr || !previewQr.dataUrl) return;
    const a = document.createElement('a');
    a.href = previewQr.dataUrl;
    a.download = `QR_${String(currentFrameSeq + 1).padStart(6, '0')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadSelected = () => {
    if (!selectedRange.trim()) return;
    const frameNumbers: number[] = [];
    const parts = selectedRange.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let f = start; f <= end; f++) frameNumbers.push(f - 1);
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num)) frameNumbers.push(num - 1);
      }
    }
    const valid = Array.from(new Set(frameNumbers)).filter((f) => f >= 0 && f < totalFrames);
    if (valid.length > 0) {
      handleDownloadZip(valid);
    }
  };

  /**
   * Share the ZIP package via the Web Share API (files).
   * Generates the ZIP first if not already done, then shares.
   */
  const handleShareZip = async () => {
    try {
      setIsExporting(true);
      setExportProgress(null);
      setExportSuccess(false);

      // Generate ZIP
      const zipBlob = await createQrZipPackage(
        fileBytes,
        header,
        headerBytes,
        fileHash,
        (prog) => setExportProgress(prog)
      );
      setExportedBlob(zipBlob);

      const filename = `QRBeam_Transfer_${transferIdHex.slice(0, 8)}.zip`;

      // Attempt native share
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [new File([zipBlob], filename, { type: 'application/zip' })] })
      ) {
        const shareFile = new File([zipBlob], filename, { type: 'application/zip' });
        await navigator.share({
          title: `QRBeam QR Package — ${file.name}`,
          text: `QRBeam QR Image Relay package for "${file.name}" (${totalFrames} QR frames). Import into QRBeam on the receiver to decode and reassemble the file.`,
          files: [shareFile],
        });
        setExportSuccess(true);
      } else {
        // Fall back: download the ZIP
        downloadBlob(zipBlob, filename);
        setExportSuccess(true);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share error:', err);
        // Fall back to download if share fails
        if (exportedBlob) {
          const filename = `QRBeam_Transfer_${transferIdHex.slice(0, 8)}.zip`;
          downloadBlob(exportedBlob, filename);
          setExportSuccess(true);
        }
      }
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="panel p-6 space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <IconQr className="w-5 h-5" />
            <span>QR Image Relay — Package Generator</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Converts file into standard QR codes. Download or share the ZIP package via WhatsApp, Telegram, Email, or any app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300">
            {totalFrames.toLocaleString()} QR Frames
          </span>
        </div>
      </div>

      {/* Internet Usage Disclaimer */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-start gap-2.5 text-xs text-slate-300">
        <IconInfo className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-white">QRBeam does not upload your file to its own server.</strong>{' '}
          The QR package you choose to share may be transmitted through the external application you select (WhatsApp, Telegram, Email, etc.). That external service acts as the carrier.
        </div>
      </div>

      {/* Large Package Warning */}
      {isVeryLarge && !confirmLarge && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-3">
          <div className="flex items-start gap-2 text-amber-300 font-bold text-sm">
            <IconAlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>⚠ Very Large QR Relay Package</span>
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            This file requires <strong>{totalFrames.toLocaleString()} QR frames</strong> (~{(estZipBytes / (1024 * 1024)).toFixed(1)} MB ZIP). 
            Generation and sharing via messaging apps will be very slow and may not be practical.
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Recommended:</strong> Use Wi-Fi Fast, Bluetooth, or Live Optical transfer for files this large.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmLarge(true)}
              className="btn btn-xs bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 text-amber-200"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      )}

      {isLarge && !isVeryLarge && (
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-300">
          <IconAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Large package:</strong> {totalFrames.toLocaleString()} frames (~{(estZipBytes / (1024 * 1024)).toFixed(1)} MB ZIP). 
            Generation will take a while. For best reliability, share QR images as original files/documents rather than compressed previews.
          </div>
        </div>
      )}

      {/* Package Specs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">File</span>
          <span className="text-slate-200 font-medium truncate block mt-0.5">{file.name}</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Original Size</span>
          <span className="text-slate-200 font-mono mt-0.5 block">
            {file.size >= 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
              : `${(file.size / 1024).toFixed(1)} KB`}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">QR Frames</span>
          <span className="text-cyan-400 font-mono font-bold mt-0.5 block">{totalFrames.toLocaleString()}</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Est. Package</span>
          <span className="text-slate-200 font-mono mt-0.5 block">
            ~{estZipBytes >= 1024 * 1024
              ? `${(estZipBytes / (1024 * 1024)).toFixed(1)} MB`
              : `${(estZipBytes / 1024).toFixed(0)} KB`} (ZIP)
          </span>
        </div>
      </div>

      {/* Transfer ID Row */}
      <div className="text-[11px] font-mono text-slate-500 px-1">
        Transfer ID: <span className="text-slate-300">{transferIdHex}</span>
      </div>

      {/* QR Code Preview & Carousel */}
      {(!isVeryLarge || confirmLarge) && (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-900/80 rounded-2xl border border-white/5 space-y-4">
          <div className="p-3 bg-white rounded-xl shadow-xl flex items-center justify-center min-h-[260px] min-w-[260px]">
            {previewQr ? (
              <img
                src={previewQr.dataUrl}
                alt={`QR Frame ${currentFrameSeq + 1}`}
                className="w-60 h-60 block object-contain"
              />
            ) : (
              <div className="text-slate-500 text-xs font-mono animate-pulse">Generating preview…</div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <button
              type="button"
              disabled={currentFrameSeq === 0}
              onClick={() => setCurrentFrameSeq((s) => Math.max(0, s - 1))}
              className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-slate-300 font-bold">
              Frame {currentFrameSeq + 1} of {totalFrames.toLocaleString()}
            </span>
            <button
              type="button"
              disabled={currentFrameSeq >= totalFrames - 1}
              onClick={() => setCurrentFrameSeq((s) => Math.min(totalFrames - 1, s + 1))}
              className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Export Progress Bar */}
      {isExporting && exportProgress && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs text-purple-300">
            <span className="font-bold flex items-center gap-2">
              <IconRefresh className="w-4 h-4 animate-spin" />
              Generating QR ZIP Package…
            </span>
            <span className="font-mono">{exportProgress.percent}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-150"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono text-right">
            Frame {exportProgress.currentFrame.toLocaleString()} of {exportProgress.totalFrames.toLocaleString()}
          </div>
        </div>
      )}

      {exportSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
          <IconCheck className="w-4 h-4 text-emerald-400" />
          <span>QR Package ready! Share the ZIP file with the receiver via WhatsApp, Telegram, Email, or any app.</span>
        </div>
      )}

      {/* Main Action Buttons */}
      {(!isVeryLarge || confirmLarge) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Primary: Download ZIP */}
          <button
            type="button"
            id="download-qr-package-btn"
            disabled={isExporting}
            onClick={() => handleDownloadZip()}
            className="btn btn-primary flex items-center justify-center gap-2"
          >
            <IconArchive className="w-4 h-4" />
            <span>Download QR Package (ZIP)</span>
          </button>

          {/* Download Current Single Frame */}
          <button
            type="button"
            id="download-current-qr-btn"
            disabled={isExporting}
            onClick={handleDownloadCurrentQr}
            className="btn bg-slate-800 border border-white/10 hover:border-white/25 text-white flex items-center justify-center gap-2"
          >
            <IconDownload className="w-4 h-4" />
            <span>Download Frame #{currentFrameSeq + 1}</span>
          </button>

          {/* Share ZIP via Native Share API (WhatsApp / Telegram / etc.) */}
          <button
            type="button"
            id="share-qr-package-btn"
            disabled={isExporting}
            onClick={handleShareZip}
            className="btn bg-purple-600/20 border border-purple-500/40 hover:bg-purple-500/30 text-purple-200 flex items-center justify-center gap-2 sm:col-span-2 lg:col-span-1"
          >
            <IconChevronRight className="w-4 h-4" />
            <span>Share ZIP via Apps</span>
          </button>
        </div>
      )}

      {/* Share Fallback Note */}
      {(!isVeryLarge || confirmLarge) && (
        <p className="text-[11px] text-slate-500 px-1 leading-relaxed">
          "Share via Apps" uses your platform's native share sheet to choose WhatsApp, Telegram, Email, Drive, or other installed apps. 
          If file sharing is not supported by your browser, the ZIP will be downloaded automatically instead — then share the downloaded file manually.
        </p>
      )}

      {/* Advanced / Missing Frames Selector */}
      {(!isVeryLarge || confirmLarge) && (
        <div className="border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          >
            <IconSliders className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Hide Advanced Frame Export' : 'Export Selected / Missing Frames…'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="text-xs text-slate-300">
                Export specific frames requested by the receiver (e.g. <code>4, 8, 12-15</code>):
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedRange}
                  onChange={(e) => setSelectedRange(e.target.value)}
                  placeholder="e.g. 3, 5, 8-12"
                  className="input text-xs font-mono flex-1 bg-slate-950 border-white/10"
                />
                <button
                  type="button"
                  disabled={isExporting || !selectedRange.trim()}
                  onClick={handleDownloadSelected}
                  className="btn btn-sm bg-purple-600/30 border border-purple-500/40 hover:bg-purple-600/50 text-purple-200"
                >
                  Download Selected
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
