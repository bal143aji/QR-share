import { Sha256Stream } from '../utils/checksum';
import { toHex } from '../utils/binary';
const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = async (e: MessageEvent<{ file: Blob }>) => {
  try {
    const f = e.data.file, h = new Sha256Stream();
    let done = 0, lastPost = 0;
    if (typeof f.stream === 'function') {
      const reader = f.stream().getReader();
      for (;;) {
        const { value, done: fin } = await reader.read();
        if (fin) break;
        h.update(value); done += value.length;
        const now = Date.now();
        if (now - lastPost > 150) { lastPost = now; ctx.postMessage({ t: 'progress', done, total: f.size }); }
      }
    } else {
      const chunkSize = 1024 * 1024;
      for (let offset = 0; offset < f.size; offset += chunkSize) {
        const slice = f.slice(offset, Math.min(offset + chunkSize, f.size));
        const buf = await slice.arrayBuffer();
        const value = new Uint8Array(buf);
        h.update(value); done += value.length;
        const now = Date.now();
        if (now - lastPost > 150) { lastPost = now; ctx.postMessage({ t: 'progress', done, total: f.size }); }
      }
    }
    const digest = h.digest();
    ctx.postMessage({ t: 'done', hash: digest, hex: toHex(digest) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ t: 'error', message: msg || 'Hash calculation failed' });
  }
};
