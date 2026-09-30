import { useEffect } from 'react';
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: { release(): Promise<void> } | undefined;
    (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, [active]);
}
