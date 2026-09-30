import { useCallback, useEffect, useRef, useState } from 'react';
import CameraScanner from '../components/CameraScanner';
import TransferProgress from '../components/TransferProgress';
import SpeedMeter from '../components/SpeedMeter';
import IntegrityBadge from '../components/IntegrityBadge';
import QRImageImporter from '../components/QRImageImporter';
import { WifiReceiverView } from '../components/WifiTransferView';
import { useWakeLock } from '../components/useWakeLock';
import CompletePage from './CompletePage';
import { ReceiverClient, type DoneMsg } from '../services/receiverClient';
import { decodeHeaderRaw, handshakeFromText } from '../services/protocol/header';
import { guidance } from '../services/performance/adaptiveController';
import type { QualityReport, ReceiverStats } from '../types/performance';
import type { ReceiverState, TransferHeader } from '../types/transfer';
import { formatBytes, formatPct } from '../utils/format';
import {
  IconReceive,
  IconLock,
  IconAlertCircle,
  IconCamera,
  IconShieldCheck,
  IconActivity,
  IconSparkles,
  IconQr,
  IconWifi,
} from '../components/Icons';


const noQ: QualityReport = { lighting: 'unknown', distance: 'unknown', focus: 'unknown', detection: 0 };
const good = (v: string) => (v === 'good' ? 'Good' : v === 'unknown' ? '–' : v);

