import { useEffect, useState } from 'react';
export interface VideoMeta { duration: number; width: number; height: number }
/** UI-only metadata/preview. The transfer itself never touches decoded video. */
export default function VideoPreview({ blob, controls = false, onMeta }: { blob: Blob; controls?: boolean; onMeta?: (m: VideoMeta) => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  if (!url) return null;
  return (
    <video src={url} controls={controls} muted preload="metadata" playsInline className={controls ? 'w-full rounded-lg' : 'hidden'}
      onLoadedMetadata={(e) => { const v = e.currentTarget; onMeta?.({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); }} />
  );
}
