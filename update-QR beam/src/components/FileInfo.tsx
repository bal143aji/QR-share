import { useState } from 'react';
import { formatBytes, formatDuration } from '../utils/format';
import VideoPreview, { type VideoMeta } from './VideoPreview';
import { IconFile, IconVideo, IconImage, IconFileText, IconSparkles } from './Icons';

function getFileIcon(mime: string, name: string) {
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) {
    return <IconImage className="w-5 h-5 text-sky-600" />;
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name)) {
    return <IconVideo className="w-5 h-5 text-blue-600" />;
  }
  if (mime.startsWith('text/') || /\.(txt|json|md|html|js|ts|pdf)$/i.test(name)) {
    return <IconFileText className="w-5 h-5 text-amber-600" />;
  }
  return <IconFile className="w-5 h-5 text-slate-500" />;
}

export default function FileInfo({ file, synthetic }: { file: File; synthetic?: boolean }) {
  const [meta, setMeta] = useState<VideoMeta>();
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);

  return (
    <div className="panel bg-white border-slate-200 relative overflow-hidden" aria-label="Selected file details">
      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
          {getFileIcon(file.type, file.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 truncate max-w-full">
              {file.name}
            </h3>
            {synthetic && (
              <span className="badge badge-amber text-[10px]">
                <IconSparkles className="w-3 h-3" />
                Synthetic Sample
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-slate-600 flex-wrap">
            <span className="font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {formatBytes(file.size)}
            </span>
            <span>•</span>
            <span className="truncate max-w-[200px] text-slate-700 font-mono">
              {file.type || 'application/octet-stream'}
            </span>
            {meta && isVideo && (
              <>
                <span>•</span>
                <span>{meta.width}×{meta.height}</span>
                <span>•</span>
                <span>{formatDuration(meta.duration)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {synthetic && (
        <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <strong>Synthetic test data:</strong> Filled with 512 KB of pseudorandom entropy. Real Reed-Solomon coding, framing, and SHA-256 integrity apply.
        </p>
      )}

      {isVideo && (
        <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
          <VideoPreview blob={file} controls onMeta={setMeta} />
        </div>
      )}
    </div>
  );
}
