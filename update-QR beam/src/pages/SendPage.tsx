import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FilePicker from '../components/FilePicker';
import FileInfo from '../components/FileInfo';
import OpticalDisplay from '../components/OpticalDisplay';
import OpticalGrid from '../components/OpticalGrid';
import TransferProgress from '../components/TransferProgress';
import QrScanner from '../components/QrScanner';
import TransportSelector from '../components/TransportSelector';
import TransportStatus from '../components/TransportStatus';
import QRPackageExporter from '../components/QRPackageExporter';
import { WifiSenderView } from '../components/WifiTransferView';
import { useWakeLock } from '../components/useWakeLock';
import { hashFile } from '../services/file/hashClient';
import { WorkerShardSource } from '../services/file/segmentProvider';
import { computeLayout } from '../services/file/layout';
import { buildHeader } from '../services/protocol/buildHeader';
import { encodeHeader, handshakeToText } from '../services/protocol/header';
import { deriveKey } from '../services/crypto/keyDerivation';
import { PRESETS, presetById, FRAME_MS_OPTIONS, ceilingRate, payloadPerFrame, decodeRecommendation, type Recommendation } from '../services/optical/calibration';
import { SenderEngine, type SenderStats } from '../services/optical/senderEngine';
import { chunkSizeFor } from '../services/optical/frameBuilder';
import { FEC_PARAMS, type FecLevel, type SenderState, type TransferHeader } from '../types/transfer';
import type { TransferMode } from '../types/transport';
import { formatBytes, formatDuration, formatRate } from '../utils/format';
import {
  IconSend,
  IconLock,
  IconZap,
  IconOptimize,
  IconQr,
  IconSliders,
  IconPlay,
  IconPause,
  IconAlertCircle,
  IconSparkles,
  IconRefresh
} from '../components/Icons';


interface Session {
  header: TransferHeader;
  source: WorkerShardSource;
  text: string;
  file: File;
}

function loadRec(): Recommendation | null {
  try {
    return JSON.parse(localStorage.getItem('qrbeam.rec') ?? 'null');
  } catch {
    return null;
  }
}

