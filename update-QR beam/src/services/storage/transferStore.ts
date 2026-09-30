/** Storage contract used by the receiver session (IndexedDB in the browser, memory in tests). */
export interface TransferStore {
  saveMeta(id: string, headerBytes: Uint8Array): Promise<void>;
  loadState(id: string): Promise<{ doneSegments: number[]; shardSegments: number[] }>;
  putShards(id: string, items: { seg: number; shard: number; data: Uint8Array }[]): Promise<void>;
  getShards(id: string, seg: number): Promise<Map<number, Uint8Array>>;
  deleteShards(id: string, seg: number): Promise<void>;
  putSegment(id: string, seg: number, plain: Uint8Array): Promise<void>;
  getSegmentBlob(id: string, seg: number): Promise<Blob>;
  clear(id: string): Promise<void>;
}

export class MemoryStore implements TransferStore {
  shards = new Map<string, Uint8Array>();
  segments = new Map<string, Uint8Array>();
  meta = new Map<string, Uint8Array>();
  async saveMeta(id: string, h: Uint8Array) { this.meta.set(id, h); }
  async loadState(id: string) {
    const d = new Set<number>(), s = new Set<number>();
    for (const k of this.segments.keys()) if (k.startsWith(id + ':')) d.add(+k.split(':')[1]);
    for (const k of this.shards.keys()) if (k.startsWith(id + ':')) s.add(+k.split(':')[1]);
    return { doneSegments: [...d], shardSegments: [...s] };
  }
  async putShards(id: string, items: { seg: number; shard: number; data: Uint8Array }[]) {
    for (const i of items) this.shards.set(`${id}:${i.seg}:${i.shard}`, i.data);
  }
  async getShards(id: string, seg: number) {
    const out = new Map<number, Uint8Array>(), pre = `${id}:${seg}:`;
    for (const [k, v] of this.shards) if (k.startsWith(pre)) out.set(+k.slice(pre.length), v);
    return out;
  }
  async deleteShards(id: string, seg: number) {
    const pre = `${id}:${seg}:`;
    for (const k of [...this.shards.keys()]) if (k.startsWith(pre)) this.shards.delete(k);
  }
  async putSegment(id: string, seg: number, plain: Uint8Array) { this.segments.set(`${id}:${seg}`, plain); }
  async getSegmentBlob(id: string, seg: number) { return new Blob([this.segments.get(`${id}:${seg}`)! as BlobPart]); }
  async clear(id: string) {
    for (const m of [this.shards, this.segments, this.meta]) for (const k of [...m.keys()]) if (k.startsWith(id)) m.delete(k);
  }
}
