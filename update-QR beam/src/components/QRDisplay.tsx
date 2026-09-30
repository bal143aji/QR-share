import { useEffect, useRef } from 'react';
import { drawQrText } from '../services/optical/senderEngine';

export default function QRDisplay({ text, size = 280 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (ref.current) drawQrText(ref.current, text, size);
  }, [text, size]);

  return (
    <div className="p-3 bg-white rounded-2xl shadow-xl inline-flex items-center justify-center border-4 border-slate-800">
      <canvas ref={ref} className="optical-canvas block" role="img" aria-label="QR code" />
    </div>
  );
}