export default function SendPage() {
  const [searchParams] = useSearchParams();
  const queryMode = searchParams.get('mode') as TransferMode | null;
  const [transportMode, setTransportMode] = useState<TransferMode>(
    queryMode && ['wifi', 'bluetooth', 'optical', 'qr-relay', 'automatic'].includes(queryMode)
      ? queryMode
      : 'automatic'
  );

  const [relayReady, setRelayReady] = useState<{
    fileBytes: Uint8Array;
    header: TransferHeader;
    headerBytes: Uint8Array;
    fileHash: string;
  } | null>(null);

  const [wifiReady, setWifiReady] = useState<{
    fileBytes: Uint8Array;
  } | null>(null);

  const [state, setState] = useState<SenderState>('IDLE');
  const [file, setFile] = useState<File | null>(null);
  const [synthetic, setSynthetic] = useState(false);
  const [presetId, setPresetId] = useState('o2-64');
  const [frameMs, setFrameMs] = useState(150);
  const [fec, setFec] = useState<FecLevel>('medium');
  const [repeat, setRepeat] = useState(1);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'optical' | 'qr'>('optical');
  const [hashPct, setHashPct] = useState(0);
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [scanning, setScanning] = useState(false);
  const cancelHash = useRef<() => void>(() => undefined);

  const params = useMemo(() => presetById(presetId), [presetId]);
  const visible = PRESETS.filter((p) => p.mode === mode);
  
  useEffect(() => {
    if (params.mode !== mode) setPresetId(visible[0].id);
  }, [mode]); // eslint-disable-line

  const applyRec = useCallback((r: Recommendation) => {
    const match = PRESETS.find(
      (p) => p.mode === r.mode && p.gx === r.gx && p.R === r.R && p.bpc === r.bpc && p.qrVersion === r.qrVersion
    );
    setMode(r.mode);
    if (match) setPresetId(match.id);
    setFrameMs(r.frameMs);
    setFec(r.fec);
    setRepeat(r.repeat);
  }, []);

  useEffect(() => {
    const r = loadRec();
    if (r) applyRec(r);
  }, [applyRec]);

  const onScanText = useCallback((t: string) => {
    const r = decodeRecommendation(t);
    if (r) {
      localStorage.setItem('qrbeam.rec', JSON.stringify(r));
      applyRec(r);
      setScanning(false);
    }
  }, [applyRec]);

  const pick = (f: File, syn = false) => {
    setFile(f);
    setSynthetic(syn);
    setState('FILE_SELECTED');
    setError('');
  };

  const sample = () => {
    const b = new Uint8Array(512 * 1024);
    for (let o = 0; o < b.length; o += 65536) crypto.getRandomValues(b.subarray(o, o + 65536));
    pick(new File([b], 'qrbeam-sample.bin', { type: 'application/octet-stream' }), true);
  };

  const ceiling = ceilingRate(params, frameMs, fec, repeat);
  const eta = file ? file.size / ceiling : 0;

  function inferMime(name: string, type: string): string {
    if (type) return type;
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'svg': return 'image/svg+xml';
      case 'bmp': return 'image/bmp';
      case 'ico': return 'image/x-icon';
      case 'mp4': return 'video/mp4';
      case 'webm': return 'video/webm';
      case 'mov': return 'video/quicktime';
      case 'pdf': return 'application/pdf';
      case 'json': return 'application/json';
      case 'txt': return 'text/plain';
      default: return 'application/octet-stream';
    }
  }

  async function start() {
    if (!file) return;
    setError('');

    // If Bluetooth is selected, honestly state the limitation
    if (transportMode === 'bluetooth') {
      setError(
        'Direct browser-to-browser Bluetooth file transfer is not supported by Web Bluetooth without a native companion application. Please choose Wi-Fi Fast, Live Optical, or QR Image Relay.'
      );
      return;
    }

    setState('HASHING');
    setHashPct(0);
    try {
      const h = hashFile(file, (d, t) => setHashPct(d / t));
      cancelHash.current = h.cancel;
      const digest = await h.promise;
      setState('HANDSHAKE');
      const mime = inferMime(file.name, file.type);
      const header = buildHeader({
        fileName: file.name,
        mimeType: mime,
        fileSize: file.size,
        fileHash: digest,
        params,
        frameMs,
        repeat,
        fec,
        encrypted: password.length > 0,
        handshakeEverySec: 30,
      });
      const key = password ? await deriveKey(password, header.kdfSalt, header.kdfIterations) : undefined;
      const bytes = await encodeHeader(header, key);

      // Handle QR Image Relay Mode
      if (transportMode === 'qr-relay') {
        const fileBuf = await file.arrayBuffer();
        const fileBytes = new Uint8Array(fileBuf);
        const fileHashHex = Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
        setRelayReady({ fileBytes, header, headerBytes: bytes, fileHash: fileHashHex });
        setState('TRANSMITTING');
        return;
      }

      // Handle Wi-Fi Fast Mode
      if (transportMode === 'wifi' || (transportMode === 'automatic' && typeof RTCPeerConnection !== 'undefined')) {
        const fileBuf = await file.arrayBuffer();
        const fileBytes = new Uint8Array(fileBuf);
        setWifiReady({ fileBytes });
        setState('TRANSMITTING');
        return;
      }

      // Default Live Optical
      const source = new WorkerShardSource(file, header, key);
      setSession({ header, source, text: handshakeToText(bytes), file });
      setState('TRANSMITTING');
    } catch (e) {
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : String(e));
      setError(`Could not start transfer: ${msg || 'Unexpected error occurred while preparing file'}`);
      setState('ERROR');
    }
  }

  function end() {
    session?.source.dispose();
    setSession(null);
    setRelayReady(null);
    setWifiReady(null);
    setState(file ? 'FILE_SELECTED' : 'IDLE');
  }

  if (relayReady && file) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={end}
            className="btn btn-sm bg-white border-slate-300 hover:border-blue-400 text-slate-700 shadow-xs"
          >
            ← Back to Sender Setup
          </button>
        </div>
        <QRPackageExporter
          file={file}
          fileBytes={relayReady.fileBytes}
          header={relayReady.header}
          headerBytes={relayReady.headerBytes}
          fileHash={relayReady.fileHash}
        />
      </div>
    );
  }

  if (wifiReady && file) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <WifiSenderView
          file={file}
          fileBytes={wifiReady.fileBytes}
          onExit={end}
        />
      </div>
    );
  }

  if (session) {
    return <TransmitView session={session} params={params} fec={fec} onExit={end} />;
  }

  const busy = state === 'HASHING' || state === 'HANDSHAKE';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      
      {/* Page Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
          <IconSend className="w-3.5 h-3.5" />
          Sender Mode
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Send a file</h1>
        <p className="text-sm text-slate-600">
          Select a file to encode into optical frames and broadcast directly to a receiving camera.
        </p>
      </div>

      {error && (
        <div role="alert" className="err panel p-4 flex items-start gap-3 text-sm text-rose-700 bg-rose-50 border-rose-200">
          <IconAlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {!file ? (
        <div className="space-y-4">
          <FilePicker onFile={(f) => pick(f)} />
          <div className="flex justify-center">
            <button
              type="button"
              className="btn btn-ghost text-xs text-slate-500 hover:text-blue-600"
              onClick={sample}
            >
              <IconSparkles className="w-3.5 h-3.5 text-amber-500" />
              Try with a synthetic 512 KB test payload
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* File summary */}
          <FileInfo file={file} synthetic={synthetic} />

          {/* Configuration Panel */}
          <div className="panel space-y-6 bg-white border-slate-200">
            
            {/* Multi-Transport Selector */}
            <div className="space-y-4 border-b border-slate-200 pb-6">
              <TransportSelector
                value={transportMode}
                onChange={setTransportMode}
                fileSize={file.size}
              />
              <TransportStatus
                mode={transportMode}
                isOpticalOnlyExplicit={transportMode === 'optical'}
              />
            </div>

            {/* Mode selection tabs */}
            <div>
              <label className="label text-slate-700">Transfer Protocol Mode (Optical)</label>

              <div className="grid sm:grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setMode('optical')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mode === 'optical'
                      ? 'bg-blue-50 border-blue-600 shadow-sm text-blue-950 ring-1 ring-blue-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-2 text-slate-900">
                      <IconZap className="w-4 h-4 text-blue-600" />
                      Fast Optical Matrix
                    </span>
                    <span className="badge badge-cyan text-[10px]">Recommended</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    High-density multi-region blocks with rapid visual decoding. 5x–10x faster.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('qr')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mode === 'qr'
                      ? 'bg-blue-50 border-blue-600 shadow-sm text-blue-950 ring-1 ring-blue-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-2 text-slate-900">
                      <IconQr className="w-4 h-4 text-blue-600" />
                      Pure Standard QR
                    </span>
                    <span className="badge badge-indigo text-[10px]">Compatibility</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Standard binary QR blocks. Maximum camera compatibility on legacy hardware.
                  </p>
                </button>
              </div>
            </div>

            {/* Parameters Grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="preset">Layout & Density</label>
                <select
                  id="preset"
                  className="field"
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                >
                  {visible.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="ms">Frame Duration (FPS)</label>
                <select
                  id="ms"
                  className="field"
                  value={frameMs}
                  onChange={(e) => setFrameMs(+e.target.value)}
                >
                  {FRAME_MS_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} ms ({(1000 / m).toFixed(0)} fps) {m >= 250 ? '· slow & steady' : m <= 75 ? '· high speed' : '· balanced'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="fec">Reed-Solomon Error Correction (FEC)</label>
                <select
                  id="fec"
                  className="field"
                  value={fec}
                  onChange={(e) => setFec(e.target.value as FecLevel)}
                >
                  {(Object.keys(FEC_PARAMS) as FecLevel[]).map((k) => (
                    <option key={k} value={k}>
                      {k.toUpperCase()} {FEC_PARAMS[k].p ? `(+${((FEC_PARAMS[k].p / FEC_PARAMS[k].k) * 100).toFixed(0)}% parity redundancy)` : '(no parity)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="rep">Frame Repetition</label>
                <select
                  id="rep"
                  className="field"
                  value={repeat}
                  onChange={(e) => setRepeat(+e.target.value)}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}× {n === 1 ? '(single broadcast)' : `(repeat each frame ${n} times)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Password Encryption */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="label flex items-center gap-1.5 text-slate-700" htmlFor="pw">
                <IconLock className="w-3.5 h-3.5 text-blue-600" />
                Optional End-to-End Password (AES-256-GCM)
              </label>
              <input
                id="pw"
                type="password"
                className="field"
                placeholder="Leave blank for unencrypted transfer"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              {password && (
                <p className="text-xs text-blue-700 font-medium">
                  🔒 File content and metadata will be encrypted with AES-256-GCM. Share the password out loud with the receiver.
                </p>
              )}
            </div>

            {/* Theoretical Throughput Preview Card */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <OpticalGrid gx={params.gx} gy={params.gy} />
                <div className="space-y-1 text-xs text-slate-600">
                  <div>
                    <span className="font-mono text-slate-900 font-bold">{formatBytes(chunkSizeFor(params))}</span> per block •{' '}
                    <span className="font-mono text-slate-900 font-bold">{formatBytes(payloadPerFrame(params))}</span> per frame
                  </div>
                  <div>
                    Theoretical ceiling:{' '}
                    <strong className="text-blue-700 font-mono text-sm">{formatRate(ceiling)}</strong>
                  </div>
                  <div>
                    Estimated transfer time:{' '}
                    <strong className="text-slate-900 font-mono">{formatDuration(eta)}</strong>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 text-center sm:text-right">
                Theoretical max rate.<br />Real speed is measured by receiver.
              </div>
            </div>

          </div>

          {/* Quick auxiliary action buttons */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/optimize" className="btn btn-sm">
                <IconOptimize className="w-4 h-4 text-amber-400" />
                Optimize Settings
              </Link>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setScanning((s) => !s)}
              >
                <IconQr className="w-4 h-4 text-cyan-400" />
                {scanning ? 'Close Scanner' : 'Scan Receiver Recommendation'}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-ghost text-slate-400 hover:text-white"
              onClick={() => {
                setFile(null);
                setState('IDLE');
              }}
            >
              Choose different file
            </button>
          </div>

          {/* Camera Scanner if scanning receiver recommendation */}
          {scanning && (
            <div className="panel space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <IconQr className="w-4 h-4 text-cyan-400" />
                Scan Recommendation QR from Receiver
              </h3>
              <div className="max-w-md mx-auto">
                <QrScanner
                  active
                  onText={onScanText}
                  onError={(m) => {
                    setError(m);
                    setScanning(false);
                  }}
                />
              </div>
            </div>
          )}

          {/* Hashing / Handshake progress */}
          {busy && (
            <div className="panel p-5 space-y-4">
              <TransferProgress
                value={state === 'HASHING' ? hashPct : 1}
                label={state === 'HASHING' ? 'Calculating Cryptographic SHA-256 Digest' : 'Building Optical Handshake Header'}
              />
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  cancelHash.current();
                  setState('FILE_SELECTED');
                }}
              >
                Cancel Preparation
              </button>
            </div>
          )}

          {/* Start Transfer Button */}
          <button
            type="button"
            className="btn btn-primary btn-lg shadow-xl shadow-indigo-600/30 text-base"
            disabled={busy}
            onClick={start}
          >
            <IconSend className="w-5 h-5" />
            {transportMode === 'qr-relay'
              ? 'Prepare QR Image Relay Package'
              : transportMode === 'wifi'
              ? 'Start Wi-Fi Fast Transfer'
              : transportMode === 'bluetooth'
              ? 'Check Bluetooth Transfer'
              : transportMode === 'automatic'
              ? 'Start Transfer (Automatic Link)'
              : 'Start Optical Beaming'}
          </button>

        </div>
      )}
    </div>
  );
}

