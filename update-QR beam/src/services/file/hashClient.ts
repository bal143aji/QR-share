import { Sha256Stream } from '../../utils/checksum';

async function hashFileMainThread(
  file: Blob,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean
): Promise<Uint8Array> {
  const h = new Sha256Stream();
  const chunkSize = 1024 * 1024;
  let done = 0;
  let lastPost = 0;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (isCancelled()) throw new Error('Hashing cancelled');
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const buf = await slice.arrayBuffer();
    h.update(new Uint8Array(buf));
    done += buf.byteLength;
    const now = Date.now();
    if (now - lastPost > 150) {
      lastPost = now;
      onProgress(done, file.size);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return h.digest();
}

/** Streaming SHA-256 of a File in a Worker with automatic main-thread fallback. */
export function hashFile(file: Blob, onProgress: (done: number, total: number) => void): { promise: Promise<Uint8Array>; cancel(): void } {
  let cancelled = false;
  let w: Worker | null = null;
  const cancel = () => {
    cancelled = true;
    if (w) {
      w.terminate();
      w = null;
    }
  };

  const promise = new Promise<Uint8Array>((res, rej) => {
    try {
      w = new Worker(new URL('../../workers/hashWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        if (cancelled) return;
        if (e.data.t === 'progress') {
          onProgress(e.data.done, e.data.total);
        } else if (e.data.t === 'done') {
          w?.terminate();
          w = null;
          res(e.data.hash);
        } else {
          w?.terminate();
          w = null;
          hashFileMainThread(file, onProgress, () => cancelled).then(res, rej);
        }
      };
      w.onerror = () => {
        w?.terminate();
        w = null;
        hashFileMainThread(file, onProgress, () => cancelled).then(res, rej);
      };
      w.postMessage({ file });
    } catch {
      hashFileMainThread(file, onProgress, () => cancelled).then(res, rej);
    }
  });

  return { promise, cancel };
}

