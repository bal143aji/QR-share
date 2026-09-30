import { useEffect, useRef, useState } from 'react';
import { IconCamera } from './Icons';

export function cameraErrorMessage(e: unknown): string {
  const n = (e as DOMException)?.name;
  if (!window.isSecureContext) return 'Camera access requires HTTPS (or localhost). Please access the app over a secure origin.';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera permission denied. Please enable camera access in your browser settings.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError') return 'Camera device unavailable. Ensure no other application is using it.';
  return `Camera error: ${String((e as Error)?.message ?? e)}`;
}

interface Props {
  active: boolean;
  shouldCapture: () => boolean;
  onFrame: (img: ImageData) => void;
  onError?: (message: string) => void;
  maxWidth?: number;
  overlay?: React.ReactNode;
}

/** Camera preview with optical viewfinder HUD overlay & adaptive frame sampling. */
export default function CameraScanner({ active, shouldCapture, onFrame, onError, maxWidth = 1920, overlay }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef({ shouldCapture, onFrame, onError });
  cb.current = { shouldCapture, onFrame, onError };
  const [ready, setReady] = useState(false);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false, stream: MediaStream | undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia is not supported on this platform');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 }
          }
        });
        
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        
        const v = video.current!;
        v.srcObject = stream;
        try {
          await v.play();
        } catch (e: any) {
          if (e.name !== 'AbortError') throw e;
        }
        
        if (stopped) return;
        setReady(true);
        if (v.videoWidth && v.videoHeight) {
          setResolution({ w: v.videoWidth, h: v.videoHeight });
        }
        
        const loop = () => {
          if (stopped) return;
          if (v.readyState >= 2 && v.videoWidth > 0 && cb.current.shouldCapture()) {
            const s = Math.min(1, maxWidth / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * s);
            canvas.height = Math.round(v.videoHeight * s);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            cb.current.onFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
          }
          const anyV = v as any;
          if (anyV.requestVideoFrameCallback) anyV.requestVideoFrameCallback(loop);
          else requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        cb.current.onError?.(cameraErrorMessage(e));
      }
    })();
    
    return () => {
      stopped = true;
      setReady(false);
      stream?.getTracks().forEach((t) => t.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [active, maxWidth]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl aspect-[4/3] max-w-full flex items-center justify-center">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Camera optical scanner feed"
        className="w-full h-full object-contain"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setResolution({ w: v.videoWidth, h: v.videoHeight });
        }}
      />

      {!ready ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-sm bg-slate-950/90 z-20">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span>{active ? 'Initializing optical feed…' : 'Camera inactive'}</span>
        </div>
      ) : (
        <>
          {/* Viewfinder HUD Framing Reticles */}
          <div className="absolute inset-4 pointer-events-none z-10">
            {/* Top Left */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            {/* Top Right */}
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            {/* Bottom Left */}
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            {/* Bottom Right */}
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400 rounded-br-lg shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            
            {/* Laser Scanning Line */}
            <div className="laser-line" />
          </div>

          {/* Top Viewfinder HUD Stats */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-mono text-cyan-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE OPTICAL FEED
            </span>
            {resolution && (
              <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300">
                {resolution.w}×{resolution.h}
              </span>
            )}
          </div>
        </>
      )}

      {overlay}
    </div>
  );
}
