import { useCallback, useEffect, useRef } from 'react';
import CameraScanner from './CameraScanner';
import { decodeQrRgba } from '../services/qr/qrDecoder';
import { createNativeQrDetector } from '../services/qr/qrCompatibility';

/** Scans text QR codes on the main thread: native BarcodeDetector when available, jsQR fallback otherwise. */
export default function QrScanner({ active, onText, onError }: { active: boolean; onText: (t: string) => void; onError?: (m: string) => void }) {
  const busy = useRef(false);
  const native = useRef<Awaited<ReturnType<typeof createNativeQrDetector>>>(null);
  useEffect(() => { createNativeQrDetector().then((d) => { native.current = d; }); }, []);
  const onFrame = useCallback(async (img: ImageData) => {
    busy.current = true;
    try {
      let text: string | null = null;
      if (native.current) {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d')!.putImageData(img, 0, 0);
        text = (await native.current.detect(c))[0] ?? null;
      }
      if (!text) text = decodeQrRgba(img.data, img.width, img.height);
      if (text) onText(text);
    } finally { setTimeout(() => { busy.current = false; }, 120); }
  }, [onText]);
  return <CameraScanner active={active} shouldCapture={() => !busy.current} onFrame={onFrame} onError={onError} maxWidth={1280} />;
}
