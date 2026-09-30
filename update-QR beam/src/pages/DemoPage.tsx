import { useRef, useState } from 'react';
import IntegrityBadge from '../components/IntegrityBadge';
import TransferProgress from '../components/TransferProgress';
import { PRESETS, presetById } from '../services/optical/calibration';
import { buildHeader } from '../services/protocol/buildHeader';
import { encodeHeader, decodeHeaderRaw, transferTag } from '../services/protocol/header';
import { computeLayout } from '../services/file/layout';
import { bufferSource, buildSegmentShards } from '../services/file/chunker';
import { FrameBuilder } from '../services/optical/frameBuilder';
import { FramePipeline } from '../services/optical/receiverPipeline';
import { ReceiverSession } from '../services/file/receiverSession';
import { MemoryStore } from '../services/storage/transferStore';
import { simulateCamera, defaultChannel } from '../services/testing/channelSim';
import { sha256Bytes } from '../utils/checksum';
import { formatBytes, formatDuration } from '../utils/format';
import { mulberry32, toHex } from '../utils/binary';
import {
  IconDemo,
  IconPlay,
  IconSliders
} from '../components/Icons';

/** SIMULATION LAB: real encoder + real decoder, with camera replaced by a mathematical channel model. */
export default function DemoPage() {
  const [kb, setKb] = useState(64);
  const [drop, setDrop] = useState(10);
  const [run, setRun] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [prog, setProg] = useState(0);
  const [result, setResult] = useState<{
    ok: boolean;
    hash: string;
    frames: number;
    recovered: number;
    secs: number;
  } | null>(null);
  const stop = useRef(false);
  const say = (s: string) => setLog((l) => [...l, s]);

  async function go() {
    setRun(true);
    setResult(null);
    setLog([]);
    stop.current = false;
    setProg(0);
    try {
      const rnd = mulberry32(Date.now() & 0xffff);
      const file = Uint8Array.from({ length: kb * 1024 }, () => (rnd() * 256) | 0);
      say(`1. Generated synthetic payload: ${formatBytes(file.length)} of high-entropy binary`);
      const digest = sha256Bytes(file);
      say(`2. Cryptographic SHA-256 = ${toHex(digest).slice(0, 24)}…`);
      const p = presetById('o2-64');
      const fec = 'medium' as const;
      const header = buildHeader({
        fileName: 'simulation.bin',
        mimeType: 'application/octet-stream',
        fileSize: file.length,
        fileHash: digest,
        params: p,
        frameMs: 150,
        repeat: 1,
        fec,
        encrypted: false,
        handshakeEverySec: 30,
      });
      const hb = await encodeHeader(header);
      const h = decodeHeaderRaw(hb).header;
      say(`3. Handshake header constructed: ${hb.length} bytes → parsed ${h.gx}×${h.gy} matrix, ${h.totalChunks} chunks`);
      const layout = computeLayout(h.fileSize, h.chunkSize, h.segK, h.segP, false);
      const src = bufferSource(file);
      const cache = new Map<number, Uint8Array[]>();
      const fb = new FrameBuilder(header, layout, {
        getShards: async (s) => {
          if (!cache.has(s)) cache.set(s, await buildSegmentShards(src, layout, layout.segments[s]));
          return cache.get(s)!;
        },
      });
      const store = new MemoryStore();
      const session = new ReceiverSession(h, layout, store);
      await session.init(hb);
      const pipe = new FramePipeline(
        { mode: h.mode, gx: h.gx, gy: h.gy, R: h.regionCells, bpc: h.bpc, tag: transferTag(h.transferId) },
        (pk) => session.accept(pk)
      );
      say(`4. Broadcasting optical frames through simulated channel (${drop}% loss, distortion, noise)…`);
      const t0 = performance.now();
      let frames = 0;
      const r2 = mulberry32(7);
      while (!session.isComplete() && frames < 20000 && !stop.current) {
        const f = await fb.next();
        frames++;
        if (r2() * 100 < drop) continue;
        const cam = simulateCamera(f.cells, fb.geom.W, fb.geom.H, {
          ...defaultChannel,
          seed: frames,
          rotationDeg: (r2() - 0.5) * 6,
        });
        await pipe.process(cam.gray, cam.w, cam.h);
        if (frames % 4 === 0) {
          setProg(session.progress());
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      setProg(1);
      say(`5. Reassembling ${session.doneCount}/${session.total} segments; FEC recovered ${session.recovered} dropped shards`);
      const res = await session.finalize();
      say(`6. SHA-256 verification: ${res.ok ? 'MATCH ✓' : 'MISMATCH ✗'}`);
      setResult({
        ok: res.ok,
        hash: res.hashHex,
        frames,
        recovered: session.recovered,
        secs: (performance.now() - t0) / 1000,
      });
    } catch (e) {
      say(`Error: ${String(e)}`);
    }
    setRun(false);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
          <IconDemo className="w-3.5 h-3.5" />
          Simulation Laboratory
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          Pipeline Simulator
          <span className="badge badge-amber text-xs">Simulated Camera</span>
        </h1>
        <p className="text-sm text-slate-600">
          Executes the complete cryptographic pipeline (chunking, Reed-Solomon coding, frame packing, perspective warping & SHA-256 verification) entirely in memory.
        </p>
      </div>

      {/* Control Configuration */}
      <div className="panel p-5 space-y-4 bg-white border border-slate-200">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <IconSliders className="w-4 h-4 text-blue-600" />
          Channel & Payload Parameters
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label text-slate-700" htmlFor="kb">Sample Payload Size</label>
            <div className="flex items-center gap-2">
              <input
                id="kb"
                type="number"
                min={4}
                max={2048}
                className="field font-mono"
                value={kb}
                onChange={(e) => setKb(Math.max(4, +e.target.value))}
              />
              <span className="text-xs text-slate-500 font-mono">KB</span>
            </div>
          </div>

          <div>
            <label className="label text-slate-700" htmlFor="dr">Simulated Dropped Frames</label>
            <div className="flex items-center gap-2">
              <input
                id="dr"
                type="number"
                min={0}
                max={50}
                className="field font-mono"
                value={drop}
                onChange={(e) => setDrop(+e.target.value)}
              />
              <span className="text-xs text-slate-500 font-mono">% loss</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg shadow-md shadow-blue-500/20 text-base"
          disabled={run}
          onClick={go}
        >
          <IconPlay className="w-5 h-5" />
          {run ? 'Running Pipeline Simulation…' : 'Execute Pipeline Simulation'}
        </button>
      </div>

      {/* Progress Bar */}
      {(run || prog > 0) && (
        <div className="panel p-5 bg-white border border-slate-200">
          <TransferProgress value={prog} label="Simulated In-Memory Reception" />
        </div>
      )}

      {/* Terminal Log Console */}
      {log.length > 0 && (
        <div className="panel p-4 space-y-2 bg-slate-900 border border-slate-800 font-mono text-xs shadow-inner rounded-xl">
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
            <span>PIPELINE EXECUTION STREAM</span>
            <span className="text-slate-500">{log.length} EVENTS</span>
          </div>
          <ol className="space-y-1 text-slate-300 max-h-64 overflow-y-auto pr-1">
            {log.map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-slate-500 select-none">{String(i + 1).padStart(2, '0')}</span>
                <span className={l.includes('MATCH ✓') ? 'text-emerald-400 font-bold' : l.includes('Error') ? 'text-rose-400' : 'text-slate-200'}>
                  {l}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Result Verification Card */}
      {result && (
        <div className={`panel p-6 space-y-4 bg-white ${result.ok ? 'border-emerald-300 shadow-md' : 'border-rose-300'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {result.ok ? 'Simulation Verification Succeeded' : 'Simulation Failed'}
            </h2>
            <IntegrityBadge status={result.ok ? 'verified' : 'failed'} />
          </div>

          <p className="text-xs text-slate-600">
            Processed <strong>{result.frames} frames</strong> in <strong>{formatDuration(result.secs)}</strong> compute time. Reed-Solomon successfully recovered <strong>{result.recovered} shards</strong> lost to simulated channel drops.
          </p>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-blue-700 break-all font-semibold">
            Digest: {result.hash}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>{PRESETS.length} production presets available in Send mode</span>
        <span>Reed-Solomon RS(k, p)</span>
      </div>

    </div>
  );
}
