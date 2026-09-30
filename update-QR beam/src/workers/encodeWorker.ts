import { blobSource, buildSegmentShards, type CryptoCtx } from '../services/file/chunker';
import { computeLayout, type Layout } from '../services/file/layout';
const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };

let file: Blob, layout: Layout, cx: CryptoCtx | undefined;
ctx.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.t === 'init') {
    file = m.file; layout = computeLayout(file.size, m.chunkSize, m.segK, m.segP, m.encrypted);
    cx = m.key ? { key: m.key as CryptoKey, ivPrefix: m.ivPrefix } : undefined;
    ctx.postMessage({ t: 'ready' });
  } else if (m.t === 'segment') {
    try {
      const shards = await buildSegmentShards(blobSource(file), layout, layout.segments[m.index], cx);
      ctx.postMessage({ t: 'segment', index: m.index, shards }, shards.map((s) => s.buffer));
    } catch (err) { ctx.postMessage({ t: 'error', index: m.index, message: String(err) }); }
  }
};
