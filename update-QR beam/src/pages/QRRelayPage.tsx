import { useState } from 'react';
import FilePicker from '../components/FilePicker';
import QRPackageExporter from '../components/QRPackageExporter';
import QRImageImporter from '../components/QRImageImporter';
import { sha256Bytes } from '../utils/checksum';
import type { TransferHeader } from '../types/transfer';
import {
  IconQr,
  IconSend,
  IconReceive,
  IconInfo,
  IconAlertTriangle,
} from '../components/Icons';

/** Maximum file size we will read fully into RAM for relay mode (512 MB).
 *  Beyond this we warn the user before loading. QR relay of very large
 *  files is extremely impractical and the user should prefer Wi-Fi / Optical.
 */
const MAX_RELAY_FILE_BYTES = 512 * 1024 * 1024;

/** Large file warn threshold (50 MB) */
const WARN_RELAY_FILE_BYTES = 50 * 1024 * 1024;

export default function QRRelayPage() {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Sender state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [header, setHeader] = useState<TransferHeader | null>(null);
  const [headerBytes, setHeaderBytes] = useState<Uint8Array | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmLargeFile, setConfirmLargeFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  /**
   * Actually read the file and build the header.
   * Called after user confirms if file is large.
   */
  const loadFile = async (f: File) => {
    setIsLoadingFile(true);
    setLoadError(null);

    try {
      // Read file into memory — we need all bytes to generate QR frames
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);

      const hashBytes = sha256Bytes(bytes);
      const hashHex = toHex(hashBytes);
      setFileHash(hashHex);

      const randomTransferId = crypto.getRandomValues(new Uint8Array(8));
      const h: TransferHeader = {
        protocolVersion: 1,
        transferId: randomTransferId,
        fileId: 1,
        fileName: f.name,
        mimeType: f.type || 'application/octet-stream',
        fileSize: f.size,
        chunkSize: 400,
        totalChunks: Math.ceil(f.size / 400),
        mode: 'qr',
        gx: 1,
        gy: 1,
        regionCells: 40,
        bpc: 1,
        qrVersion: 20,
        qrEcc: 'L',
        segK: 1,
        segP: 0,
        interleave: 1,
        frameMs: 100,
        repeat: 1,
        handshakeEverySec: 2,
        hashAlg: 1,
        fileHash: hashBytes,
        encrypted: false,
        kdfSalt: new Uint8Array(0),
        kdfIterations: 0,
        ivPrefix: new Uint8Array(0),
      };

      setSelectedFile(f);
      setFileBytes(bytes);
      setHeader(h);
      setHeaderBytes(new Uint8Array([0x51, 0x52, 0x42, 0x31]));
      setPendingFile(null);
      setConfirmLargeFile(false);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to read file');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleFilePicked = async (f: File) => {
    // Guard: if over hard limit, block
    if (f.size > MAX_RELAY_FILE_BYTES) {
      setLoadError(
        `File is too large for QR Image Relay (${(f.size / (1024 * 1024)).toFixed(1)} MB). ` +
          `The maximum practical size is ${MAX_RELAY_FILE_BYTES / (1024 * 1024)} MB. ` +
          `Please use Wi-Fi Fast or Live Optical transfer instead.`
      );
      return;
    }

    // Warn: if over moderate threshold, ask user to confirm
    if (f.size > WARN_RELAY_FILE_BYTES && !confirmLargeFile) {
      setPendingFile(f);
      return;
    }

    await loadFile(f);
  };

  const handleConfirmLargeFile = async () => {
    if (!pendingFile) return;
    setConfirmLargeFile(true);
    await loadFile(pendingFile);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileBytes(null);
    setHeader(null);
    setHeaderBytes(null);
    setFileHash('');
    setLoadError(null);
    setPendingFile(null);
    setConfirmLargeFile(false);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Page Title & Concept banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
            <IconQr className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">QR Image Relay</h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Store-and-Forward transfer via exported QR images or ZIP packages
            </p>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="panel p-4 rounded-xl border border-blue-200 bg-blue-50/70 flex items-start gap-3">
        <IconInfo className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 leading-relaxed space-y-1.5">
          <div>
            <strong>How QR Image Relay works:</strong> Convert any file into a sequence of binary QR codes.
            Share them as a ZIP package through WhatsApp, Telegram, Email, or USB.
            The receiver imports the package into QRBeam — no camera scanning required.
          </div>
          <div className="text-blue-800">
            <strong>Important:</strong> QRBeam does not upload your file to its own server.
            If you share the package via WhatsApp, Telegram, Email, or cloud storage, that external
            service acts as the communication carrier.
          </div>
        </div>
      </div>

      {/* Near vs Far Comparison */}
      <div className="grid sm:grid-cols-2 gap-3.5 text-xs">
        <div className="p-3.5 rounded-xl bg-white border border-blue-200 shadow-xs">
          <div className="text-blue-700 font-bold mb-1.5">📷 Near Device — Live QR</div>
          <div className="text-slate-600 leading-relaxed">
            Sender screen → Receiver camera. Both devices must be physically present.
            Use <a href="/send" className="text-blue-600 font-semibold underline underline-offset-2">Send Page</a> with Live Optical / QR mode.
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-sky-200 shadow-xs">
          <div className="text-sky-700 font-bold mb-1.5">🌍 Far Device — QR Image Relay</div>
          <div className="text-slate-600 leading-relaxed">
            QR images → ZIP package → WhatsApp / Telegram / Email → Receiver downloads &amp; imports into QRBeam. No camera required.
          </div>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex rounded-xl bg-slate-100 p-1.5 border border-slate-200">
        <button
          type="button"
          id="relay-tab-export"
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'export'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IconSend className="w-4 h-4" />
          <span>Export QR Package (Sender)</span>
        </button>

        <button
          type="button"
          id="relay-tab-import"
          onClick={() => setActiveTab('import')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'import'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IconReceive className="w-4 h-4" />
          <span>Import QR Images (Receiver)</span>
        </button>
      </div>

      {/* ======= Tab 1: Export / Sender ======= */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Error state */}
          {loadError && (
            <div className="panel p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-start gap-3">
              <IconAlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-200 leading-relaxed">{loadError}</div>
            </div>
          )}

          {/* Large file confirmation gate */}
          {pendingFile && !confirmLargeFile && (
            <div className="panel p-5 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3">
              <div className="flex items-start gap-3">
                <IconAlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200 leading-relaxed font-medium">
                  ⚠ Large file for QR Relay
                </div>
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                <strong>{pendingFile.name}</strong> is {(pendingFile.size / (1024 * 1024)).toFixed(1)} MB.
                QR Image Relay will require a large number of QR frames and a large ZIP package.
                This may be impractical to share via messaging apps.
              </p>
              <p className="text-xs text-slate-400">
                <strong>Recommended:</strong> Use Wi-Fi Fast or Live Optical for files this size.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmLargeFile}
                  className="btn btn-xs bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 text-amber-200"
                >
                  Continue with QR Relay
                </button>
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 text-slate-300"
                >
                  Choose Different File
                </button>
              </div>
            </div>
          )}

          {/* File loading spinner */}
          {isLoadingFile && (
            <div className="panel p-6 flex flex-col items-center gap-3 text-center">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm text-slate-300">Reading and hashing file…</div>
              <p className="text-xs text-slate-500">For large files this may take a moment.</p>
            </div>
          )}

          {/* File picker */}
          {!selectedFile && !isLoadingFile && !pendingFile && (
            <div className="panel p-6">
              <FilePicker onFile={handleFilePicked} />
            </div>
          )}

          {/* Package Exporter */}
          {selectedFile && fileBytes && header && headerBytes && !isLoadingFile && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs text-slate-400">
                  Ready to export QR frames for <strong>{selectedFile.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 text-slate-400"
                >
                  Choose Different File
                </button>
              </div>

              <QRPackageExporter
                file={selectedFile}
                fileBytes={fileBytes}
                header={header}
                headerBytes={headerBytes}
                fileHash={fileHash}
              />
            </div>
          )}
        </div>
      )}

      {/* ======= Tab 2: Import / Receiver ======= */}
      {activeTab === 'import' && (
        <div className="panel p-6">
          <QRImageImporter />
        </div>
      )}
    </div>
  );
}
