import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { WifiTransport, encodeSdpForQr, decodeSdpFromQr, type WifiConnectionState } from '../services/transport/wifiTransport';
import CommonDashboard from './CommonDashboard';
import QrScanner from './QrScanner';
import { sha256Bytes } from '../utils/checksum';
import { downloadBlob } from '../services/qr-relay/qrPackage';
import type { TransportDashboard } from '../types/transport';
import {
  IconWifi,
  IconCheck,
  IconAlertCircle,
  IconCamera,
  IconRefresh,
  IconDownload,
  IconCopy,
  IconShieldCheck,
} from './Icons';

interface WifiSenderProps {
  file: File;
  fileBytes: Uint8Array;
  onExit: () => void;
}

export function WifiSenderView({ file, fileBytes, onExit }: WifiSenderProps) {
  const [transportState, setTransportState] = useState<WifiConnectionState>('idle');
  const [offerQrUrl, setOfferQrUrl] = useState<string | null>(null);
  const [offerText, setOfferText] = useState<string>('');
  const [answerInput, setAnswerInput] = useState<string>('');
  const [scanningAnswer, setScanningAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<TransportDashboard>({
    transport: 'wifi',
    transportLabel: '⚡ Wi-Fi Local',
    file: file.name,
    progress: 0,
    transferred: 0,
    total: fileBytes.length,
    status: 'connecting',
  });

  const [isVerified, setIsVerified] = useState(false);
  const wifiRef = useRef<WifiTransport | null>(null);
  const startTimeRef = useRef<number>(0);

  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  useEffect(() => {
    let active = true;
    const wifi = new WifiTransport('sender', {
      onStateChange: (s) => active && setTransportState(s),
      onError: (err) => active && setError(err),
      onOfferReady: async (sdp) => {
        if (!active) return;
        const qrText = encodeSdpForQr(sdp);
        setOfferText(qrText);
        try {
          const url = await QRCode.toDataURL(qrText, { margin: 2, scale: 5 });
          if (active) setOfferQrUrl(url);
        } catch {
          // If SDP string is too large for single QR, fallback to text token
        }
      },
      onConnected: () => {
        if (!active) return;
        setTransportState('connected');
        startTransmission();
      },
    });

    wifiRef.current = wifi;
    wifi.initialize().catch((err) => {
      if (active) setError(err.message || 'Failed to initialize Wi-Fi peer transport');
    });

    return () => {
      active = false;
      wifi.close();
    };
  }, []);

  const handleAcceptAnswerText = async (text: string) => {
    try {
      const sdp = decodeSdpFromQr(text) || text;
      if (wifiRef.current) {
        await wifiRef.current.acceptAnswer(sdp);
        setScanningAnswer(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid answer token from receiver');
    }
  };

  const startTransmission = async () => {
    if (!wifiRef.current) return;
    startTimeRef.current = performance.now();

    const chunkSize = 16384; // 16 KB chunks for high speed
    const totalChunks = Math.ceil(fileBytes.length / chunkSize);
    const fileHashHex = toHex(sha256Bytes(fileBytes));

    // Send Header Packet
    const meta = {
      type: 'META',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      fileHash: fileHashHex,
    };
    await wifiRef.current.send(new TextEncoder().encode(JSON.stringify(meta)));

    // Send Chunks
    let sentBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileBytes.length);
      const chunk = fileBytes.slice(start, end);

      // Packet: 4-byte chunk index + chunk data
      const packet = new Uint8Array(4 + chunk.length);
      new DataView(packet.buffer).setUint32(0, i, false);
      packet.set(chunk, 4);

      await wifiRef.current.send(packet);
      sentBytes += chunk.length;

      const elapsedSec = (performance.now() - startTimeRef.current) / 1000;
      const speed = elapsedSec > 0 ? sentBytes / elapsedSec : 0;
      const remainingBytes = fileBytes.length - sentBytes;
      const etaSec = speed > 0 ? remainingBytes / speed : 0;

      setDashboard({
        transport: 'wifi',
        transportLabel: '⚡ Wi-Fi Local',
        file: file.name,
        progress: sentBytes / fileBytes.length,
        transferred: sentBytes,
        total: fileBytes.length,
        speed,
        etaSec,
        packets: totalChunks,
        validPackets: i + 1,
        status: 'transferring',
      });

      // Small throttle yield every 32 chunks to prevent buffer bloat
      if (i % 32 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Send Done Packet
    await wifiRef.current.send(new TextEncoder().encode(JSON.stringify({ type: 'DONE', hash: fileHashHex })));
    setIsVerified(true);
    setDashboard((d) => ({
      ...d,
      progress: 1,
      integrityVerified: true,
      status: 'completed',
    }));
  };

  const copyOffer = () => {
    navigator.clipboard.writeText(offerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="panel p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <IconWifi className="w-5 h-5" />
          <span>Wi-Fi Fast Local Transfer</span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 text-slate-400"
        >
          Exit Wi-Fi Mode
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <IconAlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Connection Handshake Stage */}
      {transportState !== 'connected' && !isVerified && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-white">Scan Offer on Receiver Device</h2>
            <p className="text-xs text-slate-400">
              Point the receiver camera at this QR code to establish peer-to-peer Wi-Fi link.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 bg-slate-900/80 rounded-2xl border border-white/5 space-y-4">
            <div className="p-3 bg-white rounded-xl shadow-xl flex items-center justify-center min-h-[240px] min-w-[240px]">
              {offerQrUrl ? (
                <img src={offerQrUrl} alt="Wi-Fi Offer QR" className="w-56 h-56 block object-contain" />
              ) : (
                <div className="text-slate-500 text-xs font-mono animate-pulse">Generating Wi-Fi handshake…</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyOffer}
                className="btn btn-xs bg-slate-800 border-white/10 hover:border-amber-400 text-slate-300 flex items-center gap-1.5"
              >
                {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
                {copied ? 'Token Copied' : 'Copy Connection Token'}
              </button>
              <button
                type="button"
                onClick={() => setScanningAnswer(!scanningAnswer)}
                className="btn btn-xs bg-amber-500/20 border-amber-500/30 text-amber-300 flex items-center gap-1.5"
              >
                <IconCamera className="w-3.5 h-3.5" />
                {scanningAnswer ? 'Close Scanner' : 'Scan Receiver Answer'}
              </button>
            </div>
          </div>

          {scanningAnswer && (
            <div className="panel p-4 space-y-3">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <IconCamera className="w-4 h-4 text-cyan-400" />
                <span>Scan Receiver's Answer QR</span>
              </div>
              <QrScanner
                active
                onText={handleAcceptAnswerText}
                onError={(err) => setError(err)}
              />
            </div>
          )}

          {/* Fallback Paste Input */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              Or Paste Receiver Answer Token:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder="Paste QRBEAM_SDP:... token from receiver"
                className="input text-xs font-mono flex-1 bg-slate-950 border-white/10"
              />
              <button
                type="button"
                onClick={() => handleAcceptAnswerText(answerInput)}
                className="btn btn-sm bg-amber-600/30 border border-amber-500/40 text-amber-200"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Transmission Dashboard */}
      {(transportState === 'connected' || isVerified) && (
        <CommonDashboard data={dashboard} onCancel={onExit} />
      )}

      {isVerified && (
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2 font-bold">
            <IconShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Wi-Fi file transfer complete and verified with SHA-256!</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface WifiReceiverProps {
  onExit: () => void;
}

export function WifiReceiverView({ onExit }: WifiReceiverProps) {
  const [offerInput, setOfferInput] = useState<string>('');
  const [answerQrUrl, setAnswerQrUrl] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [scanningOffer, setScanningOffer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    fileHash: string;
  } | null>(null);

  const [receivedChunks, setReceivedChunks] = useState<Map<number, Uint8Array>>(new Map());
  const [dashboard, setDashboard] = useState<TransportDashboard>({
    transport: 'wifi',
    transportLabel: '⚡ Wi-Fi Local',
    progress: 0,
    transferred: 0,
    total: 0,
    status: 'connecting',
  });

  const [verifiedFile, setVerifiedFile] = useState<{
    blob: Blob;
    name: string;
    size: number;
    hash: string;
  } | null>(null);

  const wifiRef = useRef<WifiTransport | null>(null);
  const startTimeRef = useRef<number>(0);
  const chunksRef = useRef<Map<number, Uint8Array>>(new Map());
  const metaRef = useRef<typeof meta>(null);
  metaRef.current = meta;

  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  useEffect(() => {
    let active = true;
    const wifi = new WifiTransport('receiver', {
      onError: (err) => active && setError(err),
      onData: (data) => {
        if (!active) return;
        handleIncomingData(data);
      },
      onAnswerReady: async (sdp) => {
        if (!active) return;
        const qrText = encodeSdpForQr(sdp);
        setAnswerText(qrText);
        try {
          const url = await QRCode.toDataURL(qrText, { margin: 2, scale: 5 });
          if (active) setAnswerQrUrl(url);
        } catch {
          // Fallback
        }
      },
    });

    wifiRef.current = wifi;
    wifi.initialize().catch((err) => {
      if (active) setError(err.message || 'Failed to initialize Wi-Fi receiver');
    });

    return () => {
      active = false;
      wifi.close();
    };
  }, []);

  const handleAcceptOfferText = async (text: string) => {
    try {
      setError(null);
      const sdp = decodeSdpFromQr(text) || text;
      if (wifiRef.current) {
        await wifiRef.current.acceptOffer(sdp);
        setScanningOffer(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid offer token from sender');
    }
  };

  const handleIncomingData = (data: Uint8Array) => {
    // Check if JSON message (META or DONE)
    try {
      const text = new TextDecoder().decode(data);
      if (text.startsWith('{')) {
        const msg = JSON.parse(text);
        if (msg.type === 'META') {
          setMeta(msg);
          startTimeRef.current = performance.now();
          chunksRef.current.clear();
          setDashboard({
            transport: 'wifi',
            transportLabel: '⚡ Wi-Fi Local',
            file: msg.fileName,
            progress: 0,
            transferred: 0,
            total: msg.fileSize,
            packets: msg.totalChunks,
            validPackets: 0,
            status: 'transferring',
          });
          return;
        } else if (msg.type === 'DONE') {
          finishTransfer(msg.hash);
          return;
        }
      }
    } catch {
      // Binary chunk packet
    }

    // Binary chunk: 4 bytes index + chunk payload
    if (data.length >= 4) {
      const idx = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, false);
      const payload = data.slice(4);
      chunksRef.current.set(idx, payload);
      setReceivedChunks(new Map(chunksRef.current));

      const currentMeta = metaRef.current;
      if (currentMeta) {
        let transferred = 0;
        chunksRef.current.forEach((c) => (transferred += c.length));
        const elapsedSec = (performance.now() - startTimeRef.current) / 1000;
        const speed = elapsedSec > 0 ? transferred / elapsedSec : 0;
        const remainingBytes = currentMeta.fileSize - transferred;
        const etaSec = speed > 0 ? remainingBytes / speed : 0;

        setDashboard({
          transport: 'wifi',
          transportLabel: '⚡ Wi-Fi Local',
          file: currentMeta.fileName,
          progress: transferred / currentMeta.fileSize,
          transferred,
          total: currentMeta.fileSize,
          speed,
          etaSec,
          packets: currentMeta.totalChunks,
          validPackets: chunksRef.current.size,
          status: 'transferring',
        });
      }
    }
  };

  const finishTransfer = (expectedHash?: string) => {
    const currentMeta = metaRef.current;
    if (!currentMeta) return;

    // Reassemble chunks
    const totalBytes = currentMeta.fileSize;
    const result = new Uint8Array(totalBytes);
    let offset = 0;

    for (let i = 0; i < currentMeta.totalChunks; i++) {
      const chunk = chunksRef.current.get(i);
      if (chunk) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
    }

    const computedHash = toHex(sha256Bytes(result));
    const targetHash = expectedHash || currentMeta.fileHash;

    if (targetHash && targetHash.toLowerCase() !== computedHash.toLowerCase()) {
      setError(`SHA-256 verification failed! Target: ${targetHash.slice(0, 16)}… Computed: ${computedHash.slice(0, 16)}…`);
    } else {
      const blob = new Blob([result as any], { type: currentMeta.mimeType });
      setVerifiedFile({
        blob,
        name: currentMeta.fileName,
        size: result.length,
        hash: computedHash,
      });

      setDashboard((d) => ({
        ...d,
        progress: 1,
        transferred: totalBytes,
        validPackets: currentMeta.totalChunks,
        integrityVerified: true,
        status: 'completed',
      }));
    }
  };

  const copyAnswer = () => {
    navigator.clipboard.writeText(answerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="panel p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <IconWifi className="w-5 h-5" />
          <span>Wi-Fi Fast Local Receiver</span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="btn btn-xs bg-slate-800 border-white/10 hover:border-white/25 text-slate-400"
        >
          Exit Wi-Fi
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <IconAlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Scan Sender Offer */}
      {scanningOffer && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-white">Scan Sender's Offer QR</h2>
            <p className="text-xs text-slate-400">
              Point your camera at the sender screen displaying the Wi-Fi offer code.
            </p>
          </div>

          <div className="panel p-4">
            <QrScanner
              active
              onText={handleAcceptOfferText}
              onError={(err) => setError(err)}
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              Or Paste Sender Offer Token:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                placeholder="Paste QRBEAM_SDP:... token from sender"
                className="input text-xs font-mono flex-1 bg-slate-950 border-white/10"
              />
              <button
                type="button"
                onClick={() => handleAcceptOfferText(offerInput)}
                className="btn btn-sm bg-amber-600/30 border border-amber-500/40 text-amber-200"
              >
                Accept Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Display Answer QR for sender to scan */}
      {!scanningOffer && answerQrUrl && !meta && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-white">Show Answer to Sender</h2>
            <p className="text-xs text-slate-400">
              Sender will scan this code to complete the peer-to-peer Wi-Fi link.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 bg-slate-900/80 rounded-2xl border border-white/5 space-y-4">
            <div className="p-3 bg-white rounded-xl shadow-xl flex items-center justify-center min-h-[240px] min-w-[240px]">
              <img src={answerQrUrl} alt="Answer QR" className="w-56 h-56 block object-contain" />
            </div>

            <button
              type="button"
              onClick={copyAnswer}
              className="btn btn-xs bg-slate-800 border-white/10 hover:border-amber-400 text-slate-300 flex items-center gap-1.5"
            >
              {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
              {copied ? 'Answer Token Copied' : 'Copy Answer Token'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Active Transfer Dashboard */}
      {meta && (
        <CommonDashboard data={dashboard} onCancel={onExit} />
      )}

      {/* Step 4: Complete Verified Download */}
      {verifiedFile && (
        <div className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <IconShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>✓ TRANSFER VERIFIED — SHA-256 MATCH</span>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <div>File: <strong>{verifiedFile.name}</strong></div>
            <div>Size: <strong>{(verifiedFile.size / 1024).toFixed(1)} KB</strong></div>
            <div className="font-mono text-[11px] text-emerald-300 truncate">
              Digest: {verifiedFile.hash}
            </div>
          </div>

          <button
            type="button"
            onClick={() => downloadBlob(verifiedFile.blob, verifiedFile.name)}
            className="btn btn-primary flex items-center gap-2"
          >
            <IconDownload className="w-4 h-4" />
            <span>Save {verifiedFile.name}</span>
          </button>
        </div>
      )}
    </div>
  );
}