export default function ReceivePage() {
  const [receiveMethod, setReceiveMethod] = useState<'camera' | 'import' | 'wifi'>('camera');
  const [state, setState] = useState<ReceiverState>('IDLE');
  const [error, setError] = useState('');
  const [found, setFound] = useState<{ bytes: Uint8Array; header: TransferHeader } | null>(null);
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  const [q, setQ] = useState<QualityReport>(noQ);
  const [done, setDone] = useState<DoneMsg | null>(null);
  const [resumed, setResumed] = useState(0);
  const [meta, setMeta] = useState({ name: '', mime: '' });
  const client = useRef<ReceiverClient | null>(null);
  const foundRef = useRef(found);
  foundRef.current = found;
  const stateRef = useRef(state);
  stateRef.current = state;

  useWakeLock(state === 'RECEIVING' || state === 'WAITING_FOR_HANDSHAKE');

  const startCamera = () => {
    setError('');
    setDone(null);
    setFound(null);
    setStats(null);
    client.current?.dispose();
    client.current = new ReceiverClient({
      onQr: async (t) => {
        if (t.startsWith('QRBEAM_SDP:')) {
          setReceiveMethod('wifi');
          return;
        }
        if (stateRef.current !== 'WAITING_FOR_HANDSHAKE') return;
        const bytes = handshakeFromText(t);

        if (!bytes) return;
        try {
          const { header } = decodeHeaderRaw(bytes);
          setFound({ bytes, header });
          if (header.encrypted) {
            setState('HANDSHAKE_RECEIVED');
          } else {
            try {
              const est = await navigator.storage?.estimate?.();
              if (
                est?.quota !== undefined &&
                est.usage !== undefined &&
                est.quota - est.usage < header.fileSize * 1.3
              ) {
                setError(
                  `Insufficient local storage: need about ${formatBytes(header.fileSize * 1.3)}, ${formatBytes(
                    est.quota - est.usage
                  )} available.`
                );
                return;
              }
            } catch {
              /* estimate unsupported: continue */
            }
            client.current?.configure(bytes);
          }
        } catch {
          /* not ours / damaged: keep scanning */
        }
      },
      onStats: (s, qq) => {
        setStats(s);
        setQ(qq);
      },
      onQuality: (qq) => setQ(qq),
      onConfigured: (r, _s, name, mime) => {
        setResumed(r);
        setMeta({ name, mime });
        setState('RECEIVING');
      },
      onState: (s) => setState(s as ReceiverState),
      onDone: (d) => {
        setDone(d);
        setState(d.ok ? 'COMPLETE' : 'ERROR');
      },
      onError: (code, m) => {
        setError(code === 'password' ? 'Incorrect encryption password — please re-enter.' : `Error: ${m}`);
        if (code !== 'password') setState('ERROR');
      },
    });
    client.current.setMode('scan');
    setState('WAITING_FOR_HANDSHAKE');
  };

  useEffect(() => () => client.current?.dispose(), []);

  const begin = async () => {
    if (!found) return;
    setError('');
    try {
      const est = await navigator.storage?.estimate?.();
      if (
        est?.quota !== undefined &&
        est.usage !== undefined &&
        est.quota - est.usage < found.header.fileSize * 1.3
      )
        return setError(
          `Insufficient local storage: need about ${formatBytes(found.header.fileSize * 1.3)}, ${formatBytes(
            est.quota - est.usage
          )} available.`
        );
    } catch {
      /* estimate unsupported: continue */
    }
    client.current?.configure(found.bytes, password);
  };

  const shouldCapture = useCallback(
    () =>
      !!client.current &&
      !client.current.busy &&
      stateRef.current !== 'HANDSHAKE_RECEIVED' &&
      ['WAITING_FOR_HANDSHAKE', 'RECEIVING'].includes(stateRef.current),
    []
  );

  const onFrame = useCallback((img: ImageData) => {
    client.current?.sendFrame(img);
  }, []);

  const reset = () => {
    client.current?.cancel();
    setState('IDLE');
    setFound(null);
    setDone(null);
    setStats(null);
  };

  if (state === 'COMPLETE' || (state === 'ERROR' && done)) {
    const h = found?.header;
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <CompletePage
          done={done!}
          name={meta.name || h?.fileName || 'received-file'}
          mime={meta.mime || h?.mimeType || ''}
          onCleanup={() => client.current?.cleanup()}
          onNew={() => {
            setState('IDLE');
            setFound(null);
            setDone(null);
          }}
        />
      </div>
    );
  }

  const receiving = state === 'RECEIVING';
  const errorRate = stats?.errorRate ?? 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
          <IconReceive className="w-3.5 h-3.5" />
          Receiver Mode
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Receive a File</h1>
        <p className="text-sm text-slate-600">
          Scan a live optical / QR sequence with the camera, or import a saved QR package from messaging apps / storage.
        </p>
      </div>

      {/* Primary Method Selector — Near vs Far UX */}
      <div className="flex rounded-xl bg-slate-100 p-1.5 border border-slate-200">
        <button
          type="button"
          id="receive-method-camera"
          onClick={() => setReceiveMethod('camera')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            receiveMethod === 'camera'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IconCamera className="w-4 h-4" />
          <span>📷 Scan Live QR</span>
        </button>

        <button
          type="button"
          id="receive-method-import"
          onClick={() => setReceiveMethod('import')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            receiveMethod === 'import'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IconQr className="w-4 h-4" />
          <span>🖼 Import QR Package</span>
        </button>

        <button
          type="button"
          id="receive-method-wifi"
          onClick={() => setReceiveMethod('wifi')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            receiveMethod === 'wifi'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <IconWifi className="w-4 h-4" />
          <span>Wi-Fi P2P</span>
        </button>
      </div>

      {/* Mode Description Banners */}
      {receiveMethod === 'camera' && (
        <div className="px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium">
          <strong>Live QR / Optical Scan:</strong> Keep both devices nearby. Point this device's camera at the sender's screen to scan the QR sequence.
        </div>
      )}
      {receiveMethod === 'import' && (
        <div className="px-3.5 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 font-medium">
          <strong>QR Image Relay:</strong> The receiver does <em>not</em> scan the sender screen directly. Import the QRBeam ZIP package (received via WhatsApp, Telegram, Email, or any app). QRBeam automatically extracts and decodes the QR images.
        </div>
      )}

      {error && (
        <div role="alert" className="err panel p-4 flex items-start gap-3 text-sm text-rose-300">
          <IconAlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Method B: Import QR Images / Package from Gallery/Files/ZIP */}
      {receiveMethod === 'import' && (
        <div className="panel p-6">
          <QRImageImporter />
        </div>
      )}

      {/* Wi-Fi P2P Receiver */}
      {receiveMethod === 'wifi' && (
        <WifiReceiverView onExit={() => setReceiveMethod('camera')} />
      )}

      {/* Method A: Live Camera Scanner */}
      {receiveMethod === 'camera' && (
        <>
          {/* Start Camera CTA */}
          {state === 'IDLE' && (
            <div className="panel p-8 text-center space-y-6 bg-white border border-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto shadow-sm">
                <IconCamera className="w-8 h-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="text-xl font-bold text-slate-900">Ready to scan sender display</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Ensure camera permissions are allowed and the sender device is displaying the handshake QR code or active optical beam.
                </p>
              </div>
              <button
                type="button"
                id="activate-camera-btn"
                className="btn btn-primary btn-lg max-w-sm mx-auto shadow-md shadow-blue-500/25 text-base"
                onClick={startCamera}
              >
                <IconCamera className="w-5 h-5" />
                Activate Camera Receiver
              </button>
            </div>
          )}

          {/* Camera Live Viewfinder */}
          {state !== 'IDLE' && (
            <CameraScanner
              active
              shouldCapture={shouldCapture}
              onFrame={onFrame}
              onError={(m) => {
                setError(m);
                setState('ERROR');
              }}
            />
          )}

          {/* Searching status hint */}
          {state === 'WAITING_FOR_HANDSHAKE' && (
            <div className="panel space-y-3 p-5 bg-white border border-slate-200" role="status">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Searching for Optical Handshake…
              </div>
              <ul className="text-xs space-y-1.5 list-disc pl-5 text-slate-600">
                <li>Position the sender screen inside the viewfinder reticle.</li>
                <li>Maintain steady distance without excessive angle or direct glare.</li>
                <li>Sender continuously refreshes the handshake QR code.</li>
              </ul>
            </div>
          )}

          {/* Handshake Confirmed Dialog */}
          {state === 'HANDSHAKE_RECEIVED' && found && (
            <div className="panel p-6 space-y-4 border-blue-300 shadow-xl bg-white">
              <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider">
                <IconSparkles className="w-4 h-4 text-blue-600" />
                Handshake Detected
              </div>
              
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900 break-all">
                  {found.header.encrypted && !password
                    ? '🔒 Encrypted Optical Transfer'
                    : found.header.fileName || 'Incoming File'}
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-mono text-blue-600 font-bold">{formatBytes(found.header.fileSize)}</span>
                  <span>•</span>
                  <span>{found.header.mode === 'optical' ? `Fast Optical ${found.header.gx}×${found.header.gy}` : `Pure QR ${found.header.gx}×${found.header.gy}`}</span>
                  {found.header.encrypted && <span>• AES-256-GCM</span>}
                </div>
              </div>

              {found.header.encrypted && (
                <div className="space-y-2 pt-2">
                  <label className="label text-slate-300" htmlFor="rpw">
                    Decryption Password
                  </label>
                  <input
                    id="rpw"
                    type="password"
                    className="field"
                    placeholder="Enter password shared by sender"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn btn-primary flex-1" onClick={begin}>
                  Start Receiving Transfer
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-slate-400"
                  onClick={() => {
                    setFound(null);
                    setState('WAITING_FOR_HANDSHAKE');
                  }}
                >
                  Ignore
                </button>
              </div>
            </div>
          )}

          {/* Active Transmission Dashboard */}
          {(receiving || state === 'VERIFYING' || state === 'HASH_CHECK' || state === 'REASSEMBLING') && (
            <div className="panel p-6 space-y-5" aria-live="polite">
              {resumed > 0 && (
                <div className="note panel p-2.5 text-xs text-amber-300">
                  Resumed: {formatPct(resumed)} was already cached locally.
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <div className="font-bold text-slate-900 text-base truncate font-mono">
                  {meta.name || found?.header.fileName || 'Encrypted Stream'}
                </div>
                <IntegrityBadge status={state === 'VERIFYING' || state === 'HASH_CHECK' ? 'pending' : 'pending'} />
              </div>

              <TransferProgress
                value={stats?.progress ?? 0}
                label={
                  state === 'VERIFYING' || state === 'HASH_CHECK'
                    ? 'Verifying cryptographic SHA-256 checksum…'
                    : `Receiving: ≈ ${formatBytes((stats?.progress ?? 0) * (found?.header.fileSize ?? 0))} of ${formatBytes(
                        found?.header.fileSize ?? 0
                      )}`
                }
              />

              {state !== 'VERIFYING' && state !== 'HASH_CHECK' && (
                <SpeedMeter rate={stats?.rate ?? 0} etaSec={stats?.etaSec ?? Infinity} />
              )}

              {/* Granular Optical Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <div className="label text-[10px] text-slate-500">Segments</div>
                  <div className="stat-n text-xs text-slate-900 font-bold">
                    {stats?.segmentsDone ?? 0}/{stats?.segmentsTotal ?? 0}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Frames Seen</div>
                  <div className="stat-n text-xs text-slate-700 font-bold">
                    {stats?.framesSeen ?? 0}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Valid Blocks</div>
                  <div className="stat-n text-xs text-blue-600 font-bold">
                    {stats?.regionsValid ?? 0}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">FEC Recovered</div>
                  <div className="stat-n text-xs text-emerald-600 font-bold">
                    {stats?.shardsRecovered ?? 0}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Duplicates</div>
                  <div className="stat-n text-xs text-slate-600 font-bold">
                    {(stats?.shardsDuplicate ?? 0) + (stats?.framesDuplicate ?? 0)}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Error Rate</div>
                  <div className="stat-n text-xs text-amber-600 font-bold">
                    {formatPct(errorRate, 1)}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Matrix Mode</div>
                  <div className="stat-n text-xs text-slate-700 font-bold">
                    {found?.header.mode === 'qr' ? 'QR' : 'Optical'} {found?.header.gx}×{found?.header.gy}
                  </div>
                </div>

                <div>
                  <div className="label text-[10px] text-slate-500">Detection</div>
                  <div className="stat-n text-xs text-blue-600 font-bold">
                    {formatPct(q.detection, 0)}
                  </div>
                </div>
              </div>

              {/* Signal Quality Pills */}
              <div className="flex items-center justify-between gap-2 text-xs flex-wrap p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-semibold">Signal Quality:</span>
                <span className="badge badge-indigo">Lighting: {good(q.lighting)}</span>
                <span className="badge badge-indigo">Focus: {good(q.focus)}</span>
                <span className="badge badge-indigo">Distance: {good(q.distance)}</span>
              </div>

              {/* Dynamic Guidance Tip */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium">
                💡 {guidance(q, errorRate, stats?.regionsAttempted ?? 0)}
              </div>

              <button type="button" className="btn btn-sm btn-danger w-full" onClick={reset}>
                Cancel & Discard Partial Data
              </button>
            </div>
          )}

          {state === 'ERROR' && !done && (
            <button type="button" className="btn btn-primary w-full" onClick={reset}>
              Reset & Try Again
            </button>
          )}
        </>
      )}

    </div>
  );
}