/** Fullscreen-ready transmission HUD viewport. */
function TransmitView({
  session,
  params,
  fec,
  onExit
}: {
  session: Session;
  params: ReturnType<typeof presetById>;
  fec: FecLevel;
  onExit: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<SenderEngine | null>(null);
  const [st, setSt] = useState<SenderStats | null>(null);
  const [ms, setMs] = useState(session.header.frameMs);

  useWakeLock(true);

  useEffect(() => {
    const layout = computeLayout(
      session.header.fileSize,
      session.header.chunkSize,
      session.header.segK,
      session.header.segP,
      session.header.encrypted
    );
    const e = new SenderEngine(
      session.header,
      layout,
      session.source,
      canvas.current!,
      session.text,
      setSt,
      () => Math.min(window.innerWidth - 32, window.innerHeight * 0.6, 850)
    );
    engine.current = e;
    e.start();
    return () => e.stop();
  }, [session]);

  const paused = st?.paused;
  const isHandshake = st?.mode === 'handshake';
  const ceiling = ceilingRate(params, ms, fec, session.header.repeat);
  const sent = st?.firstPassProgress ?? 0;

  return (
    <div className="fixed inset-0 z-50 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-between gap-4 bg-[#070b16]">
      
      {/* Top HUD Bar */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-4 p-3 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10">
        <div className="flex items-center gap-2.5 truncate">
          <span
            className={`w-3 h-3 rounded-full ${
              paused
                ? 'bg-amber-400'
                : isHandshake
                ? 'bg-cyan-400 animate-pulse'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <div className="truncate">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {paused ? 'Transmission Paused' : isHandshake ? 'Handshake Ready — Scan QR' : 'Optical Beaming Active'}
            </div>
            <div className="text-sm font-bold text-white truncate font-mono">
              {session.file.name}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-ghost text-slate-400 hover:text-white"
          onClick={onExit}
        >
          Exit
        </button>
      </div>

      {/* Optical Frame Canvas Display */}
      <div className="flex-1 flex items-center justify-center w-full my-auto">
        <OpticalDisplay ref={canvas} />
      </div>

      {/* Bottom HUD Controls & Stats */}
      <div className="w-full max-w-2xl space-y-4 p-4 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 shadow-2xl">
        <TransferProgress
          value={Math.min(1, sent)}
          label={
            isHandshake
              ? 'Point receiver camera at screen to capture handshake QR'
              : st && st.cycle > 0
              ? `Pass ${st.cycle + 1} (Fountain carousel loop for packet loss recovery)`
              : 'First pass broadcasting (Receiver reassembles & confirms)'
          }
        />

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-800/60 border border-white/5">
            <div className="label text-[10px]">Current Mode</div>
            <div className="stat-n text-xs text-cyan-300 font-bold uppercase">
              {isHandshake ? 'Handshake QR' : 'Optical Stream'}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-800/60 border border-white/5">
            <div className="label text-[10px]">Speed Ceiling</div>
            <div className="stat-n text-xs text-indigo-300 font-bold">
              {formatRate(ceiling)}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-800/60 border border-white/5">
            <div className="label text-[10px]">Frame Period</div>
            <div className="stat-n text-xs text-white font-bold">
              {ms} ms
            </div>
          </div>
        </div>

        {st?.bufferLow && (
          <div role="alert" className="note panel p-2.5 text-xs text-amber-300 text-center">
            Encoder buffer low — display waiting for data generation.
          </div>
        )}

        {/* Action Button Row */}
        <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => (isHandshake ? engine.current?.startData() : engine.current?.showHandshake(10000))}
          >
            {isHandshake ? 'Switch to Data Beam' : 'Show Handshake QR'}
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => (paused ? engine.current?.resume() : engine.current?.pause())}
          >
            {paused ? (
              <>
                <IconPlay className="w-3.5 h-3.5" /> Resume
              </>
            ) : (
              <>
                <IconPause className="w-3.5 h-3.5" /> Pause
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-sm"
            aria-label="Slower FPS"
            onClick={() => {
              const v = Math.min(1000, Math.round(ms * 1.25));
              setMs(v);
              engine.current?.setFrameMs(v);
            }}
          >
            Slower
          </button>

          <button
            type="button"
            className="btn btn-sm"
            aria-label="Faster FPS"
            onClick={() => {
              const v = Math.max(50, Math.round(ms / 1.25));
              setMs(v);
              engine.current?.setFrameMs(v);
            }}
          >
            Faster
          </button>

          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={onExit}
          >
            Cancel
          </button>
        </div>
      </div>

    </div>
  );
}
