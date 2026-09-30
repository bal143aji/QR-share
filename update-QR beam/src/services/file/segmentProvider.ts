import type { TransferHeader } from '../../types/transfer';
import type { ShardSource } from '../optical/frameBuilder';
import { blobSource, buildSegmentShards, type CryptoCtx } from './chunker';
import { computeLayout, type Layout } from './layout';

/** Prepares RS shards for one segment at a time in a Worker with main thread fallback. */
export class WorkerShardSource implements ShardSource {
  private w: Worker | null = null;
  private waiting = new Map<number, { res: (s: Uint8Array[]) => void; rej: (e: Error) => void }>();
  private ready: Promise<void>;
  private layout: Layout;
  private cx?: CryptoCtx;
  private fallback = false;

  constructor(private file: Blob, h: TransferHeader, key?: CryptoKey) {
    this.layout = computeLayout(file.size, h.chunkSize, h.segK, h.segP, h.encrypted);
    this.cx = key ? { key, ivPrefix: h.ivPrefix } : undefined;

    this.ready = new Promise((res) => {
      try {
        this.w = new Worker(new URL('../../workers/encodeWorker.ts', import.meta.url), { type: 'module' });
        this.w.onmessage = (e) => {
          const m = e.data;
          if (m.t === 'ready') res();
          else if (m.t === 'segment') {
            this.waiting.get(m.index)?.res(m.shards.map((b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b))));
            this.waiting.delete(m.index);
          } else if (m.t === 'error') {
            const waiter = this.waiting.get(m.index);
            this.waiting.delete(m.index);
            if (waiter) {
              buildSegmentShards(blobSource(this.file), this.layout, this.layout.segments[m.index], this.cx)
                .then(waiter.res, waiter.rej);
            }
          }
        };
        this.w.onerror = () => {
          this.fallback = true;
          this.w?.terminate();
          this.w = null;
          res();
        };
        this.w.postMessage({ t: 'init', file, chunkSize: h.chunkSize, segK: h.segK, segP: h.segP, encrypted: h.encrypted, key, ivPrefix: h.ivPrefix });
      } catch {
        this.fallback = true;
        this.w = null;
        res();
      }
    });
  }

  async getShards(seg: number): Promise<Uint8Array[]> {
    await this.ready;
    if (this.fallback || !this.w) {
      return buildSegmentShards(blobSource(this.file), this.layout, this.layout.segments[seg], this.cx);
    }
    return new Promise((res, rej) => {
      this.waiting.set(seg, { res, rej });
      this.w?.postMessage({ t: 'segment', index: seg });
    });
  }

  dispose() {
    this.w?.terminate();
    this.w = null;
  }
}

