import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import OpticalDisplay from '../components/OpticalDisplay';
import QrScanner from '../components/QrScanner';
import { CalibrationRunner } from '../services/optical/senderEngine';
import { CAL_STEPS, encodeCalStep, encodeCalEnd, decodeRecommendation, type Recommendation, type CalStepMsg } from '../services/optical/calibration';
import { formatRate } from '../utils/format';
import {
  IconOptimize,
  IconQr,
  IconPlay,
  IconAlertCircle,
  IconCheck,
  IconSend,
  IconSparkles
} from '../components/Icons';

/** Sender side of "Optimize Transfer": broadcasts test frames for each configuration. */
export default function CalibrationPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<CalibrationRunner | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [prog, setProg] = useState({ i: 0, n: CAL_STEPS.length, p: '' });
  const [scan, setScan] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('qrbeam.rec') ?? 'null');
    } catch {
      return null;
    }
  });
  const [err, setErr] = useState('');

  useEffect(() => () => runner.current?.cancel(), []);

  const run = async () => {
    setPhase('running');
    setErr('');
    const nonce = crypto.getRandomValues(new Uint32Array(1))[0];
    const steps: CalStepMsg[] = CAL_STEPS.map((s, i) => ({
      ...s,
      step: i,
      total: CAL_STEPS.length,
      nFrames: 40,
      nonce: (nonce + i) >>> 0,
    }));
    runner.current = new CalibrationRunner(
      canvas.current!,
      () => Math.min(window.innerWidth - 32, window.innerHeight * 0.6, 800),
      (i, n, p) => setProg({ i, n, p })
    );
    await runner.current.run(steps, encodeCalEnd(nonce), encodeCalStep);
    setPhase('done');
  };

  const onText = useCallback((t: string) => {
    const r = decodeRecommendation(t);
    if (r) {
      localStorage.setItem('qrbeam.rec', JSON.stringify(r));
      setRec(r);
      setScan(false);
    }
  }, []);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700">
          <IconOptimize className="w-3.5 h-3.5" />
          Sender Calibration
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Optimize Transfer Speed</h1>
        <p className="text-sm text-slate-600">
          Benchmark optical throughput between your two devices to find the optimal matrix density and frame rate.
        </p>
      </div>

      {/* Instructions Card */}
      <div className="panel p-5 space-y-3 bg-white border border-slate-200">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Optimization Workflow
        </h2>
        <ol className="space-y-2 text-xs text-slate-600 pl-4 list-decimal">
          <li>
            Open <Link to="/benchmark" className="text-blue-600 font-bold hover:underline">Benchmark</Link> on the receiving device and point its camera at this screen.
          </li>
          <li>
            Press <strong>Start calibration sequence</strong> below. Test patterns (~{Math.ceil(CAL_STEPS.length * 8)} seconds) will display.
          </li>
          <li>
            When the receiver finishes measuring and displays its recommendation QR code, click <strong>Scan recommendation</strong> here to store optimal parameters.
          </li>
        </ol>
      </div>

      {err && (
        <div role="alert" className="err panel p-4 flex items-start gap-3 text-sm text-rose-700 bg-rose-50 border-rose-200">
          <IconAlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>{err}</div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          className="btn btn-primary flex-1 shadow-md shadow-blue-500/20"
          disabled={phase === 'running'}
          onClick={run}
        >
          <IconPlay className="w-4 h-4" />
          {phase === 'running' ? 'Running Test Patterns…' : 'Start Calibration Sequence'}
        </button>

        {phase === 'running' && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              runner.current?.cancel();
              setPhase('idle');
            }}
          >
            Stop Test
          </button>
        )}

        <button
          type="button"
          className="btn bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
          onClick={() => setScan((s) => !s)}
        >
          <IconQr className="w-4 h-4 text-blue-600" />
          {scan ? 'Close Scanner' : 'Scan Recommendation QR'}
        </button>
      </div>

      {/* Phase progress indicator */}
      {phase === 'running' && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
          <div className="text-sm text-blue-900 font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            Step {Math.min(prog.i + 1, prog.n)} of {prog.n}:{' '}
            <span className="text-blue-700 font-mono uppercase font-bold">
              {prog.p === 'announce' ? 'Announcing matrix' : prog.p === 'test' ? 'Broadcasting test frames' : 'Finalizing'}
            </span>
          </div>
        </div>
      )}

      {/* Test pattern canvas */}
      <div className={phase === 'running' ? 'flex justify-center my-4' : 'hidden'}>
        <OpticalDisplay ref={canvas} label="Calibration test pattern" />
      </div>

      {phase === 'done' && (
        <div role="status" className="panel p-4 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 font-semibold flex items-center gap-2">
          <IconCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          Calibration sequence finished. Point camera at the receiver to scan its computed recommendation.
        </div>
      )}

      {/* Recommendation QR Scanner */}
      {scan && (
        <div className="panel space-y-3 bg-white border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <IconQr className="w-4 h-4 text-blue-600" />
            Scan Receiver's Optimal Settings QR
          </h3>
          <div className="max-w-md mx-auto">
            <QrScanner
              active
              onText={onText}
              onError={(m) => {
                setErr(m);
                setScan(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Saved Recommendation Card */}
      {rec && (
        <div className="panel p-5 space-y-3 bg-white border border-blue-200 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider">
            <IconSparkles className="w-4 h-4 text-blue-600" />
            Active Saved Profile
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {rec.mode === 'qr' ? 'Pure QR' : 'Fast Optical Matrix'} {rec.gx}×{rec.gy}
            {rec.bpc === 2 ? ' · 4-Level Gray' : ''}
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
            <span className="badge badge-indigo">{rec.frameMs} ms ({(1000 / rec.frameMs).toFixed(0)} fps)</span>
            <span className="badge badge-cyan">FEC: {rec.fec}</span>
            <span className="badge badge-emerald">Repeat: {rec.repeat}×</span>
          </div>
          <Link className="btn btn-primary btn-sm mt-2 inline-flex items-center gap-2 shadow-xs" to="/send">
            <IconSend className="w-3.5 h-3.5" />
            Apply Settings in Send Page
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        Speeds are strictly measured by receiver telemetry ({formatRate(0)} until data arrives). The sender cannot estimate link quality autonomously because the optical link is unidirectional.
      </p>

    </div>
  );
}
