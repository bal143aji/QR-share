import { useCallback, useEffect, useRef, useState } from 'react';
import CameraScanner from '../components/CameraScanner';
import QRDisplay from '../components/QRDisplay';
import { ReceiverClient } from '../services/receiverClient';
import { decodeCalStep, decodeCalEnd, recommend, encodeRecommendation, CAL_STEPS, type Recommendation } from '../services/optical/calibration';
import type { CalStepResult, QualityReport } from '../types/performance';
import { formatBytes, formatPct, formatRate, formatDuration } from '../utils/format';
import {
  IconBenchmark,
  IconCamera,
  IconAlertCircle,
  IconSparkles,
} from '../components/Icons';

/** Receiver side of calibration: measures real decode reliability and throughput per configuration. */
export default function BenchmarkPage() {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<CalStepResult[]>([]);
  const [status, setStatus] = useState('Point this camera at the sender displaying “Optimize”.');
  const [done, setDone] = useState(false);
  const [q, setQ] = useState<QualityReport | null>(null);
  const client = useRef<ReceiverClient | null>(null);
  const lastNonce = useRef<number | null>(null);
  const seenEnd = useRef(false);

  useEffect(() => () => client.current?.dispose(), []);

  const start = () => {
    setOn(true);
    setResults([]);
    setDone(false);
    seenEnd.current = false;
    lastNonce.current = null;
    setErr('');
    client.current?.dispose();
    client.current = new ReceiverClient({
      onQr: (t) => {
        const s = decodeCalStep(t);
        if (s && s.nonce !== lastNonce.current) {
          lastNonce.current = s.nonce;
          client.current!.calStep(s);
          setStatus(`Benchmarking step ${s.step + 1}/${s.total}: ${s.mode === 'qr' ? 'Pure QR' : 'Optical'} ${s.gx}×${s.gy}, ${s.frameMs} ms`);
          return;
        }
        const e = decodeCalEnd(t);
        if (e !== null && !seenEnd.current) {
          seenEnd.current = true;
          client.current!.calEnd();
          setTimeout(() => {
            setDone(true);
            setStatus('Calibration complete — optimal parameters computed.');
          }, 400);
        }
      },
      onCalResult: (r) => setResults((x) => [...x.filter((y) => y.step !== r.step), r].sort((a, b) => a.step - b.step)),
      onQuality: (qq) => setQ(qq),
      onError: (_c, m) => setErr(m),
    });
    client.current.setMode('cal');
  };

  const shouldCapture = useCallback(() => !!client.current && !client.current.busy, []);
  const onFrame = useCallback((img: ImageData) => {
    client.current?.sendFrame(img);
  }, []);

  const { rec, note } = done ? recommend(results) : { rec: null as Recommendation | null, note: '' };
  const best = rec ? results.filter((r) => r.reliability >= 0.5).sort((a, b) => b.throughput - a.throughput)[0] : undefined;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
          <IconBenchmark className="w-3.5 h-3.5" />
          Receiver Benchmark Suite
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Optical Performance Benchmark</h1>
        <p className="text-sm text-slate-600">
          Measures real optical frame decoding rates, reliability scores, and matrix resilience under active ambient lighting.
        </p>
      </div>

      {err && (
        <div role="alert" className="err panel p-4 flex items-start gap-3 text-sm text-rose-700 bg-rose-50 border-rose-200">
          <IconAlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>{err}</div>
        </div>
      )}

      {!on ? (
        <div className="panel p-8 text-center space-y-5 bg-white border border-slate-200">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto shadow-xs">
            <IconCamera className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-slate-900">Activate Receiver Benchmark</h2>
            <p className="text-sm text-slate-500">
              Align camera with the sender screen running the Optimize calibration loop.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg max-w-sm mx-auto shadow-md shadow-blue-500/20 text-base"
            onClick={start}
          >
            <IconCamera className="w-5 h-5" />
            Start Camera & Benchmark
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="max-w-md mx-auto">
            <CameraScanner
              active
              shouldCapture={shouldCapture}
              onFrame={onFrame}
              onError={(m) => {
                setErr(m);
                setOn(false);
              }}
              maxWidth={1920}
            />
          </div>
          
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-blue-700 font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              {status}
            </span>
            {q && (
              <span className="font-mono text-slate-600">
                Detection confidence: <strong className="text-slate-900">{formatPct(q.detection, 0)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Benchmark Results Telemetry Table */}
      <div className="panel p-5 space-y-3 overflow-hidden bg-white border border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Empirical Test Telemetry (Hardware Realized)
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            {results.length} / {CAL_STEPS.length} Configurations Run
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2.5 pr-4">Configuration</th>
                <th className="py-2.5 pr-4">Period</th>
                <th className="py-2.5 pr-4">Valid Blocks</th>
                <th className="py-2.5 pr-4">Reliability</th>
                <th className="py-2.5 pr-4">Net Throughput</th>
                <th className="py-2.5">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {results.map((r) => {
                const isHigh = r.reliability >= 0.9;
                const isMarginal = r.reliability >= 0.5 && !isHigh;
                return (
                  <tr key={r.step} className="hover:bg-slate-50/80">
                    <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900">{r.label}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.frameMs} ms</td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {r.regionsValid}/{r.regionsExpected}
                    </td>
                    <td className="py-2.5 pr-4 font-bold text-slate-800">
                      {formatPct(r.reliability, 1)}
                    </td>
                    <td className="py-2.5 pr-4 font-bold text-blue-700">
                      {formatRate(r.throughput)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`badge text-[10px] ${
                          isHigh ? 'badge-emerald' : isMarginal ? 'badge-amber' : 'badge-rose'
                        }`}
                      >
                        {isHigh ? 'Optimal' : isMarginal ? 'Marginal' : 'Unstable'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                    Awaiting calibration steps. Start camera and point at sender screen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Computed Recommendation Result */}
      {done &&
        (rec && best ? (
          <div className="panel p-6 sm:p-8 space-y-6 bg-white border border-emerald-300 shadow-md">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <IconSparkles className="w-4 h-4" />
              Optimal Recommendation Calculated
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                {best.label} · {rec.frameMs} ms · FEC {rec.fec} · {rec.repeat}×
              </h2>
              <p className="text-sm text-slate-700">
                Effective payload rate:{' '}
                <strong className="text-blue-700 font-mono text-base">
                  {formatRate(
                    best.throughput *
                      (rec.fec === 'off' ? 1 : rec.fec === 'low' ? 0.94 : rec.fec === 'medium' ? 0.88 : 0.75)
                  )}
                </strong>{' '}
                after Reed-Solomon parity overhead.
              </p>
              <p className="text-xs text-slate-500">
                {note} A 1 GB file is estimated to take ~<strong>{formatDuration(1024 ** 3 / best.throughput)}</strong>; a 10 MB payload ~<strong>{formatDuration((10 * 1024 ** 2) / best.throughput)}</strong>.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs text-slate-600 text-center">
                Point sender device camera at this QR code and click <strong>“Scan recommendation”</strong> on sender.
              </p>
              <QRDisplay text={encodeRecommendation(rec)} size={260} />
            </div>
          </div>
        ) : (
          <div role="alert" className="err panel p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">
            {note || 'No successful benchmark results recorded.'}
          </div>
        ))}

    </div>
  );
}
