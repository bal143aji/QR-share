import { useEffect, useState } from 'react';
import type { DoneData } from '../services/optical/opticalDecoder';
import { formatBytes, formatDuration, formatRate } from '../utils/format';
import VideoPreview from '../components/VideoPreview';
import IntegrityBadge from '../components/IntegrityBadge';
import {
  IconShieldCheck,
  IconAlertCircle,
  IconDownload,
  IconRefresh,
  IconCopy,
  IconCheck,
  IconImage,
  IconVideo,
  IconPlay
} from '../components/Icons';

export default function CompletePage({
  done,
  onNew,
  onCleanup,
}: {
  done: DoneData;
  onNew: () => void;
  onCleanup: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (done.blob) {
      const u = URL.createObjectURL(done.blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [done.blob]);

  const name = done.name || 'received-file.bin';
  const mime = done.mime || 'application/octet-stream';
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
  const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name);
  const s = done.stats;

  function copyHash() {
    if (done.hashHex) {
      navigator.clipboard.writeText(done.hashHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!done.verified) {
    return (
      <div className="panel err p-6 sm:p-8 space-y-6 bg-rose-50 border border-rose-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600">
            <IconAlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-rose-950">Integrity Verification Failed</h2>
            <p className="text-xs text-rose-800">{done.reason || 'Cryptographic verification failed'}</p>
          </div>
        </div>

        <IntegrityBadge status="failed" />

        <div className="p-3 rounded-xl bg-white border border-rose-200 text-xs font-mono break-all text-slate-700">
          Received SHA-256: <span className="text-rose-700 font-bold">{done.hashHex || 'n/a'}</span>
        </div>

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            onCleanup();
            onNew();
          }}
        >
          <IconRefresh className="w-4 h-4" />
          Discard & Start Over
        </button>
      </div>
    );
  }

  return (
    <div className="panel p-6 sm:p-8 space-y-6 bg-white border border-emerald-300 shadow-lg">
      
      {/* Header status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 shadow-sm">
            <IconShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Transfer Complete</h2>
            <p className="text-xs text-emerald-700 font-semibold">
              Byte-for-byte verified with sender (SHA-256 match)
            </p>
          </div>
        </div>

        <IntegrityBadge status="verified" />
      </div>

      {/* File Name Banner */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 overflow-hidden">
        {isImage ? (
          <IconImage className="w-6 h-6 text-blue-600 shrink-0" />
        ) : isVideo ? (
          <IconVideo className="w-6 h-6 text-blue-600 shrink-0" />
        ) : (
          <IconShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
        )}
        <div className="truncate flex-1">
          <div className="text-xs text-slate-500 font-medium">Reassembled File</div>
          <div className="text-base font-bold text-slate-900 font-mono truncate">{name}</div>
        </div>
        <span className="font-mono text-xs text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 shrink-0">
          {formatBytes(done.size)}
        </span>
      </div>

      {/* Media Previews */}
      {isImage && url && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-96 flex items-center justify-center bg-slate-50 p-2 shadow-sm">
          <img src={url} alt={name} className="max-h-80 max-w-full object-contain rounded-xl shadow-md" />
        </div>
      )}

      {isVideo && (
        <div className="space-y-3">
          {playing ? (
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-black shadow-lg">
              <VideoPreview blob={done.blob!} controls />
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm w-full bg-white text-blue-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50"
              onClick={() => setPlaying(true)}
            >
              <IconPlay className="w-4 h-4" />
              Preview Reassembled Video
            </button>
          )}
        </div>
      )}

      {/* Transfer Metrics Grid */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Transfer Telemetry
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <dt className="text-slate-500">Total Duration</dt>
            <dd className="text-sm font-mono font-bold text-slate-900 mt-0.5">{formatDuration(s.elapsedSec)}</dd>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <dt className="text-slate-500">Average Rate</dt>
            <dd className="text-sm font-mono font-bold text-blue-700 mt-0.5">
              {s.elapsedSec > 0 ? formatRate(done.size / s.elapsedSec) : '–'}
            </dd>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <dt className="text-slate-500">Frames Observed / Distinct</dt>
            <dd className="text-sm font-mono font-bold text-slate-800 mt-0.5">
              {s.seqSpan.toLocaleString()} / {s.framesSeen.toLocaleString()}
            </dd>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <dt className="text-slate-500">Valid Blocks</dt>
            <dd className="text-sm font-mono font-bold text-slate-800 mt-0.5">{s.regionsValid.toLocaleString()}</dd>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-2">
            <dt className="text-slate-500">FEC Shards Recovered</dt>
            <dd className="text-sm font-mono font-bold text-emerald-700 mt-0.5">
              {s.shardsRecovered.toLocaleString()} shards restored via parity
            </dd>
          </div>
        </dl>
      </div>

      {/* SHA-256 Digest Box with Copy */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold">Cryptographic SHA-256 Hash</span>
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
            onClick={copyHash}
          >
            {copied ? (
              <>
                <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> Copied
              </>
            ) : (
              <>
                <IconCopy className="w-3.5 h-3.5" /> Copy Digest
              </>
            )}
          </button>
        </div>
        <div className="font-mono text-[11px] text-slate-800 break-all select-all font-medium">
          {done.hashHex}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap pt-2">
        <a
          className="btn btn-primary flex-1 shadow-md shadow-blue-500/20"
          href={url}
          download={name}
          onClick={() => setTimeout(onCleanup, 3000)}
        >
          <IconDownload className="w-5 h-5" />
          Save {isImage ? 'Image' : isVideo ? 'Video' : 'File'} to Device
        </a>

        <button
          type="button"
          className="btn bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          onClick={() => {
            onCleanup();
            onNew();
          }}
        >
          <IconRefresh className="w-4 h-4" />
          New Transfer
        </button>
      </div>

    </div>
  );
}
